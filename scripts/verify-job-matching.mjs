// Verify native skill discovery in an isolated local profile. No gateway or account is started.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, upstream, environment, requireSource } from './runtime-env.mjs';

requireSource();
const dir = mkdtempSync(join(tmpdir(), 'nori-job-discovery-'));
try {
  const workspace = join(dir, 'workspace');
  for (const name of ['rein-community-discovery', 'nori-job-matching']) {
    const target = join(workspace, 'skills', name);
    mkdirSync(target, { recursive: true });
    copyFileSync(join(root, 'workspace/skills', name, 'SKILL.md'), join(target, 'SKILL.md'));
  }
  const configPath = join(dir, 'openclaw.json');
  writeFileSync(configPath, JSON.stringify({
    agents: { defaults: { workspace, skipBootstrap: true } },
    plugins: { enabled: false }, skills: { allowBundled: [] },
  }));
  const result = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'skills', 'info', 'nori-job-matching', '--json'], {
    cwd: upstream, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
    env: { ...environment(), OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: join(dir, 'state') },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const skill = JSON.parse(result.stdout);
  assert.equal(skill.name, 'nori-job-matching');
  assert.equal(skill.eligible, true);
  assert.equal(skill.disabled, false);
  assert.equal(skill.source, 'openclaw-workspace');
  assert.equal(skill.filePath, join(workspace, 'skills/nori-job-matching/SKILL.md'));
  console.log('Native OpenClaw discovery passed: nori-job-matching is eligible, enabled and loaded from the staged workspace. No live account or model used.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
