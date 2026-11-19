import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlackParticipation, validateParticipationPolicy } from '../plugins/rein-router/slack-participation.mjs';
import { createRouter } from '../plugins/rein-router/runtime.mjs';
import { validateRouterConfig } from '../plugins/rein-router/policy.mjs';
import { readFile } from 'node:fs/promises';

const channel = { accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', agentId: 'main' };
const policy = { enabled: true, version: 'test-policy-v1', duties: 'Help maintain the organization deployment and operational reliability.', channels: [channel] };
const context = changes => ({ Provider: 'slack', Surface: 'slack', AccountId: channel.accountId,
  GroupSpace: channel.workspaceId, NativeChannelId: channel.channelId, AgentId: channel.agentId,
  ChatType: 'channel', ChatId: channel.channelId, SenderId: 'UALICE01', WasMentioned: false,
  SessionKey: 'agent:main:slack:channel:cfixture1', MessageSid: '1000.001',
  InboundAccessAuthorized: true, CommandBody: 'The deployment is failing; can anyone diagnose it?', ...changes });
const answer = (duty, helpful) => ({ status: 'ok', result: { answers: {
  dutyRelevant: { type: 'boolean', probabilityTrue: duty }, helpful: { type: 'boolean', probabilityTrue: helpful } } } });
const make = (evaluate = async () => answer(.99, .99), extra = {}) => createSlackParticipation({
  policy, allowPaidJev: true, decisions: { evaluate }, ...extra });

// Labeled synthetic replay cases assess the two independent judgments, not a model's accuracy.
const replay = [
  { label: 'unanswered deployment failure', duty: .99, helpful: .99, action: 'native' },
  { label: 'deployment fixed and already acknowledged', duty: .99, helpful: .01, action: 'silence' },
  { label: 'useful out-of-duty clarification', duty: .01, helpful: .99, action: 'native' },
  { label: 'casual off-topic acknowledgement', duty: .01, helpful: .01, action: 'silence' },
  { label: 'uncertain duty but clearly useful help', duty: .6, helpful: .99, action: 'native' },
  { label: 'uncertain interruption value', duty: .99, helpful: .6, action: 'silence' },
];
test('labeled replay separates duty relevance from helpfulness', async () => {
  for (const item of replay) {
    const result = await make(async () => answer(item.duty, item.helpful)).evaluate(context());
    assert.equal(result.action, item.action, item.label);
    assert.equal(result.observation.version, policy.version);
    assert.equal(result.observation.rule, 'passive-channel');
    assert.equal(result.observation.route, item.action === 'native' ? 'existing-router' : null);
  }
});

test('omitted/disabled policy, explicit mentions, DMs and native/manual commands retain native behavior', async () => {
  const never = async () => assert.fail('no classifier for native bypass');
  assert.equal((await createSlackParticipation({ decisions: { evaluate: never } }).evaluate(context())).action, 'native');
  for (const changes of [{ WasMentioned: true }, { WasMentioned: true, SenderIsBot: true }, { WasMentioned: undefined }, { ChatType: 'direct' },
    { CommandSource: 'native' }, { CommandTurn: { kind: 'text-slash' } }, { CommandBody: '/model premium' }, { ImplicitMentionKinds: ['reply_to_bot'] },
    { InputProvenance: { kind: 'inter_session' }, WasMentioned: true }])
    assert.equal((await make(never).evaluate(context(changes))).action, 'native');
});

test('every authenticated scope dimension must match before classification', async () => {
  let calls = 0;
  for (const changes of [{ AccountId: 'other' }, { GroupSpace: 'TOTHER01' }, { NativeChannelId: 'COTHER01' },
    { AgentId: 'other' }, { Provider: 'discord' }, { Surface: 'webchat' }]) {
    const result = await make(async () => { calls++; return answer(1, 1); }).evaluate(context(changes));
    assert.equal(result.action, 'native');
    assert.equal(result.observation.reason, 'outside-scope');
  }
  assert.equal(calls, 0);
});

test('self/bot loops, missing ingress proof and inconsistent identity never invoke classifier', async () => {
  for (const changes of [{ SenderIsBot: true }, { SenderIsSelf: true }, { InboundAccessAuthorized: false },
    { InboundAccessAuthorized: undefined }, { SenderId: 'BFIXTURE1' }, { ChatId: 'COTHER01' },
    { SessionKey: 'agent:other:slack:channel:cfixture1' }, { MessageSid: undefined },
    { InputProvenance: { kind: 'inter_session' } }]) {
    const result = await make(async () => assert.fail('no classifier for invalid ingress')).evaluate(context(changes));
    assert.equal(result.action, 'silence');
  }
});

test('classifier receives bounded current message and duties, no private history or attachments', async () => {
  let batch, options;
  const gate = make(async (input, opts) => { batch = input; options = opts; return answer(1, 1); });
  assert.equal((await gate.evaluate(context({ Body: 'PRIVATE_BODY', BodyForAgent: 'PRIVATE_PROMPT',
    RawBody: 'PRIVATE_ATTACHMENT_TEXT <@PRIVATE_ID> (PRIVATE_PROFILE)', InboundHistory: ['PRIVATE_HISTORY'], MediaPath: '/private/file', SessionTranscriptContext: { secret: 'PRIVATE_TRANSCRIPT' } }))).action, 'native');
  assert.deepEqual(Object.keys(batch.state).sort(), ['currentMessage', 'duties']);
  assert.equal(Object.keys(batch.questions).length, 2);
  assert.ok(!JSON.stringify(batch).includes('PRIVATE_'));
  assert.equal(options.purpose, 'rein-router.participation');
  assert.equal(options.agentId, 'main');
  assert.ok(!('tools' in options));
  for (const CommandBody of ['', 'a'.repeat(4001)])
    assert.equal((await make(async () => assert.fail('bounded')).evaluate(context({ CommandBody }))).action, 'silence');
});

test('invalid/uncertain/unavailable results and separate billing opt-out stay silent', async () => {
  for (const value of [undefined, { status: 'unavailable' }, answer(NaN, 1), answer(1, 2), answer(1, .7),
    { status: 'ok', result: { answers: { dutyRelevant: { type: 'boolean', probabilityTrue: 1 } } } }])
    assert.equal((await make(async () => value).evaluate(context())).action, 'silence');
  assert.equal((await make(async () => { throw Error('PRIVATE_ERROR'); }).evaluate(context())).action, 'silence');
  assert.equal((await make(async () => assert.fail('no paid opt-in'), { allowPaidJev: false }).evaluate(context())).action, 'silence');
});

test('timeout is bounded even when classifier ignores abort; explicit request still bypasses outage', async () => {
  const gate = make(async () => new Promise(() => {}), { policy: { ...policy, timeoutMs: 100 } });
  const result = await gate.evaluate(context());
  assert.equal(result.action, 'silence');
  assert.equal(result.observation.failure, 'timeout');
  assert.equal((await gate.evaluate(context({ WasMentioned: true }))).action, 'native');
});

test('concurrent duplicate messages reserve once and cross-scope copies remain independent', async () => {
  let release, calls = 0;
  const gate = make(async () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const first = gate.evaluate(context());
  const duplicate = await gate.evaluate(context());
  assert.equal(duplicate.action, 'silence');
  assert.equal(duplicate.observation.reason, 'duplicate');
  release(answer(1, 1));
  assert.equal((await first).action, 'native');
  assert.equal(calls, 1);
  const other = { ...channel, channelId: 'COTHER01' };
  const multi = make(async () => { calls++; return answer(1, 1); }, { policy: { ...policy, channels: [channel, other] } });
  await multi.evaluate(context());
  await multi.evaluate(context({ NativeChannelId: other.channelId, ChatId: other.channelId }));
  assert.equal(calls, 3);
});

test('concurrency and dedupe state are bounded; process-local expiry/restart do not claim durable dedupe', async () => {
  const gate = make(async () => new Promise(() => {}));
  const pending = Array.from({ length: 4 }, (_, i) => gate.evaluate(context({ MessageSid: `pending-${i}` })));
  const overflow = await gate.evaluate(context({ MessageSid: 'overflow' }));
  assert.equal(overflow.observation.reason, 'capacity');
  gate.close();
  assert.ok((await Promise.all(pending)).every(result => result.action === 'silence'));
  let now = 0, calls = 0;
  const evaluate = async () => { calls++; return answer(0, 1); };
  const expiring = make(evaluate, { clock: () => now });
  await expiring.evaluate(context());
  assert.equal((await expiring.evaluate(context())).observation.reason, 'duplicate');
  now = 300001;
  assert.equal((await expiring.evaluate(context())).action, 'native');
  expiring.close();
  assert.equal((await make(evaluate).evaluate(context())).action, 'native');
  assert.equal(calls, 3, 'a new process-local instance intentionally has no durable replay claim');
});

test('classifier rate stays bounded for one scope and timed-out calls hold capacity until settlement', async () => {
  let now = 0, calls = 0;
  const gate = make(async () => { calls++; return answer(0, 1); }, { clock: () => now });
  for (let i = 0; i < 12; i++) {
    assert.equal((await gate.evaluate(context({ MessageSid: `rate-${i}` }))).action, 'native');
  }
  assert.equal((await gate.evaluate(context({ MessageSid: 'limited' }))).observation.reason, 'rate-limit');
  assert.equal((await gate.evaluate(context({ WasMentioned: true }))).action, 'native');
  assert.equal(calls, 12);
  now = 60000;
  assert.equal((await gate.evaluate(context({ MessageSid: 'rate-reopened' }))).action, 'native');
  assert.equal(calls, 13);
  const stubborn = make(async () => new Promise(() => {}), { policy: { ...policy, timeoutMs: 100 } });
  await Promise.all(Array.from({ length: 4 }, (_, index) => stubborn.evaluate(context({ MessageSid: `timeout-${index}` }))));
  assert.equal((await stubborn.evaluate(context({ MessageSid: 'still-limited' }))).observation.reason, 'capacity');
  stubborn.close();
});

test('cancellation/disposal prevent late positive results and bound observation retention', async () => {
  const gate = make(async () => new Promise(() => {}));
  const pending = gate.evaluate(context());
  gate.close();
  assert.equal((await pending).action, 'silence');
  const controller = new AbortController(); controller.abort();
  assert.equal((await make().evaluate(context(), { signal: controller.signal })).action, 'silence');
  const observed = [];
  const bounded = make(undefined, { observe: item => observed.push(item) });
  for (let i = 0; i < 140; i++) await bounded.evaluate(context({ SenderIsBot: true }));
  assert.equal(bounded.observations().length, 128);
  assert.ok(!JSON.stringify(observed).includes('UALICE01'));
  assert.ok(!JSON.stringify(observed).includes(context().CommandBody));
  assert.deepEqual(Object.keys(observed[0]).sort(), ['classifierCalls', 'duty', 'elapsedMs', 'failure', 'helpfulness', 'reason', 'route', 'rule', 'trigger', 'version']);
});

test('policy validation is bounded and rejects unknown scope or authority fields', () => {
  assert.equal(validateParticipationPolicy().enabled, false);
  for (const extra of [{ channels: [] }, { channels: [{ ...channel, role: 'director' }] },
    { channels: [channel, channel] }, { duties: '' }, { timeoutMs: 1 }, { minProbability: .4 },
    { tools: ['exec'] }, { version: 'private content\n' }])
    assert.throws(() => validateParticipationPolicy({ ...policy, ...extra }), /router_participation_config_invalid/);
});

test('positive participation retains existing restricted-route, billing, manual and attachment boundaries', async () => {
  const route = (id, extra = {}) => ({ id, provider: 'fixture', gatewayModel: `fixture/${id}`,
    effort: 'high', billingSource: 'synthetic', billingMode: 'subscription', billingVerified: true,
    purpose: 'Capable work', contextWindow: 32768, maxTokens: 1024, ...extra });
  const config = { enabled: true, gateway: { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'TEST_GATEWAY_KEY' },
    routes: [route('general'), route('restricted', { access: 'admin-complex-coding' })], defaultRoute: 'general',
    decision: { allowPaidJev: true }, participation: policy };
  assert.equal(validateRouterConfig(config).participation.enabled, true);
  assert.ok(!Object.hasOwn(validateRouterConfig({ enabled: false }), 'participation'));
  const ctx = { runId: 'synthetic-routing', sessionId: 'synthetic-session', agentId: 'main',
    sessionKey: context().SessionKey, modelProviderId: 'rein-magpie', modelId: 'auto',
    channel: 'slack', accountId: 'default', senderId: 'UALICE01', chatId: 'CFIXTURE1', trigger: 'user' };
  let calls = 0;
  const router = createRouter({ config, decisions: { evaluate: async batch => {
    calls++;
    assert.deepEqual(batch.state.availableRoutes.map(item => item.id), ['general']);
    return { status: 'ok', result: { answers: { route: { type: 'choice', choice: 'restricted',
      probabilities: { restricted: 1 } }, task: { type: 'choice', choice: 'coding', probabilities: { coding: 1 } },
      contextIndependent: { type: 'boolean', probabilityTrue: 1 } } } };
  } } });
  assert.equal((await make().evaluate(context())).action, 'native');
  assert.equal((await router.beforeModelResolve({ prompt: context().CommandBody }, ctx)).modelOverride, 'general');
  assert.equal(calls, 1);
  assert.equal(await router.beforeModelResolve({ prompt: 'manual' }, { ...ctx, runId: 'manual', modelId: 'general' }), undefined);
  assert.equal((await router.beforeModelResolve({ prompt: 'attachment', attachments: [{ kind: 'image' }] },
    { ...ctx, runId: 'attachment' })).modelOverride, 'general');
  assert.equal(calls, 1, 'manual and attachment routing preserve native bypass');
  assert.throws(() => validateRouterConfig({ ...config, routes: [route('general', { billingMode: 'pay-as-you-go' })] }),
    /router_paid_usage_not_authorized/);
});

test('dispatcher adapter emits normal silence, preserves native fallthrough and skips tail continuations', async () => {
  const gate = make(async () => answer(1, 0));
  const effects = [];
  const host = { dispatcher: { getQueuedCounts: () => ({ tool: 0, block: 0, final: 0 }) },
    recordProcessed: (...args) => effects.push(args), markIdle: value => effects.push(value) };
  assert.deepEqual(await gate.replyDispatch({ ctx: context() }, host),
    { handled: true, queuedFinal: false, counts: { tool: 0, block: 0, final: 0 } });
  assert.equal(await gate.replyDispatch({ ctx: context({ WasMentioned: true }) }, host), undefined);
  assert.equal(await gate.replyDispatch({ ctx: context(), isTailDispatch: true }, host), undefined);
  assert.equal(effects.length, 2);
});

test('Router package ships the participation module required by its entry and validator', async () => {
  const root = new URL('../plugins/rein-router/', import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.ok(pkg.files.includes('slack-participation.mjs'));
  for (const file of ['index.ts', 'policy.mjs'])
    assert.match(await readFile(new URL(file, root), 'utf8'), /from '\.\/slack-participation\.mjs'/);
  const manifest = JSON.parse(await readFile(new URL('openclaw.plugin.json', root), 'utf8'));
  assert.equal(manifest.configSchema.properties.participation.additionalProperties, false);
});
