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
