// Read-only feasibility probe against the pinned native implementations, not replacement routing.
import assert from 'node:assert/strict';
import { buildDiscordRoutePeer, resolveDiscordConversationRoute } from '../../vendor/openclaw/extensions/discord/src/monitor/route-resolution.ts';
import { readFileSync, readdirSync } from 'node:fs';
const dist = new URL('../../vendor/openclaw/dist/', import.meta.url);
// Diagnostics may inspect the pinned build; production plugins must use public SDK interfaces.
const get = async (name, prefix) => {
  const chunks = readdirSync(dist).filter(file => file.startsWith(prefix) && file.endsWith('.mjs'));
  const chunk = chunks.find(file => readFileSync(new URL(file, dist), 'utf8').includes(`function ${name}(`));
  assert.ok(chunk, `pinned diagnostic export missing: ${name}`);
  const text = readFileSync(new URL(chunk, dist), 'utf8');
  const loaded = await import(new URL(chunk, dist).href);
  const alias = text.match(new RegExp(name + ' as ([A-Za-z_$][A-Za-z0-9_$]*)'))?.[1];
  assert.equal(typeof loaded[alias ?? name], 'function');
  return loaded[alias ?? name];
};
const resolveRememberAcrossConversations = await get('resolveRememberAcrossConversations', 'config-utils-');
const resolveMemoryHostSearchPathConfig = await get('resolveMemoryHostSearchPathConfig', 'config-utils-');
const filterMemorySearchHitsBySessionVisibility = await get('filterMemorySearchHitsBySessionVisibility', 'session-search-visibility-');
const cfg = {
  agents: { entries: { main: {}, 'nori-community': {} } },
  bindings: ['default', 'second'].map(accountId => ({ agentId: 'nori-community', match: { channel: 'discord', accountId } })),
  session: { dmScope: 'per-account-channel-peer' },
};
const route = (userId, direct, room = '100000000000000002', accountId = 'default') => resolveDiscordConversationRoute({
  cfg, accountId, guildId: direct ? undefined : '100000000000000001',
  peer: buildDiscordRoutePeer({ isDirectMessage: direct, isGroupDm: false, directUserId: userId, conversationId: room }),
});
const userA = '100000000000000003', userB = '100000000000000004';
assert.equal(route(userA, false).agentId, 'nori-community');
assert.equal(route(userA, false).sessionKey, route(userB, false).sessionKey);
assert.equal(route(userA, false, '100000000000000005').sessionKey, route(userB, false, '100000000000000005').sessionKey);
assert.notEqual(route(userA, false).sessionKey, route(userA, false, '100000000000000005').sessionKey);
assert.notEqual(route(userA, true).sessionKey, route(userB, true).sessionKey);
assert.notEqual(route(userA, true).sessionKey, route(userA, false).sessionKey);
// A second explicitly enrolled bot account must not alias the first one's DM.
assert.equal(route(userA, true, undefined, 'second').agentId, 'nori-community');
assert.notEqual(route(userA, true).sessionKey, route(userA, true, undefined, 'second').sessionKey);
assert.equal(resolveRememberAcrossConversations(cfg, 'nori-community'), false);
const memoryConfig = { ...cfg, memory: { search: { extraPaths: ['/fixture/internal-operations'] } }, agents: { entries: {
  main: {}, 'nori-community': { memory: { search: { extraPaths: [] } } },
} } };
const memory = resolveMemoryHostSearchPathConfig(memoryConfig, 'nori-community');
assert.ok(JSON.stringify(memory.extraPaths).includes('/fixture/internal-operations'));
// Path leakage is fixable by configuration; it is distinct from per-sender storage ownership.
const relocated = { ...cfg, agents: { entries: {
  main: { memory: { search: { extraPaths: ['/fixture/internal-operations'] } } },
  'nori-community': { memory: { search: { extraPaths: [] } } },
} } };
assert.deepEqual(resolveMemoryHostSearchPathConfig(relocated, 'main').extraPaths, ['/fixture/internal-operations']);
assert.deepEqual(resolveMemoryHostSearchPathConfig(relocated, 'nori-community').extraPaths, []);
// The native authorization filter accepts ordinary workspace-memory hits unchanged. A DM session
// key is not an ACL for a shared memory file, even with the strictest session-tool visibility.
const hits = [{ path: 'memory/2026-11-08.md', startLine: 1, endLine: 1, score: 1,
  snippet: 'SYNTHETIC_DM_A_PRIVATE_MEMORY', source: 'memory' }];
for (const requesterSessionKey of [route(userA, true).sessionKey, route(userB, true).sessionKey, route(userA, false).sessionKey]) {
  assert.deepEqual(await filterMemorySearchHitsBySessionVisibility({
    cfg: { ...relocated, tools: { sessions: { visibility: 'self' } } },
    agentId: 'nori-community', requesterSessionKey, sandboxed: false, hits,
  }), hits);
}
console.log(JSON.stringify({
  nativeDiscordAgentBinding: true,
  distinctDmSessionsWithExplicitScope: true,
  distinctDmAndPublicSessions: true,
  distinctBotAccountDmSessions: true,
  publicRoomPolicy: 'shared-public-history',
  nativePublicRoomPolicySatisfied: true,
  sameRoomSenderSessionsSeparated: false,
  sameThreadSenderSessionsSeparated: false,
  explicitEmptyAgentExtraPathsRemovesGlobalPaths: false,
  agentLocalInternalPathsExcludeCommunity: true,
  workspaceMemoryHitsFilteredBySenderOrAudience: false,
  privateRecallWithExplicitDmScope: false,
  sharedGatewayCutoverReady: false,
  interpretation: 'Public room/thread history sharing is intentional. Native DM session separation and agent-local memory roots work. Workspace memory still has no sender/audience ACL; private automatic memory and compatible scoped execution remain cutover gates. Diagnostic assertions are not live acceptance.',
}, null, 2));
