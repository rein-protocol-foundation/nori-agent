import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

source = Path(__file__).resolve().parents[2] / 'deploy/nori-update.py'
spec = importlib.util.spec_from_file_location('nori_updater', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeHost:
    def __init__(self, base):
        self.root, self.state, self.releases = (base / p for p in ('live', 'state', 'releases'))
        for path in (self.root, self.state, self.releases):
            path.mkdir()
        (self.root / 'revision').write_text('old')
        (self.root / 'runtime').mkdir()
        (self.root / 'runtime/session').write_text('original-private-state')
        self.events = []
        self.config = {'minimumFreeGiB': 0}
        self.build_failure = False
        self.new_health_failure = False
        self.latest_values = ['new', 'new']
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
        if revision == 'new' and self.new_health_failure:
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
        self.assertEqual(self.host.revision(self.host.root), 'new')
        self.assertEqual(len(list((self.host.state / 'reports').glob('*.json'))), 1)
        self.assertEqual(self.host.events.count('stop'), 1)

    def test_success_reports_once_and_recovery_does_not_duplicate_receipts(self):
        self.host.config['reporting'] = True
        self.updater.run()
        path = next((self.host.state / 'reports').glob('*.json'))
        event = module.read_json(path)
        self.assertEqual(event['revision'], 'new')
        self.assertEqual(event['previousRevision'], 'old')
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
        self.assertEqual(self.host.revision(self.host.root), 'old')
        self.assertEqual(module.read_json(self.updater.status)['state'], 'failed')
        self.host.latest_values = ['new']
        self.updater.run()
        self.assertEqual(self.host.events.count('build'), 1)

    def test_success_builds_before_stop_and_preserves_original_snapshot(self):
        self.updater.run()
        self.assertLess(self.host.events.index('build'), self.host.events.index('stop'))
        self.assertLess(self.host.events.index('stop'), self.host.events.index('preserve'))
        self.assertEqual(self.host.revision(self.host.root), 'new')
        self.assertEqual((self.host.root / 'runtime/session').read_text(), 'original-private-state')
        previous = next(self.host.releases.glob('previous-*'))
        self.assertEqual(self.host.revision(previous), 'old')
        self.assertFalse(self.updater.journal.exists())

    def test_health_failure_restores_old_code_and_private_state_and_keeps_failed_state(self):
        self.host.new_health_failure = True
        with self.assertRaises(module.UpdateError):
            self.updater.run()
        self.assertEqual(self.host.revision(self.host.root), 'old')
        self.assertEqual((self.host.root / 'runtime/session').read_text(), 'original-private-state')
        failed = next(self.host.releases.glob('failed-*'))
        self.assertEqual((failed / 'runtime/session').read_text(), 'new-version-state')
        self.assertEqual(module.read_json(self.updater.status)['state'], 'rolled_back')
        self.assertIn('health:old', self.host.events)

    def transaction(self):
        candidate, previous, failed = (self.host.releases / name for name in ('candidate-test', 'previous-test', 'failed-test'))
        candidate.mkdir()
        (candidate / 'revision').write_text('new')
        record = {'phase': 'switching', 'target': 'new', 'previousRevision': 'old', 'candidate': str(candidate), 'previous': str(previous), 'failed': str(failed)}
        module.atomic_json(self.updater.journal, record)
        return candidate, previous, failed

    def test_recovers_interruption_between_directory_renames(self):
        _, previous, _ = self.transaction()
        os.rename(self.host.root, previous)
        self.assertTrue(self.updater.recover())
        self.assertEqual(self.host.revision(self.host.root), 'old')
        self.assertFalse(self.updater.journal.exists())

    def test_recovers_interruption_after_new_directory_is_installed(self):
        candidate, previous, failed = self.transaction()
        os.rename(self.host.root, previous)
        os.rename(candidate, self.host.root)
        self.assertTrue(self.updater.recover())
        self.assertEqual(self.host.revision(self.host.root), 'old')
        self.assertEqual(self.host.revision(failed), 'new')

    def test_committed_transaction_is_not_rolled_back_after_interruption(self):
        candidate, previous, _ = self.transaction()
        os.rename(self.host.root, previous)
        os.rename(candidate, self.host.root)
        record = module.read_json(self.updater.journal)
        record['phase'] = 'committed'
        module.atomic_json(self.updater.journal, record)
        self.updater.recover()
        self.assertNotIn('stop', self.host.events)
        self.assertEqual(self.host.revision(self.host.root), 'new')

    def test_newer_main_supersedes_build_without_stopping_services(self):
        self.host.latest_values = ['new', 'newer']
        self.updater.run()
        self.assertNotIn('stop', self.host.events)
        self.assertEqual(module.read_json(self.updater.status)['state'], 'superseded')

    def test_unchanged_main_does_not_build_or_restart(self):
        self.host.latest_values = ['old']
        self.updater.run()
        self.assertEqual(self.host.events, [])

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


if __name__ == '__main__':
    unittest.main()
