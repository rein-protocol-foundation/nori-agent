import { join } from 'node:path';
import { inspectCronJobs } from './cron-diagnostics.mjs';
import { readFileWithinRoot, writeFileWithinRoot } from 'openclaw/plugin-sdk/file-access-runtime';
import { openSqliteWorkerStore } from 'openclaw/plugin-sdk/sqlite-runtime';
import { createRetainedSummaries, retainedSummaryBackendUrlForRuntime } from './retained-summaries.mjs';
import { createCronIngress } from '../rein-router/cron-ingress.mjs';
import { scheduledSpawnAllowed } from '../rein-router/scheduled-development.mjs';
import { loadCronStore, resolveCronStorePath } from 'openclaw/plugin-sdk/cron-store-runtime';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { isSubagentSessionKey, isAcpSessionKey } from 'openclaw/plugin-sdk/routing';
import { createSlackDevelopmentAuthorizer, DEVELOPMENT_AUTH_TIMEOUT_MS } from '../rein-router/slack-development.mjs';
import { taskChannels, validateAcpConfig, assertAcpRuntimeConfig, createDirectorAcp } from './runtime.mjs';
import { createTaskLoop, assertTaskLoopRuntimeConfig, normalizeQueuedDevelopmentTurn } from './task-loop.mjs';
import { createTaskContinuation } from './continuation.mjs';

export default definePluginEntry({
  id: 'rein-acp', name: 'Nori task delegation',
  description: 'Trusted Slack delegation to one-shot ACP tasks with parent progress.',
  register(api) {
    const config = validateAcpConfig(api.pluginConfig);
    if (!config.enabled) return;
    const authorize = createSlackDevelopmentAuthorizer({ config: { developmentChannels: taskChannels(config) } });
    if (api.pluginConfig?.taskLoop === true) {
      assertTaskLoopRuntimeConfig(config, api.config);
      let continuation;
      const routerEntry = api.config.plugins?.entries?.['rein-router'];
      const scheduler = routerEntry?.enabled && routerEntry.config?.enabled && routerEntry.config.scheduleInPublicChannels === true
        ? routerEntry.config : undefined;
      const devChannels = (scheduler?.developmentChannels ?? []).filter(entry =>
        config.additionalChannelIds?.includes(entry.channelId) && entry.accountId === config.channel.accountId &&
        entry.workspaceId === config.channel.workspaceId && entry.agentId === 'nori-development');
      const scopes = (scheduler?.trustedSlackChannels ?? []).filter(entry => entry.channelId === '*' &&
        entry.agentId === config.channel.agentId && entry.workspaceId === config.channel.workspaceId && entry.accountId === config.channel.accountId);
      const readJobs = async () => (await loadCronStore(resolveCronStorePath(api.config.cron?.store))).jobs;
      const scheduling = devChannels.length && scopes.length ? createCronIngress({ channels: scopes,
        developmentChannels: devChannels, requireWorkspaceSource: true, authorize, readJobs }) : undefined;
      const runtime = createTaskLoop({ config, authorize, tasks: api.runtime.tasks, subagent: api.runtime.subagent,
        inspectCron: names => inspectCronJobs({ database: join(api.runtime.state.resolveStateDir(), 'state', 'openclaw.sqlite'),
          store: resolveCronStorePath(api.config.cron?.store), agentId: config.channel.agentId }, names),
        scheduling, schedulingChannels: devChannels.map(entry => entry.channelId),
        allowScheduledSpawn: scheduling && ((ctx, args) => scheduledSpawnAllowed(ctx, args, devChannels,
          async id => (await readJobs()).find(job => job.id === id))),
        permitsDevelopmentAssignment: (ctx, task) => continuation?.permitsDevelopmentAssignment(ctx, task) ?? false,
        isCurrentContinuation: (task, ctx) => continuation?.isCurrentAttempt(task, ctx) ?? false,
        isNativeChild: ctx => isSubagentSessionKey(ctx.sessionKey) || isAcpSessionKey(ctx.sessionKey) });
      const retainedSummaries = config.continuation?.retainedSummaries?.enabled === true
        ? createRetainedSummaries({ stateDir: api.runtime.state.resolveStateDir(), openSqliteWorkerStore,
          backendModuleUrl: retainedSummaryBackendUrlForRuntime(api.runtimeSource) }) : undefined;
      continuation = config.continuation ? createTaskContinuation({ config: { ...config, hostConfig: api.config }, authorize,
        tasks: api.runtime.tasks, subagent: api.runtime.subagent, system: api.runtime.system, session: api.runtime.agent.session,
        events: api.runtime.events, readFileWithinRoot, writeFileWithinRoot,
        isNativeChild: ctx => isSubagentSessionKey(ctx.sessionKey) || isAcpSessionKey(ctx.sessionKey),
        confirmedReplacement: runtime.confirmedReplacement, logger: api.logger, retainedSummaries }) : undefined;
      api.registerTool(runtime.toolFactory, { names: ['rein_task'], optional: true });
      if (continuation) {
        api.registerTool(continuation.toolFactory, { names: ['rein_continuation'], optional: true });
        api.on('after_tool_call', continuation.afterToolCall);
        api.on('gateway_start', continuation.gatewayStart);
        api.on('gateway_stop', continuation.gatewayStop);
      }
      api.on('before_agent_run', async (event, hostContext) => {
        const ctx = normalizeQueuedDevelopmentTurn(config, hostContext);
        const admitted = await runtime.beforeAgentRun(event, ctx);
        if (admitted?.outcome === 'block') return admitted;
        await continuation?.beforeAgentRun(event, ctx);
        return admitted;
      }, { priority: 200, timeoutMs: continuation ? DEVELOPMENT_AUTH_TIMEOUT_MS * 3 + 5000 : DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
      api.on('before_prompt_build', async (event, ctx) => {
        const base = await runtime.beforePromptBuild(event, ctx), extra = continuation?.beforePromptBuild(event, ctx);
        return extra ? { ...base, prependContext: [base?.prependContext, extra.prependContext].filter(Boolean).join('\n') } : base;
      });
      api.on('before_tool_call', async (event, ctx) => {
        const base = await runtime.beforeToolCall(event, ctx);
        if (base?.block) return base;
        const extra = await continuation?.beforeToolCall(base?.params ? { ...event, params: base.params } : event, ctx);
        return extra ?? base;
      }, { priority: 200, timeoutMs: continuation ? DEVELOPMENT_AUTH_TIMEOUT_MS * 6 + 5000 : DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
      api.on('agent_end', (event, ctx) => { runtime.agentEnd(event, ctx); continuation?.agentEnd(event, ctx); });
      return;
    }
    assertAcpRuntimeConfig(config, api.config);
    const runtime = createDirectorAcp({ config, authorize });
    api.on('before_agent_run', runtime.beforeAgentRun, { priority: 200, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('before_prompt_build', runtime.beforePromptBuild);
    api.on('before_tool_call', runtime.beforeToolCall, { priority: 200, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('agent_end', runtime.agentEnd);
  },
});
