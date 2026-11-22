import { createHash, randomUUID } from 'node:crypto';
import { closeSync, lstatSync, openSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { validateParticipationPolicy } from './slack-participation.mjs';
import { participationPolicyDigest, participationScopeKey } from './slack-participation-evidence.mjs';

function fail(code = 'router_participation_review_store_invalid') { throw new Error(code); }
const stale = () => fail('router_participation_policy_stale');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function requirePrivate(path, directory = false) {
  const info = lstatSync(path);
  if (!(directory ? info.isDirectory() : info.isFile() && info.nlink === 1) ||
      (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) fail();
}

export function oneScopePolicy(raw) {
  const policy = validateParticipationPolicy(raw);
  if (!policy.enabled || !policy.recordEvidence || policy.channels.length !== 1) fail();
  return policy;
}

/** Companion store for feedback, staged policies and their versioned transitions. */
export function openParticipationReviewStore({ stateDir, readOnly = false }) {
  if (!isAbsolute(stateDir)) fail();
  const directory = join(stateDir, 'rein-router-participation');
  requirePrivate(directory, true);
  const path = join(directory, 'review.sqlite');
  if (!readOnly) {
    try { closeSync(openSync(path, 'wx', 0o600)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  requirePrivate(path);
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec('PRAGMA busy_timeout=2000');
    if (!readOnly) db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        scope TEXT NOT NULL, policy_digest TEXT NOT NULL, decision_id TEXT NOT NULL, source_id TEXT NOT NULL,
        receipt TEXT NOT NULL, PRIMARY KEY(scope, source_id), UNIQUE (scope, decision_id)
      );
      CREATE TABLE IF NOT EXISTS active_policy (
        id INTEGER PRIMARY KEY CHECK (id = 1), generation INTEGER NOT NULL, scope TEXT NOT NULL,
        digest TEXT NOT NULL, policy TEXT NOT NULL, stage_id TEXT
      );
      CREATE TABLE IF NOT EXISTS released_versions (version TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS stages (
        id TEXT PRIMARY KEY, base_generation INTEGER NOT NULL, base_digest TEXT NOT NULL,
        candidate_digest TEXT NOT NULL, candidate_version TEXT UNIQUE NOT NULL, feedback_digest TEXT NOT NULL,
        prior_stage_id TEXT, report TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transitions (
        generation INTEGER PRIMARY KEY, stage_id TEXT NOT NULL, operation TEXT NOT NULL,
        prior_digest TEXT NOT NULL, next_digest TEXT NOT NULL, at TEXT NOT NULL, UNIQUE(stage_id, operation)
      );
    `);
  } catch (error) { db.close(); throw error; }

  function transaction(fn, write = true) {
    requirePrivate(directory, true);
    requirePrivate(path);
    db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function feedback(policy) {
    const scope = participationScopeKey(oneScopePolicy(policy).channels[0]);
    return db.prepare('SELECT receipt FROM feedback WHERE scope=? AND policy_digest=? ORDER BY source_id')
      .all(scope, participationPolicyDigest(policy)).map(row => JSON.parse(row.receipt));
  }

  function policyState() {
    const row = db.prepare('SELECT generation, scope, digest, policy, stage_id FROM active_policy WHERE id=1').get();
    if (!row) fail('router_participation_policy_uninitialized');
    const policy = oneScopePolicy(JSON.parse(row.policy));
    if (row.digest !== participationPolicyDigest(policy) || row.scope !== participationScopeKey(policy.channels[0])) fail();
    return { generation: row.generation, scope: policy.channels[0], digest: row.digest, policy, stageId: row.stage_id };
  }

  function transition(operation, stageId) {
    return transaction(() => {
      const stage = db.prepare('SELECT * FROM stages WHERE id=?').get(stageId);
      if (!stage) fail('router_participation_stage_not_found');
      const current = policyState();
      const report = JSON.parse(stage.report);
      const applying = operation === 'apply';
      const next = oneScopePolicy(applying ? report.candidatePolicy : report.rollbackPolicy);
      const nextDigest = participationPolicyDigest(next);
      if (participationScopeKey(next.channels[0]) !== participationScopeKey(current.scope) ||
          nextDigest !== (applying ? stage.candidate_digest : stage.base_digest)) fail();
      if (applying) {
        if (current.generation !== stage.base_generation || current.digest !== stage.base_digest ||
            stage.feedback_digest !== digest(feedback(current.policy))) stale();
        db.prepare('INSERT INTO released_versions VALUES (?)').run(next.version);
      } else if (current.stageId !== stageId || current.digest !== stage.candidate_digest) stale();
      const generation = current.generation + 1;
      const at = new Date().toISOString();
      const changed = db.prepare('UPDATE active_policy SET generation=?, digest=?, policy=?, stage_id=? WHERE id=1 AND generation=? AND digest=?')
        .run(generation, nextDigest, JSON.stringify(next), applying ? stageId : stage.prior_stage_id, current.generation, current.digest);
      if (changed.changes !== 1) stale();
      db.prepare('INSERT INTO transitions VALUES (?, ?, ?, ?, ?, ?)').run(generation, stageId, operation, current.digest, nextDigest, at);
      return { operation, stageId, generation, at, priorDigest: current.digest, activeDigest: nextDigest, policy: next };
    });
  }

  return {
    feedback,
    recordFeedback(policy, receipt) {
      const scope = participationScopeKey(oneScopePolicy(policy).channels[0]);
      const policyDigest = participationPolicyDigest(policy);
      return transaction(() => {
        const matching = db.prepare('SELECT receipt FROM feedback WHERE scope=? AND (decision_id=? OR source_id=?)')
          .all(scope, receipt.decisionId, receipt.sourceMessageId);
        if (matching.length) {
          const [row] = matching;
          const previous = JSON.parse(row.receipt);
          if (matching.length !== 1 || !isDeepStrictEqual(previous, { ...receipt, verifiedAt: previous.verifiedAt }))
            fail('router_participation_feedback_conflict');
          return { disposition: 'duplicate', receipt: previous };
        }
        const result = db.prepare('INSERT INTO feedback SELECT ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM feedback) < 10000')
          .run(scope, policyDigest, receipt.decisionId, receipt.sourceMessageId, JSON.stringify(receipt));
        if (result.changes !== 1) fail('router_participation_feedback_capacity');
        return { disposition: 'stored', receipt };
      });
    },
    initialize(raw) {
      const policy = oneScopePolicy(raw);
      return transaction(() => {
        const hash = participationPolicyDigest(policy);
        const result = db.prepare('INSERT OR IGNORE INTO active_policy VALUES (1, 0, ?, ?, ?, NULL)')
          .run(participationScopeKey(policy.channels[0]), hash, JSON.stringify(policy));
        const state = policyState();
        if (state.digest !== hash || state.generation !== 0) stale();
        if (result.changes) db.prepare('INSERT INTO released_versions VALUES (?)').run(policy.version);
        return state;
      });
    },
    current: policyState,
    currentForBaseline(raw) {
      const baseline = oneScopePolicy(raw);
      const baselineDigest = participationPolicyDigest(baseline);
      return transaction(() => {
        const current = policyState();
        if (!Number.isSafeInteger(current.generation) || current.generation < 0) fail();
        if (current.generation === 0) {
          if (current.digest !== baselineDigest || current.stageId !== null) stale();
          return current;
        }
        const first = db.prepare('SELECT prior_digest FROM transitions WHERE generation=1 AND operation=?').get('apply');
        const latest = db.prepare('SELECT next_digest FROM transitions WHERE generation=?').get(current.generation);
        const allowed = { ...baseline, version: current.policy.version, minProbability: current.policy.minProbability };
        if (first?.prior_digest !== baselineDigest || latest?.next_digest !== current.digest ||
            current.digest !== participationPolicyDigest(allowed)) stale();
        return current;
      }, false);
    },
    stage({ state, report, feedbackRows }) {
      return transaction(() => {
        const current = policyState();
        if (current.generation !== state.generation || current.digest !== state.digest ||
            digest(feedback(current.policy)) !== digest(feedbackRows)) stale();
        const candidate = oneScopePolicy(report.candidatePolicy);
        const candidateDigest = participationPolicyDigest(candidate);
        if (!report.eligibleForStaging || report.activePolicyDigest !== current.digest ||
            report.candidatePolicyDigest !== candidateDigest || participationPolicyDigest(report.rollbackPolicy) !== current.digest ||
            candidate.minProbability === current.policy.minProbability || candidate.version === current.policy.version ||
            candidateDigest !== participationPolicyDigest({ ...current.policy, version: candidate.version, minProbability: candidate.minProbability }))
          fail();
        const feedbackDigest = digest(feedbackRows);
        const row = db.prepare('SELECT * FROM stages WHERE candidate_version=?').get(candidate.version);
        if (row) {
          if (row.base_generation !== state.generation || row.base_digest !== state.digest ||
              row.candidate_digest !== candidateDigest || row.feedback_digest !== feedbackDigest) stale();
          return { id: row.id, baseGeneration: row.base_generation, feedbackDigest, report: JSON.parse(row.report) };
        }
        if (db.prepare('SELECT 1 FROM released_versions WHERE version=?').get(candidate.version)) stale();
        const id = randomUUID();
        db.prepare('INSERT INTO stages VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, current.generation, current.digest, candidateDigest, candidate.version, feedbackDigest, current.stageId, JSON.stringify(report));
        return { id, baseGeneration: current.generation, feedbackDigest, report };
      });
    },
    apply: stageId => transition('apply', stageId),
    rollback: stageId => transition('rollback', stageId),
    status() {
      return transaction(() => ({ active: policyState(),
        stages: db.prepare('SELECT id, base_generation AS baseGeneration, candidate_version AS version, candidate_digest AS digest FROM stages ORDER BY rowid').all(),
        transitions: db.prepare('SELECT generation, stage_id AS stageId, operation, prior_digest AS priorDigest, next_digest AS activeDigest, at FROM transitions ORDER BY generation').all() }), false);
    },
    close: () => db.close(),
  };
}

/** Read a single committed release at Router registration. */
export function readParticipationRelease({ stateDir, baseline }) {
  const store = openParticipationReviewStore({ stateDir, readOnly: true });
  try { return store.currentForBaseline(baseline); }
  finally { store.close(); }
}
