import assert from 'node:assert/strict';
import { resolveAgentRoute } from '../vendor/openclaw/dist/plugin-sdk/routing.js';
import { effectiveDiscordDmScopes, discordAccountPolicies } from './discord-dm-scopes.mjs';
import { resolveRememberAcrossConversations } from '../vendor/openclaw/dist/plugin-sdk/memory-core-host-runtime-core.js';
import { inspectDiscordPrivacy } from './discord-privacy.mjs';

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
  [bind({accountId:'second-'})],
];
let bindingScopeComparisons=0;
let nativeRecallComparisons=0;
for (const dmScope of ['main','per-account-channel-peer']) for (const bindings of bindingCases) {
  const cfg={channels:{discord:{enabled:true,accounts:{second:{},'second-':{}}}},session:{dmScope},bindings};
  const native=new Set();
  for(const [accountId] of discordAccountPolicies(cfg.channels.discord)) for(const id of ['probe-peer','probe-other-peer']) {
    native.add(resolveAgentRoute({cfg,channel:'discord',defaultAgentId:'main',accountId,peer:{kind:'direct',id}}).dmScope);
  }
  assert.deepEqual(effectiveDiscordDmScopes(cfg).sort(),[...native].sort());
  bindingScopeComparisons++;
  for (const rememberAcrossConversations of [undefined,false,true]) {
    const recallCfg={...cfg,memory:{search:{rememberAcrossConversations}}};
    assert.equal(inspectDiscordPrivacy(recallCfg).safeguards.privateRecallEnabledByConfig,
      resolveRememberAcrossConversations(recallCfg,'main'));
    nativeRecallComparisons++;
  }
}
for (const form of ['entries','list']) for (const dmScope of ['main','per-account-channel-peer'])
  for (const globalRecall of [undefined,false,true]) for (const first of [undefined,false,true]) for (const second of [undefined,false,true]) {
    const agents=[{id:'main',memory:{search:{rememberAcrossConversations:first}}},{id:'other',memory:{search:{rememberAcrossConversations:second}}}];
    const cfg={channels:{discord:{enabled:true}},session:{dmScope},memory:{search:{rememberAcrossConversations:globalRecall}},
      agents: form==='entries' ? {entries:Object.fromEntries(agents.map(({id,...agent})=>[id,agent]))} : {list:agents}};
    const audit=inspectDiscordPrivacy(cfg);
    assert.equal(audit.safeguards.privateRecallEnabledByConfig,agents.some(({id})=>resolveRememberAcrossConversations(cfg,id)));
    assert.equal(audit.safeguards.privateRecallExplicitlyDisabled,[first,second].every(value=>(value??globalRecall)===false));
    nativeRecallComparisons++;
  }
console.log(JSON.stringify({ probe: 'pinned upstream routing; synthetic identifiers only', results, bindingScopeComparisons, nativeRecallComparisons }, null, 2));
