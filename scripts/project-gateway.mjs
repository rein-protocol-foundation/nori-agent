import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, mkdir, realpath } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { loadGatewayControlRuntime } from './project-gateway-runtime.mjs';
import { readPrivate, regularPath } from './router-console-store.mjs';
import { stopOwnedProcessTree } from '../plugins/rein-router/process-tree.mjs';

const pause = ms => new Promise(resolveDone => setTimeout(resolveDone, ms));
const sameOwner = (a, b) => a && b && a.pid === b.pid && a.ownerId === b.ownerId &&
  a.startTime === b.startTime && a.createdAt === b.createdAt;
const commands = new Set(['start', 'stop', 'restart', 'status']);
const failure = code => new Error(`project_gateway_${code}`);

function parseOptions(command, args) {
  const options = { json: false, force: false, timeoutMs: command === 'start' ? 120000 : 60000 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') options.json = true;
    else if (args[i] === '--safe' && command === 'restart') { /* Graceful is the project default. */ }
    else if (args[i] === '--force' && ['stop', 'restart'].includes(command)) options.force = true;
    else if (['--port', '--timeout'].includes(args[i])) {
      const flag = args[i], value = Number(args[++i]);
      if (!Number.isSafeInteger(value) || value < 1 || value > (flag === '--port' ? 65535 : 300000)) throw failure('arguments_invalid');
      if (flag === '--port') options.port = value; else options.timeoutMs = value;
    } else throw failure('arguments_invalid');
  }
  if (command === 'stop' && options.port !== undefined) throw failure('arguments_invalid');
  return options;
}

async function occupied(port) {
  return new Promise(resolveBusy => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = busy => { socket.destroy(); resolveBusy(busy); };
    socket.once('connect', () => done(true)); socket.once('error', error => done(error.code !== 'ECONNREFUSED'));
    socket.setTimeout(500, () => done(true));
  });
}

async function healthy(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/readyz`, { redirect: 'error', signal: AbortSignal.timeout(750) });
    return response.ok && (await response.json()).ready === true;
  } catch { return false; }
}

export async function createProjectGateway({ root, environment, loadEnvironment,
  runtime = undefined, spawnImpl = spawn, health = healthy, portBusy = occupied,
  signal = (pid, name) => process.kill(pid, name), cleanup = stopOwnedProcessTree }) {
  root = await realpath(root);
  const stateDir = join(root, 'runtime/openclaw'), configPath = join(stateDir, 'openclaw.json');
  const env = { ...environment, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath };
  const logPath = join(stateDir, 'logs/project-gateway.log');
  runtime ??= await loadGatewayControlRuntime(root);
  const paths = runtime.resolveGatewayLockPaths(env);
  const readOwner = async () => {
    const owner = await runtime.readActiveGatewayLockIdentity({ env, requireInspection: true, timeoutMs: 2000 });
    if (!owner) return undefined;
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 1 || owner.pid === process.pid) throw failure('owner_invalid');
    // Native identity inspection proves process birth and liveness. Bind its
    // lock payload to this exact project as well before accepting any signal.
    const payloads = await Promise.all([paths.configLockPath, paths.stateLockPath].map(path => runtime.readLockPayload(path, true)));
    const payload = payloads.find(p => sameOwner(p, owner));
    if (!payload || resolve(payload.configPath) !== configPath || resolve(payload.stateDir ?? '') !== stateDir)
      throw failure('owner_foreign');
    return owner;
  };
  async function configuredPort() {
    let config;
    try {
      const text = await readPrivate(root, configPath, undefined, { publicFile: true });
      try { config = JSON.parse(text); }
      catch { config = createRequire(join(root, 'vendor/openclaw/package.json'))('json5').parse(text); }
    } catch { throw failure('config_invalid'); }
    const port = Number(env.OPENCLAW_GATEWAY_PORT ?? config.gateway?.port ?? 18791);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw failure('port_invalid');
    return port;
  }
  async function status(options = {}) {
    const owner = await readOwner(), port = owner?.port ?? options.port ?? await configuredPort();
    return { status: owner ? 'running' : await portBusy(port) ? 'port-occupied' : 'stopped',
      ...(owner ? { pid: owner.pid } : {}), port, healthy: owner ? await health(port) : false, configPath, logPath };
  }
  async function stop(options) {
    const owner = await readOwner();
    if (!owner) return { status: 'stopped', alreadyStopped: true };
    if (!sameOwner(owner, await readOwner())) throw failure('owner_changed');
    try { signal(owner.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw failure('signal_failed'); }
    const waitUntil = async deadline => {
      while (Date.now() < deadline) {
        if (await runtime.resolveGatewayOwnerStatus(owner.pid, owner, process.platform) === 'dead') return true;
        const current = await readOwner();
        if (current && !sameOwner(owner, current)) throw failure('owner_changed');
        await pause(100);
      }
      return false;
    };
    if (!await waitUntil(Date.now() + options.timeoutMs)) {
      if (!options.force) throw failure('stop_timeout');
      if (!sameOwner(owner, await readOwner())) throw failure('owner_changed');
      signal(owner.pid, 'SIGKILL');
      if (!await waitUntil(Date.now() + 5000)) throw failure('stop_timeout');
    }
    const current = await readOwner();
    if (current) throw failure('owner_changed');
    return { status: 'stopped', pid: owner.pid };
  }
  async function start(options) {
    const owner = await readOwner();
    if (owner) return { ...await status(options), alreadyRunning: true };
    const port = options.port ?? await configuredPort();
    if (await portBusy(port)) throw failure('port_occupied');
    const launchEnv = loadEnvironment(); // Validate credentials before spawning.
    await regularPath(root, logPath); await mkdir(join(stateDir, 'logs'), { recursive: true, mode: 0o700 });
    let child, spawnError, interrupted = false;
    const interrupt = () => { interrupted = true; };
    for (const name of ['SIGINT', 'SIGTERM']) process.on(name, interrupt);
    try {
      const log = await open(logPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try {
        const info = await log.stat();
        if (!info.isFile() || info.nlink !== 1) throw failure('log_invalid');
        await log.chmod(0o600);
        if (interrupted) throw failure('interrupted');
        child = spawnImpl(process.execPath, [join(root, 'scripts/openclaw.mjs'), 'gateway', 'run', '--port', String(port)],
          { cwd: root, env: { ...launchEnv, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath },
            detached: true, stdio: ['ignore', log.fd, log.fd], windowsHide: true, shell: false });
        child.once('error', () => { spawnError = true; });
      } finally { await log.close(); }
      const deadline = Date.now() + options.timeoutMs;
      while (Date.now() < deadline) {
        if (interrupted) throw failure('interrupted');
        const current = await readOwner();
        if (current && await health(current.port) && sameOwner(current, await readOwner())) {
          child.unref(); return { status: 'running', pid: current.pid, port: current.port, healthy: true, logPath, configPath };
        }
        if (spawnError || child.exitCode !== null || child.signalCode !== null) throw failure('start_failed');
        await pause(200);
      }
      throw failure('start_timeout');
    } catch (error) {
      if (child?.pid && child.exitCode === null && child.signalCode === null) await cleanup(child);
      throw error;
    } finally { for (const name of ['SIGINT', 'SIGTERM']) process.off(name, interrupt); }
  }
  return {
    async execute(command, options = {}) {
      options = { timeoutMs: command === 'start' ? 120000 : 60000, ...options };
      if (command === 'status') return status(options);
      await regularPath(root, join(stateDir, 'project-gateway-control'));
      await mkdir(stateDir, { recursive: true, mode: 0o700 });
      const lock = await runtime.acquireFileLock(join(stateDir, 'project-gateway-control'), {
        retries: { retries: Math.ceil(options.timeoutMs / 250), factor: 1, minTimeout: 250, maxTimeout: 250 }, stale: 300000,
        staleRecovery: 'remove-if-definitely-stale',
      });
      try {
        if (command === 'start') return await start(options);
        if (command === 'stop') return await stop(options);
        if (command === 'restart') { await configuredPort(); loadEnvironment(); await stop(options); return await start(options); }
        throw failure('arguments_invalid');
      } finally { await lock.release(); }
    },
  };
}

const help = `Project-local Gateway (uses runtime/openclaw; no system service installation)
  gateway run                         Foreground; Ctrl+C stops it
  gateway start [--port N] [--json]   Background; logs/project-gateway.log
  gateway stop [--force] [--json]     Gracefully stop this project's instance
  gateway restart [--safe] [--json]   Stop and start with fresh configuration
  gateway status [--json]            Inspect this project's verified instance
  --timeout N                        Wait budget in milliseconds
Background start does not enable automatic startup at login or reboot.`;

export async function runProjectGatewayCommand(args, options) {
  const foreground = args[0] === 'gateway' && args[1] === 'run';
  if (args[0] !== 'gateway' || (!foreground && !commands.has(args[1]))) return null;
  // Keep upstream's foreground flags/help, but detect our existing owner before
  // upstream startup tries to enter Doctor maintenance and reports contention
  // as a migration failure. Native locking still arbitrates concurrent starts.
  if (foreground && (args.includes('--help') || args.includes('-h'))) return null;
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return 0; }
  try {
    if (foreground) {
      const gateway = await createProjectGateway(options);
      const current = await gateway.execute('status');
      if (current.status !== 'running') return null;
      console.error(`Project Gateway is already running (pid ${current.pid}) on 127.0.0.1:${current.port}${current.healthy ? ' — ready' : ' — not ready'}.\n` +
        'Use "npm run toolchain:pnpm -- openclaw gateway status" to inspect it.\n' +
        'To switch to foreground, run "npm run toolchain:pnpm -- openclaw gateway stop", then repeat gateway run.\n' +
        'To restart in the background, use "npm run toolchain:pnpm -- openclaw gateway restart".');
      return 1;
    }
    const parsed = parseOptions(args[1], args.slice(2));
    const gateway = await createProjectGateway(options);
    const result = await gateway.execute(args[1], parsed);
    if (parsed.json) console.log(JSON.stringify(result));
    else console.log(`Project Gateway: ${result.status}${result.pid ? ` (pid ${result.pid})` : ''}${result.port ? ` on 127.0.0.1:${result.port}` : ''}${result.healthy === false && result.status === 'running' ? ' — not ready' : ''}${result.logPath ? `\nBackground log: ${result.logPath}` : ''}`);
    return 0;
  } catch (error) {
    const code = /^(?:project_gateway_|magpie_gateway_env_|rein_magpie_|file_lock_)[a-z_]+$/.test(error?.message ?? '') ? error.message : 'project_gateway_control_failed';
    if (args.includes('--json')) console.log(JSON.stringify({ error: code }));
    else console.error(`${code}. See gateway ${args[1]} --help and runtime/openclaw/logs/project-gateway.log.`);
    return 1;
  }
}
