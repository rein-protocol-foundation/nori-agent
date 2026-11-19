import test from 'node:test';
import assert from 'node:assert/strict';
import { configureCommunityAccess } from '../scripts/configure-community-access.mjs';
const fixture = () => ({ agents: { entries: {
  main: { tools: { profile: 'full' }, model: 'existing', workspace: '/private' },
  'nori-community': { sandbox: { mode: 'all', scope: 'session', workspaceAccess: 'none' },
    tools: { allow: ['message'], message: { crossContext: { allowAcrossProviders: false } } } },
} }, channels: { slack: { enabled: true }, discord: { enabled: true, dmPolicy: 'allowlist', allowFrom: ['123'],
  guilds: { guild: { tools: { allow: ['message'] }, channels: { channel: { tools: { allow: ['message'] } } } } } },
}, plugins: { allow: ['discord'], entries: { 'rein-router': { config: { scopedPolicies: { guard: 'preserved' } } } } },
skills: { load: { extraDirs: ['/existing'] } } });
test('open DM and public service tools preserve internal capabilities and data boundaries', () => {
 const input=fixture(), before=structuredClone(input), out=configureCommunityAccess(input,{sharedSkillsDir:'/public/skills'});
 assert.deepEqual(input,before); assert.deepEqual(out.agents.entries.main,before.agents.entries.main);
 assert.deepEqual(out.channels.slack,before.channels.slack);
 assert.deepEqual(out.plugins.entries['rein-router'],before.plugins.entries['rein-router']);
 assert.equal(out.channels.discord.dmPolicy,'open'); assert.deepEqual(out.channels.discord.allowFrom,['*']);
 const a=out.agents.entries['nori-community']; assert.deepEqual(a.sandbox,before.agents.entries['nori-community'].sandbox);
 assert.equal(a.tools.message.crossContext.allowAcrossProviders,false);
 for(const t of ['rein_member_status','web_search','web_fetch']) {
  assert.ok(a.tools.allow.includes(t)); assert.ok(out.channels.discord.guilds.guild.channels.channel.tools.allow.includes(t));
 }
 for(const t of ['exec','write','automations','rein_funds','sessions_spawn']) assert.ok(!a.tools.allow.includes(t));
 assert.equal(out.tools.web.search.provider,'parallel-free');assert.equal(out.plugins.entries.parallel.enabled,true);
 assert.deepEqual(out.skills.load.extraDirs,['/existing','/public/skills']);
 assert.deepEqual(configureCommunityAccess(out,{sharedSkillsDir:'/public/skills'}),out);
});
test('configured search provider is retained; missing isolation fails closed',()=>{
 const input=fixture();input.tools={web:{search:{provider:'brave',custom:'retained'}}};
 const out=configureCommunityAccess(input,{sharedSkillsDir:'/public/skills'});
 assert.equal(out.tools.web.search.provider,'brave');assert.equal(out.tools.web.search.custom,'retained');
 input.agents.entries['nori-community'].sandbox.workspaceAccess='rw';
 assert.throws(()=>configureCommunityAccess(input,{sharedSkillsDir:'/public/skills'}),/isolated_agent_required/);
 assert.throws(()=>configureCommunityAccess(fixture(),{sharedSkillsDir:'relative'}),/directory_required/);
});
