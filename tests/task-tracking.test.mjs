import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateTrackingConfig, desiredStatus, openTrackingStore, trackTask } from '../scripts/task-tracking.mjs';
import { createTrackingClient } from '../scripts/task-tracking-client.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'nori-tracking-'));
  const config = validateTrackingConfig({ version: 1, nativeSync: true, stateDir: directory,
    actor: { mode: 'nori' }, github: { repository: 'example/repo', actorId: '123', tokenEnv: 'GH_TOKEN' },
    linear: { teamId: id(1), actorId: id(2), tokenEnv: 'LINEAR_TOKEN', auth: 'api-key' },
    statuses: { todo: { linearStateId: id(3), githubState: 'open' },
      doing: { linearStateId: id(4), githubState: 'open' }, done: { linearStateId: id(5), githubState: 'closed', githubReason: 'completed' },
      cancelled: { linearStateId: id(6), githubState: 'closed', githubReason: 'not_planned' } },
    tasks: [{ id: 'task-1', githubIssue: 1, linearIssue: id(7), audienceApproved: true }], pollAttempts: 2, pollIntervalMs: 0 });
  let observed = { linear: { state: id(3), revision: '1' }, github: { state: 'open', reason: null, revision: '1' } };
  let writes = [], mirror = true, throwAfterWrite = false;
  const client = { authorize: async () => {}, read: async () => structuredClone(observed),
    write: async (_task, source, desired) => {
      writes.push(source);
      observed[source] = { ...desired[source], revision: '2' };
      if (mirror) { const other = source === 'linear' ? 'github' : 'linear'; observed[other] = { ...desired[other], revision: '2' }; }
      if (throwAfterWrite) throw Error('secret server body must not be retained');
    } };
  const store = openTrackingStore(directory);
  return { config, client, store, writes, get observed() { return observed; }, set observed(v) { observed = v; },
    set mirror(v) { mirror = v; }, set throwAfterWrite(v) { throwAfterWrite = v; },
    run: extra => trackTask({ config, client, store, action: 'set', taskId: 'task-1', status: 'done', operationId: 'op-1', ...extra }),
    close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('one source mutation waits for actual native mirror; repeated intent never writes twice', async () => {
  const f = fixture();
  try {
    const result = await f.run();
    assert.equal(result.status, 'synchronized'); assert.deepEqual(f.writes, ['linear']);
    assert.equal((await f.run()).status, 'synchronized'); assert.equal(f.writes.length, 1);
    await assert.rejects(f.run({ status: 'cancelled' }), /operation_id_reused/);
  } finally { f.close(); }
});

test('source Github closure is also supported, without a second mirror writer', async () => {
  const f = fixture();
  try { assert.equal((await f.run({ source: 'github' })).status, 'synchronized'); assert.deepEqual(f.writes, ['github']); }
  finally { f.close(); }
});

test('non-bijective open state requires Linear selection; no invented detailed Github status', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.run({ source: 'github', status: 'doing' }), /ambiguous_github_status/);
    assert.equal(f.writes.length, 0);
    const result = await f.run({ status: 'doing' });
    assert.equal(result.desired.github.state, 'open'); assert.equal(result.status, 'synchronized');
  } finally { f.close(); }
});

test('native sync delay remains pending, durable after reopen; reconcile does not write', async () => {
  const f = fixture(); f.mirror = false;
  try {
    assert.equal((await f.run()).status, 'sync_pending');
    await assert.rejects(f.run({ operationId: 'op-2' }), /pending_operation_exists/);
    f.store.close();
    const reopened = openTrackingStore(f.config.stateDir);
    try {
      f.observed.github = { state: 'closed', reason: 'completed', revision: '2' };
      const result = await trackTask({ config: f.config, client: f.client, store: reopened, action: 'reconcile', taskId: 'task-1', operationId: 'op-1' });
      assert.equal(result.status, 'synchronized'); assert.equal(f.writes.length, 1);
    } finally { reopened.close(); }
  } finally { rmSync(f.config.stateDir, { recursive: true, force: true }); }
});

test('timeout after effect is uncertain; subsequent reconciliation confirms without replay', async () => {
  const f = fixture(); f.throwAfterWrite = true;
  try {
    const result = await f.run(); assert.equal(result.status, 'write_unknown');
    assert.equal(result.error, 'tracking_write_unconfirmed');
    assert.equal((await f.run()).status, 'synchronized'); assert.equal(f.writes.length, 1);
  } finally { f.close(); }
});

test('concurrent remote change is reported, never silently overwritten or rolled back', async () => {
  const f = fixture(); f.mirror = false;
  try {
    await f.run(); f.observed.github = { state: 'closed', reason: 'not_planned', revision: '9' };
    assert.equal((await f.run({ action: 'retry' })).status, 'conflict'); assert.equal(f.writes.length, 1);
  } finally { f.close(); }
});

test('pre-effect failure permits explicit bounded retry but duplicate set only observes', async () => {
  const f = fixture(); const original = f.client.write; let attempts = 0;
  f.client.write = async (...args) => { if (++attempts === 1) throw Error('tracking_linear_transport_unavailable'); return original(...args); };
  try {
    assert.equal((await f.run()).status, 'write_unknown');
    assert.equal((await f.run()).status, 'sync_pending'); assert.equal(attempts, 1);
    assert.equal((await f.run({ action: 'retry' })).status, 'synchronized'); assert.equal(attempts, 2);
  } finally { f.close(); }
});

test('failed observation does not claim synchronization', async () => {
  const f = fixture();
  try {
    const read = f.client.read; let count = 0;
    f.client.read = async (...args) => { if (++count >= 3) throw Error('network'); return read(...args); };
    assert.equal((await f.run()).status, 'observation_unavailable');
  } finally { f.close(); }
});

test('changed account/team/mapping cannot replay a prior receipt', async () => {
  const f = fixture(); f.mirror = false;
  try { await f.run(); f.config.actor = { mode: 'delegated', principalId: 'other', grantId: 'g', expiresAt: '2099-01-01' };
    await assert.rejects(f.run({ action: 'reconcile' }), /receipt_scope_mismatch/); }
  finally { f.close(); }
});

test('configuration demands approved audience, native integration, unique external pair and explicit identities', () => {
  const f = fixture();
  try {
    for (const change of [{ nativeSync: false }, { actor: {} }, { tasks: [{ ...f.config.tasks[0], audienceApproved: false }] },
      { tasks: [f.config.tasks[0], { ...f.config.tasks[0], id: 'other' }] }, { pollAttempts: 100 }])
      assert.throws(() => validateTrackingConfig({ ...f.config, ...change }), /tracking_/);
  } finally { f.close(); }
});

test('store excludes simultaneous writers and uses private file modes', async () => {
  const f = fixture();
  try {
    assert.throws(() => openTrackingStore(f.config.stateDir), /store_locked/);
    await f.run(); assert.equal(statSync(join(f.config.stateDir, 'receipts.json')).mode & 0o777, 0o600);
  } finally { f.close(); }
});

function apiFixture(config, change = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    let data;
    if (url.endsWith('/user')) data = { id: 123 };
    else if (url.includes('api.github.com')) data = { number: 1, repository_url: 'https://api.github.com/repos/example/repo', state: 'open', state_reason: null, updated_at: '1', ...change.github };
    else {
      const body = JSON.parse(init.body);
      if (body.query.includes('TrackingActor')) data = { data: { viewer: { id: id(2) } } };
      else if (body.query.includes('mutation')) data = change.mutation ?? { data: { issueUpdate: { success: true } } };
      else data = { data: { issue: { id: id(7), team: { id: id(1) }, attachments: { nodes: [{ url: 'https://github.com/example/repo/issues/1' }] }, state: { id: id(3) }, updatedAt: '1', ...change.linear } } };
    }
    return { ok: true, json: async () => data };
  };
  return { calls, client: createTrackingClient(config, { fetchImpl, env: { GH_TOKEN: 'github-secret', LINEAR_TOKEN: 'linear-secret' } }) };
}

test('adapter checks actual principal and pair; writes only status without copying private content', async () => {
  const f = fixture();
  try {
    const { client, calls } = apiFixture(f.config);
    await client.authorize(); await client.read(f.config.tasks[0]);
    await client.write(f.config.tasks[0], 'github', desiredStatus(f.config, 'done'));
    const body = JSON.parse(calls.at(-1).init.body);
    assert.deepEqual(body, { state: 'closed', state_reason: 'completed' });
    assert.ok(calls.every(c => c.init.redirect === 'error'));
    const badActor = apiFixture({ ...f.config, github: { ...f.config.github, actorId: '999' } });
    await assert.rejects(badActor.client.write(f.config.tasks[0], 'github', desiredStatus(f.config, 'done')), /actor_mismatch/);
    assert.equal(badActor.calls.filter(c => c.init.method === 'PATCH').length, 0);
    for (const change of [{ github: { pull_request: {} } }, { linear: { attachments: { nodes: [] } } }, { linear: { team: { id: id(999) } } }])
      await assert.rejects(apiFixture(f.config, change).client.read(f.config.tasks[0]), /pair_mismatch/);
  } finally { f.close(); }
});

test('GraphQL 200 with errors or success:false is not success; expired delegation never networks', async () => {
  const f = fixture();
  try {
    for (const mutation of [{ errors: [{ message: 'credential-containing error' }], data: { issueUpdate: { success: true } } },
      { data: { issueUpdate: { success: false } } }]) {
      const { client } = apiFixture(f.config, { mutation });
      await assert.rejects(client.write(f.config.tasks[0], 'linear', desiredStatus(f.config, 'done')), /tracking_linear_/);
    }
    const expired = apiFixture({ ...f.config, actor: { mode: 'delegated', expiresAt: '2000-01-01' } });
    await assert.rejects(expired.client.authorize(), /delegation_expired/); assert.equal(expired.calls.length, 0);
  } finally { f.close(); }
});

test('coarse GitHub reopen accepts the observed detailed active state without selecting it', async () => {
  const f = fixture();
  try {
    f.observed = { linear: { state: id(5), revision: '3' }, github: { state: 'closed', reason: 'completed', revision: '3' } };
    f.client.write = async (_task, source, desired) => {
      assert.equal(source, 'github');
      f.observed = { linear: { state: id(4), revision: '4' }, github: { ...desired.github, revision: '4' } };
    };
    const result = await f.run({ source: 'github', status: undefined, projection: 'open' });
    assert.equal(result.status, 'synchronized');
    assert.equal(result.observed.linear.state, id(4));
    assert.equal(result.attribution.costAttribution, 'unknown');
    assert.equal(result.attribution.credentialAccounts.github, '123');
    assert.equal(result.attribution.executor, 'Nori');
  } finally { f.close(); }
});

test('recovery retains the original uncertain effect after restart', async () => {
  const f = fixture();
  try {
    f.throwAfterWrite = true;
    assert.equal((await f.run()).status, 'write_unknown');
    f.store.close();
    const next = openTrackingStore(f.config.stateDir);
    try {
      await trackTask({ config: f.config, client: f.client, store: next, taskId: 'task-1', action: 'reconcile', operationId: 'op-1' });
      assert.equal(next.records['op-1'].status, 'synchronized');
      assert.ok(next.records['op-1'].history.some(event => event.status === 'write_unknown' && event.error));
      assert.equal(f.writes.length, 1);
    } finally { next.close(); }
  } finally { f.close(); }
});

test('delegation rechecks grant after account lookup before sending a write', async () => {
  const f = fixture();
  try {
    const config = { ...f.config, actor: { mode: 'delegated', expiresAt: '2099-01-01', writeSources: ['github'] } };
    let requests = 0;
    const client = createTrackingClient(config, {
      env: { GH_TOKEN: 'synthetic', LINEAR_TOKEN: 'synthetic' },
      checkAuthority() { if (requests === 2) throw Error('tracking_authority_changed'); },
      fetchImpl: async url => {
        requests++;
        return { ok: true, json: async () => url.endsWith('/user') ? { id: 123 } : { data: { viewer: { id: id(2) } } } };
      },
    });
    await assert.rejects(client.write(config.tasks[0], 'linear', desiredStatus(config, 'done')), /source_denied/);
    await assert.rejects(client.write(config.tasks[0], 'github', desiredStatus(config, 'done')), /authority_changed/);
    assert.equal(requests, 2);
  } finally { f.close(); }
});

test('a new operation preserves preexisting drift between the paired issues', async () => {
  const f = fixture();
  try {
    f.observed.github = { state: 'closed', reason: 'not_planned', revision: 'human-change' };
    assert.equal((await f.run()).status, 'conflict');
    assert.equal(f.writes.length, 0);
  } finally { f.close(); }
});

test('process death releases the writer lock and preserves the uncertain receipt', async () => {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const directory = mkdtempSync(join(tmpdir(), 'nori-tracking-crash-'));
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import {openTrackingStore} from './scripts/task-tracking.mjs';
    const store = openTrackingStore(process.argv[1]);
    store.save({operationId:'remote-call', status:'write_unknown'});
    process.stdout.write('prepared\\n');
    process.on('SIGTERM', () => { store.close(); process.exit(0); });
    setInterval(() => {}, 30000);
  `, directory], { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = once(child, 'exit');
  try {
    let output = '';
    for await (const chunk of child.stdout.iterator({ destroyOnReturn: false })) {
      output += chunk.toString();
      if (output.includes('prepared\n')) break;
    }
    assert.ok(output.includes('prepared\n'), 'writer exited before preparation');
    assert.throws(() => openTrackingStore(directory), /store_locked/);
    child.kill('SIGKILL');
    await exit;
    const recovered = openTrackingStore(directory);
    try { assert.equal(recovered.records['remote-call'].status, 'write_unknown'); }
    finally { recovered.close(); }
  } finally { child.kill(); rmSync(directory, { recursive: true, force: true }); }
});
