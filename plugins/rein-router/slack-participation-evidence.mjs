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
const sessionDigest = key => createHash('sha256').update(key).digest('hex');
const validModel = value => typeof value === 'string' && /^[a-zA-Z0-9._:/-]{1,200}$/.test(value);
const targetsChannel = (value, id) => [id, `channel:${id}`, `slack:channel:${id}`].includes(value);
const validRun = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
export const isSlackReviewerId = value => typeof value === 'string' && /^[UW][A-Z0-9]{5,31}$/.test(value);
export const participationScopeKey = scope => JSON.stringify(validateParticipationPolicy({ channels: [scope] }).channels[0]);
const policyDigestForRubric = (policy, rubric) => createHash('sha256')
  .update(JSON.stringify([rubric, validateParticipationPolicy(policy)])).digest('hex');

export const participationPolicyDigest = policy => policyDigestForRubric(policy, PARTICIPATION_RUBRIC_VERSION);

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
    );
    CREATE INDEX IF NOT EXISTS decisions_run ON decisions(json_extract(evidence, '$.workerRunId'))
      WHERE json_extract(evidence, '$.workerRunId') IS NOT NULL`);
  } catch (error) { db.close(); throw error; }
  // The session is an additional scope check. A shared thread alone cannot identify a turn.
  function updateRun(policyHash, runId, sessionKey, accept) {
    if (!validRun(runId) || typeof sessionKey !== 'string') return;
    const select = db.prepare(`SELECT id, scope, evidence FROM decisions
      WHERE json_extract(evidence, '$.workerRunId') IS NOT NULL AND json_extract(evidence, '$.workerRunId') = ? AND policy_hash = ? LIMIT 2`);
    // Most gateway turns have no opted-in decision. Avoid a write lock for those events.
    if (select.all(runId, policyHash).length !== 1) return;
    requirePrivate(directory, true);
    requirePrivate(path);
    db.exec('BEGIN IMMEDIATE');
    try {
      const rows = select.all(runId, policyHash);
      if (rows.length === 1) {
        const row = rows[0], record = JSON.parse(row.evidence);
        if (record.workerSessionDigest === sessionDigest(sessionKey) && accept(record, JSON.parse(row.scope))) {
          db.prepare('UPDATE decisions SET evidence=? WHERE id=?').run(JSON.stringify(record), row.id);
        }
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {
    observeFinalPayload(event, ctx, policy, policyHash) {
      const model = event.usageState?.resolvedRef;
      if (event.kind !== 'final' || event.channel !== 'slack' || ctx.channelId !== 'slack' ||
          !validRun(event.runId) || event.runId !== ctx.runId || !validModel(model) ||
          typeof event.sessionKey !== 'string' || event.sessionKey !== ctx.sessionKey ||
          !isSlackMessageId(ctx.messageId) || !isSlackReviewerId(ctx.senderId)) return;
      const scopes = policy.channels.filter(scope => scope.accountId === ctx.accountId &&
        scope.agentId === event.usageState.agentId && targetsChannel(ctx.conversationId, scope.channelId));
      if (scopes.length !== 1) return;
      requirePrivate(directory, true);
      requirePrivate(path);
      db.prepare(`UPDATE decisions SET evidence=json_set(evidence, '$.actualModel', ?, '$.workerRunId', ?)
        WHERE policy_hash=? AND scope=? AND message_id=? AND json_extract(evidence, '$.senderId')=?
          AND json_extract(evidence, '$.route')='existing-router'
          AND json_extract(evidence, '$.workerSessionDigest')=?
          AND (json_extract(evidence, '$.workerRunId') IS NULL OR json_extract(evidence, '$.workerRunId')=?)`)
        .run(model, event.runId, policyHash, participationScopeKey(scopes[0]), ctx.messageId,
          ctx.senderId, sessionDigest(event.sessionKey), event.runId);
    },
    observeWorker(event, ctx, policyHash) {
      if (ctx?.channel !== 'slack' || (ctx.runId && ctx.runId !== event.runId)) return;
      const model = event.resolvedRef ?? (event.provider && event.model && `${event.provider}/${event.model}`);
      if (!validModel(model)) return;
      updateRun(policyHash, event.runId, ctx.sessionKey, (record, scope) => {
        if (ctx.agentId !== scope.agentId || ctx.accountId !== scope.accountId) return false;
        // llm_output can also describe a failed or superseded attempt.
        // Only a settled worker receipt can establish the model behind a delivered reply.
        const outputs = record.workerOutputs ?? [];
        if (outputs.length >= 256) {
          record.workerOutputsTruncated = true;
          return true;
        }
        const finalText = event.assistantTexts?.at(-1);
        const requestedSilence = typeof finalText === 'string' ? finalText.trim() === 'NO_REPLY' : null;
        record.workerOutputs = [...outputs, { model, requestedSilence }];
        return true;
      });
    },
    observeSent(event, ctx, policyHash) {
      if (ctx?.channelId !== 'slack' || !event.success || !isSlackMessageId(event.messageId) ||
          (ctx.runId && event.runId && ctx.runId !== event.runId) ||
          (ctx.sessionKey && event.sessionKey && ctx.sessionKey !== event.sessionKey)) return;
      updateRun(policyHash, event.runId ?? ctx.runId, event.sessionKey ?? ctx.sessionKey, (record, scope) => {
        if (scope.accountId !== ctx.accountId || !targetsChannel(ctx.conversationId, scope.channelId) ||
            !targetsChannel(event.to, scope.channelId) ||
            event.messageId === record.messageId) return false;
        const replies = record.replyMessageIds ?? [];
        if (replies.includes(event.messageId)) return false;
        if (replies.length >= 256) {
          record.replyMessageIdsTruncated = true;
          return true;
        }
        record.replyMessageIds = [...replies, event.messageId];
        record.delivery = 'slack-sent';
        return true;
      });
    },
    record({ scope, messageId, senderId, at, observation, dutyProbability, helpfulnessProbability, delivery, runId, sessionKey }, policy) {
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
        ...(Number.isInteger(observation.contextMessages) && observation.contextMessages >= 0 && observation.contextMessages <= 5
          ? { contextMessages: observation.contextMessages } : {}),
        dutyProbability, helpfulnessProbability, delivery, actualModel: null,
        ...(observation.route && typeof sessionKey === 'string' &&
          sessionKey.startsWith(`agent:${scope.agentId}:`) && sessionKey.length <= 512
          ? { ...(validRun(runId) ? { workerRunId: runId } : {}), workerSessionDigest: sessionDigest(sessionKey) } : {}),
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
    readDecision({ policy, scope, decisionId }) {
      const scopeKey = participationScopeKey(scope);
      if (!validateParticipationPolicy(policy).channels.some(item => participationScopeKey(item) === scopeKey)) fail();
      const row = db.prepare('SELECT evidence,policy_hash FROM decisions WHERE scope=? AND id=?').get(scopeKey, decisionId);
      if (!row) return;
      const decision = JSON.parse(row.evidence);
      // The previous Slack rubric used the same normalized policy serialization.
      if (![PARTICIPATION_RUBRIC_VERSION, 'slack-participation-v2'].includes(decision.rubricVersion) ||
          row.policy_hash !== policyDigestForRubric(policy, decision.rubricVersion)) return;
      return { decision, policyDigest: row.policy_hash };
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
