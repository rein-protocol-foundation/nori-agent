import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const deadlineUs = 120_000_000;
export const nowUs = () => Math.floor((performance.timeOrigin + performance.now()) * 1000);

export function openLedger(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dir, 'events.sqlite'));
  db.exec(`PRAGMA busy_timeout=1500;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS events (
      message_key TEXT NOT NULL, kind TEXT NOT NULL, at_us INTEGER NOT NULL,
      sent_us INTEGER NOT NULL, exported INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(message_key, kind)
    );
    CREATE INDEX IF NOT EXISTS events_pending ON events(exported, at_us);`);
  const insert = db.prepare(`INSERT INTO events(message_key,kind,at_us,sent_us)
    VALUES(?,?,?,?) ON CONFLICT(message_key,kind) DO NOTHING`);
  function record(workspace, channel, ts, kind, atUs) {
    if (!/^[CDG][A-Z0-9]+$/.test(channel) || !/^\d{10}\.\d{6}$/.test(ts)) return;
    const sentUs = Number(ts.replace('.', ''));
    const key = createHash('sha256').update(JSON.stringify([workspace, channel, ts])).digest('hex');
    insert.run(key, kind, atUs, sentUs);
  }
  return { db, record };
}
