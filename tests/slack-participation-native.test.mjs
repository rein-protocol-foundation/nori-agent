import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function runNativeFixture(file) {
  const scratch = mkdtempSync(join(tmpdir(), 'slack-participation-'));
  try {
    const home = join(scratch, 'home'), state = join(scratch, 'state');
    for (const dir of [home, state]) mkdirSync(dir, { mode: 0o700 });
    const result = spawnSync(process.execPath, ['--import', './scripts/tsx.mjs',
      fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url))], {
      cwd: fileURLToPath(new URL('../vendor/openclaw', import.meta.url)),
      env: { PATH: process.env.PATH, HOME: home, OPENCLAW_STATE_DIR: state,
        OPENCLAW_CONFIG_PATH: join(state, 'absent.json'), TSX_DISABLE_CACHE: '1' },
      encoding: 'utf8', timeout: 55000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
    return result.stdout;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

test('public native reply_dispatch can silently skip a Slack worker', { timeout: 60000 }, () => {
  const output = runNativeFixture('slack-participation-native.ts');
  assert.match(output, /PASS: native agent reply_dispatch/);
  assert.match(output, /PASS: native ACP reply_dispatch/);
  assert.match(output, /PASS: native plugin-owned binding gap reproduced/);
  assert.match(output, /PASS: positive out-of-duty decision/);
});

test('the registered Router applies and restores a scoped participation hook outcome', { timeout: 60000 }, () => {
  assert.match(runNativeFixture('slack-participation-rollout.ts'), /PASS: registered Router changes Slack reply hook disposition/);
});
