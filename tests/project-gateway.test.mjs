import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectGateway, runProjectGatewayCommand } from '../scripts/project-gateway.mjs';

async function fixture(t, options = {}) {
  const root = realpathSync(await mkdtemp(join(tmpdir(), 'rein-project-gateway-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDir = join(root, 'runtime/openclaw'), configPath = join(stateDir, 'openclaw.json');
  await mkdir(stateDir, { recursive: true });
  await writeFile(configPath, JSON.stringify({ gateway: { port: 18791 } }));
  let owner, credential = 'synthetic-current-key', launches = [], signals = [], cleanups = [], loads = 0;
  let previous = Promise.resolve();
  const runtime = {
    resolveGatewayLockPaths: () => ({ configLockPath: 'config-lock', stateLockPath: 'state-lock' }),
    readActiveGatewayLockIdentity: async () => owner ? { ...owner } : undefined,
    readLockPayload: async () => owner ? { configPath, stateDir, ...owner } : null,
    resolveGatewayOwnerStatus: async () => owner ? 'alive' : 'dead',
    acquireFileLock: async () => {
      const wait = previous; let release; previous = new Promise(resolve => { release = resolve; });
      await wait; return { release };
    },
  };
  const loadEnvironment = () => { loads++; return { CURRENT_KEY: credential }; };
  const fakeSpawn = (command, args, config) => {
    const child = Object.assign(new EventEmitter(), { pid: 42000 + launches.length, exitCode: null, signalCode: null, unref() {} });
    launches.push({ command, args, config, child });
    owner = { pid: child.pid, ownerId: 'owner-' + child.pid, startTime: child.pid, createdAt: new Date().toISOString(), port: Number(args.at(-1)) };
    return child;
  };
  const gateway = await createProjectGateway({ root, environment: {}, runtime, loadEnvironment,
    health: async () => Boolean(owner), portBusy: async () => false,
    signal: (pid, name) => { signals.push({ pid, name }); owner = undefined; },
    spawnImpl: fakeSpawn, cleanup: async child => { cleanups.push(child.pid); owner = undefined; },
    ...options });
  return { gateway, runtime, root, configPath, stateDir, launches, signals, cleanups,
    get loads() { return loads; }, get owner() { return owner; }, set owner(value) { owner = value; },
    set credential(value) { credential = value; } };
}

test('background start uses the project wrapper and fresh credentials; repeat start never duplicates it', async t => {
  const f = await fixture(t);
  const started = await f.gateway.execute('start');
  assert.equal(started.status, 'running'); assert.equal(started.healthy, true);
  const launch = f.launches[0];
  assert.deepEqual(launch.args, [join(f.root, 'scripts/openclaw.mjs'), 'gateway', 'run', '--port', '18791']);
  assert.equal(launch.config.env.OPENCLAW_CONFIG_PATH, f.configPath);
  assert.equal(launch.config.env.OPENCLAW_STATE_DIR, f.stateDir);
  assert.equal(launch.config.env.CURRENT_KEY, 'synthetic-current-key');
  assert.equal(launch.config.detached, true); assert.equal(launch.config.shell, false);
  assert.equal((await stat(started.logPath)).mode & 0o777, 0o600);
  assert.equal((await f.gateway.execute('start')).alreadyRunning, true);
  assert.equal(f.launches.length, 1);
});

test('concurrent starts serialize and share the native project owner', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.gateway.execute('start'), f.gateway.execute('start')]);
  assert.equal(f.launches.length, 1); assert.equal(results.filter(r => r.alreadyRunning).length, 1);
});

test('startup and status use the Gateway readiness response rather than an open socket alone', async t => {
  let ready = true;
  const server = createServer((req, res) => {
    assert.equal(req.url, '/readyz'); res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ready }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const f = await fixture(t, { health: undefined });
  await writeFile(f.configPath, JSON.stringify({ gateway: { port: server.address().port } }));
  assert.equal((await f.gateway.execute('start')).healthy, true);
  ready = false;
  assert.equal((await f.gateway.execute('status')).healthy, false);
});

test('stop adopts a verified foreground owner without needing provider credentials and is idempotent', async t => {
  const f = await fixture(t, { loadEnvironment: () => { throw new Error('synthetic-invalid-credential'); } });
  f.owner = { pid: 43000, ownerId: 'foreground', startTime: 1, createdAt: 'synthetic', port: 18792 };
  assert.equal((await f.gateway.execute('status')).port, 18792);
  assert.equal((await f.gateway.execute('stop')).status, 'stopped');
  assert.deepEqual(f.signals, [{ pid: 43000, name: 'SIGTERM' }]);
  assert.equal((await f.gateway.execute('stop')).alreadyStopped, true);
});

test('restart validates startup settings before stopping and reloads them for the successor', async t => {
  const f = await fixture(t);
  await f.gateway.execute('start'); const firstPid = f.owner.pid;
  f.credential = 'synthetic-replacement-key';
  const result = await f.gateway.execute('restart');
  assert.notEqual(result.pid, firstPid); assert.equal(f.launches.length, 2);
  assert.equal(f.launches[1].config.env.CURRENT_KEY, 'synthetic-replacement-key');
  assert.deepEqual(f.signals, [{ pid: firstPid, name: 'SIGTERM' }]);
  const broken = await fixture(t, { loadEnvironment: () => { throw new Error('synthetic-invalid-credential'); } });
  broken.owner = { pid: 44000, ownerId: 'existing', createdAt: 'synthetic', port: 18791 };
  await assert.rejects(broken.gateway.execute('restart'), /invalid-credential/);
  assert.equal(broken.signals.length, 0); assert.ok(broken.owner);
  await writeFile(f.configPath, '{invalid-json');
  await assert.rejects(f.gateway.execute('restart'), /config_invalid/);
  assert.equal(f.signals.length, 1, 'invalid config must leave the running successor untouched');
});

test('a live lock naming another project never authorizes start or stop', async t => {
  const f = await fixture(t); await f.gateway.execute('start');
  f.runtime.readLockPayload = async () => ({ ...f.owner, configPath: '/foreign/openclaw.json', stateDir: '/foreign' });
  await assert.rejects(f.gateway.execute('stop'), /owner_foreign/);
  await assert.rejects(f.gateway.execute('start'), /owner_foreign/);
  assert.equal(f.signals.length, 0); assert.equal(f.launches.length, 1);
});

test('owner replacement between inspection and signalling is refused', async t => {
  const f = await fixture(t); await f.gateway.execute('start'); let reads = 0;
  const original = f.runtime.readActiveGatewayLockIdentity;
  f.runtime.readActiveGatewayLockIdentity = async () => {
    if (++reads === 2) f.owner = { ...f.owner, pid: 45000, ownerId: 'replacement' };
    return original();
  };
  await assert.rejects(f.gateway.execute('stop'), /owner_changed/); assert.equal(f.signals.length, 0);
});

test('port occupation without project ownership never triggers a kill or a second launch', async t => {
  const f = await fixture(t, { portBusy: async () => true });
  assert.equal((await f.gateway.execute('status')).status, 'port-occupied');
  await assert.rejects(f.gateway.execute('start'), /port_occupied/);
  assert.equal(f.launches.length, 0); assert.equal(f.signals.length, 0);
});

test('stop timeout never launches a replacement or force-kills without explicit force', async t => {
  const signals = [];
  const f = await fixture(t, { signal: (pid, name) => { signals.push({ pid, name }); } });
  await f.gateway.execute('start');
  await assert.rejects(f.gateway.execute('restart', { timeoutMs: 1 }), /stop_timeout/);
  assert.deepEqual(signals.map(s => s.name), ['SIGTERM']); assert.equal(f.launches.length, 1);
});

test('explicit force escalates only for the same verified original owner', async t => {
  const signals = []; let f;
  f = await fixture(t, { signal: (pid, name) => { signals.push({ pid, name }); if (name === 'SIGKILL') f.owner = undefined; } });
  await f.gateway.execute('start'); const pid = f.owner.pid;
  assert.equal((await f.gateway.execute('stop', { timeoutMs: 1, force: true })).status, 'stopped');
  assert.deepEqual(signals, [{ pid, name: 'SIGTERM' }, { pid, name: 'SIGKILL' }]);
});

test('failed startup cleans up its owned child and releases lifecycle control', async t => {
  const f = await fixture(t, { health: async () => false });
  await assert.rejects(f.gateway.execute('start', { timeoutMs: 1 }), /start_timeout/);
  assert.equal(f.cleanups.length, 1); assert.equal((await f.gateway.execute('stop')).alreadyStopped, true);
});

test('log symlinks cannot redirect daemon output to another file', async t => {
  const f = await fixture(t); await mkdir(join(f.stateDir, 'logs'));
  const other = join(f.root, 'other'); await writeFile(other, 'unchanged');
  await symlink(other, join(f.stateDir, 'logs/project-gateway.log'));
  await assert.rejects(f.gateway.execute('start'), /path_invalid/); assert.equal(f.launches.length, 0);
});

test('foreground help and non-lifecycle commands retain the existing upstream path', async () => {
  for (const args of [['gateway', 'run', '--help'], ['gateway', 'run', '-h'], ['gateway', 'health'], ['plugins', 'list']])
    assert.equal(await runProjectGatewayCommand(args, {}), null);
});

test('foreground launch refuses an existing owner before upstream maintenance, even on a different port', async t => {
  const f = await fixture(t);
  await f.gateway.execute('start');
  const messages = [];
  t.mock.method(console, 'error', message => messages.push(message));
  for (const ready of [true, false]) {
    assert.equal(await runProjectGatewayCommand(['gateway', 'run', '--port', '18792'], {
      root: f.root, environment: {}, runtime: f.runtime, health: async () => ready,
      loadEnvironment: () => { throw new Error('must not load provider credentials'); },
    }), 1);
    assert.match(messages.at(-1), /already running.*18791/);
    assert.match(messages.at(-1), ready ? / — ready/ : / — not ready/);
    assert.match(messages.at(-1), /gateway stop/);
  }
  assert.equal(f.signals.length, 0);
  assert.equal(f.launches.length, 1);
});

test('foreground launch without a project owner preserves upstream startup and options', async t => {
  const f = await fixture(t);
  for (const busy of [false, true]) {
    assert.equal(await runProjectGatewayCommand(['gateway', 'run', '--port', '18792', '--verbose'], {
      root: f.root, environment: {}, runtime: f.runtime, portBusy: async () => busy,
      loadEnvironment: () => { throw new Error('must not load provider credentials'); },
    }), null);
  }
  assert.equal(f.signals.length, 0);
  assert.equal(f.launches.length, 0);
});
