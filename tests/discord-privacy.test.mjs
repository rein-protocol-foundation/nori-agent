import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectDiscordPrivacy } from '../scripts/discord-privacy.mjs';

const codes = c => inspectDiscordPrivacy(c).findings.map(f => f.code);
test('default guild routing is shared even with DMs disabled', () => {
  const c = {channels:{discord:{enabled:true,dmPolicy:'disabled'}}};
  assert.ok(codes(c).includes('guild_session_shared'));
  assert.ok(!codes(c).includes('dm_session_shared'));
});
test('DM isolation never counts as per-sender guild isolation', () => {
  const c = {channels:{discord:{enabled:true}},session:{dmScope:'per-account-channel-peer'}};
  assert.ok(codes(c).includes('guild_session_shared'));
  assert.ok(!codes(c).includes('dm_session_shared'));
  assert.equal(inspectDiscordPrivacy(c).groupSessionIncludesSender,false);
});
test('default enabled DMs are diagnosed separately', () => {
  assert.ok(codes({channels:{discord:{enabled:true}}}).includes('dm_session_shared'));
});
test('disabled Discord does not report an active Discord leak path', () => {
  assert.deepEqual(codes({channels:{discord:{enabled:false}}}),[]);
});
test('hardening fragment reduces extra paths without certifying guild isolation', () => {
  const c=JSON.parse(readFileSync(new URL('../config/discord-privacy.example.json',import.meta.url)));
  c.channels.discord.enabled=true;
  assert.deepEqual(codes(c),['guild_session_shared']);
  assert.equal(inspectDiscordPrivacy(c).perUserPersistentMemoryImplemented,false);
});
test('explicit agent recall override remains visible', () => {
  const c={channels:{discord:{}},memory:{search:{rememberAcrossConversations:false}},agents:{list:[{memory:{search:{rememberAcrossConversations:true}}}]}};
  assert.ok(codes(c).includes('agent_recall_override'));
});
test('audit output contains no secrets, message text or configured member identifiers', () => {
  const secret='private-placeholder-value';
  const c={channels:{discord:{token:secret,guilds:{[secret]:{users:[secret]}}}},gateway:{auth:{token:secret}}};
  assert.ok(!JSON.stringify(inspectDiscordPrivacy(c)).includes(secret));
});

const isolatedDms = () => ({channels:{discord:{enabled:true,groupPolicy:'disabled'}},session:{dmScope:'per-account-channel-peer'}});
const binding = (match={},dmScope='main') => ({agentId:'main',match:{channel:'discord',...match},session:{dmScope}});
test('binding override to main is critical even when the global DM scope is isolated',()=>{
  const c={...isolatedDms(),bindings:[binding()]};
  assert.ok(codes(c).includes('dm_session_shared'));
  assert.deepEqual(inspectDiscordPrivacy(c).effectiveDmScopes,['main']);
});
test('specific and wildcard direct-peer overrides are included',()=>{
  for(const id of ['audit-sender','*'])assert.ok(codes({...isolatedDms(),bindings:[binding({peer:{kind:'direct',id}})]}).includes('dm_session_shared'));
});
test('non-Discord, group-only, guild, team, role and ACP bindings cannot override Discord DMs',()=>{
  for(const b of [binding({channel:'slack'}),binding({peer:{kind:'channel',id:'room'}}),binding({guildId:'guild'}),binding({teamId:'team'}),binding({roles:['role']}),{...binding(),type:'acp'}])
    assert.ok(!codes({...isolatedDms(),bindings:[b]}).includes('dm_session_shared'));
});
test('binding specificity and source order exclude shadowed main overrides',()=>{
  const peer={kind:'direct',id:'*'};
  for(const bindings of [
    [binding(),binding({peer},'per-account-channel-peer')],
    [binding({peer},'per-account-channel-peer'),binding({peer})],
  ])assert.ok(!codes({...isolatedDms(),bindings}).includes('dm_session_shared'));
  assert.ok(codes({...isolatedDms(),bindings:[binding({peer}),binding({peer},'per-account-channel-peer')]}).includes('dm_session_shared'));
});
test('channel-wide isolated binding overrides a shared global DM scope',()=>{
  const c=isolatedDms();c.session.dmScope='main';c.bindings=[binding({accountId:'*'},'per-account-channel-peer')];
  assert.ok(!codes(c).includes('dm_session_shared'));
});
test('named-account DM policies and bindings are evaluated without printing account IDs',()=>{
  const c=isolatedDms();c.channels.discord.accounts={second:{}};c.bindings=[binding({accountId:'second'})];
  assert.ok(codes(c).includes('dm_session_shared'));
  assert.ok(!JSON.stringify(inspectDiscordPrivacy(c)).includes('second'));
  c.channels.discord.accounts.second.enabled=false;assert.ok(!codes(c).includes('dm_session_shared'));
  c.channels.discord.dmPolicy='disabled';c.channels.discord.accounts.second={dmPolicy:'allowlist'};
  assert.ok(codes(c).includes('dm_session_shared'));
  const suffix=isolatedDms();suffix.channels.discord.accounts={'bot-':{},bot:{dmPolicy:'disabled'}};
  suffix.bindings=[binding({accountId:'bot-'})];
  assert.ok(codes(suffix).includes('dm_session_shared'));
});
test('unrelated bindings do not conceal the lack of an explicit recall opt-out',()=>{
  for(const b of [binding({channel:'slack'}),{...binding(),type:'acp'},binding({guildId:'guild'}),binding({peer:{kind:'channel',id:'room'}})]) {
    const c=isolatedDms();c.session.dmScope='main';c.bindings=[b];
    const audit=inspectDiscordPrivacy(c);
    assert.deepEqual(audit.effectiveDmScopes,['main']);
    // The pinned host's any-binding heuristic really defaults recall off.
    assert.equal(audit.safeguards.privateRecallEnabledByConfig,false);
    assert.equal(audit.safeguards.privateRecallExplicitlyDisabled,false);
    assert.ok(audit.findings.some(f=>f.code==='private_recall_implicit_policy'));
    c.memory={search:{rememberAcrossConversations:false}};
    assert.ok(!codes(c).includes('private_recall_implicit_policy'));
    c.memory.search.rememberAcrossConversations=true;
    assert.ok(codes(c).includes('private_recall_default'));
  }
});


test('canonical per-agent enable overrides a globally disabled recall policy',()=>{
  const c=isolatedDms();c.memory={search:{rememberAcrossConversations:false}};
  c.agents={entries:{'synthetic-private-agent':{memory:{search:{rememberAcrossConversations:true}}}}};
  const audit=inspectDiscordPrivacy(c);
  assert.ok(codes(c).includes('agent_recall_override'));
  assert.equal(audit.safeguards.privateRecallEnabledByConfig,true);
  assert.equal(audit.safeguards.privateRecallExplicitlyDisabled,false);
  assert.ok(!JSON.stringify(audit).includes('synthetic-private-agent'));
});
test('all canonical agents can explicitly disable globally enabled recall',()=>{
  const c=isolatedDms();c.memory={search:{rememberAcrossConversations:true}};
  c.agents={entries:{main:{memory:{search:{rememberAcrossConversations:false}}}}};
  const audit=inspectDiscordPrivacy(c);
  assert.equal(audit.safeguards.privateRecallEnabledByConfig,false);
  assert.equal(audit.safeguards.privateRecallExplicitlyDisabled,true);
  assert.ok(!codes(c).includes('private_recall_default'));
});
test('canonical roster takes precedence over legacy list including an empty roster',()=>{
  for(const entries of [{main:{}},{}]) {
    const c=isolatedDms();c.memory={search:{rememberAcrossConversations:false}};
    c.agents={entries,list:[{id:'legacy',memory:{search:{rememberAcrossConversations:true}}}]};
    assert.equal(inspectDiscordPrivacy(c).safeguards.privateRecallEnabledByConfig,false);
    assert.ok(!codes(c).includes('agent_recall_override'));
  }
});
test('mixed agent overrides retain inherited recall and cannot claim universal explicit disabling',()=>{
  const c=isolatedDms();c.memory={search:{rememberAcrossConversations:true}};
  c.agents={entries:{main:{memory:{search:{rememberAcrossConversations:false}}},other:{}}};
  const audit=inspectDiscordPrivacy(c);
  assert.equal(audit.safeguards.privateRecallEnabledByConfig,true);
  assert.equal(audit.safeguards.privateRecallExplicitlyDisabled,false);
});
test('explicit per-agent disabling is distinguished from implicit native defaults',()=>{
  const c=isolatedDms();c.session.dmScope='main';c.bindings=[binding({channel:'slack'})];
  c.agents={entries:{main:{memory:{search:{rememberAcrossConversations:false}}}}};
  assert.ok(!codes(c).includes('private_recall_implicit_policy'));
  c.agents.entries.other={};
  assert.ok(codes(c).includes('private_recall_implicit_policy'));
});
