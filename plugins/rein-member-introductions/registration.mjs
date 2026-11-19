import { createBackendRuntime } from '../rein-operations/backend-runtime.ts';
import { createLinkedIntroductionReader } from './linked-reader.mjs';
import { createIntroductionReader } from './reader.mjs';

export function createProfileRegistration({ config, operations, tokenForContext, runtimeFactory = createBackendRuntime }) {
  const legacy = createIntroductionReader({ config, tokenForContext });
  if (!config.linkedProfiles) return legacy;
  if (!operations?.enabled || !operations.config?.agentProfiles) throw new Error('Existing backend profiles required for linked recall');
  const registrations = config.linkedProfiles.map(agentId => {
    const p = operations.config.agentProfiles[agentId];
    if (!p || !['discord', 'slack'].includes(p.platform) || !p.accountId || p.foundationDb?.enabled !== true ||
        !['community', 'internal'].includes(p.capabilities) || (p.platform === 'discord' && p.capabilities !== 'community') ||
        !Array.isArray(p.foundationDb.workspaces) || p.foundationDb.workspaces.some(w => w.platform !== p.platform))
      throw new Error('Invalid existing backend recognition profile');
    if (agentId === config.agentId && (p.platform !== 'discord' || p.accountId !== config.accountId)) throw new Error('Source account mismatch');
    const profile = { ...p, agentId };
    const runtime = runtimeFactory({ config: p.foundationDb, communityOnly: p.capabilities === 'community',
      communityProfile: { agentId, accountId: p.accountId } });
    if (!runtime) throw new Error('Linked profile backend unavailable');
    return createLinkedIntroductionReader({ config, profile, runtime, tokenForContext,
      fallbackForContext: ctx => legacy.create(ctx) });
  });
  return { contextVersion: 2, create(ctx) {
    const tools = registrations.flatMap(r => r.create(ctx));
    if (tools.length) return tools;
    // Keep existing own-account Discord recall outside backend-enrolled rooms.
    // This fallback never resolves another platform account or a community profile.
    const own = legacy.create(ctx);
    return own ? [own] : [];
  } };
}
