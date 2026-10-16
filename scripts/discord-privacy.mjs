import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discordAccountPolicies, effectiveDiscordDmScopes } from './discord-dm-scopes.mjs';
import { assertIsolationRuntime } from '../plugins/rein-discord/isolation.mjs';

// Audit the pinned runtime's configuration; this is not a security certification.
// In this pin groupScope supports only per-group/main. dmScope never adds a
// sender to a guild/channel session key (see OpenClaw routing/session-key.ts).
export function inspectDiscordPrivacy(config) {
  const discord = config.channels?.discord;
  const enabled = Boolean(discord) && discord.enabled !== false;
  const adapter = config.plugins?.entries?.['rein-discord'];
  const requestedAdapter = enabled && adapter?.enabled === true;
  let isolatedAdapterConfigured = false;
  if (requestedAdapter) {
    try { assertIsolationRuntime(config, adapter.config, config.agents?.defaults?.workspace); isolatedAdapterConfigured = true; }
    catch { /* Findings never include private filesystem paths/config values. */ }
  }
  const effectiveDmScopes = !enabled ? [] : isolatedAdapterConfigured
    ? adapter.config.dmAllowFrom.length > 0 ? ['per-account-channel-peer'] : []
    : effectiveDiscordDmScopes(config);
  const dmEnabled = enabled && effectiveDmScopes.length > 0;
  const roomsEnabled = enabled && discordAccountPolicies(discord).some(([,policy]) => policy.groupPolicy !== 'disabled');
  const dmScope = config.session?.dmScope ?? 'main';
  const groupScope = config.session?.groupScope ?? 'per-group';
  const configuredRecall = config.memory?.search?.rememberAcrossConversations;
  // This pin deliberately treats ANY binding override as a multi-user signal,
  // including unrelated platforms. Preserve the actual native default below;
  // report reliance on that heuristic separately from explicit disabling.
  // vendor/openclaw/packages/memory-host-sdk/src/host/config-utils.ts
  const bindingDmOverride = (config.bindings ?? []).some(b => b.session?.dmScope !== undefined);
  const defaultRecall = dmScope === 'main' && !bindingDmOverride;
  // Canonical entries take precedence over the legacy list, as in the pinned
  // memory host. Aggregate conservatively over the roster without printing IDs.
  const roster = config.agents?.entries ? Object.values(config.agents.entries)
    : Array.isArray(config.agents?.list) ? config.agents.list.filter(Boolean) : [];
  const recallPolicies = (roster.length ? roster : [{}]).map(agent => {
    const override = agent?.memory?.search?.rememberAcrossConversations;
    const explicit = override ?? configuredRecall;
    return { override, explicit, enabled: explicit ?? defaultRecall };
  });
  const recall = recallPolicies.some(policy => policy.enabled);
  const findings = [];
  if (requestedAdapter && !isolatedAdapterConfigured) findings.push({ code: 'isolation_profile_invalid', severity: 'critical',
    detail: 'The Rein adapter profile fails its startup privacy guard. Do not start it or fall back to native Discord routing.' });
  if (isolatedAdapterConfigured) findings.push({ code: 'adapter_runtime_unverified', severity: 'warning',
    detail: 'Configuration selects the Rein owner/audience-scoped adapter. This audit does not prove the plugin loaded or real Discord account isolation; run the native pipeline probe and live acceptance.' });
  if (roomsEnabled && !isolatedAdapterConfigured) findings.push({ code: 'guild_session_shared', severity: 'critical',
    detail: 'Guild conversations use a channel/group key without sender ID. Per-user public-channel sessions are not implemented by dmScope.' });
  if (dmEnabled && effectiveDmScopes.includes('main') && !isolatedAdapterConfigured) findings.push({ code: 'dm_session_shared', severity: 'critical',
    detail: 'An enabled Discord DM route uses a shared main session after applying matching binding overrides and precedence.' });
  if (enabled && config.tools?.fs?.workspaceOnly !== true) findings.push({ code: 'filesystem_unconfined', severity: 'warning',
    detail: 'Filesystem confinement is not explicitly enabled; an available read tool can reach files outside the shared workspace.' });
  if (enabled && config.tools?.sessions?.visibility !== 'self') findings.push({ code: 'session_tool_scope', severity: 'warning',
    detail: 'Session tools, if available, are not restricted to self. Self still means the shared room when room routing is shared.' });
  if (enabled && recall) findings.push({ code: 'private_recall_default', severity: 'warning',
    detail: 'At least one configured agent can recall private transcripts through its effective policy. This is a configured potential, not evidence it ran; default group sessions have separate recall guards.' });
  if (enabled && recallPolicies.some(policy => policy.explicit === undefined && !policy.enabled) && effectiveDmScopes.includes('main')) findings.push({ code: 'private_recall_implicit_policy', severity: 'warning',
    detail: 'Private recall is currently off through the pinned host heuristic, but an effective Discord DM route is shared and recall is not explicitly disabled. Set memory.search.rememberAcrossConversations=false instead of relying on unrelated bindings.' });
  if (enabled && recallPolicies.some(policy => policy.override === true)) {
    findings.push({ code: 'agent_recall_override', severity: 'warning', detail: 'An agent explicitly enables private cross-conversation recall.' });
  }
  return { enabled, dmEnabled, roomsEnabled, dmScope, effectiveDmScopes, groupScope,
    routingImplementation: isolatedAdapterConfigured ? 'rein-isolated-v1' : 'native-or-invalid-profile', isolatedAdapterConfigured,
    groupSessionIncludesSender: isolatedAdapterConfigured, perUserPersistentMemoryImplemented: isolatedAdapterConfigured,
    safeguards: { filesystemWorkspaceOnly: config.tools?.fs?.workspaceOnly === true,
      sessionToolsSelfOnly: config.tools?.sessions?.visibility === 'self',
      privateRecallExplicitlyDisabled: recallPolicies.every(policy => policy.explicit === false),
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
