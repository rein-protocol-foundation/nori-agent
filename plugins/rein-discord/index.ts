import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { buildJsonChannelConfigSchema } from 'openclaw/plugin-sdk/channel-config-schema';
import { validateIsolationConfig, assertIsolationRuntime, MEMORY_TOOLS } from './isolation.mjs';
import { createMemberMemory } from './memory.mjs';
import { createMemoryToolFactory } from './memory-tools.mjs';

export default definePluginEntry({
  id: 'rein-discord',
  name: 'Rein Isolated Discord',
  description: 'Dedicated onboarding ingress with per-sender, per-audience sessions and memory.',
  register(api) {
    const config = validateIsolationConfig(api.pluginConfig);
    const workspaceDir = api.config.agents?.defaults?.workspace;
    if (!workspaceDir) throw new Error('Dedicated public Discord workspace is required');
    assertIsolationRuntime(api.config, config, workspaceDir);
    let memory;
    const getMemory = () => memory ??= createMemberMemory(config.memoryPath);
    api.registerTool({ contextVersion: 2, create: createMemoryToolFactory(config, getMemory) }, { names: MEMORY_TOOLS });
    api.registerChannel({
      id: 'discord',
      meta: { id: 'discord', label: 'Rein Isolated Discord', selectionLabel: 'Rein Isolated Discord',
        docsPath: '/channels/discord', blurb: 'Per-sender community onboarding' },
      capabilities: { chatTypes: ['direct', 'channel'], media: false, nativeCommands: false },
      configSchema: buildJsonChannelConfigSchema({ type: 'object', properties: { enabled: { type: 'boolean' } }, additionalProperties: false }),
      config: {
        listAccountIds: cfg => cfg.channels?.discord?.enabled === true ? ['default'] : [],
        resolveAccount: cfg => ({ accountId: 'default', enabled: cfg.channels?.discord?.enabled === true }),
        isEnabled: account => account.enabled,
        isConfigured: () => Boolean(process.env[config.tokenEnv]),
      },
      gateway: {
        async startAccount(ctx) {
          if (!ctx.channelRuntime) throw new Error('Host-owned channel runtime required');
          const { startIsolatedDiscord } = await import('./gateway.mjs');
          return await startIsolatedDiscord({ config, cfg: ctx.cfg, runtime: ctx.channelRuntime,
            memory: getMemory(), signal: ctx.abortSignal, status: ctx.setStatus, log: ctx.log });
        },
      },
    });
  },
});
