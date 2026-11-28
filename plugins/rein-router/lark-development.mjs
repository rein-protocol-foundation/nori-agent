import { isLarkChatId, isLarkSenderId, resolveLarkGroupTurn } from './scoped-policy.mjs';

const accounts = { 'lark-internal': 'main', 'lark-community': 'nori-community' };
export const LARK_DEVELOPMENT_AGENT = 'nori-development';
const statusTools = ['rein_status', 'rein_route_status'];
// The native child inherits the parent policy. The tool hook below prevents the
// parent from exercising the sandbox worker's file, shell and network tools.
const workerTools = ['read', 'write', 'edit', 'apply_patch', 'exec', 'process', 'web_search', 'web_fetch'];
const parentTools = ['sessions_spawn', 'sessions_yield', 'tool_describe'];
const developmentTools = [...statusTools, ...parentTools, ...workerTools];
const fail = reason => { throw new Error(`lark_development_${reason}`); };
const exactList = (values, valid) => Array.isArray(values) && values.length > 0 &&
  values.length <= 64 && Array.from(values).every(valid) && new Set(values).size === values.length;
const sameList = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && expected.every(value => actual.includes(value));
const peerPattern = /^agent:[^:]+:feishu:group:/;

function nativeLayout(host, groupId) {
  const channel = host.channels?.feishu;
  if (!isLarkChatId(groupId) || channel?.enabled !== true || channel?.appId || channel?.appSecret ||
      !Object.hasOwn(accounts, channel?.defaultAccount ?? 'lark-community') ||
      !sameList(Object.keys(channel?.accounts ?? {}), Object.keys(accounts)) ||
      host.broadcast?.[groupId] || channel?.dynamicAgentCreation?.enabled)
    fail('dual_account_layout_required');
  const bindings = (host.bindings ?? []).filter(binding => binding.match?.channel === 'feishu');
  for (const [accountId, agentId] of Object.entries(accounts)) {
    const account = channel.accounts[accountId];
    const ownBindings = bindings.filter(binding => binding.match.accountId === accountId);
    const effective = { ...channel, ...account };
    if (account?.enabled !== true || !exactList(account.groupAllowFrom, isLarkChatId) ||
        effective.domain !== 'lark' || (effective.connectionMode ?? 'websocket') !== 'websocket' ||
        effective.dmPolicy !== 'disabled' || effective.groupPolicy !== 'allowlist' ||
        effective.requireMention !== true || effective.allowBots === true ||
        effective.groupSessionScope !== 'group_topic_sender' ||
        ownBindings.length !== 1 || ownBindings[0].type === 'acp' || ownBindings[0].agentId !== agentId ||
        Object.keys(ownBindings[0].match).length !== 2)
      fail('exact_mention_only_accounts_required');
  }
  const internal = channel.accounts['lark-internal'], community = channel.accounts['lark-community'];
  if (bindings.length !== 2 || !internal.appId || !community.appId || internal.appId === community.appId ||
      !internal.groupAllowFrom.includes(groupId) ||
      internal.groupAllowFrom.some(id => community.groupAllowFrom.includes(id)) ||
      !exactList(internal.groupSenderAllowFrom, isLarkSenderId))
    fail('trusted_internal_group_required');

  const agent = id => host.agents?.entries?.[id] ?? host.agents?.list?.find(entry => entry.id === id);
  const main = agent('main'), worker = agent(LARK_DEVELOPMENT_AGENT);
  const mainModel = main?.model ?? host.agents?.defaults?.model;
  const primary = typeof mainModel === 'string' ? mainModel : mainModel?.primary;
  if (primary !== 'rein-magpie/auto' || JSON.stringify(mainModel?.fallbacks ?? host.agents?.defaults?.model?.fallbacks) !== '[]' ||
      !main?.subagents?.allowAgents?.includes(LARK_DEVELOPMENT_AGENT) ||
      worker?.sandbox?.mode !== 'all' || !['ssh', 'docker', 'podman', 'openshell'].includes(worker.sandbox.backend) ||
      worker.sandbox.scope !== 'session' || worker.tools?.exec?.host !== 'sandbox' || worker.tools?.elevated?.enabled !== false)
    fail('sandboxed_worker_required');

  return { channel, internal, community, groupIds: [...internal.groupAllowFrom, ...community.groupAllowFrom] };
}

export function assertLarkDevelopmentRuntime(host, groupId) {
  const { channel, internal, community, groupIds } = nativeLayout(host, groupId);
  const development = internal.groups?.[groupId];
  if (channel.groups?.['*']?.tools !== undefined ||
      !sameList(Object.keys(channel.groups ?? {}), ['*', ...groupIds]) ||
      groupIds.some(id => !sameList(channel.groups[id]?.tools?.allow, id === groupId ? developmentTools : statusTools) ||
        channel.groups[id].tools.alsoAllow !== undefined) ||
      community.groups?.[groupId]?.enabled !== false ||
      Object.keys(community.groups ?? {}).some(id => id !== '*' && id !== groupId && !community.groupAllowFrom.includes(id)) ||
      Object.keys(internal.groups ?? {}).some(id => id !== '*' && !internal.groupAllowFrom.includes(id)) ||
      development?.enabled === false || development?.requireMention !== true ||
      (development.groupSessionScope ?? 'group_topic_sender') !== 'group_topic_sender' ||
      (development.allowFrom?.length && !exactList(development.allowFrom, id => internal.groupSenderAllowFrom.includes(id))))
    fail('native_group_policy_invalid');
  const router = host.plugins?.entries?.['rein-router'];
  if (router?.enabled !== true || router.config?.enabled !== true || router.config.larkDevelopmentGroup !== groupId || router.hooks?.allowConversationAccess !== true ||
      router.hooks?.allowPromptInjection === false || router.config?.scopedPolicies?.main)
    fail('router_required');
}

/** Project the old wildcard cap onto every admitted native group. */
export function projectLarkDevelopmentGroups(host, groupId) {
  const { channel, internal, community, groupIds } = nativeLayout(host, groupId);
  const legacy = channel.groups?.['*'];
  if (!sameList(Object.keys(channel.groups ?? {}), ['*']) ||
      !sameList(legacy?.tools?.allow, statusTools) || legacy.tools.alsoAllow !== undefined)
    fail('legacy_group_policy_required');

  // Feishu checks scoped sender/topic keys first. A wildcard tools policy
  // would win before the lookup reaches the base group. Keep its behavioral
  // defaults, and retain the same cap at each other group's exact native ID.
  const { tools, ...defaults } = legacy;
  channel.groups = { '*': defaults, ...Object.fromEntries(groupIds.map(id => [id, {
    ...defaults, tools: { ...tools, allow: [...(id === groupId ? developmentTools : statusTools)] },
  }])) };

  // An explicit group entry can independently admit the chat on an account.
  // Keep account ingress maps separate from the root native tool lookup.
  for (const account of [internal, community])
    account.groups ??= { '*': { ...defaults } };
  internal.groups[groupId] = { ...(internal.groups[groupId] ?? internal.groups['*']), requireMention: true };
  community.groups[groupId] = { enabled: false };
}

export function larkDevelopmentSource(groupId, host, ctx) {
  if (!groupId || ctx?.agentId !== 'main' || ctx.accountId !== 'lark-internal' || !ctx.runId || !ctx.sessionId ||
      (ctx.messageProvider !== undefined && ctx.messageProvider !== 'feishu') ||
      (ctx.channelContext?.sender?.id !== undefined && ctx.channelContext.sender.id !== ctx.senderId) ||
      resolveLarkGroupTurn(ctx) !== groupId)
    return false;
  try { assertLarkDevelopmentRuntime(host, groupId); } catch { return false; }
  const account = host.channels.feishu.accounts['lark-internal'];
  const senders = account.groups[groupId].allowFrom;
  return (senders?.length ? senders : account.groupSenderAllowFrom).includes(ctx.senderId);
}

const block = { block: true, blockReason: 'This Lark tool requires an authorized development-group mention.' };

export function larkDevelopmentTool(groupId, host, event, ctx, source) {
  if (!groupId || (!peerPattern.test(ctx.sessionKey ?? '') &&
      !(ctx.requester?.channel === 'feishu' && !/^agent:nori-development:subagent:/.test(ctx.sessionKey ?? ''))))
    return;
  const compact = event.toolName === 'tool_call';
  const name = compact && typeof event.params?.id === 'string'
    ? event.params.id.replace(/^openclaw:core:/, '') : event.toolName;
  if (statusTools.includes(name)) return;
  if (!source || ctx.sessionKey !== source.sessionKey || ctx.sessionId !== source.sessionId ||
      ctx.agentId !== source.agentId || ctx.requester?.channel !== source.channel ||
      ctx.requester?.accountId !== source.accountId || ctx.requester?.senderId !== source.senderId ||
      !larkDevelopmentSource(groupId, host, source) || !parentTools.includes(name))
    return block;
  if (name !== 'sessions_spawn') return;
  const args = compact ? event.params?.args : event.params;
  if (!args || Object.keys(args).some(key => !['runtime', 'agentId', 'mode', 'thread', 'task', 'label', 'sandbox'].includes(key)) ||
      args.agentId !== LARK_DEVELOPMENT_AGENT || (args.runtime ?? 'subagent') !== 'subagent' ||
      (args.mode ?? 'run') !== 'run' || (args.thread ?? false) !== false ||
      (args.sandbox !== undefined && args.sandbox !== 'require') ||
      typeof args.task !== 'string' || !args.task.trim() || args.task.length > 32000)
    return { block: true, blockReason: 'Delegate one run to the configured nori-development sandbox.' };
  const params = { ...args, runtime: 'subagent', mode: 'run', sandbox: 'require' };
  return { params: compact ? { ...event.params, args: params } : params };
}

export function isLarkDevelopmentSession(groupId, ctx) {
  // Never authorize with a session key alone. This only identifies a turn
  // that must be denied when its full host-provided source does not match.
  return groupId && ctx.sessionKey?.startsWith(`agent:main:feishu:group:${groupId}:`);
}
