from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from nori_updater_tests import module


class GatewayProbeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name).resolve()
        self.requests = []
        self.expected = {}
        self.agent_id = 'main'
        fixture = self

        class Gateway(BaseHTTPRequestHandler):
            def respond(self, status, value):
                body = json.dumps(value).encode()
                self.send_response(status)
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                fixture.requests.append(self.path)
                self.respond(200, {'error': None, 'lastSync': 'fixture'})

            def do_POST(self):
                fixture.requests.append(self.path)
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                valid = (self.path == '/tools/invoke' and body == {'tool': 'rein_status', 'args': {}, 'agentId': fixture.agent_id} and
                         all(self.headers.get(name) == value for name, value in fixture.expected.items()))
                self.respond(200 if valid else 403, {'ok': valid, 'result': {'status': 'ready'} if valid else None})

            def log_message(self, *_):
                pass

        server = HTTPServer(('127.0.0.1', 0), Gateway)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.host = module.Host.__new__(module.Host)
        self.host.root = root
        self.host.active = lambda: None
        self.host.config = {'routerPort': server.server_port, 'routerSession': 'router-session.json',
                            'healthTimeout': 0.1, 'gateways': [{'port': server.server_port, 'config': 'gateway.json'}]}
        (root / 'router-session.json').write_text(json.dumps({'token': 'fixture-router-token'}))

    def configure(self, auth):
        (self.host.root / 'gateway.json').write_text(json.dumps({'gateway': {'auth': auth}}))

    def test_trusted_proxy_only_gateway_accepts_identity_and_forwarding_headers(self):
        self.configure({'mode': 'trusted-proxy', 'trustedProxy': {
            'userHeader': 'x-nori-user', 'allowLoopback': True, 'allowUsers': ['fixture-owner'],
            'requiredHeaders': ['X-Forwarded-Proto', 'X-Forwarded-Host', 'X-Fixture-Proxy']}})
        forwarded = {'X-Nori-User': 'fixture-owner', 'X-Forwarded-For': '192.0.2.1',
                     'X-Forwarded-Host': 'dashboard.example.org', 'X-Forwarded-Proto': 'https',
                     'X-Fixture-Proxy': 'synthetic'}
        self.host.config['gateways'][0]['trustedProxyHeaders'] = forwarded
        self.expected = {**forwarded, 'Authorization': None, 'Content-Type': 'application/json'}
        self.host.health()
        self.assertIn('/tools/invoke', self.requests)

    def test_token_and_password_modes_use_the_selected_credential(self):
        for mode in ('token', 'password'):
            with self.subTest(mode=mode):
                self.configure({'mode': mode, 'token': 'fixture-token', 'password': 'fixture-password'})
                self.expected = {'Authorization': 'Bearer fixture-' + mode, 'X-Nori-User': None}
                self.host.health()

    def test_multi_agent_health_probe_has_an_explicit_configurable_owner(self):
        self.configure({'mode': 'token', 'token': 'fixture-token'})
        self.expected = {'Authorization': 'Bearer fixture-token'}
        self.agent_id = 'operations'
        self.host.config['gateways'][0]['agentId'] = self.agent_id
        self.host.health()
        self.assertIn('/tools/invoke', self.requests)

    def test_invalid_health_owner_fails_before_http(self):
        self.configure({'mode': 'token', 'token': 'fixture-token'})
        self.host.config['gateways'][0]['agentId'] = '../other'
        with self.assertRaisesRegex(module.UpdateError, 'invalid_gateway_probe_agent'):
            self.host.health()
        self.assertEqual(self.requests, [])

    def test_missing_proxy_configuration_fails_before_any_http_probe(self):
        self.configure({'mode': 'trusted-proxy', 'trustedProxy': {
            'userHeader': 'x-nori-user', 'allowLoopback': True, 'allowUsers': ['fixture-owner']}})
        with self.assertRaisesRegex(module.UpdateError, 'trusted_proxy_probe_configuration_missing'):
            self.host.health()
        self.assertEqual(self.requests, [])

    def test_proxy_probe_rejects_an_identity_outside_the_allowlist(self):
        self.configure({'mode': 'trusted-proxy', 'trustedProxy': {
            'userHeader': 'x-nori-user', 'allowLoopback': True, 'allowUsers': ['fixture-owner']}})
        self.host.config['gateways'][0]['trustedProxyHeaders'] = {
            'x-nori-user': 'different-user', 'x-forwarded-for': '192.0.2.1',
            'x-forwarded-host': 'dashboard.example.org', 'x-forwarded-proto': 'https'}
        with self.assertRaisesRegex(module.UpdateError, 'trusted_proxy_probe_user_not_allowed'):
            self.host.health()
        self.assertEqual(self.requests, [])


if __name__ == '__main__':
    unittest.main()
