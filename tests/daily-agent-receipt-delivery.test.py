import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('receipt_delivery', Path(__file__).resolve().parents[1] / 'scripts/send-daily-agent-receipt.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = {'channelId': 'C0CG9BQQ4Q0', 'stateDirectory': str(self.root / 'state'),
                       'outputDirectory': str(self.root / 'media'), 'nodeExecutable': '/node',
                       'openclawLauncher': '/private/slack.mjs'}
        self.now = dt.datetime(2026, 11, 12, 17, tzinfo=dt.timezone.utc)
        self.commands = []
        self.fail_send = False
        self.reply = {'action': 'send', 'channel': 'slack', 'dryRun': False, 'messageId': '1794500000.123456'}

    def run_command(self, args, **kwargs):
        self.commands.append(args)
        if '--output-dir' in args:
            folder = Path(args[args.index('--output-dir') + 1])
            folder.mkdir(parents=True, exist_ok=True)
            png = folder / 'receipt.png'
            png.write_bytes(b'\x89PNG\r\n\x1a\nfixture')
            return subprocess.CompletedProcess(args, 0, json.dumps({'png': str(png)}), '')
        state = json.loads(next((self.root / 'state').glob('*.json')).read_text())
        self.assertEqual(state['status'], 'sending')
        if self.fail_send:
            raise subprocess.TimeoutExpired(args, 180)
        return subprocess.CompletedProcess(args, 0, 'startup notice\n' + json.dumps(self.reply), '')

    def invoke(self, **kwargs):
        return delivery.run_receipt(self.config, now=self.now, run=self.run_command, **kwargs)

    def test_preview_never_sends_and_uses_previous_local_day(self):
        result = self.invoke()
        self.assertEqual((result['status'], result['date']), ('preview', '2026-11-11'))
        self.assertEqual(len(self.commands), 1)
        self.assertFalse(list((self.root / 'state').glob('*.json')))

    def test_confirmed_receipt_survives_restart_without_resending(self):
        self.assertEqual(self.invoke(send=True)['status'], 'sent')
        self.assertIn('--media', self.commands[-1])
        self.assertEqual(self.invoke(send=True)['status'], 'already-sent')
        self.assertEqual(len(self.commands), 2)

    def test_ambiguous_send_is_durable_and_never_retried_automatically(self):
        self.fail_send = True
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True)
        self.fail_send = False
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True)
        self.assertEqual(len(self.commands), 2)

    def test_missing_receipt_or_partial_delivery_is_not_success(self):
        self.assertEqual(delivery.message_receipt(dict(self.reply, messageId='F012ABCDEF')), 'F012ABCDEF')
        for result in [dict(self.reply, messageId=''), dict(self.reply, dryRun=True),
                       dict(self.reply, ok=False), dict(self.reply, sentBeforeError=True),
                       dict(self.reply, channel='discord')]:
            with self.assertRaises(ValueError):
                delivery.message_receipt(result)

    def test_completed_day_and_explicit_channel_required(self):
        with self.assertRaises(ValueError):
            self.invoke(date='2026-11-12', send=True)
        self.config['channelId'] = '#nori-alerts'
        with self.assertRaises(ValueError):
            self.invoke(send=True)
        self.assertEqual(self.commands, [])

    def test_process_lock_rejects_concurrent_sender(self):
        state = Path(self.config['stateDirectory'])
        state.mkdir()
        with (state / 'delivery.lock').open('a') as lock:
            delivery.fcntl.flock(lock, delivery.fcntl.LOCK_EX | delivery.fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.invoke(send=True)
        self.assertEqual(self.commands, [])


if __name__ == '__main__':
    unittest.main()
