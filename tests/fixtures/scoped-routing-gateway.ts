// Synthetic authenticated channel ingress into the actual OpenClaw runtime.
// No Slack/Discord login or network transport is installed by this fixture.
import { writeFileSync, appendFileSync } from 'node:fs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { buildJsonChannelConfigSchema } from 'openclaw/plugin-sdk/channel-config-schema';

export default definePluginEntry({ id: 'rein-scoped-probe', name: 'Synthetic M0 routing probe', register(api) {
  const sent = [], failures = [];
  let finished = 0;
  api.on('before_model_resolve', (_event, ctx) => { appendFileSync(process.env.REIN_SCOPED_CONTEXTS, JSON.stringify(Object.fromEntries(
    ['agentId', 'sessionId', 'channel', 'accountId', 'chatId', 'trigger', 'inputProvenance'].map(key => [key, ctx[key]]))) + '\n'); });
  for (const platform of ['slack', 'discord']) api.registerChannel({
    id: platform, meta: { id: platform, label: `Synthetic ${platform}`, selectionLabel: platform,
      docsPath: '/fixture', blurb: 'Hermetic M0 fixture' },
    capabilities: { chatTypes: ['channel'], media: false, nativeCommands: false },
    configSchema: buildJsonChannelConfigSchema({ type: 'object', properties: { enabled: { type: 'boolean' } }, additionalProperties: false }),
    config: { listAccountIds: () => ['default'], resolveAccount: () => ({ accountId: 'default', enabled: true }),
      isEnabled: () => true, isConfigured: () => true },
    gateway: { async startAccount(ctx) {
      const runtime = ctx.channelRuntime, cfg = ctx.cfg;
      const defaultAgentId = platform === 'slack' ? 'main' : 'nori-community';
      const spaceId = platform === 'slack' ? 'T0123456ABC' : '100000000000000001';
      const senderId = platform === 'slack' ? 'U0123456ABC' : '100000000000000003';
      const cases = platform === 'slack' ? [['C0123456ABC', 'CASE_SLACK']] : [
        ['100000000000000002', 'CASE_COMMUNITY_OVERRIDE'], ['100000000000000004', 'CASE_COMMUNITY_PLATFORM'],
        ['100000000000000004', 'CASE_COMMUNITY_FAILURE'], ['100000000000000002', 'CASE_COMMUNITY_EMPTY'],
        ['100000000000000002', 'CASE_BUDGET_FIRST', 'nori-budget-probe'],
        ['100000000000000002', 'CASE_BUDGET_EXHAUSTED', 'nori-budget-probe'],
      ];
      try {
        for (const [index, [channelId, text, selectedAgent]] of cases.entries()) {
          const agentId = selectedAgent ?? defaultAgentId;
          const sessionKey = `agent:${agentId}:${platform}:channel:${channelId}:${index}`;
          const messageId = platform === 'slack' ? `${1794000000 + index}.000001` : String(100000000000000010n + BigInt(index));
          const ingress = await runtime.inbound.ingress.resolveStable({ channelId: platform, accountId: 'default', cfg,
            identity: { key: `${platform}-user-id`, entryIdPrefix: `fixture-${platform}-user` },
            subject: { stableId: senderId }, conversation: { kind: 'channel', id: channelId },
            contextBinding: { agentId, sessionKey, nativeChannelId: channelId, messageId, inboundEventKind: 'user_request' },
            dmPolicy: 'disabled', allowFrom: [], groupPolicy: 'allowlist', groupAllowFrom: [senderId] });
          if (ingress.ingress.admission !== 'dispatch') throw new Error('fixture_ingress_denied');
          const ctxPayload = runtime.inbound.buildContext({ channel: platform, accountId: 'default', channelIngress: ingress,
            messageId, from: `${platform}:channel:${channelId}`, sender: { id: senderId },
            conversation: { kind: 'channel', id: channelId, spaceId, nativeChannelId: channelId },
            route: { agentId, accountId: 'default', routeSessionKey: sessionKey, dispatchSessionKey: sessionKey, dmScope: 'per-account-channel-peer' },
            reply: { to: `channel:${channelId}`, originatingTo: `channel:${channelId}`, nativeChannelId: channelId },
            message: { rawBody: text, bodyForAgent: text, inboundEventKind: 'user_request' },
            command: { kind: 'normal', authorized: false }, access: { commands: { authorized: false }, mentions: { canDetectMention: true, wasMentioned: true } } });
          await runtime.inbound.dispatch({ cfg, channel: platform, accountId: 'default',
            route: { agentId, sessionKey, dmScope: 'per-account-channel-peer' }, ctxPayload, messageId,
            toolsAllow: [], replyOptions: { abortSignal: ctx.abortSignal },
            record: { onRecordError: () => { throw new Error('fixture_record_failed'); } },
            delivery: { deliver: async (payload, info) => {
              if (info.kind === 'final' && payload.text) sent.push({ platform, agentId, channelId, marker: text, text: payload.text });
              return { visibleReplySent: info.kind === 'final' && Boolean(payload.text) };
            }, onError: () => { throw new Error('fixture_delivery_failed'); } } });
        }
      } catch (error) { failures.push({ platform, error: String(error) }); }
      finally { if (++finished === 2) writeFileSync(process.env.REIN_SCOPED_EVIDENCE, JSON.stringify({ sent, failures })); }
      await new Promise(resolve => { if (ctx.abortSignal.aborted) resolve(); else ctx.abortSignal.addEventListener('abort', resolve, { once: true }); });
    } },
  });
} });
