// Synthetic transport/backend only. Loaded exclusively by verify-director-acp.mjs.
import { writeFileSync } from 'node:fs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { registerAcpRuntimeBackend, unregisterAcpRuntimeBackend, tryDispatchAcpReplyHook } from 'openclaw/plugin-sdk/acp-runtime-backend';

const channelId = 'CFIXTURE1', workspaceId = 'TFIXTURE1', agentId = 'director-control';
const stateKey = Symbol.for('rein.director-acp.fixture');
const state = process[stateKey] ??= { sent: [], results: [], progress: [], turns: [], contexts: [] };
if (!state.finished) state.finished = new Promise(resolve => { state.release = resolve; });
const { sent, results, progress, turns, contexts, finished } = state;
const release = () => state.release();
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const value = String(url);
  if (!value.startsWith('https://slack.com/api/')) return originalFetch(url, opts);
  const body = {
    'auth.test': { team_id: workspaceId, user_id: 'UBOT0001', bot_id: 'BBOT0001' },
    'conversations.info': { channel: { id: channelId, context_team_id: workspaceId, is_private: true, is_member: true, is_archived: false, is_im: false, is_mpim: false } },
    'conversations.members': { members: ['UDIRECT1', 'UCONTRIB1'] },
  }[value.split('/').at(-1)];
  if (!body) throw Error('Unexpected synthetic Slack API request');
  return Promise.resolve(Response.json({ ok: true, ...body }));
};
export default definePluginEntry({
  id: 'rein-acp-probe', name: 'Synthetic Director ACP probe',
  register(api) {
    api.registerService({ id: 'rein-acp-fixture', start() {
      registerAcpRuntimeBackend({ id: 'rein-acp-fixture', healthy: () => true, runtime: {
        async ensureSession(input) { return { sessionKey: input.sessionKey, backend: 'rein-acp-fixture', runtimeSessionName: input.sessionKey, cwd: input.cwd }; },
        getCapabilities() { return { controls: ['session/set_config_option', 'session/set_mode', 'session/status'] }; },
        async setConfigOption() {}, async setMode() {}, async getStatus() { return { summary: 'synthetic fixture ready' }; },
        async *runTurn(input) {
          turns.push(input.text);
          yield { type: 'status', text: 'ACP_FIXTURE_RUNNING', tag: 'agent_message' };
          await finished;
          yield { type: 'text_delta', text: 'ACP_FIXTURE_DONE: tiny task completed; synthetic check passed.' };
          yield { type: 'done', stopReason: 'end_turn' };
        },
        async cancel() { release(); }, async close() {},
      } });
    }, stop() { release(); unregisterAcpRuntimeBackend('rein-acp-fixture'); globalThis.fetch = originalFetch; } });
    api.on('reply_dispatch', tryDispatchAcpReplyHook, { eligibleDispatchKinds: ['acp'] });
    api.on('before_agent_run', (_event, ctx) => { contexts.push({ agentId: ctx.agentId, channel: ctx.channel, chatId: ctx.chatId, senderId: ctx.senderId, trigger: ctx.trigger, inputProvenance: ctx.inputProvenance }); });
    api.on('before_tool_call', (event, ctx) => { contexts.push({ tool: event.toolName, runId: ctx.runId, agentId: ctx.agentId, sessionKey: ctx.sessionKey, requester: ctx.requester }); }, { priority: 300 });
    api.on('subagent_progress', event => { progress.push(event); });
    api.on('after_tool_call', event => {
      if (!['sessions_spawn', 'subagents'].includes(event.toolName)) return;
      results.push({ name: event.toolName, result: event.result, error: event.error });
      if (event.toolName === 'subagents') release();
    });
    api.registerChannel({ id: 'slack', meta: { id: 'slack', label: 'Synthetic Slack', selectionLabel: 'Synthetic Slack', docsPath: '/channels/slack', blurb: 'Local ACP probe' },
      capabilities: { chatTypes: ['channel'], media: false, nativeCommands: false },
      config: { listAccountIds: () => ['default'], resolveAccount: () => ({ accountId: 'default', enabled: true }), isEnabled: () => true, isConfigured: () => true },
      outbound: { deliveryMode: 'direct', async sendText({ to, text, threadId }) { sent.push({ to, text, threadId, background: true }); return { channel: 'slack', messageId: `fixture-${sent.length}` }; } },
      gateway: { async startAccount(ctx) {
        const runtime = ctx.channelRuntime;
        let error;
        try {
          for (const [i, item] of [
            { sender: 'UCONTRIB1', text: 'ACP_DENIED_TASK' },
            { sender: 'UDIRECT1', text: 'ACP_START_TASK' },
            { sender: 'UDIRECT1', text: 'ACP_QUERY_STATUS' },
          ].entries()) {
            const sessionKey = `agent:${agentId}:slack:channel:fixture-${item.sender.toLowerCase()}`;
            const messageId = `fixture-${i}`, target = `channel:${channelId}`;
            const ingress = await runtime.inbound.ingress.resolveStable({ channelId: 'slack', accountId: 'default', cfg: ctx.cfg,
              identity: { key: 'slack-user-id', entryIdPrefix: 'rein-acp-fixture' }, subject: { stableId: item.sender },
              conversation: { kind: 'channel', id: channelId }, contextBinding: { agentId, sessionKey, nativeChannelId: channelId, messageId, inboundEventKind: 'user_request' },
              dmPolicy: 'disabled', groupPolicy: 'allowlist', groupAllowFrom: ['UDIRECT1', 'UCONTRIB1'] });
            const ctxPayload = runtime.inbound.buildContext({ channel: 'slack', accountId: 'default', channelIngress: ingress, messageId, timestamp: Date.now(),
              from: `slack:channel:${channelId}`, sender: { id: item.sender },
              conversation: { kind: 'channel', id: channelId, spaceId: workspaceId, nativeChannelId: channelId },
              route: { agentId, accountId: 'default', routeSessionKey: sessionKey, dispatchSessionKey: sessionKey },
              reply: { to: target, originatingTo: target, nativeChannelId: channelId, messageThreadId: '1000.001' },
              message: { rawBody: item.text, bodyForAgent: item.text, inboundEventKind: 'user_request' },
              command: { kind: 'normal', authorized: false }, access: { commands: { authorized: false }, mentions: { canDetectMention: true, wasMentioned: true } } });
            await runtime.inbound.dispatch({ cfg: ctx.cfg, channel: 'slack', accountId: 'default', route: { agentId, sessionKey }, ctxPayload, messageId,
              toolsAllow: ['sessions_spawn', 'subagents', 'apply_patch', 'edit', 'exec', 'process', 'read', 'write'], replyOptions: { abortSignal: ctx.abortSignal },
              delivery: { deliver: async payload => { if (payload.text) sent.push({ text: payload.text, sender: item.sender }); return { visibleReplySent: Boolean(payload.text) }; }, onError: e => { throw e; } } });
          }
          const deadline = Date.now() + 25000;
          while (!sent.some(item => item.text.includes('ACP_FINAL_REPORT')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) { error = String(e); }
        finally { release(); writeFileSync(process.env.REIN_ACP_PROBE_EVIDENCE, JSON.stringify({ error, sent, results, progress, turns, contexts })); }
        await new Promise(resolve => { if (ctx.abortSignal.aborted) resolve(); else ctx.abortSignal.addEventListener('abort', resolve, { once: true }); });
      } },
    });
  },
});
