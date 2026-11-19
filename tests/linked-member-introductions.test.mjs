import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkedIntroductionReader, parseLinkedIdentity } from '../plugins/rein-member-introductions/linked-reader.mjs';
import { createBackendRuntime } from '../plugins/rein-operations/backend-runtime.ts';
import { createBackendTransport } from '../plugins/rein-operations/backend-transport.ts';

const guild = '100000000000000001', source = '100000000000000002', destination = '100000000000000003';
const user = '100000000000000004', message = '100000000000000005', other = '100000000000000006';
const config = { enabled: true, guildId: guild, introductionsChannelId: source, statePath: '/private/test.sqlite' };
const foundationDb = { enabled: true, workspaces: [{ platform: 'slack', workspaceId: 'TSELF', nativeChannelIds: ['CSELF'] }],
  proposalChannelIds: ['CSELF'], boardChannelIds: ['CSELF'], backendApiBaseUrlEnvVar: 'URL', agentCallerIdEnvVar: 'CALLER', agentCredentialEnvVar: 'CREDENTIAL' };
const profile = { agentId: 'main', platform: 'slack', accountId: 'default', capabilities: 'internal', foundationDb };
const ctx = { agentId: 'main', messageChannel: 'slack', agentAccountId: 'default', requesterSenderId: 'USELF', nativeChannelId: 'CSELF', sessionId: 'fixture-session', assertInvocationCurrent() {} };
const identity = () => ({ ok: true, status: 'resolved', contact_id: 'canonical-self', profile: { name: 'Self', joinedAt: '2026-01-01T00:00:00Z', email: 'never@example.invalid' },
  accounts: [{ platform: 'slack', workspace_id: 'TSELF', platform_user_id: 'USELF' }, { platform: 'discord', workspace_id: guild, platform_user_id: user }] });
function fixture({ identities = [identity()], responses = {}, read, context = ctx, currentProfile = profile, currentFoundation = foundationDb, fallbackForContext } = {}) {
  const calls = [], reads = [], proofs = []; let resolves = 0;
  const response = body => ({ ok: true, httpStatus: 200, body });
  const transport = {
    async relayIngress(tuple) { proofs.push(tuple); return response({ assertion: 'private-proof' }); },
    async resolveLinkedAccounts(proof) { assert.equal(proof.assertion, 'private-proof'); const b = identities[Math.min(resolves++, identities.length - 1)]; if (b instanceof Error) throw b; return response(b); },
  };
  const runtime = createBackendRuntime({ config: currentFoundation, communityOnly: currentProfile.capabilities === 'community',
    communityProfile: { agentId: currentProfile.agentId, accountId: currentProfile.accountId },
    env: { URL: 'https://backend.example.invalid', CALLER: 'fixture', CREDENTIAL: 'fixture-credential' }, transport });
  const provider = {
    [`/channels/${destination}`]: { type: 0, guild_id: guild },
    [`/channels/${source}`]: { type: 0, guild_id: guild, permission_overwrites: [] },
    [`/guilds/${guild}/roles`]: [{ id: guild, permissions: '66560' }],
    [`/guilds/${guild}/members/${user}`]: { user: { id: user }, roles: [] },
    [`/channels/${source}/messages/${message}`]: { type: 0, id: message, channel_id: source, author: { id: user, username: 'new-name' }, content: 'Edited public intro', timestamp: '2026-11-19T00:00:00Z' },
    ...responses,
  };
  const factory = createLinkedIntroductionReader({ config, profile: currentProfile, runtime,
    workspaceForContext: context => context.nativeChannelId === (currentProfile.platform === 'slack' ? 'CSELF' : destination)
      ? { platform: currentProfile.platform, workspaceId: currentProfile.platform === 'slack' ? 'TSELF' : guild } : null,
    tokenForContext: () => 'discord-bot-secret', fallbackForContext,
    read: p => { reads.push(p); return read ? read(p) : [{ guildId: guild, userId: user, channelId: source, messageId: message, content: 'stale' }]; },
    fetchImpl: async (url, options) => { const path = url.replace('https://discord.com/api/v10', ''); calls.push(path);
      assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'Bot discord-bot-secret');
      if (!(path in provider)) throw new Error('Unexpected provider path'); const b = provider[path];
      if (b instanceof Error) throw b;
      return { ok: b !== null, status: b === null ? 404 : 200, json: async () => b }; },
  });
  return { factory, calls, reads, proofs, run: (args = {}) => factory.create(context)[0].execute('call-fixture', args), get resolves() { return resolves; } };
}
test('Slack current sender retrieves linked Discord intro using fresh source and redacted profile', async () => {
  const f = fixture(); const result = (await f.run()).details;
  assert.equal(result.linked, true); assert.equal(result.bindingVerified, true); assert.equal(result.introductionVerified, false);
  assert.equal(result.messages[0].text, 'Edited public intro'); assert.equal(result.profile.name, 'Self');
  for (const secret of ['never@example.invalid', 'canonical-self', 'private-proof', 'discord-bot-secret', 'USELF']) assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(f.resolves, 2); assert.equal(f.reads[0].userId, user);
  assert.deepEqual(f.proofs.map(p => [p.platform, p.platform_user_id, p.workspace_id]), [['slack', 'USELF', 'TSELF']]);
});
test('Discord same sender recognized in another guild channel using own backend profile', async () => {
  const p = { ...profile, agentId: 'community', platform: 'discord', capabilities: 'community' };
  const c = { ...ctx, agentId: 'community', messageChannel: 'discord', requesterSenderId: user, nativeChannelId: destination };
  const db = { ...foundationDb, workspaces: [{ platform: 'discord', workspaceId: guild, nativeChannelIds: [destination] }], proposalChannelIds: [], boardChannelIds: [] };
  const f = fixture({ currentProfile: p, currentFoundation: db, context: c });
  assert.equal((await f.run()).details.linked, true); assert.equal(f.proofs[0].platform_user_id, user);
});
test('model supplied actor/email rejected before ingress and other host scopes never register', async () => {
  const f = fixture(); for (const args of [{ email: 'other@example.invalid' }, { userId: other }, null, []]) assert.equal((await f.run(args)).details.ok, false);
  assert.equal(f.proofs.length, 0);
  for (const patch of [{ agentId: 'other' }, { agentAccountId: 'other' }, { messageChannel: 'discord' }, { nativeChannelId: 'COTHER' }, { requesterSenderId: null }, { assertInvocationCurrent: null }])
    assert.deepEqual(f.factory.create({ ...ctx, ...patch }), []);
});
test('unlinked revoked and expired do not read another account or fallback on outage', async () => {
  for (const status of ['identity_not_linked', 'identity_revoked', 'identity_expired']) {
    const f = fixture({ identities: [{ ok: true, status, contact_id: null, profile: null, accounts: [] }] });
    assert.deepEqual((await f.run()).details.messages, []);assert.equal(f.calls.length, 0);assert.equal(f.reads.length, 0);
  }
  const f = fixture({ identities: [new Error('secret backend failure')], fallbackForContext: () => { throw new Error('must not fallback'); } });
  assert.deepEqual((await f.run()).details, { ok: false, reason: 'linked_introduction_unavailable' });
});
test('explicit unlinked preserves original same-account recall without claiming linkage', async () => {
  const f = fixture({ identities: [{ ok: true, status: 'identity_not_linked', contact_id: null, profile: null, accounts: [] }],
    fallbackForContext: () => ({ execute: async () => ({ details: { ok: true, messages: [{ text: 'Own public intro' }] } }) }) });
  const d = (await f.run()).details; assert.equal(d.linked, false);assert.equal(d.messages[0].text, 'Own public intro');
});
test('only exact configured guild links are read; missing current actor refused', async () => {
  const b = identity(); b.accounts[1].workspace_id = other;
  const f = fixture({ identities: [b] });assert.equal((await f.run()).details.linked, true);assert.equal(f.reads.length, 0);
  const bad = identity();bad.accounts[0].platform_user_id = 'UOTHER';
  const g = fixture({ identities: [bad] });assert.equal((await g.run()).details.ok, false);assert.equal(g.reads.length, 0);
});
test('private source, left guild, member-specific denial, bot or wrong message author never leaks archive', async () => {
  for (const responses of [
    { [`/channels/${source}`]: { type: 0, guild_id: guild, permission_overwrites: [{ id: guild, type: 0, deny: '1024', allow: '0' }] } },
    { [`/guilds/${guild}/members/${user}`]: null },
    { [`/guilds/${guild}/members/${user}`]: { user: { id: user, bot: true } } },
    { [`/channels/${source}`]: { type: 0, guild_id: guild, permission_overwrites: [{ id: user, type: 1, deny: '65536', allow: '0' }] } },
  ]) { const f = fixture({ responses });const d = (await f.run()).details; assert.ok(!d.messages?.length);assert.equal(f.reads.length, 0); }
  for (const value of [null, { channel_id: source, type: 0, author: { id: other }, content: 'Other private text' }]) {
    const f = fixture({ responses: { [`/channels/${source}/messages/${message}`]: value } });assert.deepEqual((await f.run()).details.messages, []);
  }
});
test('revocation rebind and source unlink during provider I/O fail closed', async () => {
  for (const fresh of [{ ok: true, status: 'identity_revoked', contact_id: null, profile: null, accounts: [] },
    { ...identity(), contact_id: 'other-contact' }, { ...identity(), accounts: [identity().accounts[0]] }]) {
    const f = fixture({ identities: [identity(), fresh] });assert.deepEqual((await f.run()).details, { ok: false, reason: 'linked_introduction_unavailable' });
  }
});
test('concurrent actors and repeated calls never cache a prior contact', async () => {
  const f = fixture();const g = fixture({ identities: [{ ok: true, status: 'identity_not_linked', contact_id: null, profile: null, accounts: [] }] });
  const [a,b] = await Promise.all([f.run(),g.run()]);assert.equal(a.details.linked,true);assert.equal(b.details.linked,false);
  const h = fixture({ identities: [identity(), identity(), { ok:true,status:'identity_expired',contact_id:null,profile:null,accounts:[] }] });
  assert.equal((await h.run()).details.linked,true);assert.equal((await h.run()).details.linked,false);
});
test('malformed backend and duplicate/oversized accounts fail closed', () => {
  for (const b of [{}, { ...identity(), accounts: [...identity().accounts, identity().accounts[0]] },
    { ...identity(), accounts: Array(21).fill(identity().accounts[0]) }, { ...identity(), profile: null },
    { ...identity(), status: 'identity_revoked' }]) assert.throws(() => parseLinkedIdentity({ ok:true,body:b }));
});
test('stale invocation or mutable host identity never releases profile', async () => {
  let count=0;const c={...ctx,assertInvocationCurrent(){ if(++count>5)throw new Error('stale'); }};
  assert.equal((await fixture({context:c}).run()).details.ok,false);
  const mutable={...ctx}; const f=fixture({context:mutable}); const tool=f.factory.create(mutable)[0];mutable.requesterSenderId='UOTHER';
  assert.equal((await tool.execute('call',{})).details.ok,false);assert.equal(f.reads.length,0);
});
test('linked-account transport posts proof only with same redirect and credential boundary', async () => {
  let sent; const t=createBackendTransport({baseUrl:'https://backend.example.invalid',callerId:'fixture',credential:'fixture-secret',
    fetch:async(url,options)=>{sent={url,options};return new Response(JSON.stringify(identity()),{status:200,headers:{'content-type':'application/json'}});}});
  assert.equal((await t.resolveLinkedAccounts({kind:'assertion',assertion:'signed'})).ok,true);
  assert.equal(sent.url,'https://backend.example.invalid/api/identity/linked-accounts');assert.equal(sent.options.redirect,'error');
  assert.deepEqual(JSON.parse(sent.options.body),{proof:{kind:'assertion',assertion:'signed'}});
});

const { configureLinkedMemberProfiles } = await import('../scripts/configure-discord-onboarding.mjs');
const { validateIntroductionConfig } = await import('../plugins/rein-member-introductions/reader.mjs');
test('linked-profile rollout is additive and repeatable and preserves private memory and authority', () => {
  const sourceConfig = { ...config, agentId: 'community', accountId: 'default' };
  const previous = { agents: { entries: { main: { tools: { alsoAllow: ['other'] }, memorySearch: { sources: ['sessions'] } },
    community: { tools: { allow: ['read'], sandbox: { tools: { alsoAllow: ['read'] } } }, sandbox: { mode: 'all' } } } },
    bindings: [{ agentId: 'main', match: { channel: 'slack', accountId: '*' } }, { agentId: 'community', match: { channel: 'discord', accountId: 'default' } }],
    channels: { slack: { enabled:true, channels:{CSELF:{tools:{allow:['existing']}},COTHER:{tools:{allow:['private']}}} },
      discord: {enabled:true,guilds:{[guild]:{tools:{allow:['read']}}}} },
    plugins: { entries: { 'rein-member-introductions': { enabled:true, config:sourceConfig }, 'rein-operations': {enabled:true,config:{agentProfiles:{
      main:profile,community:{...profile,platform:'discord',capabilities:'community',foundationDb:{...foundationDb,workspaces:[{platform:'discord',workspaceId:guild,nativeChannelIds:[destination]}]}}
    }}} } } };
  const next=configureLinkedMemberProfiles(previous,{agentIds:['community','main']});
  assert.deepEqual(configureLinkedMemberProfiles(next,{agentIds:['community','main']}),next);
  assert.deepEqual(next.bindings,previous.bindings);assert.deepEqual(next.plugins.entries['rein-operations'],previous.plugins.entries['rein-operations']);
  assert.deepEqual(next.agents.entries.main.memorySearch,previous.agents.entries.main.memorySearch);
  assert.deepEqual(next.agents.entries.community.sandbox,previous.agents.entries.community.sandbox);
  assert.deepEqual(next.channels.slack.channels.COTHER,previous.channels.slack.channels.COTHER);
  assert.ok(next.channels.slack.channels.CSELF.tools.allow.includes('rein_my_introduction'));
  assert.ok(next.agents.entries.main.tools.alsoAllow.includes('rein_my_introduction'));
  assert.throws(()=>configureLinkedMemberProfiles(previous,{agentIds:['unknown','community']}));
  assert.throws(()=>validateIntroductionConfig({...sourceConfig,linkedProfiles:['main']}));
});

test('two people in one room use separate current actor results through the same registration', async () => {
  const second={...identity(),contact_id:'canonical-other',profile:{name:'Other member',joinedAt:null},
    accounts:[{platform:'slack',workspace_id:'TSELF',platform_user_id:'UOTHER'}]};
  const f=fixture({identities:[identity(),identity(),second,second]});
  const first=await f.factory.create(ctx)[0].execute('call-one',{});
  const next=await f.factory.create({...ctx,requesterSenderId:'UOTHER'})[0].execute('call-two',{});
  assert.equal(first.details.messages.length,1);assert.equal(next.details.profile.name,'Other member');
  assert.deepEqual(next.details.messages,[]);assert.equal(f.proofs[1].platform_user_id,'UOTHER');
});
