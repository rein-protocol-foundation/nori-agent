// Creation-time policy only. Native OpenClaw owns job execution, grants and self-cleanup.
import { createAgentToAgentPolicy } from 'openclaw/plugin-sdk/session-visibility';
import { resolveAgentRoute, normalizeAgentId, parseAgentSessionKey, parseThreadSessionSuffix } from 'openclaw/plugin-sdk/routing';
import { ownerThread, scheduleInThread } from './scheduled-development.mjs';
import { scheduleChannelFor } from './slack-development.mjs';

const PREFIX = '[Nori creation v1 ';
const deny = () => ({ block: true, blockReason: 'Automation creation or expansion requires a current member of a configured trusted Slack channel on its approved Nori agent.' });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = new Set(['name', 'description', 'displayName', 'declarationKey', 'agentId', 'sessionKey',
  'enabled', 'deleteAfterRun', 'schedule', 'pacing', 'trigger', 'sessionTarget', 'wakeMode', 'payload',
  'delivery', 'failureAlert', 'state', 'id', 'owner', 'at', 'atMs', 'everyMs', 'cron', 'tz', 'text', 'message',
  'kind', 'model', 'thinking', 'timeoutSeconds', 'toolsAllow', 'lightContext']);
const cleanDescription = value => (typeof value === 'string' ? value : '').split('\n')
  .filter(line => !line.trimStart().startsWith(PREFIX)).join('\n').trim();
const existingStamp = job => typeof job?.description === 'string'
  ? job.description.split('\n').find(line => line.startsWith(PREFIX)) : undefined;
function sameConversation(source, channelId) {
  if (channelId === source.chatId || channelId === `channel:${source.chatId}`) return true;
  // Compact native tools project the session's opaque conversation tail, including
  // its thread suffix. This only corroborates the already observed trusted run;
  // a session-key string never supplies requester identity or creation authority.
  const { baseSessionKey, threadId } = parseThreadSessionSuffix(source.sessionKey);
  const base = parseAgentSessionKey(baseSessionKey);
  const chatId = source.chatId.toLowerCase();
  if (base?.agentId !== source.agentId || base.rest !== `slack:channel:${chatId}`) return false;
  if (threadId !== undefined && !/^\d+\.\d+$/.test(threadId)) return false;
  return channelId === `${chatId}${threadId === undefined ? '' : `:thread:${threadId}`}`;
}
const sameRun = (source, ctx) => source && source.agentId === ctx.agentId && source.sessionKey === ctx.sessionKey &&
  source.sessionId === ctx.sessionId && source.senderId === ctx.requester?.senderId &&
  source.accountId === ctx.requester?.accountId && ctx.requester?.channel === 'slack' &&
  sameConversation(source, ctx.channelId);

export function createCronIngress({ channels, authorize, readJobs, developmentChannels = [], requireWorkspaceSource = false, hasExistingNativeControls = () => false, clock = Date.now, deadlineMs = 8500 }) {
  const sources = new Map();
  return {
    observe(_event, ctx) {
      sources.delete(ctx.runId);
      if (!scheduleChannelFor(channels, ctx)) return;
      for (const [id, value] of sources) if (clock() - value.at > 3_600_000) sources.delete(id);
      if (sources.size >= 4096) return; // Refuse new creation, never block native execution.
      sources.set(ctx.runId, { ...ctx, at: clock(), chatId: ctx.channelContext?.chat?.id ?? ctx.chatId });
    },
    end(_event, ctx) { sources.delete(ctx.runId); },
    async beforeToolCall(event, ctx) {
      let timer;
      try {
        return await Promise.race([
          checkMutation(event, ctx),
          new Promise(resolve => { timer = setTimeout(() => resolve(deny()), Math.min(deadlineMs, 8500)); }),
        ]);
      } catch {
        return { block: true, blockReason: 'Automation creation audit or requester verification is unavailable.' };
      } finally { clearTimeout(timer); }
    },
  };

  async function checkMutation(event, ctx) {
      const wrapped = event.toolName === 'tool_call';
      const id = wrapped ? event.params?.id : event.toolName;
      const name = typeof id === 'string' ? id.trim().replace(/^openclaw:core:/, '') : '';
      if (!['automations', 'cron'].includes(name)) return;
      const params = wrapped ? event.params?.args : event.params;
      if (!record(params)) return deny();
      const action = typeof params.action === 'string' ? params.action.trim() : params.action;
      const source = sources.get(ctx.runId);
      const selected = source && scheduleChannelFor(channels, source);
      if (requireWorkspaceSource && !selected?.workspaceSchedule) return deny();
      const worker = selected?.workspaceSchedule && developmentChannels.find(entry => entry.channelId === source.chatId &&
        entry.accountId === source.accountId && entry.workspaceId === selected.workspaceId && entry.agentId !== source.agentId)?.agentId;
      const scoped = selected?.workspaceSchedule === true;
      const nativeControls = !requireWorkspaceSource && !worker && source && hasExistingNativeControls(source);
      if ((!scoped || nativeControls) && !['add', 'update'].includes(action)) return;
      if (!scoped && action === 'update' && record(params.job) && Object.keys(params.job).length === 1 && params.job.enabled === false) return;
      if (!sameRun(source, ctx) || ctx.abortSignal?.aborted || !await authorize(source) || ctx.abortSignal?.aborted) return deny();
      let current;
      if (scoped) {
        if (!ownerThread(source)) return deny();
        // Native owner accounts may otherwise see Gateway-wide jobs. Enforce the
        // thread at this newly admitted surface, including reads and controls.
        if (!['add','update','get','runs','remove','run'].includes(action))
          return { block: true, blockReason: 'Use the job ID from this thread to inspect or adjust its automation.' };
        if (Object.keys(params).some(key => !['action','job','jobId','id','runMode'].includes(key)))
          return { block: true, blockReason: 'Use canonical nested job parameters without Gateway overrides.' };
        if (action !== 'add') {
          current = (await readJobs(source)).find(item => item.id === (params.jobId ?? params.id) &&
            item.owner?.sessionKey === source.sessionKey && item.owner.agentId === source.agentId && item.owner.accountId === source.accountId);
          if (!current) return deny();
        }
        if (!['add','update'].includes(action)) return;
      }
      let job = record(params.job) ? params.job : Object.fromEntries(Object.entries(params).filter(([key]) => fields.has(key)));
      // Match the documented native wrapper shapes; reject ambiguous key repair at this boundary.
      if (record(job.data)) job = job.data;
      else if (record(job.job)) job = job.job;
      if (Object.keys(job).some(key => !fields.has(key))) return { block: true, blockReason: 'Use canonical automation job fields.' };
      if (job.agentId && job.agentId !== source.agentId) return deny();
      if (scoped) {
        try { job = scheduleInThread({ job, source, action, current, worker }); }
        catch (error) { return { block: true, blockReason: error.message }; }
      }
      let description;
      if (action === 'add') {
        const stamp = `${PREFIX}workspace=${selected.workspaceId} account=${source.accountId} channel=${source.chatId} user=${source.senderId}]`;
        description = [stamp, cleanDescription(job.description)].filter(Boolean).join('\n');
      } else if (Object.hasOwn(job, 'description')) {
        // Public SDK storage read is for audit merging only; the native tool still performs the write
        // under its caller scope/revision guard. No plugin operator RPC or sidecar authority is used.
        const jobs = current ? [current] : await readJobs(source);
        const previous = jobs.find(value => value.id === (params.jobId ?? params.id) &&
          value.owner?.agentId === source.agentId && value.owner?.accountId === source.accountId &&
          value.owner?.sessionKey === source.sessionKey);
        if (!previous) return { block: true, blockReason: 'Cannot verify creation audit for this automation. Manage it without changing description, or use the native administrator Dashboard.' };
        description = [existingStamp(previous), cleanDescription(job.description)].filter(Boolean).join('\n');
      }
      const nextJob = { ...job, ...(description === undefined ? {} : { description }) };
      const next = { ...params, action, job: nextJob };
      // Avoid a flat description surviving alongside the rewritten canonical nested job.
      for (const key of fields) if (key !== 'id') delete next[key];
      return { params: wrapped ? { ...event.params, args: next } : next };
  }
}

/** Validate the project's public Community ingress against native effective collaboration policy.
 * Unknown channels are not classified as public. Discord is this deployment's public surface;
 * current creation mutations are independently checked against exact configured Slack ingress.
 */
export function assertTrustedSlackBoundaries(channels, host) {
  if (!channels.length) return;
  const trusted = new Set(channels.map(value => normalizeAgentId(value.agentId)));
  const bindings = host.bindings ?? [];
  const publicBindings = bindings.filter(value => value.match?.channel === 'discord');
  const publicAgents = new Set(publicBindings.map(value => normalizeAgentId(value.agentId)));
  const configuredDiscord = host.channels?.discord;
  if (configuredDiscord && configuredDiscord.enabled !== false) {
    // Use native routing for unmatched peers/accounts as well as explicit bindings.
    const accounts = new Set(['default', ...Object.keys(configuredDiscord.accounts ?? {}),
      ...publicBindings.map(value => value.match.accountId).filter(value => value && value !== '*')]);
    for (const accountId of accounts) {
      try {
        publicAgents.add(normalizeAgentId(resolveAgentRoute({ cfg: host, channel: 'discord', accountId,
          peer: { kind: 'channel', id: 'rein-unmatched-public-probe' } }).agentId));
      } catch {
        // Explicit-ownership profiles may deliberately have no default owner. Native rejects that route.
        if (host.agents?.ownership !== 'explicit') throw new Error('rein_router_public_owner_unresolved');
      }
    }
  }
  for (const id of publicAgents) if (trusted.has(id)) throw new Error('rein_router_public_binding_to_trusted_agent');
  const entries = Object.fromEntries(Object.entries(host.agents?.entries ??
    Object.fromEntries((host.agents?.list ?? []).map(agent => [agent.id, agent])))
    .map(([id, value]) => [normalizeAgentId(id), value]));
  const known = new Set(Object.keys(entries));
  const a2a = createAgentToAgentPolicy(host);
  // Native target policy normalizes allowAgents and intersects with configured agents.
  // Tool inheritance does not pin a later target Agent's model or send authority. Check
  // configuration reachability, including mixed spawn/send hops, instead of only one edge.
  const reachable = new Set(publicAgents), queue = [...publicAgents];
  for (let i = 0; i < queue.length; i++) {
    const sourceId = queue[i], source = entries[sourceId] ?? {};
    const allowed = source.subagents?.allowAgents ?? host.agents?.defaults?.subagents?.allowAgents;
    const wildcard = allowed?.some(id => id.trim() === '*');
    const spawnTargets = allowed === undefined ? new Set([sourceId]) : new Set(allowed
      .map(id => id.trim()).filter(id => id && id !== '*').map(normalizeAgentId));
    for (const target of known) {
      const spawn = wildcard || spawnTargets.has(target);
      const send = a2a.isAllowed(sourceId, target);
      if (!spawn && !send) continue;
      if (trusted.has(target)) throw new Error('rein_router_public_reachable_trusted_agent');
      if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
    }
  }
}
