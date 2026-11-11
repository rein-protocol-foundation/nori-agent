import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { createSlackDevelopmentAuthorizer, DEVELOPMENT_AUTH_TIMEOUT_MS } from '../rein-router/slack-development.mjs';
import { validateAcpConfig, assertAcpRuntimeConfig, createDirectorAcp } from './runtime.mjs';

export default definePluginEntry({
  id: 'rein-acp', name: 'Rein Slack ACP',
  description: 'Trusted Slack delegation to one-shot ACP tasks with parent progress.',
  register(api) {
    const config = validateAcpConfig(api.pluginConfig);
    if (!config.enabled) return;
    assertAcpRuntimeConfig(config, api.config);
    const authorize = createSlackDevelopmentAuthorizer({ config: { developmentChannels: [config.channel] } });
    const runtime = createDirectorAcp({ config, authorize });
    api.on('before_agent_run', runtime.beforeAgentRun, { priority: 200, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('before_prompt_build', runtime.beforePromptBuild);
    api.on('before_tool_call', runtime.beforeToolCall, { priority: 200, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('agent_end', runtime.agentEnd);
  },
});
