import assert from 'node:assert/strict';
import { resolveAgentRoute } from '../vendor/openclaw/dist/plugin-sdk/routing.js';
import { effectiveDiscordDmScopes, discordAccountPolicies } from './discord-dm-scopes.mjs';

// Controlled native-router probe, not real Discord/member acceptance. Mirrors
// buildDiscordRoutePeer: a guild peer is the channel, a DM peer is the sender.
const a = { sender: 'routing-probe-alice', channel: 'routing-probe-room' };
const b = { sender: 'routing-probe-bob', channel: 'routing-probe-room' };
function key(message, direct, dmScope) {
  return resolveAgentRoute({
    cfg: { session: { dmScope, groupScope: 'per-group' } },
    channel: 'discord', accountId: 'routing-probe-bot',
    peer: { kind: direct ? 'direct' : 'channel', id: direct ? message.sender : message.channel },
  }).sessionKey;
}
const results = [];
for (const dmScope of ['main', 'per-account-channel-peer']) {
  const publicShared = key(a, false, dmScope) === key(b, false, dmScope);
  const dmShared = key(a, true, dmScope) === key(b, true, dmScope);
  assert.equal(publicShared, true);
  assert.equal(dmShared, dmScope === 'main');
  assert.notEqual(key(a, false, dmScope), key({ ...b, channel: 'routing-probe-other-room' }, false, dmScope));
  results.push({ dmScope, differentSendersInSameRoomShareSession: publicShared, differentDmSendersShareSession: dmShared });
}
const bind = (match={},dmScope='main') => ({agentId:'main',match:{channel:'discord',...match},session:{dmScope}});
const direct = {kind:'direct',id:'probe-peer'};
const bindingCases = [[],[bind()],[bind({},'per-account-channel-peer')],
  [bind({peer:direct})],[bind({peer:{kind:'direct',id:'*'}})],
  [bind(),bind({peer:{kind:'direct',id:'*'}},'per-account-channel-peer')],
  [bind({peer:direct},'per-account-channel-peer'),bind({peer:direct})],
  [bind({channel:'slack'})],[bind({guildId:'probe-guild'})],[bind({roles:['probe-role']})],
  [bind({peer:{kind:'channel',id:'probe-room'}})],[bind({accountId:'*'},'per-account-channel-peer')],
  [bind({accountId:'second'})],
];
let bindingScopeComparisons=0;
for (const dmScope of ['main','per-account-channel-peer']) for (const bindings of bindingCases) {
  const cfg={channels:{discord:{enabled:true,accounts:{second:{}}}},session:{dmScope},bindings};
  const native=new Set();
  for(const [accountId] of discordAccountPolicies(cfg.channels.discord)) for(const id of ['probe-peer','probe-other-peer']) {
    native.add(resolveAgentRoute({cfg,channel:'discord',defaultAgentId:'main',accountId,peer:{kind:'direct',id}}).dmScope);
  }
  assert.deepEqual(effectiveDiscordDmScopes(cfg).sort(),[...native].sort());
  bindingScopeComparisons++;
}
console.log(JSON.stringify({ probe: 'pinned upstream routing; synthetic identifiers only', results, bindingScopeComparisons }, null, 2));
