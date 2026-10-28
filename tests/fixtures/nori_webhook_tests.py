import contextlib
import hashlib
import hmac
import http.client
from http.server import HTTPServer
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid
from unittest.mock import patch
from nori_updater_tests import FakeHost, module as updater

source = Path(__file__).resolve().parents[2] / 'deploy/nori-webhook.py'
spec = importlib.util.spec_from_file_location('nori_webhook', source)
webhook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(webhook)


class WebhookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.events = self.base / 'events'
        self.events.mkdir()
        for name in ('pending', 'received'):
            (self.events / name).mkdir()
        self.secret = b'synthetic-fixture-secret-0123456789'
        self.config = {'repository': 'fixture/nori', 'branch': 'main', 'path': '/hooks/github',
                       'eventDirectory': str(self.events)}
        self.receiver = webhook.Receiver(self.config, self.secret)
        self.payload = {'action': 'closed', 'repository': {'full_name': 'fixture/nori'},
                        'pull_request': {'number': 4, 'merged': True, 'merge_commit_sha': 'a' * 40,
                                         'base': {'ref': 'main', 'repo': {'full_name': 'fixture/nori'}}}}
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def signed(self, payload=None, event='pull_request', delivery=None):
        body = json.dumps(payload if payload is not None else self.payload).encode()
        return body, {'X-Hub-Signature-256': 'sha256=' + hmac.new(self.secret, body, hashlib.sha256).hexdigest(),
                      'X-GitHub-Event': event, 'X-GitHub-Delivery': delivery or str(uuid.uuid4())}

    def queue(self):
        body, headers = self.signed()
        self.assertEqual(self.receiver.accept(body, headers), (202, 'queued'))
        return body, headers

    def host(self):
        directory = self.base / 'host'
        directory.mkdir()
        host = FakeHost(directory)
        return host, updater.Updater(host)

    def test_only_signed_merged_pr_to_expected_repository_and_branch_is_queued(self):
        body, headers = self.signed()
        with self.assertRaises(webhook.Rejected) as rejected:
            self.receiver.accept(body + b' ', headers)
        self.assertEqual(rejected.exception.status, 403)
        for changes in ('unmerged', 'open', 'branch', 'repository', 'base_repository'):
            payload = json.loads(body)
            if changes == 'unmerged': payload['pull_request']['merged'] = False
            if changes == 'open': payload['action'] = 'opened'
            if changes == 'branch': payload['pull_request']['base']['ref'] = 'develop'
            if changes == 'repository': payload['repository']['full_name'] = 'someone/else'
            if changes == 'base_repository': payload['pull_request']['base']['repo']['full_name'] = 'someone/else'
            self.assertTrue(self.receiver.accept(*self.signed(payload))[1].startswith('ignored'))
        self.assertEqual(self.receiver.accept(*self.signed(event='push')), (202, 'ignored_event'))
        self.assertEqual(list((self.events / 'pending').iterdir()), [])
        self.queue()
        self.assertEqual(len(list((self.events / 'pending').glob('*.json'))), 1)

    def test_duplicate_delivery_is_ignored_before_and_after_processing(self):
        body, headers = self.queue()
        self.assertEqual(self.receiver.accept(body, headers), (200, 'duplicate'))
        host, task = self.host()
        updater.drain_events(task, self.events)
        self.assertEqual(host.events.count('build'), 1)
        self.assertEqual(self.receiver.accept(body, headers), (200, 'duplicate'))
        self.assertFalse(list((self.events / 'pending').glob('*.json')))
        self.assertEqual(len(list((self.events / 'received').glob('*.json'))), 1)

    def test_idle_queue_does_not_query_github_or_restart(self):
        host, task = self.host()
        host.latest = lambda: self.fail('Idle queue contacted GitHub')
        updater.drain_events(task, self.events)
        self.assertEqual(host.events, [])

    def test_merge_during_build_is_coalesced_and_no_event_is_lost(self):
        self.queue()
        host, task = self.host()
        original = host.build
        def build(revision, destination):
            original(revision, destination)
            if revision == 'new':
                self.queue()
        host.build = build
        host.latest_values = ['new', 'newer', 'newer', 'newer']
        updater.drain_events(task, self.events)
        self.assertEqual(host.revision(host.root), 'newer')
        self.assertEqual(host.events.count('stop'), 1)
        self.assertEqual(len(list((self.events / 'received').glob('*.json'))), 2)

    def test_build_failure_keeps_old_service_and_acknowledges_failed_event(self):
        self.queue()
        host, task = self.host()
        host.build_failure = True
        updater.drain_events(task, self.events)
        self.assertNotIn('stop', host.events)
        self.assertEqual(host.revision(host.root), 'old')
        receipt = updater.read_json(next((self.events / 'received').glob('*.json')))
        self.assertEqual(receipt['outcome'], 'failed')
        self.assertFalse(list((self.events / 'pending').glob('*.json')))

    def test_network_failure_keeps_event_for_retry(self):
        self.queue()
        host, task = self.host()
        with patch.object(host, 'latest', side_effect=updater.UpdateError('network_failed')):
            with self.assertRaises(updater.UpdateError):
                updater.drain_events(task, self.events)
        self.assertEqual(len(list((self.events / 'pending').glob('*.json'))), 1)
        updater.drain_events(task, self.events)
        self.assertEqual(host.revision(host.root), 'new')

    def test_crash_after_receipt_before_unlink_does_not_rebuild(self):
        self.queue()
        event = next((self.events / 'pending').glob('*.json'))
        updater.atomic_json(self.events / 'received' / event.name, {'outcome': 'updated'})
        host, task = self.host()
        host.latest = lambda: self.fail('Already acknowledged event triggered a build')
        updater.drain_events(task, self.events)
        self.assertEqual(host.events, [])
        self.assertFalse(event.exists())

    def test_http_signature_ping_and_body_limit(self):
        server = HTTPServer(('127.0.0.1', 0), webhook.handler_for(self.receiver))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        def post(body, headers):
            connection = http.client.HTTPConnection(*server.server_address, timeout=3)
            connection.request('POST', '/hooks/github', body, {'Content-Type': 'application/json', **headers})
            response = connection.getresponse()
            result = response.status, json.loads(response.read())['status']
            connection.close()
            return result
        self.assertEqual(post(*self.signed(event='ping')), (200, 'pong'))
        self.assertEqual(post(b'{}', {}), (403, 'invalid_signature'))
        self.assertEqual(post(b'{}', {'Content-Length': str(webhook.MAX_BODY + 1)}), (413, 'invalid_body_size'))
        self.assertEqual(post(*self.signed()), (202, 'queued'))


if __name__ == '__main__':
    unittest.main()
