import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/rein-operations/index.ts';

// Synthetic credentials only. Tests never contact the Foundation or chat platforms.
const fixtureEnv = {
  M0_TEST_URL: 'https://foundation.invalid',
  M0_TEST_MAIN_CALLER: 'fixture-internal', M0_TEST_MAIN_KEY: 'fixture-internal-key',
  M0_TEST_COMMUNITY_CALLER: 'fixture-community', M0_TEST_COMMUNITY_KEY: 'fixture-community-key',
  M0_TEST_SIGNING_KEY: 'fixture-confirmation-signing-key-0000000000',
};
Object.assign(process.env, fixtureEnv);
const backend = (platform, prefix) => ({ enabled: true,
  workspaces: [{ platform, workspaceId: 'FIXTURE_WORKSPACE', nativeChannelIds: ['FIXTURE_ROOM'] }],
  proposalChannelIds: ['FIXTURE_ROOM'], boardChannelIds: ['FIXTURE_ROOM'],
  backendApiBaseUrlEnvVar: 'M0_TEST_URL', agentCallerIdEnvVar: `M0_TEST_${prefix}_CALLER`,
  agentCredentialEnvVar: `M0_TEST_${prefix}_KEY`, proposalConfirmationKeyEnvVar: 'M0_TEST_SIGNING_KEY' });
const profiles = () => ({ main: { platform: 'slack', accountId: 'default', capabilities: 'internal',
  foundationDb: backend('slack', 'MAIN') },
  'nori-community': { platform: 'discord', accountId: 'default', capabilities: 'community',
    foundationDb: backend('discord', 'COMMUNITY') } });
function register(agentProfiles = profiles(), extra = {}) {
  const registrations = []; const hooks = [];
  plugin.register({ pluginConfig: { agentProfiles, ...extra },
    registerTool: (tool, options) => registrations.push({ tool, options }),
    on: (...args) => hooks.push(args) });
  return { registrations, hooks, create: ctx => registrations.flatMap(({ tool }) => tool.create(ctx)) };
}
const context = (agentId = 'nori-community', messageChannel = 'discord', overrides = {}) => ({
  agentId, messageChannel, agentAccountId: 'default', nativeChannelId: 'FIXTURE_ROOM',
  requesterSenderId: 'FIXTURE_USER', sessionId: 'fixture-session',
  assertInvocationCurrent() {}, ...overrides });

test('one registration owner exposes only Community identity/catalog tools to Discord', async () => {
  const loaded = register();
  assert.equal(loaded.registrations.length, 1);
  const community = loaded.create(context());
  assert.deepEqual(community.map(tool => tool.name).sort(), [
    'rein_event_get', 'rein_events_search', 'rein_identity_bind_complete', 'rein_identity_bind_start',
    'rein_identity_bind_status', 'rein_resource_get', 'rein_resources_search', 'rein_status',
  ]);
  const internal = loaded.create(context('main', 'slack'));
  assert.ok(internal.some(tool => tool.name === 'rein_poll_vote'));
  const status = await community.find(tool => tool.name === 'rein_status').execute('fixture-call', {});
  assert.equal(status.details.foundationDbWriteToolsEnabled, false);
  assert.equal(status.details.implemented.includes('rein_poll_vote'), false);
  assert.equal(loaded.hooks.filter(([name]) => name === 'reply_payload_sending').length, 3);
});

test('unknown agents, swapped platforms/accounts, and missing authority expose no tools', () => {
  const loaded = register();
  for (const ctx of [context('main', 'discord'), context('nori-community', 'slack'),
    context('codex', 'discord'), context(undefined, 'discord', { agentId: undefined }),
    context('nori-community', 'discord', { agentAccountId: 'other-bot' }),
    context('nori-community', 'discord', { assertInvocationCurrent: undefined })]) {
    assert.deepEqual(loaded.create(ctx), []);
  }
});

test('retained tools recheck current authority and cannot change their selected profile', async () => {
  const loaded = register();
  const ctx = context();
  const status = loaded.create(ctx).find(tool => tool.name === 'rein_status');
  ctx.agentId = 'main';
  await assert.rejects(status.execute('fixture', {}), /foundation_agent_scope_changed/);
  ctx.agentId = 'nori-community';
  ctx.assertInvocationCurrent = () => { throw new Error('retired'); };
  await assert.rejects(status.execute('fixture', {}), /retired/);
});

test('invalid or shared authority is rejected before registering tools or hooks', () => {
  const bad = [];
  let p = profiles(); p['nori-community'].capabilities = 'internal'; bad.push(p);
  p = profiles(); p['nori-community'].foundationDb = backend('discord', 'MAIN'); bad.push(p);
  p = profiles(); p['nori-community'].foundationDb.workspaces[0].platform = 'slack'; bad.push(p);
  p = profiles(); p['nori-community'].accountId = '*'; bad.push(p);
  p = profiles(); p['nori-community'].foundationDb.enabled = false; bad.push(p);
  for (const agentProfiles of bad) assert.throws(() => register(agentProfiles), /foundation_agent_profiles_invalid/);
  assert.throws(() => register(profiles(), { foundationDb: backend('slack', 'MAIN') }), /foundation_agent_profiles_invalid/);
});

test('backend relay and operation use the selected caller; model arguments cannot choose one', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({ url: String(url), caller: headers.get('X-Rein-Caller-Id'), credential: headers.get('Authorization') });
    const body = String(url).endsWith('/api/ingress/relay')
      ? { assertion: 'fixture-opaque-proof', expires_at: new Date(Date.now() + 60000).toISOString() }
      : { ok: true, operation: 'community_resources_search', result: { ok: true, status: 'empty',
        source: 'foundation_catalog', environment: 'dev', retrievedAt: new Date().toISOString(),
        items: [], hasMore: false, nextOffset: null } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const loaded = register();
    for (const [agent, platform, caller, key] of [['main', 'slack', 'fixture-internal', 'fixture-internal-key'],
      ['nori-community', 'discord', 'fixture-community', 'fixture-community-key']]) {
      calls.length = 0;
      const tool = loaded.create(context(agent, platform)).find(tool => tool.name === 'rein_resources_search');
      const result = await tool.execute('fixture-call', {});
      assert.equal(result.details.ok, true, JSON.stringify(result.details));
      assert.equal(calls.length, 2);
      assert.ok(calls.every(call => call.caller === caller && call.credential === `Bearer ${key}`));
      calls.length = 0;
      const denied = await tool.execute('fixture-forged-call', { callerId: 'fixture-internal', agentId: 'main' });
      assert.equal(denied.details.ok, false);
      assert.equal(calls.some(call => !call.url.endsWith('/api/ingress/relay')), false);
    }
  } finally { globalThis.fetch = originalFetch; }
});
