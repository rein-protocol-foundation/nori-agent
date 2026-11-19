import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, existsSync, lstatSync, realpathSync, openSync, fstatSync, fsyncSync, closeSync, constants } from 'node:fs';
import { resolve, join, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrackingClient } from './task-tracking-client.mjs';

const fail = code => { throw Error(`tracking_${code}`); };
const text = (v, max = 200) => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= max;
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = receipt => ['synchronized', 'conflict'].includes(receipt.status);

export function validateTrackingConfig(raw, { allowEmptyTasks = false } = {}) {
  if (!object(raw) || raw.version !== 1 || raw.nativeSync !== true || typeof raw.stateDir !== 'string' || !isAbsolute(raw.stateDir)) fail('config_invalid');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const shared = resolve(root, 'workspace');
  const stateDir = resolve(raw.stateDir);
  if (stateDir === shared || stateDir.startsWith(`${shared}/`) || stateDir === resolve(root)) fail('state_must_be_private');
  let ancestor = stateDir;
  while (!existsSync(ancestor) && ancestor !== dirname(ancestor)) ancestor = dirname(ancestor);
  const actual = realpathSync(ancestor);
  const actualShared = realpathSync(shared);
  if (actual === actualShared || actual.startsWith(`${actualShared}/`)) fail('state_must_be_private');
  if (!object(raw.actor) || !['nori', 'delegated'].includes(raw.actor.mode)) fail('actor_required');
  if (raw.actor.mode === 'delegated' && (!text(raw.actor.grantId) || !text(raw.actor.principalId) ||
      !Number.isFinite(Date.parse(raw.actor.expiresAt)))) fail('delegation_required');
  if (raw.actor.mode === 'delegated') {
    if (raw.actor.revoked === true) fail('delegation_revoked');
    if (Date.parse(raw.actor.expiresAt) <= Date.now()) fail('delegation_expired');
    for (const field of ['requester', 'resourceOwner', 'outputAudience']) {
      if (!text(raw.actor[field])) fail('delegation_attribution_required');
    }
    if (!Array.isArray(raw.actor.writeSources) || !raw.actor.writeSources.length ||
        raw.actor.writeSources.some(source => !['github', 'linear'].includes(source))) fail('delegation_scope_required');
  }
  for (const p of ['github', 'linear']) {
    if (!object(raw[p]) || !/^[A-Z][A-Z0-9_]{0,127}$/.test(raw[p].tokenEnv ?? '') || !text(raw[p].actorId)) fail('account_invalid');
  }
  if (!/^[A-Za-z0-9][\w-]*\/[A-Za-z0-9_.-]+$/.test(raw.github.repository ?? '') || ['.', '..'].includes(raw.github.repository.split('/')[1]) || !/^\d+$/.test(raw.github.actorId) ||
      !uuid(raw.linear.actorId) || !uuid(raw.linear.teamId) || !['api-key', 'oauth'].includes(raw.linear.auth)) fail('account_invalid');
  if (!object(raw.statuses) || !Object.keys(raw.statuses).length || Object.keys(raw.statuses).length > 30) fail('statuses_invalid');
  const stateIds = new Set();
  for (const [name, s] of Object.entries(raw.statuses)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name) || !uuid(s?.linearStateId) || stateIds.has(s.linearStateId) ||
        !['open', 'closed'].includes(s.githubState) ||
        (s.githubState === 'closed' && !['completed', 'not_planned'].includes(s.githubReason)) ||
        (s.githubState === 'open' && s.githubReason != null)) fail('statuses_invalid');
    stateIds.add(s.linearStateId);
  }
  if (!Array.isArray(raw.tasks) || (!allowEmptyTasks && !raw.tasks.length) || raw.tasks.length > 1000) fail('tasks_invalid');
  const ids = new Set(), gh = new Set(), li = new Set();
  for (const t of raw.tasks) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(t?.id ?? '') || !uuid(t.linearIssue) ||
        !Number.isSafeInteger(t.githubIssue) || t.githubIssue < 1 || t.audienceApproved !== true ||
        ids.has(t.id) || gh.has(t.githubIssue) || li.has(t.linearIssue)) fail('task_pair_invalid');
    ids.add(t.id); gh.add(t.githubIssue); li.add(t.linearIssue);
  }
  const timeoutMs = raw.timeoutMs ?? 10000, pollAttempts = raw.pollAttempts ?? 3, pollIntervalMs = raw.pollIntervalMs ?? 1000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 ||
      !Number.isInteger(pollAttempts) || pollAttempts < 1 || pollAttempts > 10 ||
      !Number.isInteger(pollIntervalMs) || pollIntervalMs < 0 || pollIntervalMs > 5000) fail('bounds_invalid');
  return { ...raw, stateDir, timeoutMs, pollAttempts, pollIntervalMs };
}

export function desiredStatus(config, name) {
  const status = Object.hasOwn(config.statuses, name) ? config.statuses[name] : undefined;
  if (!status) fail('unknown_status');
  return { linear: { state: status.linearStateId }, github: { state: status.githubState, reason: status.githubReason ?? null } };
}
const matches = (side, wanted) => (wanted.allowedStates ? wanted.allowedStates.includes(side.state) : side.state === wanted.state) && (!('reason' in wanted) || side.reason === wanted.reason);
const unchanged = (side, original) => JSON.stringify(side) === JSON.stringify(original);

// A durable receipt is not an alternative task scheduler. Native tasks/runs remain authoritative.
export function openTrackingStore(directory) {
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) fail('state_symlink');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!lstatSync(directory).isDirectory() || (lstatSync(directory).mode & 0o077) !== 0) fail('state_permissions');
  if (lstatSync(directory).uid !== process.geteuid()) fail('state_permissions');
  // A pre-migration process may still own the old directory lock.
  if (existsSync(join(directory, '.writer-lock'))) fail('legacy_store_locked');
  const lockPath = join(directory, 'writer.sqlite');
  try { closeSync(openSync(lockPath, 'wx', 0o600)); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const lockStat = lstatSync(lockPath);
  if (!lockStat.isFile() || lockStat.uid !== process.geteuid() || (lockStat.mode & 0o077)) fail('state_permissions');
  const file = join(directory, 'receipts.json');
  if (existsSync(file) && (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile())) fail('state_symlink');
  if (existsSync(file) && (lstatSync(file).mode & 0o077) !== 0) fail('state_permissions');
  const lock = new DatabaseSync(lockPath);
  try { lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); }
  catch (error) { lock.close(); if (error.errcode === 5) fail('store_locked'); throw error; }
  let records;
  try {
    records = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    if (!object(records)) fail('store_invalid');
    records = Object.assign(Object.create(null), records);
  } catch (error) { lock.close(); throw error; }
  let closed = false;
  return {
    records,
    save(receipt) {
      if (closed) fail('store_closed');
      const previous = records[receipt.operationId];
      const history = [...(previous?.history ?? [])];
      if (previous && (previous.status !== receipt.status || previous.error !== receipt.error ||
          JSON.stringify(previous.observed) !== JSON.stringify(receipt.observed))) {
        history.push({ status: previous.status, at: previous.updatedAt, observed: previous.observed, error: previous.error });
      }
      records[receipt.operationId] = { ...receipt, history };
      const temp = join(directory, `.receipts-${randomUUID()}.tmp`);
      try {
        const fd = openSync(temp, 'wx', 0o600);
        try { writeFileSync(fd, JSON.stringify(records, null, 2) + '\n'); fsyncSync(fd); }
        finally { closeSync(fd); }
        renameSync(temp, file);
        const parent = openSync(directory, 'r');
        try { fsyncSync(parent); } finally { closeSync(parent); }
      }
      finally { rmSync(temp, { force: true }); }
    },
    close() {
      if (!closed) { lock.close(); closed = true; }
    },
  };
}

export async function trackTask({ config, client, store, action, taskId, status, projection, source = 'linear', operationId,
  sleep = ms => new Promise(r => setTimeout(r, ms)), clock = () => new Date().toISOString() }) {
  if (!['inspect', 'set', 'reconcile', 'retry'].includes(action) || !['linear', 'github'].includes(source)) fail('action_invalid');
  const task = config.tasks.find(t => t.id === taskId);
  if (!task) fail('unknown_task');
  await client.authorize();
  const binding = digest({ task, github: config.github, linear: config.linear, actor: config.actor, statuses: config.statuses });
  if (action === 'inspect') {
    const observed = await client.read(task);
    const name = Object.keys(config.statuses).find(k => config.statuses[k].linearStateId === observed.linear.state);
    return { taskId, status: name && matches(observed.github, desiredStatus(config, name).github) ? 'synchronized' : 'drift',
      linearStatus: name ?? 'unmapped', observed, precision: 'github-open-closed; detailed-workflow-remains-in-linear' };
  }
  if (!text(operationId, 128) || !/^[a-zA-Z0-9_-]+$/.test(operationId)) fail('operation_id_required');
  let receipt = Object.hasOwn(store.records, operationId) ? store.records[operationId] : undefined;
  if (action === 'set') {
    let desired;
    if (projection !== undefined) {
      if (source !== 'github' || status !== undefined || projection !== 'open') fail('projection_invalid');
      const allowedStates = Object.values(config.statuses).filter(s => s.githubState === 'open').map(s => s.linearStateId);
      if (!allowedStates.length) fail('projection_unmapped');
      desired = { linear: { allowedStates }, github: { state: 'open', reason: null } };
    } else {
      desired = desiredStatus(config, status);
    }
    // Github's open state cannot specify which of several Linear active states to choose.
    if (!projection && source === 'github' && Object.keys(config.statuses).filter(k =>
      matches(desiredStatus(config, k).github, desired.github)).length > 1) fail('ambiguous_github_status_use_linear');
    if (receipt) {
      if (receipt.binding !== binding || receipt.statusName !== status || receipt.projection !== projection || receipt.source !== source) fail('operation_id_reused');
      // Repeating the same operation only observes; it never repeats an uncertain write.
      action = 'reconcile';
    } else {
      if (Object.values(store.records).some(r => r.taskId === taskId && !terminal(r))) fail('pending_operation_exists');
      const before = await client.read(task);
      const current = Object.keys(config.statuses).find(k => config.statuses[k].linearStateId === before.linear.state);
      const aligned = current && matches(before.github, desiredStatus(config, current).github);
      receipt = { operationId, taskId, binding, source, statusName: status, projection, desired,
        attribution: { requester: config.actor.requester ?? 'operator', executor: 'Nori',
          representedPrincipal: config.actor.principalId ?? config.actor.representedPrincipal ?? 'Nori',
          credentialAccounts: { github: config.github.actorId, linear: config.linear.actorId },
          resourceOwner: config.actor.resourceOwner ?? config.github.repository,
          costAttribution: config.actor.costAttribution ?? 'unknown', outputAudience: config.actor.outputAudience ?? 'private-operator',
          mode: config.actor.mode, grantId: config.actor.grantId, expiresAt: config.actor.expiresAt },
        before, status: aligned ? 'prepared' : 'conflict', createdAt: clock(), updatedAt: clock() };
      store.save(receipt);
    }
  } else if (!receipt || receipt.binding !== binding || receipt.taskId !== taskId) fail('receipt_scope_mismatch');
  if (terminal(receipt)) return receipt;
  if (action === 'set' || action === 'retry') {
    const now = await client.read(task);
    const opposite = receipt.source === 'linear' ? 'github' : 'linear';
    if ((!matches(now[receipt.source], receipt.desired[receipt.source]) && !unchanged(now[receipt.source], receipt.before[receipt.source])) ||
        (!matches(now[opposite], receipt.desired[opposite]) && !unchanged(now[opposite], receipt.before[opposite]))) {
      receipt = { ...receipt, status: 'conflict', observed: now, updatedAt: clock() }; store.save(receipt); return receipt;
    }
    if (!matches(now[receipt.source], receipt.desired[receipt.source])) {
      // Save intent before networking so crashes/timeouts can be reconciled without blind replay.
      receipt = { ...receipt, status: 'write_unknown', updatedAt: clock() }; store.save(receipt);
      try { await client.write(task, receipt.source, receipt.desired); }
      catch (error) {
        receipt = { ...receipt, error: /^tracking_[a-z0-9_]+$/.test(error.message) ? error.message : 'tracking_write_unconfirmed' };
        store.save(receipt); return receipt;
      }
    }
  }
  for (let i = 0; i < config.pollAttempts; i++) {
    let observed;
    try { observed = await client.read(task); }
    catch {
      receipt = { ...receipt, status: 'observation_unavailable', updatedAt: clock() }; store.save(receipt); return receipt;
    }
    const done = matches(observed.linear, receipt.desired.linear) && matches(observed.github, receipt.desired.github);
    const conflict = ['linear', 'github'].some(p => !matches(observed[p], receipt.desired[p]) && !unchanged(observed[p], receipt.before[p]));
    receipt = { ...receipt, observed, status: done ? 'synchronized' : conflict ? 'conflict' : 'sync_pending', updatedAt: clock() };
    delete receipt.error;
    store.save(receipt);
    if (done || conflict) return receipt;
    if (i + 1 < config.pollAttempts) await sleep(config.pollIntervalMs);
  }
  return receipt;
}

// The runtime config is an operator-controlled authority record. Re-read it after
// remote identity resolution so an in-flight call cannot outlive an observed revocation.
export function readTrackingConfig(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.geteuid() || (stat.mode & 0o077)) fail('config_permissions');
    if (stat.size > 1024 * 1024) fail('config_invalid');
    return validateTrackingConfig(JSON.parse(readFileSync(fd, 'utf8')));
  } finally { closeSync(fd); }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('task-tracking <inspect|set|reconcile|retry> --config PRIVATE.json --task ID [--status NAME --source linear|github --operation ID --apply]\nset/retry require --apply. reconcile only reads remote state. Native Linear/GitHub Issue Sync must already be configured.');
    return;
  }
  const action = args.shift(), options = {};
  while (args.length) {
    const key = args.shift();
    if (!['--config', '--task', '--status', '--projection', '--source', '--operation', '--apply'].includes(key) || Object.hasOwn(options, key)) fail('arguments_invalid');
    options[key] = key === '--apply' ? true : args.shift();
    if (options[key] === undefined) fail('arguments_invalid');
  }
  if (!options['--config']) fail('config_required');
  const path = resolve(options['--config']);
  const config = readTrackingConfig(path);
  const checkAuthority = () => {
    if (digest(readTrackingConfig(path)) !== digest(config)) fail('authority_changed');
  };
  if (['set', 'retry'].includes(action) && options['--apply'] !== true) fail('apply_required');
  const store = openTrackingStore(config.stateDir);
  try {
    const result = await trackTask({ config, client: createTrackingClient(config, { checkAuthority }), store, action,
      taskId: options['--task'], status: options['--status'], projection: options['--projection'], source: options['--source'], operationId: options['--operation'] });
    console.log(JSON.stringify(result, null, 2));
    if (!['synchronized'].includes(result.status)) process.exitCode = 2;
  } finally { store.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(/^tracking_[a-z0-9_]+$/.test(error.message) ? error.message : 'tracking_failed'); process.exitCode = 1; });
}
