import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

source = Path(__file__).resolve().parents[2] / 'deploy/nori-update.py'
sys.path.insert(0, str(source.parent))
spec = importlib.util.spec_from_file_location('nori_updater', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

OLD_REVISION = 'a' * 40
NEW_REVISION = 'b' * 40
NEWER_REVISION = 'c' * 40

class FakeHost:
    def __init__(self, base):
        self.root, self.state, self.releases = (base / p for p in ('live', 'state', 'releases'))
        for path in (self.root, self.state, self.releases):
            path.mkdir()
        (self.root / 'revision').write_text(OLD_REVISION)
        (self.root / 'runtime').mkdir()
        (self.root / 'runtime/session').write_text('original-private-state')
        self.events = []
        self.config = {'minimumFreeGiB': 0}
        self.build_failure = False
        self.new_health_failure = False
        self.latest_values = [NEW_REVISION, NEW_REVISION]
        self.dirty = False

    def latest(self):
        return self.latest_values.pop(0)

    def revision(self, path):
        return (path / 'revision').read_text()

    def ensure_clean(self, path):
        if self.dirty:
            raise module.UpdateError('checkout_has_local_changes')

    def active(self):
        self.events.append('active')

    def build(self, revision, destination):
        self.events.append('build')
        destination.mkdir()
        (destination / 'revision').write_text(revision)
        if self.build_failure:
            raise module.UpdateError('build_failed')

    def stop(self):
        self.events.append('stop')

    def start(self):
        self.events.append('start:' + self.revision(self.root))

    def preserve(self, destination):
        self.events.append('preserve')
        shutil.copytree(self.root / 'runtime', destination / 'runtime')

    def health(self):
        revision = self.revision(self.root)
        self.events.append('health:' + revision)
        if revision == NEW_REVISION and self.new_health_failure:
            (self.root / 'runtime/session').write_text('new-version-state')
            raise module.UpdateError('health_check_timeout')


class UpdaterTests(unittest.TestCase):
    def test_report_write_recovery_keeps_successful_deployment_committed(self):
        self.host.config['reporting'] = True
        real = self.updater.queue_report
        calls = []
        def fail_once(transaction):
            calls.append(transaction)
            if len(calls) == 1:
                raise OSError('temporary report write failure')
            return real(transaction)
        with patch.object(self.updater, 'queue_report', side_effect=fail_once):
            self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'updated')
        self.assertEqual(self.host.revision(self.host.root), NEW_REVISION)
        self.assertEqual(len(list((self.host.state / 'reports').glob('*.json'))), 1)
        self.assertEqual(self.host.events.count('stop'), 1)

    def test_success_reports_once_and_recovery_does_not_duplicate_receipts(self):
        self.host.config['reporting'] = True
        self.updater.run()
        path = next((self.host.state / 'reports').glob('*.json'))
        event = module.read_json(path)
        self.assertEqual(event['revision'], NEW_REVISION)
        self.assertEqual(event['previousRevision'], OLD_REVISION)
        self.assertIn('deployedAt', event)
        done = self.host.state / 'reported'
        done.mkdir()
        path.rename(done / path.name)
        self.updater.queue_report({**event, 'target': event['revision']})
        self.assertFalse(path.exists())

    def test_rollback_never_queues_success_report(self):
        self.host.config['reporting'] = True
        self.host.new_health_failure = True
        with self.assertRaises(module.UpdateError):
            self.updater.run()
        self.assertFalse((self.host.state / 'reports').exists())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.host = FakeHost(Path(self.temp.name).resolve())
        self.updater = module.Updater(self.host)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def test_build_failure_never_stops_active_services(self):
        self.host.build_failure = True
        with self.assertRaises(module.UpdateError):
            self.updater.run()
        self.assertNotIn('stop', self.host.events)
        self.assertEqual(self.host.revision(self.host.root), OLD_REVISION)
        self.assertEqual(module.read_json(self.updater.status)['state'], 'failed')
        self.host.latest_values = [NEW_REVISION]
        self.updater.run()
        self.assertEqual(self.host.events.count('build'), 1)

    def test_success_builds_before_stop_and_preserves_original_snapshot(self):
        self.updater.run()
        self.assertLess(self.host.events.index('build'), self.host.events.index('stop'))
        self.assertLess(self.host.events.index('stop'), self.host.events.index('preserve'))
        self.assertEqual(self.host.revision(self.host.root), NEW_REVISION)
        self.assertEqual((self.host.root / 'runtime/session').read_text(), 'original-private-state')
        previous = next(self.host.releases.glob('previous-*'))
        self.assertEqual(self.host.revision(previous), OLD_REVISION)
        self.assertFalse(self.updater.journal.exists())

    def test_health_failure_restores_old_code_and_private_state_and_keeps_failed_state(self):
        self.host.new_health_failure = True
        with self.assertRaises(module.UpdateError):
            self.updater.run()
        self.assertEqual(self.host.revision(self.host.root), OLD_REVISION)
        self.assertEqual((self.host.root / 'runtime/session').read_text(), 'original-private-state')
        failed = next(self.host.releases.glob('failed-*'))
        self.assertEqual((failed / 'runtime/session').read_text(), 'new-version-state')
        self.assertEqual(module.read_json(self.updater.status)['state'], 'rolled_back')
        self.assertIn('health:' + OLD_REVISION, self.host.events)

    def transaction(self):
        candidate, previous, failed = (self.host.releases / name for name in ('candidate-test', 'previous-test', 'failed-test'))
        candidate.mkdir()
        (candidate / 'revision').write_text(NEW_REVISION)
        record = {'phase': 'switching', 'target': NEW_REVISION, 'previousRevision': OLD_REVISION, 'candidate': str(candidate), 'previous': str(previous), 'failed': str(failed)}
        module.atomic_json(self.updater.journal, record)
        return candidate, previous, failed

    def test_recovers_interruption_between_directory_renames(self):
        _, previous, _ = self.transaction()
        os.rename(self.host.root, previous)
        self.assertTrue(self.updater.recover())
        self.assertEqual(self.host.revision(self.host.root), OLD_REVISION)
        self.assertFalse(self.updater.journal.exists())

    def test_recovers_interruption_after_new_directory_is_installed(self):
        candidate, previous, failed = self.transaction()
        os.rename(self.host.root, previous)
        os.rename(candidate, self.host.root)
        self.assertTrue(self.updater.recover())
        self.assertEqual(self.host.revision(self.host.root), OLD_REVISION)
        self.assertEqual(self.host.revision(failed), NEW_REVISION)

    def test_committed_transaction_is_not_rolled_back_after_interruption(self):
        candidate, previous, _ = self.transaction()
        os.rename(self.host.root, previous)
        os.rename(candidate, self.host.root)
        record = module.read_json(self.updater.journal)
        record['phase'] = 'committed'
        module.atomic_json(self.updater.journal, record)
        self.updater.recover()
        self.assertNotIn('stop', self.host.events)
        self.assertEqual(self.host.revision(self.host.root), NEW_REVISION)

    def test_newer_main_supersedes_build_without_stopping_services(self):
        self.host.latest_values = [NEW_REVISION, NEWER_REVISION]
        self.updater.run()
        self.assertNotIn('stop', self.host.events)
        self.assertEqual(module.read_json(self.updater.status)['state'], 'superseded')

    def test_unchanged_main_does_not_build_or_restart(self):
        self.host.latest_values = [OLD_REVISION]
        self.updater.run()
        self.assertEqual(self.host.events, ['active', 'health:' + OLD_REVISION])

    def test_dirty_checkout_is_preserved_and_defers_update(self):
        self.host.dirty = True
        with self.assertRaises(module.UpdateError):
            self.updater.run()
        self.assertNotIn('build', self.host.events)
        self.assertEqual(module.read_json(self.updater.status)['state'], 'deferred')

    def test_incompatible_probe_defers_before_build_or_stop(self):
        with patch.object(self.host, 'health', side_effect=module.UpdateError('trusted_proxy_probe_configuration_missing')):
            with self.assertRaises(module.UpdateError):
                self.updater.run()
        self.assertNotIn('build', self.host.events)
        self.assertNotIn('stop', self.host.events)
        self.assertFalse(self.updater.journal.exists())
        self.assertEqual(module.read_json(self.updater.status)['state'], 'deferred')

    def test_operator_changed_release_is_not_overwritten_during_recovery(self):
        candidate, previous, _ = self.transaction()
        os.rename(self.host.root, previous)
        os.rename(candidate, self.host.root)
        (self.host.root / 'revision').write_text('operator-repair')
        with self.assertRaises(module.UpdateError):
            self.updater.recover()
        self.assertEqual(self.host.revision(self.host.root), 'operator-repair')

    def test_configuration_rejects_root_builds_and_overlapping_or_escaping_paths(self):
        example = module.read_json(source.parent / 'nori-updater.example.json')
        example.update(root=str(self.host.root), releases=str(self.host.releases), state=str(self.host.state))
        self.assertEqual(module.validate_config(example)['branch'], 'main')
        for change in ({'user': 'root'}, {'preserve': ['../private']}, {'state': str(self.host.root / 'runtime')}, {'services': ['ssh']}):
            with self.subTest(change=change), self.assertRaises(module.UpdateError):
                module.validate_config(dict(example, **change))


class WorkspacePreservationTests(unittest.TestCase):
    def test_main_private_state_survives_without_overwriting_tracked_templates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, candidate = (Path(temporary) / name for name in ('live', 'candidate'))
            for directory in (root, candidate):
                (directory / 'workspace/main').mkdir(parents=True)
            subprocess.run(['git', 'init', '-q', str(candidate)], check=True)
            core = candidate / 'workspace/main/SOUL.md'
            core.write_text('versioned policy')
            subprocess.run(['git', '-C', str(candidate), 'add', 'workspace/main/SOUL.md'], check=True)
            (root / 'workspace/main/SOUL.md').write_text('must not copy the entire workspace')
            example = module.read_json(source.parent / 'nori-updater.example.json')
            for name in ('USER.md', 'MEMORY.md', 'BOOTSTRAP.md', 'memory/note.md', '.openclaw/state.json', '.git/config'):
                path = root / 'workspace/main' / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('synthetic private state')
            host = module.Host.__new__(module.Host)
            host.root, host.config = root, example
            host.command = lambda args: subprocess.run(args, check=True, capture_output=True)
            host.git = lambda directory, *args: subprocess.check_output(
                ['git', '-C', str(directory), *args], text=True)
            host.preserve(candidate)
            self.assertEqual(core.read_text(), 'versioned policy')
            for name in ('USER.md', 'MEMORY.md', 'BOOTSTRAP.md', 'memory/note.md', '.openclaw/state.json', '.git/config'):
                self.assertEqual((candidate / 'workspace/main' / name).read_text(), 'synthetic private state')
            # A future commit must not turn preserved private state into source.
            subprocess.run(['git', '-C', str(candidate), 'add', 'workspace/main/USER.md'], check=True)
            with self.assertRaisesRegex(module.UpdateError, 'preserved_path_became_tracked'):
                host.preserve(candidate)


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.host = FakeHost(Path(self.temp.name))
        self.updater = module.Updater(self.host)
        self.backups = []
        for i in range(6):
            path = self.host.releases / f'previous-candidate-{i:012x}-{i:08x}'
            path.mkdir()
            (path / 'private-state').write_text(f'snapshot-{i}')
            os.utime(path, (100 + i, 100 + i))
            self.backups.append(path)

    def test_keeps_three_newest_and_current_private_state(self):
        self.updater.prune_rollbacks()
        self.assertEqual([p.exists() for p in self.backups], [False]*3 + [True]*3)
        self.assertEqual((self.host.root / 'runtime/session').read_text(), 'original-private-state')
        self.updater.prune_rollbacks()
        self.assertEqual(module.read_json(self.host.state / 'cleanup.json')['deleted'], [])

    def test_protects_latest_known_rollback_even_with_legacy_mtime(self):
        module.atomic_json(self.updater.status, {'previous': str(self.backups[0])})
        self.updater.record('building', revision=NEW_REVISION)
        self.updater.record('deferred', revision=NEW_REVISION)
        self.updater.prune_rollbacks()
        self.assertEqual([p.exists() for p in self.backups], [True,False,False,False,True,True])

    def test_does_not_touch_pending_transaction_or_unrecognized_material(self):
        for name in ['candidate-abc', 'failed-candidate-abc', 'build-home', 'previous-manual']:
            (self.host.releases / name).mkdir()
        outside = Path(self.temp.name) / 'outside'
        outside.mkdir()
        (outside / 'private').write_text('keep')
        link = self.host.releases / 'previous-candidate-ffffffffffff-ffffffff'
        link.symlink_to(outside, target_is_directory=True)
        module.atomic_json(self.updater.journal, {'phase': 'switching'})
        self.updater.prune_rollbacks()
        self.assertTrue(all(p.exists() for p in self.backups))
        self.updater.journal.unlink()
        self.updater.prune_rollbacks()
        self.assertTrue(link.is_symlink())
        self.assertEqual((outside / 'private').read_text(), 'keep')
        for name in ['candidate-abc', 'failed-candidate-abc', 'build-home', 'previous-manual']:
            self.assertTrue((self.host.releases / name).is_dir())

    def test_nested_symlink_target_survives_but_mount_is_skipped(self):
        outside = Path(self.temp.name) / 'outside'
        outside.mkdir()
        (outside / 'private').write_text('keep')
        (self.backups[0] / 'link').symlink_to(outside, target_is_directory=True)
        mount = self.backups[1] / 'mount'
        mount.mkdir()
        # Creating entries changes the parent mtime; restore deployment ordering.
        for i in [0, 1]:
            os.utime(self.backups[i], (100 + i, 100 + i))
        with patch.object(module.os.path, 'ismount', side_effect=lambda p: Path(p) == mount):
            self.updater.prune_rollbacks()
        self.assertTrue(self.backups[1].exists())
        self.assertFalse(self.backups[0].exists())
        self.assertEqual((outside / 'private').read_text(), 'keep')
        self.assertEqual(module.read_json(self.host.state / 'cleanup.json')['skipped'], [self.backups[1].name])

    def test_cleanup_failure_does_not_turn_success_into_deployment_failure(self):
        module.atomic_json(self.updater.status, {'state': 'updated'})
        with patch.object(module.shutil, 'rmtree', side_effect=PermissionError):
            self.updater.prune_rollbacks()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'updated')
        self.assertEqual(module.read_json(self.host.state / 'cleanup.json')['error'], 'PermissionError')

    def test_pipeline_prunes_before_space_check_and_after_success(self):
        revision = 'd' * 40
        self.host.latest_values = [revision, revision]
        observed = []
        original = self.updater.prune_rollbacks
        def prune(**kwargs):
            observed.append(self.host.revision(self.host.root))
            original(**kwargs)
        with patch.object(self.updater, 'prune_rollbacks', side_effect=prune):
            self.updater.run()
        self.assertEqual(observed, [OLD_REVISION, revision])
        self.assertLessEqual(len(list(self.host.releases.glob('previous-candidate-*'))), 3)

    def test_committed_recovery_prunes_only_after_journal_removal(self):
        module.atomic_json(self.updater.journal, {'phase': 'committed', 'target': OLD_REVISION})
        self.updater.recover()
        self.assertFalse(self.updater.journal.exists())
        self.assertEqual(sum(p.exists() for p in self.backups), 3)


class SourceFetchTests(unittest.TestCase):
    def test_clone_revision_fetch_and_pinned_upstream_fetch_are_retryable(self):
        for operation in ('clone', 'fetch', 'upstream'):
            with self.subTest(operation=operation), tempfile.TemporaryDirectory() as directory:
                host = object.__new__(module.Host)
                host.root = Path(directory) / 'live'
                host.releases = Path(directory)
                host.uid, host.gid = os.getuid(), os.getgid()
                host.config = {'repository': 'https://github.com/fixture/repo', 'branch': 'main'}
                host.revision = Mock(return_value='other' if operation == 'fetch' else NEW_REVISION)
                host.git = Mock(return_value=OLD_REVISION)
                def command(args, **kwargs):
                    target = 'fetch' if operation == 'upstream' else operation
                    if target in args:
                        raise module.UpdateError('command_failed:git:128')
                host.command = Mock(side_effect=command)
                with self.assertRaises(module.SourceFetchError):
                    host.build(NEW_REVISION, Path(directory) / 'candidate')

    def test_fetch_timeout_is_retryable_but_local_checkout_error_is_not(self):
        host = object.__new__(module.Host)
        host.command = Mock(side_effect=module.subprocess.TimeoutExpired('git', 300))
        with self.assertRaises(module.SourceFetchError):
            host.fetch_source(['git', 'clone'], timeout=300)
        host.command = Mock(side_effect=module.UpdateError('checkout_failed'))
        with self.assertRaises(module.UpdateError) as error:
            host.git(Path('/fixture'), 'checkout', '--detach', 'revision')
        self.assertNotIsInstance(error.exception, module.SourceFetchError)


if __name__ == '__main__':
    unittest.main()
