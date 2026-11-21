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

test('one registration owner exposes only Community identity, self-status and catalog tools to Discord', async () => {
  const loaded = register();
  assert.equal(loaded.registrations.length, 1);
  const community = loaded.create(context());
  assert.deepEqual(community.map(tool => tool.name).sort(), [
    'rein_event_get', 'rein_events_search', 'rein_identity_bind_complete', 'rein_identity_bind_start',
    'rein_identity_bind_status', 'rein_member_status', 'rein_resource_get', 'rein_resources_search', 'rein_status',
  ]);
  const internal = loaded.create(context('main', 'slack'));
  assert.ok(internal.some(tool => tool.name === 'rein_poll_vote'));
  const status = await community.find(tool => tool.name === 'rein_status').execute('fixture-call', {});
  assert.equal(status.details.scope, 'community-plugin-configuration');
  assert.equal(status.details.foundationDbWriteToolsEnabled, false);
  assert.equal(status.details.implemented.includes('rein_poll_vote'), false);
  assert.equal(status.details.implemented.includes('rein_member_status'), true);
  assert.equal(status.details.memberStatusToolEnabled, true);
  assert.equal(loaded.hooks.filter(([name]) => name === 'reply_payload_sending').length, 4);
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

test('Community-first ordering retains exactly one set of internal reply guards', () => {
  const p = profiles();
  const loaded = register({ 'nori-community': p['nori-community'], main: p.main,
    'director-control': structuredClone(p.main) });
  assert.equal(loaded.hooks.filter(([name]) => name === 'reply_payload_sending').length, 4);
  assert.ok(loaded.create(context('main', 'slack')).some(tool => tool.name === 'rein_poll_vote'));
  const { hooks } = register({ 'nori-community': p['nori-community'] });
  assert.deepEqual(hooks.map(([name]) => name), ['before_prompt_build', 'reply_payload_sending']);
  const voice = hooks.find(([name]) => name === 'before_prompt_build')[1];
  assert.match(voice({}, { channel: 'discord', agentId: 'nori-community' }).appendSystemContext, /rein-foundation-operations/);
  assert.equal(voice({}, { channel: 'lark', agentId: 'nori-community' }), undefined);
  assert.equal(voice({}, { channel: 'discord', agentId: 'main' }), undefined);
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

test('explicit internal profiles retain identical Slack authority without lending it to Community', () => {
  const p = profiles(); p['director-control'] = structuredClone(p.main);
  const loaded = register(p);
  assert.ok(loaded.create(context('director-control', 'slack')).some(tool => tool.name === 'rein_poll_vote'));
  assert.deepEqual(loaded.create(context('director-control', 'discord')), []);
  for (const edit of [p => { p['director-control'].accountId = 'other'; },
    p => { p['director-control'].foundationDb.workspaces[0].nativeChannelIds = ['OTHER']; },
    p => { p['director-control'].foundationDb.agentCredentialEnvVar = 'M0_TEST_COMMUNITY_KEY'; }]) {
    const changed = structuredClone(p); edit(changed);
    assert.throws(() => register(changed), /foundation_agent_profiles_invalid/);
  }
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


test('Community query-only profile needs neither governance channels nor a signing key', async () => {
  const p = profiles();
  const db = p['nori-community'].foundationDb;
  db.platform = 'discord'; db.proposalChannelIds = []; db.boardChannelIds = [];
  delete db.proposalConfirmationKeyEnvVar;
  const loaded = register(p);
  const tools = loaded.create(context());
  assert.ok(tools.some(tool => tool.name === 'rein_resources_search'));
  assert.ok(tools.some(tool => tool.name === 'rein_identity_bind_start'));
  assert.ok(tools.some(tool => tool.name === 'rein_member_status'));
  assert.ok(!tools.some(tool => /proposal|poll|funds/.test(tool.name)));
  const status = await tools.find(tool => tool.name === 'rein_status').execute('fixture', {});
  assert.equal(status.details.foundationDbWriteToolsEnabled, false);
  p.main.foundationDb.proposalChannelIds = [];
  assert.throws(() => register(p), /proposalChannelIds/);
});

test('Community self-status retains the Community caller and cannot expose governance or private profile fields', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({ path: new URL(url).pathname, caller: headers.get('X-Rein-Caller-Id'),
      authorization: headers.get('Authorization'), body: JSON.parse(init.body) });
    const body = String(url).endsWith('/api/ingress/relay')
      ? { assertion: 'fixture-self-proof', expires_at: new Date(Date.now() + 60000).toISOString() }
      : { ok: true, status: 'resolved', contact_id: 'private-fixture-contact', is_director: true,
        is_active_contributor: false, profile: { name: 'Fixture Name', email: 'private@example.invalid', joinedAt: null } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const p = profiles();
    p['nori-community'].foundationDb.proposalChannelIds = [];
    p['nori-community'].foundationDb.boardChannelIds = [];
    delete p['nori-community'].foundationDb.proposalConfirmationKeyEnvVar;
    const tools = register(p).create(context());
    const result = await tools.find(tool => tool.name === 'rein_member_status').execute('fixture-self-call', {});
    assert.equal(result.details.linked, true);
    assert.equal(result.details.isDirector, true);
    assert.doesNotMatch(JSON.stringify(result), /email|contact|private@|fixture-self-proof/);
    assert.deepEqual(calls.map(call => call.path), ['/api/ingress/relay', '/api/identity/resolve']);
    assert.ok(calls.every(call => call.caller === 'fixture-community' && call.authorization === 'Bearer fixture-community-key'));
    assert.equal(calls[0].body.platform_user_id, 'FIXTURE_USER');
    assert.deepEqual(calls[1].body, { proof: { kind: 'assertion', assertion: 'fixture-self-proof' } });
    for (const name of ['rein_funds', 'rein_poll_candidates', 'rein_vote_type_resolve',
      'rein_poll_vote', 'rein_governance_proposal_submit', 'rein_proposal_collect', 'rein_revision_apply']) {
      assert.equal(tools.some(tool => tool.name === name), false, name);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('Community profile DM mapping supports identity, binding and catalog through the existing relay contract', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const senderId = '111111111111111111';
  const nativeChannelId = '222222222222222222';
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    const input = JSON.parse(init.body);
    calls.push({ path, input, caller: new Headers(init.headers).get('X-Rein-Caller-Id') });
    const body = path === '/api/ingress/relay'
      ? { assertion: 'fixture-dm-proof', expires_at: new Date(Date.now() + 60000).toISOString() }
      : path === '/api/identity/resolve' ? { ok: true, status: 'identity_not_linked' }
      : path === '/api/identity/link/start'
        ? { ok: true, status: 'started', session_id: 'fixture-bind-session', verification_url: 'https://foundation.invalid/verify', expires_at: null }
        : { ok: true, operation: 'community_resources_search', result: { ok: true, status: 'empty',
          source: 'foundation_catalog', environment: 'dev', retrievedAt: new Date().toISOString(),
          items: [], hasMore: false, nextOffset: null } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const p = profiles();
    const db = p['nori-community'].foundationDb;
    db.proposalChannelIds = []; db.boardChannelIds = [];
    db.workspaces[0].directMessages = true;
    const loaded = register(p);
    const dm = context('nori-community', 'discord', { requesterSenderId: senderId, nativeChannelId,
      sessionKey: `agent:nori-community:discord:default:direct:${senderId}` });
    const tools = loaded.create(dm);
    for (const name of ['rein_member_status', 'rein_identity_bind_start', 'rein_resources_search']) {
      const result = await tools.find(tool => tool.name === name).execute(`fixture-${name}`, {});
      assert.equal(result.details.ok, true, JSON.stringify(result.details));
    }
    const relays = calls.filter(call => call.path === '/api/ingress/relay');
    assert.equal(relays.length, 3);
    assert.ok(relays.every(call => call.input.workspace_id === 'FIXTURE_WORKSPACE' &&
      call.input.channel_id === nativeChannelId && call.input.platform_user_id === senderId));
    assert.ok(calls.every(call => call.caller === 'fixture-community'));
    assert.ok(!tools.some(tool => /funds|poll|proposal|revision/.test(tool.name)));
    calls.length = 0;
    const publicTools = loaded.create({ ...dm, sessionKey: 'agent:nori-community:discord:channel:222222222222222222' });
    await assert.rejects(publicTools.find(tool => tool.name === 'rein_identity_bind_start').execute('fixture-public', {}),
      error => error.code === 'workspace_scope_unresolved');
    assert.equal(calls.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
