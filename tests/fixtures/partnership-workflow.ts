// Synthetic Slack/Resend transport; real host ingress, command dispatch, plugin and Lobster.
import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

const evidencePath = process.env.PARTNERSHIP_EVIDENCE;
const state = process[Symbol.for('rein.partnership.fixture')] ??= (existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : { tools: [], sent: [], runs: [], mail: [], phases: [] });
const originalFetch = globalThis.fetch;
function save() { writeFileSync(`${evidencePath}.next`, JSON.stringify(state)); renameSync(`${evidencePath}.next`, evidencePath); }
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target.startsWith('https://slack.com/api/')) {
    const replies = {
      'auth.test': { team_id: 'TFIXTURE1', user_id: 'UBOT0001', bot_id: 'BBOT0001' },
      'conversations.info': { channel: { id: 'CFIXTURE1', context_team_id: 'TFIXTURE1', is_private: true, is_member: true, is_archived: false, is_im: false, is_mpim: false } },
      'conversations.members': { members: ['UALICE01', 'UBOB0001'] },
    };
    const body = replies[target.split('/').at(-1)]; if (!body) throw Error('Unexpected synthetic Slack request');
    return Response.json({ ok: true, ...body });
  }
  if (target === 'https://api.resend.com/emails' && options?.method === 'POST') {
    state.mail.push({ body: JSON.parse(options.body), key: new Headers(options.headers).get('Idempotency-Key') }); save();
    return Response.json({ id: 'fixture-receipt-1' });
  }
  if (target === 'https://api.resend.com/emails/fixture-receipt-1') {
    return Response.json({ id: 'fixture-receipt-1', ...state.mail[0]?.body, last_event: 'delivered' });
  }
  if (new URL(target).hostname !== '127.0.0.1') throw Error('External fixture request refused');
  return originalFetch(url, options);
};

export default definePluginEntry({ id: 'partnership-fixture', name: 'Synthetic partnership transport', register(api) {
  api.on('before_agent_run', (_event, ctx) => { state.runs.push({ runId: ctx.runId, sessionKey: ctx.sessionKey, trigger: ctx.trigger, senderId: ctx.senderId }); save(); });
  api.on('after_tool_call', (event, ctx) => { state.tools.push({ name: event.toolName, params: event.params, result: event.result, error: event.error, sessionKey: ctx.sessionKey }); save(); });
  api.registerChannel({ id: 'slack', meta: { id: 'slack', label: 'Synthetic partnership Slack', selectionLabel: 'Synthetic partnership Slack', docsPath: '/channels/slack', blurb: 'Loopback only' },
    capabilities: { chatTypes: ['channel'], media: false, nativeCommands: false },
    config: { listAccountIds: () => ['default'], resolveAccount: (_cfg, accountId) => ({ accountId, enabled: true }), isEnabled: () => true, isConfigured: () => true },
    outbound: { deliveryMode: 'direct', async sendText({ to, text, threadId }) { state.sent.push({ to, text, threadId, background: true }); save(); return { channel: 'slack', messageId: `partnership-${state.sent.length}` }; } },
    gateway: { async startAccount(ctx) {
      async function dispatch(text, { sender = 'UALICE01', channel = 'CFIXTURE1', thread = '1000.001' } = {}) {
        const account = 'default', agentId = 'main', sessionKey = `agent:main:slack:${account}:channel:${channel.toLowerCase()}`;
        const runtime = ctx.channelRuntime, messageId = `partnership-${Date.now()}-${state.sent.length}`;
        const ingress = await runtime.inbound.ingress.resolveStable({ channelId: 'slack', accountId: account, cfg: ctx.cfg,
          identity: { key: 'partnership-user', entryIdPrefix: 'partnership' }, subject: { stableId: sender }, conversation: { kind: 'channel', id: channel },
          contextBinding: { agentId, sessionKey, nativeChannelId: channel, messageId, inboundEventKind: 'user_request' },
          dmPolicy: 'disabled', allowFrom: [], groupPolicy: 'allowlist', groupAllowFrom: [sender] });
        const payload = runtime.inbound.buildContext({ channel: 'slack', accountId: account, channelIngress: ingress, messageId, timestamp: Date.now(),
          from: `slack:channel:${channel}`, sender: { id: sender }, conversation: { kind: 'channel', id: channel, spaceId: 'TFIXTURE1', nativeChannelId: channel },
          route: { agentId, accountId: account, routeSessionKey: sessionKey, dispatchSessionKey: sessionKey },
          reply: { to: `channel:${channel}`, originatingTo: `channel:${channel}`, nativeChannelId: channel, messageThreadId: thread },
          message: { rawBody: text, bodyForAgent: text, inboundEventKind: 'user_request' },
          command: { kind: 'normal', authorized: true }, access: { commands: { authorized: true }, mentions: { canDetectMention: true, wasMentioned: true } } });
        const mailBefore = state.mail.length;
        await runtime.inbound.dispatch({ cfg: ctx.cfg, channel: 'slack', accountId: account, route: { agentId, sessionKey }, ctxPayload: payload, messageId,
          replyOptions: { abortSignal: ctx.abortSignal }, delivery: { deliver: async out => { if (out.text) state.sent.push({ text: out.text, request: text, channel, thread, sender }); save(); return { visibleReplySent: Boolean(out.text) }; }, onError: error => { throw error; } } });
        (state.dispatches ??= []).push({ text, sender, thread, mailBefore, mailAfter: state.mail.length }); save();
      }
      try {
        const phase = process.env.PARTNERSHIP_PHASE;
        if (phase === 'prepare') {
          await dispatch('PARTNERSHIP_PREPARE');
          await dispatch('PARTNERSHIP_PREPARE_CANCEL');
        }
        else {
          const commands = JSON.parse(readFileSync(process.env.PARTNERSHIP_COMMANDS, 'utf8'));
          for (const item of commands) await dispatch(item.text, item.options);
        }
        state.phases.push({ phase, pid: process.pid }); save();
      } catch (error) { state.error = String(error); save(); }
      await new Promise(resolve => { if (ctx.abortSignal.aborted) resolve(); else ctx.abortSignal.addEventListener('abort', resolve, { once: true }); });
    } },
  });
} });
