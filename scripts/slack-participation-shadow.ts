import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChannelInboundEventContext } from '../vendor/openclaw/src/plugin-sdk/channel-inbound.js';
import { hasControlCommand } from '../vendor/openclaw/src/plugin-sdk/command-detection.js';
import { isAbortRequestText } from '../vendor/openclaw/src/plugin-sdk/command-primitives-runtime.js';
import { stripSlackMentionsForCommandDetection } from '../vendor/openclaw/extensions/slack/src/monitor/commands.js';
import { createDecisionProvider } from '../vendor/openclaw/extensions/typesafe/src/decisions.js';
import { createSlackParticipation, validateParticipationPolicy } from '../plugins/rein-router/slack-participation.mjs';
import { isSlackMessageId, isSlackReviewerId } from '../plugins/rein-router/slack-participation-evidence.mjs';
import { readPrivateJson, writePrivateJson } from './slack-participation-review.mjs';

const fail = () => { throw new Error('router_participation_shadow_invalid'); };
const modelId = /^(?:typesafe\/)?(jev-[A-Za-z0-9][A-Za-z0-9.-]{0,60})$/;

export function projectSlackReadback(input) {
  const policy = validateParticipationPolicy(input?.policy);
  const [scope] = policy.channels;
  const auth = input?.authTest;
  const channel = input?.conversationInfo?.channel;
  const messages = input?.messageRead?.messages;
  const model = typeof input?.decisionModel === 'string' ? modelId.exec(input.decisionModel)?.[1] : undefined;
  if (input?.schemaVersion !== 1 || !policy.enabled || policy.channels.length !== 1 || !model ||
      input.scopeReviewed !== true || auth?.ok !== true || !isSlackReviewerId(auth.user_id) ||
      auth.team_id !== scope.workspaceId || input.conversationInfo?.ok !== true ||
      channel?.id !== scope.channelId || channel.name !== 'rein-agent-test' ||
      channel.is_member !== true || channel.is_archived === true || channel.is_im === true || channel.is_mpim === true ||
      !(channel.is_channel === true || channel.is_group === true) ||
      input.messageRead?.ok !== true || !Array.isArray(messages) || messages.length > 16 ||
      !isSlackMessageId(input.expectedMessageId) || !isSlackReviewerId(input.expectedSenderId) ||
      input.expectedSenderId === auth.user_id) fail();
  const matches = messages.filter(message => message?.ts === input.expectedMessageId);
  const [message] = matches;
  if (matches.length !== 1 || message.type !== 'message' || message.user !== input.expectedSenderId ||
      message.bot_id !== undefined || message.subtype !== undefined || message.edited !== undefined ||
      typeof message.text !== 'string' || message.text.length > 32000 ||
      (message.thread_ts !== undefined && !isSlackMessageId(message.thread_ts)) ||
      (message.parent_user_id !== undefined && !isSlackReviewerId(message.parent_user_id))) fail();

  const threadId = message.thread_ts !== message.ts ? message.thread_ts : undefined;
  const explicitlyMentioned = [...message.text.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/g)]
    .some(([, userId]) => userId === auth.user_id);
  const replyToBot = Boolean(threadId && message.parent_user_id === auth.user_id);
  const wasMentioned = explicitlyMentioned || replyToBot;
  const kind = channel.is_private || channel.is_group ? 'group' : 'channel';
  const sessionKey = `agent:${scope.agentId}:slack:${kind}:${scope.channelId.toLowerCase()}`;
  const ctx = buildChannelInboundEventContext({ channel: 'slack', accountId: scope.accountId,
    messageId: message.ts, sender: { id: message.user }, from: `slack:${kind}:${scope.channelId}`,
    conversation: { kind, id: scope.channelId, nativeChannelId: scope.channelId, spaceId: scope.workspaceId, threadId },
    route: { agentId: scope.agentId, accountId: scope.accountId, routeSessionKey: sessionKey },
    reply: { to: `channel:${scope.channelId}`, nativeChannelId: scope.channelId, messageThreadId: threadId },
    message: { rawBody: message.text, commandBody: stripSlackMentionsForCommandDetection(message.text) },
    access: { mentions: { canDetectMention: true, wasMentioned, requireMention: false,
      ...(replyToBot ? { implicitMentionKinds: ['reply_to_bot'] } : {}) } } });
  return { policy, scope, model, messageId: message.ts, ctx };
}

export async function runSlackReadbackShadow(input, { allowPaidJev = false, apiKey } = {}) {
  const { policy, scope, model, messageId, ctx } = projectSlackReadback(input);
  const configured = allowPaidJev && typeof apiKey === 'string' && Boolean(apiKey.trim());
  const provider = configured ? createDecisionProvider(() => ({ apiKey, timeoutMs: policy.timeoutMs })) : undefined;
  let hostedCalls = 0;
  let providerResult = null;
  const participation = createSlackParticipation({
    policy, allowPaidJev: configured,
    isNativeCommand: text => isAbortRequestText(text) || hasControlCommand(text ?? '', {}),
    decisions: provider ? { async evaluate(batch, { signal, timeoutMs }) {
      if (hostedCalls !== 0) fail();
      hostedCalls++;
      const result = await provider.evaluate(batch, { model, agentId: scope.agentId, signal,
        deadlineMonotonicMs: performance.now() + timeoutMs });
      providerResult = result.status === 'ok' ? { status: 'ok',
        model: typeof result.result.model === 'string' ? modelId.exec(result.result.model)?.[1] ?? null : null,
        usage: result.result.usage } : { status: 'unavailable', reason: result.reason };
      return result;
    } } : undefined,
  });
  try {
    const { action, observation, evidence } = await participation.evaluate(ctx);
    return {
      schemaVersion: 1, mode: 'shadow-web-api-readback', source: 'operator-attested-slack-web-api',
      scope, messageId, requestedModel: model, hostedCalls,
      provider: providerResult ?? { status: hostedCalls ? 'deadline-or-error' : configured ?
        'native-bypass-or-filtered' : allowPaidJev ? 'credentials-unavailable' : 'not-requested' },
      decision: { action, ...observation, dutyProbability: evidence?.dutyProbability ?? null,
        helpfulnessProbability: evidence?.helpfulnessProbability ?? null },
      observed: { nativeSlackIngress: false, workerModel: null, visibleSlackDelivery: null },
    };
  } finally { participation.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] !== '--input' || !args[1] || args[2] !== '--output' || !args[3] ||
        (args.length !== 4 && !(args.length === 5 && args[4] === '--allow-paid-jev'))) fail();
    const output = resolve(args[3]);
    if (existsSync(output)) fail();
    const allowPaidJev = args.length === 5;
    const report = await runSlackReadbackShadow(readPrivateJson(resolve(args[1])),
      { allowPaidJev, apiKey: process.env.REIN_PARTICIPATION_TEST_JEV_KEY });
    writePrivateJson(output, report);
    if (allowPaidJev && report.decision.trigger === 'passive' && report.provider.status !== 'ok')
      process.exitCode = 1;
  } catch { console.error('router_participation_shadow_failed'); process.exitCode = 1; }
}
