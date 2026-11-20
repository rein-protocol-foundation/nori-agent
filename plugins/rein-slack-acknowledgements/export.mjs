// Independent worker: deadlines and export retries continue across Slack restarts.
import { openLedger, nowUs, deadlineUs } from './ledger.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const stateDir = process.argv[2];
const token = process.env.AXIOM_API_TOKEN;
if (!stateDir || !token) throw new Error('Slack acknowledgement exporter configuration missing');
const { db } = openLedger(stateDir);
const due = db.prepare(`INSERT OR IGNORE INTO events(message_key,kind,at_us,sent_us)
  SELECT r.message_key,'overdue',r.sent_us+?,r.sent_us FROM events r
  LEFT JOIN events c ON c.message_key=r.message_key AND c.kind='confirmed'
  LEFT JOIN events b ON b.message_key=r.message_key AND b.kind='overdue'
  WHERE r.kind='required' AND r.sent_us+? < ?
    AND (c.at_us IS NULL OR c.at_us>r.sent_us+?) AND b.message_key IS NULL`);
const pending = db.prepare('SELECT * FROM events WHERE exported=0 ORDER BY at_us LIMIT 100');
const done = db.prepare('UPDATE events SET exported=1 WHERE message_key=? AND kind=?');
const prune = db.prepare(`DELETE FROM events WHERE exported=1 AND at_us<?
  AND message_key NOT IN (SELECT message_key FROM events WHERE exported=0)`);
let nextPrune = 0;
let backoff = 1000;
while (true) {
  try {
    const now = nowUs();
    due.run(deadlineUs, deadlineUs, now, deadlineUs);
    if (now > nextPrune) {
      prune.run(now - 30 * 86400 * 1e6);
      nextPrune = now + 86400 * 1e6;
    }
    const batch = pending.all();
    if (batch.length) {
      const events = batch.map(row => ({
        // Ingest time keeps recovered outbox events in the monitor window.
        name: row.kind === 'overdue' ? 'nori.slack.eyes.overdue/' + row.message_key : 'nori.slack.eyes.' + row.kind,
        'service.name': 'nori-slack', 'resource.deployment.environment.name': 'production',
        nori_ack_key: row.message_key, nori_ack_observed_us: row.at_us, nori_ack_message_us: row.sent_us,
      }));
      const res = await fetch('https://us-east-1.aws.edge.axiom.co/v1/ingest/nori-traces', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
      });
      if (!res.ok) throw new Error('ingest HTTP ' + res.status);
      const receipt = await res.json();
      if (receipt.failed !== 0 || receipt.ingested !== batch.length) throw new Error('incomplete ingest receipt');
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of batch) done.run(row.message_key, row.kind);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    backoff = 1000;
  } catch (e) {
    console.error('Slack acknowledgement export deferred', e instanceof Error ? e.name : 'error');
    backoff = Math.min(60000, backoff * 2);
  }
  await sleep(backoff);
}
