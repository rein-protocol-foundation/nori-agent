import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { buildJsonChannelConfigSchema } from 'openclaw/plugin-sdk/channel-config-schema';
import { validateIsolationConfig, assertSlackRuntime, MEMORY_TOOLS } from './isolation.mjs';
import { createMemberMemory } from '@rein-protocol/isolation-core/memory';
import { createMemoryToolFactory } from './memory-tools.mjs';
import { getHostTurnControl } from '@rein-protocol/isolation-core/turn-control';

type SlackTransport = typeof import('./gateway.mjs').startIsolatedSlack;
const defaultTransport: SlackTransport = async params => {
  const { startIsolatedSlack } = await import('./gateway.mjs');
  return await startIsolatedSlack(params);
};

// The optional transport is code-only dependency injection for the native
// pipeline probe, never a runtime config option or model-accessible endpoint.
export function registerReinSlack(api: OpenClawPluginApi, transport: SlackTransport = defaultTransport) {
    const config = validateIsolationConfig(api.pluginConfig);
    const workspaceDir = api.config.agents?.defaults?.workspace;
    if (!workspaceDir) throw new Error('Dedicated public Slack workspace is required');
    assertSlackRuntime(api.config, config, workspaceDir);
    let memory;
    const turns = getHostTurnControl(config.memoryPath);
    const getMemory = () => memory ??= createMemberMemory(config.memoryPath);
    api.registerTool({ contextVersion: 2, create: createMemoryToolFactory(config, getMemory, turns) }, { names: MEMORY_TOOLS });
    api.registerChannel({
      id: 'slack',
      meta: { id: 'slack', label: 'Rein Isolated Slack', selectionLabel: 'Rein Isolated Slack',
        docsPath: '/channels/slack', blurb: 'Per-sender community operations' },
      capabilities: { chatTypes: ['direct', 'channel'], media: false, nativeCommands: false },
      configSchema: buildJsonChannelConfigSchema({ type: 'object', properties: { enabled: { type: 'boolean' } }, additionalProperties: false }),
      config: {
        listAccountIds: cfg => cfg.channels?.slack?.enabled === true ? ['default'] : [],
        resolveAccount: cfg => ({ accountId: 'default', enabled: cfg.channels?.slack?.enabled === true }),
        isEnabled: account => account.enabled,
        isConfigured: () => Boolean(process.env[config.botTokenEnv] && process.env[config.appTokenEnv]),
      },
      gateway: {
        async startAccount(ctx) {
          if (!ctx.channelRuntime) throw new Error('Host-owned channel runtime required');
          return await transport({ config, cfg: ctx.cfg, runtime: ctx.channelRuntime,
            memory: getMemory(), turns, signal: ctx.abortSignal, status: ctx.setStatus, log: ctx.log });
        },
      },
    });
}

export default definePluginEntry({
  id: 'rein-slack',
  name: 'Rein Isolated Slack',
  description: 'Dedicated operations ingress with per-sender, per-audience sessions and memory.',
  register: registerReinSlack,
});
