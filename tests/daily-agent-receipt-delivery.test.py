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
        self.fail_generate = False
        self.reply = {'action': 'send', 'channel': 'slack', 'dryRun': False, 'messageId': '1794500000.123456'}

    def run_command(self, args, **kwargs):
        self.commands.append(args)
        if '--output-dir' in args:
            if self.fail_generate:
                return subprocess.CompletedProcess(args, 1, '', 'private generation failure')
            folder = Path(args[args.index('--output-dir') + 1])
            folder.mkdir(parents=True, exist_ok=True)
            png = folder / 'receipt.png'
            png.write_bytes(b'\x89PNG\r\n\x1a\nfixture')
            return subprocess.CompletedProcess(args, 0, json.dumps({'png': str(png)}), '')
        png = args[args.index('--media') + 1]
        states = [json.loads(path.read_text()) for path in (self.root / 'state').glob('*.json')]
        matching = [state for state in states if state['png'] == png]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]['status'], 'sending')
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

    def test_revision_is_independent_preserves_original_and_deduplicates_after_restart(self):
        self.assertEqual(self.invoke(send=True)['status'], 'sent')
        original = self.root / 'state' / '2026-11-11-C0CG9BQQ4Q0.json'
        original_bytes = original.read_bytes()
        original_png = Path(json.loads(original_bytes)['png'])
        png_bytes = original_png.read_bytes()
        result = self.invoke(send=True, revision='pricing-v2')
        self.assertEqual((result['status'], result['revision']), ('sent', 'pricing-v2'))
        revised = self.root / 'state' / '2026-11-11-C0CG9BQQ4Q0-revision-pricing-v2.json'
        record = json.loads(revised.read_text())
        self.assertEqual(record['revision'], 'pricing-v2')
        self.assertEqual(Path(record['png']).parent, (self.root / 'media' / '2026-11-11' / 'revisions' / 'pricing-v2').resolve())
        self.assertEqual(original.read_bytes(), original_bytes)
        self.assertEqual(original_png.read_bytes(), png_bytes)
        caption = self.commands[-1][self.commands[-1].index('--message') + 1]
        self.assertTrue(caption.startswith('更正 / CORRECTED · pricing-v2\n'))
        self.assertEqual(self.invoke(send=True, revision='pricing-v2')['status'], 'already-sent')
        self.assertEqual(self.invoke(send=True)['status'], 'already-sent')
        self.assertEqual(len(self.commands), 4)

    def test_uncertain_revision_cannot_resend_or_change_original(self):
        self.invoke(send=True)
        original = self.root / 'state' / '2026-11-11-C0CG9BQQ4Q0.json'
        original_bytes = original.read_bytes()
        self.fail_send = True
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True, revision='pricing-v2')
        self.fail_send = False
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True, revision='pricing-v2')
        self.assertEqual(self.invoke(send=True)['status'], 'already-sent')
        self.assertEqual(original.read_bytes(), original_bytes)
        self.assertEqual(len(self.commands), 4)
        state = json.loads((self.root / 'state' / '2026-11-11-C0CG9BQQ4Q0-revision-pricing-v2.json').read_text())
        self.assertEqual(state['status'], 'uncertain')
        state['status'] = 'sending'  # A process crash can leave persisted intent without a result.
        record = self.root / 'state' / '2026-11-11-C0CG9BQQ4Q0-revision-pricing-v2.json'
        record.write_text(json.dumps(state))
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True, revision='pricing-v2')
        self.assertEqual(len(self.commands), 4)

    def test_uncertain_original_blocks_new_revision_without_subprocess_or_record_changes(self):
        self.fail_send = True
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True)
        self.fail_send = False
        original = self.root / 'state' / '2026-11-11-C0CG9BQQ4Q0.json'
        original_bytes = original.read_bytes()
        self.commands.clear()
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True, revision='pricing-v2')
        self.assertEqual(self.commands, [])
        self.assertEqual(original.read_bytes(), original_bytes)
        self.assertEqual(len(list((self.root / 'state').glob('*.json'))), 1)

    def test_unresolved_revision_blocks_other_revision_and_original_without_subprocess(self):
        self.fail_send = True
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.invoke(send=True, revision='revision-a')
        self.fail_send = False
        record = self.root / 'state' / '2026-11-11-C0CG9BQQ4Q0-revision-revision-a.json'
        for status in ['uncertain', 'sending', 'failed', None]:
            state = json.loads(record.read_text())
            state['status'] = status
            record.write_text(json.dumps(state))
            before = record.read_bytes()
            self.commands.clear()
            for revision in ['revision-b', None]:
                with self.assertRaisesRegex(RuntimeError, 'uncertain'):
                    self.invoke(send=True, revision=revision)
            self.assertEqual(self.commands, [])
            self.assertEqual(record.read_bytes(), before)
            self.assertEqual(len(list((self.root / 'state').glob('*.json'))), 1)

    def test_revision_preview_and_generation_retry_do_not_save_send_intent(self):
        preview = self.invoke(revision='pricing-v2')
        self.assertEqual(preview['status'], 'preview')
        self.assertIn('/revisions/pricing-v2/', preview['png'])
        self.assertFalse(list((self.root / 'state').glob('*.json')))
        self.fail_generate = True
        with self.assertRaisesRegex(RuntimeError, 'generation failed'):
            self.invoke(send=True, revision='pricing-v2')
        self.assertFalse(list((self.root / 'state').glob('*.json')))
        self.fail_generate = False
        self.assertEqual(self.invoke(send=True, revision='pricing-v2')['status'], 'sent')

    def test_revision_validation_precedes_filesystem_side_effects(self):
        for revision in ['', '../reset', '/absolute', 'HAS-UPPERCASE', 'a.b', 'a' * 49, '-bad', 123]:
            with self.assertRaisesRegex(ValueError, 'Revision'):
                self.invoke(send=True, revision=revision)
        self.assertEqual(list(self.root.iterdir()), [])
        self.assertEqual(self.commands, [])

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
            for revision in [None, 'pricing-v2']:
                with self.assertRaises(BlockingIOError):
                    self.invoke(send=True, revision=revision)
        self.assertEqual(self.commands, [])


if __name__ == '__main__':
    unittest.main()
