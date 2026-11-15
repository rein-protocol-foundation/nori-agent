"""Real Git source-only updates; no hosted service, account, or message calls."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import uuid
from unittest.mock import patch

from nori_updater_tests import module


def git(directory, *args):
    result = subprocess.run(['git', '-C', str(directory), *args], capture_output=True, text=True,
                            env={**os.environ, 'GIT_CONFIG_NOSYSTEM': '1'}, timeout=20)
    if result.returncode:
        raise module.UpdateError('fixture_git_failed:' + ' '.join(args))
    return result.stdout.strip()


class LocalHost(module.Host):
    def __init__(self, base, remote):
        self.root, self.state, self.releases = (base / name for name in ('live', 'state', 'releases'))
        self.state.mkdir(); self.releases.mkdir()
        subprocess.run(['git', 'clone', '-q', '--depth=1', remote.as_uri(), str(self.root)], check=True)
        self.remote = remote
        self.config = {'repository': remote.as_uri(), 'preserve': ['runtime'], 'minimumFreeGiB': 0,
                       'reporting': True}
        self.events = []
        (self.root / 'runtime').mkdir()
        (self.root / 'runtime/session').write_text('private session survives')

    def command(self, args, **kwargs):
        self.events.append(list(map(str, args)))
        result = subprocess.run(args, cwd=kwargs.get('cwd'), capture_output=True, text=True, timeout=20)
        if result.returncode:
            raise module.UpdateError('fixture_command_failed')
        return result.stdout.strip()

    def latest(self):
        return git(self.remote, 'rev-parse', 'HEAD')

    def active(self):
        self.events.append('active')

    def health(self):
        self.events.append('health')

    def build(self, *args):
        self.events.append('build')
        raise module.UpdateError('fixture_runtime_build')

    def stop(self):
        raise AssertionError('documentation sync must not stop services')

    def start(self):
        raise AssertionError('documentation sync must not start services')


class SourceSyncTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.base = Path(temp.name).resolve(); self.remote = self.base / 'remote'; self.remote.mkdir()
        git(self.remote, 'init', '-q', '-b', 'main')
        git(self.remote, 'config', 'user.email', 'fixture@example.invalid')
        git(self.remote, 'config', 'user.name', 'Fixture')
        self.commit({'.gitignore': 'runtime/\n', 'README.md': 'old docs\n',
                     'docs/guide.md': 'guide\n', 'scripts/runtime.py': 'old runtime\n'})
        self.old = git(self.remote, 'rev-parse', 'HEAD')
        self.host = LocalHost(self.base, self.remote)
        self.updater = module.Updater(self.host)
        self.output = contextlib.redirect_stdout(io.StringIO()); self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def commit(self, files):
        for name, content in files.items():
            p = self.remote / name; p.parent.mkdir(parents=True, exist_ok=True)
            if content is None:
                p.unlink()
            else:
                p.write_text(content)
        git(self.remote, 'add', '-A'); git(self.remote, 'commit', '-qm', 'fixture update')
        return git(self.remote, 'rev-parse', 'HEAD')

    def test_real_shallow_clone_syncs_docs_without_build_restart_or_report(self):
        target = self.commit({'README.md': 'new docs\n', 'docs/new guide.md': 'new\n'})
        before = (self.host.root / 'scripts/runtime.py').stat()
        manifest = {'identity': {'synthetic': True}, 'fingerprint': 'unchanged'}
        module.atomic_json(self.host.artifact_record(self.old), manifest)
        self.updater.run()
        self.assertEqual(self.host.revision(self.host.root), target)
        self.assertEqual((self.host.root / 'README.md').read_text(), 'new docs\n')
        self.assertEqual((self.host.root / 'scripts/runtime.py').stat().st_ino, before.st_ino)
        self.assertEqual((self.host.root / 'runtime/session').read_text(), 'private session survives')
        status = module.read_json(self.updater.status)
        self.assertEqual(status['state'], 'source_synced'); self.assertEqual(status['runtimeRevision'], self.old)
        self.assertEqual(module.read_json(self.host.artifact_record(target)), manifest)
        self.assertFalse(self.updater.journal.exists()); self.assertFalse((self.host.state / 'reports').exists())
        self.assertNotIn('build', self.host.events)
        self.assertEqual(git(self.host.root, 'status', '--porcelain'), '')
        self.assertTrue(any(isinstance(e, list) and 'core.hooksPath=/dev/null' in e for e in self.host.events))

    def test_two_syncs_and_duplicate_delivery_keep_runtime_revision(self):
        self.commit({'README.md': 'first'}); self.updater.run()
        target = self.commit({'README.md': 'second'}); self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['runtimeRevision'], self.old)
        # Avoid unrelated rollback-budget accounting for this no-op replay.
        with patch.object(self.updater, 'prune_rollbacks'), patch.object(self.updater, 'required_build_bytes', return_value=0):
            self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'up_to_date')
        self.assertEqual(module.read_json(self.updater.status)['runtimeRevision'], self.old)
        self.assertEqual(self.host.revision(self.host.root), target)

    def test_docs_merge_after_undeployed_code_change_still_builds(self):
        self.commit({'scripts/runtime.py': 'new runtime'})
        target = self.commit({'README.md': 'later docs'})
        self.assertFalse(self.host.documentation_only(self.old, target))
        # Full updater follows the existing build path even when the last PR was docs.
        with patch.object(self.updater, 'required_build_bytes', return_value=0), patch.object(self.updater, 'check_space'), patch.object(self.updater, 'prune_rollbacks'):
            with self.assertRaisesRegex(module.UpdateError, 'fixture_runtime_build'):
                self.updater.run()
        self.assertIn('build', self.host.events)
        self.assertEqual(self.host.revision(self.host.root), self.old)

    def test_workspace_markdown_always_requires_deployment(self):
        for name in ('workspace/AGENTS.md', 'workspace/skills/example/SKILL.md', 'AGENTS.md', 'config/example.md'):
            with self.subTest(name=name):
                target = self.commit({name: 'runtime instructions'})
                self.assertFalse(self.host.documentation_only(self.old, target))

    def test_docs_rename_to_runtime_is_not_source_only(self):
        git(self.remote, 'mv', 'docs/guide.md', 'scripts/guide.md')
        git(self.remote, 'commit', '-qm', 'rename')
        self.assertFalse(self.host.documentation_only(self.old, self.host.latest()))

    def test_docs_rename_delete_and_spaces_are_supported(self):
        git(self.remote, 'mv', 'docs/guide.md', 'docs/new name.md')
        target = self.commit({'README.md': None})
        self.updater.run()
        self.assertEqual(self.host.revision(self.host.root), target)
        self.assertFalse((self.host.root / 'README.md').exists())
        self.assertTrue((self.host.root / 'docs/new name.md').exists())

    def test_symlink_and_executable_docs_require_deployment(self):
        p = self.remote / 'docs/guide.md'; p.unlink(); p.symlink_to('../scripts/runtime.py')
        git(self.remote, 'add', '-A'); git(self.remote, 'commit', '-qm', 'symlink')
        self.assertFalse(self.host.documentation_only(self.old, self.host.latest()))
        p.unlink(); p.write_text('executable doc'); p.chmod(0o755)
        git(self.remote, 'add', '-A'); git(self.remote, 'commit', '-qm', 'executable')
        self.assertFalse(self.host.documentation_only(self.old, self.host.latest()))

    def test_dirty_checkout_keeps_local_edit_and_defers(self):
        self.commit({'README.md': 'remote update'})
        (self.host.root / 'README.md').write_text('local edit')
        with self.assertRaisesRegex(module.UpdateError, 'checkout_has_local_changes'):
            self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'deferred')
        self.assertEqual((self.host.root / 'README.md').read_text(), 'local edit')
        self.assertEqual(self.host.revision(self.host.root), self.old)

    def test_failed_fetch_is_retryable_and_never_builds(self):
        self.commit({'README.md': 'remote'})
        with patch.object(self.host, 'fetch_source', side_effect=module.SourceFetchError('unavailable')):
            with self.assertRaises(module.SourceFetchError): self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'deferred')
        self.assertNotIn('build', self.host.events); self.assertEqual(self.host.revision(self.host.root), self.old)

    def test_superseded_docs_does_not_sync_stale_revision(self):
        target = self.commit({'README.md': 'first'})
        newer = self.commit({'README.md': 'second'})
        with patch.object(self.host, 'latest', side_effect=[target, newer]): self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'superseded')
        self.assertEqual(self.host.revision(self.host.root), self.old)

    def test_recovery_before_and_after_git_merge_is_idempotent(self):
        target = self.commit({'README.md': 'new'})
        with patch.object(self.host, 'sync_documentation', side_effect=module.UpdateError('interrupted')):
            with self.assertRaises(module.UpdateError): self.updater.run()
        self.assertTrue(self.updater.journal.exists()); self.assertEqual(self.host.revision(self.host.root), self.old)
        with patch.object(self.host, 'carry_artifacts', side_effect=OSError('interrupted after git')):
            with self.assertRaises(OSError): module.Updater(self.host).recover()
        self.assertEqual(self.host.revision(self.host.root), target); self.assertTrue(self.updater.journal.exists())
        self.assertTrue(module.Updater(self.host).recover())
        self.assertEqual(module.read_json(self.updater.status)['state'], 'source_synced')
        self.assertFalse(self.updater.journal.exists()); self.assertFalse((self.host.state / 'reports').exists())

    def test_recovery_never_resets_concurrent_local_changes(self):
        self.commit({'README.md': 'new'})
        with patch.object(self.host, 'carry_artifacts', side_effect=OSError('interrupted')):
            with self.assertRaises(OSError): self.updater.run()
        (self.host.root / 'README.md').write_text('concurrent edit')
        with self.assertRaisesRegex(module.UpdateError, 'checkout_has_local_changes'): self.updater.recover()
        self.assertEqual((self.host.root / 'README.md').read_text(), 'concurrent edit')
        self.assertTrue(self.updater.journal.exists())

    def test_recovery_rejects_a_foreign_head_without_reset(self):
        target = self.commit({'README.md': 'new'})
        self.host.documentation_only(self.old, target)
        module.atomic_json(self.updater.journal, {'phase': 'source_sync', 'previousRevision': self.old,
                          'target': 'c' * 40, 'runtimeRevision': self.old})
        git(self.host.root, 'checkout', '--detach', target)
        with self.assertRaisesRegex(module.UpdateError, 'manual_recovery_required'): self.updater.recover()
        self.assertEqual(self.host.revision(self.host.root), target)

    def test_preserved_documentation_is_not_overwritten(self):
        target = self.commit({'docs/guide.md': 'new'})
        self.host.config['preserve'].append('docs/guide.md')
        self.assertFalse(self.host.documentation_only(self.old, target))

    def test_non_fast_forward_docs_fall_back_to_deploy(self):
        first = self.commit({'README.md': 'first'}); self.updater.run()
        git(self.remote, 'reset', '--hard', self.old)
        second = self.commit({'README.md': 'different history'})
        self.assertFalse(self.host.documentation_only(first, second))

    def test_post_merge_hook_is_not_executed(self):
        marker = self.base / 'hook-ran'
        hook = self.host.root / '.git/hooks/post-merge'
        hook.write_text('#!/bin/sh\ntouch "' + str(marker) + '"\n'); hook.chmod(0o755)
        self.commit({'README.md': 'new'}); self.updater.run()
        self.assertFalse(marker.exists())

    def test_malformed_diff_and_unknown_paths_fail_closed(self):
        for raw in ('broken', ':100644 100644 bad hash M\0docs/a.md\0',
                    ':100644 100644 ' + 'a'*40 + ' ' + 'b'*40 + ' M\0docs/a.py\0'):
            self.assertFalse(module.documentation_diff(raw, []))
        self.assertTrue(module.documentation_diff('', []))
        self.assertFalse(module.documentation_path('docs/../scripts/run.md'))

    def event_directories(self):
        events = self.base / 'events'; events.mkdir()
        (events / 'pending').mkdir(); (events / 'received').mkdir()
        return events

    def test_queue_records_source_sync_and_duplicate_is_idle(self):
        target = self.commit({'README.md': 'new'})
        events = self.event_directories(); name = str(uuid.uuid4()) + '.json'
        (events / 'pending' / name).write_text('{}')
        module.drain_events(self.updater, events)
        receipt = module.read_json(events / 'received' / name)
        self.assertEqual(receipt['outcome'], 'source_synced'); self.assertEqual(receipt['revision'], target)
        self.assertFalse((events / 'pending' / name).exists())
        # Replay after receipt write, or an entirely empty queue, must never poll GitHub.
        (events / 'pending' / name).write_text('{}')
        with patch.object(self.host, 'latest', side_effect=AssertionError('must stay idle')):
            module.drain_events(self.updater, events)
            module.drain_events(self.updater, events)

    def test_queue_keeps_failed_fetch_then_syncs_on_retry(self):
        target = self.commit({'README.md': 'new'})
        events = self.event_directories(); name = str(uuid.uuid4()) + '.json'
        pending = events / 'pending' / name; pending.write_text('{}')
        with patch.object(self.host, 'fetch_source', side_effect=module.SourceFetchError('unavailable')):
            with self.assertRaises(module.SourceFetchError): module.drain_events(self.updater, events)
        self.assertTrue(pending.exists()); self.assertFalse((events / 'received' / name).exists())
        module.drain_events(self.updater, events)
        self.assertFalse(pending.exists()); self.assertEqual(self.host.revision(self.host.root), target)

    def test_later_code_change_builds_after_documentation_sync(self):
        docs = self.commit({'README.md': 'new'}); self.updater.run()
        self.commit({'scripts/runtime.py': 'new runtime'})
        with patch.object(self.updater, 'required_build_bytes', return_value=0), patch.object(self.updater, 'check_space'), patch.object(self.updater, 'prune_rollbacks'):
            with self.assertRaisesRegex(module.UpdateError, 'fixture_runtime_build'): self.updater.run()
        self.assertIn('build', self.host.events)
        self.assertEqual(self.host.revision(self.host.root), docs)
        self.assertEqual(module.read_json(self.updater.status)['runtimeRevision'], self.old)

    def test_empty_commit_updates_source_without_deploy(self):
        git(self.remote, 'commit', '--allow-empty', '-qm', 'metadata only')
        self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'source_synced')
        self.assertNotIn('build', self.host.events)

    def test_deferred_second_sync_keeps_original_runtime_revision(self):
        self.commit({'README.md': 'first'}); self.updater.run()
        self.commit({'README.md': 'second'})
        with patch.object(self.host, 'fetch_source', side_effect=module.SourceFetchError('unavailable')):
            with self.assertRaises(module.SourceFetchError): self.updater.run()
        self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['runtimeRevision'], self.old)
