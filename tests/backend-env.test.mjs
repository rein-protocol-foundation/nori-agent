import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BACKEND_URL, loadBackendEnvironment } from '../scripts/backend-env.mjs';

test('local backend settings load without importing unrelated account or database secrets', t => {
  const root = mkdtempSync(join(tmpdir(), 'rein-backend-env-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, '.env.local'), [
    'REIN_BACKEND_URL="http://localhost:3000"',
    'export REIN_AGENT_CALLER_ID=synthetic-caller',
    'REIN_AGENT_CREDENTIAL=synthetic-credential',
    'REIN_PROPOSAL_CONFIRMATION_KEY=synthetic-confirmation',
    'SUPABASE_SECRET_KEY=DO_NOT_IMPORT',
    'DISCORD_TEST_PASSWORD=DO_NOT_IMPORT',
    'PATH=/do-not-import',
  ].join('\n'));
  const environment = { PATH: '/existing' };
  assert.deepEqual(loadBackendEnvironment({ root, environment }), {
    PATH: '/existing',
    REIN_BACKEND_URL: 'http://localhost:3000',
    REIN_AGENT_CALLER_ID: 'synthetic-caller',
    REIN_AGENT_CREDENTIAL: 'synthetic-credential',
    REIN_PROPOSAL_CONFIRMATION_KEY: 'synthetic-confirmation',
  });
  assert.deepEqual(environment, { PATH: '/existing' });
  const overrides = { REIN_BACKEND_URL: 'https://explicit.example', REIN_AGENT_CREDENTIAL: '' };
  const result = loadBackendEnvironment({ root, environment: overrides });
  assert.equal(result.REIN_BACKEND_URL, overrides.REIN_BACKEND_URL);
  assert.equal(result.REIN_AGENT_CREDENTIAL, '');
});

test('missing local settings use the online backend without inventing credentials', t => {
  const root = mkdtempSync(join(tmpdir(), 'rein-backend-env-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const environment = { REIN_AGENT_CALLER_ID: 'explicit' };
  const result = loadBackendEnvironment({ root, environment });
  assert.deepEqual(result, { ...environment, REIN_BACKEND_URL: DEFAULT_BACKEND_URL });
  assert.equal(DEFAULT_BACKEND_URL, 'https://rein-protocol.org');
  assert.equal(result.REIN_AGENT_CREDENTIAL, undefined);
  assert.notEqual(result, environment);
});

test('local settings without a URL use the online default; explicit empty URL is not replaced', t => {
  const root = mkdtempSync(join(tmpdir(), 'rein-backend-env-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, '.env.local'), 'REIN_AGENT_CALLER_ID=synthetic-caller\n');
  assert.equal(loadBackendEnvironment({ root, environment: {} }).REIN_BACKEND_URL, DEFAULT_BACKEND_URL);
  assert.equal(loadBackendEnvironment({ root, environment: { REIN_BACKEND_URL: '' } }).REIN_BACKEND_URL, '');
  writeFileSync(join(root, '.env.local'), 'REIN_BACKEND_URL=""\n');
  assert.equal(loadBackendEnvironment({ root, environment: {} }).REIN_BACKEND_URL, '');
});
