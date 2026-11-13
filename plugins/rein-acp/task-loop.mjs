import { developmentChannelFor, DEVELOPMENT_AUTH_TIMEOUT_MS } from '../rein-router/slack-development.mjs';

const TASK_TOOLS = new Set(['sessions_spawn', 'subagents', 'sessions_send', 'sessions_history', 'sessions_list', 'sessions_search', 'session_status', 'sessions', 'rein_task']);
const ACP_PARAMS = new Set(['task', 'label', 'runtime', 'agentId', 'cwd', 'mode', 'thread', 'streamTo']);
const terminal = value => ['succeeded', 'failed', 'cancelled', 'timed_out', 'lost'].includes(value);
const human = ctx => ctx.trigger === 'user' && (!ctx.inputProvenance || ctx.inputProvenance.kind === 'external_user');
const unwrap = event => event.toolName === 'tool_call'
  ? { name: typeof event.params?.id === 'string' ? event.params.id.replace(/^openclaw:core:/, '') : undefined, params: event.params?.args }
  : { name: event.toolName, params: event.params };
const result = details => {
  const observation = { ok: !['unavailable', 'cancellation_failed', 'change_already_requested'].includes(details.status), ...details };
  return { content: [{ type: 'text', text: JSON.stringify(observation) }], details: observation };
};
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;

/** Validate only the native prerequisites; retain existing tool policies and channel bindings. */
export function assertTaskLoopRuntimeConfig(config, host) {
  const entry = host.plugins?.entries?.['rein-acp'];
  const agent = host.agents?.entries?.[config.channel.agentId] ?? host.agents?.list?.find(a => a.id === config.channel.agentId);
  if (entry?.hooks?.allowConversationAccess !== true || entry.hooks.allowPromptInjection === false || host.tools?.sessions?.visibility !== 'tree')
    throw Error('rein_task_runtime_invalid: grant conversation/prompt hooks and configure native sessions visibility=tree');
  if (!agent || (agent.sandbox?.mode ?? host.agents?.defaults?.sandbox?.mode) !== 'off' ||
      host.acp?.enabled !== true || host.acp.dispatch?.enabled === false || !text(host.acp.backend, 128) ||
      !host.acp.allowedAgents?.includes(config.harnessAgentId))
    throw Error('rein_task_runtime_invalid: configured parent requires native host ACP, an explicit backend and the allowed fixed harness');
}

/** Native records remain authoritative. This module retains only current tool-invocation custody. */
export function createTaskLoop({ config, authorize, tasks, subagent, isNativeChild = () => false, clock = Date.now, timeoutMs = DEVELOPMENT_AUTH_TIMEOUT_MS }) {
  const turns = new Map(), calls = new Map(), reports = new Map();
  const selected = ctx => ctx.agentId === config.channel.agentId;
  const membership = async source => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => authorize(source)).then(value => value === true).catch(() => false),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const validTurn = (turn, ctx) => turn && clock() - turn.at < 3_600_000 && ctx.sessionKey === turn.source.sessionKey &&
    ctx.requester?.senderId === turn.source.senderId && ctx.requester?.channel === turn.source.channel &&
    ctx.requester?.accountId === turn.source.accountId && !ctx.abortSignal?.aborted;
  return {
    async beforeAgentRun(_event, ctx) {
      if (!selected(ctx) || !text(ctx.runId, 512) || !text(ctx.sessionKey, 1024)) return;
      turns.delete(ctx.runId); reports.delete(ctx.runId);
      for (const [id, turn] of turns) if (clock() - turn.at >= 3_600_000) { turns.delete(id); reports.delete(id); }
      if (turns.size >= 256) return { outcome: 'block', reason: 'rein_task_busy', message: 'Task admission is busy.' };
      const provenance = ctx.inputProvenance;
      if (provenance?.kind === 'inter_session' && ['subagent_announce', 'subagent_settle'].includes(provenance.sourceTool) &&
          provenance.sourceSessionKey && ctx.sessionKey) {
        const task = await tasks.async.runs.bindSession({ sessionKey: ctx.sessionKey, agentId: ctx.agentId }).resolve(provenance.sourceSessionKey);
        if (task?.ownerKey === ctx.sessionKey && task.status === 'cancelled') reports.set(ctx.runId, task);
      }
      if (isNativeChild(ctx) || (!human(ctx) && (ctx.trigger || provenance))) {
        turns.set(ctx.runId, { kind: 'native', source: { ...ctx }, at: clock() }); return;
      }
      if (!human(ctx)) return;
      // Other conversations keep their native capabilities and admission policies.
      if (ctx.channel !== 'slack' || ctx.accountId !== config.channel.accountId ||
          (ctx.channelContext?.chat?.id ?? ctx.chatId) !== config.channel.channelId) {
        turns.set(ctx.runId, { kind: 'outside', source: { ...ctx }, at: clock() }); return;
      }
      if (!developmentChannelFor({ developmentChannels: [config.channel] }, ctx) || !await membership(ctx))
        return { outcome: 'block', reason: 'rein_task_membership_required', message: 'Current trusted private-channel membership could not be verified.' };
      turns.set(ctx.runId, { kind: 'interactive', source: { ...ctx }, at: clock() });
    },
    beforePromptBuild(_event, ctx) {
      if (!selected(ctx) || isNativeChild(ctx)) return;
      const old = reports.get(ctx.runId);
      if (old) return { toolsAllow: [], prependContext: `CANCELLED / OLD-SCOPE REPORT for native task ${old.id}, run ${old.runId}. This incoming result cannot satisfy a revised goal. Report available partial results and performed or uncertain external actions from the native evidence and incoming result, clearly labeled cancelled/old scope. Cancellation is not rollback; absence of evidence is uncertainty. Send this report through the existing captured original destination. Do not launch, resume, retry or change work. Native progress: ${JSON.stringify(old.progressSummary ?? null)}; terminal summary: ${JSON.stringify(old.terminalSummary ?? null)}; diagnostic: ${JSON.stringify(old.error ?? null)}.` };
      return { prependContext: `${config.continuation ? 'Native continuation is enabled: use rein_continuation durable goals, review, stop/change and bounded supplements. Combined same-owner/audience replies may represent multiple flows; original thread delivery is not a per-flow guarantee. Legacy rein_task replacement instructions below apply to unmanaged tasks only. ' : ''}For background work follow the nori-task-loop skill. Research uses native sessions_spawn runtime="subagent", mode="run", cleanup="keep", with completionTarget omitted: retain default external original-thread delivery through parent review. ACP uses fixed agentId=${JSON.stringify(config.harnessAgentId)}, cwd=${JSON.stringify(config.cwd)}, mode="run", thread=false, streamTo="parent"; cwd is not an OS security boundary. Native tasks belong to the originating session/audience, not an individual speaker in a shared private channel. Resolve actual runId via rein_task status for canonical task ID. If native acceptance precedes task-record visibility, report the actual accepted run/session and unavailable canonical record; resolve on the next authorized status request or completion, never respawn or invent an ID. Use rein_task stop/change for confirmed cancellation plus replacement; pending/failed cancellation forbids replacement. Report results against current criteria in the original authorized thread. Cancelled/old-scope outcomes must disclose available partial evidence and performed/uncertain actions, never complete the revised goal. Never describe synthetic or missing evidence as verified.` };
    },
    async beforeToolCall(event, ctx) {
      const tool = unwrap(event), turn = turns.get(ctx.runId);
      const acp = tool.name === 'sessions_spawn' && tool.params?.runtime === 'acp';
      const deny = blockReason => ({ block: true, blockReason });
      if (!selected(ctx)) return acp ? deny('ACP task-loop launches require the configured parent.') : undefined;
      if (reports.has(ctx.runId)) return deny('Cancelled/old-scope completion is report-only; preserve evidence without starting work.');
      if (!TASK_TOOLS.has(tool.name)) return;
      if (!turn || clock() - turn.at >= 3_600_000) return deny('Task/session control requires a current host-admitted context.');
      if (turn.kind !== 'interactive') {
        if (tool.name === 'rein_task' || (acp && turn.kind !== 'native')) return deny('Task control requires a current trusted Slack request.');
        // Native background work retains host admission/inheritance; no fake online user is created.
        if (!acp) return;
      } else if (!validTurn(turn, ctx) || !await membership(turn.source) || !validTurn(turn, ctx))
        return { block: true, blockReason: 'Current trusted private-channel membership could not be verified.' };
      let params;
      if (acp) {
        const p = tool.params;
        if (Object.keys(p).some(key => !ACP_PARAMS.has(key)) || !text(p.task, 32000) ||
            (p.agentId !== undefined && p.agentId !== config.harnessAgentId) || (p.cwd !== undefined && p.cwd !== config.cwd) ||
            (p.mode !== undefined && p.mode !== 'run') || (p.thread !== undefined && p.thread !== false) ||
            (p.streamTo !== undefined && p.streamTo !== 'parent')) return deny('Use the configured one-shot ACP harness/cwd and parent progress; overrides are not permitted.');
        params = { ...p, agentId: config.harnessAgentId, cwd: config.cwd, mode: 'run', thread: false, streamTo: 'parent' };
      }
      if (tool.name === 'sessions_spawn' && turn.change) {
        if (!turn.change.replacementTask || turn.change.spawned || tool.params?.task !== turn.change.replacementTask)
          return { block: true, blockReason: 'The changed task cannot launch until native cancellation and run settlement are confirmed; use the exact replacement task returned by rein_task.' };
        const runtime = tool.params?.runtime ?? 'subagent';
        if (runtime !== turn.change.runtime) return { block: true, blockReason: 'Keep the changed task on its original native runtime.' };
        // Compact dispatch also invokes the canonical hook. Reserve only at that inner boundary.
        if (event.toolName !== 'tool_call') turn.change.spawned = true;
      }
      if (tool.name === 'rein_task' && ctx.toolCallId) calls.set(ctx.toolCallId, { turn, ctx });
      if (params) return { params: event.toolName === 'tool_call' ? { ...event.params, args: params } : params };
    },
    // Internal handoff only: the caller must first run this module's admission hook.
    // Never infer replacement authority from model-supplied task text alone.
    confirmedReplacement(event, ctx) {
      const tool = unwrap(event), turn = turns.get(ctx.runId), change = turn?.change;
      if (tool.name !== 'sessions_spawn' || !validTurn(turn, ctx) || !change?.replacementTask ||
          tool.params?.task !== change.replacementTask || (tool.params?.runtime ?? 'subagent') !== change.runtime) return;
      return change.predecessor;
    },
    toolFactory: { contextVersion: 2, create(ctx) {
      if (ctx.agentId !== config.channel.agentId) return null;
      return { name: 'rein_task', label: 'Native task control', description: 'Inspect native task IDs/status; stop native work; explicitly change a goal by cancelling, confirming settlement, then returning instructions for a fresh native spawn. Shared private-session audience collaborates; no outreach.',
        parameters: { type: 'object', additionalProperties: false, required: ['action', 'task'], properties: {
          action: { type: 'string', enum: ['status', 'stop', 'change'] }, task: { type: 'string', minLength: 1, maxLength: 512 },
          goal: { type: 'string', minLength: 1, maxLength: 8000 }, criteria: { type: 'string', minLength: 1, maxLength: 8000 },
        } },
        async execute(toolCallId, args) {
          const call = calls.get(toolCallId); calls.delete(toolCallId);
          const current = async () => {
            ctx.assertInvocationCurrent();
            if (!call || !validTurn(call.turn, call.ctx) || ctx.sessionKey !== call.turn.source.sessionKey ||
                ctx.requesterSenderId !== call.turn.source.senderId || !await membership(call.turn.source)) throw Error('rein_task_authority_unavailable');
            ctx.assertInvocationCurrent();
          };
          await current();
          if (!['status', 'stop', 'change'].includes(args.action) || !text(args.task, 512)) throw Error('rein_task_invalid_input');
          if (args.action === 'change' && (!text(args.goal, 8000) || !text(args.criteria, 8000))) throw Error('rein_task_goal_and_criteria_required');
          const binding = tasks.async.runs.fromToolContext(ctx);
          const task = await binding.resolve(args.task);
          // Never bind to caller-supplied owner/session keys or disclose another session's record.
          if (!task || task.scope !== 'session' || task.ownerKey !== ctx.sessionKey || !['subagent', 'acp'].includes(task.runtime))
            return result({ status: 'unavailable', message: 'Task is unavailable in this authorized session.' });
          await current();
          const identity = { taskId: task.id, runId: task.runId, childSessionKey: task.childSessionKey, runtime: task.runtime,
            partialEvidence: { progress: task.progressSummary, result: task.terminalSummary, taskError: task.error },
            externalActionNotice: 'Cancellation does not roll back performed actions. Missing evidence leaves external outcomes uncertain; inspect before retrying.' };
          if (args.action === 'status') return result({ ...identity, status: task.status, goal: task.title, goalIsSummary: true,
            progress: task.progressSummary || 'No further native progress summary is available.', result: task.terminalSummary,
            taskError: task.error, deliveryStatus: task.deliveryStatus });
          if (args.action === 'change') {
            if (call.turn.change) return result({ ...identity, status: 'change_already_requested', replacementAllowed: false });
            call.turn.change = { runtime: task.runtime };
          }
          if (!task.runId || !task.childSessionKey) return result({ ...identity, status: 'cancellation_failed', replacementAllowed: false, message: 'Native run identity is unavailable.' });
          let cancellation;
          try {
            cancellation = task.status === 'cancelled' ? { cancelled: true } : await tasks.runs.fromToolContext(ctx).cancel({ taskId: task.id, cfg: ctx.getRuntimeConfig?.() ?? ctx.runtimeConfig ?? ctx.config });
          } catch { return result({ ...identity, status: 'cancellation_failed', replacementAllowed: false }); }
          await current();
          const observed = await binding.get(task.id);
          if (!cancellation.cancelled || observed?.status !== 'cancelled') return result({ ...identity, status: 'cancellation_failed',
            replacementAllowed: false, nativeStatus: observed?.status, reason: cancellation.reason || 'Native cancellation was not confirmed.' });
          // A terminal task projection alone is insufficient: ACP cancellation may finish before its turn unwinds.
          let settled;
          try { settled = await subagent.waitForRun({ runId: task.runId, timeoutMs: 1000 }); } catch { /* unavailable is pending, never settled */ }
          await current();
          if (!settled || !['ok', 'error'].includes(settled.status) || !Number.isFinite(settled.endedAt) || settled.yielded ||
              (settled.livenessState && settled.livenessState !== 'finished'))
            return result({ ...identity, status: 'cancellation_pending', nativeStatus: observed.status, replacementAllowed: false,
              message: 'Native cancellation is recorded; the original run has not confirmed settlement. No replacement started.' });
          const final = await binding.get(task.id); await current();
          if (!terminal(final?.status) || final.status !== 'cancelled') return result({ ...identity, status: 'cancellation_failed', replacementAllowed: false, nativeStatus: final?.status });
          if (args.action === 'stop') return result({ ...identity, status: 'cancelled', settled: true, replacementAllowed: false,
            partialEvidence: { progress: final.progressSummary, result: final.terminalSummary, taskError: final.error } });
          const replacementTask = `Goal: ${args.goal.trim()}\nCompletion criteria: ${args.criteria.trim()}\nUser-directed replacement of native task ${task.id}, run ${task.runId}, child ${task.childSessionKey}. Its cancellation and run settlement were observed. This is a new scope: an older result cannot satisfy these criteria. Return the result to the original authorized parent conversation. No outreach is authorized.`;
          call.turn.change.replacementTask = replacementTask;
          call.turn.change.predecessor = { taskId: task.id, runId: task.runId, childSessionKey: task.childSessionKey };
          return result({ ...identity, status: 'cancelled', settled: true, replacementAllowed: true, replacementTask,
            note: 'Cancellation plus fresh delegation, not in-place steer. Start one new native run using replacementTask and the original runtime; report its new IDs.' });
        },
      };
    } },
    agentEnd(_event, ctx) {
      turns.delete(ctx.runId);
      reports.delete(ctx.runId);
      for (const [id, call] of calls) if (call.ctx.runId === ctx.runId) calls.delete(id);
    },
  };
}
