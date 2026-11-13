import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUsageLedger, usageIdentity } from '../plugins/rein-router/usage-limits.mjs';
const limits = { perUserPerMinute: 2, perConversationPerMinute: 3,
  perUserConcurrent: 1, perConversationConcurrent: 2, maxConcurrent: 3,
  maxGatewayRequestsPerDay: 3 };
const origin = (runId = 'r1', extra = {}) => ({ runId, agentId: 'nori-community', sessionKey: `session-${runId}`,
  channel: 'discord', accountId: 'default', senderId: 'PRIVATE-SENDER-ONE', chatId: 'PRIVATE-ROOM-ONE', ...extra });
const identity = (runId, extra) => usageIdentity(origin(runId, extra), 'PRIVATE-GUILD');
const end = (runId, extra = {}) => ({ runId, stream: 'lifecycle', data: { phase: 'end', executionSettled: true }, ...extra });
function fixture(t, options = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), 'nori-usage-test-')); let time = 1794000000000;
  const ledgers = [];
  const open = overrides => { const ledger = createUsageLedger({ stateDir, clock: () => time, ...options, ...overrides }); ledgers.push(ledger); return ledger; };
  t.after(() => { for (const ledger of ledgers) ledger.close(); rmSync(stateDir, { recursive: true, force: true }); });
  return { stateDir, open, advance: delta => { time += delta; } };
}

test('sender, conversation and agent concurrency constrain different authenticated scopes', t => {
  const f = fixture(t), ledger = f.open();
  ledger.admit(identity('a'), limits);
  assert.throws(() => ledger.admit(identity('b', { chatId: 'OTHER-ROOM' }), limits), /request_limit/);
  ledger.admit(identity('b', { senderId: 'OTHER-SENDER' }), limits);
  assert.throws(() => ledger.admit(identity('c', { senderId: 'THIRD-SENDER' }), limits), /request_limit/);
  ledger.admit(identity('c', { senderId: 'THIRD-SENDER', chatId: 'OTHER-ROOM' }), limits);
  assert.throws(() => ledger.admit(identity('d', { senderId: 'FOURTH-SENDER', chatId: 'THIRD-ROOM' }), limits), /request_limit/);
  ledger.admit(identity('internal', { agentId: 'main' }), limits);
  assert.equal(ledger.settle(end('a', { agentId: 'main' })), false);
  assert.throws(() => ledger.admit(identity('e'), limits), /request_limit/);
  assert.equal(ledger.settle(end('a', { agentId: 'nori-community', sessionKey: 'session-a' })), true);
  assert.equal(ledger.settle(end('a')), false);
});

test('rolling rates survive settlement and reopening; duplicate admission does not consume another slot', t => {
  const f = fixture(t), ledger = f.open();
  ledger.admit(identity('one'), limits);
  f.advance(100);
  ledger.admit(identity('one'), limits);
  ledger.settle(end('one'));
  ledger.admit(identity('two'), limits); ledger.settle(end('two'));
  ledger.close(); const reopened = f.open();
  assert.throws(() => reopened.admit(identity('three'), limits), /request_limit/);
  f.advance(60000);
  reopened.admit(identity('three'), limits);
  assert.throws(() => reopened.admit(identity('three', { senderId: 'SPOOF' }), limits), /usage_unavailable/);
});

test('every retry/fallback reserves the shared daily budget before a gateway request; restart cannot refund it', t => {
  const f = fixture(t), ledger = f.open(), id = identity('one');
  ledger.admit(id, limits);
  ledger.reserveRequest(id, limits); // primary
  ledger.reserveRequest(id, limits); // explicit fallback
  ledger.reserveRequest(id, limits); // next model iteration, even if upstream later fails
  assert.throws(() => ledger.reserveRequest(id, limits), /daily_budget/);
  ledger.settle(end('one')); ledger.close();
  const reopened = f.open();
  assert.throws(() => reopened.admit(identity('other'), limits), /daily_budget/);
  f.advance(86400000);
  reopened.admit(identity('next-day'), limits);
  reopened.reserveRequest(identity('next-day'), limits);
});

test('live runs keep concurrency until native execution settlement, including after runtime reload', t => {
  const f = fixture(t), first = f.open();
  first.admit(identity('one'), limits); f.advance(1001);
  first.assertCurrent(identity('one'));
  first.reserveRequest(identity('one'), limits);
  first.close(); const reloaded = f.open();
  assert.throws(() => reloaded.admit(identity('two'), limits), /request_limit/);
  assert.equal(reloaded.settle({ ...end('one'), data: { phase: 'end', executionSettled: false } }), false);
  assert.equal(reloaded.settle(end('one')), true);
  reloaded.admit(identity('two'), limits);
});

test('only a proven dead process releases a crash lease; PID reuse stays conservative', t => {
  const f = fixture(t), dead = f.open({ pid: 1234567 });
  dead.admit(identity('one'), limits); dead.reserveRequest(identity('one'), limits); dead.close();
  const unknown = f.open({ processAlive: () => true });
  assert.throws(() => unknown.admit(identity('two'), limits), /request_limit/);
  unknown.close();
  const recovered = f.open({ processAlive: pid => pid !== 1234567 });
  recovered.admit(identity('two'), limits);
  recovered.reserveRequest(identity('two'), limits); recovered.reserveRequest(identity('two'), limits);
  assert.throws(() => recovered.reserveRequest(identity('two'), limits), /daily_budget/);
});

test('two independently prepared runtimes share the same counter and reject foreign settlement', t => {
  const f = fixture(t), a = f.open(), b = f.open();
  a.admit(identity('one'), limits);
  assert.throws(() => b.admit(identity('two'), limits), /request_limit/);
  assert.equal(b.settle(end('one', { agentId: 'nori-community', sessionKey: 'FOREIGN' })), false);
  a.reserveRequest(identity('one'), limits); b.reserveRequest(identity('one'), limits); a.reserveRequest(identity('one'), limits);
  assert.throws(() => b.reserveRequest(identity('one'), limits), /daily_budget/);
});

test('ledger stores no raw sender, conversation or session identifiers and fails closed on clock or file trust changes', t => {
  const f = fixture(t), ledger = f.open(); ledger.admit(identity('one'), limits);
  const path = join(f.stateDir, 'rein-router-usage/admission.sqlite');
  const bytes = readFileSync(path);
  for (const secret of ['PRIVATE-SENDER', 'PRIVATE-ROOM', 'PRIVATE-GUILD', 'session-one']) assert.equal(bytes.includes(secret), false);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  f.advance(-1); assert.throws(() => ledger.reserveRequest(identity('one'), limits), /usage_unavailable/);
  f.advance(1); chmodSync(path, 0o644);
  assert.throws(() => ledger.reserveRequest(identity('one'), limits), /usage_unavailable/);
});

test('simultaneous native processes atomically admit one run for a single sender slot', async t => {
  const { spawn } = await import('node:child_process');
  const { createInterface } = await import('node:readline');
  const f = fixture(t), workers = [];
  t.after(() => { for (const worker of workers) worker.kill(); });
  let ready = 0; const outcomes = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('admission workers timed out')), 15000);
    const finish = error => { clearTimeout(timer); if (error) reject(error); else resolve(); };
    for (let index = 0; index < 6; index++) {
      const worker = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/usage-admission-worker.mjs', import.meta.url)), f.stateDir, `run-${index}`],
        { stdio: ['pipe', 'pipe', 'pipe'] }); workers.push(worker); worker.stderr.resume();
      worker.on('error', finish);
      createInterface({ input: worker.stdout }).on('line', line => {
        if (line === 'ready') { if (++ready === 6) for (const child of workers) child.stdin.write('admit\n'); }
        else {
          outcomes.push(line);
          if (outcomes.length === 6) finish();
        }
      });
    }
  });
  assert.equal(outcomes.filter(value => value === 'accepted').length, 1, JSON.stringify(outcomes));
  assert.equal(outcomes.filter(value => value === 'refused').length, 5, JSON.stringify(outcomes));
  await Promise.all(workers.map(worker => new Promise(resolve => { worker.once('exit', resolve); worker.stdin.end(); })));
});
