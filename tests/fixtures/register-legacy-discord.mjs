// Test-only registration for historical isolation and router regression probes.
// No Discord SDK, bot login or production transport is available here.
import { buildJsonChannelConfigSchema } from 'openclaw/plugin-sdk/channel-config-schema';
import { applyModelOverrideToSessionEntry } from 'openclaw/plugin-sdk/model-session-runtime';
import { validateIsolationConfig, assertIsolationRuntime, MEMORY_TOOLS } from '../../plugins/rein-discord/isolation.mjs';
import { createMemberMemory } from '../../plugins/rein-discord/memory.mjs';
import { createMemoryToolFactory } from '../../plugins/rein-discord/memory-tools.mjs';
import { getHostTurnControl } from '../../plugins/rein-discord/turn-control.mjs';

export function registerLegacyDiscordFixture(api, transport) {
  if (typeof transport !== 'function') throw new Error('Synthetic transport required');
  const config = validateIsolationConfig(api.pluginConfig);
  const workspaceDir = api.config.agents?.defaults?.workspace;
  if (!workspaceDir) throw new Error('Dedicated public Discord workspace is required');
  assertIsolationRuntime(api.config, config, workspaceDir);
  let memory;
  const turns = getHostTurnControl(config.memoryPath);
  const getMemory = () => memory ??= createMemberMemory(config.memoryPath);
  api.registerTool({ contextVersion: 2, create: createMemoryToolFactory(config, getMemory, turns) }, { names: MEMORY_TOOLS });
  api.registerChannel({
    id: 'discord',
    meta: { id: 'discord', label: 'Nori-Agent Isolated Discord', selectionLabel: 'Nori-Agent Isolated Discord',
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
        return await transport({ config, cfg: ctx.cfg, runtime: ctx.channelRuntime,
          memory: getMemory(), turns, sessionStore: { ...api.runtime.agent.session,
            applyModelOverride: applyModelOverrideToSessionEntry },
          signal: ctx.abortSignal, status: ctx.setStatus, log: ctx.log });
      },
    },
  });
}
