import { createHash } from 'node:crypto';
import { buildOpenClawFragment } from './policy.mjs';

const modelId = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const efforts = ['off', 'low', 'medium', 'high'];
const roles = {
  general: 'Default capable route for uncertain, contextual or multi-step tasks.',
  quick: 'Only simple, self-contained everyday questions that require no previous context.',
  research: 'Resource searches, web summaries and research requiring tools or multiple steps.',
  code: 'Software development, debugging and code review; administrator coding tasks require high effort.',
};
const rank = m => /flash|mini|lite|haiku|small/i.test(m.id) ? 0 : /pro|opus|large|thinking|reason/i.test(m.id) ? 2 : 1;
export const catalogRouteId = id => `m-${createHash('sha256').update(id).digest('hex').slice(0, 20)}`;

/** Project only model metadata, never provider credentials, headers or account names. */
export function readMagpieCatalog(raw) {
  if (!Array.isArray(raw?.providers)) throw new Error('router_catalog_invalid');
  const seen = new Set(), models = [];
  for (const p of raw.providers) {
    if (!p || p.off === true || p.on === false || p.ready === false || p.unlisted === true) continue;
    if (['__proto__', 'constructor', 'prototype'].includes(p.id)) continue;
    if (typeof p.id !== 'string' || typeof p.name !== 'string' || !Array.isArray(p.models)) continue;
    for (const m of p.models) {
      const id = `${p.id}/${m.id}`;
      if (!m.on || m.noAPI || (m.kind && m.kind !== 'text') || !modelId.test(id) || /^group\//i.test(id) ||
          id.includes('//') || id.endsWith('/') || id.split('/').some(s => s === '.' || s === '..') || seen.has(id)) continue;
      seen.add(id);
      const supported = m.reasonless ? ['off'] : (m.kept?.length ? m.kept : m.efforts ?? []).filter(e => efforts.includes(e));
      const contextWindow = Number.isSafeInteger(m.context) && m.context > 0 ? m.context : 32768;
      const maxTokens = Math.min(contextWindow, Number.isSafeInteger(m.output) && m.output > 0 ? m.output : 4096);
      models.push({ id, name: String(m.name || m.id).slice(0, 256), providerId: p.id,
        provider: p.name.slice(0, 128) || p.id, contextWindow, maxTokens,
        limitsKnown: Boolean(m.context && m.output), efforts: supported.length ? [...new Set(supported)] : ['off'],
        // A provider fallback may leave the selected catalog. Never publish it implicitly.
        hasFallback: Boolean(p.fallback?.length) });
    }
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export function recommendPolicy(models) {
  const sorted = [...models].sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id));
  const general = sorted.find(m => m.efforts.some(e => ['medium', 'high'].includes(e)));
  const quick = [...sorted].reverse()[0];
  const coding = sorted.find(m => m.efforts.includes('high')) ?? general;
  const choice = (m, preferred) => m ? { model: m.id, effort: m.efforts.includes(preferred) ? preferred : preferred === 'off' ? m.efforts[0] : m.efforts.at(-1) } : null;
  return { general: choice(general, general?.efforts.includes('medium') ? 'medium' : 'high'), quick: choice(quick, 'off'),
    research: choice(general, 'high'), code: choice(coding, 'high') };
}

/** Model identities and limits have one source: Magpie. Settings contain only policy choices. */
export function compileCatalog({ catalog, settings, gateway, pluginPath }) {
  if (!catalog.length) throw new Error('router_catalog_empty');
  const funding = settings.funding ?? {};
  const paid = settings.allowPaidUsage === true;
  const eligible = catalog.filter(m => {
    const f = funding[m.providerId];
    return !m.hasFallback && f?.confirmed === true &&
      (['subscription', 'coding-plan'].includes(f.mode) || (paid && f.mode === 'pay-as-you-go'));
  });
  if (!eligible.length) throw new Error('router_no_eligible_models');
  const unrestricted = eligible.filter(m => funding[m.providerId].access !== 'admin-complex-coding');
  const policy = { ...recommendPolicy(unrestricted), ...settings.policy };
  const routes = eligible.map(m => makeRoute(m, catalogRouteId(m.id), funding[m.providerId].access === 'admin-complex-coding' && m.efforts.includes('high') ? 'high' : m.efforts.includes('medium') ? 'medium' : m.efforts[0],
    funding[m.providerId].access === 'admin-complex-coding'
      ? 'Restricted complex development. Prefer the named code route; select another model only for unusually demanding architecture, debugging or code review that needs its stronger capabilities.'
      : 'Manually selectable model; choose only when suitable for this task.'));
  for (const [role, purpose] of Object.entries(roles)) {
    const selected = policy[role];
    if (role === 'general' && !selected) throw new Error('router_capable_default_required');
    const model = eligible.find(m => m.id === selected?.model);
    if (!model) throw new Error(`router_policy_model_missing_${role}`);
    if (!model.efforts.includes(selected.effort)) throw new Error(`router_policy_effort_invalid_${role}`);
    if (role === 'general' && !['medium', 'high'].includes(selected.effort)) throw new Error('router_capable_default_required');
    if (role !== 'code' && funding[model.providerId].access === 'admin-complex-coding') throw new Error('router_restricted_policy');
    if (role !== 'code' && funding[model.providerId].mode === 'coding-plan') throw new Error('router_coding_plan_scope');
    routes.push(makeRoute(model, role, selected.effort, purpose));
  }
  if (routes.length > 64) throw new Error('router_catalog_limit');
  const fallbackRoutes = settings.fallbacks ?? [];
  if (!Array.isArray(fallbackRoutes) || fallbackRoutes.some(r => !Object.hasOwn(roles, r))) throw new Error('router_fallback_invalid');
  const raw = { enabled: true, gateway, routes, defaultRoute: 'general', fallbackRoutes,
    allowPaidUsage: paid, channels: ['discord', 'slack'], adminSenders: settings.adminSenders ?? [],
    decision: { allowPaidJev: settings.dynamic === true, minProbability: settings.minProbability ?? 0.8 } };
  const fragment = buildOpenClawFragment(raw, pluginPath);
  if (settings.dynamic) {
    fragment.plugins.allow.push('typesafe');
    fragment.plugins.entries.typesafe = { enabled: true,
      config: { apiKey: { source: 'env', provider: 'default', id: 'JEV_API_KEY' } } };
    fragment.agents.defaults.decisionModel = 'typesafe/jev-latest';
  }
  return { fragment, policy, eligible };

  function makeRoute(m, id, effort, purpose) {
    const mode = funding[m.providerId].mode;
    return { id, provider: m.provider, gatewayModel: m.id, billingMode: mode,
      billingSource: `${m.provider}: ${mode}`, billingVerified: true, effort, purpose,
      ...(funding[m.providerId].access ? { access: funding[m.providerId].access } : {}),
      contextWindow: m.contextWindow, maxTokens: m.maxTokens };
  }
}

/** Merge only router-owned entries; preserve agents, tools, channels and unrelated models. */
export function mergeRouterFragment(host, fragment, { pluginPath, typesafePath, previousModels = [], targetAgent = 'defaults' } = {}) {
  const out = structuredClone(host);
  if (out.plugins?.enabled === false || out.plugins?.deny?.some(id => fragment.plugins.allow.includes(id)))
    throw new Error('router_plugin_denied');
  out.models ??= {}; out.models.mode ??= 'merge'; out.models.providers ??= {};
  out.models.providers['rein-magpie'] = fragment.models.providers['rein-magpie'];
  out.agents ??= {}; out.agents.defaults ??= {};
  const defaults = out.agents.defaults;
  // An absent models map means unrestricted catalog, so do not introduce an allowlist.
  if (defaults.models !== undefined) {
    for (const id of previousModels) delete defaults.models[`rein-magpie/${id}`];
    Object.assign(defaults.models, fragment.agents.defaults.models);
  }
  let target = defaults;
  if (targetAgent !== 'defaults') {
    target = (out.agents.list ?? []).find(a => a.id === targetAgent) ?? out.agents.entries?.[targetAgent];
    if (!target) throw new Error('router_target_agent_missing');
  }
  target.model = fragment.agents.defaults.model;
  if (fragment.agents.defaults.decisionModel) target.decisionModel = fragment.agents.defaults.decisionModel;
  else if (host.plugins?.entries?.['rein-router']?.config?.decision?.allowPaidJev && target.decisionModel === 'typesafe/jev-latest')
    delete target.decisionModel;
  out.plugins ??= {}; out.plugins.entries ??= {}; out.plugins.load ??= {};
  if (out.plugins.allow !== undefined) out.plugins.allow = [...new Set([...out.plugins.allow, ...fragment.plugins.allow])];
  out.plugins.load.paths = [...new Set([...(out.plugins.load.paths ?? []), pluginPath,
    ...(fragment.plugins.entries.typesafe ? [typesafePath] : [])])];
  Object.assign(out.plugins.entries, fragment.plugins.entries);
  const typesafe = out.plugins.entries.typesafe;
  const usesTypeSafe = [defaults, ...(out.agents.list ?? []), ...Object.values(out.agents.entries ?? {})]
    .some(a => typeof a.decisionModel === 'string' && a.decisionModel.startsWith('typesafe/'));
  if (!fragment.plugins.entries.typesafe && !usesTypeSafe && typesafe?.config?.apiKey?.id === 'JEV_API_KEY')
    typesafe.enabled = false;
  return out;
}
