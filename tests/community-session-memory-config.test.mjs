import test from 'node:test';
import assert from 'node:assert/strict';
import { configureCommunitySessionMemory } from '../scripts/configure-community-session-memory.mjs';

const baseline = () => ({ agents: { defaults: { workspace: '/private/internal' }, entries: {
  main: { tools: { allow: ['*'], fs: { workspaceOnly: false } }, sandbox: { mode: 'off' } },
  development: { workspace: '/private/development', memory: { search: { extraPaths: ['/private/dev-ref'] } } },
} }, memory: { search: { extraPaths: ['/private/ops'] } },
bindings: [{ agentId: 'development', match: { channel: 'slack', peer: { kind: 'channel', id: 'dev' } } },
  { agentId: 'main', match: { channel: 'slack' } }], plugins: { entries: {} } });
const candidate = original => { const cfg = structuredClone(original);
  cfg.agents.entries['nori-community'] = { workspace: '/public/community',
    sandbox: { mode: 'all', scope: 'session', workspaceAccess: 'none', backend: 'ssh' },
    tools: { allow: ['read', 'memory_search', 'memory_get', 'message'] } };
  cfg.bindings.push({ agentId: 'nori-community', match: { channel: 'discord', accountId: 'default' } });
  return cfg;
};
test('isolates Community sources while preserving effective main memory, tools and Slack bindings', () => {
  const previousConfig = baseline(), input = candidate(previousConfig), before = structuredClone(input);
  const next = configureCommunitySessionMemory(input, { previousConfig });
  assert.deepEqual(input, before);
  assert.deepEqual(next.agents.entries.main.tools, previousConfig.agents.entries.main.tools);
  assert.deepEqual(next.agents.entries.main.sandbox, { mode: 'off' });
  assert.equal(next.agents.entries.main.memory.search.rememberAcrossConversations, true);
  assert.deepEqual(next.agents.entries.development.memory.search.extraPaths, ['/private/ops', '/private/dev-ref']);
  assert.deepEqual(next.bindings.slice(0, 2), previousConfig.bindings);
  assert.equal(next.bindings[2].session.dmScope, 'per-account-channel-peer');
  assert.deepEqual(next.agents.entries['nori-community'].memory.search.sources, ['sessions']);
  assert.ok(next.agents.entries['nori-community'].tools.allow.includes('sessions_search'));
  assert.ok(next.agents.entries['nori-community'].tools.sandbox.tools.alsoAllow.includes('sessions_search'));
  assert.equal(next.agents.entries['nori-community'].memory.search.rememberAcrossConversations, false);
  assert.equal(next.memory.search.extraPaths, undefined);
  assert.deepEqual(next.plugins.entries['memory-core'].config.memoryPolicy.excludeSessions.channels, ['discord']);
  assert.deepEqual(configureCommunitySessionMemory(next, { previousConfig }), next);
});
test('retains an explicit or inferred disabled main recall setting', () => {
  for (const mode of ['explicit', 'inferred']) {
    const previousConfig = baseline();
    if (mode === 'explicit') previousConfig.memory.search.rememberAcrossConversations = false;
    else previousConfig.session = { dmScope: 'per-channel-peer' };
    const next = configureCommunitySessionMemory(candidate(previousConfig), { previousConfig });
    assert.equal(next.agents.entries.main.memory.search.rememberAcrossConversations, false);
  }
});
test('rejects configurations that would merge private files, widen visibility or change internal dreaming', () => {
  const edits = [
    cfg => { cfg.agents.entries['nori-community'].workspace = '/private/internal/child'; },
    cfg => { cfg.agents.entries['nori-community'].sandbox.workspaceAccess = 'rw'; },
    cfg => { cfg.agents.defaults.sandbox = { sessionToolsVisibility: 'all' }; },
    cfg => { cfg.bindings.push({ agentId: 'main', match: { channel: 'discord' } }); },
    cfg => { cfg.plugins.slots = { memory: 'other' }; },
  ];
  for (const edit of edits) {
    const previousConfig = baseline(), cfg = candidate(previousConfig); edit(cfg);
    assert.throws(() => configureCommunitySessionMemory(cfg, { previousConfig }), /community_session_memory_/);
  }
});
