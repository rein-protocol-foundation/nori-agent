import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('nori_report', Path(__file__).resolve().parents[2] / 'deploy/nori-report.py')
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'reports' / 'event.json'
        self.path.parent.mkdir()
        self.payload = dict(deploymentId='id', revision='b'*40, previousRevision='a'*40,
                            deployedAt='2026-10-28T00:00:00Z', repository='owner/repo',
                            channelId='C123', pullRequests=[dict(number=1, title='Add <@all>', summary='Feature')], commits=[])
        report.save(self.path, {'payload': self.payload})
        self.config = {'reporting': {'backendUrl': 'https://backend.test', 'callerId': 'reporter'}}
        self.credentials = {'backendCredential': 'backend-test', 'slackBotToken': 'slack-test'}

    def test_receipt_failure_retries_without_resending_slack(self):
        with patch.object(report, 'request', side_effect=[{'ok': True}, {'ok': True, 'ts': '123.456'}, OSError()]):
            with self.assertRaises(OSError):
                report.deliver(self.path, self.config, self.credentials)
        self.assertEqual(json.loads(self.path.read_text())['slackTs'], '123.456')
        with patch.object(report, 'request', return_value={'ok': True}) as request:
            report.deliver(self.path, self.config, self.credentials)
            self.assertEqual(request.call_count, 2)
            self.assertFalse(any('slack.com' in call.args[0] for call in request.call_args_list))
        self.assertFalse(self.path.exists())
        self.assertTrue((self.path.parent.parent / 'reported' / self.path.name).exists())

    def test_database_failure_never_posts_to_slack(self):
        with patch.object(report, 'request', side_effect=OSError()) as request:
            with self.assertRaises(OSError):
                report.deliver(self.path, self.config, self.credentials)
            self.assertEqual(request.call_count, 1)
        self.assertTrue(self.path.exists())

    def test_backend_receipt_repairs_local_state(self):
        with patch.object(report, 'request', side_effect=[{'ok': True, 'slackTs': '123.456'}, {'ok': True}]) as request:
            report.deliver(self.path, self.config, self.credentials)
            self.assertEqual(request.call_count, 2)

    def test_untrusted_titles_cannot_ping_users(self):
        text = report.slack_message(self.payload)
        self.assertIn('&lt;@all&gt;', text)
        self.assertNotIn('<@all>', text)

    def test_metadata_includes_all_commits_and_pr_details(self):
        with patch.object(report, 'request', side_effect=[
            {'total_commits': 2, 'commits': [
                {'sha': 'a'*40, 'commit': {'message': 'Add reporting (#22)'}},
                {'sha': 'b'*40, 'commit': {'message': 'Direct fix'}}]},
            [{'number': 22, 'merged_at': '2026-10-28', 'title': 'Add reporting', 'body': 'Adds Slack notifications'}],
            [],
        ]):
            commits, prs = report.metadata(self.payload, 'owner/repo', {})
        self.assertEqual(len(commits), 2)
        self.assertEqual(prs[0]['number'], 22)
        self.assertEqual(prs[0]['summary'], 'Adds Slack notifications')
