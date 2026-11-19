import { resolve } from 'node:path';
import { validateIntroductionConfig } from '../plugins/rein-member-introductions/reader.mjs';

// Pure additive builder. The operator applies the candidate with native config validation.
export function configureDiscordOnboarding(current, { pluginPath, statePath, guildId,
  introductionsChannelId, agentId = 'nori-community', accountId = 'default' }) {
  const config = structuredClone(current);
  const pluginConfig = validateIntroductionConfig({ enabled: true, statePath, guildId, introductionsChannelId, agentId, accountId });
  const agent = config.agents?.entries?.[agentId];
  const guild = config.channels?.discord?.guilds?.[guildId];
  if (!agent || !guild || config.channels.discord.enabled !== true) throw new Error('Existing Discord community scope required');
  if (!config.bindings?.some(binding => binding.agentId === agentId && binding.match?.channel === 'discord' &&
      binding.match?.accountId === accountId)) throw new Error('Existing Discord account binding required');
  if (!Array.isArray(agent.tools?.allow) || !Array.isArray(agent.tools?.sandbox?.tools?.alsoAllow) ||
      !Array.isArray(guild.tools?.allow)) throw new Error('Explicit Community tool policies required');
  const name = 'rein_my_introduction';
  agent.tools.allow = [...new Set([...agent.tools.allow, name])];
  agent.tools.sandbox.tools.alsoAllow = [...new Set([...agent.tools.sandbox.tools.alsoAllow, name])];
  guild.tools.allow = [...new Set([...guild.tools.allow, name])];
  for (const channel of Object.values(guild.channels ?? {})) {
    if (Array.isArray(channel.tools?.allow)) channel.tools.allow = [...new Set([...channel.tools.allow, name])];
  }
  config.plugins ??= {}; config.plugins.load ??= {}; config.plugins.entries ??= {};
  config.plugins.load.paths = [...new Set([...(config.plugins.load.paths ?? []), resolve(pluginPath)])];
  config.plugins.allow = [...new Set([...(config.plugins.allow ?? []), 'rein-member-introductions'])];
  config.plugins.entries['rein-member-introductions'] = { enabled: true, config: pluginConfig };
  return config;
}

export function dailyOnboardingJob({ nodePath, scriptPath, configPath, envFile }) {
  for (const path of [nodePath, scriptPath, configPath, envFile]) if (!path?.startsWith('/')) throw new Error('Absolute operator paths required');
  return { name: 'discord-daily-onboarding', description: 'Daily newcomer welcomes; Sunday optional introduction reminders with a seven-day per-member cooldown. Fixed PST 08:00.', enabled: true, schedule: { kind: 'cron', expr: '0 16 * * *', tz: 'UTC', staggerMs: 0 },
    sessionTarget: 'isolated', wakeMode: 'now', delivery: { mode: 'none' },
    payload: { kind: 'command', argv: [nodePath, `--env-file=${envFile}`, scriptPath, '--config', configPath], timeoutSeconds: 600 } };
}

// Reuse already-enrolled backend principals; this never adds an ingress workspace or a role.
export function configureLinkedMemberProfiles(current, { agentIds }) {
  const next = structuredClone(current);
  const entry = next.plugins?.entries?.['rein-member-introductions'];
  if (entry?.enabled !== true || entry.config?.enabled !== true) throw new Error('Existing introduction archive required');
  const cfg = validateIntroductionConfig({ ...entry.config, linkedProfiles: agentIds });
  const operations = next.plugins.entries['rein-operations'];
  if (operations?.enabled !== true) throw new Error('Existing backend profiles required');
  const add = values => [...new Set([...values, 'rein_my_introduction'])];
  for (const agentId of cfg.linkedProfiles) {
    const profile = operations.config?.agentProfiles?.[agentId];
    const agent = next.agents?.entries?.[agentId];
    if (!agent || !profile || !['slack', 'discord'].includes(profile.platform) || !profile.accountId || profile.foundationDb?.enabled !== true)
      throw new Error('Existing enrolled agent required');
    if (!next.bindings?.some(b => b.agentId === agentId && b.match?.channel === profile.platform &&
        (b.match.accountId === undefined || b.match.accountId === '*' || b.match.accountId === profile.accountId))) throw new Error('Existing channel binding required');
    agent.tools ??= {};
    if (Array.isArray(agent.tools.allow)) agent.tools.allow = add(agent.tools.allow);
    else agent.tools.alsoAllow = add(agent.tools.alsoAllow ?? []);
    if (Array.isArray(agent.tools.sandbox?.tools?.alsoAllow)) agent.tools.sandbox.tools.alsoAllow = add(agent.tools.sandbox.tools.alsoAllow);
    const channel = next.channels?.[profile.platform];
    if (!channel || channel.enabled !== true) throw new Error('Enabled channel required');
    const enrollments = profile.foundationDb.workspaces;
    if (!Array.isArray(enrollments) || enrollments.some(w => w.platform !== profile.platform)) throw new Error('Profile platform mismatch');
    // Native per-channel policies can further restrict tools. Extend only enrolled rooms.
    const accounts = [channel, channel.accounts?.[profile.accountId]].filter(Boolean);
    for (const account of accounts) {
      if (Array.isArray(account.tools?.allow)) account.tools.allow = add(account.tools.allow);
      for (const w of enrollments) {
        if (profile.platform === 'discord') {
          const guild = account.guilds?.[w.workspaceId];
          if (Array.isArray(guild?.tools?.allow)) guild.tools.allow = add(guild.tools.allow);
          for (const id of w.nativeChannelIds ?? []) if (Array.isArray(guild?.channels?.[id]?.tools?.allow)) guild.channels[id].tools.allow = add(guild.channels[id].tools.allow);
        } else {
          for (const id of w.nativeChannelIds ?? []) if (Array.isArray(account.channels?.[id]?.tools?.allow)) account.channels[id].tools.allow = add(account.channels[id].tools.allow);
        }
      }
    }
  }
  entry.config = cfg;
  return next;
}
