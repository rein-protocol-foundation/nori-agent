import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('daily receipt native delivery, restart, uncertain outcome and concurrency', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync('python3', ['-B', 'tests/daily-agent-receipt-delivery.test.py'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
