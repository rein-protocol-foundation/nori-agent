// Synthetic transport/model/ACP only; the Gateway, ingress, tools, tasks and completion are native.
import { writeFileSync, renameSync } from 'node:fs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { registerAcpRuntimeBackend, unregisterAcpRuntimeBackend, tryDispatchAcpReplyHook } from 'openclaw/plugin-sdk/acp-runtime';

const key = Symbol.for('rein.task-loop.fixture');
const state = process[key] ??= { tools: [], sent: [], runs: [], backend: [], membership: true, done: false };
const originalFetch = globalThis.fetch;
const releaseResearch = () => { state.researchReleased = true; save(); };
const holds = new Map();
function save() { const path = process.env.TASK_LOOP_EVIDENCE; writeFileSync(`${path}.next`, JSON.stringify(state)); renameSync(`${path}.next`, path); }
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target.startsWith('https://slack.com/api/')) {
    const replies = {
      'auth.test': { team_id: 'TFIXTURE1', user_id: 'UBOT0001', bot_id: 'BBOT0001' },
      'conversations.info': { channel: { id: 'CFIXTURE1', context_team_id: 'TFIXTURE1', is_private: true, is_member: true, is_archived: false, is_im: false, is_mpim: false } },
      'conversations.members': { members: state.membership ? ['UALICE01', 'UBOB0001'] : ['UALICE01'] },
    };
    const body = replies[target.split('/').at(-1)]; if (!body) throw Error('Unexpected synthetic Slack request');
    return Response.json({ ok: true, ...body });
  }
  const parsed = new URL(target); if (parsed.hostname !== '127.0.0.1') throw Error('External fixture request refused');
  return originalFetch(url, options);
};
export default definePluginEntry({ id: 'task-loop-task-fixture', name: 'Local Slack task-loop fixture', register(api) {
  api.registerService({ id: 'task-loop-acp-fixture', start() {
    registerAcpRuntimeBackend({ id: 'task-loop-acp-fixture', healthy: () => true, runtime: {
      async ensureSession(input) { return { sessionKey: input.sessionKey, backend: 'task-loop-acp-fixture', runtimeSessionName: input.sessionKey, cwd: input.cwd }; },
      getCapabilities() { return { controls: ['session/status', 'session/set_config_option', 'session/set_mode'] }; },
      async setConfigOption() {}, async setMode() {},
      async getStatus() { return { summary: 'synthetic native-auth stand-in; no real credentials' }; },
      async *runTurn(input) {
        state.backend.push({ event: 'start', session: input.handle.sessionKey, text: input.text }); save();
        const fail = input.text.includes('TASK_LOOP_ACP_FAIL'), slow = input.text.includes('TASK_LOOP_ACP_SLOW');
        let release; const finished = new Promise(resolve => { release = resolve; });
        holds.set(input.handle.sessionKey, { release, fail, slow });
        try {
          yield { type: 'status', text: 'Slack task loop synthetic ACP inspecting bounded coding task', tag: 'agent_message' };
          yield { type: 'text_delta', text: 'Synthetic partial artifact prepared; external send outcome uncertain (fixture only, no real action).\n' };
          // Keep replacement active until its real canonical native status is observed by the parent.
          await finished;
          yield { type: 'text_delta', text: 'TASK_LOOP_ACP_RESULT: synthetic coding result, validation passed; no real file edits.' };
          yield { type: 'done', stopReason: 'end_turn' };
        } finally { state.backend.push({ event: 'settled', session: input.handle.sessionKey }); holds.delete(input.handle.sessionKey); save(); }
      },
      async cancel({ handle }) {
        const hold = holds.get(handle.sessionKey); state.backend.push({ event: 'cancel', session: handle.sessionKey }); save();
        if (hold?.fail) throw Error('Slack task loop synthetic cancellation failure');
        // Intentionally acknowledge cancellation while runTurn still holds cleanup custody.
        if (!hold?.slow) hold?.release();
      },
      async close({ handle }) { state.backend.push({ event: 'close', session: handle.sessionKey }); save(); },
    } });
  }, stop() { for (const hold of holds.values()) hold.release(); releaseResearch(); unregisterAcpRuntimeBackend('task-loop-acp-fixture'); globalThis.fetch = originalFetch; } });
  api.on('reply_dispatch', tryDispatchAcpReplyHook, { eligibleDispatchKinds: ['acp'] });
  api.on('before_agent_run', (_event, ctx) => {
    state.runs.push({ runId: ctx.runId, sessionKey: ctx.sessionKey, modelProvider: ctx.modelProviderId, modelId: ctx.modelId, senderId: ctx.senderId, trigger: ctx.trigger, provenance: ctx.inputProvenance }); save();
  });
  api.on('after_tool_call', (event, ctx) => { state.tools.push({ name: event.toolName, params: event.params, result: event.result, error: event.error, runId: ctx.runId, sessionKey: ctx.sessionKey }); save(); });
  api.on('before_prompt_build', (_event, ctx) => { (state.capabilities ??= []).push({ runId: ctx.runId, sessionKey: ctx.sessionKey, tools: ['read', 'exec', 'sessions_spawn', 'rein_task'].filter(name => ctx.toolAuthority?.allows(name)) }); save(); }, { requiresToolAuthority: true });
  api.on('subagent_progress', event => { (state.progress ??= []).push(event); save(); });
  api.on('before_tool_call', (event, ctx) => { if (state.revokeOnTaskRead && (event.toolName === 'tool_call' ? event.params?.id : event.toolName)?.match(/sessions_(history|list)$/)) { state.membership = false; state.revokeOnTaskRead = false; } (state.contexts ??= []).push({ name: event.toolName, runId: ctx.runId, toolCallId: ctx.toolCallId, sessionKey: ctx.sessionKey, requester: ctx.requester }); save(); }, { priority: 300 });
  api.registerChannel({ id: 'slack', meta: { id: 'slack', label: 'Synthetic Slack task loop', selectionLabel: 'Synthetic Slack task loop', docsPath: '/channels/slack', blurb: 'Loopback only' },
    capabilities: { chatTypes: ['channel', 'direct'], media: false, nativeCommands: false },
    config: { listAccountIds: () => ['default', 'other'], resolveAccount: (_cfg, accountId) => ({ accountId, enabled: true }), isEnabled: () => true, isConfigured: () => true },
    outbound: { deliveryMode: 'direct', async sendText({ to, text, threadId }) { state.sent.push({ to, text, threadId, background: true }); save(); return { channel: 'slack', messageId: `task-loop-${state.sent.length}` }; } },
    gateway: { async startAccount(ctx) {
      if (ctx.accountId === 'other') { await new Promise(resolve => ctx.abortSignal.addEventListener('abort', resolve, { once: true })); return; }
      const waitFor = async (check, label, timeout = 30000) => { const end = Date.now() + timeout; while (!check()) { if (Date.now() > end) throw Error(`Slack task loop deadline: ${label}`); await new Promise(resolve => setTimeout(resolve, 50)); } };
      async function dispatch(text, { sender = 'UALICE01', channel = 'CFIXTURE1', account = 'default', thread = '1000.001', direct = false, separateThread = false } = {}) {
        if (direct) channel = 'DFIXTURE1';
        const kind = direct ? 'direct' : 'channel';
        const runtime = ctx.channelRuntime, agentId = 'main', sessionKey = `agent:main:slack:${account}:${kind}:${(direct ? sender : channel).toLowerCase()}${separateThread ? `:thread:${thread}` : ''}`;
        const messageId = `task-loop-${state.runs.length}-${text}`;
        (state.ingress ??= []).push({ text, sessionKey, thread, account, channel }); save();
        const ingress = await runtime.inbound.ingress.resolveStable({ channelId: 'slack', accountId: account, cfg: ctx.cfg,
          identity: { key: 'task-loop-user', entryIdPrefix: 'task-loop' }, subject: { stableId: sender }, conversation: { kind, id: channel },
          contextBinding: { agentId, sessionKey, nativeChannelId: channel, messageId, inboundEventKind: 'user_request' },
          dmPolicy: direct ? 'open' : 'disabled', allowFrom: direct ? ['*'] : [], groupPolicy: 'allowlist', groupAllowFrom: [sender] });
        const payload = runtime.inbound.buildContext({ channel: 'slack', accountId: account, channelIngress: ingress, messageId, timestamp: Date.now(),
          from: `slack:${kind}:${channel}`, sender: { id: sender }, conversation: { kind, id: channel, spaceId: 'TFIXTURE1', nativeChannelId: channel },
          route: { agentId, accountId: account, routeSessionKey: sessionKey, dispatchSessionKey: sessionKey },
          reply: { to: `${direct ? 'user' : 'channel'}:${direct ? sender : channel}`, originatingTo: `${direct ? 'user' : 'channel'}:${direct ? sender : channel}`, nativeChannelId: channel, messageThreadId: direct ? undefined : thread },
          message: { rawBody: text, bodyForAgent: text, inboundEventKind: 'user_request' },
          command: { kind: 'normal', authorized: false }, access: { commands: { authorized: false }, mentions: { canDetectMention: true, wasMentioned: true } } });
        await runtime.inbound.dispatch({ cfg: ctx.cfg, channel: 'slack', accountId: account, route: { agentId, sessionKey }, ctxPayload: payload, messageId,
          replyOptions: { abortSignal: ctx.abortSignal }, delivery: { deliver: async out => { if (out.text) state.sent.push({ text: out.text, request: text, channel, account, thread, sender }); save(); return { visibleReplySent: Boolean(out.text) }; }, onError: error => { throw error; } } });
      }
      try {
        await dispatch('TASK_LOOP_RESEARCH_START');
        await waitFor(() => state.tools.some(t => t.name === 'sessions_spawn' && t.result?.details?.status === 'accepted'), 'research admission');
        await dispatch('TASK_LOOP_UNRELATED_CHAT', { thread: '1000.999' });
        await dispatch('TASK_LOOP_RESEARCH_STATUS', { sender: 'UBOB0001' });
        for (const options of [{ channel: 'COTHER01' }, { account: 'other' }, { direct: true }, { thread: '1000.002', separateThread: true }])
          for (const tag of ['TASK_LOOP_FOREIGN_READ', 'TASK_LOOP_FOREIGN_STOP', 'TASK_LOOP_FOREIGN_CHANGE']) await dispatch(tag, options);
        for (const action of ['READ', 'CHANGE', 'STOP']) await dispatch(`TASK_LOOP_NONMEMBER_${action}`, { sender: 'UOUTSIDE1' });
        state.membership = false;
        for (const action of ['READ', 'CHANGE', 'STOP']) await dispatch(`TASK_LOOP_REVOKED_${action}`, { sender: 'UBOB0001' });
        state.membership = true;
        for (const tag of ['TASK_LOOP_MIDTURN_REVOKED_READ', 'TASK_LOOP_MIDTURN_REVOKED_LIST']) { state.revokeOnTaskRead = true; await dispatch(tag, { sender: 'UBOB0001' }); state.membership = true; save(); }
        releaseResearch();
        await waitFor(() => state.sent.some(s => s.text.includes('TASK_LOOP_SHORTLIST_FINAL')), 'original research delivery');
        await dispatch('TASK_LOOP_RESEARCH_CHANGE_START');
        await waitFor(() => state.runs.some(r => r.sessionKey === state.tools.find(t => t.params?.label === 'task-loop-research-change' && t.result?.details?.status === 'accepted')?.result.details.childSessionKey), 'research change child running');
        await dispatch('TASK_LOOP_RESEARCH_CHANGE', { sender: 'UBOB0001' });
        state.researchControlReleased = true; save();
        await dispatch('TASK_LOOP_RESEARCH_STOP_START');
        await waitFor(() => state.runs.some(r => r.sessionKey === state.tools.find(t => t.params?.label === 'task-loop-research-stop' && t.result?.details?.status === 'accepted')?.result.details.childSessionKey), 'research stop child running');
        await dispatch('TASK_LOOP_RESEARCH_STOP');
        state.researchStopReleased = true; save();
        await dispatch('TASK_LOOP_ACP_START');
        await waitFor(() => state.backend.some(s => s.event === 'start' && s.text.includes('TASK_LOOP_ACP_SLOW')), 'ACP start');
        await dispatch('TASK_LOOP_ACP_CHANGE_PENDING', { sender: 'UBOB0001' });
        for (const hold of holds.values()) if (hold.slow) hold.release();
        await waitFor(() => state.backend.some(s => s.event === 'settled'), 'ACP cleanup settlement');
        await dispatch('TASK_LOOP_ACP_CHANGE_SETTLED');
        await waitFor(() => state.backend.some(s => s.event === 'start' && s.text.includes('User-directed replacement')), 'replacement native admission');
        await dispatch('TASK_LOOP_ACP_REPLACEMENT_STATUS');
        for (const hold of holds.values()) if (!hold.fail && !hold.slow) hold.release();
        const replacement = state.tools.find(t => t.name === 'sessions_spawn' && t.params?.label === 'task-loop-acp-replacement' && t.result?.details?.status === 'accepted')?.result.details;
        await waitFor(() => state.sent.some(s => s.background && s.text.includes('TASK_LOOP_ACP_FINAL_REPORT') && s.text.includes(replacement.childSessionKey)), 'replacement ACP final result in original thread');
        await dispatch('TASK_LOOP_ACP_FAIL_START');
        await waitFor(() => state.backend.some(s => s.event === 'start' && s.text.includes('TASK_LOOP_ACP_FAIL')), 'failing ACP start');
        await dispatch('TASK_LOOP_ACP_CHANGE_FAILED');
        for (const hold of holds.values()) hold.release();
        state.done = true; save();
      } catch (error) { state.error = String(error); save(); }
      await new Promise(resolve => { if (ctx.abortSignal.aborted) resolve(); else ctx.abortSignal.addEventListener('abort', resolve, { once: true }); });
    } },
  });
} });
