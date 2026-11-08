// Read-only feasibility probe against the pinned native implementations, not replacement routing.
import assert from 'node:assert/strict';
import { buildDiscordRoutePeer, resolveDiscordConversationRoute } from '../../vendor/openclaw/extensions/discord/src/monitor/route-resolution.ts';
import { readFileSync, readdirSync } from 'node:fs';
const dist = new URL('../../vendor/openclaw/dist/', import.meta.url);
// Diagnostics may inspect the pinned build; production plugins must use public SDK interfaces.
const chunk = readdirSync(dist).filter(name => /^config-utils-.*\.mjs$/.test(name)).find(name =>
  readFileSync(new URL(name, dist), 'utf8').includes('function resolveMemoryHostSearchPathConfig('));
assert.ok(chunk, 'pinned memory build not found');
const text = readFileSync(new URL(chunk, dist), 'utf8');
const loaded = await import(new URL(chunk, dist).href);
const get = name => {
  const alias = text.match(new RegExp(name + ' as ([A-Za-z_$][A-Za-z0-9_$]*)'))?.[1];
  assert.equal(typeof loaded[alias ?? name], 'function');
  return loaded[alias ?? name];
};
const resolveRememberAcrossConversations = get('resolveRememberAcrossConversations');
const resolveMemoryHostSearchPathConfig = get('resolveMemoryHostSearchPathConfig');
const cfg = {
  agents: { entries: { main: {}, 'nori-community': {} } },
  bindings: [{ agentId: 'nori-community', match: { channel: 'discord', accountId: 'default' } }],
  session: { dmScope: 'per-account-channel-peer' },
};
const route = (userId, direct, room = '100000000000000002') => resolveDiscordConversationRoute({
  cfg, accountId: 'default', guildId: direct ? undefined : '100000000000000001',
  peer: buildDiscordRoutePeer({ isDirectMessage: direct, isGroupDm: false, directUserId: userId, conversationId: room }),
});
const userA = '100000000000000003', userB = '100000000000000004';
assert.equal(route(userA, false).agentId, 'nori-community');
assert.equal(route(userA, false).sessionKey, route(userB, false).sessionKey);
assert.equal(route(userA, false, '100000000000000005').sessionKey, route(userB, false, '100000000000000005').sessionKey);
assert.notEqual(route(userA, false).sessionKey, route(userA, false, '100000000000000005').sessionKey);
assert.notEqual(route(userA, true).sessionKey, route(userB, true).sessionKey);
assert.equal(resolveRememberAcrossConversations(cfg, 'nori-community'), false);
const memoryConfig = { ...cfg, memory: { search: { extraPaths: ['/fixture/internal-operations'] } }, agents: { entries: {
  main: {}, 'nori-community': { memory: { search: { extraPaths: [] } } },
} } };
const memory = resolveMemoryHostSearchPathConfig(memoryConfig, 'nori-community');
assert.ok(JSON.stringify(memory.extraPaths).includes('/fixture/internal-operations'));
console.log(JSON.stringify({
  nativeDiscordAgentBinding: true,
  distinctDmSessionsWithExplicitScope: true,
  sameRoomSenderSessionsSeparated: false,
  sameThreadSenderSessionsSeparated: false,
  explicitEmptyAgentExtraPathsRemovesGlobalPaths: false,
  privateRecallWithExplicitDmScope: false,
  sharedGatewayCutoverReady: false,
  interpretation: 'Native agent and DM routing exist. Strict same-room ownership and per-sender memory require an earlier verified extension; do not infer isolation from successful assertions.',
}, null, 2));
