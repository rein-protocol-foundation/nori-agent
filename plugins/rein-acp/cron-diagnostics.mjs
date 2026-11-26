// The same read-only SQLite boundary used by the independent cron watchdog.
// Keep the native ledger's errors, command lines and job payloads out of Slack.
import { DatabaseSync } from 'node:sqlite';

function failureReasons(row) {
  const reasons = new Set();
  const detail = JSON.parse(row.detail ?? '{}');
  const messages = [row.error, detail.error, detail.summary, detail.diagnostics?.summary];
  for (const entry of detail.diagnostics?.entries ?? []) {
    if (entry.severity === 'error') messages.push(entry.message);
  }
  for (const message of messages) {
    if (typeof message !== 'string') continue;
    const exit = /command exited with code (\d{1,3})\b/i.exec(message);
    if (exit) reasons.add('command exited with code ' + exit[1]);
    if (/unexpected EOF|connection lost mid-reply/i.test(message)) reasons.add('model or upstream connection ended mid-response');
    if (/未取得可验证的新快照/.test(message)) reasons.add('collector produced no verifiable fresh snapshot');
    if (/agent couldn.t generate a response/i.test(message)) reasons.add('agent could not generate a response');
    if (/timed? ?out|deadline exceeded/i.test(message)) reasons.add('timeout');
    if (/gateway stopping/i.test(message)) reasons.add('gateway was stopping');
    if (/rate limit|too many requests/i.test(message)) reasons.add('rate limit');
    if (/permission denied|access denied|EACCES/i.test(message)) reasons.add('access denied');
    if (/ENOENT|no such file or directory/i.test(message)) reasons.add('file or directory missing');
  }
  return [...reasons];
}

export function inspectCronJobs({ database, store, agentId }, names) {
  if (!Array.isArray(names) || !names.length || names.length > 8 ||
      !names.every(name => typeof name === 'string' && name.length > 0 && name.length <= 160))
    throw Error('invalid_cron_job_names');
  let db;
  try {
    db = new DatabaseSync(database, { readOnly: true, timeout: 1500 });
    db.exec('BEGIN');
    // A job attached to a private user/thread is never an operator-job match.
    const jobs = db.prepare(`SELECT job_id, enabled FROM cron_jobs WHERE store_key = ?
      AND name = ? AND agent_id = ? AND owner_agent_id IS NULL
      AND json_extract(job_json, '$.owner') IS NULL AND json_extract(job_json, '$.sessionKey') IS NULL
      AND json_extract(job_json, '$.sessionTarget') IN ('isolated','main') LIMIT 2`);
    const history = db.prepare(`SELECT status, started_at_ms AS started, finished_at_ms AS finished,
      error_text AS error FROM cron_run_receipts WHERE store_key = ? AND job_id = ?
      AND finished_at_ms IS NOT NULL ORDER BY finished_at_ms DESC, receipt_id DESC LIMIT 1`);
    const failure = db.prepare(`SELECT status, started_at_ms AS started, finished_at_ms AS finished,
      error_text AS error FROM cron_run_receipts WHERE store_key = ? AND job_id = ?
      AND status IN ('error','interrupted') AND finished_at_ms IS NOT NULL
      ORDER BY finished_at_ms DESC, receipt_id DESC LIMIT 1`);
    const diagnostics = db.prepare(`SELECT detail_json AS detail FROM task_runs
      WHERE task_kind = 'automation_run' AND source_id = ? AND json_extract(detail_json,'$.storeKey') = ?
      AND json_extract(detail_json,'$.runAtMs') = ? LIMIT 1`);
    const time = row => row ? { status: row.status, startedAt: new Date(row.started).toISOString(),
      finishedAt: new Date(row.finished).toISOString() } : null;
    return [...new Set(names)].map(name => {
      const matches = jobs.all(store, name, agentId);
      if (matches.length !== 1) return { name, status: 'unavailable' };
      const { job_id: id, enabled } = matches[0];
      const last = history.get(store, id), failed = failure.get(store, id);
      const reasons = failed && failureReasons({ ...failed, ...diagnostics.get(id, store, failed.started) });
      return { name, enabled: Boolean(enabled), latest: time(last), latestFailure: failed ? { ...time(failed),
        recordedReasons: reasons.length ? reasons : ['no shareable specific reason recorded'] } : null };
    });
  } catch {
    throw Error('cron_receipt_store_unavailable');
  } finally { db?.close(); }
}
