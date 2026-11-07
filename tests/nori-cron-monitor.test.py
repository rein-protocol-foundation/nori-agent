import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('monitor', Path(__file__).parents[1] / 'deploy/nori-cron-monitor.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class MonitorTests(unittest.TestCase):
    def state(self):
        return {'cursors': {'slack': [100, '']}, 'incidents': {}, 'outbox': []}

    def test_first_failure_dedup_and_recovery(self):
        state = self.state()
        rows = [('a', 'job', 'error', 101, 'test'), ('b', 'job', 'error', 102, 'test')]
        monitor.advance(state, 'slack', rows)
        monitor.advance(state, 'slack', rows)
        self.assertEqual(len(state['outbox']), 1)
        monitor.advance(state, 'slack', [('c', 'job', 'ok', 103, 'test')])
        self.assertEqual(len(state['outbox']), 2)
        self.assertFalse(state['incidents'])
        self.assertIn('已恢复', state['outbox'][-1]['text'])
        monitor.advance(state, 'slack', [('d', 'job', 'error', 104, 'test')])
        self.assertEqual(len(state['outbox']), 3)

    def test_outbox_survives_failed_delivery(self):
        state = self.state()
        monitor.advance(state, 'slack', [('a', 'job', 'error', 101, 'test')])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'state.json'
            monitor.save(path, state)
            def fail(*args):
                raise OSError('offline')
            with self.assertRaises(OSError):
                monitor.flush({}, state, path, fail)
            persisted = json.loads(path.read_text())
            self.assertEqual(len(persisted['outbox']), 1)
            monitor.flush({}, persisted, path, lambda *args: '123.456')
            self.assertEqual(json.loads(path.read_text())['outbox'], [])

    def test_interrupted_runs_alert_but_skipped_runs_do_not_resolve(self):
        state = self.state()
        monitor.advance(state, 'slack', [
            ('a', 'job', 'interrupted', 101, 'fixture'),
            ('b', 'job', 'skipped', 101, 'fixture'),
        ])
        self.assertEqual(len(state['outbox']), 1)
        self.assertIn('slack:job', state['incidents'])
        monitor.advance(state, 'slack', [('c', 'job', 'ok', 101, 'fixture')])
        self.assertEqual(len(state['outbox']), 2)
        self.assertFalse(state['incidents'])

    def test_card_keeps_untrusted_text_plain_and_localizes_time(self):
        notice = monitor.format_notice('slack', 'fixture-id',
            'TEST-<!channel> *fixture*', 'FAILED', 1794034134092)
        self.assertIn('测试通知', notice['text'])
        self.assertIn('11/06 22:48:54 PST', notice['text'])
        self.assertEqual(notice['blocks'][1]['text']['type'], 'plain_text')
        self.assertIn('<!channel>', notice['blocks'][1]['text']['text'])
        self.assertIn('fixture-id', notice['blocks'][-1]['elements'][0]['text'])

    def test_readonly_receipts_ordered_by_completion(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'runtime.sqlite'
            db = sqlite3.connect(path)
            db.executescript('''CREATE TABLE cron_jobs(store_key,job_id,name);
                CREATE TABLE cron_run_receipts(receipt_id,store_key,job_id,status,finished_at_ms);
                INSERT INTO cron_jobs VALUES('s','j','test');
                INSERT INTO cron_run_receipts VALUES('r','s','j','running',NULL);
                INSERT INTO cron_run_receipts VALUES('z','s','j','error',102);
                INSERT INTO cron_run_receipts VALUES('a','s','j','ok',103);''')
            db.close()
            rows = monitor.collect({'database': str(path)}, 100)
            self.assertEqual([r[0] for r in rows], ['z', 'a'])
            with self.assertRaises(sqlite3.OperationalError):
                monitor.collect({'database': str(path.parent / 'missing')}, 0)


if __name__ == '__main__':
    unittest.main()
