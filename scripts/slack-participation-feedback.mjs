import { isSlackMessageId, isSlackReviewerId, participationPolicyDigest, participationScopeKey } from '../plugins/rein-router/slack-participation-evidence.mjs';
import { oneScopePolicy } from './slack-participation-review-store.mjs';

const origin = 'https://slack.com/api/';
const methods = new Set(['auth.test', 'conversations.info', 'conversations.members', 'conversations.replies', 'users.info']);
const signalPattern = /^nori-feedback (false-wake|missed-wake|wrong-answer|correct-wake|correct-silence) (\d{1,20}\.\d{1,9})(?: (\d{1,20}\.\d{1,9}))?$/;
const positive = new Set(['false-wake', 'wrong-answer', 'correct-wake']);
const fail = () => { throw new Error('router_participation_feedback_invalid'); };
const unavailable = () => { throw new Error('router_participation_feedback_slack_unavailable'); };

function only(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail();
}

function timestamp(id) {
  const [seconds, fraction] = id.split('.');
  return BigInt(seconds) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
}

async function readResponse(response) {
  if (!response.ok || !response.body) unavailable();
  const reader = response.body.getReader();
  const max = 1024 * 1024;
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) unavailable();
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* The response has already failed or settled. */ }
    reader.releaseLock();
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (result?.ok !== true) unavailable();
  return result;
}

function slackReader({ token, fetchImpl, signal }) {
  if (typeof token !== 'string' || !/^xox[bp]-[A-Za-z0-9-]{8,500}$/.test(token)) fail();
  return async (method, params = {}) => {
    if (!methods.has(method)) fail();
    try {
      return await readResponse(await fetchImpl(origin + method, {
        method: 'POST', redirect: 'error', signal,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      }));
    } catch { unavailable(); }
  };
}

function nextCursor(page, prior, seen) {
  const cursor = page.response_metadata?.next_cursor ?? '';
  if (typeof cursor !== 'string' || cursor.length > 1024 || (cursor && (cursor === prior || seen.has(cursor))) ||
      (!cursor && page.has_more === true)) unavailable();
  if (cursor) seen.add(cursor);
  return cursor;
}

async function checkMembership(read, channel, required) {
  let cursor = '';
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const page = await read('conversations.members', { channel, limit: '200', ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.members) || page.members.length > 200 || !page.members.every(isSlackReviewerId)) unavailable();
    page.members.forEach(id => required.delete(id));
    if (required.size === 0) return;
    cursor = nextCursor(page, cursor, seen);
    if (!cursor) break;
  }
  fail();
}

async function readThread(read, channel, request, sourceId) {
  let cursor = '';
  const seen = new Set(), messages = new Map();
  for (let i = 0; i < 4; i++) {
    const page = await read('conversations.replies', { channel, ts: request.threadId,
      oldest: sourceId, latest: request.feedbackMessageId, inclusive: 'true', limit: '15',
      ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.messages) || page.messages.length > 15) unavailable();
    for (const message of page.messages) {
      if (!isSlackMessageId(message?.ts)) unavailable();
      if (messages.has(message.ts) && JSON.stringify(messages.get(message.ts)) !== JSON.stringify(message)) unavailable();
      messages.set(message.ts, message);
    }
    cursor = nextCursor(page, cursor, seen);
    if (!cursor) return messages;
  }
  unavailable();
}

const plainHuman = (message, actor) => message?.type === 'message' && message.user === actor &&
  message.bot_id === undefined && message.app_id === undefined && message.subtype === undefined && message.edited === undefined;

const inThread = (message, root) => message?.ts === root ?
  message.thread_ts === undefined || message.thread_ts === root : message?.thread_ts === root;

function validateReaderConfig(config, scope) {
  only(config, ['schemaVersion', 'enabled', 'scope', 'readerUserId', 'noriBotUserId', 'noriBotId']);
  if (config.schemaVersion !== 1 || config.enabled !== true ||
      participationScopeKey(config.scope) !== participationScopeKey(scope) ||
      !isSlackReviewerId(config.readerUserId) || !isSlackReviewerId(config.noriBotUserId) ||
      typeof config.noriBotId !== 'string' || !/^B[A-Z0-9]{5,31}$/.test(config.noriBotId)) fail();
}

async function scopedReader(config, scope, token, fetchImpl) {
  const read = slackReader({ token, fetchImpl, signal: AbortSignal.timeout(15000) });
  const auth = await read('auth.test');
  if (auth.team_id !== scope.workspaceId || auth.user_id !== config.readerUserId) fail();
  const info = await read('conversations.info', { channel: scope.channelId });
  const conversation = info.channel;
  if (conversation?.id !== scope.channelId || conversation.is_archived === true ||
      conversation.is_ext_shared === true || conversation.is_im === true || conversation.is_mpim === true ||
      !(conversation.is_channel === true || conversation.is_group === true)) fail();
  return read;
}

async function verifyAuthor(read, scope, decision, config) {
  const user = await read('users.info', { user: decision.senderId });
  if (user.user?.id !== decision.senderId || user.user.team_id !== scope.workspaceId ||
      user.user.deleted !== false || user.user.is_bot !== false || user.user.is_app_user === true) fail();
  await checkMembership(read, scope.channelId, new Set([decision.senderId, config.readerUserId, config.noriBotUserId]));
}

/** Verify explicit author feedback against current Slack authority before storing a private typed receipt. */
export async function ingestParticipationFeedback({ policy: raw, config, request, evidence, store,
  token, fetchImpl = globalThis.fetch, clock = () => new Date() }) {
  const policy = oneScopePolicy(raw);
  const [scope] = policy.channels;
  validateReaderConfig(config, scope);
  only(request, ['schemaVersion', 'decisionId', 'threadId', 'feedbackMessageId', 'split']);
  if (request.schemaVersion !== 1 || typeof request.decisionId !== 'string' ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(request.decisionId) ||
      !isSlackMessageId(request.threadId) || !isSlackMessageId(request.feedbackMessageId) ||
      !['calibration', 'holdout'].includes(request.split)) fail();
  const decision = evidence.read({ policy, scope }).find(item => item.id === request.decisionId);
  if (!decision || !isSlackMessageId(decision.messageId) || !isSlackReviewerId(decision.senderId) ||
      decision.senderId === config.noriBotUserId || timestamp(request.threadId) > timestamp(decision.messageId) ||
      timestamp(request.feedbackMessageId) <= timestamp(decision.messageId)) fail();

  const read = await scopedReader(config, scope, token, fetchImpl);
  // Check the thread and its exact records before parsing the tiny feedback grammar.
  const thread = await readThread(read, scope.channelId, request, decision.messageId);
  const source = thread.get(decision.messageId), note = thread.get(request.feedbackMessageId);
  if (!plainHuman(source, decision.senderId) || !plainHuman(note, decision.senderId) ||
      !inThread(source, request.threadId) || note.thread_ts !== request.threadId || typeof note.text !== 'string') fail();
  const label = signalPattern.exec(note.text);
  if (!label || label[0] !== note.text || label[2] !== decision.messageId || positive.has(label[1]) !== (decision.route === 'existing-router') ||
      Boolean(label[3]) !== (label[1] === 'wrong-answer')) fail();
  const [, signal, messageId, answerId] = label;
  let reply;
  if (answerId) {
    const answer = thread.get(answerId);
    // A Slack reply directly targets the root. Later replies to other replies share only the root.
    if (source.ts !== request.threadId || answer?.type !== 'message' || answer.thread_ts !== request.threadId ||
        answer.bot_id !== config.noriBotId || (answer.user !== undefined && answer.user !== config.noriBotUserId) ||
        timestamp(answerId) <= timestamp(messageId) || timestamp(answerId) >= timestamp(request.feedbackMessageId)) fail();
    reply = { messageId: answerId, actualModel: null };
  }
  await verifyAuthor(read, scope, decision, config);

  const receipt = { schemaVersion: 1, source: 'slack-web-api', policyDigest: participationPolicyDigest(policy),
    scope, decisionId: decision.id, messageId, actorId: decision.senderId, signal,
    sourceMessageId: request.feedbackMessageId, threadId: request.threadId, split: request.split,
    ...(reply ? { reply } : {}), verifiedAt: clock().toISOString() };
  return store.recordFeedback(policy, receipt);
}


/** Observe a complete Slack root thread through a fixed cutoff; never infer terminal worker silence. */
export async function inspectParticipationThread({ policy: raw, config, decisionId, evidence, token,
  fetchImpl = globalThis.fetch, clock = () => new Date() }) {
  const policy = oneScopePolicy(raw), [scope] = policy.channels;
  validateReaderConfig(config, scope);
  const entry = evidence.readDecision({ policy, scope, decisionId });
  const decision = entry?.decision;
  if (!decision || !isSlackMessageId(decision.messageId) || !isSlackReviewerId(decision.senderId) ||
      decision.senderId === config.noriBotUserId) fail();
  const read = await scopedReader(config, scope, token, fetchImpl);
  await verifyAuthor(read, scope, decision, config);
  const cutoff = clock(), millis = cutoff.getTime();
  const latest = Math.floor(millis / 1000) + '.' + String(millis % 1000).padStart(3, '0') + '000';
  if (timestamp(latest) <= timestamp(decision.messageId)) fail();
  const root = decision.messageId;
  const thread = await readThread(read, scope.channelId, { threadId: root, feedbackMessageId: latest }, root);
  const source = thread.get(root);
  if (!plainHuman(source, decision.senderId) || !inThread(source, root)) fail();
  const botReplies = [], others = [];
  for (const message of thread.values()) {
    if (message.ts === root) continue;
    if (!inThread(message, root) || timestamp(message.ts) <= timestamp(root) || timestamp(message.ts) > timestamp(latest)) fail();
    if (message.type === 'message' && message.bot_id === config.noriBotId &&
        (message.user === undefined || message.user === config.noriBotUserId)) botReplies.push(message.ts);
    else if (message.user === config.noriBotUserId || message.bot_id === config.noriBotId) fail();
    else others.push(message.ts);
  }
  return { schemaVersion: 1, scope, policyDigest: entry.policyDigest, decision,
    slackThread: { sourceMessageId: root, observedThrough: cutoff.toISOString(), botReplyIds: botReplies,
      otherReplyCount: others.length, outcome: botReplies.length ? 'bot-replies-visible' : 'no-bot-reply-visible' } };
}
