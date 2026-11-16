// No Gateway, model provider, account or existing runtime profile is contacted.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, upstream, requireSource } from './runtime-env.mjs';
requireSource();
const git = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
};
const pin = git(['ls-tree', 'HEAD', 'vendor/openclaw'], root).match(/\b([a-f0-9]{40})\b/)?.[1];
assert.equal(git(['rev-parse', 'HEAD'], upstream), pin, 'upstream differs from repository pin');
assert.equal(git(['diff', 'HEAD', '--'], upstream), '', 'upstream tracked source must be pristine');
const temp = mkdtempSync(join(tmpdir(), 'nori-runtime-limits-'));
try {
  const config = join(temp, 'openclaw.json'); writeFileSync(config, '{}');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|LANG|LC_[A-Z_]+|TZ)$/.test(key)));
  Object.assign(env, { HOME: temp, USERPROFILE: temp, OPENCLAW_STATE_DIR: temp, OPENCLAW_CONFIG_PATH: config,
    TSX_TSCONFIG_PATH: join(upstream, 'tsconfig.json') });
  const result = spawnSync(process.execPath, ['--import', join(upstream, 'scripts/tsx.mjs'),
    join(root, 'tests/fixtures/community-runtime-limits.ts')], { cwd: temp, env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || String(result.error || 'native diagnostic failed'));
  console.log(`Pinned OpenClaw: ${pin}`);
  process.stdout.write(result.stdout);
} finally { rmSync(temp, { recursive: true, force: true }); }
