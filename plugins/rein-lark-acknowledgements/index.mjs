const agents = new Map([['lark-internal', 'main'], ['lark-community', 'nori-community']]);

// The native channel has already admitted this turn. Only use host-supplied
// identities and the triggering message, including for replies inside a topic.
function target(event, cfg) {
  const { ctx } = event;
  if (event.isTailDispatch || event.sendPolicy !== 'allow' || event.suppressUserDelivery ||
      event.suppressReplyLifecycle || event.shouldRouteToOriginating ||
      ctx.Provider !== 'feishu' || ctx.Surface !== 'feishu' || ctx.ChatType !== 'group' ||
      ctx.InboundEventKind !== 'user_request' || ctx.InboundAccessAuthorized !== true ||
      ctx.WasMentioned !== true || ctx.SenderIsBot || ctx.SenderIsSelf ||
      (ctx.InputProvenance && ctx.InputProvenance.kind !== 'external_user') ||
      !agents.has(ctx.AccountId) || agents.get(ctx.AccountId) !== ctx.AgentId) return;

  const channel = cfg.channels?.feishu;
  const account = channel?.accounts?.[ctx.AccountId];
  const messageId = ctx.MessageSidFull ?? ctx.MessageSid;
  if (!channel?.enabled || !account?.enabled || (account.domain ?? channel.domain) !== 'lark' ||
      (account.actions ?? channel.actions)?.reactions === false ||
      !account.groupAllowFrom?.includes(ctx.NativeChannelId) ||
      (account.groupSenderAllowFrom && !account.groupSenderAllowFrom.includes(ctx.SenderId)) ||
      !/^om_[a-zA-Z0-9]+$/.test(messageId)) return;
  return { account, messageId };
}

const base = 'https://open.larksuite.com/open-apis/';

async function post(path, body, signal, token) {
  const response = await fetch(base + path, {
    method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw new Error('Lark request failed');
  return result;
}

export function registerAcknowledgements(api, request = post) {
  const tokens = new Map();
  const stopped = new AbortController();
  const dispose = () => { stopped.abort(); tokens.clear(); };
  if (api.lifecycle.onDispose) api.lifecycle.onDispose(dispose);
  else api.lifecycle.registerRuntimeLifecycle({ id: 'rein-lark-acknowledgements', dispose });

  // Coalesce token requests per account, including concurrent mentions. A
  // credential change or failed exchange expires only that account's cache.
  function tenantToken(accountId, account) {
    const cached = tokens.get(accountId);
    if (cached?.secret === account.appSecret && cached.appId === account.appId && cached.expires > Date.now())
      return cached.token;
    const entry = { appId: account.appId, secret: account.appSecret, expires: Infinity };
    const signal = AbortSignal.any([stopped.signal, AbortSignal.timeout(5000)]);
    entry.token = request('auth/v3/tenant_access_token/internal',
      { app_id: account.appId, app_secret: account.appSecret }, signal).then(result => {
      if (!result.tenant_access_token) throw new Error('Missing tenant token');
      entry.expires = Date.now() + Math.max(0, (result.expire || 0) - 60) * 1000;
      return result.tenant_access_token;
    }).catch(error => { entry.expires = 0; throw error; });
    tokens.set(accountId, entry);
    return entry.token;
  }

  api.on('reply_dispatch', async (event, { cfg, abortSignal }) => {
    const receipt = target(event, cfg);
    if (!receipt || stopped.signal.aborted || abortSignal?.aborted) return;
    const { account, messageId } = receipt;
    const accountId = event.ctx.AccountId;
    try {
      if (!account.appId || typeof account.appSecret !== 'string' || !account.appSecret)
        throw new Error('Unresolved account');
      const signal = AbortSignal.any([stopped.signal, AbortSignal.timeout(6000), ...(abortSignal ? [abortSignal] : [])]);
      const token = await tenantToken(accountId, account);
      signal.throwIfAborted();
      const result = await request(`im/v1/messages/${messageId}/reactions`,
        { reaction_type: { emoji_type: 'OK' } }, signal, token);
      if (!result.data?.reaction_id) throw new Error('Missing reaction receipt');
      api.logger.info(`Lark OK confirmed for ${accountId}`);
    } catch {
      api.logger.warn(`Lark OK unconfirmed for ${accountId}`);
    }
  }, { priority: -1000, timeoutMs: 7000, eligibleDispatchKinds: ['agent', 'acp'] });
}

export default {
  id: 'rein-lark-acknowledgements', name: 'Lark group acknowledgements',
  register(api) { registerAcknowledgements(api); },
};
