// Local synthetic native-memory diagnostic. Starts no channel, model, or provider.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, upstream, requireSource } from './runtime-env.mjs';

requireSource();
const recorded = spawnSync('git', ['ls-tree', 'HEAD', 'vendor/openclaw'], { cwd: root, encoding: 'utf8' });
const actual = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' });
assert.equal(recorded.status, 0, 'repository pin unavailable');
assert.equal(actual.status, 0, 'upstream revision unavailable');
assert.equal(actual.stdout.trim(), recorded.stdout.match(/\b([a-f0-9]{40})\b/)?.[1], 'upstream differs from repository pin');
const temp = mkdtempSync(join(tmpdir(), 'nori-community-session-memory-'));
try {
  const config = join(temp, 'openclaw.json');
  writeFileSync(config, '{}');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|LANG|LC_[A-Z_]+|TZ)$/.test(key)));
  Object.assign(env, { HOME: temp, USERPROFILE: temp, OPENCLAW_STATE_DIR: temp, OPENCLAW_CONFIG_PATH: config,
    TSX_TSCONFIG_PATH: join(upstream, 'tsconfig.json') });
  for (const phase of ['seed-and-reset', 'restart-and-dreaming']) {
    const result = spawnSync(process.execPath, ['--import', join(upstream, 'scripts/tsx.mjs'),
      join(root, 'tests/fixtures/community-session-memory.ts'), phase], {
      cwd: temp, env, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    assert.equal(result.status, 0, result.stderr || result.error?.message || `community session memory ${phase} failed`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
