// Starts no bot/provider and reads no live configuration, transcripts or credentials.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, upstream, requireSource } from './runtime-env.mjs';
requireSource();
const temp = mkdtempSync(join(tmpdir(), 'nori-native-owner-scope-'));
try {
  const config = join(temp, 'openclaw.json'); writeFileSync(config, '{}');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|LANG|LC_[A-Z_]+|TZ)$/.test(key)));
  Object.assign(env, { HOME: temp, USERPROFILE: temp, OPENCLAW_STATE_DIR: temp, OPENCLAW_CONFIG_PATH: config });
  const result = spawnSync(process.execPath, ['--import', join(upstream, 'scripts/tsx.mjs'),
    join(root, 'tests/fixtures/native-owner-scope.ts')], { cwd: temp, env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || 'native ownership probe failed');
  process.stdout.write(result.stdout);
} finally { rmSync(temp, { recursive: true, force: true }); }
