import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { participationBelief, validateParticipationPolicy } from '../plugins/rein-router/slack-participation.mjs';
import { isSlackMessageId, isSlackReviewerId, openParticipationEvidence,
  participationPolicyDigest, participationScopeKey } from '../plugins/rein-router/slack-participation-evidence.mjs';
import { ingestParticipationFeedback } from './slack-participation-feedback.mjs';
import { oneScopePolicy, openParticipationReviewStore } from './slack-participation-review-store.mjs';

const fail = () => { throw new Error('router_participation_review_invalid'); };
const isId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
const signals = {
  'false-wake': { observed: true, expected: false },
  'missed-wake': { observed: false, expected: true },
  'wrong-answer': { observed: true, expected: true },
  'correct-wake': { observed: true, expected: true },
  'correct-silence': { observed: false, expected: false },
};

// Fixed controls independent of feedback selection. Scores are synthetic and measure the threshold rule only.
const controls = [
  { id: 'unanswered-request', score: .99, duty: .99, expected: true },
  { id: 'useful-out-of-duty-clarification', score: .97, duty: .01, expected: true },
  { id: 'clearly-useful-despite-uncertain-duty', score: .94, duty: .55, expected: true },
  { id: 'completed-work-acknowledgement', score: .15, duty: .99, expected: false },
  { id: 'plausible-but-insufficient-context', score: .69, duty: .95, expected: false },
  { id: 'off-topic-chatter', score: .02, duty: .03, expected: false },
  { id: 'unavailable-classifier', score: null, duty: null, expected: false },
];

const scored = (item, threshold) => item.duty !== null && participationBelief(item.score, threshold) === 'yes';
function summarize(cases, threshold) {
  const summary = { cases: cases.length, falseWakes: 0, missedWakes: 0, workerAdmissions: 0 };
  for (const item of cases) {
    const wake = scored(item, threshold);
    if (wake) summary.workerAdmissions++;
    if (wake && !item.expected) summary.falseWakes++;
    if (!wake && item.expected) summary.missedWakes++;
  }
  return summary;
}

function typedObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) fail();
}

function validateReviews(review, policy, decisions, verifiedAuthorFeedback) {
  typedObject(review, ['schemaVersion', 'scope', 'policyDigest', 'candidateVersion', 'reviews']);
  if (review.schemaVersion !== 1 || review.policyDigest !== participationPolicyDigest(policy) ||
      !isId(review.candidateVersion) || review.candidateVersion === policy.version ||
      !Array.isArray(review.reviews) || !review.reviews.length || review.reviews.length > 1000) fail();
  const byId = new Map(decisions.map(item => [item.id, item]));
  const reviewed = new Set(), sources = new Set();
  return review.reviews.map(item => {
    typedObject(item, ['decisionId', 'messageId', 'actorId', 'signal', 'sourceMessageId', 'split', 'reply']);
    const decision = byId.get(item.decisionId);
    if (!decision || reviewed.has(item.decisionId) || sources.has(item.sourceMessageId) ||
        !isSlackReviewerId(item.actorId) || item.actorId !== decision.senderId ||
        item.messageId !== decision.messageId || !Object.hasOwn(signals, item.signal) ||
        !isSlackMessageId(item.sourceMessageId) || item.sourceMessageId === item.messageId ||
        !['calibration', 'holdout'].includes(item.split) ||
        signals[item.signal].observed !== (decision.route === 'existing-router')) fail();
    if (item.reply !== undefined) {
      typedObject(item.reply, ['messageId', 'actualModel']);
      if (!decision.route || !isSlackMessageId(item.reply.messageId) || item.reply.messageId === item.messageId ||
          item.reply.messageId === item.sourceMessageId) fail();
      const model = item.reply.actualModel;
      if (!(verifiedAuthorFeedback && model === null) &&
          (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*\/[A-Za-z0-9][A-Za-z0-9._/:@-]{0,200}$/.test(model))) fail();
    }
    if (item.signal === 'wrong-answer' && !item.reply) fail();
    reviewed.add(item.decisionId);
    sources.add(item.sourceMessageId);
    return { id: decision.id, score: decision.failure ? null : decision.helpfulnessProbability,
      duty: decision.failure ? null : decision.dutyProbability, expected: signals[item.signal].expected,
      signal: item.signal, split: item.split, reply: item.reply, classifierCalls: decision.classifierCalls };
  });
}

/** Offline operator review of first-party, scope-bound evidence. Replay never calls Jev or a worker. */
export function compareParticipationReview({ policy: rawPolicy, review, evidence, verifiedAuthorFeedback = false }) {
  const policy = validateParticipationPolicy(rawPolicy);
  // A global threshold may only be staged using a review that covers its entire configured audience.
  if (!policy.enabled || !policy.recordEvidence || policy.channels.length !== 1 ||
      participationScopeKey(policy.channels[0]) !== participationScopeKey(review?.scope)) fail();
  const decisions = evidence.read({ policy, scope: review.scope });
  const labeled = validateReviews(review, policy, decisions, verifiedAuthorFeedback);
  const calibration = labeled.filter(item => item.split === 'calibration');
  const holdout = [...controls, ...labeled.filter(item => item.split === 'holdout')];
  const baseline = policy.minProbability;
  if (labeled.some(item => scored(item, baseline) !== signals[item.signal].observed)) fail();
  const before = summarize(calibration, baseline);
  const thresholds = Array.from({ length: 51 }, (_, index) => (50 + index) / 100);
  // Tune only on calibration. A held-out regression rejects the chosen candidate instead of retuning against it.
  const proposals = thresholds.filter(threshold => threshold !== baseline)
    .map(threshold => ({ threshold, metrics: summarize(calibration, threshold) }))
    .filter(({ metrics }) => metrics.falseWakes <= before.falseWakes && metrics.missedWakes <= before.missedWakes &&
      metrics.falseWakes + metrics.missedWakes < before.falseWakes + before.missedWakes);
  proposals.sort((a, b) => a.metrics.falseWakes + a.metrics.missedWakes - b.metrics.falseWakes - b.metrics.missedWakes ||
    Math.abs(a.threshold - baseline) - Math.abs(b.threshold - baseline));
  const proposal = proposals[0];
  const holdoutRegressions = proposal ? holdout.filter(item =>
    scored(item, baseline) === item.expected && scored(item, proposal.threshold) !== item.expected).map(item => item.id) : [];
  const candidatePolicy = proposal ? validateParticipationPolicy({ ...policy,
    minProbability: proposal.threshold, version: review.candidateVersion }) : null;
  return {
    schemaVersion: 1, mode: 'offline-operator-review',
    authorization: verifiedAuthorFeedback ? 'slack-verified-author' : 'operator-attested-author',
    reviewedAt: new Date().toISOString(), reviewerUid: process.getuid?.() ?? null, scope: policy.channels[0],
    activePolicyDigest: participationPolicyDigest(policy),
    active: { version: policy.version, threshold: baseline, calibration: before, holdout: summarize(holdout, baseline) },
    candidate: proposal ? { version: candidatePolicy.version, threshold: proposal.threshold,
      calibration: proposal.metrics, holdout: summarize(holdout, proposal.threshold) } : null,
    holdoutRegressions, eligibleForStaging: Boolean(proposal) && holdoutRegressions.length === 0,
    quality: { operatorReviewedReplies: verifiedAuthorFeedback ? 0 : labeled.filter(item => item.reply).length,
      slackVerifiedReplies: verifiedAuthorFeedback ? labeled.filter(item => item.reply).length : 0,
      observedWrongAnswers: labeled.filter(item => item.signal === 'wrong-answer').length, candidateAnswerQuality: null },
    cost: { recordedClassifierCalls: labeled.reduce((sum, item) => sum + item.classifierCalls, 0),
      replayClassifierCalls: 0, replayWorkerCalls: 0, billedCost: null },
    candidatePolicyDigest: candidatePolicy ? participationPolicyDigest(candidatePolicy) : null,
    candidatePolicy, rollbackPolicy: policy,
  };
}

export function readPrivateJson(path) {
  const limit = 1024 * 1024;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 ||
        (process.getuid && info.uid !== process.getuid()) || info.size > limit) fail();
    const bytes = Buffer.alloc(limit + 1);
    let offset = 0, count;
    do { count = readSync(fd, bytes, offset, bytes.length - offset); offset += count; }
    while (count && offset < bytes.length);
    if (offset > limit) fail();
    return JSON.parse(bytes.subarray(0, offset).toString('utf8'));
  } finally { closeSync(fd); }
}

export function writePrivateJson(path, value) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); } finally { closeSync(fd); }
}

function comparisonFromFeedback({ policy, evidence, store, candidateVersion }) {
  const scope = policy.channels[0];
  const policyDigest = participationPolicyDigest(policy);
  const feedbackRows = store.feedback(policy);
  const reviews = feedbackRows.map(item => {
    if (item.source !== 'slack-web-api' || item.policyDigest !== policyDigest ||
        participationScopeKey(item.scope) !== participationScopeKey(scope)) fail();
    const { decisionId, messageId, actorId, signal, sourceMessageId, split, reply } = item;
    return { decisionId, messageId, actorId, signal, sourceMessageId, split, ...(reply ? { reply } : {}) };
  });
  if (!reviews.length) return { feedbackRows, report: {
    schemaVersion: 1, mode: 'offline-operator-review', authorization: 'slack-verified-author', scope,
    activePolicyDigest: policyDigest, eligibleForStaging: false, candidate: null, reason: 'no-verified-feedback',
  } };
  const review = { schemaVersion: 1, scope, policyDigest, candidateVersion, reviews };
  const report = compareParticipationReview({ policy, review, evidence, verifiedAuthorFeedback: true });
  return { feedbackRows, report: { ...report, review } };
}

const commandOptions = {
  inspect: ['--state-dir', '--policy-file', '--scope-file'],
  compare: ['--state-dir', '--policy-file', '--review-file'],
  stage: ['--state-dir', '--policy-file', '--review-file'],
  ingest: ['--state-dir', '--policy-file', '--feedback-config', '--feedback-request'],
  'compare-captured': ['--state-dir', '--policy-file', '--candidate-version'],
  'init-policy': ['--state-dir', '--policy-file'],
  'stage-policy': ['--state-dir', '--candidate-version'],
  'apply-policy': ['--state-dir', '--stage-id'],
  'rollback-policy': ['--state-dir', '--stage-id'],
  'status-policy': ['--state-dir'],
};
const isPath = name => !['--candidate-version', '--stage-id'].includes(name);

function ensureUnused(path) {
  try { lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail();
}

async function captureFromSlack(opts, policy, { environment, fetchImpl }) {
  const config = readPrivateJson(opts['--feedback-config']);
  const request = readPrivateJson(opts['--feedback-request']);
  const stateDir = opts['--state-dir'];
  const evidence = openParticipationEvidence({ stateDir, readOnly: true });
  try {
    const store = openParticipationReviewStore({ stateDir });
    try {
      const receipt = await ingestParticipationFeedback({ policy, config, request, evidence, store, fetchImpl,
        token: environment.REIN_PARTICIPATION_FEEDBACK_SLACK_TOKEN });
      writePrivateJson(opts['--output'], receipt);
    } finally { store.close(); }
  } finally { evidence.close(); }
}

export function runParticipationReview([command, ...args], { environment = process.env, fetchImpl } = {}) {
  if (!Object.hasOwn(commandOptions, command)) fail();
  const names = [...commandOptions[command], '--output'];
  if (args.length !== names.length * 2) fail();
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i], value = args[i + 1];
    if (!names.includes(name) || Object.hasOwn(opts, name) || !value || value.startsWith('--')) fail();
    opts[name] = isPath(name) ? resolve(value) : value;
  }
  const stateDir = opts['--state-dir'];
  const output = opts['--output'];
  ensureUnused(output);
  const policy = opts['--policy-file'] ? validateParticipationPolicy(readPrivateJson(opts['--policy-file'])) : undefined;
  const candidateVersion = opts['--candidate-version'];
  if (candidateVersion !== undefined && !isId(candidateVersion)) fail();
  const stageId = opts['--stage-id'];
  if (stageId !== undefined && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(stageId)) fail();

  if (command === 'ingest') return captureFromSlack(opts, policy, { environment, fetchImpl });
  if (['init-policy', 'apply-policy', 'rollback-policy', 'status-policy'].includes(command)) {
    const store = openParticipationReviewStore({ stateDir, readOnly: command === 'status-policy' });
    try {
      let value;
      if (command === 'init-policy') value = store.initialize(policy);
      if (command === 'apply-policy') value = store.apply(stageId);
      if (command === 'rollback-policy') value = store.rollback(stageId);
      if (command === 'status-policy') value = store.status();
      writePrivateJson(output, { schemaVersion: 1, destination: 'isolated-policy-store', ...value });
    } finally { store.close(); }
    return;
  }

  const evidence = openParticipationEvidence({ stateDir, readOnly: true });
  try {
    if (command === 'inspect') {
      const scope = readPrivateJson(opts['--scope-file']);
      writePrivateJson(output, { schemaVersion: 1, scope, version: policy.version,
        policyDigest: participationPolicyDigest(policy), decisions: evidence.read({ policy, scope }) });
    } else if (command === 'compare-captured' || command === 'stage-policy') {
      const store = openParticipationReviewStore({ stateDir, readOnly: command === 'compare-captured' });
      try {
        if (command === 'compare-captured') {
          const { report } = comparisonFromFeedback({ policy: oneScopePolicy(policy), evidence, store, candidateVersion });
          writePrivateJson(output, { ...report, disposition: 'comparison-only' });
        } else {
          const state = store.current();
          const { report, feedbackRows } = comparisonFromFeedback({ policy: state.policy, evidence, store, candidateVersion });
          if (!report.eligibleForStaging) fail();
          const staged = store.stage({ state, report, feedbackRows });
          writePrivateJson(output, { schemaVersion: 1, disposition: 'staged-for-isolated-store', ...staged });
        }
      } finally { store.close(); }
    } else {
      const review = readPrivateJson(opts['--review-file']);
      const report = compareParticipationReview({ policy, review, evidence });
      if (command === 'stage' && !report.eligibleForStaging) fail();
      writePrivateJson(output, { ...report, review,
        disposition: command === 'stage' ? 'operator-staged-config-proposal' : 'comparison-only' });
    }
  } finally { evidence.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runParticipationReview(process.argv.slice(2)); }
  catch (error) {
    const code = [
      'router_participation_feedback_slack_unavailable',
      'router_participation_feedback_conflict',
      'router_participation_policy_stale',
      'router_participation_policy_uninitialized',
      'router_participation_stage_not_found',
    ].includes(error?.message) ? error.message : 'router_participation_review_failed';
    console.error(code);
    process.exitCode = 1;
  }
}
