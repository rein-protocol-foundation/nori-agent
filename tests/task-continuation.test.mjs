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
  for (const cancellation of ['failed', 'throws', 'provisional', 'foreign-receipt', 'missing-endedAt', 'succeeded-race']) {
    const f = fixture(); f.dependencies.subagent.waitForRun = async () => ({ status: 'timeout' });
    f.tasks.runs.bindSession = () => ({ cancel: async () => {
      const task = f.native.get('native-task');
      if (cancellation === 'throws') throw Error('transport lost');
      if (cancellation === 'failed') return { found: true, cancelled: false, reason: 'descendant still active' };
      if (!['provisional', 'foreign-receipt'].includes(cancellation)) task.error = 'Cancelled by operator.';
      if (cancellation === 'missing-endedAt') delete task.endedAt;
      if (cancellation === 'succeeded-race') task.status = 'succeeded';
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
