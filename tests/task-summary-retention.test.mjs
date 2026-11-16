import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, mkdir, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRetainedSummaries } from '../plugins/rein-acp/retained-summaries.mjs';
import { validateAcpConfig } from '../plugins/rein-acp/runtime.mjs';

const sdk = process.env.REIN_TEST_SQLITE_SDK ?? new URL('../vendor/openclaw/dist/plugin-sdk/sqlite-runtime.js', import.meta.url).href;
const source = { sessionKey: 'agent:main:slack:channel:synthetic', sessionId: 'session-a',
  agentId: 'main', accountId: 'default', channel: 'slack', chatId: 'CSYNTH01', senderId: 'USYNTH01' };
const summary = { flowId: 'synthetic-flow', source, nativeRevision: 1, createdAt: Date.now() - 9 * 86400000,
  goal: 'SYNTHETIC_SUMMARY_CONTENT_CANARY', criteria: 'Synthetic criteria', report: { evidence: 'Synthetic result' } };
async function setup(t) {
  const stateDir = await mkdtemp(join(tmpdir(), 'rein-summary-worker-'));
  const { openSqliteWorkerStore } = await import(sdk);
  const create = () => createRetainedSummaries({ stateDir, openSqliteWorkerStore });
  const stores = [];
  t.after(async () => { for (const store of stores) await store.close(); await rm(stateDir, { recursive: true, force: true }); });
  return { stateDir, store() { const store = create(); stores.push(store); return store; } };
}

test('actual public worker preserves nine-day copies on restart; file and directory are private', async t => {
  const f = await setup(t), first = f.store();
  assert.equal(await first.put(summary), 'retained'); await first.close();
  const second = f.store(); assert.deepEqual(await second.read(source, summary.flowId), summary);
  assert.deepEqual(await second.list(source), { summaries: [summary], nextCursor: null });
  assert.equal((await stat(join(f.stateDir, 'rein-acp'))).mode & 0o777, 0o700);
  assert.equal((await stat(join(f.stateDir, 'rein-acp/task-summaries.sqlite'))).mode & 0o777, 0o600);
});

test('worker scope separates stable owner/account/channel/agent/audience and preserves original UUID provenance', async t => {
  const f = await setup(t), store = f.store(); await store.put(summary);
  for (const [key, value] of Object.entries({ sessionKey: 'foreign-owner', accountId: 'foreign-account',
    channel: 'discord', agentId: 'other-agent', chatId: 'COTHER01' })) {
    const foreign = { ...source, [key]: value };
    assert.equal(await store.read(foreign, summary.flowId), null);
    assert.deepEqual(await store.list(foreign), { summaries: [], nextCursor: null });
    await store.delete(foreign, summary.flowId, Date.now());
    assert.deepEqual(await store.read(source, summary.flowId), summary);
  }
  const reset = await store.read({ ...source, sessionId: 'new-current-session' }, summary.flowId);
  assert.equal(reset.source.sessionId, 'session-a');
});

test('two actual workers serialize concurrent puts/deletion; tombstone cannot revive after restart', async t => {
  const f = await setup(t), a = f.store(), b = f.store();
  await Promise.all([a.put(summary), b.put({ ...summary, nativeRevision: 2, report: { evidence: 'Newer result' } })]);
  assert.equal((await a.read(source, summary.flowId)).nativeRevision, 2);
  await Promise.all([a.put({ ...summary, nativeRevision: 3 }), b.delete(source, summary.flowId, Date.now()),
    a.put({ ...summary, nativeRevision: 4 })]);
  assert.equal(await b.read(source, summary.flowId), null);
  await a.close(); await b.close();
  const c = f.store(); assert.equal(await c.put({ ...summary, nativeRevision: 999 }), 'deleted');
  assert.deepEqual(await c.list(source), { summaries: [], nextCursor: null }); await c.close();
  const db = new DatabaseSync(join(f.stateDir, 'rein-acp/task-summaries.sqlite'), { readOnly: true });
  const rows = db.prepare('SELECT * FROM summaries').all(); db.close();
  assert.equal(rows.length, 1); assert.equal(rows[0].payload, null); assert.equal(rows[0].revision, 0);
  assert.equal(rows[0].scope.length, 64); assert.equal(rows[0].id.length, 64); assert.ok(rows[0].deleted_at);
  assert.equal((await readFile(join(f.stateDir, 'rein-acp/task-summaries.sqlite'))).includes(Buffer.from(summary.goal)), false);
});

test('private feature path rejects symlinked directories and database files', async t => {
  const f = await setup(t), elsewhere = await mkdtemp(join(tmpdir(), 'rein-summary-elsewhere-'));
  t.after(() => rm(elsewhere, { recursive: true, force: true }));
  await symlink(elsewhere, join(f.stateDir, 'rein-acp'));
  await assert.rejects(f.store().put(summary), /unsafe_directory/);
  await rm(join(f.stateDir, 'rein-acp')); await mkdir(join(f.stateDir, 'rein-acp'));
  await symlink(join(elsewhere, 'untouched.sqlite'), join(f.stateDir, 'rein-acp/task-summaries.sqlite'));
  await assert.rejects(f.store().put(summary), /unsafe_file/);
  assert.deepEqual(await import('node:fs/promises').then(fs => fs.readdir(elsewhere)), []);
});

test('retention configuration is explicit and validates its narrow shape', () => {
  const base = { enabled: true, taskLoop: true, channel: { accountId: 'default', workspaceId: 'TSYNTH01',
    channelId: 'CSYNTH01', agentId: 'main', botTokenEnvVar: 'SYNTHETIC_TOKEN' }, harnessAgentId: 'codex', cwd: '/tmp/synthetic' };
  const validated = value => validateAcpConfig({ ...base, continuation: { enabled: true, retainedSummaries: value } });
  assert.equal(validated({ enabled: true }).continuation.retainedSummaries.enabled, true);
  assert.equal(validated({ enabled: false }).continuation.retainedSummaries.enabled, false);
  for (const value of [true, null, {}, { enabled: 'yes' }, { enabled: true, ttlDays: 7 }])
    assert.throws(() => validated(value), /rein_summary_config_invalid/);
});


test('worker pages are bounded, continue explicitly and reject malformed or cross-owner cursors', async t => {
  const f = await setup(t), store = f.store();
  await Promise.all(Array.from({ length: 53 }, (_, index) => store.put({ ...summary, flowId: `flow-${index}` })));
  const first = await store.list(source); assert.equal(first.summaries.length, 20); assert.ok(first.nextCursor);
  const second = await store.list(source, { limit: 20, cursor: first.nextCursor });
  const third = await store.list(source, { limit: 20, cursor: second.nextCursor });
  assert.equal(second.summaries.length, 20); assert.equal(third.summaries.length, 13); assert.equal(third.nextCursor, null);
  assert.equal(new Set([...first.summaries, ...second.summaries, ...third.summaries].map(row => row.flowId)).size, 53);
  assert.equal((await store.list(source, { limit: 50 })).summaries.length, 50);
  for (const limit of [0, 51, 1.5]) await assert.rejects(store.list(source, { limit }), /limit_invalid/);
  for (const cursor of ['', 'not-json', 'a'.repeat(257), Buffer.from('{}').toString('base64url')])
    await assert.rejects(store.list(source, { cursor }), /cursor_invalid/);
  await assert.rejects(store.list({ ...source, sessionKey: 'foreign-owner' }, { cursor: first.nextCursor }), /cursor_invalid/);
});
