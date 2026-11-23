import { fileURLToPath } from 'node:url';
import { validateRouterConfig } from '../plugins/rein-router/policy.mjs';
import { assertRuntimeConfig } from '../plugins/rein-router/runtime.mjs';
import { isLarkChatId, isLarkSenderId } from '../plugins/rein-router/scoped-policy.mjs';

const roles = { community: 'nori-community', internal: 'main' };
const accountId = role => `lark-${role}`;
const fail = reason => { throw new Error(`lark_routing_${reason}`); };

function validateAccount(source) {
  if (!source || !/^cli_[0-9a-f]{16}$/.test(source.appId) ||
      !/^[A-Z][A-Z0-9_]{0,127}$/.test(source.appSecretEnv) ||
      !Array.isArray(source.groupIds) || !source.groupIds.length || source.groupIds.length > 64 ||
      !source.groupIds.every(isLarkChatId) || new Set(source.groupIds).size !== source.groupIds.length)
    fail('invalid_account');
}

/** Prepare an explicit shared Gateway candidate. No credentials, deploy or state mutation. */
export function configureLarkRouting({ original, consoleSettings, workspaceId, community, internal, acknowledgementPluginPath }) {
  validateAccount(community);
  validateAccount(internal);
  if (community.appId === internal.appId || community.appSecretEnv === internal.appSecretEnv)
    fail('account_overlap');
  if (community.groupIds.some(id => internal.groupIds.includes(id))) fail('group_overlap');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(workspaceId ?? '')) fail('workspace_required');
  if (!Array.isArray(internal.senderIds) || !internal.senderIds.length ||
      !internal.senderIds.every(isLarkSenderId) || new Set(internal.senderIds).size !== internal.senderIds.length)
    fail('trusted_internal_senders_required');

  const config = structuredClone(original);
  const settings = structuredClone(consoleSettings);
  if (!config?.agents?.entries?.main || !config.agents.entries['nori-community'] ||
      !config.channels?.slack?.enabled || !config.channels.discord?.enabled ||
      !config.bindings?.some(binding => binding.agentId === 'nori-community' && binding.match?.channel === 'discord') ||
      !config.bindings.some(binding => binding.agentId === 'main' && binding.match?.channel === 'slack') ||
      config.channels?.feishu || config.bindings.some(binding => binding.match?.channel === 'feishu'))
    fail('shared_gateway_baseline_required');
  const router = config.plugins?.entries?.['rein-router']?.config;
  const policy = router?.scopedPolicies?.['nori-community'];
  const consolePolicy = settings?.scopedPolicies?.['nori-community'];
  if (!router?.enabled || !policy?.usageLimits || !consolePolicy?.usageLimits ||
      JSON.stringify(policy.allowedRoutes) !== JSON.stringify(consolePolicy.allowedRoutes) ||
      [policy, consolePolicy].some(entry => !Array.isArray(entry.origins) ||
        entry.origins.some(origin => origin.platform === 'feishu')))
    fail('community_router_baseline_required');

  const origin = { platform: 'feishu', accountId: accountId('community'), workspaceId, channelIds: [...community.groupIds] };
  policy.origins.push(origin);
  consolePolicy.origins.push(structuredClone(origin));

  config.channels.feishu = {
    enabled: true, domain: 'lark', connectionMode: 'websocket', defaultAccount: accountId('community'),
    dmPolicy: 'disabled', groupPolicy: 'allowlist', requireMention: true,
    allowBots: false, historyLimit: 0, contextVisibility: 'allowlist', groupSessionScope: 'group_topic_sender',
    configWrites: false, resolveSenderNames: false, typingIndicator: false, renderMode: 'raw',
    reactionNotifications: 'off',
    streaming: { mode: 'off' },
    tools: { doc: false, chat: false, wiki: false, drive: false, perm: false, scopes: false, bitable: false },
    // No broad Lark group inherits native Main tools or cross-platform recall.
    groups: { '*': { tools: { allow: ['rein_status', 'rein_route_status'] } } },
    accounts: {},
  };
  for (const [role, source] of Object.entries({ community, internal })) {
    config.channels.feishu.accounts[accountId(role)] = {
      enabled: true, appId: source.appId,
      appSecret: { source: 'env', provider: 'default', id: source.appSecretEnv },
      groupAllowFrom: [...source.groupIds],
      ...(role === 'internal' ? { groupSenderAllowFrom: [...source.senderIds] } : {}),
    };
    config.bindings.push({ agentId: roles[role], match: { channel: 'feishu', accountId: accountId(role) } });
  }
  config.plugins.entries.feishu = { enabled: true };
  config.plugins.allow = [...new Set([...(config.plugins.allow ?? []), 'feishu'])];
  const memory = config.plugins.entries['memory-core'];
  if (memory && memory.enabled !== false) {
    memory.config ??= {};
    memory.config.memoryPolicy ??= {};
    const exclusions = memory.config.memoryPolicy.excludeSessions ??= {};
    exclusions.channels = [...new Set([...(exclusions.channels ?? []), 'feishu'])];
  }
  assertRuntimeConfig(validateRouterConfig(router), config);
  return { config: configureLarkAcknowledgements(config, acknowledgementPluginPath), consoleSettings: settings };
}

// Also applies to an existing dual-account gateway without recreating its routes.
export function configureLarkAcknowledgements(original, acknowledgementPluginPath =
  fileURLToPath(new URL('../plugins/rein-lark-acknowledgements', import.meta.url))) {
  const config = structuredClone(original);
  const channel = config.channels?.feishu;
  if (!channel?.enabled || !Object.entries(roles).every(([role, agentId]) =>
    channel.accounts?.[accountId(role)]?.enabled && config.bindings?.some(binding =>
      binding.agentId === agentId && binding.match?.channel === 'feishu' && binding.match.accountId === accountId(role))))
    fail('dual_account_bindings_required');
  const acknowledgements = 'rein-lark-acknowledgements';
  config.plugins ??= {};
  config.plugins.entries ??= {};
  const entry = config.plugins.entries[acknowledgements] ??= {};
  entry.enabled = true;
  entry.hooks = { ...entry.hooks, allowConversationAccess: true };
  if (config.plugins.allow?.length && !config.plugins.allow.includes(acknowledgements))
    config.plugins.allow.push(acknowledgements);
  config.plugins.load ??= {};
  config.plugins.load.paths = [...new Set([...(config.plugins.load.paths ?? []), acknowledgementPluginPath])];
  return config;
}
