import { resolveOwner, sessionKey, PUBLIC_TOOLS, PRIVATE_TOOLS, createOwnerQueue } from './isolation.mjs';

export function createIsolatedReceiver({ config, cfg, runtime, memory, send, signal, trace = () => {} }) {
  const queue = createOwnerQueue();
  const seen = new Set();
  return async event => {
    const owner = resolveOwner(config, event);
    if (!owner || signal.aborted || typeof event.text !== 'string' || !event.text.trim() ||
        !/^[0-9]{17,20}$/.test(event.id ?? '') || event.text.length > 4000) return { dispatched: false };
    if (owner.audience === 'public' && config.requireMention !== false && !event.mentioned) return { dispatched: false };
    if (seen.has(event.id)) return { dispatched: false };
    seen.add(event.id);
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
        await send(owner.channelId, command === '/forget' ? '已删除你在这段对话中的记忆，并开始新对话。' : '已为你开始新对话。保存的记忆仍保留。', event.id);
        return { dispatched: false, handled: true };
      }
      // No inherited global/admin/plugin commands, thread bindings, quoted
      // messages, channel history, attachments or reply-to content are loaded.
      if (command.startsWith('/')) return { dispatched: false };
      const key = sessionKey(owner, memory.generation(owner));
      const kind = owner.audience === 'public' ? 'channel' : 'direct';
      const ingress = await runtime.inbound.ingress.resolveStable({
        channelId: 'discord', accountId: 'default', cfg,
        identity: { key: 'discord-user-id', entryIdPrefix: 'rein-discord-user' },
        subject: { stableId: owner.senderId }, conversation: { kind, id: owner.channelId },
        contextBinding: { agentId: owner.agentId, sessionKey: key, nativeChannelId: owner.channelId,
          messageId: event.id, inboundEventKind: 'user_request' },
        dmPolicy: 'allowlist', allowFrom: config.dmAllowFrom,
        groupPolicy: 'allowlist', groupAllowFrom: [owner.senderId],
      });
      if (signal.aborted || ingress.ingress.admission !== 'dispatch') return { dispatched: false };
      const target = `channel:${owner.channelId}`;
      const ctxPayload = runtime.inbound.buildContext({
        channel: 'discord', accountId: 'default', channelIngress: ingress,
        messageId: event.id, timestamp: event.timestamp,
        from: owner.audience === 'public' ? `discord:channel:${owner.channelId}` : `discord:${owner.senderId}`,
        sender: { id: owner.senderId },
        conversation: { kind, id: owner.channelId, spaceId: owner.guildId ?? undefined, nativeChannelId: owner.channelId },
        route: { agentId: owner.agentId, accountId: 'default', routeSessionKey: key, dispatchSessionKey: key,
          dmScope: 'per-account-channel-peer' },
        reply: { to: target, originatingTo: target, nativeChannelId: owner.channelId },
        message: { rawBody: event.text, bodyForAgent: event.text, inboundEventKind: 'user_request' },
        command: { kind: 'normal', authorized: false },
        access: { commands: { authorized: false }, mentions: { canDetectMention: true, wasMentioned: event.mentioned === true } },
      });
      trace({ phase: 'dispatch', owner: owner.key, sessionKey: key, audience: owner.audience });
      return await runtime.inbound.dispatch({
        cfg, channel: 'discord', accountId: 'default', route: { agentId: owner.agentId, sessionKey: key, dmScope: 'per-account-channel-peer' },
        ctxPayload, messageId: event.id,
        toolsAllow: owner.audience === 'public' ? PUBLIC_TOOLS : PRIVATE_TOOLS,
        record: { onRecordError: () => { throw new Error('Isolated session recording failed'); } },
        replyOptions: { abortSignal: signal },
        delivery: {
          // Deliver only finalized text to this immutable native target. Model
          // tool routes/media URLs cannot redirect or add recipients.
          deliver: async (payload, info) => {
            if (signal.aborted) throw new Error('Receiver stopped');
            if (info.kind !== 'final' || !payload.text) return { visibleReplySent: false };
            await send(owner.channelId, payload.text, event.id);
            return { visibleReplySent: true };
          },
          onError: () => { throw new Error('Isolated Discord delivery failed'); },
        },
      });
    });
  };
}
