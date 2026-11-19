import { createHash, randomUUID } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PARTICIPATION_RUBRIC_VERSION, validateParticipationPolicy } from './slack-participation.mjs';

const fail = () => { throw new Error('router_participation_evidence_unavailable'); };
const allowedReasons = ['participate', 'passive', 'message-bounds', 'decision-unavailable',
  'decision-invalid', 'cancelled', 'capacity', 'rate-limit'];
const allowedBeliefs = ['yes', 'no', 'uncertain', 'invalid', 'not-evaluated'];
const isProbability = value => value === null || (Number.isFinite(value) && value >= 0 && value <= 1);
export const isSlackMessageId = value => typeof value === 'string' && /^\d{1,20}\.\d{1,9}$/.test(value);
export const isSlackReviewerId = value => typeof value === 'string' && /^[UW][A-Z0-9]{5,31}$/.test(value);
export const participationScopeKey = scope => JSON.stringify(validateParticipationPolicy({ channels: [scope] }).channels[0]);
export const participationPolicyDigest = policy => createHash('sha256')
  .update(JSON.stringify([PARTICIPATION_RUBRIC_VERSION, validateParticipationPolicy(policy)])).digest('hex');

function requirePrivate(path, directory = false) {
  const info = lstatSync(path);
  if (!(directory ? info.isDirectory() : info.isFile() && info.nlink === 1) ||
      (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) fail();
}

/** Optional private evidence ledger. No bodies, attachment metadata or profiles are stored. */
export function openParticipationEvidence({ stateDir, readOnly = false } = {}) {
  if (!isAbsolute(stateDir ?? '')) fail();
  const directory = join(stateDir, 'rein-router-participation');
  if (!readOnly) mkdirSync(directory, { recursive: true, mode: 0o700 });
  requirePrivate(directory, true);
  const path = join(directory, 'evidence.sqlite');
  if (!readOnly) {
    try { closeSync(openSync(path, 'wx', 0o600)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  requirePrivate(path);
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec('PRAGMA busy_timeout=30');
    if (!readOnly) db.exec(`CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY, policy_hash TEXT NOT NULL, scope TEXT NOT NULL, message_id TEXT NOT NULL,
      observed_at INTEGER NOT NULL, evidence TEXT NOT NULL, UNIQUE (policy_hash, scope, message_id)
    )`);
  } catch (error) { db.close(); throw error; }
  return {
    record({ scope, messageId, senderId, at, observation, dutyProbability, helpfulnessProbability, delivery }, policy) {
      const normalized = validateParticipationPolicy(policy);
      const scopeKey = participationScopeKey(scope);
      if (!normalized.enabled || !normalized.recordEvidence ||
          !normalized.channels.some(item => participationScopeKey(item) === scopeKey) ||
          !isSlackMessageId(messageId) || !isSlackReviewerId(senderId) || !Number.isSafeInteger(at) || at < 0 ||
          observation?.version !== normalized.version || ![0, 1].includes(observation.classifierCalls) ||
          !Number.isSafeInteger(observation.elapsedMs) || observation.elapsedMs < 0 ||
          observation.trigger !== 'passive' || !allowedReasons.includes(observation.reason) ||
          !allowedBeliefs.includes(observation.duty) || !allowedBeliefs.includes(observation.helpfulness) ||
          ![null, 'existing-router'].includes(observation.route) ||
          ![null, 'timeout', 'unavailable', 'invalid', 'cancelled'].includes(observation.failure) ||
          !isProbability(dutyProbability) || !isProbability(helpfulnessProbability) ||
          delivery !== (observation.route ? 'unobserved' : 'gate-silence')) fail();
      // A matching event after a restart cannot replace the original recorded decision.
      const record = {
        id: randomUUID(), observedAt: at, messageId, senderId, version: normalized.version, rubricVersion: PARTICIPATION_RUBRIC_VERSION,
        trigger: 'passive', duty: observation.duty, helpfulness: observation.helpfulness,
        route: observation.route, reason: observation.reason, failure: observation.failure,
        classifierCalls: observation.classifierCalls, elapsedMs: observation.elapsedMs,
        dutyProbability, helpfulnessProbability, delivery, actualModel: null,
      };
      requirePrivate(directory, true);
      requirePrivate(path);
      const result = db.prepare(`INSERT INTO decisions
        SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM decisions) < 10000
        ON CONFLICT (policy_hash, scope, message_id) DO NOTHING`)
        .run(record.id, participationPolicyDigest(normalized), scopeKey, messageId, at, JSON.stringify(record));
      if (!result.changes && !db.prepare('SELECT 1 FROM decisions WHERE policy_hash=? AND scope=? AND message_id=?')
        .get(participationPolicyDigest(normalized), scopeKey, messageId)) fail();
    },
    read({ policy, scope }) {
      const normalized = validateParticipationPolicy(policy);
      const scopeKey = participationScopeKey(scope);
      if (!normalized.channels.some(item => participationScopeKey(item) === scopeKey)) fail();
      return db.prepare('SELECT evidence FROM decisions WHERE policy_hash=? AND scope=? ORDER BY observed_at, id')
        .all(participationPolicyDigest(normalized), scopeKey).map(row => JSON.parse(row.evidence));
    },
    close: () => db.close(),
  };
}
