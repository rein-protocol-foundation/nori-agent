import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { buildManagedEnvironment, ensureManagedDirectories } from '../plugins/rein-router/managed-gateway.mjs';
import { verifyMagpieInstallation } from '../scripts/magpie-dependency.mjs';
import { refreshNoriUsage } from '../scripts/nori-usage-sources.mjs';

test('native reported usage prices historical models and deduplicates after restart', {
  skip: process.env.REIN_RUN_NATIVE_USAGE_SOURCES !== '1', timeout: 45000,
}, async t => {
  const { binaryPath } = await verifyMagpieInstallation();
  const temp = await mkdtemp(join(tmpdir(), 'nori-native-reported-'));
  let child;
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  t.after(async () => { await stop(); await rm(temp, { recursive: true, force: true }); });
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const env = buildManagedEnvironment({ homeDir: join(temp, 'home'), baseUrl: `${origin}/v1`,
    environment: { PATH: process.env.PATH, LANG: 'C.UTF-8' } });
  Object.assign(env, { MAGPIE_ADDR: `127.0.0.1:${port}`, MAGPIE_NO_ACCOUNTS: '1',
    HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1',
    ALL_PROXY: 'http://127.0.0.1:1', NO_PROXY: '' });
  await ensureManagedDirectories(env);
  const config = join(env.XDG_CONFIG_HOME, 'magpie'), cache = join(env.XDG_CACHE_HOME, 'magpie');
  await mkdir(config, { recursive: true }); await mkdir(cache, { recursive: true });
  await writeFile(join(config, 'settings.json'), JSON.stringify({ noAutoUpdate: true,
    noAccountDiscovery: true, noStats: true, noUsageStats: true, quotaReads: 'asked' }));
  await writeFile(join(config, 'providers.json'), JSON.stringify({ noAutoGroups: true, providers: [{
    id: 'fixture', name: 'Synthetic', key: 'synthetic-only', chat: 'http://127.0.0.1:1/v1',
    catalog: 'fixture', models: ['current-model'],
  }] }));
  // Historical model deliberately absent from the provider's selectable inventory.
  await writeFile(join(cache, 'models.json'), JSON.stringify({ fixture: { id: 'fixture', models: {
    'historical-model': { id: 'historical-model', cost: { input: 1, output: 4, cache_read: 0.1 } },
  } } }));
  async function start() {
    child = spawn(binaryPath, ['serve'], { env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Native fixture exited');
      try { if ((await fetch(`${origin}/v1/models`, { signal: AbortSignal.timeout(100) })).ok) return; } catch {}
      await delay(50);
    }
    throw new Error('Native fixture did not become ready');
  }
  const row = { t: new Date().toISOString(), agent: 'nori-fixture', provider: 'fixture',
    model: 'historical-model', rid: `nori-usage:${'a'.repeat(64)}`, in: 1_000_000,
    out: 100_000, cache_read: 2_000_000, cache_write: 0, reasoning: 50_000, status: 200, ms: 0 };
  const bounds = { start: new Date(Date.now() - 60_000).toISOString(), end: new Date(Date.now() + 60_000).toISOString() };
  const importPath = join(temp, 'owned-export.json');
  const { ms, ...exportRow } = row;
  await writeFile(importPath, JSON.stringify({ schemaVersion: 1, sourceId: 'nori-fixture',
    exportedAt: new Date().toISOString(), exporterUid: process.getuid?.() ?? 0, interval: bounds,
    rows: [{ ...exportRow, cache_write_1h: 0, priced: false, cost: 0 }], coverage: { complete: true } }), { mode: 0o600 });
  const sourceConfig = { imports: [{ id: 'nori-fixture', path: importPath, expectedUid: process.getuid?.() ?? 0, maxAgeHours: 1 }] };
  const exportConfigPath = join(temp, 'export-config.json');
  await writeFile(exportConfigPath, JSON.stringify({ ...sourceConfig, sourceId: 'nori-fixture-export' }), { mode: 0o600 });
  const program = await readFile(new URL('../scripts/nori-usage-sources.mjs', import.meta.url), 'utf8');
  const exported = spawnSync(process.execPath, ['--input-type=module', '-', 'export',
    '--export-config', exportConfigPath, '--start', bounds.start, '--end', bounds.end], {
    cwd: '/', input: program, encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8' },
  });
  assert.equal(exported.status, 0, exported.stderr);
  assert.equal(JSON.parse(exported.stdout).rows.length, 1, 'fixed exporter works over stdin without checkout access');
  const refresh = () => refreshNoriUsage({ config: sourceConfig, bounds, magpieUrl: origin });
  await start();
  const models = await (await fetch(`${origin}/v1/models`)).json();
  assert.equal(models.data.some(m => m.id === 'fixture/historical-model'), false);
  assert.equal((await refresh()).refresh.accepted, 1);
  assert.equal((await refresh()).refresh.skipped, 1);
  await stop(); await start();
  assert.equal((await refresh()).refresh.skipped, 1);
  const page = await (await fetch(`${origin}/v1/magpie/usage/requests?period=all&via=reported`)).json();
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].priced, true);
  assert.equal(page.rows[0].cost, 1.6);
  assert.equal(page.rows[0].source, 'reported');
  assert.equal(page.rows[0].rid, row.rid);
});
