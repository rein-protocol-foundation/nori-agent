import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/subscription-config.mjs', import.meta.url));
const config = {
  enabled: true,
  gateway: { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'REIN_SYNTHETIC_GATEWAY_KEY' },
  routes: [{ id: 'general', provider: 'Synthetic provider', gatewayModel: 'fixture/general',
    billingSource: 'Synthetic included allowance', billingMode: 'subscription', billingVerified: true,
    purpose: 'General tasks', effort: 'medium', contextWindow: 32768, maxTokens: 1024 }],
  defaultRoute: 'general', fallbackRoutes: [], decision: { allowPaidJev: false },
};

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'rein-router-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'router.json'), output = join(root, 'fragment.json');
  writeFileSync(input, JSON.stringify(config));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 10000 });
  return { root, input, output, run };
}

test('config CLI preserves stdout JSON and the optional plugin path', t => {
  const f = fixture(t), pluginPath = join(f.root, 'plugins/rein-router');
  const result = f.run(f.input, pluginPath);
  assert.equal(result.status, 0, result.stderr);
  const fragment = JSON.parse(result.stdout);
  assert.deepEqual(fragment.plugins.load.paths, [pluginPath]);
  assert.equal(fragment.agents.defaults.model.primary, 'rein-magpie/auto');
  assert.deepEqual(readdirSync(f.root), ['router.json']);
});

test('file output replaces an older fragment with private pure JSON and preserves the source', t => {
  const f = fixture(t), source = readFileSync(f.input, 'utf8');
  writeFileSync(f.output, 'outdated fragment', { mode: 0o644 });
  const result = f.run(f.input, '--output', f.output);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Wrote Router config fragment:/);
  const fragment = JSON.parse(readFileSync(f.output, 'utf8'));
  assert.equal(fragment.plugins.entries['rein-router'].config.defaultRoute, 'general');
  assert.equal(readFileSync(f.input, 'utf8'), source);
  if (process.platform !== 'win32') assert.equal(statSync(f.output).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(f.root).sort(), ['fragment.json', 'router.json']);
});

test('invalid JSON or disabled routes leave an existing output untouched', t => {
  const f = fixture(t);
  writeFileSync(f.output, 'previous fragment');
  for (const source of ['invalid JSON', JSON.stringify({ ...config, enabled: false })]) {
    writeFileSync(f.input, source);
    const result = f.run(f.input, '--output', f.output);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(f.output, 'utf8'), 'previous fragment');
    assert.deepEqual(readdirSync(f.root).sort(), ['fragment.json', 'router.json']);
  }
});

test('refuses source overwrite and malformed CLI arguments without changing files', t => {
  const f = fixture(t), source = readFileSync(f.input, 'utf8');
  for (const args of [[f.input, '--output', f.input], [f.input, '--output'],
    [f.input, '--unknown'], [f.input, '/plugin', '/extra']]) {
    const result = f.run(...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(readFileSync(f.input, 'utf8'), source);
    assert.deepEqual(readdirSync(f.root), ['router.json']);
  }
});
