import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseEnv } from 'node:util';
import { magpiePaths, projectRoot } from './magpie-dependency.mjs';
import { isGatewayCredentialEnvironmentName } from '../plugins/rein-router/policy.mjs';

const KEY = /^sk-magpie-key-[A-Za-z0-9_-]{16,240}$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function refuse(reason) {
  const code = `magpie_gateway_env_${reason}`;
  const error = new Error(code); error.code = code; throw error;
}

function readRegular(path, maxBytes, { optional = false, privateMode = false } = {}) {
  let descriptor;
  try { descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.nlink !== 1 || info.size > maxBytes) refuse('file_invalid');
    if (privateMode && process.platform !== 'win32' && (info.mode & 0o777) !== 0o600) refuse('file_permissions');
    return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(descriptor));
  } finally { closeSync(descriptor); }
}

function privateEnvironmentPath(root) {
  const components = ['runtime', 'magpie', 'gateway.env'];
  let path = root;
  for (const [index, part] of components.entries()) {
    path = join(path, part);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) refuse('symlink_refused');
    if (index < components.length - 1 && !info.isDirectory()) refuse('path_invalid');
  }
  return path;
}

/** Only an active project-owned gateway receives its declared gateway and singleton-route secrets. */
export function loadMagpieGatewayEnvironment({ root = projectRoot, environment = process.env } = {}) {
  try {
    if (typeof root !== 'string' || !isAbsolute(root) || !object(environment)) refuse('arguments_invalid');
    const copy = { ...environment };
    // JEV_API_KEY is only a transport for a configured project credential.
    // Never let a shell export become the credential source, even if the
    // project has no saved key or routing is disabled.
    delete copy.JEV_API_KEY;
    const configPath = copy.OPENCLAW_CONFIG_PATH;
    if (typeof configPath !== 'string' || !isAbsolute(configPath)) return copy;
    let host;
    try {
      const text = readRegular(configPath, 4 * 1024 * 1024, { optional: true });
      if (text === null) return copy;
      host = JSON.parse(text);
    } catch { return copy; }
    const plugins = host?.plugins;
    const entry = plugins?.entries?.['rein-router'];
    if (plugins?.enabled === false || plugins?.deny?.includes('rein-router') ||
        (Array.isArray(plugins?.allow) && !plugins.allow.includes('rein-router')) ||
        entry?.enabled !== true || entry?.config?.enabled !== true) return copy;
    const canonicalRoot = realpathSync(root);
    const paths = magpiePaths(canonicalRoot);
    const gateway = entry.config.gateway;
    if (!object(gateway?.managed) || gateway.managed.binaryPath !== paths.binary ||
        gateway.managed.homeDir !== paths.homeDir) return copy;
    // The console owns this project's credentials. A shell may still export an
    // older key after a UI edit or rotation; use the validated local store for
    // this child process without changing the shell or either credential file.
    const consoleManaged = gateway.managed.mode === 'console';
    const name = gateway.apiKeyEnvVar;
    if (!isGatewayCredentialEnvironmentName(name)) refuse('variable_disallowed');
    const scopedIds = new Set(Object.values(entry.config.scopedPolicies ?? {}).flatMap(policy => policy.allowedRoutes ?? []));
    const routeNames = (entry.config.routes ?? []).filter(route => scopedIds.has(route.id)).map(route => route.gatewayKeyEnvVar);
    const allowed = new Set([name, ...routeNames]);
    if ([...allowed].some(variable => !isGatewayCredentialEnvironmentName(variable))) refuse('variable_disallowed');
    const text = readRegular(privateEnvironmentPath(canonicalRoot), allowed.size === 1 ? 4096 : 32768, { privateMode: true });
    const parsed = parseEnv(text);
    const entries = Object.keys(parsed);
    const declarations = text.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'));
    if (entries.length !== allowed.size || declarations.length !== allowed.size ||
        entries.some(variable => !allowed.has(variable) || !KEY.test(parsed[variable])) ||
        [...allowed].some(variable => declarations.filter(line => new RegExp(`^\\s*(?:export\\s+)?${variable}\\s*=`).test(line)).length !== 1))
      refuse('contents_invalid');
    for (const variable of allowed) {
      if (!consoleManaged && copy[variable] !== undefined && copy[variable] !== parsed[variable]) refuse('existing_value_conflict');
      copy[variable] = parsed[variable];
    }
    const otherTypeSafeUse = host.plugins?.entries?.typesafe?.enabled === true &&
      host.plugins.entries.typesafe.config?.apiKey?.id === 'JEV_API_KEY' &&
      [host.agents?.defaults, ...(host.agents?.list ?? []), ...Object.values(host.agents?.entries ?? {})]
        .some(agent => typeof agent?.decisionModel === 'string' && agent.decisionModel.startsWith('typesafe/'));
    if (consoleManaged && (entry.config.decision?.allowPaidJev === true || otherTypeSafeUse)) {
      const secretPath = join(canonicalRoot, 'runtime/magpie/router-console-secret.json');
      try {
        const stat = lstatSync(secretPath);
        if (stat.isSymbolicLink()) refuse('symlink_refused');
        const saved = JSON.parse(readRegular(secretPath, 8192, { privateMode: true }));
        if (typeof saved.jevApiKey !== 'string' || !saved.jevApiKey.trim() || saved.jevApiKey.length > 4096 || /[\x00-\x1f]/.test(saved.jevApiKey)) refuse('contents_invalid');
        copy.JEV_API_KEY = saved.jevApiKey;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return copy;
  } catch (error) {
    if (typeof error?.code === 'string' && /^magpie_gateway_env_[a-z_]+$/.test(error.code)) throw error;
    refuse('unavailable');
  }
}
