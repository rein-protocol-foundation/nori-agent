import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorAcp, validateAcpConfig, assertAcpRuntimeConfig } from '../plugins/rein-acp/runtime.mjs';
import { createFoundationDirectorAuthorizer } from '../plugins/rein-router/foundation-admin.ts';
import { createSlackDevelopmentAuthorizer } from '../plugins/rein-router/slack-development.mjs';

const config = validateAcpConfig({ enabled: true, channel: { accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', agentId: 'director-control', botTokenEnvVar: 'TEST_SLACK_TOKEN' }, harnessAgentId: 'codex', cwd: '/tmp/rein-acp-fixture' });
const ctx = { runId: 'fixture-run', agentId: config.channel.agentId, sessionKey: 'agent:director-control:slack:fixture', sessionId: 'fixture-session', channel: 'slack', accountId: 'default', senderId: 'UDIRECT1', chatId: config.channel.channelId, trigger: 'user' };
const toolCtx = (delta = {}) => ({ runId: ctx.runId, agentId: ctx.agentId, sessionKey: ctx.sessionKey, requester: { channel: ctx.channel, accountId: ctx.accountId, senderId: ctx.senderId }, ...delta });
const spawn = params => ({ toolName: 'sessions_spawn', params: { task: 'Create and test a tiny pure function', ...params } });
const success = body => ({ ok: true, httpStatus: 200, body });

test('Director gate uses fresh signed identity and current private Slack membership through the whole admission/tool flow', async () => {
  let director = true, member = true, assertions = 0;
  const foundation = createFoundationDirectorAuthorizer({ config: { enabled: true, workspaces: [{ platform: 'slack', workspaceId: config.channel.workspaceId, nativeChannelIds: [config.channel.channelId] }], proposalChannelIds: [config.channel.channelId], boardChannelIds: [config.channel.channelId], backendApiBaseUrlEnvVar: 'TEST_URL', agentCallerIdEnvVar: 'TEST_CALLER', agentCredentialEnvVar: 'TEST_CREDENTIAL' }, env: { TEST_URL: 'http://127.0.0.1:9999', TEST_CALLER: 'fixture', TEST_CREDENTIAL: 'synthetic-credential' }, transport: {
    relayIngress: async () => { assertions++; return success({ ok: true, assertion: 'synthetic-proof' }); },
    resolveIdentity: async () => success({ ok: true, status: 'resolved', contact_id: 'synthetic-contact', is_director: director, is_active_contributor: true, is_administrator: true }),
  } });
  const authorize = createSlackDevelopmentAuthorizer({ config: { developmentChannels: [config.channel] }, authorizeFoundation: foundation, env: { TEST_SLACK_TOKEN: 'xoxb-synthetic' }, fetchImpl: async url => Response.json({ ok: true, ...({
    'auth.test': { team_id: config.channel.workspaceId, user_id: 'UBOT0001', bot_id: 'BBOT0001' },
    'conversations.info': { channel: { id: config.channel.channelId, context_team_id: config.channel.workspaceId, is_private: true, is_member: true, is_archived: false, is_im: false, is_mpim: false } },
    'conversations.members': { members: member ? [ctx.senderId] : [] },
  })[url.split('/').at(-1)] }) });
  const r = createDirectorAcp({ config, authorize });
  assert.equal((await r.beforeAgentRun({}, ctx)).outcome, 'pass');
  assert.deepEqual((await r.beforeToolCall(spawn(), toolCtx())).params, { task: 'Create and test a tiny pure function', runtime: 'acp', agentId: 'codex', cwd: config.cwd, mode: 'run', thread: false, streamTo: 'parent' });
  assert.equal(assertions, 2);
  director = false;
  assert.equal((await r.beforeToolCall({ toolName: 'subagents', params: { action: 'list' } }, toolCtx())).block, true);
  assert.equal((await r.beforeAgentRun({}, ctx)).outcome, 'block');
  director = 'true'; assert.equal((await r.beforeAgentRun({}, ctx)).outcome, 'block');
  director = true; member = false; assert.equal((await r.beforeAgentRun({}, ctx)).outcome, 'block');
});

test('forged, missing and wrong-run authority cannot start, inspect or cancel ACP work', async () => {
  const r = createDirectorAcp({ config, authorize: async () => true });
  for (const delta of [{ senderId: undefined }, { trigger: 'cron' }, { channel: 'discord' }, { chatId: 'COTHER01' }, { inputProvenance: { kind: 'inter_session' } }])
    assert.equal((await r.beforeAgentRun({}, { ...ctx, ...delta })).outcome, 'block');
  await r.beforeAgentRun({}, ctx);
  for (const delta of [{ runId: 'other' }, { sessionKey: 'other' }, { requester: undefined }, { requester: { channel: 'slack', accountId: 'default', senderId: 'UOTHER01' } }]) {
    for (const event of [spawn(), { toolName: 'subagents', params: { action: 'cancel', taskId: 'foreign' } }])
      assert.equal((await r.beforeToolCall(event, toolCtx(delta))).block, true);
  }
  assert.equal((await r.beforeToolCall(spawn({ runtime: 'acp' }), toolCtx({ agentId: 'main' }))).block, true);
  assert.equal(await r.beforeToolCall(spawn({ runtime: 'subagent' }), toolCtx({ agentId: 'main' })), undefined);
});

test('spawn overrides cannot escape the configured one-shot harness, workspace or delivery target', async () => {
  const r = createDirectorAcp({ config, authorize: async () => true }); await r.beforeAgentRun({}, ctx);
  for (const params of [{ runtime: 'subagent' }, { cwd: '/private' }, { agentId: 'other' }, { mode: 'session' }, { thread: true }, { streamTo: 'other' }, { resumeSessionId: 'foreign' }, { model: 'other' }, { task: '' }, { attachments: [] }, { completionTarget: 'other' }])
    assert.equal((await r.beforeToolCall(spawn(params), toolCtx())).block, true);
  assert.equal((await r.beforeToolCall({ toolName: 'exec', params: {} }, toolCtx())).block, true);
  for (const action of ['list', 'wait', 'cancel']) assert.equal(await r.beforeToolCall({ toolName: 'subagents', params: { action } }, toolCtx()), undefined);
});

test('completion turns are report-only and cannot recursively spawn from child output', async () => {
  const r = createDirectorAcp({ config, authorize: async () => { throw Error('must not resolve identity'); } });
  const completion = { ...ctx, inputProvenance: { kind: 'internal_system' } };
  assert.equal((await r.beforeAgentRun({}, completion)).outcome, 'pass');
  assert.deepEqual(r.beforePromptBuild({}, completion).toolsAllow, []);
  assert.equal((await r.beforeToolCall(spawn(), toolCtx())).block, true);
  const nativeCompletion = { ...ctx, inputProvenance: { kind: 'inter_session', sourceTool: 'subagent_announce', sourceSessionKey: 'agent:codex:acp:fixture-child' } };
  assert.equal((await r.beforeAgentRun({}, nativeCompletion)).outcome, 'pass');
  assert.deepEqual(r.beforePromptBuild({}, nativeCompletion).toolsAllow, []);
  assert.equal((await r.beforeToolCall(spawn(), toolCtx())).block, true);
  assert.equal((await r.beforeAgentRun({}, { ...nativeCompletion, inputProvenance: { ...nativeCompletion.inputProvenance, sourceTool: 'sessions_send' } })).outcome, 'block');
});

test('compact tool_call envelopes receive the same gate and bounded parameters', async () => {
  const r = createDirectorAcp({ config, authorize: async () => true }); await r.beforeAgentRun({}, ctx);
  const wrap = event => ({ toolName: 'tool_call', params: { id: event.toolName, args: event.params } });
  const result = await r.beforeToolCall(wrap(spawn()), toolCtx());
  assert.equal(result.params.id, 'sessions_spawn'); assert.equal(result.params.args.streamTo, 'parent');
  const canonical = wrap(spawn()); canonical.params.id = 'openclaw:core:sessions_spawn';
  assert.equal((await r.beforeToolCall(canonical, toolCtx())).params.args.runtime, 'acp');
  assert.equal((await r.beforeToolCall(wrap(spawn({ runtime: 'acp' })), toolCtx({ agentId: 'main' }))).block, true);
  assert.equal((await r.beforeToolCall(wrap(spawn({ cwd: '/private' })), toolCtx())).block, true);
  assert.equal((await r.beforeToolCall(wrap({ toolName: 'exec', params: {} }), toolCtx())).block, true);
});

test('authority errors, deadlines, cancellation, expiration and end-of-run all fail closed', async () => {
  for (const authorize of [async () => { throw Error('PRIVATE_CANARY'); }, () => new Promise(() => {})]) {
    const r = createDirectorAcp({ config, authorize, timeoutMs: 5 });
    assert.equal((await r.beforeAgentRun({}, ctx)).outcome, 'block');
  }
  let now = 0;
  const r = createDirectorAcp({ config, authorize: async () => true, clock: () => now });
  await r.beforeAgentRun({}, { ...ctx, hookInvocation: { assertActive() {} } });
  assert.equal((await r.beforeToolCall(spawn(), toolCtx({ abortSignal: AbortSignal.abort() }))).block, true);
  now = 3_600_001; assert.equal((await r.beforeToolCall(spawn(), toolCtx())).block, true);
  await r.beforeAgentRun({}, ctx); r.agentEnd({}, ctx);
  assert.equal((await r.beforeToolCall(spawn(), toolCtx())).block, true);
});

const hostConfig = () => ({ plugins: { entries: { 'rein-acp': { hooks: { allowConversationAccess: true } } } }, agents: { entries: { [ctx.agentId]: { sandbox: { mode: 'off' }, tools: { elevated: { enabled: false }, allow: ['sessions_spawn', 'subagents', 'apply_patch', 'edit', 'exec', 'process', 'read', 'write'] } } } }, acp: { enabled: true, allowedAgents: ['codex'] }, commands: { allowFrom: { slack: [] } } });
test('runtime validation keeps the sandboxed development agent separate and closes slash/binding bypasses', () => {
  assert.doesNotThrow(() => assertAcpRuntimeConfig(config, hostConfig()));
  for (const mutate of [h => { h.agents.entries[ctx.agentId].sandbox.mode = 'all'; }, h => { h.agents.entries[ctx.agentId].tools.allow.push('exec'); }, h => { h.commands.allowFrom.slack = ['*']; }, h => { h.bindings = [{ type: 'acp' }]; }, h => { h.acp.allowedAgents = []; }, h => { h.plugins.entries['rein-router'] = { config: { developmentChannels: [config.channel] } }; }, h => { h.plugins.entries['rein-acp'].hooks.allowConversationAccess = false; }]) {
    const host = hostConfig(); mutate(host); assert.throws(() => assertAcpRuntimeConfig(config, host), /rein_acp_runtime_invalid/);
  }
  assert.deepEqual(validateAcpConfig(), { enabled: false });
  assert.throws(() => validateAcpConfig({ ...config, cwd: 'relative' }), /rein_acp_config_invalid/);
});
