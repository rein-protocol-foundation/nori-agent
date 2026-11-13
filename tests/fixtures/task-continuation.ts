// Synthetic Slack/model only. Lifecycle, task flows, state, wakes and tools are native.
import { appendFileSync } from 'node:fs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

const record = (kind, value = {}) => appendFileSync(process.env.CONTINUATION_EVIDENCE!, JSON.stringify({ kind, phase: process.env.CONTINUATION_PHASE, ...value }) + '\n');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target.startsWith('https://slack.com/api/')) {
    const body = {
      'auth.test': { team_id: 'TFIXTURE1', user_id: 'UBOT0001', bot_id: 'BBOT0001' },
      'conversations.info': { channel: { id: 'CFIXTURE1', context_team_id: 'TFIXTURE1', is_private: true, is_member: true, is_archived: false, is_im: false, is_mpim: false } },
      'conversations.members': { members: ['UALICE01', 'UBOB0001'] },
    }[target.split('/').at(-1)!];
    if (!body) throw Error('Unexpected synthetic Slack API');
    return Response.json({ ok: true, ...body });
  }
  if (new URL(target).hostname !== '127.0.0.1') throw Error('External fixture request refused');
  return originalFetch(url, options);
};

export default definePluginEntry({ id: 'task-continuation-fixture', name: 'Native continuation seam fixture', register(api) {
  // Negative assertion, never a storage fallback. Local plugin trust remains unchanged.
  try {
    api.runtime.state.openKeyedStore({ namespace: 'continuation-seam', maxEntries: 8, overflowPolicy: 'reject-new' });
    throw Error('Expected local keyed-store trust refusal');
  } catch (error) {
    if (error?.code !== 'PLUGIN_TRUST_REFUSED') throw error;
    record('keyed-store-refused', { code: error.code, message: error.message });
  }
  // Fixed synthetic inventory configured by the probe, not production owner discovery.
  const owner = process.env.CONTINUATION_OWNER!;
  if (owner !== 'agent:main:slack:default:channel:cfixture1') throw Error('Unexpected synthetic owner inventory');
  const controllerId = 'rein/continuation-seam';
  const ownFlows = async () => (await api.runtime.tasks.async.managedFlows.bindSession({ sessionKey: owner }).list()).filter(f => f.controllerId === controllerId);
  let latestSpawn;
  api.on('before_agent_run', (event, ctx) => { record('run', { ctx, prompt: event.prompt }); });
  api.on('before_prompt_build', (_event, ctx) => {
    record('authority', { runId: ctx.runId, sessionKey: ctx.sessionKey, provenance: ctx.inputProvenance,
      tools: ['sessions_spawn', 'rein_task', 'continuation_probe', 'exec'].filter(name => ctx.toolAuthority?.allows(name)) });
  }, { requiresToolAuthority: true });
  api.on('after_tool_call', (event, ctx) => {
    if (event.toolName === 'sessions_spawn' && event.result?.details?.status === 'accepted') latestSpawn = event.result.details;
    record('tool', { event, runId: ctx.runId, sessionKey: ctx.sessionKey });
    if (event.error) record('fixture-error', { error: event.error, toolName: event.toolName });
  });
  api.on('agent_end', (event, ctx) => { record('agent-ended', { runId: ctx.runId, sessionKey: ctx.sessionKey, success: event.success }); });
  api.on('llm_input', (event, ctx) => { record('model-input', { runId: ctx.runId, sessionKey: ctx.sessionKey,
    hasChildResult: JSON.stringify([event.prompt, event.historyMessages]).includes('CONTINUATION_CHILD_RESULT') }); });
  api.on('subagent_ended', (event, ctx) => { record('child-ended', { event, ctx }); });
  api.registerTool({ contextVersion: 2, create(ctx) { return {
    name: 'continuation_probe', label: 'Continuation fixture probe', description: 'Native seam fixture observations only.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['prepare', 'observe', 'link', 'hold'] }, probeKey: { type: 'string', enum: ['a', 'b'] } }, required: ['action'], additionalProperties: false },
    async execute(_id, args) {
      ctx.assertInvocationCurrent();
      if (ctx.sessionKey !== owner) throw Error('Probe tool outside configured synthetic owner');
      if (args.action === 'hold') {
        record('holding', { sessionKey: ctx.sessionKey });
        if (!latestSpawn?.runId) throw Error('No accepted child for active handoff');
        const settled = await api.runtime.subagent.waitForRun({ runId: latestSpawn.runId, timeoutMs: 15000 });
        if (!['ok', 'error'].includes(settled.status) || !settled.endedAt) throw Error('Child did not settle');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (args.action === 'prepare') {
        const origin = ctx.deliveryContext;
        if (!origin?.threadId || !ctx.requesterSenderId) throw Error('Missing real ingress route');
        const flows = api.runtime.tasks.async.managedFlows.fromToolContext(ctx);
        const flow = await flows.createManaged({ controllerId, goal: 'Eligibility research', stateJson: { probeKey: args.probeKey ?? 'a', goal: 'Eligibility research', criteria: 'Find eligibility', scopeRevision: 1, attempts: 0 } });
        const waiting = await flows.setWaiting({ flowId: flow.flowId, expectedRevision: flow.revision, stateJson: flow.stateJson, waitJson: { reason: 'review-needed' } });
        if (!waiting.applied) throw Error('Flow waiting persistence refused');
        record('prepared', { sessionKey: ctx.sessionKey, flowId: flow.flowId, origin, flow: waiting.flow });
      }
      const flow = (await ownFlows()).find(f => f.stateJson?.probeKey === (args.probeKey ?? 'a'));
      if (!flow) throw Error('Native probe flow absent');
      if (args.action === 'link') {
        if (!latestSpawn?.runId) throw Error('No real accepted native child');
        const runs = api.runtime.tasks.async.runs.fromToolContext(ctx);
        const before = await runs.list(), canonical = await runs.resolve(latestSpawn.runId);
        if (!canonical || canonical.ownerKey !== ctx.sessionKey || canonical.runId !== latestSpawn.runId || canonical.childSessionKey !== latestSpawn.childSessionKey) throw Error('Canonical native backing unavailable');
        const linked = await api.runtime.tasks.async.managedFlows.fromToolContext(ctx).runTask({ flowId: flow.flowId,
          runtime: canonical.runtime, sourceId: canonical.sourceId, runId: canonical.runId, childSessionKey: canonical.childSessionKey,
          agentId: canonical.agentId, task: canonical.title, status: canonical.status, startedAt: canonical.startedAt,
          lastEventAt: canonical.lastEventAt, progressSummary: canonical.progressSummary });
        const after = await runs.list(), retainedCanonical = await runs.get(canonical.id);
        record('linked', { flowId: flow.flowId, accepted: latestSpawn, canonical, linked, retainedCanonical, before, after });
        if (!linked.created || linked.task?.parentFlowId !== flow.flowId || linked.task.runId !== canonical.runId || linked.task.childSessionKey !== canonical.childSessionKey || retainedCanonical?.runId !== canonical.runId || retainedCanonical?.ownerKey !== owner) throw Error('Native child linkage refused or replaced backing identity');
      }
      record('observed', { action: args.action, sessionKey: ctx.sessionKey, requesterSenderId: ctx.requesterSenderId, flow });
      return { content: [{ type: 'text', text: JSON.stringify({ action: args.action, flowId: flow?.flowId, status: flow?.status }) }] };
    },
  }; } }, { names: ['continuation_probe'] });
  api.on('gateway_start', async (_event, ctx) => {
    record('startup');
    if (process.env.CONTINUATION_PHASE !== 'recover') return;
    const flows = await ownFlows();
    if (flows.length !== (process.env.CONTINUATION_CASE === 'coalesced' ? 2 : 1)) throw Error('Persisted synthetic flow inventory mismatch');
    record('recovered-inventory', { owner, configuredSyntheticInventory: true, flows });
    for (const flow of flows) {
      if (flow.status !== 'waiting' || !flow.requesterOrigin?.threadId) throw Error('Persisted waiting flow/origin absent');
      ctx.abortSignal?.throwIfAborted();
      const queued = api.runtime.system.enqueueSystemEvent(`CONTINUATION_RECOVERY flow=${flow.flowId} probe=${flow.stateJson?.probeKey}; recheck saved criteria before work.`, {
        sessionKey: owner, agentId: 'main', contextKey: `continuation:${flow.flowId}`, deliveryContext: flow.requesterOrigin,
      });
      record('wake-enqueued', { queued, owner, flow });
      api.runtime.system.requestHeartbeat({ source: 'background-task', intent: 'immediate', reason: 'continuation-recovery', agentId: 'main', sessionKey: owner });
    }
  });
  api.registerChannel({ id: 'slack', meta: { id: 'slack', label: 'Synthetic Slack continuation', selectionLabel: 'Synthetic Slack continuation', docsPath: '/channels/slack', blurb: 'Loopback only' },
    capabilities: { chatTypes: ['channel'], media: false, nativeCommands: false },
    config: { listAccountIds: () => ['default'], resolveAccount: (_cfg, accountId) => ({ accountId, enabled: true }), isEnabled: () => true, isConfigured: () => true },
    outbound: { deliveryMode: 'direct', async sendText({ to, text, threadId, accountId }) { record('sent', { to, text, threadId, accountId }); return { channel: 'slack', messageId: 'continuation-synthetic' }; } },
    gateway: { async startAccount(ctx) {
      if (process.env.CONTINUATION_PHASE === 'prepare') {
        const runtime = ctx.channelRuntime, agentId = 'main', accountId = 'default', channel = 'CFIXTURE1', sender = 'UALICE01';
        const sessionKey = owner;
        async function dispatch(text, thread) {
        const messageId = `continuation-${text}`;
        const ingress = await runtime.inbound.ingress.resolveStable({ channelId: 'slack', accountId, cfg: ctx.cfg,
          identity: { key: 'continuation-user', entryIdPrefix: 'continuation' }, subject: { stableId: sender }, conversation: { kind: 'channel', id: channel },
          contextBinding: { agentId, sessionKey, nativeChannelId: channel, messageId, inboundEventKind: 'user_request' }, dmPolicy: 'disabled', allowFrom: [], groupPolicy: 'allowlist', groupAllowFrom: [sender] });
        const payload = runtime.inbound.buildContext({ channel: 'slack', accountId, channelIngress: ingress, messageId, timestamp: Date.now(),
          from: `slack:channel:${channel}`, sender: { id: sender }, conversation: { kind: 'channel', id: channel, spaceId: 'TFIXTURE1', nativeChannelId: channel },
          route: { agentId, accountId, routeSessionKey: sessionKey, dispatchSessionKey: sessionKey },
          reply: { to: `channel:${channel}`, originatingTo: `channel:${channel}`, nativeChannelId: channel, messageThreadId: thread },
          message: { rawBody: text, bodyForAgent: text, inboundEventKind: 'user_request' }, command: { kind: 'normal', authorized: false },
          access: { commands: { authorized: false }, mentions: { canDetectMention: true, wasMentioned: true } } });
        await runtime.inbound.dispatch({ cfg: ctx.cfg, channel: 'slack', accountId, route: { agentId, sessionKey }, ctxPayload: payload, messageId,
          replyOptions: { abortSignal: ctx.abortSignal }, delivery: { deliver: async out => { record('intake-reply', { text: out.text, request: text, thread }); return { visibleReplySent: Boolean(out.text) }; }, onError: error => { throw error; } } });
        }
        await dispatch('CONTINUATION_INTAKE', '1000.001');
        if (process.env.CONTINUATION_CASE === 'coalesced') await dispatch('CONTINUATION_SECOND_INTAKE', '1000.002');
        await dispatch('CONTINUATION_OTHER', '1000.999');
        record('prepare-done');
      }
      await new Promise(resolve => { if (ctx.abortSignal.aborted) resolve(); else ctx.abortSignal.addEventListener('abort', resolve, { once: true }); });
    } },
  });
} });
