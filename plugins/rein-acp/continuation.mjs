import { createHash } from 'node:crypto';
import { developmentChannelFor } from '../rein-router/slack-development.mjs';

const CONTROLLER = 'rein/task-continuation';
const terminalRun = status => ['succeeded', 'failed', 'cancelled', 'timed_out', 'lost'].includes(status);
const terminalFlow = flow => ['succeeded', 'failed', 'cancelled', 'lost'].includes(flow.status) || flow.endedAt != null;
const string = (value, max = 8000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const unwrap = event => event.toolName === 'tool_call'
  ? { name: event.params?.id?.replace(/^openclaw:core:/, ''), params: event.params?.args }
  : { name: event.toolName, params: event.params };
const output = details => ({ content: [{ type: 'text', text: JSON.stringify(details) }], details });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const last = state => state.attempts.at(-1);

/** Thin native Flow controller. No timers, execution engine, transcript store or delivery ledger. */
export function createTaskContinuation({ config, tasks, subagent, system, session, authorize, isNativeChild, clock = Date.now, logger }) {
  const turns = new Map(), invocations = new Map(), admissions = new Map();
  const selected = ctx => ctx.agentId === config.channel.agentId && !isNativeChild(ctx);
  const flowsFor = sessionKey => tasks.async.managedFlows.bindSession({ sessionKey });
  const runsFor = sessionKey => tasks.async.runs.bindSession({ sessionKey, agentId: config.channel.agentId });
  const originAllowed = origin => origin?.channel === 'slack' && origin.accountId === config.channel.accountId &&
    origin.to?.toLowerCase() === `channel:${config.channel.channelId}`.toLowerCase();
  const owned = (flow, owner) => flow?.syncMode === 'managed' && flow.controllerId === CONTROLLER && flow.ownerKey === owner &&
    flow.stateJson?.version === 1 && originAllowed(flow.requesterOrigin) && flow.stateJson.source?.sessionKey === owner;
  const inventory = () => session.listSessionEntries({ agentId: config.channel.agentId, readOnly: true });
  const sourceCurrent = async (flow, ctx, options = {}) => {
    if (!owned(flow, ctx.sessionKey)) throw Error('rein_continuation_unavailable');
    const entry = options.entry ?? inventory().find(row => row.sessionKey === flow.ownerKey)?.entry;
    if (!entry || entry.sessionId !== flow.stateJson.source.sessionId) throw Error('rein_continuation_session_changed');
    const turn = turns.get(ctx.runId);
    const source = options.source ?? (turn?.human ? turn.source : flow.stateJson.source);
    const key = digest([source.senderId, source.accountId, source.chatId, source.sessionKey]);
    let check = options.checks?.get(key);
    if (!check) { check = Promise.resolve().then(() => authorize(source)); options.checks?.set(key, check); }
    if (!await check) throw Error('rein_continuation_authority_unavailable');
  };
  const persist = async (flow, state, mode = 'setWaiting') => {
    if (['finish', 'fail'].includes(mode) && (!state.report || state.report.outcome === 'continue')) state.report = {
      scopeRevision: state.scopeRevision, outcome: state.phase, evidence: last(state)?.evidence ?? null,
      gaps: state.criteria, effects: 'unknown', at: clock(), delivery: 'pending_or_uncertain',
    };
    const changed = await flowsFor(flow.ownerKey)[mode]({ flowId: flow.flowId, expectedRevision: flow.revision,
      stateJson: state, ...(mode === 'setWaiting' ? { waitJson: { reason: state.phase }, currentStep: state.phase } : {}) });
    if (!changed.applied) throw Error(`rein_continuation_${changed.code}`);
    return changed.flow;
  };
  const ownList = async owner => (await flowsFor(owner).list()).filter(flow => owned(flow, owner));
  const boundReason = state => clock() >= state.deadlineAt ? 'deadline' : state.attempts.length >= state.maxAttempts ? 'attempt_limit' :
    state.noProgress >= state.maxNoProgress ? 'no_progress_limit' : undefined;
  const taskText = (flow, instruction) => `Native flow ${flow.flowId}; scope revision ${flow.stateJson.scopeRevision}; attempt ${flow.stateJson.attempts.length + 1}.\nGoal: ${flow.stateJson.goal}\nCompletion criteria: ${flow.stateJson.criteria}\nBounded assignment: ${instruction}\nReturn evidence, missing criteria, and performed or uncertain external actions to the native parent. No outreach, permission expansion, merge or deployment is authorized by this assignment.`;
  const nativeTask = async flow => {
    const attempt = last(flow.stateJson);
    if (!attempt?.runId) return undefined;
    const task = await runsFor(flow.ownerKey).resolve(attempt.runId);
    return task?.ownerKey === flow.ownerKey && task.scope === 'session' && task.runId === attempt.runId &&
      task.childSessionKey === attempt.childSessionKey && task.runtime === flow.stateJson.runtime ? task : undefined;
  };
  const settled = async runId => {
    if (!runId) return false;
    try {
      const run = await subagent.waitForRun({ runId, timeoutMs: 1000 });
      return ['ok', 'error'].includes(run?.status) && Number.isFinite(run.endedAt) && !run.yielded &&
        (!run.livenessState || run.livenessState === 'finished');
    } catch { return false; }
  };
  async function reconcile(flow, cfg) {
    const wasTerminal = terminalFlow(flow);
    if (wasTerminal && !(flow.stateJson.stopRequested && last(flow.stateJson)?.runId && !terminalRun(last(flow.stateJson)?.nativeStatus))) return flow;
    const originalState = digest(flow.stateJson);
    let state = structuredClone(flow.stateJson), attempt = last(state);
    const task = await nativeTask(flow);
    if (attempt?.phase === 'launching' && !attempt.runId) {
      // A crash between native acceptance and receipt persistence cannot prove whether work ran.
      state.phase = 'outcome_unknown';
      state.notice = 'Launch admission has no durable accepted receipt. Inspect native evidence; no retry is allowed.';
    } else if (attempt?.runId && !task) {
      state.phase = 'outcome_unknown'; state.notice = 'Accepted run has no current owner-bound native task backing; no retry.';
    } else if (task) {
      if (!attempt.linked && !wasTerminal) {
        const linked = await flowsFor(flow.ownerKey).runTask({ flowId: flow.flowId, runtime: task.runtime,
          sourceId: task.sourceId, runId: task.runId, childSessionKey: task.childSessionKey, agentId: task.agentId,
          task: task.title, ...(terminalRun(task.status) ? {} : { status: task.status }), startedAt: task.startedAt });
        if (!linked.created) throw Error(`rein_continuation_link_${linked.reason}`);
        attempt.linked = true;
        flow = await flowsFor(flow.ownerKey).get(flow.flowId);
        // Linking can change native revision; keep the durable stop/scope observed by another turn.
        if (digest(flow.stateJson) !== originalState) return reconcile(flow, cfg);
      }
      attempt.taskId = task.id; attempt.nativeStatus = task.status;
      attempt.evidence = { progress: task.progressSummary ?? null, result: task.terminalSummary ?? null, error: task.error ?? null,
        deliveryStatus: task.deliveryStatus };
      if (state.stopRequested || clock() >= state.deadlineAt) {
        state.stopRequested ||= { at: clock(), reason: 'deadline' };
        if (!terminalRun(task.status)) {
          try { await tasks.runs.bindSession({ sessionKey: flow.ownerKey, agentId: config.channel.agentId }).cancel({ taskId: task.id, cfg }); }
          catch { state.notice = 'Native cancellation failed; execution may still be active.'; }
        }
        const observed = await nativeTask(flow);
        if (terminalRun(observed?.status) && await settled(attempt.runId)) {
          attempt.nativeStatus = observed.status;
          state.phase = state.pendingChange ? 'changed' : 'stopped';
          if (state.pendingChange) {
            state.goal = state.pendingChange.goal; state.criteria = state.pendingChange.criteria;
            state.pendingChange = null; state.stopRequested = null; state.phase = 'ready'; attempt.reviewed = true;
          }
        } else state.phase = 'cancellation_pending';
      } else if (!attempt.reviewed) state.phase = terminalRun(task.status) ? 'review' : 'running';
    } else if (state.stopRequested) {
      state.phase = ['prepared', 'retired'].includes(attempt?.phase) || !attempt ? (state.pendingChange ? 'ready' : 'stopped') : 'outcome_unknown';
      if (state.pendingChange && state.phase === 'ready') {
        state.goal = state.pendingChange.goal; state.criteria = state.pendingChange.criteria; state.pendingChange = null; state.stopRequested = null;
      }
    } else if (boundReason(state) && !attempt) state.phase = 'limited';
    if (state.phase === 'stopped' || state.phase === 'limited' || wasTerminal) return persist(flow, state, 'fail');
    return digest(state) === digest(flow.stateJson) ? flow : persist(flow, state);
  }
  const view = flow => ({ flowId: flow.flowId, nativeStatus: flow.status, ...flow.stateJson,
    origin: flow.requesterOrigin, delivery: 'Native delivery evidence only; parent report receipt is not established by agent_end.' });
  const current = async (ctx, invocation) => {
    ctx.assertInvocationCurrent?.();
    const turn = turns.get(ctx.runId ?? invocation?.runId);
    if (!turn || turn.sessionKey !== ctx.sessionKey || clock() - turn.at > 3_600_000 || ctx.abortSignal?.aborted)
      throw Error('rein_continuation_current_turn_required');
    if (turn.human) {
      if (ctx.requesterSenderId !== undefined && ctx.requesterSenderId !== turn.source.senderId) throw Error('rein_continuation_requester_mismatch');
      if (!await authorize(turn.source)) throw Error('rein_continuation_authority_unavailable');
    }
    ctx.assertInvocationCurrent?.();
    return turn;
  };
  return {
    async beforeAgentRun(_event, ctx) {
      if (!selected(ctx) || !ctx.runId || !ctx.sessionKey) return;
      const human = !!developmentChannelFor({ developmentChannels: [config.channel] }, ctx);
      const native = (ctx.inputProvenance?.kind === 'internal_system' && ctx.inputProvenance.sourceTool === 'background-task') ||
        (ctx.inputProvenance?.kind === 'inter_session' && ['subagent_announce', 'subagent_settle'].includes(ctx.inputProvenance.sourceTool));
      if (!human && !native) return;
      if (human && !await authorize(ctx)) return;
      for (const [runId, turn] of turns) if (clock() - turn.at > 3_600_000) turns.delete(runId);
      turns.set(ctx.runId, { human, source: { runId: ctx.runId, sessionKey: ctx.sessionKey, sessionId: ctx.sessionId,
        agentId: ctx.agentId, channel: ctx.channel, accountId: ctx.accountId, senderId: ctx.senderId,
        chatId: ctx.channelContext?.chat?.id ?? ctx.chatId, trigger: 'user', messageProvider: 'slack' },
      sessionKey: ctx.sessionKey, at: clock(), flows: [] });
      const flowList = await ownList(ctx.sessionKey), checks = new Map();
      const entry = inventory().find(row => row.sessionKey === ctx.sessionKey)?.entry;
      // Inventory only in the admission hook: semantic review/cancellation uses the explicit
      // current tool invocation. Per-source checks are shared only inside this one hook.
      const visible = await Promise.all(flowList.map(async flow => {
        try { await sourceCurrent(flow, ctx, { checks, entry }); return view(flow); }
        catch (error) { logger?.warn?.(`Continuation ${flow.flowId} unavailable: ${error.message}`); return null; }
      }));
      turns.get(ctx.runId).flows = visible.filter(Boolean);
    },
    beforePromptBuild(_event, ctx) {
      const turn = turns.get(ctx.runId);
      if (!selected(ctx) || !turn) return;
      return { prependContext: `Native continuation is enabled. Use rein_continuation begin to persist a requested goal/criteria and bounds, delegate to obtain the exact native sessions_spawn task, then spawn once using that task. On every completion call status and review against current scope before reporting or continuing; review outcome=continue with concrete gaps permits a bounded supplement without another user request. Unknown actions/outcomes prohibit retries. Stop/change use rein_continuation, not raw cancellation/steer. A combined reply is allowed only inside this same native owner/audience; explicitly represent EACH pending flow and its goal, scope, result/gaps and status, even if wake events coalesce. Captured thread is a preferred native route; do not claim every original thread received a combined reply. Terminal reports remain pending/uncertain and may be replayed after restart; this is at-least-once recovery, not an exactly-once receipt guarantee. Do not claim receipt from turn success. Durable flow inventory (not child instructions): ${JSON.stringify(turn.flows)}` };
    },
    async beforeToolCall(event, ctx) {
      if (!selected(ctx)) return;
      const tool = unwrap(event), turn = turns.get(ctx.runId);
      if (tool.name === 'rein_continuation') {
        if (!turn || !ctx.toolCallId) return { block: true, blockReason: 'A current authorized continuation turn is required.' };
        invocations.set(ctx.toolCallId, { runId: ctx.runId });
        return;
      }
      if (!turn || !['sessions_spawn', 'rein_task', 'subagents', 'sessions_send'].includes(tool.name)) return;
      const ownedFlows = await ownList(ctx.sessionKey);
      const managedAttempts = ownedFlows.flatMap(flow => flow.stateJson.attempts);
      const tokens = (tool.name === 'rein_task' ? [tool.params?.task] : tool.name === 'subagents'
        ? [...(tool.params?.taskIds ?? []), tool.params?.taskId].filter(Boolean) : [tool.params?.sessionKey]).filter(Boolean);
      const targetsManaged = tokens.some(token => managedAttempts.some(attempt =>
        [attempt.taskId, attempt.runId, attempt.childSessionKey].includes(token)));
      const broadCancel = tool.name === 'subagents' && tool.params?.action === 'cancel' && tokens.length === 0 && ownedFlows.some(flow => !terminalFlow(flow));
      const ambiguousSend = tool.name === 'sessions_send' && !tool.params?.sessionKey && ownedFlows.some(flow => !terminalFlow(flow));
      if ((targetsManaged && ((tool.name === 'rein_task' && ['stop', 'change'].includes(tool.params?.action)) ||
          (tool.name === 'subagents' && tool.params?.action === 'cancel') || tool.name === 'sessions_send')) || broadCancel || ambiguousSend)
        return { block: true, blockReason: 'Use rein_continuation stop/change for managed work. Ambiguous controls cannot bypass durable stop intent or scope.' };
      if (tool.name !== 'sessions_spawn') return;
      const matches = ownedFlows.filter(flow => !terminalFlow(flow) && last(flow.stateJson)?.phase === 'prepared' && last(flow.stateJson).task === tool.params?.task);
      if (matches.length !== 1) return { block: true, blockReason: 'Persist one flow and obtain its exact bounded assignment from rein_continuation delegate before native spawn.' };
      let flow = matches[0];
      await sourceCurrent(flow, ctx); await current(ctx);
      const state = structuredClone(flow.stateJson), attempt = last(state);
      if (state.stopRequested || clock() >= state.deadlineAt || attempt.scopeRevision !== state.scopeRevision ||
          (tool.params?.runtime ?? 'subagent') !== state.runtime || (tool.params?.mode ?? 'run') !== 'run')
        return { block: true, blockReason: 'Flow stopped, expired, changed scope or runtime; inspect durable status.' };
      // Compact dispatch is checked again at the canonical hook, where custody is reserved.
      if (event.toolName === 'tool_call') return;
      if (!ctx.toolCallId) return { block: true, blockReason: 'Native launch invocation identity unavailable.' };
      attempt.phase = 'launching'; attempt.admittedAt = clock(); state.phase = 'launching';
      flow = await persist(flow, state);
      await sourceCurrent(flow, ctx); await current(ctx);
      const latest = await flowsFor(ctx.sessionKey).get(flow.flowId);
      if (latest.revision !== flow.revision || latest.stateJson.stopRequested || latest.stateJson.scopeRevision !== attempt.scopeRevision)
        return { block: true, blockReason: 'Flow changed before native admission; no replacement or retry.' };
      admissions.set(ctx.toolCallId, { owner: ctx.sessionKey, flowId: flow.flowId, attempt: attempt.number });
      // M1 still validates fixed ACP arguments; research retains native completion delivery.
      if (state.runtime === 'subagent') {
        const remaining = Math.floor((state.deadlineAt - clock()) / 1000);
        if (remaining < 1) return { block: true, blockReason: 'Flow deadline reached before native launch.' };
        const requested = tool.params?.runTimeoutSeconds;
        const params = { ...tool.params, mode: 'run', cleanup: 'keep', runTimeoutSeconds:
          Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, remaining) : remaining };
        delete params.completionTarget;
        return { params };
      }
    },
    async afterToolCall(event, ctx) {
      if (event.toolName !== 'sessions_spawn') return;
      const admission = admissions.get(ctx.toolCallId ?? event.toolCallId);
      if (!admission) return;
      admissions.delete(ctx.toolCallId ?? event.toolCallId);
      let flow = await flowsFor(admission.owner).get(admission.flowId);
      if (!owned(flow, admission.owner)) return;
      const wasTerminal = terminalFlow(flow);
      const state = structuredClone(flow.stateJson), attempt = state.attempts.find(item => item.number === admission.attempt);
      if (!attempt || attempt.phase !== 'launching') return;
      const receipt = event.result?.details;
      if (receipt?.status === 'accepted' && string(receipt.runId, 512) && string(receipt.childSessionKey, 1024)) {
        attempt.runId = receipt.runId; attempt.childSessionKey = receipt.childSessionKey; attempt.phase = 'accepted';
        attempt.acceptedAt = clock(); state.phase = 'running';
      } else {
        attempt.phase = 'unknown'; state.phase = 'outcome_unknown';
        state.notice = 'Native launch returned no validated accepted receipt; effects are uncertain. No automatic retry.';
      }
      if (wasTerminal) state.stopRequested ||= { at: clock(), reason: 'terminal_before_acceptance_receipt' };
      flow = await persist(flow, state, wasTerminal ? 'fail' : 'setWaiting');
      await reconcile(flow, config.hostConfig);
    },
    toolFactory: { contextVersion: 2, create(ctx) {
      if (ctx.agentId !== config.channel.agentId || isNativeChild(ctx)) return null;
      return { name: 'rein_continuation', label: 'Native task continuation',
        description: 'Persist bounded goals in native managed Flows; inspect, delegate, review, stop or revise work within the current authorized owner/audience. No separate scheduler or history store.',
        parameters: { type: 'object', additionalProperties: false, required: ['action'], properties: {
          action: { type: 'string', enum: ['begin', 'status', 'delegate', 'review', 'stop', 'change'] },
          flow: { type: 'string', maxLength: 512 }, goal: { type: 'string', maxLength: 8000 }, criteria: { type: 'string', maxLength: 8000 },
          runtime: { type: 'string', enum: ['subagent', 'acp'] }, instruction: { type: 'string', maxLength: 8000 },
          outcome: { type: 'string', enum: ['complete', 'continue', 'blocked'] }, evidence: { type: 'string', maxLength: 8000 },
          gaps: { type: 'string', maxLength: 8000 }, effects: { type: 'string', enum: ['none', 'confirmed', 'unknown'] },
          scopeRevision: { type: 'integer', minimum: 1 }, progress: { type: 'boolean' },
        } },
        async execute(toolCallId, args) {
          const invocation = invocations.get(toolCallId); invocations.delete(toolCallId);
          if (!invocation) throw Error('rein_continuation_current_invocation_required');
          const turn = await current(ctx, invocation), binding = flowsFor(ctx.sessionKey);
          const assert = async flow => { await current(ctx, invocation); if (flow) await sourceCurrent(flow, ctx, { source: turn.human ? turn.source : undefined }); ctx.assertInvocationCurrent(); };
          if (args.action === 'begin') {
            if (!turn.human || !string(args.goal) || !string(args.criteria) || !['subagent', 'acp'].includes(args.runtime)) throw Error('rein_continuation_goal_criteria_runtime_required');
            if (!originAllowed(ctx.deliveryContext) || !turn.source.sessionId) throw Error('rein_continuation_native_origin_required');
            const active = (await ownList(ctx.sessionKey)).filter(flow => !terminalFlow(flow));
            if (active.length >= config.continuation.maxActiveFlows) throw Error('rein_continuation_capacity');
            await assert();
            const now = clock(), flow = await tasks.async.managedFlows.fromToolContext(ctx).createManaged({ controllerId: CONTROLLER,
              goal: args.goal.trim(), status: 'waiting', stateJson: { version: 1, source: turn.source, goal: args.goal.trim(), criteria: args.criteria.trim(),
                runtime: args.runtime, scopeRevision: 1, phase: 'ready', createdAt: now, deadlineAt: now + config.continuation.maxRuntimeMs,
                maxAttempts: config.continuation.maxAttempts, maxNoProgress: config.continuation.maxNoProgress,
                noProgress: 0, attempts: [], stopRequested: null, pendingChange: null, report: null } });
            await assert(flow); return output(view(flow));
          }
          if (args.action === 'status' && !args.flow) {
            const visible = [];
            for (const flow of await ownList(ctx.sessionKey)) { await assert(flow); visible.push(view(flow)); }
            return output({ flows: visible });
          }
          let flow = await binding.get(args.flow);
          await assert(flow);
          if (!owned(flow, ctx.sessionKey)) throw Error('rein_continuation_unavailable');
          flow = await reconcile(flow, config.hostConfig); await assert(flow);
          if (args.action === 'status') return output(view(flow));
          if (terminalFlow(flow)) return output({ ...view(flow), operation: 'terminal_no_restart' });
          let state = structuredClone(flow.stateJson), attempt = last(state);
          if (args.action === 'stop' || args.action === 'change') {
            if (!turn.human) throw Error('rein_continuation_human_control_required');
            if (args.action === 'change' && (!string(args.goal) || !string(args.criteria))) throw Error('rein_continuation_goal_criteria_required');
            state.stopRequested = { at: clock(), reason: args.action };
            if (args.action === 'change') {
              state.scopeRevision += 1; state.pendingChange = { goal: args.goal.trim(), criteria: args.criteria.trim() };
              state.report = null;
              if (attempt?.phase === 'prepared') attempt.phase = 'retired';
            } else state.pendingChange = null;
            state.phase = 'cancellation_pending';
            flow = await persist(flow, state); await assert(flow);
            return output(view(await reconcile(flow, config.hostConfig)));
          }
          if (args.action === 'delegate') {
            if (state.stopRequested || !['ready', 'prepared'].includes(state.phase)) throw Error('rein_continuation_not_ready');
            if (state.phase === 'prepared') return output({ ...view(flow), task: attempt.task, spawnOnce: true });
            const limit = boundReason(state);
            if (limit) {
              state.phase = 'limited'; state.notice = limit;
              return output(view(await persist(flow, state, 'fail')));
            }
            if (!string(args.instruction)) throw Error('rein_continuation_assignment_required');
            const task = taskText(flow, args.instruction.trim());
            state.attempts.push({ number: state.attempts.length + 1, scopeRevision: state.scopeRevision, phase: 'prepared', task, preparedAt: clock() });
            state.phase = 'prepared'; flow = await persist(flow, state); await assert(flow);
            return output({ ...view(flow), task, spawnOnce: true });
          }
          if (args.action !== 'review' || state.phase !== 'review' || args.scopeRevision !== state.scopeRevision ||
              attempt?.scopeRevision !== state.scopeRevision || !['complete', 'continue', 'blocked'].includes(args.outcome) || !string(args.evidence) || !['none', 'confirmed', 'unknown'].includes(args.effects))
            throw Error('rein_continuation_current_scope_review_required');
          const task = await nativeTask(flow);
          if (!terminalRun(task?.status) || !await settled(task.runId)) throw Error('rein_continuation_run_not_settled');
          await assert(flow);
          const evidenceKey = digest([task.terminalSummary ?? null, task.progressSummary ?? null]);
          state.noProgress = args.progress === true && state.lastEvidenceKey !== evidenceKey ? 0 : state.noProgress + 1;
          state.lastEvidenceKey = evidenceKey;
          attempt.review = { scopeRevision: state.scopeRevision, runId: task.runId, outcome: args.outcome, evidence: args.evidence.trim(),
            gaps: args.gaps?.trim() || null, effects: args.effects, at: clock(), delivery: 'pending_or_uncertain' };
          state.report = attempt.review;
          attempt.reviewed = true;
          if (args.outcome === 'complete' && task.status === 'succeeded' && task.terminalOutcome !== 'blocked' && args.effects !== 'unknown' && !args.gaps?.trim()) {
            state.phase = 'complete'; return output(view(await persist(flow, state, 'finish')));
          }
          if (args.outcome === 'continue' && string(args.gaps) && args.effects !== 'unknown' && !boundReason(state)) {
            state.phase = 'ready'; flow = await persist(flow, state); await assert(flow);
            return output({ ...view(flow), next: 'delegate one supplement for the recorded gaps; preserve budgets and current scope' });
          }
          state.phase = args.effects === 'unknown' ? 'outcome_unknown' : 'limited';
          state.notice = boundReason(state) ?? 'Review did not establish completion or safe bounded continuation.';
          return output(view(await persist(flow, state, 'fail')));
        },
      };
    } },
    async gatewayStart(_event, ctx) {
      const checks = new Map();
      await Promise.all(inventory().filter(row => !isNativeChild({ sessionKey: row.sessionKey })).map(async ({ sessionKey, entry }) => {
        const flows = (await ownList(sessionKey)).filter(flow => !terminalFlow(flow) || flow.stateJson.report);
        const visible = (await Promise.all(flows.map(async flow => {
          try { await sourceCurrent(flow, { sessionKey }, { checks, entry }); return flow; }
          catch (error) { logger?.warn?.(`Continuation recovery ${flow.flowId} unavailable: ${error.message}`); return null; }
        }))).filter(Boolean);
        if (!visible.length) return;
        ctx.abortSignal?.throwIfAborted();
        // One hint per native owner; durable inventory represents every task even if
        // host events coalesce or the native event queue drops older hints.
        system.enqueueSystemEvent(`Native continuation reconciliation required for flows ${visible.map(flow => flow.flowId).join(', ')}. Read ALL current owner flows via rein_continuation status before work or reporting.`,
          { sessionKey, agentId: config.channel.agentId, contextKey: 'rein-continuation-recovery', deliveryContext: visible[0].requesterOrigin });
        system.requestHeartbeat({ source: 'background-task', intent: 'immediate', reason: 'rein-continuation-recovery', agentId: config.channel.agentId, sessionKey });
      }));
    },
    agentEnd(_event, ctx) {
      turns.delete(ctx.runId);
      for (const [key, value] of invocations) if (value.runId === ctx.runId) invocations.delete(key);
      // No inferred delivery acknowledgement and no independent wake/retry loop.
    },
  };
}
