import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimes = new Map();

/** Consume the pinned build's named lock facade; never guess PID-file formats. */
export function loadGatewayControlRuntime(root) {
  const dist = resolve(root, 'vendor/openclaw/dist');
  if (!runtimes.has(dist)) runtimes.set(dist, (async () => {
    const candidates = (await readdir(dist)).filter(name => /^gateway-lock-[\w-]+\.mjs$/.test(name));
    let locks;
    for (const name of candidates) {
      const module = await import(pathToFileURL(join(dist, name)).href);
      if (typeof module.readActiveGatewayLockIdentity === 'function' && typeof module.resolveGatewayLockPaths === 'function') {
        if (locks) throw new Error('project_gateway_runtime_ambiguous');
        locks = module;
      }
    }
    if (!locks) throw new Error('project_gateway_build_required');
    const { acquireFileLock } = await import(pathToFileURL(join(dist, 'plugin-sdk/file-lock.js')).href);
    return { ...locks, acquireFileLock };
  })().catch(() => { runtimes.delete(dist); throw new Error('project_gateway_build_required'); }));
  return runtimes.get(dist);
}
