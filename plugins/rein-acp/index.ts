import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { isSubagentSessionKey, isAcpSessionKey } from 'openclaw/plugin-sdk/routing';
import { createSlackDevelopmentAuthorizer, DEVELOPMENT_AUTH_TIMEOUT_MS } from '../rein-router/slack-development.mjs';
import { validateAcpConfig, assertAcpRuntimeConfig, createDirectorAcp } from './runtime.mjs';
import { createTaskLoop, assertTaskLoopRuntimeConfig } from './task-loop.mjs';
import { createTaskContinuation } from './continuation.mjs';

export default definePluginEntry({
  id: 'rein-acp', name: 'Rein Slack ACP',
  description: 'Trusted Slack delegation to one-shot ACP tasks with parent progress.',
  register(api) {
    const config = validateAcpConfig(api.pluginConfig);
    if (!config.enabled) return;
    const authorize = createSlackDevelopmentAuthorizer({ config: { developmentChannels: [config.channel] } });
    if (api.pluginConfig?.taskLoop === true) {
      assertTaskLoopRuntimeConfig(config, api.config);
      const runtime = createTaskLoop({ config, authorize, tasks: api.runtime.tasks, subagent: api.runtime.subagent,
        isNativeChild: ctx => isSubagentSessionKey(ctx.sessionKey) || isAcpSessionKey(ctx.sessionKey) });
      const continuation = config.continuation ? createTaskContinuation({ config: { ...config, hostConfig: api.config }, authorize,
        tasks: api.runtime.tasks, subagent: api.runtime.subagent, system: api.runtime.system, session: api.runtime.agent.session,
        isNativeChild: ctx => isSubagentSessionKey(ctx.sessionKey) || isAcpSessionKey(ctx.sessionKey),
        confirmedReplacement: runtime.confirmedReplacement, logger: api.logger }) : undefined;
      api.registerTool(runtime.toolFactory, { names: ['rein_task'], optional: true });
      if (continuation) {
        api.registerTool(continuation.toolFactory, { names: ['rein_continuation'], optional: true });
        api.on('after_tool_call', continuation.afterToolCall);
        api.on('gateway_start', continuation.gatewayStart);
      }
      api.on('before_agent_run', async (event, ctx) => {
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
