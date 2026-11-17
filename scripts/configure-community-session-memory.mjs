// Pure candidate transformation. Does not write a config, move history or start a Gateway.
// Call only after assigning a clean public workspace and a native per-session sandbox.
import { isAbsolute, resolve } from 'node:path';

const fail = reason => { throw new Error(`community_session_memory_${reason}`); };
const remembered = (cfg, id) => cfg.agents?.entries?.[id]?.memory?.search?.rememberAcrossConversations
  ?? cfg.memory?.search?.rememberAcrossConversations
  ?? ((cfg.session?.dmScope === undefined || cfg.session.dmScope === 'main') &&
    !(cfg.bindings ?? []).some(binding => binding.session?.dmScope !== undefined));

export function configureCommunitySessionMemory(candidate, { previousConfig, agentId = 'nori-community' }) {
  if (!previousConfig?.agents?.entries || candidate.agents?.list) fail('explicit_agents_required');
  // Global identity aliases can merge otherwise sender-scoped Discord DM keys.
  // Refuse the candidate instead of silently deleting aliases used by internal agents.
  if (Object.keys(candidate.session?.identityLinks ?? {}).length) fail('session_aliases_incompatible');
  const cfg = structuredClone(candidate);
  const community = cfg.agents?.entries?.[agentId];
  if (!community || !isAbsolute(community.workspace ?? '')) fail('public_workspace_required');
  const root = resolve(community.workspace);
  for (const [id, agent] of Object.entries(cfg.agents.entries)) {
    if (id === agentId) continue;
    const workspace = agent.workspace ?? cfg.agents.defaults?.workspace;
    if (!workspace || resolve(workspace) === root || root.startsWith(resolve(workspace) + '/') ||
        resolve(workspace).startsWith(root + '/'))
      fail('workspace_overlaps_internal');
    if (!previousConfig.agents.entries[id]) fail('internal_baseline_required');
  }
  if (community.sandbox?.mode !== 'all' || community.sandbox?.scope !== 'session' ||
      community.sandbox?.workspaceAccess !== 'none') fail('session_sandbox_required');
  if ((cfg.agents.defaults?.sandbox?.sessionToolsVisibility ?? 'spawned') !== 'spawned')
    fail('sandbox_visibility_incompatible');
  if (cfg.plugins?.slots?.memory && cfg.plugins.slots.memory !== 'memory-core') fail('native_memory_core_required');
  if (!(cfg.bindings ?? []).some(binding => binding.agentId === agentId && binding.match?.channel === 'discord'))
    fail('discord_binding_required');
  if ((cfg.bindings ?? []).some(binding => binding.match?.channel === 'discord' && binding.agentId !== agentId))
    fail('discord_shared_with_internal');

  const globalPaths = cfg.memory?.search?.extraPaths ?? [];
  for (const [id, agent] of Object.entries(cfg.agents.entries)) {
    if (id === agentId) continue;
    agent.memory ??= {}; agent.memory.search ??= {};
    // Adding ANY binding dmScope otherwise silently disables main's inferred private recall.
    agent.memory.search.rememberAcrossConversations = remembered(previousConfig, id);
    agent.memory.search.extraPaths = [...globalPaths, ...(agent.memory.search.extraPaths ?? [])];
  }
  if (cfg.memory?.search) delete cfg.memory.search.extraPaths;
  community.memory ??= {};
  community.memory.search = { ...community.memory.search, enabled: true, provider: 'none',
    sources: ['sessions'], experimental: { ...community.memory.search?.experimental, sessionMemory: true },
    rememberAcrossConversations: false, extraPaths: [] };
  if (!Array.isArray(community.tools?.allow) || community.tools.allow.length === 0)
    fail('explicit_community_tools_required');
  // Native sessions_search filters by the canonical conversation key before querying retained
  // windows. memory_search alone currently loses older rotated-ID windows at this pin;
  // the current Gateway reset retains the ID and is supported by both tools.
  const recallTools = ['memory_search', 'sessions_search', 'sessions_history'];
  community.tools.allow = [...new Set([...community.tools.allow, ...recallTools])];
  community.tools.sandbox ??= {}; community.tools.sandbox.tools ??= {};
  community.tools.sandbox.tools.alsoAllow = [...new Set([
    ...(community.tools.sandbox.tools.alsoAllow ?? []), ...recallTools,
  ])];
  for (const binding of cfg.bindings) if (binding.agentId === agentId) {
    if (binding.match?.channel !== 'discord') fail('unsupported_community_channel');
    binding.session = { ...binding.session, dmScope: 'per-account-channel-peer' };
  }
  cfg.plugins ??= {}; cfg.plugins.entries ??= {};
  const plugin = cfg.plugins.entries['memory-core'] ??= {};
  if (plugin.enabled === false) fail('memory_core_disabled');
  plugin.config ??= {}; plugin.config.memoryPolicy ??= {};
  const exclusions = plugin.config.memoryPolicy.excludeSessions ??= {};
  // These are native dreaming/backfill exclusions, NOT transcript-index exclusions.
  exclusions.channels = [...new Set([...(exclusions.channels ?? []), 'discord'])];
  return cfg;
}
