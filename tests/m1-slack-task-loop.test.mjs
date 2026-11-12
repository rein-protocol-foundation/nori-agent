import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskLoop, assertTaskLoopRuntimeConfig } from '../plugins/rein-acp/task-loop.mjs';
import { selectM1ModelInput } from './fixtures/m1-model-input.mjs';
import { readFileSync } from 'node:fs';

const config = { channel: { agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1' }, harnessAgentId: 'codex', cwd: '/tmp/m1-coding' };
const source = (delta = {}) => ({ runId: 'human-run', agentId: 'main', sessionKey: 'agent:main:slack:channel:cfixture1', sessionId: 'session',
  channel: 'slack', accountId: 'default', chatId: 'CFIXTURE1', senderId: 'UALICE01', trigger: 'user', ...delta });
const toolContext = src => ({ runId: src.runId, agentId: src.agentId, sessionKey: src.sessionKey, requester: { channel: src.channel, accountId: src.accountId, senderId: src.senderId }, toolCallId: 'call-1' });
function fixture(options = {}) {
  const src = source(options.source), native = { id: 'native-task', runId: 'native-run', childSessionKey: 'agent:main:subagent:child',
    runtime: 'subagent', scope: 'session', ownerKey: src.sessionKey, title: 'Goal: shortlist two candidates\nCriteria: sources, fit, eligibility/unknown, priority',
    status: 'running', progressSummary: 'Examining candidate sources', deliveryStatus: 'pending', ...options.task };
  let member = true, current = true, wait = options.wait ?? { status: 'error', endedAt: 123 }, cancellations = 0;
  const binding = { resolve: async token => token === native.id || token === native.runId ? { ...native } : undefined,
    get: async () => ({ ...native }), cancel: async () => { cancellations++; if (options.cancel) return options.cancel(native); native.status = 'cancelled'; return { cancelled: true }; } };
  const runtime = createTaskLoop({ config, authorize: async () => member, tasks: { async: { runs: { fromToolContext: () => binding, bindSession: () => ({ ...binding, resolve: async token => token === native.childSessionKey ? { ...native } : undefined }) } }, runs: { fromToolContext: () => binding } },
    subagent: { waitForRun: async () => typeof wait === 'function' ? wait() : wait }, timeoutMs: 10 });
  const factoryCtx = { agentId: src.agentId, sessionKey: src.sessionKey, requesterSenderId: src.senderId,
    config: {}, assertInvocationCurrent() { if (!current) throw Error('invocation closed'); } };
  const tool = runtime.toolFactory.create(factoryCtx);
  return { runtime, native, src, tool, setMember: value => { member = value; }, expire: () => { current = false; },
    setWait: value => { wait = value; }, cancellations: () => cancellations,
    async call(args, delta = {}) {
      const ctx = { ...toolContext(src), ...delta };
      const gate = await runtime.beforeToolCall({ toolName: 'rein_task', params: args }, ctx);
      if (gate?.block) return gate;
      return (await tool.execute(ctx.toolCallId, args)).details;
    },
  };
}
test('shared private audience: a second current member controls the same native owner session', async () => {
  const f = fixture({ source: { senderId: 'UBOB0001' } });
  assert.equal(await f.runtime.beforeAgentRun({}, f.src), undefined);
  const status = await f.call({ action: 'status', task: 'native-run' });
  assert.equal(status.taskId, 'native-task'); assert.equal(status.runId, 'native-run');
  assert.equal(status.progress, 'Examining candidate sources'); assert.match(status.goal, /eligibility/);
  assert.equal((await f.call({ action: 'stop', task: 'native-task' })).status, 'cancelled');
});
test('nonmember and revoked member cannot read, change or stop, including compact envelopes', async () => {
  const f = fixture(); f.setMember(false);
  assert.equal((await f.runtime.beforeAgentRun({}, f.src)).outcome, 'block');
  f.setMember(true); await f.runtime.beforeAgentRun({}, f.src); f.setMember(false);
  for (const name of ['rein_task', 'subagents', 'sessions_send', 'sessions_spawn', 'sessions_history', 'sessions_list', 'sessions_search', 'session_status', 'sessions']) {
    for (const compact of [false, true]) assert.equal((await f.runtime.beforeToolCall(compact
      ? { toolName: 'tool_call', params: { id: `openclaw:core:${name}`, args: { action: 'cancel', taskId: 'native-task' } } }
      : { toolName: name, params: { action: 'cancel', taskId: 'native-task' } }, toolContext(f.src))).block, true);
  }
  assert.equal(f.cancellations(), 0);
});
test('foreign native owner is unavailable before reads return content or cancellation starts', async () => {
  for (const ownerKey of ['agent:main:slack:channel:other', 'agent:main:slack:dm:alice', 'agent:other:slack:channel:cfixture1']) {
    const f = fixture({ task: { ownerKey } }); await f.runtime.beforeAgentRun({}, f.src);
    for (const action of ['status', 'stop', 'change']) {
      const response = await f.call({ action, task: 'native-task', goal: 'new goal', criteria: 'new criteria' });
      assert.equal(response.status, 'unavailable'); assert.equal(response.goal, undefined);
    }
    assert.equal(f.cancellations(), 0);
  }
});
test('other account/channel/session, forged requester and senderless tool cannot acquire task control', async () => {
  for (const delta of [{ accountId: 'other' }, { chatId: 'COTHER01' }, { channel: 'discord' }, { trigger: 'cron' }]) {
    const f = fixture({ source: delta }); await f.runtime.beforeAgentRun({}, f.src);
    assert.equal((await f.call({ action: 'status', task: 'native-task' })).block, true);
  }
  const f = fixture(); await f.runtime.beforeAgentRun({}, f.src);
  for (const delta of [{ sessionKey: 'other' }, { runId: 'foreign' }, { requester: { channel: 'slack', accountId: 'default', senderId: 'UFORGED1' } }])
    assert.equal((await f.call({ action: 'stop', task: 'native-task' }, delta)).block, true);
  assert.equal(f.cancellations(), 0);
});
test('native cancelled projection without settled Gateway run keeps cancellation pending and blocks replacement', async () => {
  for (const wait of [{ status: 'pending' }, { status: 'timeout' }, { status: 'ok' }, { status: 'ok', endedAt: 10, yielded: true }, { status: 'error', endedAt: 10, livenessState: 'paused' }]) {
    const f = fixture({ wait }); await f.runtime.beforeAgentRun({}, f.src);
    assert.equal((await f.call({ action: 'change', task: 'native-task', goal: 'new', criteria: 'sources' })).status, 'cancellation_pending');
    assert.equal((await f.runtime.beforeToolCall({ toolName: 'sessions_spawn', params: { task: 'replacement' } }, toolContext(f.src))).block, true);
  }
});
test('failed native cancellation does not mutate goal or authorize any replacement', async () => {
  const f = fixture({ cancel: async () => ({ cancelled: false, reason: 'backend refused' }) }); await f.runtime.beforeAgentRun({}, f.src);
  const response = await f.call({ action: 'change', task: 'native-task', goal: 'new', criteria: 'sources' });
  assert.equal(response.status, 'cancellation_failed'); assert.equal(response.replacementAllowed, false); assert.match(response.reason, /refused/);
  assert.equal(f.native.status, 'running');
  assert.equal((await f.runtime.beforeToolCall({ toolName: 'sessions_spawn', params: { task: 'new' } }, toolContext(f.src))).block, true);
});
test('confirmed change returns explicit old/new scope and permits one exact same-runtime spawn', async () => {
  for (const runtime of ['subagent', 'acp']) {
    const f = fixture({ task: { runtime } }); await f.runtime.beforeAgentRun({}, f.src);
    const response = await f.call({ action: 'change', task: 'native-task', goal: 'new goal', criteria: 'two sources' });
    assert.equal(response.replacementAllowed, true); assert.equal(response.settled, true); assert.equal(response.ok, true);
    assert.match(response.replacementTask, /native-task, run native-run/); assert.match(response.replacementTask, /older result cannot satisfy/);
    for (const task of ['new goal', 'old scope']) assert.equal((await f.runtime.beforeToolCall({ toolName: 'sessions_spawn', params: { task, runtime } }, toolContext(f.src))).block, true);
    const admitted = await f.runtime.beforeToolCall({ toolName: 'sessions_spawn', params: { task: response.replacementTask, runtime } }, toolContext(f.src));
    if (runtime === 'acp') assert.equal(admitted.params.cwd, config.cwd); else assert.equal(admitted, undefined);
    assert.equal((await f.runtime.beforeToolCall({ toolName: 'sessions_spawn', params: { task: response.replacementTask, runtime } }, toolContext(f.src))).block, true);
  }
});
test('native completion wins a cancellation race; it cannot become cancelled or authorize replacement', async () => {
  const f = fixture({ cancel: async task => { task.status = 'succeeded'; return { cancelled: false, reason: 'Task became succeeded while cancellation was in progress.' }; } });
  await f.runtime.beforeAgentRun({}, f.src);
  const response = await f.call({ action: 'change', task: 'native-run', goal: 'new', criteria: 'new' });
  assert.equal(response.nativeStatus, 'succeeded'); assert.equal(response.replacementAllowed, false);
});
test('revocation or retired invocation during cancellation prevents replacement and result disclosure', async () => {
  for (const revoke of ['membership', 'invocation']) {
    let f;
    f = fixture({ wait: async () => { if (revoke === 'membership') f.setMember(false); else f.expire(); return { status: 'error', endedAt: 123 }; } });
    await f.runtime.beforeAgentRun({}, f.src);
    await assert.rejects(f.call({ action: 'change', task: 'native-task', goal: 'new', criteria: 'new' }), /authority_unavailable|invocation closed/);
  }
});
test('cancelled completion remains a report with partial/uncertain action evidence, without admitting work or rejecting delivery', async () => {
  const f = fixture({ task: { status: 'cancelled', progressSummary: 'Artifact prepared; external send outcome uncertain', terminalSummary: 'Partial validation only' } });
  const reply = { ...f.src, senderId: undefined, inputProvenance: { kind: 'inter_session', sourceTool: 'subagent_announce', sourceSessionKey: f.native.childSessionKey } };
  const gate = await f.runtime.beforeAgentRun({}, reply);
  assert.equal(gate, undefined, 'normal native completion delivery is not rejected/retried');
  const prompt = f.runtime.beforePromptBuild({}, reply);
  assert.deepEqual(prompt.toolsAllow, []); assert.match(prompt.prependContext, /CANCELLED \/ OLD-SCOPE REPORT/);
  assert.match(prompt.prependContext, /Artifact prepared; external send outcome uncertain/);
  assert.match(prompt.prependContext, /cannot satisfy a revised goal/);
  for (const name of ['sessions_spawn', 'sessions_send', 'exec'])
    assert.equal((await f.runtime.beforeToolCall({ toolName: name, params: {} }, toolContext(reply))).block, true);
  f.runtime.agentEnd({}, reply);
  await f.runtime.beforeAgentRun({}, f.src);
  for (const name of ['read', 'exec', 'web_fetch', 'message']) assert.equal(await f.runtime.beforeToolCall({ toolName: name, params: {} }, toolContext(f.src)), undefined);
});
test('stop and status preserve partial evidence and explicitly disclose uncertainty rather than implying rollback', async () => {
  const f = fixture({ task: { progressSummary: 'Synthetic artifact prepared; external outcome uncertain' } });
  await f.runtime.beforeAgentRun({}, f.src);
  for (const action of ['status', 'stop']) {
    const observed = await f.call({ action, task: 'native-run' });
    assert.match(observed.partialEvidence.progress, /artifact prepared/);
    assert.match(observed.externalActionNotice, /does not roll back/);
  }
});
test('synthetic model decodes current native completion without replaying historical intake/status tags', () => {
  const history = [{ role: 'user', content: 'M1_RESEARCH_START' }, { role: 'assistant', content: 'Accepted.' },
    { role: 'user', content: 'M1_RESEARCH_STATUS' }, { role: 'assistant', content: 'Still running.' }];
  const internal = text => ({ role: 'user', content: [{ type: 'text', text: `<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\n${text}\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>` }] });
  assert.equal(selectM1ModelInput([...history, internal('A background task completed.\n[Internal task completion event]\nsource: subagent\nM1_SHORTLIST_DATA')]).tag, 'M1_RESEARCH_COMPLETION');
  assert.equal(selectM1ModelInput([...history, internal('A background task completed.\n[Internal task completion event]\nsource: acp\nM1_ACP_RESULT')]).tag, 'M1_ACP_COMPLETION');
  assert.equal(selectM1ModelInput([...history, { role: 'user', content: [{ type: 'text', text: 'M1_UNRELATED_CHAT' }, ...internal('Historical task M1_RESEARCH_START').content] }]).tag, 'M1_UNRELATED_CHAT');
});

test('fixed ACP parameters are filled on both compact/canonical calls; forbidden overrides never widen authority', async () => {
  const f = fixture(); await f.runtime.beforeAgentRun({}, f.src);
  const args = { runtime: 'acp', task: 'bounded task' }, canonical = { toolName: 'sessions_spawn', params: args };
  const compact = params => ({ toolName: 'tool_call', params: { id: 'openclaw:core:sessions_spawn', args: params } });
  const outer = await f.runtime.beforeToolCall(compact(args), toolContext(f.src));
  const inner = await f.runtime.beforeToolCall({ ...canonical, params: outer.params.args }, toolContext(f.src));
  assert.deepEqual(inner.params, { ...args, agentId: 'codex', cwd: config.cwd, mode: 'run', thread: false, streamTo: 'parent' });
  for (const delta of [{ agentId: 'other' }, { cwd: '/private' }, { mode: 'session' }, { thread: true }, { streamTo: 'other' }, { model: 'other' }, { resumeSessionId: 'old' }, { completionTarget: 'other' }, { attachments: [] }]) {
    for (const event of [{ ...canonical, params: { ...args, ...delta } }, compact({ ...args, ...delta })])
      assert.equal((await f.runtime.beforeToolCall(event, toolContext(f.src))).block, true);
  }
  for (const name of ['read', 'write', 'exec', 'process']) assert.equal(await f.runtime.beforeToolCall({ toolName: name, params: {} }, toolContext(f.src)), undefined);
});

test('task-loop startup checks native ACP prerequisites without rewriting tools, commands or main/development bindings', () => {
  const host = { plugins: { entries: { 'rein-acp': { hooks: { allowConversationAccess: true } } } }, tools: { sessions: { visibility: 'tree' } },
    agents: { entries: { main: { sandbox: { mode: 'off' }, tools: { profile: 'full' } }, 'nori-development': { sandbox: { mode: 'all' } } } },
    commands: { allowFrom: { slack: ['UALICE01'] } }, bindings: [{ agentId: 'main', match: { channel: 'slack', peer: { id: 'CMAIN001' } } }, { agentId: 'nori-development', match: { channel: 'slack', peer: { id: 'CDEVEL01' } } }],
    acp: { enabled: true, backend: 'acpx', allowedAgents: ['codex'] } };
  const original = structuredClone(host); assert.doesNotThrow(() => assertTaskLoopRuntimeConfig(config, host)); assert.deepEqual(host, original);
  for (const mutate of [h => { h.acp.enabled = false; }, h => { h.acp.dispatch = { enabled: false }; }, h => { delete h.acp.backend; }, h => { h.acp.allowedAgents = ['other']; }, h => { h.agents.entries.main.sandbox.mode = 'all'; }]) {
    const invalid = structuredClone(host); mutate(invalid); assert.throws(() => assertTaskLoopRuntimeConfig(config, invalid), /rein_task_runtime_invalid/);
  }
});

test('unavailable interactive context fails closed on task/session tools; host-admitted native background retains its tools', async () => {
  const f = fixture();
  for (const name of ['rein_task', 'sessions_history', 'sessions_list', 'sessions_search', 'subagents', 'sessions_spawn'])
    assert.equal((await f.runtime.beforeToolCall({ toolName: name, params: {} }, toolContext(f.src))).block, true);
  const native = source({ trigger: 'cron', senderId: undefined, runId: 'native-cron', sessionKey: 'agent:main:cron:job' });
  await f.runtime.beforeAgentRun({}, native);
  for (const name of ['sessions_history', 'subagents']) assert.equal(await f.runtime.beforeToolCall({ toolName: name, params: {} }, toolContext(native)), undefined);
  assert.equal((await f.runtime.beforeToolCall({ toolName: 'rein_task', params: {} }, toolContext(native))).block, true);
  const acp = await f.runtime.beforeToolCall({ toolName: 'sessions_spawn', params: { runtime: 'acp', task: 'native admitted bounded task' } }, toolContext(native));
  assert.equal(acp.params.cwd, config.cwd);
});

test('shared runtime isolates genuinely concurrent turns and atomically admits one replacement after membership awaits', async () => {
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const cancelGate = deferred(), cancelEntered = deferred();
  const a = source({ runId: 'turn-a' }), b = source({ runId: 'turn-b', senderId: 'UBOB0001', sessionKey: 'agent:main:slack:channel:cfixture1:thread:2' });
  const rows = [a, b].map((src, i) => ({ id: `task-${i}`, runId: `run-${i}`, childSessionKey: `agent:main:subagent:child-${i}`, runtime: 'subagent', scope: 'session', ownerKey: src.sessionKey, status: 'running', title: `goal-${i}` }));
  const bind = ctx => ({ resolve: async token => rows.find(r => r.ownerKey === ctx.sessionKey && [r.id, r.runId].includes(token)), get: async id => rows.find(r => r.ownerKey === ctx.sessionKey && r.id === id),
    cancel: async ({ taskId }) => { cancelEntered.resolve(); await cancelGate.promise; const row = rows.find(r => r.id === taskId); row.status = 'cancelled'; return { cancelled: true }; } });
  let authGate, waiting = 0; const bothWaiting = deferred();
  const r = createTaskLoop({ config, authorize: async () => { if (authGate) { if (++waiting === 2) bothWaiting.resolve(); await authGate.promise; } return true; },
    tasks: { async: { runs: { fromToolContext: bind } }, runs: { fromToolContext: bind } }, subagent: { waitForRun: async () => ({ status: 'error', endedAt: 123 }) }, timeoutMs: 1000 });
  await Promise.all([r.beforeAgentRun({}, a), r.beforeAgentRun({}, b)]);
  const invoke = async (src, id, args) => {
    const ctx = { ...toolContext(src), toolCallId: id };
    await r.beforeToolCall({ toolName: 'rein_task', params: args }, ctx);
    return (await r.toolFactory.create({ agentId: src.agentId, sessionKey: src.sessionKey, requesterSenderId: src.senderId, config: {}, assertInvocationCurrent() {} }).execute(id, args)).details;
  };
  const changing = invoke(a, 'change', { action: 'change', task: 'run-0', goal: 'new goal', criteria: 'new criteria' });
  await cancelEntered.promise;
  const ordinary = await invoke(b, 'status', { action: 'status', task: 'run-1' });
  assert.equal(ordinary.status, 'running'); assert.equal(rows[1].status, 'running');
  cancelGate.resolve(); const changed = await changing; assert.equal(changed.replacementAllowed, true);
  const spawn = { toolName: 'sessions_spawn', params: { task: changed.replacementTask } };
  const wrapped = { toolName: 'tool_call', params: { id: 'sessions_spawn', args: spawn.params } };
  assert.equal(await r.beforeToolCall(wrapped, { ...toolContext(a), toolCallId: 'compact' }), undefined);
  authGate = deferred();
  const race = Promise.all([r.beforeToolCall(spawn, { ...toolContext(a), toolCallId: 'compact' }), r.beforeToolCall(spawn, { ...toolContext(a), toolCallId: 'racer' })]);
  await bothWaiting.promise; authGate.resolve(); const outcomes = await race; authGate = undefined;
  assert.equal(outcomes.filter(value => value?.block).length, 1); assert.equal(outcomes.filter(value => value === undefined).length, 1);
  assert.equal((await r.beforeToolCall(wrapped, toolContext(a))).block, true);
  assert.equal((await invoke(b, 'status-again', { action: 'status', task: 'run-1' })).status, 'running');
});

test('instructed research receipt preserves default parent review delivery instead of parent-only silence', () => {
  const skill = readFileSync(new URL('../workspace/skills/nori-task-loop/SKILL.md', import.meta.url), 'utf8');
  assert.ok(!skill.includes('completionTarget="parent"')); assert.match(skill, /Do not select parent-only silent delivery/);
  const f = fixture(); assert.match(f.runtime.beforePromptBuild({}, f.src).prependContext, /completionTarget omitted/);
});


test('synthetic decoder keeps an active tool turn through native progress context, but never replays it for a fresh background turn', () => {
  const prior = [{ role: 'user', content: 'M1_ACP_CHANGE_SETTLED' }, { role: 'assistant', content: 'accepted', tool_calls: [{ id: 'new-run' }] }];
  const progress = { role: 'user', content: 'Native progress notification: synthetic ACP inspecting task.' };
  assert.equal(selectM1ModelInput([...prior, progress, { role: 'tool', content: 'accepted native run' }]).tag, 'M1_ACP_CHANGE_SETTLED');
  assert.equal(selectM1ModelInput([...prior, { role: 'tool', content: 'accepted native run' }, progress]).tag, 'M1_ACP_CHANGE_SETTLED');
  assert.equal(selectM1ModelInput([...prior, { role: 'tool', content: 'accepted native run' }, { role: 'assistant', content: 'Finished this human turn.' }, progress]).tag, 'M1_OTHER');
});

test('raw completion injected after spawn preserves the active status query; fresh completion cannot replay it', () => {
  const human = { role: 'user', content: 'M1_ACP_CHANGE_SETTLED' };
  const spawn = { role: 'assistant', tool_calls: [{ id: 'spawn-replacement' }] };
  const completed = { role: 'user', content: '[Thu fixture] [[OPENCLAW_INTERNAL_CONTEXT_BEGIN]]\n[Internal task completion event]\nsession_key: agent:codex:acp:old\ntask: m1-acp-slow\nM1_ACP_RESULT\nStats: fixture\n[[OPENCLAW_INTERNAL_CONTEXT_END]]' };
  const metadata = { role: 'user', content: [{ type: 'text', text: '<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nHistorical task inventory\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>' }] };
  const active = [human, spawn, { role: 'tool', content: 'accepted native replacement' }, completed, metadata];
  assert.deepEqual(selectM1ModelInput(active), { at: 0, tag: 'M1_ACP_CHANGE_SETTLED' });
  const interleaved = [human, spawn, { role: 'tool', content: 'cancelled and settled' }, completed,
    { role: 'assistant', tool_calls: [{ id: 'replacement' }] }, { role: 'tool', content: 'accepted new run' }, metadata];
  assert.deepEqual(selectM1ModelInput(interleaved), { at: 0, tag: 'M1_ACP_CHANGE_SETTLED' });
  const fresh = [human, spawn, { role: 'tool', content: 'accepted' }, { role: 'assistant', content: 'New task IDs reported.' }, completed, metadata];
  assert.deepEqual(selectM1ModelInput(fresh), { at: 4, tag: 'M1_ACP_COMPLETION', sourceSessionKey: 'agent:codex:acp:old' });
  const firstInference = [...fresh.slice(0, 4), { role: 'user', content: 'M1_RESEARCH_STOP' }, completed, metadata];
  assert.deepEqual(selectM1ModelInput(firstInference), { at: 4, tag: 'M1_RESEARCH_STOP' });
});
