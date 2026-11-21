// M0: one registration owner, separate backend closures selected only by host context.
const COMMUNITY_TOOLS = new Set(['rein_status', 'rein_member_status', 'rein_identity_bind_start',
  'rein_identity_bind_status', 'rein_identity_bind_complete', 'rein_resources_search',
  'rein_resource_get', 'rein_events_search', 'rein_event_get']);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new Error('foundation_agent_profiles_invalid'); };
const canonical = value => JSON.stringify(value, function (_key, item) {
  return record(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});

export function registerAgentProfiles(api, registerLegacy) {
  const raw = api.pluginConfig;
  if (raw.foundationDb !== undefined || raw.proposalTools !== undefined ||
      !record(raw.agentProfiles) || !Object.keys(raw.agentProfiles).length ||
      Object.keys(raw.agentProfiles).length > 16) invalid();
  const profiles = [];
  const authorities = [];
  for (const [agentId, profile] of Object.entries(raw.agentProfiles)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(agentId) || !record(profile) ||
        Object.keys(profile).some(key => !['platform', 'accountId', 'capabilities', 'foundationDb'].includes(key)) ||
        !['slack', 'discord'].includes(profile.platform) ||
        typeof profile.accountId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(profile.accountId) ||
        !['internal', 'community'].includes(profile.capabilities) ||
        (profile.platform === 'discord' && profile.capabilities !== 'community') ||
        profile.foundationDb?.enabled !== true ||
        !Array.isArray(profile.foundationDb.workspaces) ||
        profile.foundationDb.workspaces.some(workspace => workspace.platform !== profile.platform)) invalid();
    const caller = process.env[profile.foundationDb.agentCallerIdEnvVar]?.trim();
    const credential = process.env[profile.foundationDb.agentCredentialEnvVar]?.trim();
    if (!caller || !credential) invalid();
    // Existing internal agents may explicitly retain one identical Slack authority.
    // A Community profile must always have its own caller AND credential. Sharing just
    // one field, a different account, or a differently scoped backend is ambiguous.
    const authority = { caller, credential, profile };
    for (const prior of authorities) if (prior.caller === caller || prior.credential === credential) {
      if (prior.caller !== caller || prior.credential !== credential ||
          profile.capabilities !== 'internal' || prior.profile.capabilities !== 'internal' ||
          profile.platform !== 'slack' || prior.profile.platform !== 'slack' ||
          profile.accountId !== prior.profile.accountId ||
          canonical(profile.foundationDb) !== canonical(prior.profile.foundationDb)) invalid();
    }
    authorities.push(authority);
    profiles.push({ agentId, ...profile, registrations: [] });
  }
  const hooks = [];
  const hookOwner = profiles.find(profile => profile.capabilities === 'internal');
  for (const profile of profiles) {
    registerLegacy({ ...api, pluginConfig: { foundationDb: profile.foundationDb },
      on: profile === hookOwner && typeof api.on === 'function'
        ? (...args) => hooks.push(args) : undefined,
      registerTool(registration, options) {
        const names = options?.names ?? [registration.name];
        const admitted = names.filter(name => profile.capabilities === 'internal' || COMMUNITY_TOOLS.has(name));
        if (admitted.length) profile.registrations.push({ registration, names: admitted });
      },
    }, { communityOnly: profile.capabilities === 'community',
      communityProfile: { agentId: profile.agentId, accountId: profile.accountId } });
  }
  const names = [...new Set(profiles.flatMap(profile => profile.registrations.flatMap(item => item.names)))];
  api.registerTool({ contextVersion: 2, create(ctx) {
    const profile = profiles.find(candidate => ctx?.agentId === candidate.agentId &&
      ctx.messageChannel === candidate.platform && ctx.agentAccountId === candidate.accountId);
    if (!profile || typeof ctx.assertInvocationCurrent !== 'function') return [];
    ctx.assertInvocationCurrent();
    const identity = [ctx.agentId, ctx.messageChannel, ctx.agentAccountId];
    return profile.registrations.flatMap(({ registration, names }) => {
      const result = typeof registration.create === 'function' ? registration.create(ctx) : registration;
      return (Array.isArray(result) ? result : result ? [result] : [])
        .filter(tool => names.includes(tool.name)).map(tool => ({ ...tool,
          async execute(...args) {
            ctx.assertInvocationCurrent();
            if (identity.some((value, index) => value !== [ctx.agentId, ctx.messageChannel, ctx.agentAccountId][index]))
              throw new Error('foundation_agent_scope_changed');
            return tool.execute(...args);
          },
        }));
    });
  } }, { names });
  for (const args of hooks) api.on(...args);
}
