import { sessionKey, createOwnerQueue } from './scope.mjs';
import { createTurnControl } from './turn-control.mjs';

export function createIsolatedReceiver({ policy, config, cfg, runtime, memory, send, signal, turns = createTurnControl(), trace = () => {} }) {
  const queue = createOwnerQueue();
  const seen = new Set();
  return async event => {
    const owner = policy.resolveOwner(event);
    if (!owner || signal.aborted || typeof event.text !== 'string' || !event.text.trim() ||
        !policy.validEventId(event.id) || event.text.length > 4000) return { dispatched: false };
    if (owner.kind !== 'direct' && config.requireMention !== false && !event.mentioned) return { dispatched: false };
    const eventKey = JSON.stringify([owner.spaceId,owner.channelId,owner.threadId,event.id]);
    if (seen.has(eventKey)) return { dispatched: false };
    seen.add(eventKey);
    if (seen.size > 10000) seen.delete(seen.values().next().value);
    return queue(owner.key, async () => {
      if (signal.aborted) return { dispatched: false };
      const command = event.text.trim();
      if (['/new', '/reset', '/forget'].includes(command)) {
        if (command === '/forget') {
          memory.forget(owner, undefined, () => {
            if (signal.aborted) throw new Error('Receiver stopped');
          });
        } else memory.reset(owner);
        await send(owner.channelId, command === '/forget' ? '已删除你在这段对话中的记忆，并开始新对话。' : '已为你开始新对话。保存的记忆仍保留。', event.id,owner);
        return { dispatched: false, handled: true };
      }
      // No inherited global/admin/plugin commands, thread bindings, quoted
      // messages, channel history, attachments or reply-to content are loaded.
      if (command.startsWith('/')) return { dispatched: false };
      const key = sessionKey(owner, memory.generation(owner));
      const kind = owner.kind;
      const ingress = await runtime.inbound.ingress.resolveStable({
        channelId: owner.platform, accountId: owner.accountId, cfg,
        identity: { key: `${owner.platform}-user-id`, entryIdPrefix: `rein-${owner.platform}-user` },
        subject: { stableId: owner.senderId }, conversation: { kind, id: owner.conversationId },
        contextBinding: { agentId: owner.agentId, sessionKey: key, nativeChannelId: owner.channelId,
          messageId: event.id, inboundEventKind: 'user_request' },
        dmPolicy: 'allowlist', allowFrom: config.dmAllowFrom,
        groupPolicy: 'allowlist', groupAllowFrom: [owner.senderId],
      });
      if (signal.aborted || ingress.ingress.admission !== 'dispatch') return { dispatched: false };
      const target = `channel:${owner.channelId}`;
      const ctxPayload = runtime.inbound.buildContext({
        channel: owner.platform, accountId: owner.accountId, channelIngress: ingress,
        messageId: event.id, timestamp: event.timestamp,
        from: kind === 'channel' ? `${owner.platform}:channel:${owner.channelId}` : `${owner.platform}:${owner.senderId}`,
        sender: { id: owner.senderId },
        conversation: { kind, id: owner.conversationId, spaceId: owner.spaceId ?? undefined, threadId: owner.threadId, nativeChannelId: owner.channelId },
        route: { agentId: owner.agentId, accountId: owner.accountId, routeSessionKey: key, dispatchSessionKey: key,
          dmScope: 'per-account-channel-peer' },
        reply: { to: target, originatingTo: target, nativeChannelId: owner.channelId,
          messageThreadId: owner.threadId, sourceReplyDeliveryMode: owner.threadId?'thread':kind==='direct'?'direct':'channel' },
        message: { rawBody: event.text, bodyForAgent: event.text, inboundEventKind: 'user_request' },
        command: { kind: 'normal', authorized: false },
        access: { commands: { authorized: false }, mentions: { canDetectMention: true, wasMentioned: event.mentioned === true } },
      });
      trace({ phase: 'dispatch', owner: owner.key, sessionKey: key, audience: owner.audience });
      const turn = turns.open(key,signal,owner);
      let result;
      try { result = await runtime.inbound.dispatch({
        cfg, channel: owner.platform, accountId: owner.accountId, route: { agentId: owner.agentId, sessionKey: key, dmScope: 'per-account-channel-peer' },
        ctxPayload, messageId: event.id,
        toolsAllow: policy.toolsFor(owner),
        record: { onRecordError: () => { throw new Error('Isolated session recording failed'); } },
        replyOptions: { abortSignal: turn.signal },
        delivery: {
          // Deliver only finalized text to this immutable native target. Model
          // tool routes/media URLs cannot redirect or add recipients.
          deliver: async (payload, info) => {
            if (turn.forgetOutcome) return { visibleReplySent: false };
            if (signal.aborted) throw new Error('Receiver stopped');
            if (info.kind !== 'final' || !payload.text) return { visibleReplySent: false };
            await send(owner.channelId, payload.text, event.id,owner);
            return { visibleReplySent: true };
          },
          onError: () => { throw new Error('Isolated channel delivery failed'); },
        },
      }); } catch (error) {
        if (!turn.forgetOutcome) throw error;
      } finally { turn.close(); }
      if (turn.forgetOutcome) {
        if (!signal.aborted) await send(owner.channelId,turn.forgotten
          ? '已删除指定记忆，并开始新对话。' : '这次未能删除记忆，请稍后重试。',event.id,owner);
        return { dispatched: false, handled: true, forgotten: turn.forgotten };
      }
      return result;
    });
  };
}
