// Native dispatch feasibility proof. Synthetic Slack facts; no network or model calls.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PluginInstance } from '../../vendor/openclaw/src/plugins/plugin-instance.js';
import { bindPluginInstanceModuleLoader } from '../../vendor/openclaw/src/plugins/plugin-instance-module-loader.js';
import { buildChannelInboundEventContext } from '../../vendor/openclaw/src/plugin-sdk/channel-inbound.js';
import { createPluginRecord, createPluginRegistry, createPluginRuntimeMock,
  disposePluginRegistryInstances, initializeGlobalHookRunner, resetPluginRuntimeStateForTest,
  setActivePluginRegistry } from '../../vendor/openclaw/src/plugin-sdk/plugin-test-runtime.js';
import { withPluginRuntimeRegistryScope } from '../../vendor/openclaw/src/plugins/runtime/gateway-request-scope.js';
import { createOpenClawTestState } from '../../vendor/openclaw/src/test-utils/openclaw-test-state.js';
import { dispatchReplyFromConfig } from '../../vendor/openclaw/src/auto-reply/reply/dispatch-from-config.js';
import { withFullRuntimeReplyConfig } from '../../vendor/openclaw/src/auto-reply/reply/get-reply-fast-path.js';
import { createReplyDispatcher } from '../../vendor/openclaw/src/auto-reply/reply/reply-dispatcher.js';
import { hasControlCommand } from '../../vendor/openclaw/src/plugin-sdk/command-detection.js';
import { isAbortRequestText } from '../../vendor/openclaw/src/plugin-sdk/command-primitives-runtime.js';
import { createSlackParticipation } from '../../plugins/rein-router/slack-participation.mjs';
import { registerSessionBindingAdapter, unregisterSessionBindingAdapter } from '../../vendor/openclaw/src/infra/outbound/session-binding-service.js';
import { resolveRuntimeConversationBindingRouteAsync } from '../../vendor/openclaw/src/channels/plugins/binding-routing.js';

const state = await createOpenClawTestState({ label: 'slack-participation', env: { OPENCLAW_TEST_FAST: '0' } });
const registry = createPluginRegistry({ logger: { info() {}, warn() {}, error() {}, debug() {} },
  runtime: createPluginRuntimeMock(), activateGlobalSideEffects: false });
const receiptPlugin = new PluginInstance('rein-router');
let adapter;
try {
  const cfg = withFullRuntimeReplyConfig({ channels: { slack: { botToken: 'xoxb-synthetic-ack' } }, agents: { defaults: { workspace: state.workspaceDir,
    skipBootstrap: true, model: { primary: 'mock-openai/synthetic' },
    models: { 'mock-openai/synthetic': { agentRuntime: { id: 'openclaw' } } } } },
    plugins: { enabled: true, allow: ['participation-proof'], entries: { 'participation-proof': { enabled: true } } } });
  await state.writeConfig(cfg);
  const plugin = createPluginRecord({ id: 'participation-proof', origin: 'bundled',
    source: state.path('participation-proof/index.ts'), status: 'loaded' });
  const api = registry.createApi(plugin, { config: cfg });
  registry.registry.plugins.push(plugin);
  let claims = 0, hooks = 0, workers = 0, starts = 0, sends = 0;
  let helpful = 0;
  const classifierText: string[] = [];
  const pluginRoot = new URL('../../plugins/rein-router/', import.meta.url);
  const ackModule = fileURLToPath(new URL('slack-participation-ack.ts', pluginRoot));
  bindPluginInstanceModuleLoader({ instance: receiptPlugin, origin: 'config', rootDir: fileURLToPath(pluginRoot),
    source: fileURLToPath(new URL('index.ts', pluginRoot)), pluginSdkResolution: 'dist' });
  const { acknowledgeSlackParticipation } = receiptPlugin.loadModule(ackModule);
  const receipts: string[] = [];
  let acknowledgment: Promise<void> | undefined;
  const participation = createSlackParticipation({ policy: { enabled: true, duties: 'Help with deployments.',
    channels: [{ accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', agentId: 'main' }] },
    acknowledge: receipt => {
      receipts.push(receipt.messageId);
      acknowledgment = acknowledgeSlackParticipation(receipt, {
        info: message => receipts.push(message), warn: message => receipts.push(message),
      });
    },
    allowPaidJev: true, isNativeCommand: (text, cfg) => isAbortRequestText(text) || hasControlCommand(text ?? '', cfg),
    decisions: { evaluate: async request => {
      classifierText.push(request.state.currentMessage);
      return { status: 'ok', result: { answers: {
        dutyRelevant: { type: 'boolean', probabilityTrue: 0 }, helpful: { type: 'boolean', probabilityTrue: helpful } } } };
    } } });
  api.on('inbound_claim', () => { claims++; return { handled: true }; });
  api.on('reply_dispatch', (event, context) => {
    hooks++;
    assert.equal(event.ctx.GroupSpace, 'TFIXTURE1');
    assert.equal(event.ctx.SenderId, 'UALICE01');
    assert.equal(event.ctx.WasMentioned, false);
    assert.equal(event.ctx.AccountId, 'default');
    assert.equal(event.ctx.AgentId, 'main');
    assert.equal(event.ctx.NativeChannelId, 'CFIXTURE1');
    assert.equal(event.ctx.ChatId, 'CFIXTURE1');
    assert.equal(event.ctx.InboundAccessAuthorized, true);
    return participation.replyDispatch(event, context);
  }, { eligibleDispatchKinds: ['agent', 'acp'] });
  setActivePluginRegistry(registry.registry);
  initializeGlobalHookRunner(registry.registry);
  const ctx = buildChannelInboundEventContext({ channel: 'slack', accountId: 'default',
    messageId: '1000.001', from: 'slack:channel:CFIXTURE1', sender: { id: 'UALICE01' },
    conversation: { kind: 'channel', id: 'CFIXTURE1', nativeChannelId: 'CFIXTURE1', spaceId: 'TFIXTURE1' },
    route: { agentId: 'main', accountId: 'default', routeSessionKey: 'agent:main:slack:channel:cfixture1' },
    reply: { to: 'channel:CFIXTURE1', nativeChannelId: 'CFIXTURE1' },
    message: { rawBody: 'ordinary passive message', inboundHistory: Array.from({ length: 6 }, (_, i) => ({
      sender: 'UALICE01', body: 'previous message ' + i, messageId: '999.00000' + i,
    })) },
    access: { mentions: { canDetectMention: true, wasMentioned: false, requireMention: false } } });
  const dispatcher = createReplyDispatcher({ deliver: async () => { sends++; } });
  const result = await withPluginRuntimeRegistryScope(registry.registry, () => dispatchReplyFromConfig({
    ctx, cfg, dispatcher, replyResolver: async () => { workers++; return { text: 'unexpected worker' }; },
    replyOptions: { onReplyStart: () => { starts++; } } }));
  dispatcher.markComplete();
  await dispatcher.waitForIdle();
  assert.equal(claims, 0, 'ordinary ingress does not call global inbound_claim');
  assert.equal(hooks, 1);
  assert.equal(workers, 0);
  assert.equal(starts, 0);
  assert.equal(sends, 0);
  assert.equal(result.queuedFinal, false);
  assert.equal(participation.observations().at(-1)?.reason, 'passive');
  assert.equal(participation.observations().at(-1)?.contextMessages, 5);
  console.log('PASS: native agent reply_dispatch silently handles ordinary Slack ingress before worker/lifecycle; global inbound_claim is not invoked.');
  const restricted = buildChannelInboundEventContext({ channel: 'slack', accountId: 'default',
    messageId: '1000.002', from: 'slack:channel:CFIXTURE1', sender: { id: 'UALICE01' },
    conversation: { kind: 'channel', id: 'CFIXTURE1', nativeChannelId: 'CFIXTURE1', spaceId: 'TFIXTURE1' },
    route: { agentId: 'main', accountId: 'default', routeSessionKey: 'agent:main:slack:channel:cfixture1' },
    reply: { to: 'channel:CFIXTURE1', nativeChannelId: 'CFIXTURE1' },
    message: { rawBody: 'passive restricted turn' },
    access: { mentions: { canDetectMention: true, wasMentioned: false, requireMention: false } } });
  const restrictedDispatcher = createReplyDispatcher({ deliver: async () => { sends++; } });
  await withPluginRuntimeRegistryScope(registry.registry, () => dispatchReplyFromConfig({ ctx: restricted,
    cfg, dispatcher: restrictedDispatcher,
    replyResolver: async () => { workers++; return undefined; },
    replyOptions: { admittedSessionSettings: { permissionMode: 'guarded' } } }));
  restrictedDispatcher.markComplete();
  await restrictedDispatcher.waitForIdle();
  assert.equal(hooks, 1, 'native suppresses the participation hook for restricted runtime settings');
  assert.equal(workers, 1, 'restricted agent dispatch can start a worker without the participation hook');
  console.log('PASS: out-of-scope guarded gateway options bypass reply_dispatch and start worker; Slack native producer does not supply these options.');
  const acp = buildChannelInboundEventContext({ channel: 'slack', accountId: 'default',
    messageId: '1000.003', from: 'slack:channel:CFIXTURE1', sender: { id: 'UALICE01' },
    conversation: { kind: 'channel', id: 'CFIXTURE1', nativeChannelId: 'CFIXTURE1', spaceId: 'TFIXTURE1' },
    route: { agentId: 'main', accountId: 'default', routeSessionKey: 'agent:main:acp:fixture' },
    reply: { to: 'channel:CFIXTURE1', nativeChannelId: 'CFIXTURE1' },
    message: { rawBody: 'passive ACP turn' },
    access: { mentions: { canDetectMention: true, wasMentioned: false, requireMention: false } } });
  const acpDispatcher = createReplyDispatcher({ deliver: async () => { sends++; } });
  const acpResult = await withPluginRuntimeRegistryScope(registry.registry, () => dispatchReplyFromConfig({
    ctx: acp, cfg, dispatcher: acpDispatcher,
    replyResolver: async () => { workers++; return { text: 'unexpected ACP worker' }; } }));
  acpDispatcher.markComplete(); await acpDispatcher.waitForIdle();
  assert.equal(hooks, 2);
  assert.equal(workers, 1, 'ACP passive turn never starts its worker');
  assert.equal(acpResult.queuedFinal, false);
  assert.equal(participation.observations().at(-1)?.reason, 'passive');
  console.log('PASS: native ACP reply_dispatch applies the same passive silence before worker dispatch.');
  const conversation = { channel: 'slack', accountId: 'default', conversationId: 'CFIXTURE1' };
  const binding = { bindingId: 'proof-binding', boundAt: 1, status: 'active' as const,
    targetKind: 'session' as const, targetSessionKey: 'plugin-binding:fixture:one', conversation,
    metadata: { pluginBindingOwner: 'plugin', pluginId: 'participation-proof', pluginRoot: state.path('participation-proof') } };
  adapter = { channel: 'slack', accountId: 'default', listBySession: () => [binding],
    inspectByConversation: () => binding, inspectByConversationAsync: async () => binding,
    resolveByConversation: () => binding, resolveByConversationAsync: async () => binding,
    touchAsync: async () => {} };
  registerSessionBindingAdapter(adapter);
  const routed = await resolveRuntimeConversationBindingRouteAsync({ conversation,
    route: { agentId: 'main', channel: 'slack', accountId: 'default',
      sessionKey: 'agent:main:slack:channel:cfixture1', mainSessionKey: 'agent:main:main',
      lastRoutePolicy: 'session', matchedBy: 'default' } });
  const bound = buildChannelInboundEventContext({ channel: 'slack', accountId: 'default',
    messageId: '1000.004', from: 'slack:channel:CFIXTURE1', sender: { id: 'UALICE01' },
    conversation: { kind: 'channel', id: 'CFIXTURE1', nativeChannelId: 'CFIXTURE1', spaceId: 'TFIXTURE1' },
    route: { ...routed.route, routeSessionKey: routed.route.sessionKey },
    reply: { to: 'channel:CFIXTURE1', nativeChannelId: 'CFIXTURE1' },
    message: { rawBody: 'passive plugin-owned turn' },
    access: { mentions: { canDetectMention: true, wasMentioned: false, requireMention: false } } });
  const boundDispatcher = createReplyDispatcher({ deliver: async () => { sends++; } });
  await withPluginRuntimeRegistryScope(registry.registry, () => dispatchReplyFromConfig({ ctx: bound,
    cfg, dispatcher: boundDispatcher,
    replyResolver: async () => { workers++; return undefined; } }));
  boundDispatcher.markComplete(); await boundDispatcher.waitForIdle();
  assert.equal(claims, 1, 'owning plugin claim executes before participation');
  assert.equal(hooks, 2, 'reply_dispatch never sees plugin-owned claimed turns');
  console.log('PASS: native plugin-owned binding gap reproduced: owner claim runs before participation reply_dispatch.');
  unregisterSessionBindingAdapter({ channel: 'slack', accountId: 'default', adapter });
  adapter = undefined;
  helpful = 1;
  const positive = buildChannelInboundEventContext({ channel: 'slack', accountId: 'default',
    messageId: '1000.005', from: 'slack:channel:CFIXTURE1', sender: { id: 'UALICE01' },
    conversation: { kind: 'channel', id: 'CFIXTURE1', nativeChannelId: 'CFIXTURE1', spaceId: 'TFIXTURE1',
      threadId: '900.001' },
    route: { agentId: 'main', accountId: 'default', routeSessionKey: 'agent:main:slack:channel:cfixture1' },
    reply: { to: 'channel:CFIXTURE1', nativeChannelId: 'CFIXTURE1', messageThreadId: '900.001' },
    message: { rawBody: 'useful clarification\nPRIVATE_ATTACHMENT_TEXT', commandBody: 'useful clarification' },
    media: [{ path: '/tmp/nori-fixture-image.png', contentType: 'image/png' }],
    access: { mentions: { canDetectMention: true, wasMentioned: false, requireMention: false } } });
  assert.equal(positive.media?.[0]?.path, '/tmp/nori-fixture-image.png');
  assert.deepEqual(receipts, [], 'silent dispatches never start a receipt');
  const slackRequests: { url: string; body: URLSearchParams }[] = [];
  let response: { ok: boolean; error?: string } = { ok: true };
  const originalFetch = globalThis.fetch;
  process.env.SLACK_API_URL = 'http://127.0.0.1:1/api/';
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    slackRequests.push({ url: req.url, body: new URLSearchParams(await req.text()) });
    return Response.json(response);
  };
  const positiveDispatcher = createReplyDispatcher({ deliver: async () => { sends++; } });
  await withPluginRuntimeRegistryScope(registry.registry, () => dispatchReplyFromConfig({
    ctx: positive, cfg, dispatcher: positiveDispatcher, replyResolver: async ctx => {
      workers++;
      assert.equal(receipts[0], '1000.005', 'start the receipt before worker resolution');
      assert.equal(ctx.media?.[0]?.path, '/tmp/nori-fixture-image.png');
      assert.equal(ctx.MessageThreadId, '900.001');
      return undefined;
    },
  }));
  positiveDispatcher.markComplete();
  await positiveDispatcher.waitForIdle();
  await acknowledgment;
  assert.deepEqual(receipts, ['1000.005', 'rein_router_participation_ack sent channel=CFIXTURE1 message=1000.005']);
  assert.equal(slackRequests.length, 1);
  assert.equal(slackRequests[0].url, 'http://127.0.0.1:1/api/reactions.add');
  assert.equal(slackRequests[0].body.get('channel'), 'CFIXTURE1');
  assert.equal(slackRequests[0].body.get('timestamp'), '1000.005');
  assert.equal(slackRequests[0].body.get('name'), 'eyes');
  const receipt = { scope: participation.policy.channels[0], messageId: '1000.006', isActive: () => true, cfg };
  const logger = { info: message => receipts.push(message), warn: message => receipts.push(message) };
  for (const messages of [{ ackReactionScope: 'off' }, { ackReactionScope: 'group-all' },
    { ackReaction: '' }, { removeAckAfterReply: true }, { statusReactions: { enabled: true } }])
    await acknowledgeSlackParticipation({ ...receipt, cfg: { ...cfg, messages } }, logger);
  assert.equal(slackRequests.length, 1);
  response = { ok: false, error: 'missing_scope' };
  await acknowledgeSlackParticipation(receipt, logger);
  assert.equal(receipts.at(-1), 'rein_router_participation_ack failed channel=CFIXTURE1 message=1000.006 reason=missing_scope');
  globalThis.fetch = originalFetch;
  delete process.env.SLACK_API_URL;
  assert.equal(workers, 2);
  assert.equal(classifierText.at(-1), 'useful clarification');
  assert.equal(participation.observations().at(-1)?.duty, 'no');
  console.log('PASS: positive out-of-duty decision reaches native worker resolver with thread and attachment facts.');
  const callsBeforeStop = classifierText.length;
  assert.equal((await participation.evaluate({ ...positive, CommandBody: '暂停' }, { cfg })).action, 'native');
  assert.equal(classifierText.length, callsBeforeStop, 'native text abort bypasses classification');
  participation.close();
} finally {
  if (adapter) unregisterSessionBindingAdapter({ channel: 'slack', accountId: 'default', adapter });
  await disposePluginRegistryInstances(registry.registry);
  resetPluginRuntimeStateForTest();
  await receiptPlugin.dispose();
  await state.cleanup();
}
