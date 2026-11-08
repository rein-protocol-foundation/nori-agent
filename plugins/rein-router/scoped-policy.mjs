// Exact routes and native ingress tuples. No prompt, identity-link or channel-name input.
const object = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = () => { throw new Error('router_scoped_policy_invalid'); };
const keys = (value, allowed) => { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const list = value => Array.isArray(value) && value.length > 0 && value.length <= 64 &&
  value.every(id) && new Set(value).size === value.length;
const preferences = (raw, allowed, partial = false) => {
  keys(raw, ['primary', 'fallbacks']);
  if ((!partial || raw.primary !== undefined) && !allowed.has(raw.primary)) fail();
  if ((!partial || raw.fallbacks !== undefined) && (!Array.isArray(raw.fallbacks) ||
      raw.fallbacks.length > 16 || raw.fallbacks.some(route => !allowed.has(route)) ||
      new Set(raw.fallbacks).size !== raw.fallbacks.length)) fail();
  if (raw.primary !== undefined && raw.fallbacks?.includes(raw.primary)) fail();
  return { ...(raw.primary === undefined ? {} : { primary: raw.primary }),
    ...(raw.fallbacks === undefined ? {} : { fallbacks: [...raw.fallbacks] }) };
};

export function validateScopedPolicies(raw, routes, globalPaid) {
  if (raw === undefined) return undefined;
  if (!object(raw) || !Object.keys(raw).length || Object.keys(raw).length > 16) fail();
  const result = {};
  for (const [agentId, policy] of Object.entries(raw)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(agentId) || ['__proto__', 'constructor', 'prototype'].includes(agentId)) fail();
    keys(policy, ['allowedRoutes', 'allowPaidUsage', 'default', 'platforms', 'channels', 'origins', 'maxOutputTokens', 'requestTimeoutMs', 'usageLimits']);
    if (!list(policy.allowedRoutes) || typeof policy.allowPaidUsage !== 'boolean' ||
        (policy.allowPaidUsage && !globalPaid) || !Number.isSafeInteger(policy.maxOutputTokens) ||
        policy.maxOutputTokens < 1 || policy.maxOutputTokens > 32768 ||
        !Number.isSafeInteger(policy.requestTimeoutMs) || policy.requestTimeoutMs < 1000 || policy.requestTimeoutMs > 300000) fail();
    const allowed = new Set(policy.allowedRoutes);
    for (const routeId of allowed) {
      const route = routes.find(candidate => candidate.id === routeId);
      // These routes still depend on classifier/role evidence. Exclude rather than broaden access.
      if (!route || !route.gatewayKeyEnvVar || !route.billingVerified || route.billingMode === 'coding-plan' ||
          (route.access && route.access !== 'all') ||
          (route.billingMode === 'pay-as-you-go' && !policy.allowPaidUsage)) fail();
    }
    let usageLimits;
    if (policy.usageLimits !== undefined) {
      const fields = { perUserPerMinute: 120, perConversationPerMinute: 600,
        perUserConcurrent: 16, perConversationConcurrent: 64, maxConcurrent: 128,
        maxGatewayRequestsPerDay: 50000 };
      keys(policy.usageLimits, Object.keys(fields));
      for (const [name, maximum] of Object.entries(fields))
        if (!Number.isSafeInteger(policy.usageLimits[name]) || policy.usageLimits[name] < 1 || policy.usageLimits[name] > maximum) fail();
      usageLimits = { ...policy.usageLimits };
    }
    const defaults = preferences(policy.default, allowed);
    const platforms = {};
    if (policy.platforms !== undefined) {
      keys(policy.platforms, ['slack', 'discord']);
      for (const [platform, value] of Object.entries(policy.platforms)) platforms[platform] = preferences(value, allowed, true);
    }
    if (!Array.isArray(policy.origins) || !policy.origins.length || policy.origins.length > 32) fail();
    const origins = policy.origins.map(origin => {
      keys(origin, ['platform', 'accountId', 'workspaceId', 'channelIds']);
      if (!['slack', 'discord'].includes(origin.platform) || !id(origin.accountId) || !id(origin.workspaceId) || !list(origin.channelIds)) fail();
      return { ...origin, channelIds: [...origin.channelIds] };
    });
    if (origins.some(origin => origin.platform === 'discord') && !usageLimits) fail();
    const seen = new Set();
    for (const origin of origins) for (const channel of origin.channelIds) {
      const key = JSON.stringify([origin.platform, origin.accountId, channel]);
      if (seen.has(key)) fail(); // Never guess a workspace for an ambiguous native channel.
      seen.add(key);
    }
    if (policy.channels !== undefined && (!Array.isArray(policy.channels) || policy.channels.length > 128)) fail();
    const overrides = new Set();
    const channels = (policy.channels ?? []).map(channel => {
      keys(channel, ['platform', 'accountId', 'workspaceId', 'channelId', 'primary', 'fallbacks']);
      const origin = origins.find(origin => origin.platform === channel.platform && origin.accountId === channel.accountId &&
        origin.workspaceId === channel.workspaceId && origin.channelIds.includes(channel.channelId));
      const key = JSON.stringify([channel.platform, channel.accountId, channel.workspaceId, channel.channelId]);
      if (!origin || overrides.has(key)) fail();
      overrides.add(key);
      return { platform: channel.platform, accountId: channel.accountId, workspaceId: channel.workspaceId, channelId: channel.channelId,
        ...preferences(Object.fromEntries(['primary', 'fallbacks'].filter(key => channel[key] !== undefined).map(key => [key, channel[key]])), allowed, true) };
    });
    result[agentId] = { allowedRoutes: [...allowed], allowPaidUsage: policy.allowPaidUsage, default: defaults,
      platforms, channels, origins, ...(usageLimits ? { usageLimits } : {}), maxOutputTokens: policy.maxOutputTokens, requestTimeoutMs: policy.requestTimeoutMs };
  }
  return result;
}

/** Only authenticated direct user turns are supported in M0; delegation needs a preserved origin contract. */
export function resolveScopedPolicy(policies, ctx, { hasAttachments = false } = {}) {
  const policy = policies?.[ctx?.agentId];
  if (!policy || !ctx.runId || !ctx.sessionId || !ctx.sessionKey || !ctx.senderId ||
      ctx.trigger !== 'user' || (ctx.inputProvenance !== undefined && ctx.inputProvenance.kind !== 'external_user') ||
      (ctx.messageProvider !== undefined && ctx.messageProvider !== ctx.channel) || hasAttachments) return null;
  const channelId = ctx.channelContext?.chat?.id ?? ctx.chatId;
  if (!channelId || (ctx.chatId !== undefined && ctx.chatId !== channelId) ||
      (ctx.channelContext?.sender?.id !== undefined && ctx.channelContext.sender.id !== ctx.senderId)) return null;
  const origin = policy.origins.find(origin => origin.platform === ctx.channel && origin.accountId === ctx.accountId && origin.channelIds.includes(channelId));
  if (!origin) return null;
  const platform = policy.platforms[origin.platform];
  const channel = policy.channels.find(channel => channel.platform === origin.platform && channel.accountId === origin.accountId &&
    channel.workspaceId === origin.workspaceId && channel.channelId === channelId);
  const inherited = { ...policy.default, ...platform, ...channel };
  const sources = { primary: channel?.primary !== undefined ? 'channel' : platform?.primary !== undefined ? 'platform' : 'agent',
    fallbacks: channel?.fallbacks !== undefined ? 'channel' : platform?.fallbacks !== undefined ? 'platform' : 'agent' };
  const manual = ctx.modelId !== 'auto';
  const primary = manual ? ctx.modelId : inherited.primary;
  if (!policy.allowedRoutes.includes(primary)) return null;
  const fallbacks = manual ? [] : inherited.fallbacks.filter(route => route !== primary);
  return Object.freeze({ primary, fallbacks: Object.freeze(fallbacks), manual,
    sources: Object.freeze(sources), workspaceId: origin.workspaceId, maxOutputTokens: policy.maxOutputTokens, requestTimeoutMs: policy.requestTimeoutMs });
}

/** Administrative projection contains configured policy only, never private sender/session identities. */
export function describeScopedPolicies(policies) {
  return Object.entries(policies ?? {}).map(([agentId, policy]) => ({ agentId,
    allowedRoutes: policy.allowedRoutes, allowPaidUsage: policy.allowPaidUsage,
    maxOutputTokens: policy.maxOutputTokens, requestTimeoutMs: policy.requestTimeoutMs,
    ...(policy.usageLimits ? { usageLimits: policy.usageLimits } : {}),
    default: policy.default,
    platforms: Object.entries(policy.platforms).map(([platform, settings]) => ({ platform, ...policy.default, ...settings })),
    channels: policy.channels.map(channel => ({ ...policy.default, ...policy.platforms[channel.platform], ...channel })),
  }));
}
