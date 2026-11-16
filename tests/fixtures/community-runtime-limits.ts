// Diagnostics only: import the pinned host, never a production plugin integration.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { AgentsSchema } from '../../vendor/openclaw/src/config/zod-schema.agents.ts';
import { resolveAgentTimeoutMs } from '../../vendor/openclaw/src/agents/timeout.ts';
import { resolveAgentMaxConcurrent } from '../../vendor/openclaw/src/config/agent-limits.ts';
import { enqueueCommandInLane, setCommandLaneConcurrency } from '../../vendor/openclaw/src/process/command-queue.ts';
import { prepareEmbeddedAttemptTimeout } from '../../vendor/openclaw/src/agents/embedded-agent-runner/run/attempt-timeout-prepare.ts';

const evidence: Record<string, unknown> = {};
const entries = { main: {}, 'nori-community': {} };
const defaults = { timeoutSeconds: 1, maxConcurrent: 1,
  subagents: { runTimeoutSeconds: 1, maxConcurrent: 1, maxChildrenPerAgent: 1 } };
assert.equal(AgentsSchema.safeParse({ ownership: 'explicit', entries, defaults }).success, true);
const rejected = [
  { timeoutSeconds: 1 }, { maxConcurrent: 1 },
  { subagents: { runTimeoutSeconds: 1 } }, { subagents: { maxConcurrent: 1 } },
].map(patch => {
  const result = AgentsSchema.safeParse({ ownership: 'explicit', entries: { ...entries, 'nori-community': patch } });
  assert.equal(result.success, false, `unexpected supported override: ${JSON.stringify(patch)}`);
  assert.ok(!result.success && result.error.issues.some(issue => issue.code === 'unrecognized_keys' && issue.path.includes('nori-community')));
  return patch;
});
assert.equal(resolveAgentTimeoutMs({ cfg: { agents: { entries, defaults } } }), 1000);
assert.equal(resolveAgentMaxConcurrent({ agents: { entries, defaults } }), 1);
assert.equal(resolveAgentTimeoutMs({}), 172800000);
evidence.configuration = { rejectedCommunityOverrides: rejected, globalTimeoutMs: 1000,
  nativeDefaultTimeoutMs: 172800000, globalConcurrency: 1 };

// Exercise the real attempt timer with cooperative consumers, not a fake timeout result.
async function attempt(name: string, timeoutMs: number) {
  const controller = new AbortController();
  const events: string[] = [];
  const started = performance.now();
  const timeout = prepareEmbeddedAttemptTimeout({
    attempt: { runId: name, sessionId: name, timeoutMs },
    activeSession: { isCompacting: false, isStreaming: true },
    compactionState: { isCompacting: () => false }, compactionTimeoutMs: 100,
    runAbortSignal: controller.signal, isProbeSession: true,
    markTimedOutDuringCompaction() { throw Error('Unexpected compaction'); },
    markTimedOutByRunBudget() { events.push('budget-expired'); },
    abortRun() { events.push('abort-requested'); controller.abort(); },
  });
  const consumers = ['model-signal-consumer', 'tool-signal-consumer'].map(async label => {
    try { await delay(5000, undefined, { signal: controller.signal }); }
    catch (error) { assert.equal((error as Error).name, 'AbortError'); events.push(`${label}-settled`); }
  });
  await Promise.all(consumers);
  timeout.clearTimers();
  assert.deepEqual(events, ['budget-expired', 'abort-requested', 'model-signal-consumer-settled', 'tool-signal-consumer-settled']);
  return { events, elapsedMs: Math.round(performance.now() - started) };
}
evidence.cooperativeAttempt = await attempt('cooperative', 35);

// Verify disposal/cancellation ownership at the native timer seam. This is not
// a Gateway reload or a provider integration test.
const raceEvents: string[] = [];
function arm(name: string, controller: AbortController, milliseconds: number) {
  return prepareEmbeddedAttemptTimeout({
    attempt: { runId: name, sessionId: 'same-session', timeoutMs: milliseconds },
    activeSession: { isCompacting: false, isStreaming: false },
    compactionState: { isCompacting: () => false }, compactionTimeoutMs: 100,
    runAbortSignal: controller.signal, isProbeSession: true,
    markTimedOutDuringCompaction() { throw Error('Unexpected compaction'); },
    markTimedOutByRunBudget() { raceEvents.push(name); },
    abortRun() { controller.abort(); },
  });
}
const cancelled = new AbortController(), successorController = new AbortController();
const otherSession = new AbortController(), alreadyCancelled = new AbortController();
alreadyCancelled.abort();
const timers = [arm('cancelled', cancelled, 30), arm('successor', successorController, 5000),
  arm('already-cancelled', alreadyCancelled, 30), arm('completed', otherSession, 30)];
cancelled.abort(); timers[3].clearTimers();
try {
  await delay(70);
  assert.deepEqual(raceEvents, []);
  assert.equal(successorController.signal.aborted, false);
  assert.equal(otherSession.signal.aborted, false);
} finally { timers.forEach(timer => timer.clearTimers()); }
evidence.timerOwnership = { cancelledAndDisposedTimersSilent: true, successorUnaffected: true };

// A held promise makes overlap deterministic: no sleep duration can fake settlement.
const lane = 'community-runtime-diagnostic';
setCommandLaneConcurrency(lane, 1);
let release!: () => void;
const held = new Promise<void>(resolve => { release = resolve; });
let actualFinished = false;
const order: string[] = [];
const first = enqueueCommandInLane(lane, async () => {
  order.push('first-start'); await held; actualFinished = true; order.push('first-settled');
}, { taskTimeoutMs: 40 }).then(() => { throw Error('Expected native lane timeout'); }, error => {
  assert.equal(error.name, 'CommandLaneTaskTimeoutError'); order.push('caller-timeout');
});
const successor = enqueueCommandInLane(lane, async () => {
  order.push('successor-start'); assert.equal(actualFinished, false);
});
// Native queue timers are unref'ed; keep this diagnostic alive without indefinite work.
const keepalive = setTimeout(() => { throw Error('Native lane did not expire'); }, 5000);
try {
  await Promise.all([first, successor]);
  assert.equal(actualFinished, false);
  release(); await held; await delay(0);
  assert.equal(actualFinished, true);
} finally { clearTimeout(keepalive); release(); }
evidence.uncooperativeQueue = { order, releasedBeforeActualSettlement: true };

// Baseline without a queue timeout retains the slot until real completion.
let releaseBaseline!: () => void;
const baselineHeld = new Promise<void>(resolve => { releaseBaseline = resolve; });
let nextStarted = false;
const baseline = enqueueCommandInLane(lane, async () => baselineHeld);
const next = enqueueCommandInLane(lane, async () => { nextStarted = true; });
await delay(60); assert.equal(nextStarted, false);
releaseBaseline(); await Promise.all([baseline, next]);
evidence.nativeQueueWithoutTimeout = { retainedUntilSettlement: true };
console.log(JSON.stringify({ status: 'GAPS_REPRODUCED_NOT_PRODUCT_ACCEPTANCE', ...evidence }));
