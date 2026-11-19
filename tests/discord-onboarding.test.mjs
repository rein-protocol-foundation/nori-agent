import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { onboardingWindow, runDiscordOnboarding } from '../scripts/discord-onboarding.mjs';
import { acquireWriter, openOnboardingStore, readSelfReportedIntroductions } from '../scripts/discord-onboarding-store.mjs';

// All IDs, messages and accounts in this file are synthetic fixtures.
const GUILD = '100', CHANNEL = '200', BOT = '300';
const END = Date.parse('2026-07-02T16:00:00Z'), START = END - 86_400_000;
const DAY = 86_400_000, SUNDAY = END + 3 * DAY;
const idAt = (ms, suffix = 1) => (((BigInt(ms) - 1420070400000n) << 22n) + BigInt(suffix)).toString();
const human = (id, joined = START + 1000, bot = false) => ({ user: { id: String(id), username: `fixture-${id}`, bot }, joined_at: new Date(joined).toISOString() });
function message(userId, ms, { content = 'A casual reply, not necessarily a biography.', type = 0, bot = false, ...extra } = {}) {
  return { id: idAt(ms), channel_id: CHANNEL, timestamp: new Date(ms).toISOString(), edited_timestamp: null,
    author: { id: String(userId), username: `fixture-${userId}`, bot }, content, type, attachments: [], ...extra };
}
function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nori-discord-onboarding-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = { guildId: GUILD, introductionsChannelId: CHANNEL, statePath: join(root, 'private', 'onboarding.sqlite'), tokenEnv: 'FIXTURE_TOKEN', ...options.config };
  const welcomeChannel = config.welcomeChannelId ?? CHANNEL;
  const members = options.members ?? [human('400')], messages = options.messages ?? [];
  const posts = [], calls = []; let now = END + 60_000;
  const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname.replace('/api/v10', ''), params = new URL(url).searchParams;
    calls.push({ path, method: init.method, params });
    const overridden = await options.intercept?.({ path, params, init, response, posts, messages, now });
    if (overridden) return overridden;
    if (path === `/channels/${CHANNEL}`) return response({ id: CHANNEL, guild_id: GUILD, type: 0, ...options.channel });
    if (path === `/channels/${welcomeChannel}`) return response({ id: welcomeChannel, guild_id: GUILD, type: 0, ...options.welcomeChannel });
    if (path === '/users/@me') return response({ id: BOT, bot: true });
    if (path === `/guilds/${GUILD}/members`) return response(members.filter(member => BigInt(member.user.id) > BigInt(params.get('after'))).slice(0, 1000));
    if (path.startsWith(`/guilds/${GUILD}/members/`)) {
      const member = members.find(member => member.user.id === path.split('/').at(-1));
      return response(member, member ? 200 : 404);
    }
    if ([`/channels/${CHANNEL}/messages`, `/channels/${welcomeChannel}/messages`].includes(path) && init.method === 'GET') {
      return response(messages.filter(item => item.channel_id === path.split('/')[2] && BigInt(item.id) < BigInt(params.get('before')))
        .sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, 100));
    }
    if (path === `/channels/${welcomeChannel}/messages` && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const sent = message(BOT, now++, { ...body, bot: true, channel_id: welcomeChannel });
      posts.push(body); messages.push(sent);
      if (options.uncertain) throw new Error('Synthetic lost response after acceptance');
      return response(sent);
    }
    throw new Error(`Unexpected synthetic route ${path}`);
  };
  const run = overrides => runDiscordOnboarding(config, { at: END, fetchImpl, env: { FIXTURE_TOKEN: 'synthetic-not-a-secret' }, now: () => now, ...overrides });
  return { config, root, run, members, messages, posts, calls, response, fetchImpl, setNow: value => { now = value; } };
}

test('08:00 fixed PST stays UTC16 in winter and summer with exact rolling boundaries', async t => {
  assert.equal(onboardingWindow('2026-01-02T16:00:00Z').cutoff, Date.parse('2026-01-02T16:00:00Z'));
  assert.equal(onboardingWindow('2026-07-02T08:00:00-08:00').cutoff, END);
  assert.equal(onboardingWindow('2026-07-02T15:59:59Z').cutoff, START);
  assert.throws(() => onboardingWindow('2026-07-02T16:00:00'), /explicit UTC offset/);
  const f = fixture(t, { members: [human('400', START - 1), human('401', START), human('402', END - 1), human('403', END)] });
  const result = await f.run();
  assert.deepEqual(result, { joined: 2, welcomed: 2, dailyWelcomed: 2, weeklyReminded: 0, archived: 0, dryRun: false });
  assert.deepEqual(f.posts[0].allowed_mentions, { users: ['401', '402'], parse: [], replied_user: false });
});

test('paginates over 1000 members and 100 messages; archives original human evidence across pages', async t => {
  const members = Array.from({ length: 1005 }, (_, i) => human(String(1000 + i), i === 1004 ? START + 1 : START - 1));
  const messages = Array.from({ length: 205 }, (_, i) => message('2004', START + 1000 + i, { content: `Synthetic contribution ${i}`, edited_timestamp: new Date(START + 2000 + i).toISOString() }));
  messages.push(message('2004', START - 1), message('2004', END));
  const f = fixture(t, { members, messages });
  assert.deepEqual(await f.run(), { joined: 1, welcomed: 0, dailyWelcomed: 0, weeklyReminded: 0, archived: 205, dryRun: false });
  assert.equal(f.posts.length, 0);
  assert.equal(f.calls.filter(call => call.path.endsWith('/members')).length, 2);
  assert.equal(f.calls.filter(call => call.path.endsWith('/messages')).length, 3);
  const records = readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId: '2004', limit: 100 });
  assert.equal(records.length, 100);
  assert.equal(records[0].content, 'Synthetic contribution 204');
  assert.equal(records[0].evidenceType, 'self-reported-channel-contribution');
  assert.match(records[0].sourceUrl, /^https:\/\/discord.com\/channels\/100\/200\//);
  assert.ok(records[0].editedAt);
  assert.deepEqual(readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: '101', userId: '2004' }), []);
  assert.equal(statSync(f.config.statePath).mode & 0o777, 0o600);
  assert.equal(statSync(join(f.root, 'private')).mode & 0o777, 0o700);
});

test('skips bots, system and webhook messages, departed members, and already-introduced humans', async t => {
  const f = fixture(t, { members: [human('400'), human('401'), human('402', START + 1, true), human('403'), human('404')], messages: [
    message('400', START + 1), message('401', START + 2, { bot: true }),
    message('403', START + 3, { webhook_id: '900' }), message('404', START + 4, { type: 7 }),
  ], intercept: ({ path, response }) => path.endsWith('/members/403') ? response(null, 404) : null });
  const summary = await f.run();
  assert.deepEqual(summary, { joined: 4, welcomed: 2, dailyWelcomed: 2, weeklyReminded: 0, archived: 1, dryRun: false });
  assert.deepEqual(f.posts[0].allowed_mentions.users, ['401', '404']);
});

test('rejects DM and foreign-guild channels without public sends', async t => {
  for (const channel of [{ guild_id: null, type: 1 }, { guild_id: '999' }]) {
    const f = fixture(t, { channel });
    await assert.rejects(f.run(), /guild text channel/);
    assert.equal(f.posts.length, 0);
  }
});

test('chunks at 20, uses explicit allowed mentions, and repeated/restarted runs never re-welcome', async t => {
  const f = fixture(t, { members: Array.from({ length: 45 }, (_, i) => human(400 + i)) });
  assert.equal((await f.run()).welcomed, 45);
  assert.deepEqual(f.posts.map(post => post.allowed_mentions.users.length), [20, 20, 5]);
  for (const post of f.posts) { assert.ok(post.content.length < 2000); assert.equal(post.enforce_nonce, true); assert.deepEqual(post.allowed_mentions.parse, []); }
  assert.equal((await f.run()).welcomed, 45);
  assert.equal(f.posts.length, 3);
});

test('lost accepted response reconciles durable pending intent from history after restart', async t => {
  const f = fixture(t, { uncertain: true });
  await assert.rejects(f.run(), /uncertain/);
  assert.equal(f.posts.length, 1);
  const state = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(state.prepare('SELECT status FROM intents').get().status, 'pending'); state.close();
  assert.equal((await f.run()).welcomed, 1);
  assert.equal(f.posts.length, 1);
  const db = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(db.prepare('SELECT status FROM intents').get().status, 'sent'); db.close();
});

test('uncertain delivery without matching history fails closed instead of blind repeat', async t => {
  const f = fixture(t, { uncertain: true });
  await assert.rejects(f.run(), /uncertain/);
  f.messages.length = 0;
  await assert.rejects(f.run(), /operator review/);
  assert.equal(f.posts.length, 1);
});

test('restart preserves accepted earlier chunks and reconciles a later uncertain chunk without duplicates', async t => {
  let sends = 0;
  const f = fixture(t, { members: Array.from({ length: 25 }, (_, i) => human(400 + i)),
    intercept: ({ path, init, posts, messages, now, response }) => {
      if (path.endsWith('/messages') && init.method === 'POST' && ++sends === 2) {
        const body = JSON.parse(init.body);
        posts.push(body); messages.push(message(BOT, now, { ...body, bot: true, nonce: undefined }));
        throw new Error('Synthetic response lost; history omits nonce');
      }
      return null;
    } });
  await assert.rejects(f.run(), /uncertain/);
  assert.equal(f.posts.length, 2);
  assert.equal((await f.run()).welcomed, 25);
  assert.equal(f.posts.length, 2);
});

test('no newcomers sends nothing and human contributions at the start boundary remain archived', async t => {
  const f = fixture(t, { members: [], messages: [message('400', START), message('401', END), message('402', START - 1)] });
  assert.deepEqual(await f.run(), { joined: 0, welcomed: 0, dailyWelcomed: 0, weeklyReminded: 0, archived: 1, dryRun: false });
  assert.equal(f.posts.length, 0);
});

test('dry run performs no store creation or send and leaves existing database byte-identical', async t => {
  const f = fixture(t);
  assert.equal((await f.run({ dryRun: true })).welcomed, 1);
  assert.equal(existsSync(f.config.statePath), false);
  assert.equal(f.posts.length, 0);
  await f.run();
  const before = readFileSync(f.config.statePath);
  await f.run({ dryRun: true });
  assert.deepEqual(readFileSync(f.config.statePath), before);
  assert.equal(f.posts.length, 1);
});

test('pagination failure leaves no archive, run or send intent', async t => {
  const f = fixture(t, { messages: Array.from({ length: 110 }, (_, i) => message('500', START + 100 + i)),
    intercept: ({ path, params, response }) => path.endsWith('/messages') && BigInt(params.get('before')) < BigInt(idAt(END)) ? response({}, 503) : null });
  await assert.rejects(f.run(), /read refused/);
  const db = new DatabaseSync(f.config.statePath, { readOnly: true });
  for (const table of ['contributions', 'runs', 'intents', 'archive_cutoffs']) assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  db.close(); assert.equal(f.posts.length, 0);
});

test('writer lease rejects concurrent run and expired owner cannot resume writes', async t => {
  const f = fixture(t); let now = END;
  const db = openOnboardingStore(f.config.statePath), first = acquireWriter(db, { now: () => now, leaseMs: 100 });
  await assert.rejects(f.run({ now: () => now }), /already active/);
  now += 101;
  const secondDb = openOnboardingStore(f.config.statePath), second = acquireWriter(secondDb, { now: () => now });
  assert.throws(() => first.renew(), /expired/);
  first.release(); second.renew(); second.release(); db.close(); secondDb.close();
});

test('rate limits are bounded and retried; member request budget exhaustion fails before sending', async t => {
  let limited = true; const sleeps = [];
  const f = fixture(t, { intercept: ({ path, response }) => {
    if (path === `/channels/${CHANNEL}` && limited) { limited = false; return response({ retry_after: 0.01 }, 429); }
    return null;
  } });
  await f.run({ sleep: async ms => sleeps.push(ms) });
  assert.deepEqual(sleeps, [10]);
  const g = fixture(t);
  await assert.rejects(g.run({ maxRequests: 2 }), /budget/);
  assert.equal(g.posts.length, 0);
});

test('optional already-introduced skip can be disabled while contribution remains archived', async t => {
  const f = fixture(t, { config: { skipAlreadyIntroduced: false }, messages: [message('400', START + 100)] });
  assert.equal((await f.run()).welcomed, 1);
  assert.equal(readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId: '400' }).length, 1);
});

test('separate welcome channel is validated, receives sends and pending reconciliation, and links introductions', async t => {
  const f = fixture(t, { config: { welcomeChannelId: '201' }, uncertain: true,
    messages: [message('500', START + 100)] });
  await assert.rejects(f.run(), /uncertain/);
  assert.equal(f.posts.length, 1);
  assert.match(f.posts[0].content, /in <#200>/);
  assert.equal((await f.run()).welcomed, 1);
  assert.equal(f.posts.length, 1);
  assert.ok(f.calls.some(call => call.path === '/channels/201/messages' && call.method === 'POST'));
  assert.equal(f.calls.some(call => call.path === '/channels/200/messages' && call.method === 'POST'), false);
  const g = fixture(t, { config: { welcomeChannelId: '201' }, welcomeChannel: { guild_id: '999' } });
  await assert.rejects(g.run(), /guild text channel/);
  assert.equal(g.posts.length, 0);
});

test('pending uncertain welcome does not block later-day archive progress or falsely record run success', async t => {
  const f = fixture(t, { uncertain: true });
  await assert.rejects(f.run(), /uncertain/);
  f.messages.length = 0;
  f.messages.push(message('500', END + 1000));
  await assert.rejects(f.run({ at: END + 86_400_000, now: () => END + 86_460_000 }), /operator review/);
  const records = readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId: '500', channelId: CHANNEL });
  assert.equal(records.length, 1);
  assert.deepEqual(readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId: '500', channelId: '201' }), []);
  const db = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(db.prepare('SELECT cutoff FROM archive_cutoffs').get().cutoff, new Date(END + 86_400_000).toISOString());
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM runs').get().count, 0);
  db.close();
});

test('archive recovers missed days while welcomes remain strictly within the latest 24 hours', async t => {
  const f = fixture(t, { members: [], messages: [message('500', START + 1000)] });
  await f.run();
  f.messages.push(message('501', END + 1000), message('502', END + 86_400_000 + 1000), message('503', END + 2 * 86_400_000 + 1000));
  f.members.push(human('400', END + 1000), human('401', END + 2 * 86_400_000 + 5000));
  const summary = await f.run({ at: END + 3 * 86_400_000, now: () => END + 3 * 86_400_000 + 60_000 });
  assert.deepEqual(summary, { joined: 1, welcomed: 1, dailyWelcomed: 1, weeklyReminded: 0, archived: 4, dryRun: false });
  assert.deepEqual(f.posts[0].allowed_mentions.users, ['401']);
  for (const userId of ['500', '501', '502', '503']) assert.equal(readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId }).length, 1);
});

test('empty human messages are skipped but attachment-only contributions are retained', async t => {
  const f = fixture(t, { members: [], messages: [message('500', START + 1, { content: '' }),
    message('501', START + 2, { content: '   ' }),
    message('502', START + 3, { content: '', attachments: [{ id: '901', filename: 'synthetic.png', url: 'https://example.invalid/synthetic.png', content_type: 'image/png', size: 12 }] })] });
  assert.equal((await f.run()).archived, 1);
  const records = readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId: '502' });
  assert.equal(records[0].content, '');
  assert.equal(records[0].attachments[0].filename, 'synthetic.png');
});

test('Sunday weekly classification backfills old introductions first and later skips full rescans', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 40 * DAY), human('401', SUNDAY - 30 * DAY), human('402', SUNDAY - 2 * DAY)],
    messages: [message('400', SUNDAY - 20 * DAY)] });
  f.setNow(SUNDAY + 60_000);
  const result = await f.run({ at: SUNDAY });
  assert.equal(result.dailyWelcomed, 0);
  assert.equal(result.weeklyReminded, 1);
  assert.deepEqual(f.posts[0].allowed_mentions.users, ['401']);
  assert.equal(readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId: '400' }).length, 1);
  const db = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM archive_baselines').get().count, 1); db.close();
  f.setNow(SUNDAY + 7 * DAY + 60_001);
  const second = await f.run({ at: SUNDAY + 7 * DAY });
  assert.equal(second.archived, 0);
  assert.equal(second.weeklyReminded, 2);
  assert.equal(f.posts.flatMap(post => post.allowed_mentions.users).filter(id => id === '400').length, 0);
});

test('weekly reminders run only on Sunday UTC16; daily and weekly branches never double-mention', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 30 * DAY), human('401', SUNDAY - 1000), human('402', SUNDAY - 2 * DAY - 1), human('403', SUNDAY - 30 * DAY, true)] });
  f.setNow(SUNDAY - DAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY - DAY })).weeklyReminded, 0);
  assert.equal(f.posts.length, 0);
  f.setNow(SUNDAY + 60_000);
  const result = await f.run({ at: SUNDAY });
  assert.equal(result.dailyWelcomed, 1); assert.equal(result.weeklyReminded, 1);
  assert.deepEqual(f.posts.map(post => post.allowed_mentions.users), [['401'], ['400']]);
  assert.equal(new Set(f.posts.flatMap(post => post.allowed_mentions.users)).size, 2);
  assert.equal((await f.run({ at: SUNDAY })).weeklyReminded, 1);
  assert.equal(f.posts.length, 2);
});

test('shared notification history enforces seven-day cooldown for daily and weekly sends', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 30 * DAY), human('401', SUNDAY - 30 * DAY)] });
  const db = openOnboardingStore(f.config.statePath);
  db.prepare('INSERT INTO notifications VALUES (?,?,?,?,?,?)')
    .run(GUILD, '400', '901', 'daily', new Date(SUNDAY - 2 * DAY).toISOString(), new Date(SUNDAY - 2 * DAY + 60_000).toISOString());
  db.close();
  f.setNow(SUNDAY + 5 * 60_000);
  assert.equal((await f.run({ at: SUNDAY })).weeklyReminded, 1);
  assert.deepEqual(f.posts[0].allowed_mentions.users, ['401']);
  f.setNow(SUNDAY + 7 * DAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY + 7 * DAY })).weeklyReminded, 1);
  assert.deepEqual(f.posts[1].allowed_mentions.users, ['400']);
  // The previous Sunday's delayed 16:05 reminder is still inside the seven-day interval.
  assert.equal(f.posts.flatMap(post => post.allowed_mentions.users).filter(id => id === '401').length, 1);
});

test('short explicit English and Chinese opt-outs persist; explicit resume restores eligibility', async t => {
  const f = fixture(t, { config: { welcomeChannelId: '201' }, members: ['400', '401', '402', '403'].map(id => human(id, SUNDAY - 30 * DAY)),
    messages: [message('400', SUNDAY - 5 * DAY, { channel_id: '201', content: 'no reminders' }),
      message('401', SUNDAY - 4 * DAY, { channel_id: '201', content: 'please don’t remind me' }),
      message('402', SUNDAY - 3 * DAY, { channel_id: '201', content: '不要提醒我' }),
      message('403', SUNDAY - 2 * DAY, { channel_id: '201', content: '别提醒我' })] });
  f.setNow(SUNDAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY })).weeklyReminded, 0);
  assert.equal(f.posts.length, 0);
  f.messages.length = 0; // Persisted opt-outs survive subsequent bounded reads.
  f.messages.push(message('400', SUNDAY + 6 * DAY, { channel_id: '201', content: 'resume reminders' }));
  f.setNow(SUNDAY + 7 * DAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY + 7 * DAY })).weeklyReminded, 1);
  assert.deepEqual(f.posts[0].allowed_mentions.users, ['400']);
});

test('incomplete initial full-history backfill fails closed without baseline, archive or notifications', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 30 * DAY)],
    messages: Array.from({ length: 105 }, (_, i) => message('400', SUNDAY - 20 * DAY + i)) });
  f.setNow(SUNDAY + 60_000);
  await assert.rejects(f.run({ at: SUNDAY, maxPages: 1 }), /pagination limit/);
  assert.equal(f.posts.length, 0);
  const db = new DatabaseSync(f.config.statePath, { readOnly: true });
  for (const table of ['archive_baselines', 'archive_cutoffs', 'contributions', 'notifications']) assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  db.close();
});

test('weekly uncertain send reconciles as weekly and never creates a daily welcome receipt', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 30 * DAY)], uncertain: true });
  f.setNow(SUNDAY + 60_000);
  await assert.rejects(f.run({ at: SUNDAY }), /uncertain/);
  assert.equal(f.posts.length, 1);
  const summary = await f.run({ at: SUNDAY });
  assert.equal(summary.weeklyReminded, 1); assert.equal(summary.dailyWelcomed, 0);
  assert.equal(f.posts.length, 1);
  const db = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(db.prepare('SELECT kind FROM notifications').get().kind, 'weekly');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM welcomes').get().count, 0); db.close();
});

test('old schema upgrades additively and retains daily receipt cooldown and pending intent kind', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 30 * DAY)] });
  const db = openOnboardingStore(f.config.statePath);
  db.prepare('INSERT INTO welcomes VALUES (?,?,?,?)').run(GUILD, '400', '901', new Date(SUNDAY - 2 * DAY).toISOString());
  db.exec(`DROP TABLE notifications; DROP TABLE archive_baselines; DROP TABLE reminder_preferences;
    ALTER TABLE intents DROP COLUMN kind; ALTER TABLE runs DROP COLUMN daily_welcomed; ALTER TABLE runs DROP COLUMN weekly_reminded;`);
  db.close();
  f.setNow(SUNDAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY })).weeklyReminded, 0);
  assert.equal(f.posts.length, 0);
  const upgraded = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(upgraded.prepare('SELECT kind FROM notifications').get().kind, 'daily');
  assert.ok(upgraded.prepare('PRAGMA table_info(intents)').all().find(column => column.name === 'kind'));
  assert.equal(upgraded.prepare('SELECT COUNT(*) AS count FROM welcomes').get().count, 1); upgraded.close();
});

test('collect-only backfills evidence and opt-outs without sending or reconciling pending deliveries', async t => {
  const f = fixture(t, { config: { welcomeChannelId: '201' }, messages: [message('500', END - 30 * DAY),
    message('400', END - 20 * DAY, { channel_id: '201', content: 'no reminders' })] });
  const db = openOnboardingStore(f.config.statePath);
  db.prepare("INSERT INTO intents (nonce,guild_id,channel_id,cutoff,users,content,created_at,status,message_id,kind) VALUES (?,?,?,?,?,?,?,'pending',NULL,'weekly')")
    .run('synthetic-pending', GUILD, '201', new Date(START).toISOString(), '["400"]', 'Synthetic pending welcome', new Date(START).toISOString());
  db.close();
  const summary = await f.run({ collectOnly: true });
  assert.equal(summary.collectOnly, true); assert.equal(summary.archived, 1);
  assert.equal(summary.dailyWelcomed, 0); assert.equal(summary.weeklyReminded, 0); assert.equal(f.posts.length, 0);
  const collected = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(collected.prepare('SELECT COUNT(*) AS count FROM archive_baselines').get().count, 1);
  assert.equal(collected.prepare('SELECT opted_out FROM reminder_preferences').get().opted_out, 1);
  assert.equal(collected.prepare('SELECT status FROM intents').get().status, 'pending');
  assert.equal(collected.prepare('SELECT COUNT(*) AS count FROM runs').get().count, 0); collected.close();
});

test('Sunday dry-run and collect-only dry-run create neither baseline nor any state', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 30 * DAY)] });
  f.setNow(SUNDAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY, dryRun: true })).weeklyReminded, 1);
  assert.equal((await f.run({ at: SUNDAY, dryRun: true, collectOnly: true })).weeklyReminded, 0);
  assert.equal(existsSync(f.config.statePath), false); assert.equal(f.posts.length, 0);
});

test('daily welcome skips a returning member with any archived introduction evidence', async t => {
  const f = fixture(t, { members: [], messages: [message('400', END - 30 * DAY)] });
  await f.run({ collectOnly: true });
  f.members.push(human('400'));
  const result = await f.run();
  assert.equal(result.joined, 1); assert.equal(result.dailyWelcomed, 0); assert.equal(f.posts.length, 0);
});

test('empty human posts exclude weekly reminders via durable participation markers without empty evidence records', async t => {
  const f = fixture(t, { members: [human('400', SUNDAY - 30 * DAY)], messages: [message('400', SUNDAY - 20 * DAY, { content: '' })] });
  f.setNow(SUNDAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY })).weeklyReminded, 0);
  assert.equal(readSelfReportedIntroductions({ statePath: f.config.statePath, guildId: GUILD, userId: '400' }).length, 0);
  f.messages.length = 0;
  f.setNow(SUNDAY + 7 * DAY + 60_000);
  assert.equal((await f.run({ at: SUNDAY + 7 * DAY })).weeklyReminded, 0);
  assert.equal(f.posts.length, 0);
  const db = new DatabaseSync(f.config.statePath, { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM introduction_participants').get().count, 1); db.close();
});
