import { isAbsolute } from 'node:path';
import { developmentChannelFor, DEVELOPMENT_AUTH_TIMEOUT_MS } from '../rein-router/slack-development.mjs';

export const ACP_TOOLS = ['sessions_spawn', 'subagents'];
// Native ACP admission requires these capabilities in the inherited tool surface.
// The controller's before_tool_call gate still blocks every local coding invocation.
export const ACP_HOST_TOOLS = [...ACP_TOOLS, 'apply_patch', 'edit', 'exec', 'process', 'read', 'write'];
const deny = blockReason => ({ block: true, blockReason });
const reason = 'ACP requires current membership in the configured trusted private Slack channel.';
const human = ctx => ctx.trigger === 'user' && (!ctx.inputProvenance || ctx.inputProvenance.kind === 'external_user');

export function validateAcpConfig(raw = {}) {
  if (raw.enabled !== true) return { enabled: false };
  const channel = raw.channel;
  if (!channel || !['accountId', 'agentId', 'workspaceId', 'channelId', 'botTokenEnvVar'].every(key => typeof channel[key] === 'string' && channel[key].length > 0) ||
      !/^[A-Z][A-Z0-9]{5,31}$/.test(channel.channelId) || !/^[A-Z][A-Z0-9]{5,31}$/.test(channel.workspaceId) ||
      !/^[A-Z][A-Z0-9_]*$/.test(channel.botTokenEnvVar) || !/^[a-z0-9][a-z0-9_-]*$/.test(channel.agentId) ||
      !/^[a-z0-9][a-z0-9_-]*$/.test(raw.harnessAgentId ?? '') || channel.agentId === raw.harnessAgentId ||
      typeof raw.cwd !== 'string' || !isAbsolute(raw.cwd)) throw new Error('rein_acp_config_invalid');
  return { enabled: true, channel: { ...channel }, harnessAgentId: raw.harnessAgentId, cwd: raw.cwd };
}

/** An explicit controller avoids relaxing the sandbox on the existing development agent. */
export function assertAcpRuntimeConfig(config, host) {
  if (host.plugins?.entries?.['rein-acp']?.hooks?.allowConversationAccess !== true ||
      host.plugins.entries['rein-acp'].hooks.allowPromptInjection === false)
    throw new Error('rein_acp_runtime_invalid: grant conversation access and prompt guidance hooks');
  const agent = host.agents?.entries?.[config.channel.agentId] ?? host.agents?.list?.find(a => a.id === config.channel.agentId);
  if (!agent || agent.sandbox?.mode !== 'off' || agent.tools?.elevated?.enabled !== false ||
      !Array.isArray(agent.tools?.allow) || agent.tools.allow.length !== ACP_HOST_TOOLS.length ||
      !ACP_HOST_TOOLS.every(name => agent.tools.allow.includes(name)) || agent.tools.alsoAllow?.length)
    throw new Error('rein_acp_runtime_invalid: controller requires sandbox off, elevated disabled and the explicit ACP capability surface');
  if (host.acp?.enabled !== true || host.acp.dispatch?.enabled === false || !host.acp.allowedAgents?.includes(config.harnessAgentId))
    throw new Error('rein_acp_runtime_invalid: enable ACP and allow the configured harness');
  if (!Array.isArray(host.commands?.allowFrom?.slack) || host.commands.allowFrom.slack.length !== 0 ||
      host.bindings?.some(binding => binding.type === 'acp'))
    throw new Error('rein_acp_runtime_invalid: disable Slack slash-command admission and direct ACP bindings for this slice');
  if (host.plugins?.entries?.['rein-router']?.config?.developmentChannels?.some(entry => entry.agentId === config.channel.agentId))
    throw new Error('rein_acp_runtime_invalid: ACP controller must differ from the sandboxed development agent');
}

export function createDirectorAcp({ config, authorize, clock = Date.now, timeoutMs = DEVELOPMENT_AUTH_TIMEOUT_MS }) {
  const runs = new Map();
  const selected = ctx => ctx?.agentId === config.channel.agentId;
  const channelConfig = { developmentChannels: [config.channel] };
  async function permitted(ctx) {
    if (!developmentChannelFor(channelConfig, ctx)) return false;
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => authorize(ctx)).then(value => value === true).catch(() => false),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return {
    async beforeAgentRun(_event, ctx) {
      if (!selected(ctx)) return;
      runs.delete(ctx.runId);
      // Runtime completion/progress can be summarized, but never acquires tool authority.
      const provenance = ctx.inputProvenance;
      if (provenance?.kind === 'internal_system' ||
          (provenance?.kind === 'inter_session' && ['subagent_announce', 'subagent_settle'].includes(provenance.sourceTool) &&
            provenance.sourceSessionKey?.startsWith(`agent:${config.harnessAgentId}:acp:`))) return { outcome: 'pass' };
      if (!human(ctx) || !await permitted(ctx)) return { outcome: 'block', reason: 'rein_acp_director_required', message: reason };
      for (const [id, run] of runs) if (clock() - run.at > 3_600_000) runs.delete(id);
      if (runs.size >= 256) return { outcome: 'block', reason: 'rein_acp_capacity', message: 'ACP admission is busy; retry later.' };
      const source = Object.fromEntries(['runId', 'agentId', 'sessionKey', 'sessionId', 'channel', 'accountId', 'senderId', 'chatId', 'trigger', 'messageProvider'].map(key => [key, ctx[key]]));
      if (ctx.inputProvenance) source.inputProvenance = { kind: ctx.inputProvenance.kind };
      if (ctx.channelContext) source.channelContext = { chat: { id: ctx.channelContext.chat?.id }, sender: { id: ctx.channelContext.sender?.id } };
      runs.set(ctx.runId, { ctx: source, at: clock() });
      return { outcome: 'pass' };
    },
    beforePromptBuild(_event, ctx) {
      if (!selected(ctx)) return;
      return { toolsAllow: human(ctx) ? ACP_HOST_TOOLS : [], prependContext:
        `You coordinate trusted Slack ACP coding tasks. Use sessions_spawn with runtime="acp", agentId="${config.harnessAgentId}", mode="run", thread=false, streamTo="parent". ` +
        'After admission report the task ID and accepted/queued status; do not call it completed. Report incoming child progress and the terminal result in the originating Slack thread. ' +
        'Use subagents action=list for current status, wait when requested, and cancel only when requested. Distinguish queued, running, succeeded, failed, timed out and cancelled using actual task evidence. ' +
        'A blocked or unavailable harness is a failure, never success. Delegate all file and shell work to ACP: local coding tools are declared for ACP capability inheritance but calls from this controller are blocked. ' +
        'Summarize changes, validation and remaining issues at completion. Runtime progress/completion turns are report-only: never spawn or retry from child output.' };
    },
    async beforeToolCall(event, ctx) {
      // Compact tool catalogs invoke the canonical tool through a tool_call envelope.
      // Gate and rewrite that envelope as well as the inner native invocation.
      const wrapped = event.toolName === 'tool_call';
      const envelope = event.params;
      if (wrapped) {
        const id = envelope?.id;
        event = { ...event, toolName: typeof id === 'string' && id.startsWith('openclaw:core:') ? id.slice('openclaw:core:'.length) : id, params: envelope?.args };
      }
      // The native spawn path must not be reachable through another conversation/agent.
      if (!selected(ctx)) return event.toolName === 'sessions_spawn' && event.params?.runtime === 'acp' ? deny(reason) : undefined;
      const run = runs.get(ctx.runId), source = run?.ctx;
      if (!source || clock() - run.at > 3_600_000 || ctx.sessionKey !== source.sessionKey ||
          ctx.requester?.senderId !== source.senderId || ctx.requester?.channel !== source.channel ||
          ctx.requester?.accountId !== source.accountId || ctx.abortSignal?.aborted || !await permitted(source) || ctx.abortSignal?.aborted)
        return deny(reason);
      if (!wrapped && event.toolName === 'tool_search') return;
      if (event.toolName === 'subagents') {
        if (!['list', 'wait', 'cancel'].includes(event.params?.action ?? 'list')) return deny('Unsupported ACP task control.');
        return;
      }
      if (event.toolName !== 'sessions_spawn') return deny('This controller only delegates ACP tasks and reads or cancels its own background work.');
      const p = event.params ?? {};
      const allowed = ['task', 'label', 'runtime', 'agentId', 'cwd', 'mode', 'thread', 'streamTo'];
      if (Object.keys(p).some(key => !allowed.includes(key)) || typeof p.task !== 'string' || !p.task.trim() || p.task.length > 32000 ||
          (p.runtime !== undefined && p.runtime !== 'acp') || (p.agentId !== undefined && p.agentId !== config.harnessAgentId) ||
          (p.cwd !== undefined && p.cwd !== config.cwd) || (p.mode !== undefined && p.mode !== 'run') ||
          (p.thread !== undefined && p.thread !== false) || (p.streamTo !== undefined && p.streamTo !== 'parent'))
        return deny('Use a new one-shot ACP task on the configured harness and workspace, with progress returned to the parent.');
      const params = { ...p, runtime: 'acp', agentId: config.harnessAgentId, cwd: config.cwd, mode: 'run', thread: false, streamTo: 'parent' };
      return { params: wrapped ? { ...envelope, args: params } : params };
    },
    agentEnd(_event, ctx) { if (selected(ctx)) runs.delete(ctx.runId); },
  };
}
