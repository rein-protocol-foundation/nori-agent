// Pure candidate builder. Activation, credential loading and history migration are separate.
import { configureDiscordVoiceIdentity } from './configure-discord-voice-identity.mjs';
import { validateDashboardConfig } from './dashboard-server.mjs';
import { configureCommunitySessionMemory } from './configure-community-session-memory.mjs';
import { scopedGatewayKeyEnv } from '../plugins/rein-router/catalog-sync.mjs';
import { validateRouterConfig } from '../plugins/rein-router/policy.mjs';
import { assertRuntimeConfig } from '../plugins/rein-router/runtime.mjs';

export const COMMUNITY_REQUEST_LIMITS = Object.freeze({ perUserPerMinute: 6,
  perConversationPerMinute: 30, perUserConcurrent: 2, perConversationConcurrent: 4,
  maxConcurrent: 8, maxGatewayRequestsPerDay: 2000 });
const fail = reason => { throw new Error(`community_gateway_${reason}`); };
const credentialFields = ['backendApiBaseUrlEnvVar', 'agentCallerIdEnvVar',
  'agentCredentialEnvVar', 'proposalConfirmationKeyEnvVar'];

export function configureCommunityGateway({ internal, discord, consoleSettings, workspace,
  sandbox, dmUserIds, dashboardConfig, maxOutputTokens = 4096, requestTimeoutMs = 180000 }) {
  const agentId = 'nori-community';
  if (!internal?.agents?.entries?.main || internal.agents.entries[agentId] ||
      internal.bindings?.some(b => b.match?.channel === 'discord')) fail('baseline_invalid');
  if (!sandbox || sandbox.mode !== 'all' || sandbox.scope !== 'session' ||
      sandbox.workspaceAccess !== 'none') fail('sandbox_required');
  if (!Array.isArray(dmUserIds) || !dmUserIds.length ||
      dmUserIds.some(id => !/^\d{17,20}$/.test(id))) fail('test_dm_allowlist_required');
  const prior = structuredClone(internal), cfg = structuredClone(internal);
  cfg.agents.defaults ??= {};
  cfg.agents.defaults.heartbeat ??= {};
  cfg.agents.defaults.heartbeat.target ??= 'owner';
  const mainOperations = cfg.plugins?.entries?.['rein-operations'];
  const discordOperations = discord.plugins?.entries?.['rein-operations'];
  if (mainOperations?.enabled !== true || discordOperations?.enabled !== true ||
      mainOperations.config?.agentProfiles || discordOperations.config?.agentProfiles ||
      Object.keys(mainOperations.config ?? {}).some(k => k !== 'foundationDb') ||
      Object.keys(discordOperations.config ?? {}).some(k => k !== 'foundationDb')) fail('operations_baseline_invalid');
  const mainDb = mainOperations.config.foundationDb;
  const communityDb = structuredClone(discordOperations.config.foundationDb);
  if (communityDb) {
    communityDb.workspaces = communityDb.workspaces?.filter(w => w.platform === 'discord');
    communityDb.platform = 'discord';
    communityDb.proposalChannelIds = []; communityDb.boardChannelIds = [];
    delete communityDb.proposalConfirmationKeyEnvVar;
    delete communityDb.voteTypeAliases;
  }
  if (mainDb?.enabled !== true || communityDb?.enabled !== true ||
      !communityDb.workspaces?.length ||
      mainDb.workspaces?.some(w => w.platform !== 'slack')) fail('backend_scope_invalid');
  const environmentMapping = {};
  for (const field of credentialFields) {
    const source = communityDb[field];
    if (source === undefined && field === 'proposalConfirmationKeyEnvVar') continue;
    if (typeof source !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(source)) fail('credential_locator_invalid');
    const target = `NORI_COMMUNITY_${source}`;
    if (Object.values(mainDb).includes(target)) fail('credential_locator_collision');
    communityDb[field] = target; environmentMapping[target] = source;
  }
  mainOperations.config = { agentProfiles: {
    ...Object.fromEntries(Object.keys(cfg.agents.entries).map(id => [id,
      { platform: 'slack', accountId: 'default', capabilities: 'internal', foundationDb: structuredClone(mainDb) }])),
    [agentId]: { platform: 'discord', accountId: 'default', capabilities: 'community', foundationDb: communityDb },
  } };
  if (discord.channels?.discord?.enabled !== true) fail('discord_disabled');
  cfg.channels ??= {}; cfg.channels.discord = structuredClone(discord.channels.discord);
  // Begin with explicitly authorized test identities. Public guild policy is retained.
  configureDiscordVoiceIdentity(cfg.channels.discord);
  cfg.channels.discord.dmPolicy = 'allowlist'; cfg.channels.discord.allowFrom = [...new Set(dmUserIds)];
  const tools = ['read', 'web_search', 'web_fetch', 'message', 'memory_search', 'sessions_search',
    'sessions_history', 'rein_route_status', 'rein_resources_search', 'rein_resource_get',
    'rein_events_search', 'rein_event_get', 'rein_identity_bind_start', 'rein_identity_bind_status',
    'rein_identity_bind_complete', 'rein_status'];
  cfg.agents.entries[agentId] = { name: 'Nori · Community', workspace,
    model: { primary: 'rein-magpie/auto', fallbacks: [] }, sandbox: structuredClone(sandbox),
    tools: { allow: tools, fs: { workspaceOnly: true }, elevated: { enabled: false },
      message: { crossContext: { allowWithinProvider: false, allowAcrossProviders: false } },
      sandbox: { tools: { alsoAllow: tools } } } };
  // The native channel group allowlist intersects the agent tool policy.
  for (const guild of Object.values(cfg.channels.discord.guilds ?? {})) {
    if (Array.isArray(guild.tools?.allow)) guild.tools.allow = [...new Set([...guild.tools.allow,
      'read', 'memory_search', 'sessions_search', 'sessions_history', 'rein_route_status'])];
  }
  cfg.bindings ??= [];
  cfg.bindings.push({ agentId, match: { channel: 'discord', accountId: 'default' },
    session: { dmScope: 'per-account-channel-peer' } });
  cfg.plugins.entries.discord = { ...cfg.plugins.entries.discord, enabled: true };
  cfg.plugins.allow = [...new Set([...(cfg.plugins.allow ?? []), 'discord', 'memory-core'])];
  const router = cfg.plugins.entries['rein-router']?.config;
  if (!router || router.scopedPolicies?.[agentId]) fail('router_baseline_invalid');
  const general = router.routes?.find(r => r.id === 'general');
  if (general?.gatewayModel !== 'bailian-token-plan/deepseek-v4.1-flash') fail('flash_route_required');
  general.gatewayKeyEnvVar = scopedGatewayKeyEnv(general.gatewayModel);
  const policy = { allowedRoutes: ['general'], allowPaidUsage: false,
    default: { primary: 'general', fallbacks: [] },
    origins: communityDb.workspaces.map((w, index) => ({ platform: 'discord', accountId: 'default',
      workspaceId: w.workspaceId, channelIds: [...w.nativeChannelIds], ...(index === 0 ? { directMessages: true } : {}) })),
    maxOutputTokens, requestTimeoutMs, usageLimits: { ...COMMUNITY_REQUEST_LIMITS } };
  router.scopedPolicies = { ...router.scopedPolicies, [agentId]: policy };
  const settings = structuredClone(consoleSettings);
  if (!settings || settings.policy?.general?.model !== general.gatewayModel || settings.enabled !== true)
    fail('console_baseline_invalid');
  settings.scopedPolicies = { ...settings.scopedPolicies, [agentId]: policy };
  // Native display metadata only: keep main's ID, workspace, history and capabilities.
  cfg.agents.entries.main.name = 'Nori · 主助手';
  cfg.agents.entries.main.identity = { ...cfg.agents.entries.main.identity, name: 'Nori · 主助手' };
  const config = configureCommunitySessionMemory(cfg, { previousConfig: prior });
  let dashboard;
  if (dashboardConfig !== undefined) {
    const source = validateDashboardConfig(structuredClone(dashboardConfig));
    const matches = source.instances.filter(instance => instance.port === config.gateway?.port &&
      instance.basePath === config.gateway?.controlUi?.basePath);
    if (matches.length !== 1) fail('dashboard_target_mismatch');
    // Reuse the internal Gateway route and auth settings; never merge session stores here.
    dashboard = { ...source, instances: [{ ...matches[0], label: 'Nori' }] };
  }
  assertRuntimeConfig(validateRouterConfig(router), config);
  return { config, consoleSettings: settings, environmentMapping,
    ...(dashboard ? { dashboardConfig: dashboard } : {}),
    // Native console synchronization creates/reuses the singleton key and publishes gateway.env.
    singletonKeyEnvironment: general.gatewayKeyEnvVar, activationReady: false,
    activationRequirements: ['Verify public workspace and its ancestors are immutable to the Gateway service identity.',
      'Verify read-only bootstrap provisioning without changing the main agent bootstrap defaults.',
      'Load distinct backend credentials and confirm native singleton model-key synchronization.',
      'Back up local files, preserve all Slack data and prepare the owner-approved fresh Discord state cutover.',
      'Switch the Dashboard to the verified shared Gateway and verify native role names, login, WebSocket and retained Slack sessions.',
      'Complete single-consumer cutover and real channel acceptance.'] };
}
