import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, lstatSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readRegular, storeDirectory } from '../workspace/skills/nori-acceptance/scripts/acceptance.mjs';
import { createPairClient } from './task-pair-client.mjs';
import { validateTrackingConfig } from './task-tracking.mjs';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const privateFile = stat => stat.uid === process.geteuid() && (stat.mode & 0o077) === 0;
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
const fail = reason => { throw new Error(`task_pair_${reason}`); };
const check = (condition, reason) => { if (!condition) fail(reason); };
const issueNumber = number => Number.isSafeInteger(number) && number > 0;

export function validatePairConfig(raw) {
  const config = validateTrackingConfig(raw, { allowEmptyTasks: true });
  const pairing = config.issuePairing;
  check(pairing && typeof pairing.stateDir === 'string' && isAbsolute(pairing.stateDir) &&
    typeof pairing.githubRepositoryId === 'string' && /^[1-9]\d*$/.test(pairing.githubRepositoryId) &&
    typeof pairing.linearTeamKey === 'string' && /^[A-Z][A-Z0-9_-]{0,31}$/.test(pairing.linearTeamKey) &&
    (pairing.linearProjectId === undefined || UUID.test(pairing.linearProjectId)) &&
    Array.isArray(pairing.tasks) && pairing.tasks.length > 0 && pairing.tasks.length <= 1000, 'config_invalid');
  const tasks = new Set(), refs = new Set(), operations = new Set();
  const descriptors = pairing.tasks.map(entry => {
    check(entry && ID.test(entry.id ?? '') && ID.test(entry.operationId ?? '') && entry.audienceApproved === true &&
      !tasks.has(entry.id) && !operations.has(entry.operationId) && Boolean(entry.create) !== Boolean(entry.existing),
    'task_config_invalid');
    tasks.add(entry.id);
    operations.add(entry.operationId);
    const known = config.tasks.find(task => task.id === entry.id);
    const nativeOwnerKeys = entry.nativeOwnerKeys ?? [];
    check(Array.isArray(nativeOwnerKeys) && nativeOwnerKeys.length <= 64 && nativeOwnerKeys.every(key =>
      typeof key === 'string' && key.trim() === key && key.length > 0 && key.length <= 1024), 'native_scope_invalid');
    if (entry.create) {
      const { title, body, reference } = entry.create;
      const marker = `[nori:${reference}]`;
      check(!known && UUID.test(reference ?? '') && !refs.has(reference.toLowerCase()) &&
        typeof title === 'string' && title.trim() === title && title.length <= 180 &&
        title.split(marker).length === 2 && title.split('[nori:').length === 2 &&
        typeof body === 'string' && body.trim() && body.length <= 12000 &&
        !/[\u0000-\u001f\u007f]/.test(title) && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(body) &&
        !/[@<>]|!\[/.test(title + '\n' + body), 'public_payload_unapproved');
      refs.add(reference.toLowerCase());
      return { id: entry.id, operationId: entry.operationId, nativeOwnerKeys, create: { title, body, reference, marker } };
    }
    const { githubIssue, linearIssue } = entry.existing;
    check((githubIssue !== undefined || linearIssue !== undefined) &&
      (githubIssue === undefined || issueNumber(githubIssue)) && (linearIssue === undefined || UUID.test(linearIssue)) &&
      (!known || (githubIssue === undefined || githubIssue === known.githubIssue) &&
        (linearIssue === undefined || linearIssue === known.linearIssue)), 'existing_pair_scope_mismatch');
    return { id: entry.id, operationId: entry.operationId, nativeOwnerKeys,
      existing: { githubIssue: githubIssue ?? known?.githubIssue ?? null, linearIssue: linearIssue ?? known?.linearIssue ?? null } };
  });
  return { ...config, issuePairing: { ...pairing, tasks: descriptors } };
}

function binding(config, task) {
  const { actor, github, linear, issuePairing: pairing } = config;
  return hash([task, github.repository, github.actorId, linear.teamId, linear.actorId, pairing.githubRepositoryId,
    pairing.linearTeamKey, pairing.linearProjectId ?? null, actor.mode, actor.grantId ?? null, actor.principalId ?? null,
    actor.requester ?? null, actor.resourceOwner ?? null, actor.outputAudience ?? null]);
}

function openStore(location) {
  const path = join(storeDirectory(location, true), 'task-pairs.sqlite');
  try { closeSync(openSync(path, 'wx', 0o600)); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = lstatSync(path);
  check(stat.isFile() && privateFile(stat), 'store_permissions');
  const db = new DatabaseSync(path, { timeout: 3000 });
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS intents (
        task TEXT PRIMARY KEY, operationId TEXT NOT NULL UNIQUE, binding TEXT NOT NULL,
        marker TEXT UNIQUE, createdAt TEXT NOT NULL, writeReservedAt TEXT, githubIssue INTEGER,
        linearIssue TEXT, verifiedAt TEXT, conflictAt TEXT, UNIQUE (githubIssue), UNIQUE (linearIssue)
      ) STRICT;
    `);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

const readIntent = (db, id) => db.prepare('SELECT * FROM intents WHERE task = ?').get(id);

function prepare(db, config, task, now) {
  const scope = binding(config, task);
  const marker = task.create?.reference.toLowerCase() ?? null;
  db.prepare(`INSERT OR IGNORE INTO intents
    (task, operationId, binding, marker, createdAt, githubIssue, linearIssue) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    task.id, task.operationId, scope, marker, now, task.existing?.githubIssue ?? null, task.existing?.linearIssue ?? null,
  );
  const intent = readIntent(db, task.id);
  check(intent?.operationId === task.operationId && intent.binding === scope, 'operation_scope_conflict');
  return intent;
}

function recordRefs(db, id, githubIssue, linearIssue, verifiedAt = null) {
  let updated;
  try {
    updated = db.prepare(`UPDATE intents SET
      githubIssue = COALESCE(githubIssue, ?), linearIssue = COALESCE(linearIssue, ?),
      verifiedAt = COALESCE(verifiedAt, ?)
      WHERE task = ? AND (githubIssue IS NULL OR ? IS NULL OR githubIssue = ?)
        AND (linearIssue IS NULL OR ? IS NULL OR linearIssue = ?) RETURNING *`).get(
      githubIssue, linearIssue, verifiedAt, id, githubIssue, githubIssue, linearIssue, linearIssue,
    );
  } catch (error) {
    if (error.errcode === 2067) fail('pair_conflict');
    throw error;
  }
  check(updated, 'pair_conflict');
  return updated;
}

function view(intent, status) {
  const result = { taskId: intent.task, operationId: intent.operationId,
    status: status ?? (intent.conflictAt ? 'conflict' : intent.verifiedAt ? 'paired' : intent.githubIssue || intent.linearIssue ? 'sync_pending'
      : intent.writeReservedAt ? 'write_unknown' : 'prepared') };
  if (intent.githubIssue) result.githubIssue = intent.githubIssue;
  if (intent.linearIssue) result.linearIssue = intent.linearIssue;
  if (intent.verifiedAt) result.verifiedAt = intent.verifiedAt;
  if (result.status === 'paired') result.trackingTask = {
    id: intent.task, githubIssue: intent.githubIssue, linearIssue: intent.linearIssue, audienceApproved: true,
  };
  return result;
}

function conflict(db, id, now) {
  return view(db.prepare('UPDATE intents SET conflictAt = COALESCE(conflictAt, ?) WHERE task = ? RETURNING *').get(now, id));
}

function findCanonical(client, candidates, knownNumber) {
  const matches = new Map();
  for (const issue of candidates) {
    check(UUID.test(issue.id ?? ''), 'invalid_linear_response');
    const attached = client.attachments(issue);
    if (knownNumber !== null && !attached.includes(knownNumber)) continue;
    check(attached.length <= 1, 'pair_conflict');
    if (attached.length) matches.set(issue.id, attached[0]);
  }
  check(matches.size <= 1, 'pair_conflict');
  return [...matches].map(([linearIssue, githubIssue]) => ({ linearIssue, githubIssue }))[0];
}

async function observe(client, db, task, clock) {
  let current = readIntent(db, task.id);
  let fromGithub = current.githubIssue;
  let source;
  if (fromGithub) source = await client.getGithub(fromGithub);
  const title = task.create?.title ?? source?.title;
  const candidates = current.linearIssue ? [await client.getLinear(current.linearIssue)] :
    title ? await client.byTitle(title) : [];
  const canonical = findCanonical(client, candidates, fromGithub);
  if (!canonical && current.linearIssue && fromGithub) {
    check(client.attachments(candidates[0]).length === 0 && !current.verifiedAt, 'pair_conflict');
  }
  if (task.create && !fromGithub) {
    check(candidates.length <= 1, 'pair_conflict');
    const since = new Date(Date.parse(current.createdAt) - 24 * 60 * 60 * 1000).toISOString();
    const matches = await client.recentByReference(task.create, since);
    const numbers = new Set(matches.map(issue => issue.number));
    if (canonical) numbers.add(canonical.githubIssue);
    check(numbers.size <= 1, 'pair_conflict');
    if (numbers.size) {
      const [number] = numbers;
      source = await client.getGithub(number);
      check(client.matchesApproved(source, task.create), 'pair_conflict');
      fromGithub = number;
      current = recordRefs(db, task.id, number, null);
    }
    if (!canonical && candidates.length) current = recordRefs(db, task.id, null, candidates[0].id);
  }
  if (canonical) {
    const pair = { id: task.id, ...canonical, audienceApproved: true };
    await client.verifyPair(pair);
    return recordRefs(db, task.id, canonical.githubIssue, canonical.linearIssue, clock());
  }
  return current;
}

function stage(config, task, intent, output) {
  check(typeof output === 'string' && intent.verifiedAt && !intent.conflictAt, 'verified_pair_required');
  const path = resolve(output);
  const directory = storeDirectory(dirname(path));
  const pair = view(intent).trackingTask;
  const previous = config.tasks.find(task => task.id === pair.id);
  check(!previous || (previous.githubIssue === pair.githubIssue && previous.linearIssue === pair.linearIssue), 'pair_conflict');
  const { issuePairing: _approval, ...base } = config;
  const staged = validateTrackingConfig({ ...base, tasks: previous ? base.tasks :
    [...base.tasks, { ...pair, nativeOwnerKeys: task.nativeOwnerKeys }] });
  const temp = join(directory, `.staged-task-${randomUUID()}`);
  const fd = openSync(temp, 'wx', 0o600);
  try {
    try {
      writeFileSync(fd, JSON.stringify(staged, null, 2) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    linkSync(temp, join(directory, basename(path)));
  } finally {
    unlinkSync(temp);
  }
  return { ...view(intent), staged: true };
}

export async function pairTask({ config, taskId, command, apply, output, client, checkAuthority = () => {},
  clock = () => new Date().toISOString(), sleep = wait }) {
  const task = config.issuePairing.tasks.find(entry => entry.id === taskId);
  check(task, 'task_not_approved');
  check(['create', 'discover', 'show', 'stage'].includes(command), 'command_invalid');
  check(command !== 'create' || apply === true && task.create, 'create_approval_required');
  const db = openStore(config.issuePairing.stateDir);
  try {
    checkAuthority();
    let current = prepare(db, config, task, clock());
    if (command === 'stage') return stage(config, task, current, output);
    if (command === 'show' || current.conflictAt) return view(current);
    await client.authorize();
    try {
      current = await observe(client, db, task, clock);
    } catch (error) {
      if (error.message === 'task_pair_pair_conflict') return conflict(db, taskId, clock());
      return view(readIntent(db, taskId), 'lookup_unavailable');
    }
    if (current.verifiedAt) return view(current);
    const mightCreate = command === 'create' && !current.writeReservedAt && !current.githubIssue && !current.linearIssue;
    if (mightCreate) {
      await client.authorize(true);
      checkAuthority();
      const reserved = db.prepare(`UPDATE intents SET writeReservedAt = ?
        WHERE task = ? AND writeReservedAt IS NULL AND githubIssue IS NULL AND linearIssue IS NULL
          AND verifiedAt IS NULL AND conflictAt IS NULL RETURNING *`).get(clock(), taskId);
      if (reserved) {
        try {
          const number = await client.create(task.create);
          current = recordRefs(db, taskId, number, null);
        } catch (error) {
          if (error.message === 'task_pair_pair_conflict') return conflict(db, taskId, clock());
          // An uncertain POST can be followed only by read-only discovery.
        }
      }
    }
    for (let attempt = 0; attempt < config.pollAttempts; attempt++) {
      if (attempt) await sleep(config.pollIntervalMs);
      try {
        current = await observe(client, db, task, clock);
      } catch (error) {
        if (error.message === 'task_pair_pair_conflict') return conflict(db, taskId, clock());
        if (attempt + 1 === config.pollAttempts) return view(readIntent(db, taskId), 'lookup_unavailable');
        continue;
      }
      if (current.verifiedAt) return view(current);
    }
    return view(readIntent(db, taskId));
  } finally {
    db.close();
  }
}

function loadConfig(path) {
  const { bytes } = readRegular(path, 1024 * 1024, stat => check(privateFile(stat), 'config_permissions'));
  return validatePairConfig(JSON.parse(bytes.toString('utf8')));
}

const help = `Nori issue pairing
  create --config PRIVATE.json --task ID --apply
  discover --config PRIVATE.json --task ID
  show --config PRIVATE.json --task ID
  stage --config PRIVATE.json --task ID --output PRIVATE_FILE
`;

async function main([command, ...args]) {
  if (!command || command === '--help') {
    process.stdout.write(help);
    return;
  }
  const { values } = parseArgs({ args, options: {
    config: { type: 'string' }, task: { type: 'string' }, apply: { type: 'boolean' }, output: { type: 'string' },
  } });
  check(values.config && values.task, 'config_and_task_required');
  const path = resolve(values.config);
  const config = loadConfig(path);
  const snapshot = hash(config);
  const checkAuthority = () => check(hash(loadConfig(path)) === snapshot, 'authority_changed');
  const result = await pairTask({ config, taskId: values.task, command, apply: values.apply, output: values.output,
    client: createPairClient(config, { checkAuthority }), checkAuthority });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'paired') process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write((/^(task_pair|tracking)_[a-z0-9_]+$/.test(error.message) ? error.message : 'task_pair_unavailable') + '\n');
    process.exitCode = 1;
  });
}
