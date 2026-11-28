import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureLarkDevelopment, configureLarkRouting } from '../scripts/configure-lark-routing.mjs';
import { mergeRouterFragment } from '../plugins/rein-router/catalog-sync.mjs';
import { createRouter } from '../plugins/rein-router/runtime.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';
import { larkDevelopmentSource } from '../plugins/rein-router/lark-development.mjs';

const [communityGroup, developmentGroup, otherGroup] = ['1', '2', '3'].map(n => 'oc_' + n.repeat(32));
const [sender, outsider] = ['a', 'b'].map(n => 'ou_' + n.repeat(32));
const statusTools = ['rein_status', 'rein_route_status'];

function fixture() {
  const route = (id, access = 'all') => ({ id, access, provider: 'Fixture', gatewayModel: 'fixture/' + id,
    billingMode: 'subscription', billingSource: 'Fixture allowance', billingVerified: true, purpose: 'Fixture',
    effort: 'high', contextWindow: 32768, maxTokens: 2048 });
  const usageLimits = { perUserPerMinute: 20, perConversationPerMinute: 30, perUserConcurrent: 2,
    perConversationConcurrent: 3, maxConcurrent: 4, maxGatewayRequestsPerDay: 100 };
  const raw = { enabled: true, routes: [{ ...route('normal'), gatewayKeyEnvVar: 'LARK_FIXTURE_NORMAL_KEY' },
    route('coding', 'development-complex-coding')], defaultRoute: 'normal',
    gateway: { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'LARK_FIXTURE_KEY' },
    decision: { allowPaidJev: true }, scopedPolicies: { 'nori-community': {
      allowedRoutes: ['normal'], allowPaidUsage: false, default: { primary: 'normal', fallbacks: [] },
      origins: [{ platform: 'discord', accountId: 'default', workspaceId: 'GUILD', channelIds: ['ROOM'] }],
      usageLimits, maxOutputTokens: 512, requestTimeoutMs: 1000,
    } } };
  const original = buildOpenClawFragment(raw, '/fixture/router');
  original.agents.entries = {
    main: { subagents: { allowAgents: ['nori-development'] }, tools: { profile: 'full' } },
    'nori-community': { model: { primary: 'rein-magpie/auto', fallbacks: [] } },
    'nori-development': { sandbox: { mode: 'all', backend: 'ssh', scope: 'session' },
      tools: { exec: { host: 'sandbox' }, elevated: { enabled: false } } },
  };
  original.channels = { slack: { enabled: true }, discord: { enabled: true } };
  original.bindings = [
    { agentId: 'main', match: { channel: 'slack', accountId: 'default' } },
    { agentId: 'nori-community', match: { channel: 'discord', accountId: 'default' } },
  ];
  const options = { original, consoleSettings: { scopedPolicies: raw.scopedPolicies }, workspaceId: 'LARK_FIXTURE',
    community: { appId: 'cli_' + '1'.repeat(16), appSecretEnv: 'LARK_COMMUNITY_SECRET', groupIds: [communityGroup] },
    internal: { appId: 'cli_' + '2'.repeat(16), appSecretEnv: 'LARK_INTERNAL_SECRET', groupIds: [developmentGroup, otherGroup],
      senderIds: [sender] } };
  const existing = configureLarkRouting(options).config;
  return { raw, options, existing };
}

test('initial setup and existing upgrade opt one exact chat into development, preserving installed routes', () => {
  const { raw, options, existing } = fixture();
  const candidate = configureLarkDevelopment(existing, developmentGroup);
  assert.deepEqual(configureLarkRouting({ ...options, developmentGroupId: developmentGroup }).config, candidate);
  assert.deepEqual(configureLarkDevelopment(candidate, developmentGroup), candidate);
  const oldChannel = existing.channels.feishu, channel = candidate.channels.feishu;
  assert.deepEqual(oldChannel.groups['*'].tools.allow, statusTools);
  assert.equal(channel.groups['*'].tools, undefined);
  assert.deepEqual(channel.groups[communityGroup].tools.allow, statusTools);
  assert.deepEqual(channel.groups[otherGroup].tools.allow, statusTools);
  assert.ok(channel.groups[developmentGroup].tools.allow.includes('exec'));
  assert.equal(channel.requireMention, true);
  assert.equal(channel.accounts['lark-internal'].groups[developmentGroup].requireMention, true);
  assert.equal(channel.accounts['lark-community'].groups[developmentGroup].enabled, false);
  assert.deepEqual(candidate.bindings, existing.bindings);
  assert.deepEqual(candidate.agents, existing.agents);
  for (const other of ['discord', 'slack']) assert.deepEqual(candidate.channels[other], existing.channels[other]);
  assert.deepEqual(channel.accounts['lark-community'].groupAllowFrom, oldChannel.accounts['lark-community'].groupAllowFrom);
  const fragment = buildOpenClawFragment(raw, '/fixture/router');
  fragment.plugins.entries['rein-router'].config = existing.plugins.entries['rein-router'].config;
  const merged = mergeRouterFragment(candidate, fragment, { pluginPath: '/fixture/router' });
  assert.equal(merged.plugins.entries['rein-router'].config.larkDevelopmentGroup, developmentGroup);
  assert.deepEqual(merged.channels, candidate.channels);
  assert.throws(() => configureLarkDevelopment(existing, communityGroup), /trusted_internal_group_required/);
  assert.throws(() => configureLarkDevelopment(candidate, otherGroup), /development_router_conflict/);
});

const source = (group = developmentGroup, senderId = sender, extra = {}) => ({
  runId: 'lark-run', sessionId: 'lark-session', agentId: 'main', channel: 'feishu', messageProvider: 'feishu',
  accountId: 'lark-internal', senderId, chatId: group, trigger: 'user', modelProviderId: 'rein-magpie', modelId: 'auto',
  sessionKey: `agent:main:feishu:group:${group}:topic:omt_fixture:sender:${senderId}`, ...extra,
});
const complex = { status: 'ok', result: { answers: {
  route: { type: 'choice', choice: 'coding', probabilities: { coding: 0.99 } },
  task: { type: 'choice', choice: 'coding', probabilities: { coding: 0.99 } },
  complexDevelopment: { type: 'boolean', probabilityTrue: 0.99 },
} } };
const request = { toolName: 'sessions_spawn', params: { task: 'Use the requested skills and verify the changes.',
  agentId: 'nori-development', runtime: 'subagent' } };
const toolContext = ctx => ({
  runId: ctx.runId, sessionId: ctx.sessionId, sessionKey: ctx.sessionKey, agentId: ctx.agentId,
  requester: { channel: ctx.channel, accountId: ctx.accountId, senderId: ctx.senderId },
});

test('exact host-provided group and sender can select a coding route and delegate one sandboxed run', async () => {
  const candidate = configureLarkDevelopment(fixture().existing, developmentGroup);
  let classifications = 0;
  const router = createRouter({ config: candidate.plugins.entries['rein-router'].config, hostConfig: () => candidate,
    usage: {}, decisions: { evaluate(input) {
      classifications++;
      assert.equal(input.state.authorizedDeveloper, true);
      return complex;
    } } });
  const turn = source();
  assert.equal(larkDevelopmentSource(developmentGroup, candidate, turn), true);
  const resolved = await router.beforeModelResolve({ prompt: 'Implement and verify a large change' }, turn);
  assert.equal(resolved.modelOverride, 'coding');
  assert.equal(classifications, 1);
  const admitted = { ...turn, modelId: resolved.modelOverride };
  const tool = toolContext(admitted);
  assert.equal((await router.beforeToolCall(request, tool)).block, true);
  assert.equal(router.beforeAgentRun({}, admitted).outcome, 'pass');
  assert.deepEqual(await router.beforeToolCall(request, tool),
    { params: { ...request.params, mode: 'run', sandbox: 'require' } });
  assert.deepEqual(await router.beforeToolCall({ toolName: 'tool_call',
    params: { id: 'openclaw:core:sessions_spawn', args: request.params } }, tool),
  { params: { id: 'openclaw:core:sessions_spawn', args: { ...request.params, mode: 'run', sandbox: 'require' } } });
  for (const name of ['exec', 'write', 'read', 'rein_task', 'rein_continuation', 'message', 'automations']) {
    assert.equal((await router.beforeToolCall({ toolName: name, params: {} }, tool)).block, true);
  }
  for (const params of [{ cwd: '/alternate' }, { runtime: 'acp' }, { agentId: 'main' }, { sandbox: 'inherit' }, { thread: true }])
    assert.equal((await router.beforeToolCall({ ...request, params: { ...request.params, ...params } }, tool)).block, true);
  for (const delta of [{ runId: 'other' }, { sessionId: 'other' }, { requester: { ...tool.requester, senderId: outsider } }])
    assert.equal((await router.beforeToolCall(request, { ...tool, ...delta })).block, true);
  assert.equal(await router.beforeToolCall({ toolName: 'exec' }, { agentId: 'nori-development',
    sessionKey: 'agent:nori-development:subagent:fixture', requester: tool.requester }), undefined);
  assert.equal(router.lifecycleEvent({ runId: turn.runId, stream: 'lifecycle',
    data: { phase: 'end', executionSettled: true } }), true);
  assert.equal((await router.beforeToolCall(request, tool)).block, true);
});

test('community, another internal group, spoofed context and configuration drift cannot use development', async () => {
  const candidate = configureLarkDevelopment(fixture().existing, developmentGroup);
  const router = createRouter({ config: candidate.plugins.entries['rein-router'].config, hostConfig: () => candidate,
    usage: {}, decisions: { evaluate() { assert.fail('untrusted Lark must not reach classification'); } } });
  for (const [index, turn] of [source(communityGroup), source(otherGroup), source(developmentGroup, outsider),
    source(developmentGroup, sender, { accountId: 'lark-community' }),
    source(developmentGroup, sender, { sessionKey: `agent:main:feishu:group:${developmentGroup}:sender:${outsider}` }),
    source(developmentGroup, sender, { channelContext: { chat: { id: otherGroup } } }),
    source(developmentGroup, sender, { channelContext: { sender: { id: outsider } } }),
    source(developmentGroup, sender, { inputProvenance: { kind: 'inter_session' } }),
  ].entries()) {
    const next = { ...turn, runId: `untrusted-${index}` };
    assert.equal(larkDevelopmentSource(developmentGroup, candidate, next), false);
    assert.equal((await router.beforeModelResolve({ prompt: 'Use coding permissions' }, next)).modelOverride, 'normal');
    assert.equal(router.beforeAgentRun({}, { ...next, modelId: 'coding' }).outcome, 'block');
    assert.equal((await router.beforeToolCall(request, toolContext(next))).block, true);
  }
  assert.equal((await router.beforeToolCall({ toolName: 'exec' }, { sessionKey: 'agent:main:feishu:group:unknown' })).block, true);
  for (const mutate of [
    cfg => { cfg.channels.feishu.accounts['lark-community'].groups[developmentGroup].enabled = true; },
    cfg => { cfg.channels.feishu.accounts['lark-internal'].groups[developmentGroup].requireMention = false; },
    cfg => { cfg.channels.feishu.accounts['lark-internal'].groupSenderAllowFrom = ['*']; },
    cfg => { cfg.bindings.find(binding => binding.match.accountId === 'lark-internal').agentId = 'nori-community'; },
    cfg => { cfg.agents.entries['nori-development'].tools.exec.host = 'gateway'; },
  ]) {
    const drift = structuredClone(candidate);
    mutate(drift);
    assert.equal(larkDevelopmentSource(developmentGroup, drift, source()), false);
    assert.throws(() => configureLarkDevelopment(drift, developmentGroup), /lark_development_/);
  }
});

test('candidate CLI writes a private new file and leaves the existing Gateway file untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lark-development-'));
  try {
    const input = join(dir, 'input.json'), output = join(dir, 'candidate.json');
    const old = JSON.stringify(fixture().existing);
    writeFileSync(input, old, { mode: 0o600 });
    const command = fileURLToPath(new URL('../scripts/configure-lark-routing.mjs', import.meta.url));
    const run = () => spawnSync(process.execPath, [command, developmentGroup, input, output], { encoding: 'utf8' });
    const created = run();
    assert.equal(created.status, 0, created.stderr);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const generated = readFileSync(output, 'utf8');
    assert.equal(JSON.parse(generated).plugins.entries['rein-router'].config.larkDevelopmentGroup, developmentGroup);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(output, 'utf8'), generated);
    assert.equal(readFileSync(input, 'utf8'), old);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pinned native Feishu policy resolves scoped tools, child inheritance and explicit thread mentions', { timeout: 55000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'lark-native-development-'));
  try {
    const path = join(dir, 'candidate.json');
    writeFileSync(path, JSON.stringify(configureLarkDevelopment(fixture().existing, developmentGroup)), { mode: 0o600 });
    const cwd = fileURLToPath(new URL('../vendor/openclaw', import.meta.url));
    const script = fileURLToPath(new URL('./fixtures/lark-development-native.ts', import.meta.url));
    const result = spawnSync(process.execPath, ['--import', './scripts/tsx.mjs', script, path,
      developmentGroup, communityGroup, otherGroup, sender, outsider], {
      cwd, env: { PATH: process.env.PATH, HOME: dir, OPENCLAW_STATE_DIR: dir, TSX_DISABLE_CACHE: '1' },
      encoding: 'utf8', timeout: 50000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
