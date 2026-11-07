import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { environment, root, upstream, requireSource } from './runtime-env.mjs';

requireSource();
const temp = mkdtempSync(join(tmpdir(), 'rein-host-guard-loader-'));
try {
  const configPath = join(temp, 'openclaw.json');
  writeFileSync(configPath, JSON.stringify({
    plugins: {
      allow: ['rein-host-guard'],
      load: { paths: [resolve(root, 'plugins/rein-host-guard')] },
      entries: {
        'rein-host-guard': {
          enabled: true,
          hooks: { allowConversationAccess: true, allowPromptInjection: true },
          config: { defaultCwd: temp, protectedPaths: [join(temp, 'core')] },
        },
      },
    },
  }));
  const result = spawnSync(process.execPath, [resolve(upstream, 'dist/entry.js'), 'plugins', 'inspect', 'rein-host-guard', '--runtime', '--json'], {
    cwd: upstream,
    env: { ...environment(), OPENCLAW_STATE_DIR: temp, OPENCLAW_CONFIG_PATH: configPath },
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.plugin.id, 'rein-host-guard');
  assert.equal(report.plugin.imported, true);
  assert.notEqual(report.plugin.status, 'error', report.plugin.error);
  assert.equal(report.diagnostics.filter(item => item.level === 'error').length, 0);
  console.log('Verified real OpenClaw loader: rein-host-guard imported without plugin errors.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
