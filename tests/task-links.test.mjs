import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { taskLinks } from '../scripts/task-links.mjs';
import { validateTrackingConfig } from '../scripts/task-tracking.mjs';

const acceptance = fileURLToPath(new URL('../workspace/skills/nori-acceptance/scripts/acceptance.mjs', import.meta.url));
const links = fileURLToPath(new URL('../scripts/task-links.mjs', import.meta.url));
const trackingExample = new URL('../config/task-tracking.example.json', import.meta.url);
const primaryOwner = 'agent:fixture:primary';
const secondaryOwner = 'agent:fixture:secondary';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nori-task-links-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = JSON.parse(readFileSync(trackingExample));
  config.stateDir = join(dir, 'tracking');
  config.taskLinks = {
    stateDir: join(dir, 'task-links'),
    gatewayConfig: join(dir, 'openclaw.json'),
    gatewayState: join(dir, 'openclaw'),
    gatewayUrl: 'ws://127.0.0.1:18789',
    acceptanceStore: join(dir, 'acceptance'),
  };
  const [task] = config.tasks;
  task.nativeOwnerKeys = [primaryOwner];
  const env = { HOME: dir, PATH: '/usr/bin:/bin', TMPDIR: dir };
  const run = (...args) => spawnSync(process.execPath, args, { cwd: dir, env, timeout: 15000 });
  const ok = result => {
    assert.ifError(result.error);
    assert.equal(result.status, 0, String(result.stderr));
    return result.stdout;
  };
  const parse = result => JSON.parse(ok(result));
  const raw = (name, data) => {
    const path = join(dir, name);
    writeFileSync(path, data, { mode: 0o600 });
    return path;
  };
  const json = (name, data) => raw(name, JSON.stringify(data));
  const argumentsFor = (command, ...args) => [
    links, command, '--config', json('task-operator.json', config), '--task', task.id, ...args,
  ];
  const session = (command, ...args) => run(...argumentsFor(command, ...args));
  const background = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: dir, env, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', resolve);
  });
  const associate = (command, options = {}) => taskLinks({
    config: validateTrackingConfig(config), taskId: task.id, command, ...options,
  });
  const accept = (...args) => run(acceptance, ...args, '--store', config.taskLinks.acceptanceStore);
  const native = (id, owner = primaryOwner) => ({
    taskId: id, runId: `run-${id}`, ownerKey: owner, sessionKey: owner, runtime: 'subagent',
    status: 'completed', prompt: 'private prompt', terminalSummary: 'private result',
  });
  return { dir, config, task, env, run, ok, parse, raw, json, session, background, argumentsFor, associate, accept, native };
}

test('native run links survive restarts and use the current approved requester and owner scope', t => {
  const f = fixture(t);
  const link = (id, reader) => f.associate('link-run', { nativeTaskId: id, getNativeTask: reader });
  assert.throws(() => link('primary', () => ({ ...f.native('primary'), runId: undefined })), /native_run_unconfirmed/);
  assert.throws(() => link('primary', () => ({ ...f.native('primary'), sessionKey: secondaryOwner })), /native_task_outside_scope/);
  assert.throws(() => link('primary', () => f.native('other')), /native_run_unconfirmed/);
  assert.deepEqual(link('primary', (_, id) => f.native(id)), {
    nativeTaskId: 'primary', nativeRunId: 'run-primary',
  });
  link('primary', () => ({ ...f.native('primary'), status: 'running' }));
  assert.throws(() => link('secondary', () => f.native('secondary', secondaryOwner)), /native_task_outside_scope/);
  f.task.nativeOwnerKeys.push(secondaryOwner);
  link('secondary', () => f.native('secondary', secondaryOwner));
  const shown = f.parse(f.session('show'));
  assert.equal(shown.bound, true);
  assert.equal(shown.issues.linearIssue, f.task.linearIssue);
  assert.deepEqual(shown.runs.map(run => [run.nativeTaskId, run.nativeRunId, run.statusAtLink]), [
    ['primary', 'run-primary', 'completed'], ['secondary', 'run-secondary', 'completed'],
  ]);
  assert.doesNotMatch(JSON.stringify(shown), /private prompt|private result|agent:fixture/);
  assert.equal(statSync(f.config.taskLinks.stateDir).mode & 0o777, 0o700);
  assert.equal(statSync(join(f.config.taskLinks.stateDir, 'task-links.sqlite')).mode & 0o777, 0o600);

  f.task.nativeOwnerKeys = [secondaryOwner];
  assert.deepEqual(f.parse(f.session('show')).runs.map(run => run.nativeTaskId), ['secondary']);
  f.config.actor.outputAudience = 'different-audience';
  assert.throws(() => f.associate('show'), /binding_scope_changed/);
  delete f.config.actor.outputAudience;
  const originalIssue = f.task.githubIssue;
  f.task.githubIssue = 99;
  assert.throws(() => f.associate('show'), /binding_scope_changed/);
  f.task.githubIssue = originalIssue;
  f.task.id = 'another-business-task';
  assert.throws(() => f.associate('show'), /issue_already_bound/);
  f.task.linearIssue = '00000000-0000-4000-8000-000000000009';
  f.task.githubIssue = 99;
  assert.throws(() => link('secondary', () => f.native('secondary', secondaryOwner)), /native_run_already_bound/);
  f.config.taskLinks.gatewayUrl = 'ws://external.example:18789';
  assert.throws(() => f.associate('show'), /local_gateway_required/);
});

test('private Task links resolve real acceptance rounds and current signed reviewer decisions', async t => {
  const f = fixture(t);
  f.associate('link-run', { nativeTaskId: 'fixture', getNativeTask: () => f.native('fixture') });
  const key = join(f.dir, 'reviewer-key');
  f.ok(spawnSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], { cwd: f.dir, env: f.env }));
  const privateState = f.raw('product-state', 'old result\n');
  const plan = {
    objective: 'Read back the accepted product result.',
    links: { task: f.task.id, linear: f.task.linearIssue, github: `${f.config.github.repository}#${f.task.githubIssue}` },
    reviewerSsh: { principal: 'fixture-reviewer', publicKey: readFileSync(key + '.pub', 'utf8') },
    requester: 'fixture',
    resourceOwner: 'fixture',
    items: [{
      id: 'readback', expected: 'The result is recorded.', environment: 'local-synthetic', requiredEvidence: ['readback'],
      check: { kind: 'file-text-equals', path: privateState, expected: 'new result\n' },
    }],
  };
  const start = value => f.parse(f.accept('start', '--plan', f.json('plan.json', value))).reportId;
  const reportId = start(plan);
  const attach = (round, id = reportId) => f.argumentsFor('link-report', '--report', id, '--round', round, '--native-task', 'fixture');
  const unrecorded = f.run(...attach('1'));
  assert.equal(unrecorded.status, 1);
  assert.match(String(unrecorded.stderr), /report_round_unrecorded/);

  f.parse(f.accept('record', '--report', reportId, '--round', '1'));
  const duplicate = await Promise.all([f.background(attach('1')), f.background(attach('1'))]);
  assert.deepEqual(duplicate, [0, 0]);
  const statuses = () => f.parse(f.session('show')).acceptance.map(row => [row.round, row.executionStatus, row.reviewStatus]);
  assert.deepEqual(statuses(), [[1, 'pending_acceptance', 'awaiting_review']]);

  function review(round, decision, feedback) {
    const packet = f.raw(`packet-${round}.json`, f.ok(f.accept('show', '--report', reportId, '--round', round, '--format', 'packet')));
    const receipt = join(f.dir, `receipt-${round}.json`);
    f.parse(f.run(acceptance, 'review', '--packet', packet, '--decision', decision, '--receipt', receipt,
      '--feedback', f.json('feedback.json', feedback), '--signing-key', key));
    f.parse(f.accept('ingest-review', '--report', reportId, '--receipt', receipt));
  }
  review('1', 'return', { note: 'Fixture reviewer returned the prior result.', affected: ['readback'] });
  assert.deepEqual(statuses(), [[1, 'pending_acceptance', 'returned']]);
  f.raw('product-state', 'new result\n');
  f.parse(f.accept('rerun', '--report', reportId, '--from', '1', '--change', 'fixture update'));
  f.parse(f.accept('record', '--report', reportId, '--round', '2'));
  f.parse(f.run(...attach('2')));
  assert.deepEqual(statuses(), [[1, 'pending_acceptance', 'returned'], [2, 'passed', 'awaiting_review']]);
  review('2', 'accept', { note: 'Fixture reviewer verified the updated result.' });
  assert.deepEqual(statuses(), [[1, 'pending_acceptance', 'returned'], [2, 'passed', 'accepted']]);
  const visible = f.parse(f.session('show'));
  assert.doesNotMatch(JSON.stringify(visible), /Fixture reviewer|new result|BEGIN SSH SIGNATURE/);

  const wrong = start({ ...plan, links: { ...plan.links, github: 'unauthorized/repository#1' } });
  f.parse(f.accept('record', '--report', wrong, '--round', '1'));
  const invalid = f.run(...attach('1', wrong));
  assert.equal(invalid.status, 1);
  assert.match(String(invalid.stderr), /report_pair_mismatch/);

  const moved = join(f.dir, 'acceptance-away');
  renameSync(f.config.taskLinks.acceptanceStore, moved);
  assert.deepEqual(statuses(), [[1, 'unavailable', 'unavailable'], [2, 'unavailable', 'unavailable']]);
  renameSync(moved, f.config.taskLinks.acceptanceStore);

  const weakConfig = f.json('weak.json', f.config);
  chmodSync(weakConfig, 0o640);
  const weak = f.run(links, 'show', '--config', weakConfig, '--task', f.task.id);
  assert.equal(weak.status, 1);
  assert.match(String(weak.stderr), /unsafe_config/);
});
