import { DatabaseSync } from 'node:sqlite';
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

export function assertDiscordId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) throw new Error('Invalid Discord ID');
  return value;
}

export function openOnboardingStore(statePath, { readOnly = false } = {}) {
  if (!isAbsolute(statePath ?? '')) throw new Error('State path must be absolute');
  if (readOnly && !existsSync(statePath)) return null;
  if (!readOnly) {
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
    if (lstatSync(dirname(statePath)).isSymbolicLink()) throw new Error('State directory must not be a symlink');
    if (lstatSync(dirname(statePath)).mode & 0o077) throw new Error('State directory must be private (0700)');
    if (!existsSync(statePath)) closeSync(openSync(statePath, 'wx', 0o600));
  }
  const info = lstatSync(statePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('State must be a regular file');
  if (readOnly && ((info.mode & 0o077) || (lstatSync(dirname(statePath)).mode & 0o077))) throw new Error('State reader requires private file and directory modes');
  if (!readOnly) chmodSync(statePath, 0o600);
  const db = new DatabaseSync(statePath, { readOnly });
  if (!readOnly) db.exec(`
    PRAGMA journal_mode=DELETE;
    PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS writer (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS contributions (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL, username TEXT NOT NULL, content TEXT NOT NULL,
      attachments TEXT NOT NULL, created_at TEXT NOT NULL, edited_at TEXT, source_url TEXT NOT NULL,
      PRIMARY KEY(guild_id,message_id));
    CREATE INDEX IF NOT EXISTS contribution_owner ON contributions(guild_id,user_id,created_at);
    CREATE TABLE IF NOT EXISTS welcomes (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, message_id TEXT NOT NULL,
      cutoff TEXT NOT NULL, PRIMARY KEY(guild_id,user_id));
    CREATE TABLE IF NOT EXISTS intents (
      nonce TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      cutoff TEXT NOT NULL, users TEXT NOT NULL, content TEXT NOT NULL,
      created_at TEXT NOT NULL, status TEXT NOT NULL, message_id TEXT);
    CREATE TABLE IF NOT EXISTS runs (
      guild_id TEXT NOT NULL, cutoff TEXT NOT NULL, joined INTEGER NOT NULL,
      welcomed INTEGER NOT NULL, archived INTEGER NOT NULL, PRIMARY KEY(guild_id,cutoff));
    CREATE TABLE IF NOT EXISTS archive_cutoffs (
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, cutoff TEXT NOT NULL,
      PRIMARY KEY(guild_id,channel_id));
    CREATE TABLE IF NOT EXISTS archive_baselines (
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, cutoff TEXT NOT NULL,
      PRIMARY KEY(guild_id,channel_id));
    CREATE TABLE IF NOT EXISTS introduction_participants (
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, user_id TEXT NOT NULL,
      message_id TEXT NOT NULL, PRIMARY KEY(guild_id,channel_id,user_id));
    CREATE TABLE IF NOT EXISTS notifications (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, message_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('daily','weekly')), cutoff TEXT NOT NULL,
      notified_at TEXT NOT NULL, PRIMARY KEY(guild_id,user_id,message_id));
    CREATE INDEX IF NOT EXISTS notification_recency ON notifications(guild_id,user_id,notified_at);
    CREATE TABLE IF NOT EXISTS reminder_preferences (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, opted_out INTEGER NOT NULL,
      observed_at TEXT NOT NULL, message_id TEXT NOT NULL, PRIMARY KEY(guild_id,user_id));
  `);
  if (!readOnly) {
    // Additive upgrade: old intents and welcome receipts retain their daily meaning.
    if (!db.prepare('PRAGMA table_info(intents)').all().some(column => column.name === 'kind')) {
      db.exec("ALTER TABLE intents ADD COLUMN kind TEXT NOT NULL DEFAULT 'daily'");
    }
    const runColumns = new Set(db.prepare('PRAGMA table_info(runs)').all().map(column => column.name));
    for (const column of ['daily_welcomed', 'weekly_reminded']) if (!runColumns.has(column)) {
      db.exec(`ALTER TABLE runs ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    }
    db.exec(`INSERT OR IGNORE INTO notifications (guild_id,user_id,message_id,kind,cutoff,notified_at)
      SELECT w.guild_id,w.user_id,w.message_id,'daily',w.cutoff,
        COALESCE((SELECT created_at FROM intents i WHERE i.message_id=w.message_id LIMIT 1),w.cutoff)
      FROM welcomes w`);
  }
  return db;
}

// The caller must establish trusted guild + current-user identity before invoking this reader.
// These are original self-reported channel contributions, not verified profiles or biographies.
export function readSelfReportedIntroductions({ statePath, guildId, userId, channelId, limit = 20 }) {
  assertDiscordId(guildId); assertDiscordId(userId);
  if (channelId !== undefined) assertDiscordId(channelId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid contribution limit');
  const db = openOnboardingStore(statePath, { readOnly: true });
  if (!db) return [];
  try {
    return db.prepare(`SELECT guild_id AS guildId,user_id AS userId,message_id AS messageId,
      channel_id AS channelId,username,content,attachments,created_at AS createdAt,
      edited_at AS editedAt,source_url AS sourceUrl FROM contributions
      WHERE guild_id=? AND user_id=? ${channelId === undefined ? '' : 'AND channel_id=?'}
      ORDER BY created_at DESC,message_id DESC LIMIT ?`)
      .all(...[guildId, userId, ...(channelId === undefined ? [] : [channelId]), limit])
      .map(row => ({ ...row, attachments: JSON.parse(row.attachments), evidenceType: 'self-reported-channel-contribution' }));
  } finally { db.close(); }
}

export function acquireWriter(db, { now = () => Date.now(), leaseMs = 120_000 } = {}) {
  const owner = randomUUID();
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  transaction(() => {
    const old = db.prepare('SELECT * FROM writer WHERE id=1').get();
    if (old && old.expires > now()) throw new Error('Onboarding writer already active');
    db.prepare('INSERT OR REPLACE INTO writer VALUES (1,?,?)').run(owner, now() + leaseMs);
  });
  return {
    renew() {
      const result = db.prepare('UPDATE writer SET expires=? WHERE id=1 AND owner=? AND expires>?')
        .run(now() + leaseMs, owner, now());
      if (result.changes !== 1) throw new Error('Onboarding writer lease expired');
    },
    transaction(fn) { return transaction(() => { this.renew(); return fn(); }); },
    release() { db.prepare('DELETE FROM writer WHERE id=1 AND owner=?').run(owner); },
  };
}
