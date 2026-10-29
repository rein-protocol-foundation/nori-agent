#!/usr/bin/env python3
"""Linux/systemd pull deployer. Installed copy stays outside the replaced checkout.

Only merged main code runs as the configured service user. This controller handles
service lifecycle and directory moves; it never imports candidate application code.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
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
    return urllib.request.Request(f'http://127.0.0.1:{gateway["port"]}/tools/invoke',
                                  data=b'{"tool":"rein_status","args":{}}', headers=headers)


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

    def build(self, revision, destination):
        # Candidate directory is created by the controller, then written only as
        # the service user. Its HOME has no provider accounts or live runtime.
        destination.mkdir(mode=0o700)
        os.chown(destination, self.uid, self.gid)
        home = self.releases / 'build-home'
        home.mkdir(mode=0o700, exist_ok=True)
        os.chown(home, self.uid, self.gid)
        self.fetch_source(['git', 'clone', '--depth=1', '--single-branch', '--branch', self.config.get('branch', 'main'), self.config['repository'], destination], timeout=300)
        if self.revision(destination) != revision:
            self.fetch_source(['git', '-C', destination, 'fetch', '--depth=1', 'origin', revision], timeout=300)
        self.git(destination, 'checkout', '--detach', revision)
        # Reuse only upstream source objects, never its running build output.
        old_pin = self.git(self.root, 'rev-parse', 'HEAD:vendor/openclaw')
        new_pin = self.git(destination, 'rev-parse', 'HEAD:vendor/openclaw')
        if old_pin == new_pin:
            self.fetch_source(['git', '-c', 'protocol.file.allow=always', '-c', f'submodule.vendor/openclaw.url={self.root}/vendor/openclaw', '-C', destination, 'submodule', 'update', '--init'], timeout=300)
            self.git(destination / 'vendor/openclaw', 'remote', 'set-url', 'origin', 'https://github.com/openclaw/openclaw.git')
            self.git(destination, 'submodule', 'sync')
        else:
            self.fetch_source(['git', '-C', destination, 'submodule', 'update', '--init', '--recursive', '--depth=1'], timeout=600)
        package = read_json(destination / 'package.json')
        manager = package.get('packageManager', '')
        if not re.fullmatch(r'pnpm@\d+\.\d+\.\d+', manager):
            raise UpdateError('unsupported_package_manager')
        env = {'PATH': f'{self.bootstrap}:{self.env["PATH"]}'}
        self.command(['npm', 'install', '--prefix', destination / '.toolchain', '--no-save', '--package-lock=false', 'node@' + self.config['nodeVersion'], manager], user=True, env=env, timeout=600)
        node = destination / '.toolchain/node_modules/node/bin/node'
        os.chmod(node, 0o755)  # OpenClaw secret exec validation disallows group-writable binaries.
        env['PATH'] = f'{destination}/.toolchain/node_modules/.bin:{self.env["PATH"]}'
        env['NODE_OPTIONS'] = '--max-old-space-size=8192'
        pnpm = [destination / '.toolchain/node_modules/.bin/pnpm']
        self.command(pnpm + ['--dir', destination / 'vendor/openclaw', 'install', '--frozen-lockfile'], user=True, cwd=destination, env=env)
        self.command(pnpm + ['--dir', destination / 'vendor/openclaw', 'build'], user=True, cwd=destination, env=env)
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
        value = {'state': state, 'at': timestamp(), **values}
        atomic_json(self.status, value)
        print(json.dumps(value), flush=True)

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
            self.record('updated', revision=transaction['target'])
            self.journal.unlink()
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
        revision = self.host.latest()
        if revision == self.host.revision(self.host.root):
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
            free = shutil.disk_usage(self.host.releases).free
            if free < self.host.config.get('minimumFreeGiB', 12) * 1024 ** 3:
                raise UpdateError('insufficient_build_space')
        except UpdateError as error:
            self.record('deferred', revision=revision, reason=str(error))
            raise
        candidate = self.host.releases / ('candidate-' + revision[:12] + '-' + uuid.uuid4().hex[:8])
        self.record('building', revision=revision, candidate=str(candidate))
        try:
            self.host.build(revision, candidate)
        except SourceFetchError as error:
            self.record('deferred', revision=revision, candidate=str(candidate), reason=str(error))
            raise
        except BaseException as error:
            self.record('failed', revision=revision, reason=error.args[0] if isinstance(error, UpdateError) else type(error).__name__)
            raise
        try:
            if self.host.latest() != revision:
                self.record('superseded', revision=revision)
                return
            self.host.ensure_clean(self.host.root)
            self.host.active()
            self.host.health()
        except Exception as error:
            # A valid build is not defective when GitHub or the still-running
            # deployment is temporarily unavailable. Keep its event retryable.
            self.record('deferred', revision=revision, candidate=str(candidate),
                        reason=error.args[0] if isinstance(error, UpdateError) else type(error).__name__)
            raise
        try:
            self.activate(candidate, revision)
        except BaseException as error:
            if not self.journal.exists() and read_json(self.status, {}).get('state') != 'rolled_back':
                self.record('failed', revision=revision, reason=error.args[0] if isinstance(error, UpdateError) else type(error).__name__)
            raise


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
    args = parser.parse_args()
    if args.retry and args.drain_events:
        parser.error('--retry is a manual operation; do not combine with --drain-events')
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
            if args.drain_events:
                drain_events(updater, config['eventDirectory'])
            else:
                updater.run(retry=args.retry)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print('Nori update stopped: ' + (str(error) if isinstance(error, UpdateError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
