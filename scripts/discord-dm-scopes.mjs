// Finite witnesses for the pinned router's direct-message binding precedence.
// No SDK build, credential resolution or member identifiers in the result.
const trim = value => typeof value === 'string' ? value.trim() : '';
const accountId = value => {
  const id = trim(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return !id || ['__proto__', 'prototype', 'constructor'].includes(id) ? 'default' : id;
};

export function discordAccountPolicies(discord) {
  const accounts = new Map([['default', discord]]);
  for (const [id, override] of Object.entries(discord?.accounts ?? {})) accounts.set(accountId(id), { ...discord, ...override });
  return [...accounts].filter(([, policy]) => policy?.enabled !== false);
}

export function effectiveDiscordDmScopes(config) {
  const fallback = config.session?.dmScope ?? 'main';
  const bindings = (config.bindings ?? []).filter(b => b?.type !== 'acp' && trim(b?.match?.channel).toLowerCase() === 'discord')
    .filter(b => !trim(b.match.guildId) && !trim(b.match.teamId) && !b.match.roles?.length)
    .filter(b => !b.match.peer || (b.match.peer.kind === 'direct' && trim(b.match.peer.id)));
  const peers = new Set(bindings.map(b => trim(b.match.peer?.id)).filter(id => id && id !== '*'));
  let sentinel = 'rein-audit-unbound-peer';
  while (peers.has(sentinel)) sentinel += '-next';
  peers.add(sentinel);
  const scopes = new Set();
  for (const [id, policy] of discordAccountPolicies(config.channels?.discord)) {
    if (policy.dmPolicy === 'disabled' || policy.dm?.enabled === false) continue;
    for (const peer of peers) {
      // Exact peer, wildcard direct peer, account, then channel-wide wildcard;
      // Array.find retains source order within each tier, as the pinned core does.
      const candidates = bindings.filter(b => (trim(b.match.accountId) === '*' || accountId(b.match.accountId) === id) &&
        (!b.match.peer || ['*', peer].includes(trim(b.match.peer.id))));
      const tier = b => b.match.peer ? trim(b.match.peer.id) === '*' ? 1 : 0 : trim(b.match.accountId) === '*' ? 3 : 2;
      candidates.sort((a,b) => tier(a) - tier(b));
      scopes.add(candidates[0]?.session?.dmScope ?? fallback);
    }
  }
  return [...scopes];
}
