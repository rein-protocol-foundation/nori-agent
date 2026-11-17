// Transitional native configuration: retain the existing Discord database owner and histories.
import { configureCommunitySessionMemory } from './configure-community-session-memory.mjs';
import { COMMUNITY_REQUEST_LIMITS } from './configure-community-gateway.mjs';
import { validateRouterConfig } from '../plugins/rein-router/policy.mjs';
import { assertRuntimeConfig } from '../plugins/rein-router/runtime.mjs';

export function configureExistingCommunity({ original, workspace, sandbox, dmUserIds, dmChannelIds,
  singletonKeyEnv = 'NORI_COMMUNITY_FLASH_KEY', sharedSkillsDir }) {
  const fail = () => { throw new Error('existing_community_configuration_invalid'); };
  if (original.agents?.list || Object.keys(original.agents?.entries ?? {}).some(id => id !== 'main') ||
      original.bindings?.some(b => b.agentId !== 'main' || b.match?.channel !== 'discord') ||
      Object.entries(original.channels ?? {}).some(([id, c]) => id !== 'discord' && c.enabled === true) ||
      original.channels?.discord?.enabled !== true) fail();
  for (const values of [dmUserIds, dmChannelIds])
    if (!Array.isArray(values) || !values.length || values.some(id => !/^\d{17,20}$/.test(id))) fail();
  const cfg = structuredClone(original);
  const recall = ['read', 'memory_search', 'sessions_search', 'sessions_history', 'rein_route_status'];
  const allow = [...recall, 'web_search', 'web_fetch', 'message', 'rein_resources_search', 'rein_resource_get',
    'rein_events_search', 'rein_event_get', 'rein_identity_bind_start', 'rein_identity_bind_status',
    'rein_identity_bind_complete', 'rein_status'];
  cfg.agents ??= {}; cfg.agents.defaults ??= {};
  // This standalone Gateway has only the Community agent. Its public seed is provisioned
  // before activation; runtime bootstrap must not try to create files in the immutable seed.
  cfg.agents.defaults.skipBootstrap = true;
  cfg.agents.entries = { main: { name: 'Nori · Community', workspace,
    model: { primary: 'rein-magpie/auto', fallbacks: [] }, sandbox: structuredClone(sandbox),
    tools: { allow, elevated: { enabled: false }, fs: { workspaceOnly: true },
      message: { crossContext: { allowWithinProvider: false, allowAcrossProviders: false } },
      sandbox: { tools: { alsoAllow: allow } } } } };
  cfg.bindings = [{ agentId: 'main', match: { channel: 'discord', accountId: 'default' },
    session: { dmScope: 'per-account-channel-peer' } }];
  cfg.channels.discord.dmPolicy = 'allowlist'; cfg.channels.discord.allowFrom = [...new Set(dmUserIds)];
  for (const guild of Object.values(cfg.channels.discord.guilds ?? {}))
    if (Array.isArray(guild.tools?.allow)) guild.tools.allow = [...new Set([...guild.tools.allow, ...recall])];
  if (sharedSkillsDir) {
    cfg.skills ??= {}; cfg.skills.load ??= {};
    cfg.skills.load.extraDirs = [...new Set([...(cfg.skills.load.extraDirs ?? []), sharedSkillsDir])];
  }
  const router = cfg.plugins?.entries?.['rein-router']?.config;
  const route = router?.routes?.find(r => r.id === 'general');
  if (router?.scopedPolicies || route?.gatewayModel !== 'bailian-token-plan/deepseek-v4.1-flash') fail();
  route.gatewayKeyEnvVar = singletonKeyEnv;
  router.gateway.apiKeyEnvVar = singletonKeyEnv;
  cfg.models.providers['rein-magpie'].apiKey = { source: 'env', provider: 'default', id: singletonKeyEnv };
  const origins = cfg.plugins.entries['rein-operations']?.config?.foundationDb?.workspaces
    ?.filter(w => w.platform === 'discord').map((w, index) => ({ platform: 'discord', accountId: 'default',
      workspaceId: w.workspaceId, channelIds: [...new Set([...w.nativeChannelIds, ...(index === 0 ? dmChannelIds : [])])] }));
  if (!origins?.length) fail();
  router.scopedPolicies = { main: { allowedRoutes: ['general'], allowPaidUsage: false,
    default: { primary: 'general', fallbacks: [] }, origins,
    maxOutputTokens: Math.min(4096, route.maxTokens), requestTimeoutMs: 180000,
    usageLimits: { ...COMMUNITY_REQUEST_LIMITS } } };
  const config = configureCommunitySessionMemory(cfg, { previousConfig: { agents: { entries: {} } }, agentId: 'main' });
  config.plugins.allow = [...new Set([...(config.plugins.allow ?? []), 'memory-core'])];
  assertRuntimeConfig(validateRouterConfig(router), config);
  return { config, databaseOwnerUnchanged: 'main', activationReady: false,
    required: ['Immutable public seed verified as service user', 'Dedicated singleton model key',
      'Locked backup and single-service restart', 'Real DM/public/restart acceptance'] };
}
