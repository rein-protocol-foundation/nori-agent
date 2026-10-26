import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readMagpieCatalog, recommendPolicy, compileCatalog, mergeRouterFragment } from '../plugins/rein-router/catalog-sync.mjs';
import { assertManagedSpendPolicy } from '../plugins/rein-router/spend-policy.mjs';
import { magpiePaths } from './magpie-dependency.mjs';
import { readPrivate, writePrivate } from './router-console-store.mjs';

function parseHost(text) {
  try { return JSON.parse(text); }
  catch { return createRequire(new URL('../vendor/openclaw/package.json', import.meta.url))('json5').parse(text); }
}

const FILE = 'runtime/magpie/router-console.json';
const ENV = 'runtime/magpie/gateway.env';
const SECRET = 'runtime/magpie/router-console-secret.json';
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const validJevKey = v => typeof v === 'string' && Boolean(v.trim()) && v.length <= 4096 && !/[\x00-\x1f]/.test(v);
function plain(value) {
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every(plain);
  return Object.getPrototypeOf(value) === Object.prototype && Object.entries(value).every(([key, child]) =>
    !['__proto__', 'constructor', 'prototype'].includes(key) && plain(child));
}

export function validateConsoleSettings(s) {
  if (!object(s) || !plain(s) || Object.keys(s).some(k => !['enabled','dynamic','allowPaidUsage','funding','policy','fallbacks','minProbability','adminSenders','targetAgent'].includes(k)))
    throw new Error('router_settings_invalid');
  for (const k of ['enabled','dynamic','allowPaidUsage']) if (s[k] !== undefined && typeof s[k] !== 'boolean') throw new Error('router_settings_invalid');
  if (s.funding && (!object(s.funding) || Object.entries(s.funding).some(([id,v]) =>
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || !object(v) || Object.keys(v).some(k => !['mode','confirmed'].includes(k)) ||
    !['subscription','coding-plan','pay-as-you-go'].includes(v.mode) || typeof v.confirmed !== 'boolean'))) throw new Error('router_funding_invalid');
  if (s.policy && (!object(s.policy) || Object.entries(s.policy).some(([role,v]) =>
    !['general','quick','research','code'].includes(role) || !object(v) || Object.keys(v).some(k => !['model','effort'].includes(k)) ||
    typeof v.model !== 'string' || v.model.length > 320 || !['off','low','medium','high'].includes(v.effort)))) throw new Error('router_policy_invalid');
  if (s.targetAgent !== undefined && (typeof s.targetAgent !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(s.targetAgent))) throw new Error('router_target_agent_invalid');
  return structuredClone(s);
}

export function createConsoleSync({ root, native, gatewayBaseUrl = 'http://127.0.0.1:3425/v1',
  spendCheck = assertManagedSpendPolicy }) {
  let state = { enabled: false, dynamic: false, funding: {}, policy: {}, fallbacks: [] };
  let catalog = [], lastError = null, lastSync = null, digest, busy = Promise.resolve();
  const statePath = join(root, FILE), secretPath = join(root, SECRET), configPath = join(root, 'runtime/openclaw/openclaw.json');
  const paths = magpiePaths(root);
  const keyName = `Rein Router Console ${createHash('sha256').update(root).digest('hex').slice(0,16)}`;
  const locked = fn => { const result = busy.then(fn); busy = result.catch(() => {}); return result; };
  let key;
  async function ownedKey() {
    const data = await native('/api/caller-keys');
    const records = data.keys.filter(k => k.name === keyName);
    if (records.length > 1) throw new Error('router_key_ambiguous');
    if (!records.length) {
      const made = await native('/api/caller-keys/add-key', { name: keyName });
      const entry = made.keys.find(k => k.name === keyName);
      if (!entry) throw new Error('router_key_invalid');
      await native('/api/caller-keys/off-key', { key: entry.id });
      key = { ...entry, off: true, secret: made.secret };
    } else {
      const copied = await native('/api/caller-keys/copy-key', { key: records[0].id });
      key = { ...records[0], secret: copied.secret };
    }
    if (!key || !/^sk-magpie-key-[A-Za-z0-9_-]{16,240}$/.test(key.secret)) throw new Error('router_key_invalid');
    return key;
  }
  async function disableKey() {
    const keys = (await native('/api/caller-keys')).keys.filter(k => k.name === keyName);
    for (const k of keys) await native('/api/caller-keys/off-key', { key: k.id });
  }
  async function publish() {
    const hostText = await readPrivate(root, configPath, undefined, { publicFile: true });
    const host = parseHost(hostText);
    const gateway = { baseUrl: gatewayBaseUrl, apiKeyEnvVar: 'REIN_MAGPIE_GATEWAY_KEY', subscriptionOnly: !state.allowPaidUsage,
      managed: { binaryPath: paths.binary, homeDir: paths.homeDir, allowSubscriptionAccounts: true, mode: 'console' } };
    const result = compileCatalog({ catalog, settings: state, gateway, pluginPath: resolve(root, 'plugins/rein-router') });
    await spendCheck({ gateway, routes: result.fragment.plugins.entries['rein-router'].config.routes, allowPaidUsage: state.allowPaidUsage });
    const secret = JSON.parse(await readPrivate(root, secretPath, '{}'));
    if (state.dynamic && !validJevKey(secret.jevApiKey)) throw new Error('router_jev_key_required');
    const fingerprint = createHash('sha256').update(JSON.stringify(result.fragment)).digest('hex');
    const desiredModels = [...new Set(result.eligible.map(m => m.id))].sort();
    const current = await ownedKey();
    // Off -> exact scope -> config publication -> on. No unrestricted key reaches OpenClaw.
    const scoped = !current.off && JSON.stringify([...(current.models ?? [])].sort()) === JSON.stringify(desiredModels);
    const merged = mergeRouterFragment(host, result.fragment, { pluginPath: resolve(root, 'plugins/rein-router'),
      typesafePath: resolve(root, 'vendor/openclaw/extensions/typesafe'),
      targetAgent: state.targetAgent ?? 'defaults',
      previousModels: host.models?.providers?.['rein-magpie']?.models?.map(m => m.id) ?? [] });
    const next = JSON.stringify(merged, null, 2) + '\n';
    if (fingerprint !== digest || !scoped || JSON.stringify(host) !== JSON.stringify(merged)) {
      await native('/api/caller-keys/off-key', { key: current.id });
      try {
        await native('/api/caller-keys/models-key', { key: current.id, models: desiredModels });
        // Persist the first pre-console profile once for a simple, explicit rollback.
        const backup = join(root, 'runtime/openclaw/openclaw.before-router-console.json');
        if (await readPrivate(root, backup, '', { publicFile: true }) === '') await writePrivate(root, backup, hostText, '');
        await writePrivate(root, join(root, ENV), `REIN_MAGPIE_GATEWAY_KEY=${current.secret}\n`);
        if (JSON.stringify(host) !== JSON.stringify(merged)) await writePrivate(root, configPath, next, hostText);
        await native('/api/caller-keys/on-key', { key: current.id });
        digest = fingerprint;
      } catch (e) { await disableKey(); throw e; }
    }
    lastSync = new Date().toISOString(); lastError = null;
  }
  async function refreshInner({ repair = true } = {}) {
    // Pausing is independent of catalog availability. Retry revocation on every disabled refresh.
    if (!state.enabled) await disableKey();
    catalog = readMagpieCatalog(await native('/api/providers'));
    if (state.enabled) {
      if (repair) {
        const eligible = catalog.filter(m => !m.hasFallback && state.funding?.[m.providerId]?.confirmed &&
          (state.funding[m.providerId].mode !== 'pay-as-you-go' || state.allowPaidUsage));
        const recommendations = recommendPolicy(eligible.filter(m => state.funding[m.providerId].mode !== 'coding-plan'));
        const nextPolicy = { ...state.policy };
        for (const [role, choice] of Object.entries(nextPolicy)) {
          const current = eligible.find(m => m.id === choice.model);
          if (!current || !current.efforts.includes(choice.effort)) nextPolicy[role] = recommendations[role];
        }
        for (const [role, choice] of Object.entries(nextPolicy)) if (!choice) delete nextPolicy[role];
        if (JSON.stringify(nextPolicy) !== JSON.stringify(state.policy)) {
          state = { ...state, policy: nextPolicy };
          await writePrivate(root, statePath, JSON.stringify(state, null, 2) + '\n');
        }
      }
      try { await publish(); }
      catch (e) { await disableKey(); lastError = /^router_[a-z_]+$/.test(e.message) ? e.message : 'router_sync_failed'; throw new Error(lastError); }
    }
    return view();
  }
  async function view() {
    const secret = JSON.parse(await readPrivate(root, secretPath, '{}'));
    const host = parseHost(await readPrivate(root, configPath, '{}', { publicFile: true }));
    const agentTargets = [...new Set([...(host.agents?.list ?? []).map(a => a.id), ...Object.keys(host.agents?.entries ?? {})])];
    return { settings: structuredClone(state), agentTargets, catalog, recommendations: recommendPolicy(catalog), lastSync, error: lastError,
      jevKeyConfigured: validJevKey(secret.jevApiKey),
      configPath, openclawModel: 'rein-magpie/auto' };
  }
  return {
    async init() {
      await disableKey();
      try { state = validateConsoleSettings(JSON.parse(await readPrivate(root, statePath, JSON.stringify(state)))); return await this.refresh(); }
      catch (e) { lastError = /^router_[a-z_]+$/.test(e.message) ? e.message : 'router_settings_invalid'; throw new Error(lastError); }
    },
    refresh: () => locked(async () => {
      try { return await refreshInner(); }
      catch (e) { lastError = /^router_[a-z_]+$/.test(e.message) ? e.message : 'router_sync_failed'; throw new Error(lastError); }
    }),
    view,
    save: (settings, jevApiKey) => locked(async () => {
      const next = validateConsoleSettings(settings);
      if (jevApiKey !== undefined && !validJevKey(jevApiKey))
        throw new Error('router_jev_key_invalid');
      if (jevApiKey) await writePrivate(root, secretPath, JSON.stringify({ jevApiKey }));
      state = next;
      await writePrivate(root, statePath, JSON.stringify(state, null, 2) + '\n');
      try {
        await refreshInner({ repair: false });
        await writePrivate(root, statePath, JSON.stringify(state, null, 2) + '\n');
        return view();
      } catch (e) { throw e; }
    }),
    close: () => locked(async () => { await disableKey(); }),
  };
}
