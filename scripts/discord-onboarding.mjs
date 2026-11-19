#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { acquireWriter, assertDiscordId, openOnboardingStore } from './discord-onboarding-store.mjs';

const DAY = 86_400_000, WEEK = 7 * DAY, DISCORD_EPOCH = 1420070400000;
const snowflake = ms => ((BigInt(ms) - 1420070400000n) << 22n).toString();
const timestamp = value => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error('Discord timestamp unavailable');
  return ms;
};
export function onboardingWindow(at = new Date()) {
  if (typeof at === 'string' && !/(?:Z|[+-]\d\d:\d\d)$/.test(at)) throw new Error('Scheduled time requires an explicit UTC offset');
  const ms = typeof at === 'number' ? at : timestamp(at instanceof Date ? at.toISOString() : at);
  const date = new Date(ms);
  date.setUTCHours(16, 0, 0, 0); // 08:00 fixed PST (UTC-8), including summer.
  if (date.getTime() > ms) date.setUTCDate(date.getUTCDate() - 1);
  return { start: date.getTime() - DAY, cutoff: date.getTime() };
}

function configuration(config) {
  assertDiscordId(config.guildId); assertDiscordId(config.introductionsChannelId);
  const welcomeChannelId = config.welcomeChannelId ?? config.introductionsChannelId;
  assertDiscordId(welcomeChannelId);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(config.tokenEnv ?? '')) throw new Error('Invalid token environment name');
  if (config.skipAlreadyIntroduced !== undefined && typeof config.skipAlreadyIntroduced !== 'boolean') throw new Error('Invalid introduction preference');
  return { ...config, welcomeChannelId, skipAlreadyIntroduced: config.skipAlreadyIntroduced !== false };
}

function discordClient({ token, fetchImpl, sleep, maxRequests, maxPages, lease }) {
  let requests = 0;
  async function request(path, { method = 'GET', body, missing = false } = {}) {
    for (let retry = 0; retry < 4; retry++) {
      lease?.renew();
      if (++requests > maxRequests) throw new Error('Discord request budget exhausted');
      let response;
      try {
        response = await fetchImpl(`https://discord.com/api/v10${path}`, {
          method, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Nori-Onboarding/1.0' },
          redirect: 'error',
          ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
        });
      } catch { throw new Error(method === 'POST' ? 'Welcome delivery uncertain; reconcile before retry' : 'Discord read failed'); }
      lease?.renew();
      if (missing && response.status === 404) return null;
      if (response.status === 429) {
        const limited = await response.json();
        const delay = Number(limited.retry_after);
        if (!Number.isFinite(delay) || delay < 0 || delay > 60 || retry === 3) throw new Error('Discord rate limit exceeded');
        await sleep(Math.ceil(delay * 1000));
        continue;
      }
      if (!response.ok) throw new Error(method === 'POST' ? 'Welcome delivery refused or uncertain; reconcile before retry' : 'Discord read refused');
      try { return await response.json(); } catch { throw new Error('Discord response invalid; delivery may be uncertain'); }
    }
  }
  async function members(guildId) {
    const all = []; let after = '0';
    for (let page = 0; page < maxPages; page++) {
      const batch = await request(`/guilds/${guildId}/members?limit=1000&after=${after}`);
      if (!Array.isArray(batch) || batch.length > 1000) throw new Error('Invalid Discord member page');
      let previous = after;
      for (const member of batch) {
        assertDiscordId(member.user?.id);
        if (BigInt(member.user.id) <= BigInt(previous)) throw new Error('Discord member pagination did not advance');
        previous = member.user.id;
      }
      all.push(...batch);
      if (batch.length < 1000) return all;
      const next = batch.at(-1).user.id;
      if (BigInt(next) <= BigInt(after)) throw new Error('Discord member pagination did not advance');
      after = next;
    }
    throw new Error('Discord member pagination limit exceeded');
  }
  async function messages(channelId, start, end) {
    const all = []; let before = snowflake(end);
    for (let page = 0; page < maxPages; page++) {
      const batch = await request(`/channels/${channelId}/messages?limit=100&before=${before}`);
      if (!Array.isArray(batch) || batch.length > 100) throw new Error('Invalid Discord message page');
      let crossed = false, previous = before;
      for (const message of batch) {
        assertDiscordId(message.id);
        if (BigInt(message.id) >= BigInt(previous)) throw new Error('Discord message pagination did not advance');
        previous = message.id;
        const created = timestamp(message.timestamp);
        if (created < start) crossed = true;
        if (created >= start && created < end) all.push(message);
      }
      if (crossed || batch.length < 100) return all;
      before = batch.at(-1).id;
    }
    throw new Error('Discord message pagination limit exceeded');
  }
  return { request, members, messages };
}

function humanMessage(message, channelId, requireContent = true) {
  return message.channel_id === channelId && message.author && !message.author.bot && !message.webhook_id && [0, 19].includes(message.type) &&
    (!requireContent || (typeof message.content === 'string' && message.content.trim().length > 0) || (Array.isArray(message.attachments) && message.attachments.length > 0));
}
function welcomeContent(users, joined, config) {
  const destination = config.welcomeChannelId === config.introductionsChannelId ? 'here' : `in <#${config.introductionsChannelId}>`;
  return `Welcome ${users.map(id => `<@${id}>`).join(' ')}! We're glad you're here. ${joined} new human ${joined === 1 ? 'member joined' : 'members joined'} in the past 24 hours.\n\nIf you'd like, introduce yourself ${destination}: “Hi, I'm …; I'm interested in …; I'd like to learn or contribute …” Sharing is optional—feel free to look around first.`;
}
function reminderContent(users, config) {
  return `Hi ${users.map(id => `<@${id}>`).join(' ')}! If you'd like, share a short introduction in <#${config.introductionsChannelId}>: your interests or something you'd like to learn or contribute. It's optional. Post “no reminders” in <#${config.introductionsChannelId}> to opt out, or “resume reminders” to resume.`;
}
function reminderPreference(message) {
  const text = (message.content ?? '').normalize('NFKC').trim().replace(/[’‘]/g, "'");
  if (text.length > 160) return null;
  if (/^(?:no reminders|please (?:do not|don't|dont) remind me|do not remind me|don't remind me|不要提醒我|别提醒我)[.!。！]?$/iu.test(text)) return true;
  if (/^(?:resume reminders|please resume reminders|恢复提醒|继续提醒我)[.!。！]?$/iu.test(text)) return false;
  return null;
}

export async function runDiscordOnboarding(rawConfig, {
  at = new Date(), dryRun = false, collectOnly = false, fetchImpl = globalThis.fetch, env = process.env,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now(),
  maxRequests = 4000, maxPages = 1000,
} = {}) {
  const config = configuration(rawConfig);
  const token = env[config.tokenEnv];
  if (typeof token !== 'string' || !token.trim()) throw new Error('Discord bot token unavailable');
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isInteger(maxPages) || maxPages < 1) throw new Error('Invalid request bounds');
  const window = onboardingWindow(at), cutoff = new Date(window.cutoff).toISOString();
  const sunday = new Date(window.cutoff).getUTCDay() === 0;
  const db = openOnboardingStore(config.statePath, { readOnly: dryRun });
  let lease;
  try {
    if (!dryRun) lease = acquireWriter(db, { now });
    const api = discordClient({ token, fetchImpl, sleep, maxRequests, maxPages, lease });
    const validatedChannels = new Set();
    async function validateChannel(channelId) {
      if (validatedChannels.has(channelId)) return;
      const channel = await api.request(`/channels/${channelId}`);
      if (channel.guild_id !== config.guildId || ![0, 5].includes(channel.type)) throw new Error('Onboarding channel must be a guild text channel in the configured guild');
      validatedChannels.add(channelId);
    }
    await validateChannel(config.introductionsChannelId);
    await validateChannel(config.welcomeChannelId);
    const bot = await api.request('/users/@me');
    if (!bot.bot) throw new Error('Onboarding requires a bot account');
    assertDiscordId(bot.id);
    // Finish all paginated reads before archiving or creating any delivery intent.
    const members = await api.members(config.guildId);
    const hasTable = name => Boolean(db?.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    const hasCutoffs = hasTable('archive_cutoffs');
    const lastArchived = hasCutoffs ? db.prepare('SELECT cutoff FROM archive_cutoffs WHERE guild_id=? AND channel_id=?')
      .get(config.guildId, config.introductionsChannelId)?.cutoff : null;
    const baseline = hasTable('archive_baselines') && db.prepare('SELECT 1 FROM archive_baselines WHERE guild_id=? AND channel_id=?')
      .get(config.guildId, config.introductionsChannelId);
    const needsBaseline = (sunday || collectOnly) && !baseline;
    const archiveStart = needsBaseline ? Number(BigInt(config.introductionsChannelId) >> 22n) + DISCORD_EPOCH :
      (lastArchived ? Math.min(window.start, timestamp(lastArchived)) : window.start);
    const messages = await api.messages(config.introductionsChannelId, archiveStart, window.cutoff);
    const preferenceMessages = config.welcomeChannelId === config.introductionsChannelId ? messages :
      [...messages, ...await api.messages(config.welcomeChannelId,
        needsBaseline ? Number(BigInt(config.welcomeChannelId) >> 22n) + DISCORD_EPOCH : archiveStart, window.cutoff)];
    const contributions = messages.filter(message => humanMessage(message, config.introductionsChannelId));
    // Content-restricted or sticker-only posts still prove participation. Keep only a marker,
    // rather than treating empty content as an introduction or repeatedly reminding its author.
    const participants = messages.filter(message => humanMessage(message, config.introductionsChannelId, false) && reminderPreference(message) === null);
    for (const message of participants) assertDiscordId(message.author.id);
    const preferences = new Map(hasTable('reminder_preferences') ? db.prepare('SELECT * FROM reminder_preferences WHERE guild_id=?')
      .all(config.guildId).map(row => [row.user_id, row]) : []);
    for (const message of preferenceMessages) {
      if (![config.introductionsChannelId, config.welcomeChannelId].includes(message.channel_id) || !humanMessage(message, message.channel_id)) continue;
      const optedOut = reminderPreference(message);
      if (optedOut === null) continue;
      assertDiscordId(message.author.id);
      const observed = message.edited_timestamp ?? message.timestamp;
      timestamp(observed);
      const previous = preferences.get(message.author.id);
      if (!previous || timestamp(observed) > timestamp(previous.observed_at) ||
          (timestamp(observed) === timestamp(previous.observed_at) && BigInt(message.id) > BigInt(previous.message_id))) {
        preferences.set(message.author.id, { user_id: message.author.id, opted_out: Number(optedOut), observed_at: observed, message_id: message.id });
      }
    }
    // Archive progress is independent of public delivery. Pending sends must not hold it back.
    if (!dryRun) lease.transaction(() => {
      const insert = db.prepare(`INSERT INTO contributions VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,message_id)
        DO UPDATE SET username=excluded.username,content=excluded.content,attachments=excluded.attachments,edited_at=excluded.edited_at`);
      for (const message of contributions) insert.run(config.guildId, message.author.id, message.id, config.introductionsChannelId,
        message.author.username ?? '', message.content ?? '', JSON.stringify((message.attachments ?? []).map(({ id, filename, url, content_type, size }) => ({ id, filename, url, contentType: content_type, size }))),
        message.timestamp, message.edited_timestamp ?? null, `https://discord.com/channels/${config.guildId}/${config.introductionsChannelId}/${message.id}`);
      for (const message of participants) db.prepare('INSERT OR IGNORE INTO introduction_participants VALUES (?,?,?,?)')
        .run(config.guildId, config.introductionsChannelId, message.author.id, message.id);
      db.prepare(`INSERT INTO archive_cutoffs VALUES (?,?,?) ON CONFLICT(guild_id,channel_id)
        DO UPDATE SET cutoff=MAX(archive_cutoffs.cutoff,excluded.cutoff)`).run(config.guildId, config.introductionsChannelId, cutoff);
      if (needsBaseline) db.prepare('INSERT OR REPLACE INTO archive_baselines VALUES (?,?,?)')
        .run(config.guildId, config.introductionsChannelId, cutoff);
      for (const preference of preferences.values()) db.prepare('INSERT OR REPLACE INTO reminder_preferences VALUES (?,?,?,?,?)')
        .run(config.guildId, preference.user_id, preference.opted_out, preference.observed_at, preference.message_id);
    });
    const joined = members.filter(member => !member.user.bot && member.joined_at && timestamp(member.joined_at) >= window.start && timestamp(member.joined_at) < window.cutoff);
    if (collectOnly) return { joined: joined.length, welcomed: 0, dailyWelcomed: 0, weeklyReminded: 0,
      archived: contributions.length, dryRun, collectOnly: true };
    const everIntroduced = new Set(participants.map(message => message.author.id));
    if (db) for (const row of db.prepare('SELECT user_id,content FROM contributions WHERE guild_id=? AND channel_id=?')
      .all(config.guildId, config.introductionsChannelId)) {
      if (row.content == null || reminderPreference({ content: row.content }) === null) everIntroduced.add(row.user_id);
    }
    if (hasTable('introduction_participants')) for (const row of db.prepare('SELECT p.user_id,c.content FROM introduction_participants p LEFT JOIN contributions c ON c.guild_id=p.guild_id AND c.message_id=p.message_id WHERE p.guild_id=? AND p.channel_id=?')
      .all(config.guildId, config.introductionsChannelId)) {
      if (row.content == null || reminderPreference({ content: row.content }) === null) everIntroduced.add(row.user_id);
    }
    const reconciledUsers = new Set();
    const wasWelcomed = id => reconciledUsers.has(id) || Boolean(db?.prepare('SELECT 1 FROM welcomes WHERE guild_id=? AND user_id=?').get(config.guildId, id));
    const notifiedThisRun = new Set(), recentNotifications = new Set();
    if (hasTable('notifications')) {
      for (const row of db.prepare('SELECT DISTINCT user_id FROM notifications WHERE guild_id=? AND notified_at>?')
        .all(config.guildId, new Date(now() - WEEK).toISOString())) recentNotifications.add(row.user_id);
    } else if (db) {
      // Read-only dry run against the older schema must not migrate or forget old daily pings.
      for (const row of db.prepare('SELECT user_id FROM welcomes WHERE guild_id=? AND cutoff>?')
        .all(config.guildId, new Date(now() - WEEK).toISOString())) recentNotifications.add(row.user_id);
    }
    let welcomed = 0, weeklyReminded = 0;
    function receipt(intent, messageId, deliveredAt) {
      assertDiscordId(messageId);
      timestamp(deliveredAt);
      lease.transaction(() => {
        db.prepare("UPDATE intents SET status='sent',message_id=? WHERE nonce=?").run(messageId, intent.nonce);
        for (const id of JSON.parse(intent.users)) {
          if ((intent.kind ?? 'daily') === 'daily') db.prepare('INSERT OR IGNORE INTO welcomes VALUES (?,?,?,?)').run(config.guildId, id, messageId, intent.cutoff);
          db.prepare('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?)')
            .run(config.guildId, id, messageId, intent.kind ?? 'daily', intent.cutoff, new Date(timestamp(deliveredAt)).toISOString());
        }
      });
    }
    const pending = db?.prepare("SELECT * FROM intents WHERE guild_id=? AND status='pending'").all(config.guildId) ?? [];
    if (pending.length) {
      // A pending POST may already have been accepted. Never repeat it on missing evidence.
      const histories = new Map();
      for (const channelId of new Set(pending.map(intent => intent.channel_id))) {
        await validateChannel(channelId);
        histories.set(channelId, await api.messages(channelId,
          Math.min(...pending.filter(intent => intent.channel_id === channelId).map(intent => timestamp(intent.created_at))), now() + 1000));
      }
      for (const intent of pending) {
        const found = histories.get(intent.channel_id).find(message => message.author?.id === bot.id && message.channel_id === intent.channel_id &&
          (String(message.nonce ?? '') === intent.nonce || (message.content === intent.content && timestamp(message.timestamp) >= timestamp(intent.created_at))));
        if (!found) throw new Error('Pending welcome cannot be reconciled; operator review required');
        for (const id of JSON.parse(intent.users)) {
          if ((intent.kind ?? 'daily') === 'daily') reconciledUsers.add(id);
          if (timestamp(found.timestamp) > now() - WEEK) recentNotifications.add(id);
        }
        if (!dryRun) receipt(intent, found.id, found.timestamp);
      }
    }
    async function sendNotifications(kind, eligible) {
      // Recheck current membership before creating any public send intent.
      const present = [];
      for (const member of eligible) {
        const current = await api.request(`/guilds/${config.guildId}/members/${member.user.id}`, { missing: true });
        if (current && current.user?.id === member.user.id && !current.user.bot &&
            (kind !== 'weekly' || (current.joined_at && timestamp(current.joined_at) <= window.cutoff - WEEK))) present.push(member.user.id);
      }
      for (let offset = 0; offset < present.length; offset += 20) {
        const users = present.slice(offset, offset + 20), content = kind === 'daily' ? welcomeContent(users, joined.length, config) : reminderContent(users, config);
        if (content.length >= 2000) throw new Error('Welcome exceeds Discord content limit');
        if (kind === 'daily') welcomed += users.length; else weeklyReminded += users.length;
        for (const id of users) notifiedThisRun.add(id);
        if (dryRun) continue;
        const nonce = createHash('sha256').update(JSON.stringify([config.guildId, config.welcomeChannelId, cutoff, kind, users])).digest('hex').slice(0, 24);
        const createdAt = new Date(now()).toISOString();
        const intent = { nonce, users: JSON.stringify(users), cutoff, kind };
        lease.transaction(() => db.prepare("INSERT INTO intents (nonce,guild_id,channel_id,cutoff,users,content,created_at,status,message_id,kind) VALUES (?,?,?,?,?,?,?,'pending',NULL,?)")
          .run(nonce, config.guildId, config.welcomeChannelId, cutoff, intent.users, content, createdAt, kind));
        const sent = await api.request(`/channels/${config.welcomeChannelId}/messages`, { method: 'POST', body: {
          content, nonce, enforce_nonce: true, allowed_mentions: { users, parse: [], replied_user: false },
        } });
        if (sent.channel_id !== config.welcomeChannelId || sent.author?.id !== bot.id || sent.content !== content) throw new Error('Welcome receipt invalid; operator review required');
        receipt(intent, sent.id, sent.timestamp ?? createdAt);
      }
    }
    const optedOut = id => Boolean(preferences.get(id)?.opted_out);
    await sendNotifications('daily', joined.filter(member => !optedOut(member.user.id) && !wasWelcomed(member.user.id) &&
      !recentNotifications.has(member.user.id) && !(config.skipAlreadyIntroduced && everIntroduced.has(member.user.id))));
    if (sunday) {
      // Full-history read above must have completed before this classification can run.
      await sendNotifications('weekly', members.filter(member => !member.user.bot && member.joined_at &&
        timestamp(member.joined_at) <= window.cutoff - WEEK && !everIntroduced.has(member.user.id) && !optedOut(member.user.id) &&
        !recentNotifications.has(member.user.id) && !notifiedThisRun.has(member.user.id)));
    }
    const countKind = kind => Number(db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE guild_id=? AND cutoff=? AND kind=?').get(config.guildId, cutoff, kind).count);
    const totalWelcomed = dryRun ? welcomed : countKind('daily'), totalReminded = dryRun ? weeklyReminded : countKind('weekly');
    if (!dryRun) lease.transaction(() => db.prepare(`INSERT OR REPLACE INTO runs (guild_id,cutoff,joined,welcomed,archived,daily_welcomed,weekly_reminded)
      VALUES (?,?,?,?,?,?,?)`).run(config.guildId, cutoff, joined.length, totalWelcomed, contributions.length, totalWelcomed, totalReminded));
    return { joined: joined.length, welcomed: totalWelcomed, dailyWelcomed: totalWelcomed, weeklyReminded: totalReminded, archived: contributions.length, dryRun };
  } finally { lease?.release(); db?.close(); }
}

export async function main(args = process.argv.slice(2)) {
  let configPath, at, dryRun = false, collectOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') { configPath = args[++i]; if (!configPath || configPath.startsWith('--')) throw new Error('Missing configuration path'); }
    else if (args[i] === '--at') { at = args[++i]; if (!at || at.startsWith('--')) throw new Error('Missing scheduled time'); }
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--collect-only') collectOnly = true;
    else throw new Error('Unknown onboarding argument');
  }
  if (!configPath || (at !== undefined && !/Z$|[+-]\d\d:\d\d$/.test(at))) throw new Error('Use --config private.json [--at ISO-with-offset] [--dry-run] [--collect-only]');
  const info = statSync(configPath);
  if (!info.isFile() || (info.mode & 0o077)) throw new Error('Onboarding config must be a private file (0600)');
  const summary = await runDiscordOnboarding(JSON.parse(readFileSync(configPath, 'utf8')), { at, dryRun, collectOnly });
  console.log(JSON.stringify(summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Discord onboarding failed; inspect private state and operator configuration.'); process.exitCode = 1; });
}
