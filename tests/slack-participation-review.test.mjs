import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSlackParticipation } from '../plugins/rein-router/slack-participation.mjs';
import { openParticipationEvidence, participationPolicyDigest } from '../plugins/rein-router/slack-participation-evidence.mjs';
import { ingestParticipationFeedback } from '../scripts/slack-participation-feedback.mjs';
import { openParticipationReviewStore } from '../scripts/slack-participation-review-store.mjs';
import { compareParticipationReview, runParticipationReview } from '../scripts/slack-participation-review.mjs';

const scope = { accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', agentId: 'main' };
const policy = { enabled: true, version: 'fixture-v1', duties: 'Help with deployments.',
  recordEvidence: true, channels: [scope], minProbability: .8 };
const senderId = 'UALICE01';
const payload = (messageId, currentMessage) => ({ ctx: {
  Provider: 'slack', Surface: 'slack', AccountId: scope.accountId, GroupSpace: scope.workspaceId,
  NativeChannelId: scope.channelId, ChatId: scope.channelId, AgentId: scope.agentId,
  ChatType: 'channel', SenderId: senderId, WasMentioned: false, InboundAccessAuthorized: true,
  SessionKey: 'agent:main:slack:channel:cfixture1', MessageSid: messageId,
  CommandBody: currentMessage, RawBody: 'PRIVATE-ATTACHMENT', MediaPath: '/private/file',
} });
const host = { dispatcher: { getQueuedCounts: () => ({ tool: 0, block: 0, final: 0 }) },
  recordProcessed() {}, markIdle() {} };

async function fixture(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'rein-participation-evidence-'));
  t.after(() => rmSync(stateDir, { recursive: true, force: true }));
  const writer = openParticipationEvidence({ stateDir });
  const answer = (gate, helpfulness) => createSlackParticipation({ policy: gate, allowPaidJev: true,
    decisions: { evaluate: async () => ({ status: 'ok', result: { answers: {
      dutyRelevant: { type: 'boolean', probabilityTrue: .99 },
      helpful: { type: 'boolean', probabilityTrue: helpfulness },
    } } }) }, writeEvidence: record => writer.record(record, gate) });
  try {
    for (const [messageId, score] of [['1000.001', .76], ['1000.002', .78], ['1000.003', .89]]) {
      const gate = answer(policy, score);
      await gate.replyDispatch(payload(messageId, 'PRIVATE-ORIGINAL'), host);
      gate.close();
    }
    const replayed = answer(policy, .99);
    await replayed.replyDispatch(payload('1000.001', 'PRIVATE-REPLAY'), host);
    replayed.close();
  } finally { writer.close(); }
  const read = openParticipationEvidence({ stateDir, readOnly: true });
  t.after(() => read.close());
  const decisions = read.read({ policy, scope });
  const [missed, correct, wrong] = ['1000.001', '1000.002', '1000.003'].map(id => decisions.find(item => item.messageId === id));
  const review = { schemaVersion: 1, scope, policyDigest: participationPolicyDigest(policy), candidateVersion: 'fixture-v2',
    reviews: [{ decisionId: missed.id, messageId: missed.messageId, actorId: senderId,
      signal: 'missed-wake', sourceMessageId: '1010.001', split: 'calibration' }] };
  return { stateDir, read, decisions, missed, correct, wrong, review };
}

test('private native decision evidence survives restart; original decision is immutable and scope-bound', async t => {
  const { stateDir, read, decisions, missed, wrong } = await fixture(t);
  assert.equal(decisions.length, 3);
  assert.equal(missed.helpfulnessProbability, .76);
  assert.equal(missed.delivery, 'gate-silence');
  assert.equal(wrong.delivery, 'unobserved');
  assert.equal(wrong.actualModel, null);
  assert.equal(wrong.classifierCalls, 1);
  assert.ok(wrong.elapsedMs >= 0);
  assert.doesNotMatch(JSON.stringify(decisions), /PRIVATE|\/private\//);
  assert.throws(() => read.read({ policy, scope: { ...scope, workspaceId: 'TOTHER01' } }));
  assert.deepEqual(read.read({ policy: { ...policy, duties: 'Edited duties' }, scope }), []);
  const directory = join(stateDir, 'rein-router-participation');
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(directory, 'evidence.sqlite')).mode & 0o777, 0o600);
});

test('operator author feedback replays a threshold with fixed controls; a held-out regression blocks staging', async t => {
  const { read, review, correct, wrong } = await fixture(t);
  const compare = review => compareParticipationReview({ policy, review, evidence: read });
  assert.equal(compare(review).candidate.threshold, .76);
  assert.equal(compare(review).active.calibration.missedWakes, 1);
  assert.equal(compare(review).candidate.calibration.missedWakes, 0);
  assert.equal(compare(review).eligibleForStaging, true);
  const withHoldout = { ...review, reviews: [...review.reviews,
    { decisionId: correct.id, messageId: correct.messageId, actorId: senderId, signal: 'correct-silence',
      sourceMessageId: '1010.002', split: 'holdout' }] };
  const holdout = compare(withHoldout);
  assert.equal(holdout.eligibleForStaging, false);
  assert.deepEqual(holdout.holdoutRegressions, [correct.id]);
  const wrongAnswer = { decisionId: wrong.id, messageId: wrong.messageId, actorId: senderId,
    signal: 'wrong-answer', sourceMessageId: '1010.003', split: 'calibration' };
  assert.throws(() => compare({ ...review, reviews: [...review.reviews, wrongAnswer] }));
  const rated = compare({ ...review, reviews: [...review.reviews,
    { ...wrongAnswer, reply: { messageId: '1005.001', actualModel: 'synthetic/mock' } }] });
  assert.equal(rated.quality.observedWrongAnswers, 1);
  assert.equal(rated.quality.candidateAnswerQuality, null);
  assert.equal(rated.cost.replayClassifierCalls, 0);
  assert.equal(rated.cost.replayWorkerCalls, 0);
  assert.equal(rated.cost.billedCost, null);
});

test('feedback author, scope, decision, source and policy version must all match', async t => {
  const { read, review } = await fixture(t);
  const compare = review => compareParticipationReview({ policy, review, evidence: read });
  for (const changes of [{ actorId: 'UOTHER01' }, { messageId: '1000.002' },
    { decisionId: 'unknown' }, { signal: 'false-wake' }, { sourceMessageId: '1000.001' }])
    assert.throws(() => compare({ ...review, reviews: [{ ...review.reviews[0], ...changes }] }));
  assert.throws(() => compare({ ...review, reviews: [...review.reviews, ...review.reviews] }));
  assert.throws(() => compare({ ...review, scope: { ...scope, channelId: 'COTHER01' } }));
  assert.throws(() => compare({ ...review, policyDigest: 'stale' }));
  assert.throws(() => compareParticipationReview({ policy: { ...policy,
    channels: [scope, { ...scope, channelId: 'COTHER01' }] }, review, evidence: read }));
});

test('review CLI exports private proposal and rollback receipts without mutating the input policy', async t => {
  const { stateDir, review, correct } = await fixture(t);
  function create(name, value, mode = 0o600) {
    const path = join(stateDir, name);
    writeFileSync(path, JSON.stringify(value), { mode, flag: 'wx' });
    return path;
  }
  const policyPath = create('policy.json', policy);
  const reviewPath = create('review.json', review);
  const scopePath = create('scope.json', scope);
  const report = join(stateDir, 'report.json');
  const base = ['--state-dir', stateDir, '--policy-file', policyPath, '--output', report];
  runParticipationReview(['inspect', ...base, '--scope-file', scopePath]);
  assert.equal(JSON.parse(readFileSync(report)).decisions.length, 3);
  assert.equal(statSync(report).mode & 0o777, 0o600);
  assert.throws(() => runParticipationReview(['stage', ...base, '--review-file', reviewPath]));
  const stage = join(stateDir, 'stage.json');
  const stageArgs = ['stage', ...base.slice(0, -1), stage, '--review-file'];
  const rejectedPath = create('rejected.json', { ...review, reviews: [...review.reviews,
    { decisionId: correct.id, messageId: correct.messageId, actorId: senderId,
      signal: 'correct-silence', sourceMessageId: '1010.003', split: 'holdout' }] });
  assert.throws(() => runParticipationReview([...stageArgs, rejectedPath]));
  const publicPath = create('public.json', review, 0o644);
  assert.throws(() => runParticipationReview([...stageArgs, publicPath]));
  const alias = join(stateDir, 'alias.json');
  symlinkSync(reviewPath, alias);
  assert.throws(() => runParticipationReview([...stageArgs, alias]));
  runParticipationReview([...stageArgs, reviewPath]);
  const staged = JSON.parse(readFileSync(stage));
  assert.equal(staged.disposition, 'operator-staged-config-proposal');
  assert.equal(staged.activePolicyDigest, participationPolicyDigest(policy));
  assert.deepEqual(staged.candidatePolicy, { ...staged.rollbackPolicy, version: 'fixture-v2', minProbability: .76 });
  assert.deepEqual(JSON.parse(readFileSync(policyPath)), policy);
});

test('evidence ledger refuses a storage path with group access', t => {
  const stateDir = mkdtempSync(join(tmpdir(), 'rein-participation-evidence-'));
  t.after(() => rmSync(stateDir, { recursive: true, force: true }));
  mkdirSync(join(stateDir, 'rein-router-participation'), { mode: 0o755 });
  assert.throws(() => openParticipationEvidence({ stateDir }), /router_participation_evidence_unavailable/);
});

const botUser = 'UNORIBOT', botId = 'BNORIBOT', reader = 'UREADER1';
const config = { schemaVersion: 1, enabled: true, scope, readerUserId: reader, noriBotUserId: botUser, noriBotId: botId };
const token = ['xoxp', 'synthetic', 'no-network'].join('-');
const feedbackId = '1010.001';
const source = decision => ({ type: 'message', user: senderId, ts: decision.messageId, text: 'PRIVATE SOURCE' });
const note = (decision, signal = 'missed-wake', ts = feedbackId, replyId = '') => ({
  type: 'message', user: senderId, ts, thread_ts: decision.messageId,
  text: `nori-feedback ${signal} ${decision.messageId}${replyId ? ` ${replyId}` : ''}`,
});
const request = (decision, ts = feedbackId, split = 'calibration') => ({
  schemaVersion: 1, decisionId: decision.id, threadId: decision.messageId, feedbackMessageId: ts, split,
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function slackApi(decision, { feedback = note(decision), originMessage = source(decision),
  team = scope.workspaceId, readingUser = reader, channel = scope.channelId,
  members = [senderId, reader, botUser], userFields = {}, otherMessages = [], repliesUnavailable,
  memberPagination = false, threadPagination = false } = {}) {
  const calls = [];
  async function fetchImpl(url, options) {
    assert.equal(new URL(url).origin, 'https://slack.com');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, `Bearer ${token}`);
    const method = new URL(url).pathname.slice('/api/'.length);
    const body = Object.fromEntries(options.body);
    calls.push({ method, body });
    if (method === 'auth.test') return json({ ok: true, team_id: team, user_id: readingUser });
    if (method === 'conversations.info' || method === 'conversations.members' || method === 'conversations.replies')
      assert.equal(body.channel, scope.channelId);
    if (method === 'conversations.info') return json({ ok: true, channel: { id: channel, is_channel: true } });
    if (method === 'conversations.replies') {
      if (repliesUnavailable) return json({ ok: false, error: 'ratelimited' }, 429);
      assert.equal(body.ts, decision.messageId);
      assert.equal(body.oldest, decision.messageId);
      assert.equal(body.latest, feedback.ts);
      assert.equal(body.inclusive, 'true');
      if (threadPagination && !body.cursor) return json({ ok: true, messages: [originMessage, ...otherMessages],
        has_more: true, response_metadata: { next_cursor: 'more-thread' } });
      return json({ ok: true, messages: threadPagination ? [feedback] : [originMessage, ...otherMessages, feedback] });
    }
    if (method === 'users.info') {
      assert.equal(body.user, senderId);
      return json({ ok: true, user: { id: senderId, deleted: false, is_bot: false, team_id: scope.workspaceId, ...userFields } });
    }
    if (method === 'conversations.members') {
      if (memberPagination && !body.cursor) return json({ ok: true, members: [reader],
        response_metadata: { next_cursor: 'more-members' } });
      return json({ ok: true, members });
    }
    assert.fail('Only official Slack read methods are supported');
  }
  return { fetchImpl, calls };
}

function privateFiles(stateDir) {
  const write = (name, value) => {
    const path = join(stateDir, name);
    writeFileSync(path, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    return path;
  };
  const load = path => JSON.parse(readFileSync(path, 'utf8'));
  return { write, load };
}

test('official read transport captures explicit feedback, verifies paginated access and durably deduplicates', async t => {
  const { stateDir, read, missed } = await fixture(t);
  const { write, load } = privateFiles(stateDir);
  const policyPath = write('policy.json', policy);
  const configPath = write('slack.json', config);
  const requestPath = write('request.json', request(missed));
  const api = slackApi(missed, { threadPagination: true, memberPagination: true });
  const options = { environment: { REIN_PARTICIPATION_FEEDBACK_SLACK_TOKEN: token }, fetchImpl: api.fetchImpl };
  const capture = name => {
    const path = join(stateDir, name);
    return runParticipationReview(['ingest', '--state-dir', stateDir, '--policy-file', policyPath,
      '--feedback-config', configPath, '--feedback-request', requestPath, '--output', path], options).then(() => load(path));
  };
  const results = await Promise.all([capture('first.json'), capture('second.json')]);
  assert.deepEqual(results.map(result => result.disposition).sort(), ['duplicate', 'stored']);
  assert.deepEqual(results[0].receipt, results[1].receipt);
  assert.equal(results[0].receipt.source, 'slack-web-api');
  assert.equal(results[0].receipt.actorId, senderId);
  assert.equal(results[0].receipt.sourceMessageId, feedbackId);
  assert.equal(results[0].receipt.decisionId, missed.id);
  assert.equal(api.calls.filter(call => call.body.cursor === 'more-thread').length, 2);
  assert.equal(api.calls.filter(call => call.body.cursor === 'more-members').length, 2);
  const store = openParticipationReviewStore({ stateDir, readOnly: true });
  try {
    assert.deepEqual(store.feedback(policy), [results[0].receipt]);
    assert.deepEqual(store.feedback({ ...policy, version: 'other' }), []);
  } finally { store.close(); }
  const path = join(stateDir, 'rein-router-participation/review.sqlite');
  assert.doesNotMatch(readFileSync(path).toString(), /PRIVATE SOURCE|nori-feedback|synthetic-no-network/);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(stateDir, 'first.json')).mode & 0o777, 0o600);

  const conflicting = slug => ({ ...request(missed), split: slug });
  const writer = openParticipationReviewStore({ stateDir });
  try {
    await assert.rejects(ingestParticipationFeedback({ policy, config, request: conflicting('holdout'),
      evidence: read, store: writer, token, fetchImpl: api.fetchImpl }), /router_participation_feedback_conflict/);
  } finally { writer.close(); }
});

test('Slack feedback rejects wrong audience, current access, author, bot attribution, thread and label', async t => {
  const { stateDir, read, missed } = await fixture(t);
  const store = openParticipationReviewStore({ stateDir });
  t.after(() => store.close());
  for (const changes of [
    { team: 'TOTHER01' },
    { readingUser: 'UOTHER01' },
    { channel: 'COTHER01' },
    { members: [reader, botUser] },
    { userFields: { deleted: true } },
    { userFields: { team_id: 'TOTHER01' } },
    { originMessage: { ...source(missed), user: 'UOTHER01' } },
    { feedback: { ...note(missed), user: 'UOTHER01' } },
    { feedback: { ...note(missed), bot_id: 'BOTHER01' } },
    { feedback: { ...note(missed), app_id: 'AOTHER01' } },
    { feedback: { ...note(missed), edited: {} } },
    { feedback: { ...note(missed), thread_ts: '1000.002' } },
    { feedback: { ...note(missed), text: 'nori-feedback missed-wake 1000.002' } },
    { feedback: { ...note(missed), text: ' nori-feedback missed-wake 1000.001 ' } },
    { feedback: note(missed, 'false-wake') },
    { repliesUnavailable: true },
  ]) {
    const { fetchImpl } = slackApi(missed, changes);
    await assert.rejects(ingestParticipationFeedback({
      policy, config, request: request(missed), evidence: read, store, token, fetchImpl,
    }), /router_participation_feedback_(?:invalid|slack_unavailable)/);
  }
  await assert.rejects(ingestParticipationFeedback({ policy, config: { ...config, enabled: false },
    request: request(missed), evidence: read, store, token, fetchImpl: () => assert.fail('opt-in required') }));
  await assert.rejects(ingestParticipationFeedback({ policy, config: { ...config, scope: { ...scope, agentId: 'other' } },
    request: request(missed), evidence: read, store, token, fetchImpl: () => assert.fail('scope must be exact') }));
  assert.deepEqual(store.feedback(policy), []);
});

test('wrong-answer captures only a native same-thread Nori bot reply and replay keeps model unobserved', async t => {
  const { stateDir, read, wrong } = await fixture(t);
  const store = openParticipationReviewStore({ stateDir });
  t.after(() => store.close());
  const answer = { type: 'message', user: botUser, bot_id: botId,
    ts: '1005.001', thread_ts: wrong.messageId, text: 'PRIVATE ANSWER' };
  const feedback = note(wrong, 'wrong-answer', feedbackId, answer.ts);
  for (const changes of [{ bot_id: 'BOTHER01' }, { user: 'UOTHER01' }, { thread_ts: '1000.001' }]) {
    const bad = slackApi(wrong, { feedback, otherMessages: [{ ...answer, ...changes }] });
    await assert.rejects(ingestParticipationFeedback({
      policy, config, request: request(wrong), evidence: read, store, token, fetchImpl: bad.fetchImpl,
    }), /router_participation_feedback_invalid/);
  }
  const api = slackApi(wrong, { feedback, otherMessages: [answer] });
  await ingestParticipationFeedback({
    policy, config, request: request(wrong), evidence: read, store, token, fetchImpl: api.fetchImpl,
  });
  const [record] = store.feedback(policy);
  assert.deepEqual(record.reply, { messageId: answer.ts, actualModel: null });
  const { write, load } = privateFiles(stateDir);
  const output = join(stateDir, 'comparison.json');
  runParticipationReview(['compare-captured', '--state-dir', stateDir, '--policy-file', write('policy.json', policy),
    '--candidate-version', 'fixture-v2', '--output', output]);
  const report = load(output);
  assert.equal(report.authorization, 'slack-verified-author');
  assert.equal(report.quality.slackVerifiedReplies, 1);
  assert.equal(report.quality.observedWrongAnswers, 1);
  assert.equal(report.quality.candidateAnswerQuality, null);
  assert.equal(report.eligibleForStaging, false);
});

test('captured feedback stages a candidate and competing processes apply exactly one fenced policy', async t => {
  const { stateDir, read, missed } = await fixture(t);
  const { write, load } = privateFiles(stateDir);
  const original = write('policy.json', policy);
  const args = (command, name, ...opts) => [command, '--state-dir', stateDir, '--output', join(stateDir, name), ...opts];
  const run = (command, name, ...opts) => {
    runParticipationReview(args(command, name, ...opts));
    return load(join(stateDir, name));
  };
  const initial = run('init-policy', 'init.json', '--policy-file', original);
  assert.equal(initial.generation, 0);
  const store = openParticipationReviewStore({ stateDir });
  try {
    const api = slackApi(missed);
    await ingestParticipationFeedback({ policy, config, request: request(missed),
      evidence: read, store, token, fetchImpl: api.fetchImpl });
  } finally { store.close(); }
  const status = name => run('status-policy', name);
  const stage = (version, name) => run('stage-policy', name, '--candidate-version', version);
  const a = stage('fixture-v2', 'stage-a.json');
  assert.equal(stage('fixture-v2', 'stage-a-retry.json').id, a.id);
  const b = stage('fixture-v3', 'stage-b.json');
  assert.equal(a.report.candidate.threshold, .76);
  assert.equal(a.baseGeneration, 0);
  assert.equal(a.report.authorization, 'slack-verified-author');
  const cli = fileURLToPath(new URL('../scripts/slack-participation-review.mjs', import.meta.url));
  const execute = promisify(execFile);
  const apply = (proposal, name) => execute(process.execPath, [cli, ...args('apply-policy', name, '--stage-id', proposal.id)]);
  const [left, right] = await Promise.allSettled([apply(a, 'applied-a.json'), apply(b, 'applied-b.json')]);
  assert.deepEqual([left.status, right.status].sort(), ['fulfilled', 'rejected']);
  const winner = left.status === 'fulfilled' ? a : b;
  const loser = left.status === 'fulfilled' ? b : a;
  assert.match((left.status === 'rejected' ? left : right).reason.stderr, /router_participation_policy_stale/);
  const applied = status('status-applied.json');
  assert.equal(applied.active.generation, 1);
  assert.equal(applied.active.digest, winner.report.candidatePolicyDigest);
  assert.equal(applied.transitions.length, 1);
  assert.equal(applied.transitions[0].operation, 'apply');
  assert.throws(() => run('rollback-policy', 'bad-rollback.json', '--stage-id', loser.id), /router_participation_policy_stale/);
  const rolled = run('rollback-policy', 'rollback.json', '--stage-id', winner.id);
  assert.equal(rolled.generation, 2);
  assert.equal(rolled.activeDigest, initial.digest);
  assert.deepEqual(rolled.policy, initial.policy);
  assert.throws(() => run('apply-policy', 'aba.json', '--stage-id', loser.id), /router_participation_policy_stale/);
  assert.throws(() => run('rollback-policy', 'repeat.json', '--stage-id', winner.id), /router_participation_policy_stale/);
  assert.throws(() => stage(winner.report.candidate.version, 'reuse-version.json'), /router_participation_policy_stale/);
  assert.deepEqual(status('status-rolled.json').transitions.map(row => row.operation), ['apply', 'rollback']);
  assert.deepEqual(load(original), policy);
  assert.equal(statSync(join(stateDir, 'rollback.json')).mode & 0o777, 0o600);
});

test('an independent feedback addition invalidates an already staged policy and prevents a regressing replacement', async t => {
  const { stateDir, read, missed, correct } = await fixture(t);
  const { write } = privateFiles(stateDir);
  const transact = (operation, name, ...options) => {
    const output = join(stateDir, name);
    runParticipationReview([operation, '--state-dir', stateDir, '--output', output, ...options]);
    return JSON.parse(readFileSync(output, 'utf8'));
  };
  const store = openParticipationReviewStore({ stateDir });
  t.after(() => store.close());
  transact('init-policy', 'init.json', '--policy-file', write('original.json', policy));
  await ingestParticipationFeedback({ policy, config, request: request(missed),
    evidence: read, store, token, fetchImpl: slackApi(missed).fetchImpl });
  const staged = transact('stage-policy', 'stage.json', '--candidate-version', 'fixture-v2');
  const holdoutId = '1010.002';
  const holdout = slackApi(correct, { feedback: note(correct, 'correct-silence', holdoutId) });
  await ingestParticipationFeedback({ policy, config, request: request(correct, holdoutId, 'holdout'),
    evidence: read, store, token, fetchImpl: holdout.fetchImpl });
  assert.throws(() => transact('apply-policy', 'stale.json', '--stage-id', staged.id), /router_participation_policy_stale/);
  assert.throws(() => transact('stage-policy', 'regressed.json', '--candidate-version', 'fixture-v3'), /router_participation_review_invalid/);
  assert.deepEqual(transact('status-policy', 'status.json').transitions, []);
});
