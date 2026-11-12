#!/usr/bin/env python3
"""Render a daily receipt; explicitly opt in to native OpenClaw Slack delivery."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent


def atomic_json(path, data):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        os.chmod(temporary, 0o600)
        json.dump(data, stream, ensure_ascii=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def cli_json(output):
    # Native startup notices may precede its final structured result.
    decoder = json.JSONDecoder()
    for match in re.finditer(r'(?m)^\s*\{', output):
        try:
            value, end = decoder.raw_decode(output[match.start():].lstrip())
            if isinstance(value, dict) and not output[match.start():].lstrip()[end:].strip():
                return value
        except json.JSONDecodeError:
            continue
    raise ValueError('Native CLI did not return one final JSON result')


def message_receipt(result):
    if (result.get('action') != 'send' or result.get('channel') != 'slack'
            or result.get('dryRun') is not False or result.get('ok') is False
            or result.get('error') or result.get('sentBeforeError')):
        raise ValueError('Native Slack delivery was not confirmed')
    message_id = result.get('messageId')
    # Native file delivery returns the confirmed Slack file ID when no share ts is available.
    if not isinstance(message_id, str) or not re.fullmatch(r'(?:\d+\.\d+|F[A-Z0-9]+)', message_id):
        raise ValueError('Native Slack delivery returned no message or file ID')
    return message_id


def run_receipt(config, *, date=None, send=False, revision=None, run=subprocess.run, now=None):
    # Corrections are explicit independent deliveries, never a reset of prior evidence.
    # Lowercase identifiers avoid ambiguous keys on case-insensitive filesystems.
    if revision is not None and (not isinstance(revision, str)
                                 or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,47}', revision)):
        raise ValueError('Revision must be 1-48 lowercase letters, digits, underscores or hyphens; start with a letter or digit')
    zone = config.get('timezone', 'America/Los_Angeles')
    now = now or dt.datetime.now(dt.timezone.utc)
    day = dt.date.fromisoformat(date) if date else now.astimezone(ZoneInfo(zone)).date() - dt.timedelta(days=1)
    if day >= now.astimezone(ZoneInfo(zone)).date():
        raise ValueError('Only completed calendar days can be reported')
    channel = config['channelId']
    if not re.fullmatch(r'[CG][A-Z0-9]{8,}', channel):
        raise ValueError('An explicit Slack channel ID is required')
    state_dir = Path(config['stateDirectory']).resolve()
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    output_dir = Path(config['outputDirectory']).resolve() / str(day)
    key = f'{day}-{channel}'
    if revision is not None:
        key += f'-revision-{revision}'
        output_dir = output_dir / 'revisions' / revision
    state_path = state_dir / f'{key}.json'
    revision_result = {'revision': revision} if revision is not None else {}
    # OS releases flock on normal exit, timeout, kill and restart.
    with (state_dir / 'delivery.lock').open('a') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous = json.loads(state_path.read_text()) if state_path.exists() else None
        if send and previous:
            if isinstance(previous, dict) and previous.get('status') == 'sent':
                return {'status': 'already-sent', 'date': str(day), 'messageId': previous['messageId'], **revision_result}
            raise RuntimeError('Delivery is uncertain; inspect Slack and reconcile the saved receipt before retrying')
        if send:
            # A new correction key must never bypass an unresolved original or
            # correction. Read all same-day/channel evidence under the same lock.
            original_path = state_dir / f'{day}-{channel}.json'
            related = ([original_path] if original_path.exists() else [])
            related += sorted(state_dir.glob(f'{day}-{channel}-revision-*.json'))
            for record_path in related:
                record = json.loads(record_path.read_text())
                if not isinstance(record, dict) or record.get('status') != 'sent':
                    raise RuntimeError('Delivery is uncertain; reconcile all receipts for this day and channel before a new send')
        node = config['nodeExecutable']
        generate = [node, str(ROOT / 'scripts/daily-agent-receipt.mjs'), '--date', str(day),
                    '--timezone', zone, '--magpie-url', config.get('magpieUrl', 'http://127.0.0.1:3425'),
                    '--output-dir', str(output_dir)]
        rendered = run(generate, cwd=ROOT, capture_output=True, text=True, timeout=180, check=False)
        if rendered.returncode:
            raise RuntimeError('Receipt generation failed; no message was sent')
        artifacts = cli_json(rendered.stdout)
        png = Path(artifacts['png']).resolve()
        if png.parent != output_dir or not png.is_file() or png.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError('Renderer returned an invalid receipt image')
        if not send:
            return {'status': 'preview', 'date': str(day), 'png': str(png), **revision_result}
        caption = (f'Nori 每日 AI 用量 · {day} ({zone})\n'
                   '按 Magpie 目录 API 价格估算，不计算订阅套餐扣费，非实际账单。统计本机 Magpie 网关请求；'
                   '未经过网关的 ACP / 其他直接调用不在统计范围内。')
        if revision is not None:
            caption = f'更正 / CORRECTED · {revision}\n' + caption
        command = [node, config['openclawLauncher'], 'message', 'send', '--channel', 'slack',
                   '--account', config.get('accountId', 'default'), '--target', channel,
                   '--message', caption, '--media', str(png), '--json']
        state = {'status': 'sending', 'date': str(day), 'timezone': zone, 'channelId': channel,
                 'startedAt': now.isoformat(), 'png': str(png), **revision_result}
        # Persist intent BEFORE any external call. Ambiguous failures never blindly resend.
        atomic_json(state_path, state)
        try:
            sent = run(command, cwd=ROOT, capture_output=True, text=True, timeout=180, check=False)
            if sent.returncode:
                raise RuntimeError('Native Slack send failed or was interrupted')
            message_id = message_receipt(cli_json(sent.stdout))
        except Exception:
            state['status'] = 'uncertain'
            atomic_json(state_path, state)
            raise RuntimeError('Slack delivery uncertain; inspect channel before retrying') from None
        state.update(status='sent', messageId=message_id,
                     completedAt=dt.datetime.now(dt.timezone.utc).isoformat())
        atomic_json(state_path, state)
        return {'status': 'sent', 'date': str(day), 'channelId': channel, 'messageId': message_id, **revision_result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--date')
    parser.add_argument('--revision', help='Explicit correction identifier (1-48 lowercase letters/digits/underscores/hyphens)')
    parser.add_argument('--send', action='store_true', help='Actually deliver via the configured Nori Slack account')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = run_receipt(json.loads(Path(args.config).read_text()), date=args.date, send=args.send, revision=args.revision)
        print(json.dumps(result, ensure_ascii=False))
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        # Never print subprocess output, raw Slack replies or credentials.
        print(f'Daily receipt failed: {type(error).__name__}. Check local state and native run history.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
