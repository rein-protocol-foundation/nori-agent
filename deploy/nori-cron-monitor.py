#!/usr/bin/env python3
"""Independent, read-only Cron receipt watcher with durable Slack outbox."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import sqlite3
import time
import urllib.request
import uuid
from zoneinfo import ZoneInfo


def format_notice(profile, job, name, kind, finished):
    recovered = kind == 'RECOVERED'
    title = '🟢 定时任务已恢复' if recovered else '🔴 定时任务失败'
    name = ''.join(c for c in name if c.isprintable())[:120]
    test = name.startswith('TEST-')
    if test:
        title = '🧪 测试通知 · ' + ('已恢复' if recovered else '执行失败')
    stamp = datetime.datetime.fromtimestamp(finished / 1000,
                ZoneInfo('America/Los_Angeles')).strftime('%m/%d %H:%M:%S %Z')
    summary = '最新一次执行已成功，故障已解除。' if recovered else '独立监控确认执行失败，请查看运行记录定位原因。'
    url = 'https://nori.rein-protocol.org/' + ('discord' if profile == 'discord' else 'slack') + '/automations'
    plain = lambda value: {'type': 'plain_text', 'text': value, 'emoji': True}
    return {
        'text': f'{title}｜{name}\n{summary}\n{stamp} · {profile}',
        'blocks': [
            {'type': 'header', 'text': plain(title)},
            {'type': 'section', 'text': plain(name + '\n' + summary)},
            {'type': 'section', 'fields': [plain('环境\n' + profile.capitalize()),
                                           plain('完成时间\n' + stamp)]},
            {'type': 'actions', 'elements': [{'type': 'button',
                'text': plain('查看运行记录 ↗'), 'url': url,
                'action_id': 'open_cron_dashboard'}]},
            {'type': 'context', 'elements': [plain('独立检查器 · 任务 ID ' + job)]},
        ],
    }


def save(path, value):
    temp = path.with_suffix('.tmp')
    with open(temp, 'w', encoding='utf-8') as stream:
        os.chmod(temp, 0o600)
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def collect(profile, since):
    # Do not create missing databases, mutate runtime state, or read transcripts.
    db = sqlite3.connect(Path(profile['database']).as_uri() + '?mode=ro', uri=True,
                         timeout=10)
    try:
        return list(db.execute('''SELECT r.receipt_id, r.job_id, r.status,
            r.finished_at_ms, COALESCE(j.name, r.job_id)
            FROM cron_run_receipts r LEFT JOIN cron_jobs j
            ON r.store_key=j.store_key AND r.job_id=j.job_id
            WHERE r.finished_at_ms >= ?
            ORDER BY r.finished_at_ms, r.receipt_id''', (since,)))
    finally:
        db.close()


def advance(state, profile, rows):
    cursor = state['cursors'][profile]
    for receipt, job, status, finished, name in rows:
        position = [finished, receipt]
        if position <= cursor:
            continue
        key = profile + ':' + job
        incident = state['incidents'].get(key)
        kind = None
        if status in ('error', 'interrupted') and not incident:
            state['incidents'][key] = {'receipt': receipt, 'since': finished}
            kind = 'FAILED'
        elif status == 'ok' and incident:
            del state['incidents'][key]
            kind = 'RECOVERED'
        if kind:
            # No prompts, output, raw error text, identity, or credentials leave host.
            event_id = str(uuid.uuid5(uuid.NAMESPACE_URL,
                           'nori-cron-monitor:' + profile + ':' + receipt + ':' + kind))
            state['outbox'].append({'id': event_id,
                **format_notice(profile, job, name, kind, finished)})
        cursor = position
        state['cursors'][profile] = cursor


def send(config, item):
    token = json.loads(Path(config['credentialsFile']).read_text())['slackBotToken']
    payload = {'channel': config['channelId'], 'text': item['text'],
               'client_msg_id': item['id'], 'mrkdwn': False,
               'unfurl_links': False, 'unfurl_media': False}
    if item.get('blocks'):
        payload['blocks'] = item['blocks']
    request = urllib.request.Request('https://slack.com/api/chat.postMessage',
        data=json.dumps(payload).encode(), headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    if not result.get('ok'):
        # Slack error codes are safe; never print request/response bodies.
        raise RuntimeError('Slack delivery rejected: ' + str(result.get('error', 'unknown')))
    return result['ts']


def flush(config, state, path, sender=send):
    while state['outbox']:
        item = state['outbox'][0]
        receipt = sender(config, item)
        state['lastDelivery'] = {'id': item['id'], 'slackTs': receipt}
        state['outbox'].pop(0)
        save(path, state)
        print('notification delivered', item['id'], receipt, flush=True)


def run(config):
    directory = Path(config['stateDirectory'])
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(directory / 'lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        path = directory / 'state.json'
        if path.exists():
            state = json.loads(path.read_text())
        else:
            state = {'version': 1, 'cursors': {}, 'incidents': {}, 'outbox': []}
        # Initial baseline intentionally does not re-alert old resolved history.
        now = int(time.time() * 1000)
        for profile in config['profiles']:
            name = profile['name']
            if name not in state['cursors']:
                state['cursors'][name] = [now, '']
            advance(state, name, collect(profile, state['cursors'][name][0]))
        state['lastScanAtMs'] = now
        save(path, state)
        flush(config, state, path)
        print('scan complete; open incidents:', len(state['incidents']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/nori-cron-monitor.json')
    args = parser.parse_args()
    try:
        run(json.loads(Path(args.config).read_text()))
    except Exception as error:
        # Exception types diagnose failures without leaking private paths or values.
        print('cron monitor failed:', type(error).__name__, flush=True)
        raise SystemExit(1)
