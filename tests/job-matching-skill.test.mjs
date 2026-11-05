import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertIsolationRuntime, PUBLIC_TOOLS } from '../plugins/rein-discord/isolation.mjs';
import { assertSlackRuntime, CHANNEL_TOOLS } from '../plugins/rein-slack/isolation.mjs';
import { config as slackConfig } from './fixtures/slack-isolation-data.mjs';

// Synthetic runtime fixtures only. No account, network, credentials or candidate data.
function fixture(t, platform) {
  const dir = mkdtempSync(join(tmpdir(), 'nori-job-skill-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const workspace = join(dir, 'public');
  mkdirSync(workspace);
  const memoryPath = join(dir, 'private/member.sqlite');
  const config = platform === 'slack' ? slackConfig(memoryPath) : {
    agentId: 'main', botUserId: '100000000000000008', tokenEnv: 'REIN_TEST_DISCORD_TOKEN', memoryPath,
    guilds: [{ id: '100000000000000001', channelIds: ['100000000000000002'] }], dmAllowFrom: [],
  };
  const cfg = {
    agents: { defaults: { workspace, skipBootstrap: true, compaction: { memoryFlush: { enabled: false } } } },
    memory: { search: { enabled: false, rememberAcrossConversations: false } },
    plugins: { entries: { [platform]: { enabled: false } } },
    tools: { allow: [...(platform === 'slack' ? CHANNEL_TOOLS : PUBLIC_TOOLS)],
      fs: { workspaceOnly: true }, sessions: { visibility: 'self' }, agentToAgent: { enabled: false } },
  };
  const check = () => (platform === 'slack' ? assertSlackRuntime : assertIsolationRuntime)(cfg, config, workspace);
  const stage = name => {
    const target = join(workspace, 'skills', name);
    mkdirSync(target, { recursive: true });
    copyFileSync(new URL(`../workspace/skills/${name}/SKILL.md`, import.meta.url), join(target, 'SKILL.md'));
    return target;
  };
  return { dir, workspace, cfg, check, stage };
}

test('job skill stages successfully in both isolated channels with public web tools and no exec', t => {
  for (const platform of ['discord', 'slack']) {
    const f = fixture(t, platform);
    f.stage('rein-community-discovery');
    f.stage('nori-job-matching');
    assert.doesNotThrow(f.check);
    for (const tool of ['read', 'web_search', 'web_fetch']) assert.ok(f.cfg.tools.allow.includes(tool));
    assert.ok(!f.cfg.tools.allow.includes('exec'));
    f.cfg.tools.allow.push('exec');
    assert.throws(f.check, /tool allowlist/);
  }
});

test('job skill staging rejects unknown skills, extra data, scripts and filesystem link escapes', t => {
  for (const platform of ['discord', 'slack']) {
    const f = fixture(t, platform);
    f.stage('rein-community-discovery');
    const skill = f.stage('nori-job-matching');
    const unknown = join(f.workspace, 'skills', 'unreviewed');
    mkdirSync(unknown);
    assert.throws(f.check, /public reference/);
    rmSync(unknown, { recursive: true });
    for (const leaf of ['profile.json', 'script.mjs']) {
      writeFileSync(join(skill, leaf), 'synthetic');
      assert.throws(f.check, /public reference/);
      rmSync(join(skill, leaf));
    }
    const outside = join(f.dir, 'private.txt');
    writeFileSync(outside, 'SYNTHETIC_PRIVATE_CANARY');
    const entry = join(skill, 'SKILL.md');
    rmSync(entry);
    for (const link of [symlinkSync, linkSync]) {
      link(outside, entry);
      assert.throws(f.check, /public reference/);
      rmSync(entry);
    }
    rmSync(skill, { recursive: true });
    symlinkSync(f.dir, skill);
    assert.throws(f.check, /public reference/);
  }
});

test('optional job skill preserves legacy workspaces and the required catalog skill', t => {
  for (const platform of ['discord', 'slack']) {
    const f = fixture(t, platform);
    assert.doesNotThrow(f.check); // Legacy profile without a skills directory.
    const catalog = f.stage('rein-community-discovery');
    assert.doesNotThrow(f.check); // Existing deployment need not install job matching.
    const job = f.stage('nori-job-matching');
    assert.doesNotThrow(f.check);
    rmSync(job, { recursive: true });
    assert.doesNotThrow(f.check);
    f.stage('nori-job-matching');
    rmSync(catalog, { recursive: true });
    assert.throws(f.check, /public reference/);
  }
});
