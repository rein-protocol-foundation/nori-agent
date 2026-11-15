import path from 'node:path';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { createSlackDevelopmentAuthorizer } from '../rein-router/slack-development.mjs';
import { createNativeLobster } from './native.mjs';
import { createResendMail } from './mail.mjs';
import { validatePartnershipConfig, assertPartnershipRuntimeConfig, createPartnershipWorkflow } from './workflow.mjs';

export default definePluginEntry({
  id: 'rein-partnership', name: 'Nori partnership test workflow',
  description: 'Optional fixed exact-draft test-recipient workflow with native Lobster human approval.',
  register(api) {
    const config = validatePartnershipConfig(api.pluginConfig);
    if (!config.enabled) return;
    assertPartnershipRuntimeConfig(config, api.config);
    const stateDir = path.join(api.runtime.state.resolveStateDir(), 'rein-partnership');
    const runtime = createPartnershipWorkflow({ config, stateDir,
      authorize: createSlackDevelopmentAuthorizer({ config: { developmentChannels: [config.channel] } }),
      lobster: createNativeLobster({ stateDir: path.join(stateDir, 'lobster') }),
      mail: createResendMail({ apiKey: process.env[config.apiKeyEnvVar] }),
    });
    api.registerTool(runtime.toolFactory, { names: ['rein_partnership'], optional: true });
    api.registerCommand({ name: 'partnership', description: 'Approve, cancel, inspect or reconcile a saved partnership test draft.',
      channels: ['slack'], requireAuth: true, acceptsArgs: true, handler: runtime.command });
    api.on('before_agent_run', runtime.beforeAgentRun, { priority: 200, timeoutMs: 9000 });
    api.on('before_prompt_build', runtime.beforePromptBuild);
    api.on('before_tool_call', runtime.beforeToolCall, { priority: 200, timeoutMs: 9000 });
    api.on('agent_end', runtime.agentEnd);
  },
});
