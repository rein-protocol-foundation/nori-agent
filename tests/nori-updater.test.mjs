import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Nori updater stages safely and recovers failed/interrupted deployments', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tests/fixtures', '-p', 'nori_*tests.py', '-v'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
