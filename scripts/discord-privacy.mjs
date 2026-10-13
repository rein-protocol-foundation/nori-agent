import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discordAccountPolicies, effectiveDiscordDmScopes } from './discord-dm-scopes.mjs';

// Audit the pinned runtime's configuration; this is not a security certification.
// In this pin groupScope supports only per-group/main. dmScope never adds a
// sender to a guild/channel session key (see OpenClaw routing/session-key.ts).
export function inspectDiscordPrivacy(config) {
  const discord = config.channels?.discord;
  const enabled = Boolean(discord) && discord.enabled !== false;
  const effectiveDmScopes = enabled ? effectiveDiscordDmScopes(config) : [];
  const dmEnabled = enabled && effectiveDmScopes.length > 0;
  const roomsEnabled = enabled && discordAccountPolicies(discord).some(([,policy]) => policy.groupPolicy !== 'disabled');
  const dmScope = config.session?.dmScope ?? 'main';
  const groupScope = config.session?.groupScope ?? 'per-group';
  const configuredRecall = config.memory?.search?.rememberAcrossConversations;
  const bindingDmOverride = (config.bindings ?? []).some(b => b.session?.dmScope !== undefined);
  const recall = configuredRecall ?? (dmScope === 'main' && !bindingDmOverride);
  const findings = [];
  if (roomsEnabled) findings.push({ code: 'guild_session_shared', severity: 'critical',
    detail: 'Guild conversations use a channel/group key without sender ID. Per-user public-channel sessions are not implemented by dmScope.' });
  if (dmEnabled && effectiveDmScopes.includes('main')) findings.push({ code: 'dm_session_shared', severity: 'critical',
    detail: 'An enabled Discord DM route uses a shared main session after applying matching binding overrides and precedence.' });
  if (enabled && config.tools?.fs?.workspaceOnly !== true) findings.push({ code: 'filesystem_unconfined', severity: 'warning',
    detail: 'Filesystem confinement is not explicitly enabled; an available read tool can reach files outside the shared workspace.' });
  if (enabled && config.tools?.sessions?.visibility !== 'self') findings.push({ code: 'session_tool_scope', severity: 'warning',
    detail: 'Session tools, if available, are not restricted to self. Self still means the shared room when room routing is shared.' });
  if (enabled && recall) findings.push({ code: 'private_recall_default', severity: 'warning',
    detail: 'Private transcript recall defaults on in main-DM mode. This is a configured potential, not evidence it ran; default group sessions have separate recall guards.' });
  if (enabled && (config.agents?.list ?? []).some(a => a.memory?.search?.rememberAcrossConversations === true)) {
    findings.push({ code: 'agent_recall_override', severity: 'warning', detail: 'An agent explicitly enables private cross-conversation recall.' });
  }
  return { enabled, dmEnabled, roomsEnabled, dmScope, effectiveDmScopes, groupScope,
    groupSessionIncludesSender: false, perUserPersistentMemoryImplemented: false,
    safeguards: { filesystemWorkspaceOnly: config.tools?.fs?.workspaceOnly === true,
      sessionToolsSelfOnly: config.tools?.sessions?.visibility === 'self',
      privateRecallEnabledByConfig: recall }, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/discord-privacy.mjs <openclaw-config.json>');
  // Print only the selected policy fields and findings, never credential-bearing config.
  const result = inspectDiscordPrivacy(JSON.parse(readFileSync(path, 'utf8')));
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.some(f => f.severity === 'critical')) process.exitCode = 1;
}
