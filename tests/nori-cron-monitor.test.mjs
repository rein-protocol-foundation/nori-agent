import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Cron watchdog preserves incidents and retries its durable outbox', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync('python3', ['-B', 'tests/nori-cron-monitor.test.py'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
