// Native discovery baseline; no channel, provider or skill script is executed.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, upstream, environment, requireSource } from './runtime-env.mjs';

requireSource();
const temp = mkdtempSync(join(tmpdir(), 'nori-workspace-skills-'));
try {
  const workspace = join(temp, 'workspace');
  const skills = join(workspace, 'skills');
  cpSync(join(root, 'workspace/skills'), skills, { recursive: true });
  const fixture = join(skills, 'nori-discovery-fixture');
  mkdirSync(join(fixture, 'references'), { recursive: true });
  mkdirSync(join(fixture, 'scripts'));
  writeFileSync(join(fixture, 'SKILL.md'), '---\nname: nori-discovery-fixture\ndescription: Synthetic workspace discovery check.\n---\nRead references/example.md. Script: scripts/example.mjs.\n');
  writeFileSync(join(fixture, 'references/example.md'), 'Synthetic public reference.\n');
  writeFileSync(join(fixture, 'scripts/example.mjs'), '// Discovery must not execute this file.\nthrow new Error("Do not execute during discovery");\n');
  const configPath = join(temp, 'openclaw.json');
  writeFileSync(configPath, JSON.stringify({
    agents: { defaults: { workspace, skipBootstrap: true } },
    plugins: { enabled: false }, skills: { allowBundled: [] },
  }));
  for (const entry of readdirSync(skills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(skills, entry.name, 'SKILL.md');
    const name = readFileSync(path, 'utf8').match(/^name:\s*(.+)$/m)?.[1]?.trim();
    assert.ok(name, `Missing skill name: ${path}`);
    const result = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'skills', 'info', name, '--json'], {
      cwd: upstream, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
      env: { ...environment(), OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: join(temp, 'state') },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const skill = JSON.parse(result.stdout);
    assert.equal(skill.name, name);
    assert.equal(skill.disabled, false);
    assert.equal(skill.source, 'openclaw-workspace');
    assert.equal(skill.filePath, path);
    // Dependency eligibility remains native policy; discovery is not tool authorization.
    console.log(`${name}: workspace discovery passed; eligible=${skill.eligible}`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
