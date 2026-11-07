#!/usr/bin/env python3
"""Linux/systemd pull deployer. Installed copy stays outside the replaced checkout.

Only merged main code runs as the configured service user. This controller handles
service lifecycle and directory moves; it never imports candidate application code.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import pwd
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import uuid

from nori_storage import GIB, allocated_bytes, archive_private, copy_bytes, fingerprint, relative_paths, remove_tree


OPENCLAW_REPOSITORY = 'https://github.com/openclaw/openclaw.git'
ARTIFACT_SCHEMA = 1


class UpdateError(Exception):
    pass


class SourceFetchError(UpdateError):
    """Source acquisition failed before the candidate could be compiled."""


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w', encoding='utf-8') as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except FileNotFoundError:
        return default


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def durable_rename(source, destination):
    os.rename(source, destination)
    for parent in {Path(source).parent, Path(destination).parent}:
        descriptor = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def gateway_probe_request(root, gateway):
    settings = read_json(Path(root) / gateway['config'])
    auth = settings['gateway']['auth']
    mode = auth.get('mode') or ('password' if auth.get('password') else 'token')
    headers = {'Content-Type': 'application/json'}
    if mode == 'trusted-proxy':
        proxy = auth.get('trustedProxy', {})
        supplied = gateway.get('trustedProxyHeaders', {})
        if not isinstance(supplied, dict):
            raise UpdateError('invalid_trusted_proxy_probe_headers')
        forwarded = {}
        for name, value in supplied.items():
            if (not isinstance(name, str) or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name) or
                    not isinstance(value, str) or not value.strip() or '\r' in value or '\n' in value):
                raise UpdateError('invalid_trusted_proxy_probe_headers')
            forwarded[name.lower()] = value.strip()
        user_header = str(proxy.get('userHeader', '')).lower()
        required = [user_header, 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
                    *[name.lower() for name in proxy.get('requiredHeaders', [])]]
        if proxy.get('allowLoopback') is not True or any(not forwarded.get(name) for name in required):
            raise UpdateError('trusted_proxy_probe_configuration_missing')
        allowed = proxy.get('allowUsers', [])
        if allowed and forwarded[user_header] not in allowed:
            raise UpdateError('trusted_proxy_probe_user_not_allowed')
        headers.update(forwarded)
    elif mode in ('password', 'token'):
        credential = auth.get(mode)
        if not isinstance(credential, str) or not credential:
            raise UpdateError('gateway_probe_credential_missing')
        headers['Authorization'] = 'Bearer ' + credential
    else:
        raise UpdateError('unsupported_gateway_probe_auth_mode')
    agent_id = gateway.get('agentId', 'main')
    if not isinstance(agent_id, str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}', agent_id):
        raise UpdateError('invalid_gateway_probe_agent')
    body = json.dumps({'tool': 'rein_status', 'args': {}, 'agentId': agent_id}).encode()
    return urllib.request.Request(f'http://127.0.0.1:{gateway["port"]}/tools/invoke',
                                  data=body, headers=headers)


def validate_config(config):
    for key in ('root', 'releases', 'state'):
        value = Path(config[key])
        if not value.is_absolute() or value == Path('/') or value.resolve() != value:
            raise UpdateError('paths_must_be_absolute_without_symlinks')
    root, releases, state = (Path(config[k]) for k in ('root', 'releases', 'state'))
    if any(a == b or a in b.parents or b in a.parents for a, b in ((root, releases), (root, state), (releases, state))):
        raise UpdateError('deployment_directories_must_be_separate')
    if not re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?', config['repository']):
        raise UpdateError('repository_must_be_a_github_https_url')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/-]*', config.get('branch', 'main')) or '..' in config.get('branch', 'main'):
        raise UpdateError('invalid_branch')
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*', config['user']) or config['user'] == 'root':
        raise UpdateError('build_user_must_be_unprivileged')
    if not re.fullmatch(r'\d+\.\d+\.\d+', config['nodeVersion']):
        raise UpdateError('invalid_node_version')
    for key, default in (('minimumFreeGiB', 12), ('minimumRuntimeFreeGiB', 3),
                         ('buildCacheGrowthGiB', 2), ('rollbackMaxGiB', 16)):
        value = config.get(key, default)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 16384:
            raise UpdateError('invalid_storage_budget:' + key)
    minimum, maximum = config.get('minimumRollbackKeep', 2), config.get('rollbackKeep', 3)
    if (type(minimum) is not int or type(maximum) is not int or
            not 1 <= minimum <= maximum <= 20):
        raise UpdateError('invalid_rollback_retention')
    for item in config['preserve']:
        path = Path(item)
        if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] in ('.git', '.toolchain', 'node_modules', 'vendor', 'scripts', 'deploy'):
            raise UpdateError('invalid_preserved_path')
    for service in config['services']:
        if not re.fullmatch(r'nori-[a-z0-9-]+', service):
            raise UpdateError('invalid_service_name')
    if not config['services'] or len(set(config['services'])) != len(config['services']):
        raise UpdateError('invalid_services')
    for key in ('routerSession',):
        if Path(config[key]).is_absolute() or '..' in Path(config[key]).parts:
            raise UpdateError('invalid_health_path')
    for gateway in config['gateways']:
        if Path(gateway['config']).is_absolute() or '..' in Path(gateway['config']).parts or not isinstance(gateway['port'], int):
            raise UpdateError('invalid_gateway_probe')
    return config


class Host:
    def __init__(self, config):
        self.config = validate_config(config)
        self.root = Path(config['root'])
        self.releases = Path(config['releases'])
        self.state = Path(config['state'])
        self.uid = pwd.getpwnam(config['user']).pw_uid
        self.gid = pwd.getpwnam(config['user']).pw_gid
        self.log = None
        self.bootstrap = self.root / '.toolchain/node_modules/.bin'
        self.env = {'PATH': '/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(self.releases / 'build-home'), 'CI': '1', 'GIT_TERMINAL_PROMPT': '0', 'PYTHONDONTWRITEBYTECODE': '1'}

    def command(self, args, cwd=None, user=False, env=None, timeout=1800, capture=False):
        command = list(map(str, args))
        clean = dict(self.env, **(env or {}))
        if user:
            command = ['/usr/sbin/runuser', '-u', self.config['user'], '--', 'env', '-i'] + [f'{k}={v}' for k, v in clean.items()] + command
        try:
            process = subprocess.Popen(command, cwd=cwd, env=clean, stdin=subprocess.DEVNULL,
                                       stdout=subprocess.PIPE if capture else self.log,
                                       stderr=self.log, start_new_session=True)
        except OSError as error:
            raise UpdateError(f'cannot_start:{Path(command[0]).name}:{error.strerror}') from error
        try:
            output, _ = process.communicate(timeout=timeout)
        except BaseException:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=10)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
            raise
        if process.returncode:
            raise UpdateError(f'command_failed:{Path(str(args[0])).name}:{process.returncode}')
        return output.decode().strip() if capture else ''

    def git(self, root, *args):
        return self.command(['git', '-C', root, *args], user=True, capture=True)

    def fetch_source(self, args, timeout):
        try:
            return self.command(args, user=True, timeout=timeout)
        except (UpdateError, subprocess.TimeoutExpired) as error:
            # Transport/remote configuration failures do not prove that this
            # revision is defective. Keep its delivery pending for retry.
            raise SourceFetchError('source_fetch_unavailable') from error

    def revision(self, root):
        return self.git(root, 'rev-parse', 'HEAD')

    def latest(self):
        line = self.command(['git', 'ls-remote', '--exit-code', self.config['repository'], 'refs/heads/' + self.config.get('branch', 'main')], user=True, capture=True, timeout=120)
        sha = line.split()[0]
        if not re.fullmatch('[a-f0-9]{40}', sha):
            raise UpdateError('invalid_remote_revision')
        return sha

    def ensure_clean(self, root):
        if self.git(root, 'status', '--porcelain', '--untracked-files=normal'):
            raise UpdateError('checkout_has_local_changes')
        if self.git(root, 'submodule', 'foreach', '--quiet', 'git status --porcelain --untracked-files=normal'):
            raise UpdateError('upstream_has_local_changes')

    def active(self):
        for service in self.config['services']:
            self.command(['systemctl', 'is-active', '--quiet', service], timeout=30)

    def prepare_source(self, revision, destination):
        # Candidate directory is created by the controller, then written only as
        # the service user. Its HOME has no provider accounts or live runtime.
        destination.mkdir(mode=0o700)
        os.chown(destination, self.uid, self.gid)
        home = self.releases / 'build-home'
        home.mkdir(mode=0o700, exist_ok=True)
        os.chown(home, self.uid, self.gid)
        self.fetch_source(['git', 'clone', '--depth=1', '--no-tags', '--no-recurse-submodules', '--single-branch', '--branch', self.config.get('branch', 'main'), self.config['repository'], destination], timeout=300)
        if self.revision(destination) != revision:
            self.fetch_source(['git', '-C', destination, 'fetch', '--depth=1', '--no-tags', '--no-recurse-submodules', 'origin', revision], timeout=300)
        self.git(destination, 'checkout', '--detach', revision)
        self.git(destination, 'config', 'fetch.recurseSubmodules', 'false')
        pin = self.git(destination, 'rev-parse', 'HEAD:vendor/openclaw')
        self.fetch_upstream(pin, destination / 'vendor/openclaw')
        self.git(destination, 'submodule', 'init', '--', 'vendor/openclaw')
        self.git(destination, 'submodule', 'absorbgitdirs', '--', 'vendor/openclaw')

    def fetch_upstream(self, pin, destination):
        if not re.fullmatch('[a-f0-9]{40}', pin):
            raise UpdateError('invalid_upstream_pin')
        # A local clone copies *all* source packs, even unreachable/tmp packs, and
        # --depth is ignored for plain paths. Fetch only the pinned commit into a
        # new repository instead. No default remote is installed: production is
        # a fixed release, not a checkout for IDE background branch/tag syncing.
        self.command(['git', 'init', '--quiet', destination], user=True)
        self.fetch_source(['git', '-C', destination, 'fetch', '--depth=1', '--no-tags',
                           '--no-recurse-submodules', OPENCLAW_REPOSITORY, pin], timeout=600)
        self.git(destination, 'checkout', '--detach', pin)
        self.git(destination, 'config', 'fetch.recurseSubmodules', 'false')
        self.git(destination, 'config', 'nori.sourceRepository', OPENCLAW_REPOSITORY)
        if self.revision(destination) != pin or self.git(destination, 'rev-parse', '--is-shallow-repository') != 'true':
            raise UpdateError('upstream_checkout_not_pinned_and_shallow')
        if (destination / '.gitmodules').exists():
            raise UpdateError('upstream_nested_submodules_require_review')

    def artifact_identity(self, destination):
        package = read_json(destination / 'package.json')
        upstream = destination / 'vendor/openclaw'
        return {'schema': ARTIFACT_SCHEMA, 'upstream': self.git(destination, 'rev-parse', 'HEAD:vendor/openclaw'),
                'node': self.config['nodeVersion'], 'pnpm': package.get('packageManager'),
                'os': platform.system(), 'machine': platform.machine(), 'libc': list(platform.libc_ver()),
                'lock': hashlib.sha256((upstream / 'pnpm-lock.yaml').read_bytes()).hexdigest()}

    def artifact_paths(self, destination, node):
        upstream = destination / 'vendor/openclaw'
        paths = ['.toolchain/node_modules']
        # pnpm workspace packages have additional node_modules directories with
        # relative symlinks. Include them, never just the top-level store.
        for directory, dirs, _ in os.walk(upstream, followlinks=False):
            dirs[:] = [d for d in dirs if d != '.git' and not (Path(directory) / d).is_symlink()]
            if 'node_modules' in dirs:
                paths.append(str((Path(directory) / 'node_modules').relative_to(destination)))
                dirs.remove('node_modules')
        paths += [str(p.relative_to(destination)) for p in
                  [upstream / 'dist', upstream / 'dist-runtime', *upstream.glob('packages/*/dist')]
                  if p.is_dir()]
        # Same generated extension assets used by the repository's CI cache.
        script = """import {execFileSync} from 'node:child_process';
import {listGeneratedExtensionAssetSources} from './scripts/lib/static-extension-assets.mts';
const paths = listGeneratedExtensionAssetSources({rootDir: process.cwd()});
const tracked = new Set(paths.length ? execFileSync('git',['ls-files','-z','--',...paths],{encoding:'utf8'}).split('\\0') : []);
console.log(JSON.stringify(paths.filter(p => !tracked.has(p))));"""
        generated = json.loads(self.command([node, '--import', './scripts/tsx.mjs', '--input-type=module', '-e', script],
                                            user=True, cwd=upstream, capture=True))
        paths += ['vendor/openclaw/' + p for p in relative_paths(generated) if (upstream / p).exists()]
        return relative_paths(paths)

    def artifact_record(self, revision):
        if not re.fullmatch('[a-f0-9]{40}', revision):
            raise UpdateError('invalid_artifact_revision')
        directory = self.state / 'artifacts'
        directory.mkdir(mode=0o700, exist_ok=True)
        return directory / (revision + '.json')

    def restore_artifacts(self, destination):
        identity = self.artifact_identity(destination)
        try:
            manifest = read_json(self.artifact_record(self.revision(self.root)), {})
            paths = relative_paths(manifest.get('paths', []))
            if (manifest.get('identity') != identity or not paths or
                    any(not (p == '.toolchain/node_modules' or p.startswith('vendor/openclaw/')) for p in paths) or
                    any('.git' in Path(p).parts for p in paths) or
                    not {'.toolchain/node_modules', 'vendor/openclaw/node_modules', 'vendor/openclaw/dist'} <= set(paths)):
                return False
            if fingerprint(self.root, paths) != manifest.get('fingerprint'):
                print(json.dumps({'artifacts': 'miss', 'reason': 'source_changed'}), flush=True)
                return False
        except (OSError, ValueError, TypeError, KeyError):
            return False
        # Copy, never hardlink mutable build files across running/rollback releases.
        for name in paths:
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            os.chown(target.parent, self.uid, self.gid)
            self.command(['cp', '-a', self.root / name, target], user=True)
        if fingerprint(destination, paths) != manifest['fingerprint']:
            raise UpdateError('artifact_copy_verification_failed')
        self.restored_paths = paths
        print(json.dumps({'artifacts': 'hit', 'upstream': identity['upstream']}), flush=True)
        return True

    def seal_artifacts(self, destination, paths=None):
        paths = paths or self.artifact_paths(destination, destination / '.toolchain/node_modules/node/bin/node')
        atomic_json(self.artifact_record(self.revision(destination)),
                    {'identity': self.artifact_identity(destination), 'paths': paths,
                     'fingerprint': fingerprint(destination, paths), 'at': timestamp()})

    def build(self, revision, destination):
        self.prepare_source(revision, destination)
        package = read_json(destination / 'package.json')
        manager = package.get('packageManager', '')
        if not re.fullmatch(r'pnpm@\d+\.\d+\.\d+', manager):
            raise UpdateError('unsupported_package_manager')
        env = {'PATH': f'{self.bootstrap}:{self.env["PATH"]}'}
        reused = self.restore_artifacts(destination)
        if not reused:
            self.command(['npm', 'install', '--prefix', destination / '.toolchain', '--no-save', '--package-lock=false', 'node@' + self.config['nodeVersion'], manager], user=True, env=env, timeout=600)
        node = destination / '.toolchain/node_modules/node/bin/node'
        os.chmod(node, 0o755)  # OpenClaw secret exec validation disallows group-writable binaries.
        env['PATH'] = f'{destination}/.toolchain/node_modules/.bin:{self.env["PATH"]}'
        env['NODE_OPTIONS'] = '--max-old-space-size=8192'
        pnpm = [destination / '.toolchain/node_modules/.bin/pnpm']
        if not reused:
            print(json.dumps({'artifacts': 'miss', 'reason': 'identity_or_manifest'}), flush=True)
            self.command(pnpm + ['--dir', destination / 'vendor/openclaw', 'install', '--frozen-lockfile'], user=True, cwd=destination, env=env)
            self.command(pnpm + ['--dir', destination / 'vendor/openclaw', 'build'], user=True, cwd=destination, env=env)
        else:
            self.command([node, '--import', './scripts/tsx.mjs', '--input-type=module', '-e',
                          "import {refreshLocalBuildStampTimes} from './scripts/lib/local-build-metadata.mts'; refreshLocalBuildStampTimes();"],
                         user=True, cwd=destination / 'vendor/openclaw', env=env)
        self.command(pnpm + ['install', '--frozen-lockfile'], user=True, cwd=destination, env=env)
        # Copy a verified native binary only if the lock is byte-for-byte equal;
        # an upstream pin change builds a fresh binary under the candidate root.
        lock = Path('plugins/rein-router/magpie.lock.json')
        if (self.root / lock).read_bytes() == (destination / lock).read_bytes():
            self.command(['cp', '-a', self.root / '.toolchain/magpie-bin', destination / '.toolchain/magpie-bin'], user=True)
        else:
            self.command([node, 'scripts/magpie-dependency.mjs'], user=True, cwd=destination, env=env)
        self.command([node, 'scripts/magpie-dependency.mjs', '--check'], user=True, cwd=destination, env=env)
        if (destination / 'config/agent-browser.lock.json').exists():
            self.command([node, 'scripts/agent-browser-dependency.mjs'], user=True, cwd=destination, env=env, timeout=300)
        # PR/CI owns test execution. Deployment only prepares artifacts and checks
        # service readiness after switching; it never runs the test suite here.
        self.ensure_clean(destination)
        self.rebase_shims(destination)
        self.seal_artifacts(destination, self.restored_paths if reused else None)

    def rebase_shims(self, destination):
        # pnpm's generated shell shims contain absolute NODE_PATH entries. Keep
        # their runtime paths valid after directory relocation; no source edits.
        before, after = str(destination), str(self.root)
        for directory, dirs, files in os.walk(destination, followlinks=False):
            dirs[:] = [d for d in dirs if d != '.git']
            if Path(directory).name != '.bin':
                continue
            for name in files:
                path = Path(directory) / name
                if path.is_symlink() or path.stat().st_size > 1024 * 1024:
                    continue
                try:
                    content = path.read_text()
                except UnicodeError:
                    continue
                if content.startswith('#!') and before in content:
                    path.write_text(content.replace(before, after))

    def stop(self):
        self.command(['systemctl', 'stop', *reversed(self.config['services'])], timeout=180)
        for service in self.config['services']:
            state = self.command(['systemctl', 'show', service, '--property=ActiveState', '--value'], capture=True, timeout=30)
            if state not in ('inactive', 'failed'):
                raise UpdateError('service_not_stopped')
        for port in [self.config['routerPort'], *self.config.get('auxiliaryPorts', []), *[g['port'] for g in self.config['gateways']]]:
            with socket.socket() as probe:
                probe.settimeout(1)
                if probe.connect_ex(('127.0.0.1', port)) == 0:
                    raise UpdateError('service_port_still_occupied')

    def start(self):
        self.command(['systemctl', 'reset-failed', *self.config['services']], timeout=30)
        # Configured order is router, dashboard, then channel gateways.
        for service in self.config['services']:
            self.command(['systemctl', 'start', service], timeout=120)

    def preserve(self, destination):
        for name in self.config['preserve']:
            source, target = self.root / name, destination / name
            if not source.exists() and not source.is_symlink():
                continue
            if self.git(destination, 'ls-files', '--', name):
                raise UpdateError('preserved_path_became_tracked')
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            elif target.exists() or target.is_symlink():
                target.unlink()
            target.parent.mkdir(parents=True, exist_ok=True)
            self.command(['cp', '-a', source, target])

    def health(self):
        # Fail unsupported/missing auth configuration immediately. The same
        # authenticated probes run before cutover and after restart/rollback.
        requests = [gateway_probe_request(self.root, gateway) for gateway in self.config['gateways']]
        deadline = time.monotonic() + self.config.get('healthTimeout', 150)
        while time.monotonic() < deadline:
            try:
                self.active()
                session = read_json(self.root / self.config['routerSession'])
                request = urllib.request.Request(f'http://127.0.0.1:{self.config["routerPort"]}/_rein/api/state', headers={'Cookie': f'rein_router_{self.config["routerPort"]}={session["token"]}'})
                with urllib.request.urlopen(request, timeout=5) as response:
                    status = json.load(response)
                if status.get('error') or not status.get('lastSync'):
                    raise UpdateError('router_not_ready')
                for request in requests:
                    with urllib.request.urlopen(request, timeout=5) as response:
                        result = json.load(response)
                    if result.get('ok') is not True or not result.get('result'):
                        raise UpdateError('gateway_plugin_not_ready')
                return
            except (OSError, ValueError, KeyError, TypeError, UpdateError):
                time.sleep(2)
        raise UpdateError('health_check_timeout')


class Updater:
    def __init__(self, host):
        self.host = host
        self.journal = host.state / 'transaction.json'
        self.status = host.state / 'status.json'

    def record(self, state, **values):
        # Keep the known rollback through building/deferred/up-to-date states.
        if 'previous' not in values:
            previous = read_json(self.status, {}).get('previous')
            if previous:
                values['previous'] = previous
        value = {'state': state, 'at': timestamp(), **values}
        atomic_json(self.status, value)
        print(json.dumps(value), flush=True)

    def required_build_bytes(self):
        preserve = self.host.config.get('preserve', ['runtime'])
        excluded = {'.git', *[Path(p).parts[0] for p in preserve]}
        payload = [p.name for p in self.host.root.iterdir() if p.name not in excluded]
        return max(int(self.host.config.get('minimumFreeGiB', 12) * GIB),
                   copy_bytes(self.host.root, payload) + copy_bytes(self.host.root, preserve) +
                   int((self.host.config.get('minimumRuntimeFreeGiB', 3) +
                        self.host.config.get('buildCacheGrowthGiB', 2)) * GIB))

    def check_space(self, phase, required):
        free = shutil.disk_usage(self.host.releases).free
        entry = {'at': timestamp(), 'phase': phase, 'freeBytes': free, 'requiredBytes': required}
        previous = read_json(self.host.state / 'space.json', {}).get('samples', [])
        atomic_json(self.host.state / 'space.json', {'samples': [*previous[-15:], entry]})
        print(json.dumps({'space': entry}), flush=True)
        if free < required:
            raise UpdateError('insufficient_build_space' if phase == 'before_build' else 'insufficient_cutover_space')
        return free

    def candidate_marker(self, candidate):
        if (candidate.parent != self.host.releases or
                not re.fullmatch(r'candidate-[0-9a-f]{12}-[0-9a-f]{8}', candidate.name)):
            raise UpdateError('invalid_managed_candidate')
        directory = self.host.state / 'candidates'
        directory.mkdir(mode=0o700, exist_ok=True)
        return directory / (candidate.name + '.json')

    def discard_candidate(self, candidate):
        """Only updater-registered, pre-state-copy candidates are disposable."""
        marker = self.candidate_marker(candidate)
        if self.journal.exists() or read_json(marker, {}).get('phase') != 'building':
            return
        try:
            if candidate.exists() or candidate.is_symlink():
                if any((candidate / name).exists() or (candidate / name).is_symlink()
                       for name in self.host.config.get('preserve', ['runtime'])):
                    raise UpdateError('candidate_contains_private_state')
                remove_tree(candidate)
            marker.unlink(missing_ok=True)
        except (OSError, ValueError, UpdateError) as error:
            print(json.dumps({'candidateCleanup': 'retained', 'candidate': candidate.name,
                              'reason': type(error).__name__}), flush=True)

    def prune_candidates(self):
        if self.journal.exists():
            return
        directory = self.host.state / 'candidates'
        if directory.exists():
            for marker in directory.glob('candidate-*.json'):
                if re.fullmatch(r'candidate-[0-9a-f]{12}-[0-9a-f]{8}\.json', marker.name) and not marker.is_symlink():
                    candidate = self.host.releases / marker.stem
                    if not candidate.exists() and not candidate.is_symlink():
                        marker.unlink()
                    else:
                        self.discard_candidate(candidate)

    def prune_rollbacks(self, required_free=0):
        """Called under update.lock; never discard unfinished recovery material.

        Retain the newest recovery points even under pressure. Archive and verify
        private state before retiring any older code/build copy. Failed releases
        and unregistered candidates may contain unreconciled state and stay intact.
        """
        if self.journal.exists():
            return
        deleted, skipped, archives = [], [], []
        keep = self.host.config.get('rollbackKeep', 3)
        minimum = self.host.config.get('minimumRollbackKeep', 2)
        budget = self.host.config.get('rollbackMaxGiB', 16) * GIB
        try:
            previous = read_json(self.status, {}).get('previous')
            releases = []
            for path in self.host.releases.iterdir():
                if not re.fullmatch(r'previous-candidate-[0-9a-f]{12}-[0-9a-f]{8}', path.name):
                    continue
                if path.is_symlink() or not path.is_dir() or path == self.host.root:
                    continue
                releases.append(path)
            releases.sort(key=lambda p: (str(p) == previous, p.stat().st_mtime_ns, p.name), reverse=True)
            remaining = list(releases)
            for path in reversed(releases[minimum:]):
                try:
                    used = allocated_bytes(remaining)
                except ValueError:
                    used = 0  # A mounted backup is not measurable/prunable here.
                if (len(remaining) <= keep and used <= budget and
                        shutil.disk_usage(self.host.releases).free >= required_free):
                    break
                try:
                    archive = archive_private(path, self.host.config.get('preserve', ['runtime']),
                                              self.host.state / 'private-archives' / (path.name + '.tar.gz'))
                    remove_tree(path)
                except ValueError:
                    skipped.append(path.name)
                    continue
                if archive:
                    archives.append(archive.name)
                deleted.append(path.name)
                remaining.remove(path)
            result = {'at': timestamp(), 'keep': keep, 'minimumKeep': minimum,
                      'budgetBytes': budget, 'requiredFreeBytes': required_free,
                      'freeBytes': shutil.disk_usage(self.host.releases).free,
                      'deleted': deleted, 'skipped': skipped, 'privateArchives': archives}
        except OSError as error:
            # Cleanup failure must not roll back or relabel a healthy deployment.
            result = {'at': timestamp(), 'keep': keep, 'deleted': deleted,
                      'skipped': skipped, 'error': type(error).__name__}
        try:
            atomic_json(self.host.state / 'cleanup.json', result)
        except OSError:
            result['recordError'] = 'cleanup_record_unavailable'
        print(json.dumps({'cleanup': result}), flush=True)

    def queue_report(self, transaction):
        if not self.host.config.get('reporting'):
            return
        directory = self.host.state / 'reports'
        directory.mkdir(mode=0o700, exist_ok=True)
        # The ID and timestamp live in the commit journal before this write.
        # Recovery can repeat it without creating another deployment record.
        path = directory / (transaction['deploymentId'] + '.json')
        if not path.exists() and not (self.host.state / 'reported' / path.name).exists():
            atomic_json(path, {'deploymentId': transaction['deploymentId'],
                              'revision': transaction['target'],
                              'previousRevision': transaction['previousRevision'],
                              'deployedAt': transaction['deployedAt']})

    def recover(self):
        transaction = read_json(self.journal)
        if not transaction:
            return False
        if transaction['phase'] == 'committed':
            if 'deploymentId' in transaction:
                self.queue_report(transaction)
            self.record('updated', revision=transaction['target'], previous=transaction.get('previous'))
            self.journal.unlink()
            self.prune_rollbacks()
            return True
        for key in ('candidate', 'previous', 'failed'):
            path = Path(transaction[key])
            if path.parent != self.host.releases or path.is_symlink():
                raise UpdateError('invalid_recovery_path')
        if Path(transaction['previous']).exists():
            if self.host.revision(Path(transaction['previous'])) != transaction['previousRevision']:
                raise UpdateError('previous_release_changed; manual_recovery_required')
            if self.host.root.exists() and self.host.revision(self.host.root) != transaction['target']:
                raise UpdateError('active_release_changed; manual_recovery_required')
        self.record('rolling_back', revision=transaction['target'])
        self.host.stop()
        previous = Path(transaction['previous'])
        if previous.exists():
            if self.host.root.exists():
                durable_rename(self.host.root, transaction['failed'])
            durable_rename(previous, self.host.root)
        if not self.host.root.exists():
            raise UpdateError('manual_recovery_required')
        self.host.start()
        self.host.health()
        self.record('rolled_back', revision=transaction['target'], restoredRevision=transaction['previousRevision'])
        self.journal.unlink()
        return True

    def activate(self, candidate, revision):
        # A build can consume most of the preflight allowance. Recheck state-copy
        # bytes plus the running reserve BEFORE stopping any healthy service.
        self.check_space('before_cutover', copy_bytes(self.host.root, self.host.config.get('preserve', ['runtime'])) +
                         int(self.host.config.get('minimumRuntimeFreeGiB', 3) * GIB))
        atomic_json(self.candidate_marker(candidate), {'phase': 'preserving', 'at': timestamp()})
        ident = candidate.name
        transaction = {'phase': 'prepared', 'deploymentId': str(uuid.uuid4()), 'target': revision, 'previousRevision': self.host.revision(self.host.root),
                       'candidate': str(candidate), 'previous': str(self.host.releases / ('previous-' + ident)),
                       'failed': str(self.host.releases / ('failed-' + ident))}
        atomic_json(self.journal, transaction)
        try:
            self.host.stop()
            self.host.preserve(candidate)
            transaction['phase'] = 'switching'
            atomic_json(self.journal, transaction)
            durable_rename(self.host.root, transaction['previous'])
            # A rename retains the checkout's old mtime; stamp backup order explicitly.
            os.utime(transaction['previous'], None)
            durable_rename(candidate, self.host.root)
            self.host.start()
            self.host.health()
            transaction['phase'] = 'committed'
            transaction['deployedAt'] = timestamp()
            atomic_json(self.journal, transaction)
            self.queue_report(transaction)
            self.record('updated', revision=revision, previous=transaction['previous'])
            self.journal.unlink()
        except BaseException:
            if read_json(self.journal, {}).get('phase') == 'committed':
                # A reporting/status write after a healthy commit must never
                # relabel the deployed release as failed or roll it back.
                self.recover()
                return
            self.recover()
            raise

    def run(self, retry=False):
        if self.recover():
            return
        self.prune_candidates()
        revision = self.host.latest()
        if revision == self.host.revision(self.host.root):
            self.host.active()
            self.host.health()
            self.prune_rollbacks(required_free=self.required_build_bytes())
            self.record('up_to_date', revision=revision)
            return
        last = read_json(self.status, {})
        if not retry and last.get('revision') == revision and last.get('state') in ('failed', 'rolled_back', 'blocked'):
            self.record('blocked', revision=revision, reason='revision_failed_previously; use --retry after repair')
            return
        try:
            self.host.ensure_clean(self.host.root)
            self.host.active()  # Respect operator-paused services instead of reviving them.
            self.host.health()  # Prove probe/auth compatibility before building or stopping anything.
            if self.host.root.stat().st_dev != self.host.releases.stat().st_dev:
                raise UpdateError('releases_must_share_the_live_filesystem')
            required = self.required_build_bytes()
            self.prune_rollbacks(required_free=required)
            self.check_space('before_build', required)
        except UpdateError as error:
            self.record('deferred', revision=revision, reason=str(error))
            raise
        candidate = self.host.releases / ('candidate-' + revision[:12] + '-' + uuid.uuid4().hex[:8])
        atomic_json(self.candidate_marker(candidate), {'phase': 'building', 'revision': revision, 'at': timestamp()})
        self.record('building', revision=revision, candidate=str(candidate))
        try:
            self.host.build(revision, candidate)
        except SourceFetchError as error:
            self.record('deferred', revision=revision, candidate=str(candidate), reason=str(error))
            self.discard_candidate(candidate)
            raise
        except BaseException as error:
            self.record('failed', revision=revision, reason=error.args[0] if isinstance(error, UpdateError) else type(error).__name__)
            self.discard_candidate(candidate)
            raise
        try:
            if self.host.latest() != revision:
                self.record('superseded', revision=revision)
                self.discard_candidate(candidate)
                return
            self.host.ensure_clean(self.host.root)
            self.host.active()
            self.host.health()
        except Exception as error:
            # A valid build is not defective when GitHub or the still-running
            # deployment is temporarily unavailable. Keep its event retryable.
            self.record('deferred', revision=revision, candidate=str(candidate),
                        reason=error.args[0] if isinstance(error, UpdateError) else type(error).__name__)
            self.discard_candidate(candidate)
            raise
        try:
            self.activate(candidate, revision)
        except BaseException as error:
            if not self.journal.exists() and read_json(self.status, {}).get('state') != 'rolled_back':
                space_error = isinstance(error, UpdateError) and str(error) == 'insufficient_cutover_space'
                self.record('deferred' if space_error else 'failed', revision=revision,
                            reason=error.args[0] if isinstance(error, UpdateError) else type(error).__name__)
                self.discard_candidate(candidate)
            raise
        # Cleanup/accounting failures after a healthy commit must never relabel
        # or roll back that deployment.
        try:
            self.candidate_marker(candidate).unlink(missing_ok=True)
            self.prune_rollbacks(required_free=self.required_build_bytes())
        except (OSError, ValueError, UpdateError) as error:
            print(json.dumps({'storageMaintenanceError': type(error).__name__}), flush=True)

    def verify_build(self):
        """Build the running revision without switching, restarting or reporting it."""
        if self.journal.exists():
            raise UpdateError('unfinished_transaction')
        self.host.ensure_clean(self.host.root)
        self.host.active()
        self.host.health()
        self.prune_candidates()
        before = self.check_space('before_build', self.required_build_bytes())
        revision = self.host.revision(self.host.root)
        candidate = self.host.releases / ('candidate-' + revision[:12] + '-' + uuid.uuid4().hex[:8])
        manifest = self.host.artifact_record(revision)
        original = read_json(manifest)
        atomic_json(self.candidate_marker(candidate), {'phase': 'building', 'revision': revision, 'at': timestamp()})
        try:
            self.host.build(revision, candidate)
            after = shutil.disk_usage(self.host.releases).free
            self.host.ensure_clean(candidate)
            self.host.health()
            atomic_json(self.host.state / 'build-verification.json',
                        {'at': timestamp(), 'revision': revision, 'verified': True,
                         'freeBeforeBytes': before, 'freeAfterBuildBytes': after,
                         'additionalBytes': max(0, before - after)})
        finally:
            # Rehearsing the same SHA must not replace the running release's
            # artifact digest with a candidate whose freshness stamps differ.
            if original is None:
                manifest.unlink(missing_ok=True)
            else:
                atomic_json(manifest, original)
            self.discard_candidate(candidate)


def drain_events(updater, directory):
    """Coalesce durable webhook deliveries; never contact GitHub with no work.

    Parent directories are root-owned. The HTTP service can create pending files
    but cannot change receipts. Payload contents never become privileged inputs:
    the controller only builds its administrator-configured repository/branch.
    """
    directory = Path(directory)
    pending, received = directory / 'pending', directory / 'received'
    for path in (directory, pending, received):
        if not path.is_absolute() or path.resolve() != path or not path.is_dir():
            raise UpdateError('invalid_event_directory')
        if os.geteuid() == 0 and path.stat().st_uid != 0:
            raise UpdateError('event_directories_must_be_root_owned')
    updater.recover()  # Also runs at boot, even when no event is pending.
    while True:
        batch = []
        for path in sorted(pending.glob('*.json')):
            try:
                valid = str(uuid.UUID(path.stem)) == path.stem
            except ValueError:
                valid = False
            if not valid or path.is_symlink() or not path.is_file():
                raise UpdateError('invalid_event_filename')
            if (received / path.name).exists():
                path.unlink()  # Crash after receipt but before pending removal.
            else:
                batch.append(path)
        if not batch:
            return
        before = read_json(updater.status, {})
        try:
            updater.run()
        except Exception:
            result = read_json(updater.status, {})
            if (updater.journal.exists() or result == before or
                    result.get('state') not in ('failed', 'rolled_back', 'blocked')):
                # Network/preflight/recovery failures retain pending work. systemd
                # retries this job; there is no periodic check when the queue is empty.
                raise
        result = read_json(updater.status, {})
        if result.get('state') == 'superseded':
            continue  # A merge during the build should deploy the newer main next.
        for path in batch:
            atomic_json(received / path.name, {'delivery': path.stem, 'at': timestamp(),
                                             'outcome': result.get('state'), 'revision': result.get('revision')})
            path.unlink()
        descriptor = os.open(pending, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/nori-updater.json')
    parser.add_argument('--retry', action='store_true')
    parser.add_argument('--drain-events', action='store_true')
    parser.add_argument('--verify-build', action='store_true', help='Build the running revision, verify and discard it; never cut over')
    args = parser.parse_args()
    if sum((args.retry, args.drain_events, args.verify_build)) > 1:
        parser.error('--retry, --drain-events and --verify-build are mutually exclusive')
    if os.geteuid() != 0:
        raise UpdateError('controller_requires_root; builds_run_as_service_user')
    config = validate_config(read_json(args.config))
    state, releases = Path(config['state']), Path(config['releases'])
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    releases.mkdir(mode=0o755, parents=True, exist_ok=True)
    # The service's 0077 umask must not prevent the builder from traversing this
    # root-owned parent. Each candidate and build HOME remains private (0700).
    os.chmod(releases, 0o755)
    with open(state / 'update.lock', 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | (0 if args.drain_events else fcntl.LOCK_NB))
        except BlockingIOError:
            print('Another update is already running.'); return
        host = Host(config)
        logs = state / 'logs'
        logs.mkdir(mode=0o700, exist_ok=True)
        path = logs / (dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d') + '.log')
        with open(path, 'a') as log:
            os.chmod(path, 0o600)
            host.log = log
            signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(UpdateError('update_interrupted')))
            updater = Updater(host)
            if args.verify_build:
                updater.verify_build()
            elif args.drain_events:
                drain_events(updater, config['eventDirectory'])
            else:
                updater.run(retry=args.retry)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print('Nori update stopped: ' + (str(error) if isinstance(error, UpdateError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
