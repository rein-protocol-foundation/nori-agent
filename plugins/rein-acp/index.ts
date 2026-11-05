import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { createFoundationDirectorAuthorizer } from '../rein-router/foundation-admin.ts';
import { createSlackDevelopmentAuthorizer, DEVELOPMENT_AUTH_TIMEOUT_MS } from '../rein-router/slack-development.mjs';
import { validateAcpConfig, assertAcpRuntimeConfig, createDirectorAcp } from './runtime.mjs';

export default definePluginEntry({
  id: 'rein-acp', name: 'Rein Director ACP',
  description: 'Director-authorized Slack delegation to one-shot ACP tasks with parent progress.',
  register(api) {
    const config = validateAcpConfig(api.pluginConfig);
    if (!config.enabled) return;
    assertAcpRuntimeConfig(config, api.config);
    const operations = api.config.plugins?.entries?.['rein-operations'];
    const authorize = createSlackDevelopmentAuthorizer({ config: { developmentChannels: [config.channel] },
      authorizeFoundation: createFoundationDirectorAuthorizer({ config: operations?.enabled === true ? operations.config?.foundationDb : undefined }) });
    const runtime = createDirectorAcp({ config, authorize });
    api.on('before_agent_run', runtime.beforeAgentRun, { priority: 200, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('before_prompt_build', runtime.beforePromptBuild);
    api.on('before_tool_call', runtime.beforeToolCall, { priority: 200, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('agent_end', runtime.agentEnd);
  },
});
