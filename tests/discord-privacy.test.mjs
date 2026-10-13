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
