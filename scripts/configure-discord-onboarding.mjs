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
