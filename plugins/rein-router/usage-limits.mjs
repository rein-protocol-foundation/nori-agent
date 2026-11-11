// Durable admission only; execution, cancellation and provider accounting remain native.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, openSync, closeSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

const fail = () => { throw new Error('rein_router_usage_unavailable'); };
const hash = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const present = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;
const liveProcess = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
const DAY = 86400000;
const RUN_LIMIT = 100000;

export function usageIdentity(ctx, workspaceId) {
  const chat = ctx.channelContext?.chat?.id ?? ctx.chatId;
  if (![ctx.runId, ctx.agentId, ctx.sessionKey, ctx.channel, ctx.accountId, workspaceId, ctx.senderId, chat].every(present)) fail();
  const base = [ctx.agentId, ctx.channel, ctx.accountId, workspaceId];
  return Object.freeze({ run: hash(['run', ctx.runId]), agent: hash(['agent', ctx.agentId]),
    session: hash(['session', ctx.sessionKey]),
    subject: hash(['sender', ...base, ctx.senderId]), conversation: hash(['conversation', ...base, chat]) });
}

/** A distinct native execution subject, never a fabricated Slack user or channel. */
export function nativeUsageIdentity(ctx) {
  if (![ctx.runId, ctx.agentId, ctx.sessionKey, ctx.sessionId].every(present)) fail();
  return Object.freeze({ run: hash(['run', ctx.runId]), agent: hash(['agent', ctx.agentId]),
    session: hash(['session', ctx.sessionKey]), subject: hash(['native-agent', ctx.agentId]),
    conversation: hash(['native-session', ctx.agentId, ctx.sessionKey]) });
}

/** One private database per native state directory; SQLite serializes admission across runtimes. */
export function createUsageLedger({ stateDir, clock = () => Date.now(), pid = process.pid, processAlive = liveProcess }) {
  if (!isAbsolute(stateDir) || !Number.isSafeInteger(pid) || pid < 1) fail();
  const directory = join(stateDir, 'rein-router-usage');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const privateEntry = (path, directory = false) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1) ||
        (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) fail();
  };
  privateEntry(directory, true);
  const path = join(directory, 'admission.sqlite');
  try { closeSync(openSync(path, 'wx', 0o600)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  privateEntry(path);
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS clock (id INTEGER PRIMARY KEY CHECK(id=1), last_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (
      run TEXT PRIMARY KEY, agent TEXT NOT NULL, session TEXT NOT NULL, subject TEXT NOT NULL,
      conversation TEXT NOT NULL, pid INTEGER NOT NULL, started INTEGER NOT NULL,
      finished INTEGER);
    CREATE INDEX IF NOT EXISTS runs_agent_started ON runs(agent, started);
    CREATE INDEX IF NOT EXISTS runs_subject_started ON runs(subject, started);
    CREATE INDEX IF NOT EXISTS runs_conversation_started ON runs(conversation, started);
    CREATE TABLE IF NOT EXISTS usage (day INTEGER NOT NULL, agent TEXT NOT NULL, calls INTEGER NOT NULL,
      PRIMARY KEY(day, agent));`);
  let closed = false;
  const transaction = fn => {
    if (closed) fail();
    privateEntry(directory, true); privateEntry(path);
    db.exec('BEGIN IMMEDIATE');
    try {
      const now = clock();
      if (!Number.isSafeInteger(now) || now < 0 || now < (db.prepare('SELECT last_ms FROM clock WHERE id=1').get()?.last_ms ?? 0)) fail();
      db.prepare('INSERT INTO clock VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_ms=excluded.last_ms').run(now);
      const result = fn(now);
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const rowFor = identity => {
    const row = db.prepare('SELECT * FROM runs WHERE run=?').get(identity.run);
    if (!row || ['agent', 'session', 'subject', 'conversation'].some(key => row[key] !== identity[key]) || row.finished !== null) fail();
    return row;
  };
  const calls = (agent, now) => db.prepare('SELECT calls FROM usage WHERE day=? AND agent=?').get(Math.floor(now / DAY), agent)?.calls ?? 0;
  return {
    admit(identity, limits) {
      return transaction(now => {
        const previous = db.prepare('SELECT * FROM runs WHERE run=?').get(identity.run);
        if (previous) {
          rowFor(identity);
          return;
        }
        // A dead process cannot still be executing its native run. No timeout-based lease eviction:
        // a live process with an overdue tool retains its slot until executionSettled is observed.
        for (const { pid: owner } of db.prepare('SELECT DISTINCT pid FROM runs WHERE finished IS NULL').all()) {
          if (owner !== pid && !processAlive(owner)) db.prepare('UPDATE runs SET finished=? WHERE pid=? AND finished IS NULL').run(now, owner);
        }
        db.prepare('DELETE FROM runs WHERE finished IS NOT NULL AND started<?').run(now - 2 * DAY);
        db.prepare('DELETE FROM usage WHERE day<?').run(Math.floor(now / DAY) - 2);
        if (db.prepare('SELECT COUNT(*) AS n FROM runs').get().n >= RUN_LIMIT) fail();
        if (calls(identity.agent, now) >= limits.maxGatewayRequestsPerDay) throw new Error('rein_router_daily_budget');
        for (const [column, maximum, activeMaximum] of [
          ['subject', limits.perUserPerMinute, limits.perUserConcurrent],
          ['conversation', limits.perConversationPerMinute, limits.perConversationConcurrent],
          ['agent', undefined, limits.maxConcurrent],
        ]) {
          // Column names are fixed above, never input from configuration or a requester.
          const counts = db.prepare(`SELECT SUM(CASE WHEN started>? THEN 1 ELSE 0 END) AS recent,
            SUM(CASE WHEN finished IS NULL THEN 1 ELSE 0 END) AS active FROM runs WHERE ${column}=?`).get(now - 60000, identity[column]);
          if ((maximum !== undefined && counts.recent >= maximum) || counts.active >= activeMaximum)
            throw new Error('rein_router_request_limit');
        }
        db.prepare('INSERT INTO runs(run,agent,session,subject,conversation,pid,started) VALUES (?,?,?,?,?,?,?)')
          .run(identity.run, identity.agent, identity.session, identity.subject, identity.conversation, pid, now);
      });
    },
    assertCurrent(identity) {
      return transaction(() => { rowFor(identity); });
    },
    reserveRequest(identity, limits) {
      return transaction(now => {
        rowFor(identity);
        if (calls(identity.agent, now) >= limits.maxGatewayRequestsPerDay) throw new Error('rein_router_daily_budget');
        db.prepare('INSERT INTO usage(day,agent,calls) VALUES(?,?,1) ON CONFLICT(day,agent) DO UPDATE SET calls=calls+1')
          .run(Math.floor(now / DAY), identity.agent);
      });
    },
    settle(event) {
      if (event?.stream !== 'lifecycle' || !['end', 'error'].includes(event.data?.phase) || event.data.executionSettled !== true || !present(event.runId)) return false;
      return transaction(now => {
        const run = hash(['run', event.runId]), row = db.prepare('SELECT * FROM runs WHERE run=?').get(run);
        if (!row || row.finished !== null || (event.agentId !== undefined && row.agent !== hash(['agent', event.agentId])) ||
            (event.sessionKey !== undefined && row.session !== hash(['session', event.sessionKey]))) return false;
        db.prepare('UPDATE runs SET finished=? WHERE run=?').run(now, run);
        return true;
      });
    },
    close() { if (!closed) { closed = true; db.close(); } },
  };
}
