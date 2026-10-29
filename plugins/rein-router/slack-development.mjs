/** Private development channels are operator-selected; only administrator invitations grant access. */
export const DEVELOPMENT_AUTH_TIMEOUT_MS = 8000;
const nativeId = value => typeof value === 'string' && /^[A-Z][A-Z0-9]{5,31}$/.test(value);
const runField = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;

export function developmentChannelFor(config, ctx) {
  const channelId = ctx?.channelContext?.chat?.id ?? ctx?.chatId;
  if (ctx?.channel !== 'slack' || !nativeId(channelId) || !nativeId(ctx?.senderId) ||
      !runField(ctx?.runId) || !runField(ctx?.sessionKey) || !runField(ctx?.agentId) ||
      !runField(ctx?.accountId) || ctx.trigger !== 'user' ||
      (ctx.inputProvenance !== undefined && ctx.inputProvenance.kind !== 'external_user') ||
      (ctx.messageProvider !== undefined && ctx.messageProvider !== 'slack') ||
      (ctx.chatId !== undefined && ctx.chatId !== channelId) ||
      (ctx.channelContext?.sender?.id !== undefined && ctx.channelContext.sender.id !== ctx.senderId)) return null;
  return config.developmentChannels.find(entry => entry.accountId === ctx.accountId &&
    entry.channelId === channelId && entry.agentId === ctx.agentId) ?? null;
}

export function createSlackDevelopmentAuthorizer({ config, authorizeFoundation, env = process.env, fetchImpl = globalThis.fetch }) {
  return async ctx => {
    const selected = developmentChannelFor(config, ctx);
    if (!selected || typeof authorizeFoundation !== 'function') return false;
    const token = env[selected.botTokenEnvVar];
    if (typeof token !== 'string' || !/^xoxb-[A-Za-z0-9-]+$/.test(token)) return false;
    const inviters = new Set(config.adminSenders.filter(sender => sender.channel === 'slack' &&
      sender.accountId === selected.accountId).map(sender => sender.senderId));
    if (!inviters.size) return false;
    const signal = AbortSignal.timeout(DEVELOPMENT_AUTH_TIMEOUT_MS - 100);
    async function api(method, params = {}) {
      const response = await fetchImpl(`https://slack.com/api/${method}`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params), redirect: 'error', signal,
      });
      if (!response.ok) throw new Error('slack_authority_unavailable');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 1024 * 1024) throw new Error('slack_authority_invalid');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body?.ok !== true) throw new Error('slack_authority_unavailable');
      return body;
    }
    try {
      // The token's workspace, private-channel identity, and live membership must all agree.
      const auth = await api('auth.test');
      if (auth.team_id !== selected.workspaceId || !nativeId(auth.user_id) || !auth.bot_id) return false;
      const { channel } = await api('conversations.info', { channel: selected.channelId });
      if (!channel || channel.id !== selected.channelId || channel.context_team_id !== selected.workspaceId ||
          channel.is_private !== true || channel.is_member !== true || channel.is_archived !== false ||
          channel.is_im !== false || channel.is_mpim !== false || channel.is_shared === true ||
          channel.is_ext_shared === true || channel.is_org_shared === true || channel.is_pending_ext_shared === true) return false;
      let cursor = '', member = false;
      const seen = new Set();
      for (let page = 0; page < 10; page++) {
        const body = await api('conversations.members', { channel: selected.channelId, limit: '200', ...(cursor ? { cursor } : {}) });
        if (!Array.isArray(body.members)) return false;
        if (body.members.includes(ctx.senderId)) { member = true; break; }
        cursor = body.response_metadata?.next_cursor ?? '';
        if (!cursor || seen.has(cursor)) break;
        seen.add(cursor);
      }
      if (!member) return false;
      // Operator-configured administrators still need current membership in the selected channel.
      if (inviters.has(ctx.senderId)) return await authorizeFoundation(ctx) === true;
      cursor = ''; seen.clear();
      for (let page = 0; page < 10; page++) {
        const body = await api('conversations.history', { channel: selected.channelId, limit: '100', ...(cursor ? { cursor } : {}) });
        if (!Array.isArray(body.messages)) return false;
        // Slack's newest membership event wins. A rejoin cannot reuse an older administrator invite.
        for (const message of body.messages) {
          if (message.user !== ctx.senderId) continue;
          if (['channel_leave', 'group_leave'].includes(message.subtype)) return false;
          if (['channel_join', 'group_join'].includes(message.subtype))
            return message.type === 'message' && inviters.has(message.inviter) && await authorizeFoundation(ctx) === true;
        }
        cursor = body.response_metadata?.next_cursor ?? '';
        if (!cursor || !body.has_more || seen.has(cursor)) break;
        seen.add(cursor);
      }
      // Deleted/expired invitation evidence, rate limits and unavailable Slack never grant access.
      return false;
    } catch { return false; }
  };
}
