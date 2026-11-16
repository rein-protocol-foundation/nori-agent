import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskContinuation } from '../plugins/rein-acp/continuation.mjs';
import { createTaskLoop } from '../plugins/rein-acp/task-loop.mjs';

const config = { channel: { agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1' },
  continuation: { maxActiveFlows: 16, maxRuntimeMs: 3600000, maxAttempts: 4, maxNoProgress: 2 },
  harnessAgentId: 'codex', cwd: '/tmp/continuation' };
const src = { runId: 'human-run', agentId: 'main', sessionKey: 'agent:main:slack:channel:cfixture1', sessionId: 'source-session',
  channel: 'slack', accountId: 'default', chatId: 'CFIXTURE1', senderId: 'UALICE01', trigger: 'user' };
const origin = { channel: 'slack', accountId: 'default', to: 'channel:CFIXTURE1', threadId: '1.001' };

function fixture() {
  const flows = new Map(), native = new Map();
  let member = true, number = 0, runtime, cancellations = 0;
  const copy = value => value && structuredClone(value);
  const binding = {
    list: async () => [...flows.values()].map(copy), get: async id => copy(flows.get(id)),
    createManaged: async args => {
      const flow = { ...args, flowId: `flow-${flows.size + 1}`, syncMode: 'managed', ownerKey: src.sessionKey,
        requesterOrigin: origin, revision: 1 };
      flows.set(flow.flowId, flow); return copy(flow);
    },
    runTask: async () => ({ created: true }),
  };
  for (const [method, status] of [['setWaiting', 'waiting'], ['fail', 'failed'], ['finish', 'succeeded']]) binding[method] = async args => {
    const flow = flows.get(args.flowId);
    if (flow.revision !== args.expectedRevision) return { applied: false, code: 'revision_conflict' };
    Object.assign(flow, { stateJson: copy(args.stateJson), revision: flow.revision + 1, status });
    return { applied: true, flow: copy(flow) };
  };
  const runs = { resolve: async token => copy([...native.values()].find(task => [task.runId, task.childSessionKey, task.id].includes(token))) };
  const tasks = { async: { managedFlows: { bindSession: () => binding, fromToolContext: () => binding }, runs: { bindSession: () => runs } },
    runs: { bindSession: () => ({ cancel: async args => {
      cancellations++;
      const task = native.get(args.taskId);
      Object.assign(task, { status: 'cancelled', error: 'Cancelled by operator.' });
      return { found: true, cancelled: true, task: copy(task) };
    } }) } };
  const dependencies = { config, tasks, subagent: { waitForRun: async () => ({ status: 'error', endedAt: 100 }) },
    session: { listSessionEntries: () => [{ sessionKey: src.sessionKey, entry: { sessionId: src.sessionId } }] },
    system: {}, authorize: async () => member, isNativeChild: () => false, clock: () => 1000 };
  const context = { ...src, deliveryContext: origin, requesterSenderId: src.senderId, assertInvocationCurrent() {} };
  const f = { flows, native, tasks, dependencies, context, setMember(value) { member = value; }, cancellations: () => cancellations,
    get runtime() { return runtime; },
    async restart() { runtime = createTaskContinuation(dependencies); await runtime.beforeAgentRun({}, context); },
    async call(args) {
      const toolCallId = `call-${++number}`;
      await runtime.beforeToolCall({ toolName: 'rein_continuation', params: args }, { ...context, toolCallId });
      return (await runtime.toolFactory.create(context).execute(toolCallId, args)).details;
    },
    async prepare() {
      const flow = await f.call({ action: 'begin', goal: 'Compare nonprofit tools', criteria: 'Three tools with sources', runtime: 'subagent' });
      return f.call({ action: 'delegate', flow: flow.flowId, instruction: 'Research the tools' });
    },
    async spawn(prepared, params = {}) {
      const event = { toolName: 'sessions_spawn', params: { task: prepared.task, ...params } };
      const ctx = { ...context, toolCallId: `spawn-${++number}` };
      return { gate: await runtime.beforeToolCall(event, ctx), event, ctx };
    },
    async accept(prepared, delta = {}) {
      const spawn = await f.spawn(prepared);
      const task = { id: 'native-task', ownerKey: src.sessionKey, scope: 'session', runtime: 'subagent', runId: 'native-run',
        childSessionKey: 'agent:main:subagent:child', status: 'cancelled', endedAt: 100, title: prepared.task, ...delta };
      native.set(task.id, task);
      await runtime.afterToolCall({ ...spawn.event, result: { details: { status: 'accepted', runId: task.runId, childSessionKey: task.childSessionKey } } }, spawn.ctx);
      return task;
    },
  };
  return f;
}

test('invalid native task names leave launch custody prepared and permit one corrected spawn', async () => {
  const f = fixture(); await f.restart(); const prepared = await f.prepare();
  for (const taskName of ['GrantResearch', 'all', 'last', 'bad handle', 'a'.repeat(65)]) {
    for (const compact of [false, true]) {
      const params = { task: prepared.task, taskName }, event = compact
        ? { toolName: 'tool_call', params: { id: 'openclaw:core:sessions_spawn', args: params } }
        : { toolName: 'sessions_spawn', params };
      const gate = await f.runtime.beforeToolCall(event, { ...f.context, toolCallId: `invalid-${taskName}` });
      assert.equal(gate.block, true); assert.match(gate.blockReason, /remains prepared/);
      assert.equal(f.flows.get(prepared.flowId).stateJson.phase, 'prepared');
    }
  }
  await f.restart();
  assert.equal((await f.spawn(prepared, { taskName: 'grant_research' })).gate.block, undefined);
  assert.equal(f.flows.get(prepared.flowId).stateJson.phase, 'launching');
  assert.equal((await f.spawn(prepared, { taskName: 'grant_research' })).gate.block, true);
});

test('restart provisional cancellation needs native cancel confirmation, then durable review permits a bounded supplement', async () => {
  const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
  await f.restart(); const prepared = await f.prepare();
  await f.accept(prepared, { error: 'Subagent run killed.' });
  assert.equal(f.cancellations(), 1);
  const saved = f.flows.get(prepared.flowId).stateJson;
  assert.equal(saved.attempts[0].settlement.source, 'native_cancel');
  const deadline = saved.deadlineAt;
  await f.restart();
  const reviewed = await f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
    outcome: 'continue', evidence: 'Interrupted before research completed', gaps: 'Three sourced comparisons', effects: 'none', progress: false });
  assert.equal(reviewed.phase, 'ready'); assert.equal(f.cancellations(), 1);
  const supplement = await f.call({ action: 'delegate', flow: prepared.flowId, instruction: 'Complete the missing comparisons' });
  assert.equal(supplement.attempts.length, 2); assert.equal(supplement.deadlineAt, deadline);
  assert.equal((await f.spawn(supplement)).gate.block, undefined);
});

test('persisted strong wait evidence remains usable after native wait cache expires', async () => {
  const f = fixture(); await f.restart(); const prepared = await f.prepare();
  await f.accept(prepared, { status: 'succeeded', terminalSummary: 'Three sourced tools' });
  assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement.source, 'native_wait');
  f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
  await f.restart();
  const reviewed = await f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
    outcome: 'complete', evidence: 'All three tools and sources verified', effects: 'none', progress: true });
  assert.equal(reviewed.phase, 'complete'); assert.equal(f.cancellations(), 0);
});

const terminalWait = (overrides = {}) => ({ runId: 'native-run', status: 'ok', startedAt: 10, endedAt: 100,
  stopReason: 'stop', livenessState: 'working', terminalReceipt: { runId: 'native-run', sessionId: 'child-session',
    turnId: 'child-terminal-turn', terminalDisposition: 'visible', successfulToolNames: ['web_search'] },
  terminalReply: { disposition: 'visible', text: 'Three sourced nonprofit tools' }, ...overrides });

test('published exact-run receipt settles successful native work despite stale working liveness', async () => {
  for (const disposition of ['visible', 'silent', 'empty']) {
    const f = fixture(), wait = terminalWait();
    if (disposition !== 'visible') {
      wait.terminalReceipt.terminalDisposition = 'not-visible';
      wait.terminalReply = { disposition };
    }
    f.dependencies.subagent.waitForRun = async () => wait;
    await f.restart(); const prepared = await f.prepare();
    await f.accept(prepared, { status: 'succeeded', terminalSummary: 'Three sourced tools' });
    assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement.source, 'native_terminal_receipt');
    // The receipt was persisted; subsequent process-local wait cache loss cannot
    // strand the completed attempt or trigger another native launch.
    f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
    await f.restart();
    const reviewed = await f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'complete', evidence: 'All three tools and sources verified', effects: 'none', progress: true });
    assert.equal(reviewed.phase, 'complete'); assert.equal(f.cancellations(), 0);
    assert.equal(reviewed.report.delivery, 'pending_or_uncertain');
    assert.equal((await f.spawn(prepared)).gate.block, true);
  }
});

test('complete review rejects every nonempty gaps value without consuming review or budgets, then accepts a correction', async () => {
  for (const correctedGaps of [undefined, '', '   ']) {
    const f = fixture(); await f.restart(); const prepared = await f.prepare();
    await f.accept(prepared, { status: 'succeeded', terminalSummary: 'Three sourced tools' });
    f.flows.get(prepared.flowId).stateJson.noProgress = 1;
    const before = structuredClone(f.flows.get(prepared.flowId));
    const review = { action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'complete', evidence: 'All requested comparisons are present', effects: 'none', progress: true };
    for (const gaps of ['无未完成项；各国用户上限、验证合作方、审核时长与免费升级期限均标为未知。', 'none', 'No gaps', 'Missing sources']) {
      await assert.rejects(f.call({ ...review, gaps }), /omit gaps or use an empty string.*choose outcome=continue/);
      assert.deepEqual(f.flows.get(prepared.flowId), before);
    }
    await f.restart();
    const corrected = await f.call({ ...review, ...(correctedGaps === undefined ? {} : { gaps: correctedGaps }) });
    assert.equal(corrected.phase, 'complete'); assert.equal(corrected.nativeStatus, 'succeeded');
    assert.equal(corrected.noProgress, 0); assert.equal(corrected.attempts.length, 1);
    assert.equal(corrected.deadlineAt, before.stateJson.deadlineAt);
    assert.equal(corrected.report.gaps, null); assert.equal(corrected.report.outcome, 'complete');
  }
});

test('unsupported complete outcomes leave review intact for a truthful blocked or continuing review', async () => {
  for (const variation of ['unknown-effects', 'failed', 'cancelled', 'blocked']) {
    const f = fixture(); await f.restart(); const prepared = await f.prepare();
    await f.accept(prepared, { status: ['failed', 'cancelled'].includes(variation) ? variation : 'succeeded',
      terminalSummary: 'Available partial result', ...(variation === 'blocked' ? { terminalOutcome: 'blocked' } : {}) });
    const before = structuredClone(f.flows.get(prepared.flowId));
    const review = { action: 'review', flow: prepared.flowId, scopeRevision: 1, outcome: 'complete',
      evidence: 'Available result only', effects: variation === 'unknown-effects' ? 'unknown' : 'none', progress: true };
    await assert.rejects(f.call(review), /complete_effects_unknown|complete_native_outcome_invalid/);
    assert.deepEqual(f.flows.get(prepared.flowId), before);
    assert.equal(before.stateJson.phase, 'review'); assert.equal(before.stateJson.report, null);
    const corrected = await f.call({ ...review, outcome: 'blocked', gaps: 'Completion cannot be established' });
    assert.equal(corrected.phase, variation === 'unknown-effects' ? 'outcome_unknown' : 'limited');
    assert.equal(corrected.report.outcome, 'blocked'); assert.equal(corrected.nativeStatus, 'failed');
  }
});

test('working liveness still blocks mismatched, partial, yielded and unpublished terminal receipts', async () => {
  const cases = [
    { runId: 'foreign-run' }, { status: 'pending' }, { status: 'timeout' }, { status: 'error' },
    { endedAt: undefined }, { yielded: true }, { pendingError: true }, { stopReason: 'sessions_yield' },
    { livenessState: 'blocked' }, { terminalReceipt: undefined }, { terminalReply: undefined },
    { terminalReply: { disposition: 'visible', text: '' } }, { terminalReply: { disposition: 'silent' } },
    ...[{ runId: 'foreign-run' }, { sessionId: '' }, { turnId: '' }, { terminalDisposition: 'not-visible' }]
      .map(receipt => ({ terminalReceipt: { ...terminalWait().terminalReceipt, ...receipt } })),
  ];
  for (const overrides of cases) {
    const f = fixture(); f.dependencies.subagent.waitForRun = async () => terminalWait(overrides);
    await f.restart(); const prepared = await f.prepare();
    await f.accept(prepared, { status: 'succeeded', terminalSummary: 'Three sourced tools' });
    await assert.rejects(f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'complete', evidence: 'Available result', effects: 'none', progress: true }), /run_not_settled/);
    assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement, undefined);
    assert.equal((await f.spawn(prepared)).gate.block, true);
    assert.equal(f.cancellations(), 0);
  }
  for (const task of [{ status: 'running' }, { status: 'failed' }, { status: 'cancelled' }, { status: 'succeeded', endedAt: undefined }]) {
    const f = fixture(); f.dependencies.subagent.waitForRun = async () => terminalWait();
    await f.restart(); const prepared = await f.prepare(); await f.accept(prepared, task);
    await assert.rejects(f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'complete', evidence: 'Only a receipt', effects: 'none' }), /current_scope_review_required|run_not_settled/);
    assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement, undefined);
  }
});

test('failed, incomplete and mismatched cancellation cannot establish durable settlement', async () => {
  for (const cancellation of ['failed', 'throws', 'provisional', 'foreign-receipt', 'missing-endedAt']) {
    const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
    f.tasks.runs.bindSession = () => ({ cancel: async () => {
      const task = f.native.get('native-task');
      if (cancellation === 'throws') throw Error('transport lost');
      if (cancellation === 'failed') return { found: true, cancelled: false, reason: 'descendant still active' };
      if (!['provisional', 'foreign-receipt'].includes(cancellation)) task.error = 'Cancelled by operator.';
      if (cancellation === 'missing-endedAt') delete task.endedAt;
      return { found: true, cancelled: true, task: { ...task, ...(cancellation === 'foreign-receipt' ? { runId: 'other-run' } : {}) } };
    } });
    await f.restart(); const prepared = await f.prepare(); await f.accept(prepared, { error: 'Subagent run killed.' });
    await f.restart();
    await assert.rejects(f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'continue', evidence: 'No settled execution proof', gaps: 'Research incomplete', effects: 'none' }), /run_not_settled/);
    assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement, undefined);
    assert.equal((await f.spawn(prepared)).gate.block, true);
  }
});

test('native success committed during drain survives restart before review or wait proof is saved', async () => {
  for (const observation of [undefined, { status: 'timeout' }, { runId: 'native-run', status: 'timeout' }]) {
    const f = fixture(); await f.restart(); const prepared = await f.prepare();
    const task = await f.accept(prepared, { status: 'running', endedAt: undefined });
    // The native execution owner commits success during drain. No parent status
    // or review runs before the process ends, and the new wait cache is empty.
    Object.assign(task, { status: 'succeeded', endedAt: 100, terminalSummary: null, terminalOutcome: null });
    assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement, undefined);
    f.dependencies.subagent.waitForRun = async () => observation;
    await f.restart();
    const reviewed = await f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1, outcome: 'continue',
      evidence: 'Native execution ended; comparison still needs eligibility', gaps: 'Eligibility evidence', effects: 'none', progress: true });
    assert.equal(reviewed.phase, 'ready'); assert.equal(reviewed.attempts[0].settlement.source, 'native_succeeded_record');
    const supplement = await f.call({ action: 'delegate', flow: prepared.flowId, instruction: 'Supply the missing eligibility evidence' });
    const launch = await f.spawn(supplement);
    Object.assign(task, { runId: 'supplement-run', childSessionKey: 'agent:main:subagent:supplement', terminalSummary: 'Eligibility verified' });
    await f.runtime.afterToolCall({ ...launch.event, result: { details: { status: 'accepted', runId: task.runId, childSessionKey: task.childSessionKey } } }, launch.ctx);
    f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
    const complete = await f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1, outcome: 'complete',
      evidence: 'All requested criteria verified across retained results and supplement', effects: 'none', progress: true });
    assert.equal(complete.phase, 'complete'); assert.equal(complete.attempts.length, 2);
    assert.equal(complete.deadlineAt, reviewed.deadlineAt); assert.equal(f.cancellations(), 0);
  }
});

test('durable native success can complete directly without relaunch while retaining scope and effects guards', async () => {
  const f = fixture(); await f.restart(); const prepared = await f.prepare();
  const task = await f.accept(prepared, { status: 'running', endedAt: undefined });
  Object.assign(task, { status: 'succeeded', endedAt: 100, terminalSummary: null, terminalOutcome: null });
  f.dependencies.subagent.waitForRun = async () => ({ runId: task.runId, status: 'timeout' });
  await f.restart();
  const review = { action: 'review', flow: prepared.flowId, scopeRevision: 1, outcome: 'complete',
    evidence: 'Native result meets all current criteria', effects: 'none', progress: true };
  await assert.rejects(f.call({ ...review, scopeRevision: 2 }), /current_scope_review_required/);
  await assert.rejects(f.call({ ...review, effects: 'unknown' }), /complete_effects_unknown/);
  assert.equal(f.flows.get(prepared.flowId).stateJson.phase, 'review');
  const complete = await f.call(review);
  assert.equal(complete.phase, 'complete'); assert.equal(complete.attempts.length, 1);
  assert.equal(complete.attempts[0].settlement.source, 'native_succeeded_record');
  assert.equal(complete.report.delivery, 'pending_or_uncertain');
  assert.equal((await f.spawn(prepared)).gate.block, true); assert.equal(f.cancellations(), 0);
});

test('durable success never overrides contradictory wait evidence or unbound native task backing', async () => {
  for (const wait of [{ status: 'pending' }, { status: 'error' }, { status: 'timeout', yielded: true },
    { status: 'timeout', pendingError: true }, { status: 'timeout', livenessState: 'working' },
    { status: 'timeout', livenessState: 'paused' }, { status: 'timeout', timeoutPhase: 'queue' },
    { status: 'timeout', providerStarted: true }, { status: 'timeout', startedAt: 10 },
    { status: 'timeout', error: 'retry pending' }, { status: 'timeout', runId: 'other-run' }]) {
    const f = fixture(); f.dependencies.subagent.waitForRun = async () => wait;
    await f.restart(); const prepared = await f.prepare(); await f.accept(prepared, { status: 'succeeded' });
    await assert.rejects(f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'complete', evidence: 'Only a conflicting native projection', effects: 'none' }), /run_not_settled/);
    assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement, undefined);
  }
  for (const patch of [{ status: 'failed' }, { status: 'lost' }, { status: 'cancelled' }, { endedAt: undefined },
    { ownerKey: 'agent:main:other' }, { childSessionKey: 'agent:main:subagent:foreign' }, { runtime: 'acp' }]) {
    const f = fixture(); await f.restart(); const prepared = await f.prepare();
    const task = await f.accept(prepared, { status: 'running', endedAt: undefined });
    Object.assign(task, { status: 'succeeded', endedAt: 100 }, patch);
    f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
    await f.restart();
    await assert.rejects(f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'complete', evidence: 'No bound durable success proof', effects: 'none' }), /run_not_settled|current_scope_review_required/);
    assert.equal(f.flows.get(prepared.flowId).stateJson.attempts[0].settlement, undefined);
  }
});

test('persisted native cancellation closes the crash gap before Flow settlement receipt is written', async () => {
  const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
  await f.restart(); const prepared = await f.prepare(); await f.accept(prepared, { error: 'Subagent run killed.' });
  // Native cancel committed, but the process died before our Flow write.
  delete f.flows.get(prepared.flowId).stateJson.attempts[0].settlement;
  await f.restart();
  const reviewed = await f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
    outcome: 'continue', evidence: 'Native run tree is cancelled', gaps: 'Missing research', effects: 'none' });
  assert.equal(reviewed.phase, 'ready');
  assert.equal(reviewed.attempts[0].settlement.source, 'native_cancel_record');
  assert.equal(f.cancellations(), 1);
});

test('terminal task status and yielded, pending or unavailable wait results never suffice alone', async () => {
  for (const wait of [{ status: 'timeout' }, { status: 'pending' }, { status: 'error' },
    { status: 'error', endedAt: 100, yielded: true }, { status: 'error', endedAt: 100, pendingError: true },
    { status: 'ok', endedAt: 100, livenessState: 'blocked' }]) {
    const f = fixture(); f.dependencies.subagent.waitForRun = async () => wait;
    await f.restart(); const prepared = await f.prepare(); await f.accept(prepared);
    await assert.rejects(f.call({ action: 'review', flow: prepared.flowId, scopeRevision: 1,
      outcome: 'continue', evidence: 'Only terminal task projection', gaps: 'Missing research', effects: 'none' }), /run_not_settled/);
    assert.equal(f.cancellations(), 0);
  }
});

test('missing receipt and arbitrary native errors remain uncertain across restart', async () => {
  for (const result of [undefined, { details: { status: 'error', error: 'network failure after acceptance' } }]) {
    const f = fixture(); await f.restart(); const prepared = await f.prepare();
    const spawn = await f.spawn(prepared);
    await f.runtime.afterToolCall({ ...spawn.event, result }, spawn.ctx);
    await f.restart();
    assert.equal((await f.call({ action: 'status', flow: prepared.flowId })).phase, 'outcome_unknown');
    assert.equal((await f.spawn(prepared)).gate.block, true);
  }
});

test('M1 preserves tools for verified current managed cancellation but keeps stopped and old scopes report-only', async () => {
  for (const variation of ['current', 'stopped', 'old-scope', 'foreign-run', 'revoked', 'disabled']) {
    const f = fixture(); await f.restart(); const prepared = await f.prepare(), task = await f.accept(prepared);
    const state = f.flows.get(prepared.flowId).stateJson;
    if (variation === 'stopped') state.stopRequested = { at: 1000, reason: 'stop' };
    if (variation === 'old-scope') state.scopeRevision++;
    if (variation === 'foreign-run') state.attempts.at(-1).runId = 'different-run';
    if (variation === 'revoked') f.setMember(false);
    await f.restart();
    const loop = createTaskLoop({ ...f.dependencies,
      isCurrentContinuation: variation === 'disabled' ? undefined : (native, ctx) => f.runtime.isCurrentAttempt(native, ctx) });
    const completion = { ...src, runId: 'completion', trigger: 'heartbeat', senderId: undefined,
      inputProvenance: { kind: 'inter_session', sourceTool: 'subagent_announce', sourceSessionKey: task.childSessionKey } };
    // The real host builds the prompt before the run-admission hook.
    const prompt = await loop.beforePromptBuild({}, completion);
    await loop.beforeAgentRun({}, completion);
    const gate = await loop.beforeToolCall({ toolName: 'rein_continuation', params: { action: 'status' } }, completion);
    if (variation === 'current') { assert.equal(prompt.toolsAllow, undefined); assert.equal(gate, undefined); }
    else { assert.deepEqual(prompt.toolsAllow, []); assert.equal(gate.block, true); }
  }
});

test('stop records failed and pending cancellation across restart, then confirms actual settlement', async () => {
  for (const failure of ['refused', 'throws', 'accepted', 'finalizing']) {
    const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
    f.tasks.runs.bindSession = () => ({ cancel: async () => {
      if (failure === 'throws') throw Error('unavailable');
      return { found: true, cancelled: failure === 'accepted', reason: failure === 'finalizing' ? 'Subagent completion is still being finalized.' : 'Native work still active' };
    } });
    await f.restart(); const p = await f.prepare();
    const task = await f.accept(p, { status: 'running', endedAt: undefined });
    const stopped = await f.call({ action: 'stop', flow: p.flowId });
    assert.equal(stopped.phase, 'cancellation_pending');
    assert.equal(stopped.attempts[0].cancellation.status, ['accepted', 'finalizing'].includes(failure) ? 'pending' : 'failed');
    assert.ok(stopped.stopRequested); assert.equal(stopped.attempts[0].settlement, undefined);
    await f.restart();
    await assert.rejects(f.call({ action: 'delegate', flow: p.flowId, instruction: 'Do more' }), /not_ready/);
    assert.equal((await f.spawn(p)).gate.block, true);
    Object.assign(task, { status: 'cancelled', endedAt: 1200, error: 'Cancelled by operator.' });
    const terminal = (await f.call({ action: 'status' })).flows[0];
    assert.equal(terminal.phase, 'stopped'); assert.equal(terminal.attempts[0].cancellation.status, 'confirmed');
    assert.equal(terminal.deadlineAt, stopped.deadlineAt); assert.equal(terminal.attempts.length, 1);
    Object.assign(task, { status: 'succeeded', terminalSummary: 'Late result' });
    const late = await f.call({ action: 'review', flow: p.flowId, scopeRevision: 1, outcome: 'complete', evidence: 'late', effects: 'none' });
    assert.equal(late.operation, 'terminal_no_restart'); assert.equal(late.phase, 'stopped');
  }
});

test('changed scope rejects old late success, retains budgets, and permits only the new assignment', async () => {
  const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
  f.tasks.runs.bindSession = () => ({ cancel: async () => ({ cancelled: false, reason: 'Still executing' }) });
  await f.restart(); const p = await f.prepare(); const task = await f.accept(p, { status: 'running', endedAt: undefined });
  const changed = await f.call({ action: 'change', flow: p.flowId, goal: 'Compare local grants', criteria: 'Two local grants' });
  assert.equal(changed.scopeRevision, 2); assert.equal(changed.phase, 'cancellation_pending');
  await f.restart();
  Object.assign(task, { status: 'succeeded', endedAt: 1500, terminalSummary: 'OLD three tools' });
  const status = (await f.call({ action: 'status' })).flows[0];
  assert.equal(status.phase, 'ready'); assert.equal(status.goal, 'Compare local grants');
  assert.equal(status.attempts[0].cancellation.status, 'not_needed');
  for (const scopeRevision of [1, 2]) await assert.rejects(f.call({ action: 'review', flow: p.flowId,
    scopeRevision, outcome: 'complete', evidence: 'Old result', effects: 'none' }), /current_scope_review_required/);
  assert.equal((await f.spawn(p)).gate.block, true);
  const next = await f.call({ action: 'delegate', flow: p.flowId, instruction: 'Find two local grants' });
  assert.equal(next.attempts.length, 2); assert.equal(next.deadlineAt, p.deadlineAt);
  assert.match(next.task, /scope revision 2/); assert.match(next.task, /Compare local grants/);
  assert.equal((await f.spawn(next)).gate.block, undefined);
});

test('stop between native admission and receipt retains intent and cancels the accepted work', async () => {
  const f = fixture(); await f.restart(); const p = await f.prepare(); const spawn = await f.spawn(p);
  const stopped = await f.call({ action: 'stop', flow: p.flowId });
  assert.equal(stopped.phase, 'outcome_unknown'); assert.ok(stopped.stopRequested);
  f.native.set('late-task', { id: 'late-task', ownerKey: src.sessionKey, scope: 'session', runtime: 'subagent',
    runId: 'late-run', childSessionKey: 'late-child', status: 'running', endedAt: 100 });
  await f.runtime.afterToolCall({ ...spawn.event, result: { details: { status: 'accepted', runId: 'late-run', childSessionKey: 'late-child' } } }, spawn.ctx);
  const status = await f.call({ action: 'status', flow: p.flowId });
  assert.equal(status.phase, 'stopped'); assert.equal(f.cancellations(), 1);
  assert.equal(status.attempts[0].cancellation.status, 'confirmed');
  assert.equal((await f.spawn(p)).gate.block, true);
});

test('pre-admission stop or deadline releases known-unlaunched custody without fabricating unknown effects', async () => {
  for (const race of ['stop', 'deadline']) {
    const f = fixture(); await f.restart(); const p = await f.prepare();
    const original = f.dependencies.authorize; let raced = false, now = 1000;
    f.dependencies.clock = () => now;
    f.dependencies.authorize = async source => {
      if (!raced && f.flows.get(p.flowId).stateJson.attempts[0].phase === 'launching') {
        raced = true;
        if (race === 'stop') await f.call({ action: 'stop', flow: p.flowId });
        else now = p.deadlineAt - 500;
      }
      return original(source);
    };
    await f.restart();
    const spawn = await f.spawn(p);
    assert.equal(spawn.gate.block, true);
    const status = f.flows.get(p.flowId).stateJson;
    assert.equal(status.phase, 'stopped'); assert.ok(status.stopRequested);
    assert.equal(status.attempts[0].runId, undefined); assert.equal(f.cancellations(), 0);
  }
});

test('prepared deadlines and unknown external effects survive restart without a new attempt', async () => {
  for (const variation of ['deadline', 'effects', 'missing-backing']) {
    const f = fixture(); let now = 1000; f.dependencies.clock = () => now;
    await f.restart(); const p = await f.prepare();
    if (variation === 'deadline') now = p.deadlineAt;
    else {
      const task = await f.accept(p, { status: 'succeeded', terminalSummary: 'Effect may have occurred' });
      if (variation === 'missing-backing') f.native.delete(task.id);
      else await f.call({ action: 'review', flow: p.flowId, scopeRevision: 1, outcome: 'blocked',
        evidence: 'No external receipt', gaps: 'Reconcile effect', effects: 'unknown' });
    }
    await f.restart();
    const status = (await f.call({ action: 'status' })).flows[0];
    assert.equal(status.phase, variation === 'deadline' ? 'stopped' : 'outcome_unknown');
    assert.equal(status.deadlineAt, p.deadlineAt); assert.equal(status.attempts.length, 1);
    assert.equal((await f.spawn(p)).gate.block, true);
  }
});

test('restart recovery groups authorized same-audience tasks and excludes foreign or changed sessions', async () => {
  const f = fixture(), events = [], wakes = [];
  f.dependencies.system = { enqueueSystemEvent: (text, ctx) => events.push({ text, ctx }), requestHeartbeat: ctx => wakes.push(ctx) };
  await f.restart(); const first = await f.prepare(), second = await f.prepare();
  const foreign = structuredClone(f.flows.get(first.flowId)); foreign.flowId = 'foreign'; foreign.requesterOrigin.to = 'channel:OTHER';
  f.flows.set(foreign.flowId, foreign);
  await f.restart(); await f.runtime.gatewayStart({}, {});
  assert.equal(events.length, 1); assert.equal(wakes.length, 1);
  assert.ok(events[0].text.includes(first.flowId) && events[0].text.includes(second.flowId));
  assert.ok(!events[0].text.includes('foreign'));
  f.dependencies.session.listSessionEntries = () => [{ sessionKey: src.sessionKey, entry: { sessionId: 'replaced' } }];
  await f.restart(); await f.runtime.gatewayStart({}, {});
  assert.equal(events.length, 1);
  await assert.rejects(f.call({ action: 'status', flow: first.flowId }), /session_changed/);
});

test('attempt and no-progress limits survive controller restart and configuration increases', async () => {
  for (const bound of ['maxAttempts', 'maxNoProgress']) {
    const f = fixture();
    f.dependencies.config = { ...config, continuation: { ...config.continuation, [bound]: 1 } };
    await f.restart(); const p = await f.prepare(); await f.accept(p, { status: 'succeeded', terminalSummary: 'Missing eligibility' });
    f.dependencies.config.continuation[bound] = 10;
    await f.restart();
    const report = await f.call({ action: 'review', flow: p.flowId, scopeRevision: 1, outcome: 'continue',
      evidence: 'Only a partial comparison', gaps: 'Eligibility absent', effects: 'none', progress: false });
    assert.equal(report.phase, 'limited'); assert.equal(report[bound], 1);
    assert.equal(report.report.gaps, 'Eligibility absent'); assert.equal(report.attempts.length, 1);
    assert.equal((await f.spawn(p)).gate.block, true);
    await f.restart();
    const again = await f.call({ action: 'delegate', flow: p.flowId, instruction: 'Try again' });
    assert.equal(again.operation, 'terminal_no_restart'); assert.equal(again.deadlineAt, p.deadlineAt);
  }
});

test('ACP cancellation projection and observation timeout remain pending until real terminal wait evidence', async () => {
  const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
  f.tasks.runs.bindSession = () => ({ cancel: async () => ({ found: true, cancelled: true }) });
  await f.restart();
  const flow = await f.call({ action: 'begin', goal: 'Fixture code change', criteria: 'Checked diff', runtime: 'acp' });
  const p = await f.call({ action: 'delegate', flow: flow.flowId, instruction: 'Make checked diff' });
  const spawn = await f.spawn(p, { runtime: 'acp' }); assert.equal(spawn.gate, undefined);
  const task = { id: 'acp-task', ownerKey: src.sessionKey, scope: 'session', runtime: 'acp', runId: 'acp-run',
    childSessionKey: 'acp-child', status: 'running' }; f.native.set(task.id, task);
  await f.runtime.afterToolCall({ ...spawn.event, result: { details: { status: 'accepted', runId: task.runId, childSessionKey: task.childSessionKey } } }, spawn.ctx);
  await f.call({ action: 'stop', flow: flow.flowId });
  Object.assign(task, { status: 'cancelled', error: 'Cancelled by operator.', endedAt: 100 });
  await f.restart();
  assert.equal((await f.call({ action: 'status', flow: flow.flowId })).phase, 'cancellation_pending');
  f.dependencies.subagent.waitForRun = async () => ({ status: 'error', endedAt: 100, livenessState: 'finished' });
  const stopped = await f.call({ action: 'status', flow: flow.flowId });
  assert.equal(stopped.phase, 'stopped'); assert.equal(stopped.attempts[0].settlement.source, 'native_wait');
});

test('finished wait observations for a different run never confirm stopping this task', async () => {
  for (const conflict of [{ runId: 'foreign-run' }, { terminalReceipt: { runId: 'foreign-run' } }]) {
    const f = fixture();
    f.dependencies.subagent.waitForRun = async () => ({ status: 'error', endedAt: 100, livenessState: 'finished', ...conflict });
    await f.restart(); const p = await f.prepare(); await f.accept(p, { status: 'failed' });
    const stopped = await f.call({ action: 'stop', flow: p.flowId });
    assert.equal(stopped.phase, 'cancellation_pending'); assert.equal(stopped.attempts[0].settlement, undefined);
    await f.restart();
    assert.equal((await f.call({ action: 'status', flow: p.flowId })).phase, 'cancellation_pending');
  }
});

test('stopping a supplement does not inherit the previous attempts known external effects', async () => {
  const f = fixture(); await f.restart(); const p = await f.prepare();
  await f.accept(p, { status: 'succeeded', terminalSummary: 'No effects; missing sources' });
  await f.call({ action: 'review', flow: p.flowId, scopeRevision: 1, outcome: 'continue',
    evidence: 'Read-only initial research', gaps: 'Sources', effects: 'none', progress: true });
  const supplement = await f.call({ action: 'delegate', flow: p.flowId, instruction: 'Verify sources' });
  await f.accept(supplement, { id: 'supplement-task', runId: 'supplement-run', childSessionKey: 'supplement-child', status: 'running' });
  const stopped = await f.call({ action: 'stop', flow: p.flowId });
  assert.equal(stopped.phase, 'stopped'); assert.equal(stopped.report.effects, 'unknown');
  assert.notEqual(stopped.report.evidence, 'Read-only initial research');
});

test('stop reports the promoted native cancellation evidence rather than the provisional kill snapshot', async () => {
  const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
  let calls = 0;
  f.tasks.runs.bindSession = () => ({ cancel: async () => {
    const task = f.native.get('native-task');
    Object.assign(task, { status: 'cancelled', endedAt: 100,
      error: ++calls === 1 ? 'Subagent run killed.' : 'Cancelled by operator.' });
    return { found: true, cancelled: true, task: structuredClone(task) };
  } });
  await f.restart(); const p = await f.prepare(); await f.accept(p, { status: 'running', endedAt: undefined });
  const stopped = await f.call({ action: 'stop', flow: p.flowId });
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.attempts[0].cancellation.status, 'confirmed');
  assert.equal(stopped.attempts[0].evidence.error, 'Cancelled by operator.');
});

test('status racing pre-admission authorization releases both attempt and flow custody for a safe retry', async () => {
  const f = fixture(); await f.restart(); const p = await f.prepare();
  const original = f.dependencies.authorize; let raced = false;
  f.dependencies.authorize = async source => {
    if (!raced && f.flows.get(p.flowId).stateJson.attempts[0].phase === 'launching') {
      raced = true;
      const status = (await f.call({ action: 'status' })).flows[0];
      assert.equal(status.phase, 'outcome_unknown');
    }
    return original(source);
  };
  await f.restart();
  assert.equal((await f.spawn(p)).gate.block, true);
  const released = f.flows.get(p.flowId).stateJson;
  assert.equal(released.phase, 'prepared'); assert.equal(released.notice, undefined);
  assert.equal(released.attempts[0].phase, 'prepared'); assert.equal(released.attempts[0].runId, undefined);
  assert.equal(released.deadlineAt, p.deadlineAt); assert.equal(released.attempts.length, 1);
  await f.restart();
  const retry = await f.call({ action: 'delegate', flow: p.flowId, instruction: 'Reuse the unlaunched assignment' });
  assert.equal(retry.task, p.task); assert.equal(retry.attempts.length, 1);
  assert.equal((await f.spawn(retry)).gate.block, undefined); assert.equal(f.cancellations(), 0);
});
