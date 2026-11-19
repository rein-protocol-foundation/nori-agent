// Pure access/configuration update for an existing isolated Community agent.
// Deployment, credentials, skills publication and provider acceptance remain operator actions.
import { isAbsolute } from 'node:path';

export const COMMUNITY_SERVICE_TOOLS = Object.freeze([
  'read', 'web_search', 'web_fetch', 'rein_member_status',
  'rein_resources_search', 'rein_resource_get', 'rein_events_search', 'rein_event_get',
  'rein_identity_bind_start', 'rein_identity_bind_status', 'rein_identity_bind_complete',
]);

export function configureCommunityAccess(input, { sharedSkillsDir } = {}) {
  const cfg = structuredClone(input);
  const agent = cfg.agents?.entries?.['nori-community'];
  if (!agent || agent.sandbox?.mode !== 'all' || agent.sandbox?.scope !== 'session' ||
      agent.sandbox?.workspaceAccess !== 'none' || !Array.isArray(agent.tools?.allow)) {
    throw new Error('community_access_isolated_agent_required');
  }
  if (!isAbsolute(sharedSkillsDir ?? '')) throw new Error('community_access_shared_skills_directory_required');
  const discord = cfg.channels?.discord;
  if (discord?.enabled !== true) throw new Error('community_access_discord_required');
  const profile = cfg.plugins?.entries?.['rein-operations']?.config?.agentProfiles?.['nori-community'];
  const workspaces = profile?.foundationDb?.workspaces?.filter(w => w.platform === 'discord');
  if (profile?.capabilities !== 'community' || profile.platform !== 'discord' || workspaces?.length !== 1) {
    throw new Error('community_access_unique_dm_workspace_required');
  }
  workspaces[0].directMessages = true;
  discord.dmPolicy = 'open';
  discord.allowFrom = ['*'];
  const add = values => [...new Set([...values, ...COMMUNITY_SERVICE_TOOLS])];
  agent.tools.allow = add(agent.tools.allow);
  agent.tools.sandbox ??= {};
  agent.tools.sandbox.tools ??= {};
  agent.tools.sandbox.tools.alsoAllow = add(agent.tools.sandbox.tools.alsoAllow ?? []);
  for (const guild of Object.values(discord.guilds ?? {})) {
    if (Array.isArray(guild.tools?.allow)) guild.tools.allow = add(guild.tools.allow);
    for (const channel of Object.values(guild.channels ?? {})) {
      if (Array.isArray(channel.tools?.allow)) channel.tools.allow = add(channel.tools.allow);
    }
  }
  cfg.skills ??= {}; cfg.skills.load ??= {};
  cfg.skills.load.extraDirs = [...new Set([...(cfg.skills.load.extraDirs ?? []), sharedSkillsDir])];
  cfg.tools ??= {}; cfg.tools.web ??= {}; cfg.tools.web.search ??= {};
  cfg.tools.web.search.enabled = true;
  cfg.tools.web.fetch ??= {}; cfg.tools.web.fetch.enabled = true;
  // Keep an explicitly configured provider. Supply an opt-in, keyless native provider otherwise.
  if (!cfg.tools.web.search.provider || cfg.tools.web.search.provider === 'auto') {
    cfg.tools.web.search.provider = 'parallel-free';
  }
  if (cfg.tools.web.search.provider === 'parallel-free') {
    cfg.plugins ??= {}; cfg.plugins.entries ??= {};
    cfg.plugins.entries.parallel = { ...cfg.plugins.entries.parallel, enabled: true };
    if (Array.isArray(cfg.plugins.allow)) cfg.plugins.allow = [...new Set([...cfg.plugins.allow, 'parallel'])];
  }
  return cfg;
}
