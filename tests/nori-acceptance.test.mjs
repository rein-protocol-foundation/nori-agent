import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../workspace/skills/nori-acceptance/scripts/acceptance.mjs', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'nori-acceptance-test-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const store = join(directory, 'store');
  const env = { HOME: directory, PATH: '/usr/bin:/bin', NO_PROXY: '*', TMPDIR: directory };
  const write = (name, content) => {
    const path = join(directory, name);
    writeFileSync(path, content, { mode: 0o600 });
    return path;
  };
  const json = (name, value) => write(name, JSON.stringify(value));
  const direct = (...args) => spawnSync(process.execPath, [entry, ...args], { cwd: directory, env, timeout: 15000 });
  const cli = (...args) => direct(...args, '--store', store);
  const ok = result => {
    assert.ifError(result.error);
    assert.equal(result.status, 0, String(result.stderr));
    return result.stdout;
  };
  const parse = result => JSON.parse(ok(result));
  const rejects = (result, message) => {
    assert.ifError(result.error);
    assert.equal(result.status, 1, String(result.stdout));
    assert.match(String(result.stderr), message);
  };
  const key = name => {
    const path = join(directory, name);
    ok(spawnSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path], { cwd: directory, env }));
    return { path, publicKey: readFileSync(path + '.pub', 'utf8').trim() };
  };
  const background = (...args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args, '--store', store], { cwd: directory, env });
    child.on('error', reject);
    child.on('close', resolve);
  });
  const plan = (reviewer, items) => ({
    objective: 'A product change persists and can be read back in a local fixture.',
    links: { task: 'synthetic-task', linear: 'TEST-42', github: 'fixture/repo#42' },
    requester: 'synthetic-requester',
    resourceOwner: 'synthetic-owner',
    ...reviewer,
    items,
  });
  return { directory, store, write, json, direct, cli, ok, parse, rejects, key, background, plan };
}

const criterion = (id, requiredEvidence = ['readback']) => ({
  id, expected: `The product returns the expected ${id} state.`, environment: 'synthetic-local', requiredEvidence,
});

test('private offline workflow keeps immutable readbacks, reviewer feedback, and affected-only reruns', async t => {
  const f = fixture(t);
  const reviewer = f.key('reviewer');
  const otherKey = f.key('unassigned-key');
  const assignment = { reviewerSsh: { principal: 'fixture-reviewer', publicKey: reviewer.publicKey } };
  const state = f.write('actual-state', 'was wrong\n');
  const unaffected = f.write('unaffected-state', 'unchanged\n');
  const items = [
    { ...criterion('affected'), check: { kind: 'file-text-equals', path: state, expected: 'fixed\n' } },
    { ...criterion('unchanged'), check: { kind: 'file-text-equals', path: unaffected, expected: 'unchanged\n' } },
  ];
  const plan = f.json('plan.json', f.plan(assignment, items));
  const { reportId } = f.parse(f.cli('start', '--plan', plan));
  const report = join(f.store, reportId);
  const show = (round, format = 'json') => f.cli('show', '--report', reportId, '--round', round, '--format', format);
  assert.equal(f.parse(show('1')).reviewStatus, 'awaiting_results');
  const writes = await Promise.all([
    f.background('record', '--report', reportId, '--round', '1'),
    f.background('record', '--report', reportId, '--round', '1'),
  ]);
  assert.deepEqual(writes.sort(), [0, 1]);
  const before = f.parse(show('1'));
  const original = f.ok(show('1', 'packet'));
  assert.equal(before.executionStatus, 'pending_acceptance');
  assert.equal(before.reviewStatus, 'awaiting_review');
  assert.deepEqual(before.links, { task: 'synthetic-task', linear: 'TEST-42', github: 'fixture/repo#42' });
  assert.deepEqual(before.identity.executor, { kind: 'local-os', uid: process.geteuid() });
  assert.equal(before.identity.costAttribution, 'unknown');
  assert.deepEqual(before.items.map(item => item.verdict), ['fail', 'pass']);
  assert.equal(before.sha256, hash(original));
  const originalEvidence = before.items[0].evidence[0].sha256;
  assert.equal(f.ok(f.cli('artifact', '--report', reportId, '--round', '1', '--digest', originalEvidence)).toString(), 'was wrong\n');
  for (const dir of [f.store, report, join(report, 'evidence')]) assert.equal(statSync(dir).mode & 0o777, 0o700);
  for (const name of readdirSync(report).filter(name => name.endsWith('.json'))) {
    assert.equal(statSync(join(report, name)).mode & 0o777, 0o400);
  }
  assert.equal(statSync(join(report, 'evidence', originalEvidence)).mode & 0o777, 0o400);

  const packetPath = f.write('round-one.json', original);
  const receipt = join(f.directory, 'round-one.receipt.json');
  const note = f.json('return-note.json', { note: 'Correct the affected product state.', affected: ['affected'] });
  const decide = (packet, decision, feedback, receiptPath, key) => f.direct('review', '--packet', packet,
    '--decision', decision, '--feedback', feedback, '--receipt', receiptPath, '--signing-key', key);
  f.rejects(decide(packetPath, 'accept', f.json('accept-note.json', { note: 'Read back the product state.' }),
    receipt, reviewer.path), /Only a passing round/);
  f.rejects(decide(packetPath, 'return', note, receipt, otherKey.path), /signature failed verification/);
  f.parse(decide(packetPath, 'return', note, receipt, reviewer.path));
  const forged = JSON.parse(readFileSync(receipt));
  forged.receipt.note = 'Modified by the executor.';
  f.rejects(f.cli('ingest-review', '--report', reportId, '--receipt', f.json('forged.json', forged)),
    /signature failed verification/);
  const imported = f.parse(f.cli('ingest-review', '--report', reportId, '--receipt', receipt));
  assert.equal(imported.reviewStatus, 'returned');
  assert.deepEqual(f.parse(f.cli('ingest-review', '--report', reportId, '--receipt', receipt)), imported);
  assert.deepEqual(f.ok(show('1', 'packet')), original);
  assert.equal(f.parse(show('1')).feedback.note, 'Correct the affected product state.');

  f.write('actual-state', 'fixed\n');
  // Only the affected item may be read again, even if an unrelated fixture is no longer available.
  rmSync(unaffected);
  const rerun = f.parse(f.cli('rerun', '--report', reportId, '--from', '1', '--change', 'synthetic fix 42'));
  assert.deepEqual(rerun.affected, ['affected']);
  const secondRecord = f.parse(f.cli('record', '--report', reportId, '--round', '2'));
  assert.equal(secondRecord.executionStatus, 'passed');
  const next = f.parse(show('2'));
  assert.equal(next.reviewStatus, 'awaiting_review');
  assert.equal(next.fromDigest, before.sha256);
  assert.deepEqual(next.items.map(item => [item.evaluatedRound, item.reusedFromRound]), [[2, null], [1, 1]]);
  assert.deepEqual(next.items[1].evidence, before.items[1].evidence);
  assert.deepEqual(f.ok(show('1', 'packet')), original);
  assert.equal(f.parse(show('1')).reviewStatus, 'returned');

  const secondPacket = f.write('round-two.json', f.ok(show('2', 'packet')));
  const secondReceipt = join(f.directory, 'round-two.receipt.json');
  f.parse(decide(secondPacket, 'accept', f.json('approve.json', { note: 'Verified the fixed readback.' }),
    secondReceipt, reviewer.path));
  const replay = JSON.parse(readFileSync(secondReceipt));
  replay.receipt.round = 1;
  replay.receipt.roundDigest = before.sha256;
  f.rejects(f.cli('ingest-review', '--report', reportId, '--receipt', f.json('replay.json', replay)),
    /signature failed verification/);
  f.parse(f.cli('ingest-review', '--report', reportId, '--receipt', secondReceipt));
  assert.equal(f.parse(show('2')).reviewStatus, 'accepted');
  assert.match(f.ok(show('2', 'text')).toString(), /Execution passed · Review accepted/);
  const sameRoundReplacement = join(f.directory, 'alternate-receipt.json');
  f.parse(decide(secondPacket, 'return', note, sameRoundReplacement, reviewer.path));
  f.rejects(f.cli('ingest-review', '--report', reportId, '--receipt', sameRoundReplacement), /different feedback/);
});

test('missing product evidence stays uncertain and local read failure stays blocked', t => {
  const f = fixture(t);
  const uid = process.geteuid();
  const reviewerUid = uid === 45678 ? 45679 : 45678;
  const collectionLog = f.write('ci.log', 'all unit tests passed');
  const reportPlan = f.plan({ reviewerUid }, [
    criterion('missing', ['readback', 'engineering']),
    { ...criterion('blocked'), check: { kind: 'file-text-equals', path: join(f.directory, 'absent'), expected: 'ok' } },
  ]);
  f.rejects(f.cli('start', '--plan', f.json('invalid-plan.json', { ...reportPlan, reviewerUid: uid })),
    /distinct POSIX UIDs/);
  f.rejects(f.cli('start', '--plan', f.json('engineering-plan.json', { ...reportPlan, items: [criterion('engineering-only', ['engineering'])] })),
    /require product evidence/);
  const { reportId } = f.parse(f.cli('start', '--plan', f.json('plan.json', reportPlan)));
  const symlink = join(f.directory, 'evidence-redirection');
  symlinkSync(collectionLog, symlink);
  const results = path => f.json('results.json', {
    missing: { verdict: 'pass', observation: 'An engineering check passed.', evidence: [{ type: 'engineering', path }] },
  });
  f.rejects(f.cli('record', '--report', reportId, '--round', '1', '--results', results(symlink)), /ELOOP/);
  f.parse(f.cli('record', '--report', reportId, '--round', '1', '--results', results(collectionLog)));
  const summary = f.parse(f.cli('show', '--report', reportId, '--format', 'json'));
  assert.equal(summary.executionStatus, 'pending_acceptance');
  assert.deepEqual(summary.items.map(item => [item.verdict, item.missingEvidence]), [
    ['uncertain', ['readback']], ['blocked', ['readback']],
  ]);
  const packet = f.write('packet.json', f.ok(f.cli('show', '--report', reportId, '--format', 'packet')));
  const feedback = f.json('feedback.json', { note: 'Needs readback.', affected: ['missing'] });
  f.rejects(f.direct('review', '--packet', packet, '--decision', 'return', '--feedback', feedback,
    '--receipt', join(f.directory, 'receipt.json')), /not the assigned independent reviewer/);
  const fake = f.json('same-uid-receipt.json', {
    version: 1, reportId, round: 1, roundDigest: summary.sha256, reviewerUid,
    decision: 'return', note: 'Claimed reviewer UID.', affected: ['missing'],
  });
  f.rejects(f.cli('ingest-review', '--report', reportId, '--receipt', fake), /owned by the assigned reviewer/);
});

test('report storage refuses weak permissions, symlinks, Git worktrees, and traversal', t => {
  const f = fixture(t);
  const plan = f.json('plan.json', f.plan({ reviewerUid: process.geteuid() + 1 }, [criterion('readback')]));
  mkdirSync(f.store, { mode: 0o755 });
  chmodSync(f.store, 0o755);
  f.rejects(f.cli('start', '--plan', plan), /owner-only/);
  chmodSync(f.store, 0o700);
  const alias = join(f.directory, 'alias');
  symlinkSync(f.store, alias);
  f.rejects(f.direct('start', '--plan', plan, '--store', alias), /owner-only/);
  const gitRoot = join(f.directory, 'project');
  mkdirSync(gitRoot);
  writeFileSync(join(gitRoot, '.git'), 'synthetic git worktree');
  f.rejects(f.direct('start', '--plan', plan, '--store', join(gitRoot, 'private')), /outside Git worktrees/);
  f.rejects(f.direct('start', '--plan', plan, '--store', gitRoot), /outside Git worktrees/);
  f.parse(f.cli('start', '--plan', plan));
  f.rejects(f.cli('show', '--report', '../store'), /Invalid report ID/);
});
