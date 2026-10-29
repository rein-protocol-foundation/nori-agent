#!/usr/bin/env python3
"""Unprivileged, loopback-only GitHub receiver behind the existing HTTPS proxy."""
import argparse
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import uuid

MAX_BODY = 2 * 1024 * 1024


class Rejected(Exception):
    def __init__(self, status, reason):
        self.status, self.reason = status, reason


class Receiver:
    def __init__(self, config, secret):
        if len(secret) < 32:
            raise ValueError('webhook_secret_must_have_at_least_32_bytes')
        self.config, self.secret = config, secret
        self.pending = Path(config['eventDirectory']) / 'pending'
        self.received = Path(config['eventDirectory']) / 'received'
        for directory in (self.pending, self.received):
            if not directory.is_dir() or directory.resolve() != directory:
                raise ValueError('event_directories_must_exist_without_symlinks')

    def accept(self, body, headers):
        signature = headers.get('X-Hub-Signature-256', '')
        expected = 'sha256=' + hmac.new(self.secret, body, hashlib.sha256).hexdigest()
        if not re.fullmatch(r'sha256=[0-9a-f]{64}', signature) or not hmac.compare_digest(expected, signature):
            raise Rejected(403, 'invalid_signature')
        try:
            delivery = str(uuid.UUID(headers.get('X-GitHub-Delivery', '')))
            payload = json.loads(body)
            if not isinstance(payload, dict):
                raise ValueError()
        except (ValueError, TypeError):
            raise Rejected(400, 'invalid_payload')
        if headers.get('X-GitHub-Event') == 'ping':
            return 200, 'pong'
        if headers.get('X-GitHub-Event') != 'pull_request':
            return 202, 'ignored_event'
        pr = payload.get('pull_request')
        if not isinstance(pr, dict) or payload.get('action') != 'closed' or pr.get('merged') is not True:
            return 202, 'ignored_action'
        base = pr.get('base')
        repository = payload.get('repository')
        if not isinstance(base, dict) or not isinstance(repository, dict):
            raise Rejected(400, 'invalid_repository')
        base_repo = base.get('repo')
        if (repository.get('full_name') != self.config['repository'] or
                not isinstance(base_repo, dict) or base_repo.get('full_name') != self.config['repository'] or
                base.get('ref') != self.config['branch']):
            return 202, 'ignored_target'
        revision, number = pr.get('merge_commit_sha'), pr.get('number')
        if not isinstance(revision, str) or not re.fullmatch('[0-9a-f]{40}', revision) or type(number) is not int or number < 1:
            raise Rejected(400, 'invalid_merge')
        target = self.pending / (delivery + '.json')
        # Receipt is durable before the worker removes pending. Looking in this
        # order makes a concurrent acknowledgment safe for duplicate deliveries.
        if target.exists() or (self.received / target.name).exists():
            return 200, 'duplicate'
        temporary = self.pending / ('.' + delivery + '.' + uuid.uuid4().hex + '.tmp')
        try:
            with open(temporary, 'x', encoding='utf-8') as stream:
                os.chmod(temporary, 0o600)
                json.dump({'delivery': delivery, 'repository': self.config['repository'],
                           'pullRequest': number, 'mergeCommit': revision}, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
            descriptor = os.open(self.pending, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        finally:
            temporary.unlink(missing_ok=True)
        print(json.dumps({'event': 'merge_queued', 'delivery': delivery, 'pullRequest': number}), flush=True)
        return 202, 'queued'


def handler_for(receiver):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def reply(self, status, message):
            body = json.dumps({'status': message}).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            try:
                if self.path != receiver.config['path']:
                    raise Rejected(404, 'not_found')
                if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
                    raise Rejected(415, 'json_content_length_required')
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                except ValueError:
                    raise Rejected(400, 'invalid_length')
                if not 0 < length <= MAX_BODY:
                    raise Rejected(413, 'invalid_body_size')
                body = self.rfile.read(length)
                if len(body) != length:
                    raise Rejected(400, 'incomplete_body')
                self.reply(*receiver.accept(body, self.headers))
            except Rejected as error:
                self.reply(error.status, error.reason)
            except OSError:
                # Never acknowledge work that could not be persisted.
                self.reply(503, 'temporarily_unavailable')

        def do_GET(self):
            self.reply(405, 'post_required')

        def log_message(self, *_):
            pass  # No request bodies, credentials, signatures, or user metadata.

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/nori-webhook.json')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    secret = Path(config['secretFile']).read_bytes().strip()
    receiver = Receiver(config, secret)
    with HTTPServer(('127.0.0.1', config['port']), handler_for(receiver)) as server:
        print('GitHub webhook receiver ready on loopback', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
