#!/usr/bin/env python3
"""Deliver durable successful-deployment records. No build or service actions."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import socket
import sys
import urllib.request


def save(path, value):
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w') as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    sync(path.parent)


def sync(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def request(url, headers=None, payload=None):
    headers = {'User-Agent': 'Nori-Deployment-Reporter', **(headers or {})}
    body = None
    if payload is not None:
        headers['Content-Type'] = 'application/json; charset=utf-8'
        body = json.dumps(payload).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=30) as response:
        return json.load(response)


def metadata(event, repository, github_headers, checkpoint=lambda: None):
    base = f'https://api.github.com/repos/{repository}'
    cache = event.setdefault('metadata', {'pages': {}, 'associations': {}})
    commits, prs = [], {}
    for page in range(1, 11):
        key = str(page)
        if key not in cache['pages']:
            result = request(f'{base}/compare/{event["previousRevision"]}...{event["revision"]}?per_page=100&page={page}', github_headers)
            if result.get('total_commits', 0) > 1000:
                raise ValueError('deployment_range_too_large')
            cache['pages'][key] = {'total': result['total_commits'], 'commits': [
                {'sha': c['sha'], 'subject': c['commit']['message'].splitlines()[0][:1000]}
                for c in result['commits']]}
            checkpoint()
        commits.extend(cache['pages'][key]['commits'])
        if len(commits) >= cache['pages'][key]['total']:
            break
    # GitHub associations support squash, merge and rebase; commit-message
    # conventions cannot reliably identify the PR. Cache progress across limits.
    for commit in commits:
        sha = commit['sha']
        if sha not in cache['associations']:
            result = request(f'{base}/commits/{sha}/pulls?per_page=100', github_headers)
            cache['associations'][sha] = [
                {'number': pr['number'], 'title': pr['title'][:512], 'summary': (pr.get('body') or '')[:2000]}
                for pr in result if pr.get('merged_at')]
            checkpoint()
        for pr in cache['associations'][sha]:
            prs[pr['number']] = pr
    if len(prs) > 100:
        raise ValueError('too_many_pull_requests')
    return commits, [prs[number] for number in sorted(prs)]


def escape(value):
    return value.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def slack_message(payload):
    repo = 'https://github.com/' + payload['repository']
    lines = ['✅ *Nori 部署成功*',
             f'时间：{payload["deployedAt"]}',
             f'版本：<{repo}/commit/{payload["revision"]}|{payload["revision"][:12]}>',
             f'<{repo}/compare/{payload["previousRevision"]}...{payload["revision"]}|查看本次完整变更>']
    for pr in payload['pullRequests'][:30]:
        lines.append(f'• <{repo}/pull/{pr["number"]}|PR #{pr["number"]}> — {escape(pr["title"])}')
    if not payload['pullRequests']:
        lines.extend('• ' + escape(commit['subject']) for commit in payload['commits'][:20])
    if len(payload['pullRequests']) > 30:
        lines.append('其余 PR 见完整变更及后端部署记录。')
    lines.append('部署记录：' + payload['deploymentId'])
    return '\n'.join(lines)


def deliver(path, config, credentials):
    event = json.loads(path.read_text())
    reporting = config['reporting']
    if 'payload' not in event:
        repository = re.sub(r'\.git$', '', config['repository'].removeprefix('https://github.com/'))
        github_headers = {'Accept': 'application/vnd.github+json'}
        if credentials.get('githubToken'):
            github_headers['Authorization'] = 'Bearer ' + credentials['githubToken']
        commits, prs = metadata(event, repository, github_headers, lambda: save(path, event))
        event['payload'] = {key: event[key] for key in ('deploymentId', 'revision', 'previousRevision', 'deployedAt')}
        event['payload'].update(repository=repository, environment='production',
                                host=reporting.get('host', socket.gethostname()),
                                workspaceId=reporting['workspaceId'], channelId=reporting['channelId'],
                                commits=commits, pullRequests=prs)
        save(path, event)
    payload = event['payload']
    headers = {'X-Rein-Caller-Id': reporting['callerId'], 'Authorization': 'Bearer ' + credentials['backendCredential']}
    endpoint = reporting['backendUrl'].rstrip('/') + '/api/agent/deployments'
    if not endpoint.startswith('https://'):
        raise ValueError('backend_requires_https')
    result = request(endpoint, headers, payload)
    if result.get('ok') is not True:
        raise ValueError('backend_record_failed')
    if not event.get('slackTs'):
        # A completed backend receipt repairs a local retry after interruption.
        event['slackTs'] = result.get('slackTs')
    if not event.get('slackTs'):
        result = request('https://slack.com/api/chat.postMessage',
                         {'Authorization': 'Bearer ' + credentials['slackBotToken']},
                         {'channel': payload['channelId'], 'text': slack_message(payload),
                          'client_msg_id': payload['deploymentId'], 'unfurl_links': False,
                          'unfurl_media': False, 'parse': 'none'})
        if result.get('ok') is not True:
            raise ValueError('slack_send_failed:' + str(result.get('error', 'unknown')))
        event['slackTs'] = result['ts']
        save(path, event)
    result = request(endpoint, headers, {**payload, 'slackTs': event['slackTs']})
    if result.get('ok') is not True:
        raise ValueError('backend_receipt_failed')
    done = path.parent.parent / 'reported'
    done.mkdir(mode=0o700, exist_ok=True)
    os.replace(path, done / path.name)
    sync(done)
    sync(path.parent)
    print('Deployment reported: ' + payload['deploymentId'], flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/nori-updater.json')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    if not config.get('reporting'):
        return
    state = Path(config['state'])
    with open(state / 'report.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        credentials = json.loads(Path(config['reporting']['credentialsFile']).read_text())
        failed = False
        for path in sorted((state / 'reports').glob('*.json')):
            try:
                deliver(path, config, credentials)
            except Exception as error:
                # Response bodies, headers and credential contents never reach logs.
                print(f'Report pending {path.stem}: {type(error).__name__}', file=sys.stderr, flush=True)
                failed = True
        if failed:
            sys.exit(1)


if __name__ == '__main__':
    main()
