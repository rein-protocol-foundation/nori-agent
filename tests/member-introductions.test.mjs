import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntroductionReader } from '../plugins/rein-member-introductions/reader.mjs';
import { configureDiscordOnboarding, dailyOnboardingJob } from '../scripts/configure-discord-onboarding.mjs';

const guildId = '100000000000000001', source = '100000000000000002', target = '100000000000000003';
const user = '100000000000000004', messageId = '100000000000000005';
const config = { enabled: true, agentId: 'community', accountId: 'default', guildId,
  introductionsChannelId: source, statePath: '/private/fixture/members.sqlite' };
const context = { agentId: 'community', agentAccountId: 'default', messageChannel: 'discord',
  nativeChannelId: target, requesterSenderId: user, assertInvocationCurrent() {} };
function setup(overrides = {}) {
  const requests = []; let reads = 0;
  const responses = {
    [`/channels/${target}`]: { type: 0, guild_id: guildId },
    [`/guilds/${guildId}/members/${user}`]: { user: { id: user } },
    [`/channels/${source}`]: { type: 0, guild_id: guildId, permission_overwrites: [] },
    [`/guilds/${guildId}/roles`]: [{ id: guildId, permissions: '66560' }],
    [`/channels/${source}/messages/${messageId}`]: { id: messageId, channel_id: source, type: 0,
      author: { id: user, username: 'renamed' }, content: 'I study community governance.', timestamp: '2026-11-19T08:00:00Z' },
    ...overrides,
  };
  const factory = createIntroductionReader({ config, tokenForContext: () => 'fixture-token',
    read: params => { reads++; assert.equal(params.userId, user); assert.equal(params.channelId, source);
      return [{ guildId, userId: user, channelId: source, messageId, content: 'old stale text' }]; },
    fetchImpl: async url => { const path = url.replace('https://discord.com/api/v10', ''); requests.push(path);
      if (!(path in responses)) throw new Error('unexpected request');
      return { ok: responses[path] !== null, status: responses[path] === null ? 404 : 200, json: async () => responses[path] }; },
  });
  return { factory, requests, reads: () => reads };
}
test('recalls current sender across guild channels with current edited source, not nickname identity', async () => {
  const { factory } = setup(); const result = await factory.create(context).execute('call', {});
  assert.equal(result.details.ok, true); assert.equal(result.details.identityVerified, false);
  assert.equal(result.details.messages[0].discordUserId, user);
  assert.equal(result.details.messages[0].text, 'I study community governance.');
  assert.equal(result.details.messages[0].username, 'renamed');
});
test('rejects alternate actors, agents, accounts, platforms and missing live invocation', async () => {
  for (const patch of [{ agentId: 'main' }, { agentAccountId: 'other' }, { messageChannel: 'slack' },
    { requesterSenderId: undefined }, { nativeChannelId: undefined }, { assertInvocationCurrent: undefined }]) {
    assert.equal(setup().factory.create({ ...context, ...patch }), null);
  }
  const fixture = setup();
  assert.equal((await fixture.factory.create(context).execute('call', { userId: 'someone' })).details.ok, false);
  assert.equal(fixture.requests.length, 0);
});
test('rejects other guilds, DM destinations and revoked members before stored data reads', async () => {
  for (const overrides of [
    { [`/channels/${target}`]: { type: 0, guild_id: 'another' } },
    { [`/channels/${target}`]: { type: 1 } },
    { [`/guilds/${guildId}/members/${user}`]: null },
  ]) {
    const fixture = setup(overrides);
    assert.equal((await fixture.factory.create(context).execute('call')).details.ok, false);
    assert.equal(fixture.reads(), 0);
  }
});
test('no cross-channel recall if source has become private', async () => {
  const fixture = setup({ [`/channels/${source}`]: { type: 0, guild_id: guildId,
    permission_overwrites: [{ id: guildId, type: 0, deny: '1024', allow: '0' }] } });
  assert.equal((await fixture.factory.create(context).execute('call')).details.ok, false);
  assert.equal(fixture.reads(), 0);
});
test('deleted or reassigned sources are not recalled', async () => {
  for (const current of [null, { channel_id: source, type: 0, author: { id: 'another' }, content: 'private' }]) {
    const fixture = setup({ [`/channels/${source}/messages/${messageId}`]: current });
    const result = await fixture.factory.create(context).execute('call');
    assert.equal(result.details.ok, true); assert.deepEqual(result.details.messages, []);
  }
});
test('expired invocation never releases saved text and disabled registration has no effects', async () => {
  let calls = 0;
  const fixture = setup();
  const result = await fixture.factory.create({ ...context, assertInvocationCurrent() { if (++calls === 2) throw new Error('expired'); } }).execute('call');
  assert.deepEqual(result.details, { ok: false, reason: 'introduction_recall_unavailable' });
  assert.equal(createIntroductionReader({ config: { enabled: false } }).create(context), null);
});
test('configuration is additive, repeatable, and preserves sandbox, unrelated tools and agents', () => {
  const prior = { agents: { entries: { 'nori-community': { sandbox: { mode: 'all' },
    tools: { allow: ['read'], sandbox: { tools: { alsoAllow: ['read'] } } } }, main: { keep: true } } },
    channels: { discord: { enabled: true, guilds: { [guildId]: { tools: { allow: ['read'] } } } } },
    bindings: [{ agentId: 'nori-community', match: { channel: 'discord', accountId: 'default' } }],
    plugins: { allow: ['keep'], load: { paths: ['/keep'] }, entries: { keep: { enabled: true } } } };
  const options = { pluginPath: '/plugins/introductions', statePath: config.statePath, guildId, introductionsChannelId: source };
  const next = configureDiscordOnboarding(prior, options);
  assert.deepEqual(configureDiscordOnboarding(next, options), next);
  assert.deepEqual(next.agents.entries.main, prior.agents.entries.main);
  assert.deepEqual(next.agents.entries['nori-community'].sandbox, { mode: 'all' });
  assert.deepEqual(prior.agents.entries['nori-community'].tools.allow, ['read']);
  assert.deepEqual(next.plugins.load.paths, ['/keep', '/plugins/introductions']);
  const job = dailyOnboardingJob({ nodePath: '/node', scriptPath: '/runner', configPath: '/config', envFile: '/env' });
  assert.deepEqual(job.schedule, { kind: 'cron', expr: '0 16 * * *', tz: 'UTC', staggerMs: 0 });
  assert.equal(job.delivery.mode, 'none');
  assert.equal(job.payload.kind, 'command');
});
