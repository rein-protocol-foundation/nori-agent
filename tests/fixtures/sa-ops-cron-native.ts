// Synthetic transport only; actual native tools, Gateway scheduler and SQLite store.
import { writeFileSync, renameSync } from 'node:fs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { loadCronStore, resolveCronStorePath } from 'openclaw/plugin-sdk/cron-store-runtime';

const stateKey = Symbol.for('rein.sa-ops.cron.fixture');
const evidence = process[stateKey] ??= { sent: [], tools: [], runs: [], jobs: [], done: false, error: undefined };
const fetchKey = Symbol.for('rein.sa-ops.cron.original-fetch');
const originalFetch = process[fetchKey] ??= globalThis.fetch;
globalThis.fetch = (url, options) => {
  const target = String(url);
  if (target.startsWith('https://slack.com/api/')) {
    const replies = {
      'auth.test': { team_id: 'TFIXTURE1', user_id: 'UBOT0001', bot_id: 'BBOT0001' },
      'conversations.info': { channel: { id: 'CFIXTURE1', context_team_id: 'TFIXTURE1', is_private: true,
        is_member: true, is_archived: false, is_im: false, is_mpim: false } },
      'conversations.members': { members: ['UALICE01', 'UBOB0001', 'UNOOWNER1'] },
    };
    const reply = replies[target.split('/').at(-1)];
    if (!reply) throw Error('Unexpected synthetic Slack API');
    return Promise.resolve(Response.json({ ok: true, ...reply }));
  }
  const parsed = new URL(target);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw Error('External request refused by fixture');
  return originalFetch(url, options);
};

export default definePluginEntry({ id: 'sa-ops-cron-fixture', name: 'SA-OPS native Cron fixture', register(api) {
  async function save() {
    evidence.jobs = (await loadCronStore(resolveCronStorePath(api.config.cron?.store))).jobs;
    const target = process.env.SA_OPS_EVIDENCE;
    writeFileSync(`${target}.next`, JSON.stringify(evidence));
    renameSync(`${target}.next`, target);
  }
  api.on('before_agent_run', (_event, ctx) => { evidence.runs.push({ runId: ctx.runId, trigger: ctx.trigger,
    agentId: ctx.agentId, model: ctx.modelId, senderId: ctx.senderId, channel: ctx.channel, accountId: ctx.accountId, chatId: ctx.chatId, channelContext: ctx.channelContext, sessionId: ctx.sessionId, sessionKey: ctx.sessionKey, inputProvenance: ctx.inputProvenance }); });
  api.on('before_tool_call', (event, ctx) => { (evidence.contexts ??= []).push({tool: event.toolName, runId: ctx.runId, agentId: ctx.agentId, sessionKey: ctx.sessionKey, sessionId: ctx.sessionId, channelId: ctx.channelId, requester: ctx.requester}); }, {priority: 300});
  api.on('after_tool_call', async event => {
    if (!['automations', 'cron', 'sessions_spawn', 'sessions_send', 'tool_call'].includes(event.toolName)) return;
    evidence.tools.push({ name: event.toolName, params: event.params, result: event.result, error: event.error });
    await save();
  });
  api.on('agent_end', async () => { await save(); });
  for (const channelId of ['slack', 'discord']) api.registerChannel({
    id: channelId, meta: { id: channelId, label: `Synthetic ${channelId}`, selectionLabel: channelId,
      docsPath: `/channels/${channelId}`, blurb: 'Local SA-OPS fixture' },
    capabilities: { chatTypes: ['channel'], media: false, nativeCommands: false },
    config: { listAccountIds: () => ['default'], resolveAccount: () => ({ accountId: 'default', enabled: true }),
      isEnabled: () => true, isConfigured: () => true },
    outbound: { deliveryMode: 'direct', async sendText({ to, text, threadId }) {
      evidence.sent.push({ to, text, threadId, background: true }); await save();
      return { channel: channelId, messageId: `fixture-${evidence.sent.length}` };
    } },
    gateway: { async startAccount(ctx) {
      if (channelId === 'discord') { await new Promise(resolve => ctx.abortSignal.addEventListener('abort', resolve, { once: true })); return; }
      try {
        if (process.env.SA_OPS_PHASE === 'create') for (const [i, [platform, sender, text]] of [
          ['slack', 'UALICE01', 'SA_NATIVE_CHILD'], ['slack', 'UALICE01', 'SA_CREATE_A'], ['slack', 'UBOB0001', 'SA_CREATE_B'],
          ['slack', 'UBOB0001', 'SA_UPDATE_A'], ['slack', 'UBOB0001', 'SA_DECLARE_A'],
          ['slack', 'UALICE01', 'SA_DISABLE_A'], ['slack', 'UALICE01', 'SA_ENABLE_A'],
          ['slack', 'UNOOWNER1', 'SA_UNAUTHORIZED_CREATE'], ['slack', 'UALICE01', 'SA_CREATE_DISABLED'], ['slack', 'UALICE01', 'SA_CREATE_REMOVED'],
          ['slack', 'UALICE01', 'SA_REMOVE'], ['discord', 'UPUBLIC1', 'SA_PUBLIC_CREATE'],
          ['discord', 'UPUBLIC1', 'SA_PUBLIC_SPAWN'], ['discord', 'UPUBLIC1', 'SA_PUBLIC_SEND'],
        ].entries()) {
          const runtime = ctx.channelRuntime, agentId = platform === 'slack' ? 'main' : 'public';
          const nativeChannelId = platform === 'slack' ? 'CFIXTURE1' : 'CFIXPUB1';
          const sessionKey = `agent:${agentId}:${platform}:channel:${nativeChannelId.toLowerCase()}`;
          const messageId = `fixture-${i}`;
          const ingress = await runtime.inbound.ingress.resolveStable({ channelId: platform, accountId: 'default', cfg: ctx.cfg,
            identity: { key: 'sa-ops-user', entryIdPrefix: 'sa-ops' }, subject: { stableId: sender },
            conversation: { kind: 'channel', id: nativeChannelId },
            contextBinding: { agentId, sessionKey, nativeChannelId, messageId, inboundEventKind: 'user_request' },
            dmPolicy: 'disabled', groupPolicy: 'allowlist', groupAllowFrom: [sender] });
          const payload = runtime.inbound.buildContext({ channel: platform, accountId: 'default', channelIngress: ingress,
            messageId, timestamp: Date.now(), from: `${platform}:channel:${nativeChannelId}`, sender: { id: sender },
            conversation: { kind: 'channel', id: nativeChannelId, nativeChannelId, spaceId: 'TFIXTURE1' },
            route: { agentId, accountId: 'default', routeSessionKey: sessionKey, dispatchSessionKey: sessionKey },
            reply: { to: `channel:${nativeChannelId}`, originatingTo: `channel:${nativeChannelId}`, nativeChannelId, messageThreadId: '1000.001' },
            message: { rawBody: text, bodyForAgent: text, inboundEventKind: 'user_request' },
            command: { kind: 'normal', authorized: false },
            access: { commands: { authorized: false }, mentions: { canDetectMention: true, wasMentioned: true } } });
          await runtime.inbound.dispatch({ cfg: ctx.cfg, channel: platform, accountId: 'default', route: { agentId, sessionKey },
            ctxPayload: payload, messageId, replyOptions: { abortSignal: ctx.abortSignal },
            delivery: { deliver: async result => { if (result.text) evidence.sent.push({ text: result.text }); await save();
              return { visibleReplySent: Boolean(result.text) }; }, onError: e => { throw e; } } });
          const deadline = Date.now() + 15000;
          while (!evidence.sent.some(result => result.text?.includes(`ACK ${text}`))) {
            if (Date.now() > deadline) throw Error(`No final delivery for ${text}`);
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (text === 'SA_NATIVE_CHILD') {
            const resultDeadline=Date.now()+15000;
            while(!evidence.sent.some(row=>row.text?.includes('ACK SA_CHILD_RESULT'))) {
              if(Date.now()>resultDeadline) throw Error('No actual native child result through parent');
              await new Promise(resolve=>setTimeout(resolve,50));
            }
          }
          await save();
          (evidence.lifecycle ??= []).push({step:text,jobs:evidence.jobs.map(job=>({id:job.id,name:job.name,enabled:job.enabled,description:job.description,owner:job.owner}))});
          await save();
        }
        if (process.env.SA_OPS_PHASE === 'create') {
          const deadline=Date.now()+15000;
          while(!evidence.sent.some(row=>row.text?.includes('ACK SA_CHILD_RESULT'))) {
            if(Date.now()>deadline) throw Error('No actual native child result through parent');
            await new Promise(resolve=>setTimeout(resolve,50));
          }
        }
        evidence.done = true; await save();
        while (!ctx.abortSignal.aborted) { await new Promise(resolve => setTimeout(resolve, 250)); await save(); }
      } catch (error) { evidence.error = String(error); await save(); }
    } },
  });
} });
