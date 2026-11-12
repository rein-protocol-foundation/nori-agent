import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManagedEnvironment, ensureManagedDirectories } from '../plugins/rein-router/managed-gateway.mjs';
import { verifyMagpieInstallation } from '../scripts/magpie-dependency.mjs';

test('native catalog mapping reprices history without changing subscription access or usage',
  { skip: process.env.REIN_RUN_NATIVE_BAILIAN_PRICING !== '1', timeout: 30000 }, async t => {
    const { binaryPath } = await verifyMagpieInstallation();
    const temp = await mkdtemp(join(tmpdir(), 'nori-receipt-price-'));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const env = buildManagedEnvironment({ homeDir: join(temp, 'home'), baseUrl: 'http://127.0.0.1:3425/v1',
      environment: { PATH: process.env.PATH, LANG: 'C.UTF-8' } });
    // Only a synthetic ledger is read. Refuse any optional catalog-refresh egress.
    Object.assign(env, { HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1',
      ALL_PROXY: 'http://127.0.0.1:1', NO_PROXY: '', MAGPIE_NO_ACCOUNTS: '1' });
    await ensureManagedDirectories(env);
    const config = join(env.XDG_CONFIG_HOME, 'magpie'), cache = join(env.XDG_CACHE_HOME, 'magpie');
    await mkdir(config, { recursive: true, mode: 0o700 });
    await mkdir(cache, { recursive: true, mode: 0o700 });
    const provider = { id: 'bailian-token-plan', name: 'Bailian Token Plan', preset: 'bailian-token-plan',
      key: 'sk-sp-synthetic-pricing-fixture',
      chat: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      anthropic: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic',
      models: ['deepseek-v4.1-flash'], contexts: { 'deepseek-v4.1-flash': 1000000 } };
    const providersPath = join(config, 'providers.json');
    await writeFile(providersPath, JSON.stringify({ providers: [provider], noAutoGroups: true }), { mode: 0o600 });
    // Deliberately synthetic rates; this test makes no assertion about market prices.
    await writeFile(join(cache, 'models.json'), JSON.stringify({ 'alibaba-cn': { id: 'alibaba-cn',
      models: { 'deepseek-v4.1-flash': { id: 'deepseek-v4.1-flash', cost: { input: 1, output: 4, cache_read: 0.1 } } } } }));
    const usagePath = join(config, 'usage.jsonl');
    const ledger = `${JSON.stringify({ t: new Date().toISOString(), agent: 'synthetic', provider: provider.id,
      model: provider.models[0], served: provider.models[0], in: 1000000, out: 100000,
      cache_read: 2000000, cache_write: 0, reasoning: 50000, ms: 1000, status: 200 })}\n`;
    await writeFile(usagePath, ledger, { mode: 0o600 });
    const run = args => {
      const result = spawnSync(binaryPath, args, { env, encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, `Native Magpie failed: ${args.join(' ')} (${result.error?.code ?? result.status})`);
      return result.stdout.trim();
    };
    const csvCost = () => {
      const lines = run(['usage', '--csv', 'all']).split(/\r?\n/);
      assert.equal(lines.length, 2);
      const headers = lines[0].split(','), cells = lines[1].split(',');
      assert.equal(cells[headers.indexOf('model')], provider.models[0]);
      return cells[headers.indexOf('cost_usd')];
    };
    assert.equal(csvCost(), '', 'missing mapping must remain unpriced');
    run(['provider', 'set', provider.id, 'catalog=alibaba-cn']);
    assert.equal(Number(csvCost()), 1.6, 'cache counts once; reasoning is already in output');
    const stored = JSON.parse(await readFile(providersPath, 'utf8')).providers.find(p => p.id === provider.id);
    assert.equal(stored.catalog, 'alibaba-cn');
    for (const field of ['key', 'chat', 'anthropic', 'models', 'contexts']) assert.deepEqual(stored[field], provider[field]);
    assert.equal(await readFile(usagePath, 'utf8'), ledger, 'history must not be rewritten');
    run(['provider', 'set', provider.id, 'catalog=']);
    assert.equal(csvCost(), '', 'removing the catalog restores the prior unpriced behavior');
  });
