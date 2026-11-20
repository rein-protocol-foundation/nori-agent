import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readAcceptanceReport, storeDirectory } from '../workspace/skills/nori-acceptance/scripts/acceptance.mjs';
import { readTrackingConfig } from './task-tracking.mjs';

const upstream = fileURLToPath(new URL('../vendor/openclaw/openclaw.mjs', import.meta.url));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,511}$/;
const privateFile = stat => stat.uid === process.geteuid() && (stat.mode & 0o077) === 0;

function requireLink(condition, reason) {
  if (!condition) throw Error(`task_links_${reason}`);
}

function authority(config, taskId) {
  const task = config.tasks.find(candidate => candidate.id === taskId);
  const options = config.taskLinks;
  requireLink(task && options && ['stateDir', 'gatewayConfig', 'gatewayState', 'acceptanceStore'].every(
    key => typeof options[key] === 'string' && isAbsolute(options[key])),
  'scope_required');
  const port = /^ws:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})$/.exec(options.gatewayUrl);
  requireLink(port && Number(port[1]) <= 65535, 'local_gateway_required');
  requireLink(Array.isArray(task.nativeOwnerKeys) &&
    task.nativeOwnerKeys.every(key => typeof key === 'string' && key.trim() === key && key.length > 0 && key.length <= 1024),
  'native_owner_scope_required');
  requireLink(config.actor.mode !== 'delegated' || Date.parse(config.actor.expiresAt) > Date.now(), 'delegation_expired');
  const pair = {
    linearTeam: config.linear.teamId.toLowerCase(),
    linearIssue: task.linearIssue.toLowerCase(),
    githubRepository: config.github.repository.toLowerCase(),
    githubIssue: task.githubIssue,
  };
  const profile = hash([resolve(options.gatewayConfig), resolve(options.gatewayState), options.gatewayUrl]);
  const scope = hash([
    pair, profile, resolve(options.acceptanceStore), config.github.actorId, config.linear.actorId,
    config.actor, config.github.tokenEnv, config.linear.tokenEnv,
  ]);
  return { taskId, pair, profile, scope, options, owners: new Set(task.nativeOwnerKeys.map(hash)) };
}

function openDatabase(stateDir) {
  const directory = storeDirectory(stateDir, true);
  const path = join(directory, 'task-links.sqlite');
  try {
    closeSync(openSync(path, 'wx', 0o600));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const file = lstatSync(path);
  requireLink(file.isFile() && privateFile(file), 'unsafe_database');
  const db = new DatabaseSync(path, { timeout: 3000 });
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS binding (
        taskId TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        linearTeam TEXT NOT NULL,
        linearIssue TEXT NOT NULL,
        githubRepository TEXT NOT NULL,
        githubIssue INTEGER NOT NULL,
        UNIQUE (linearTeam, linearIssue),
        UNIQUE (githubRepository, githubIssue)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS nativeRun (
        taskId TEXT NOT NULL REFERENCES binding(taskId),
        profile TEXT NOT NULL,
        nativeTaskId TEXT NOT NULL,
        nativeRunId TEXT NOT NULL,
        owner TEXT NOT NULL,
        requester TEXT NOT NULL,
        runtime TEXT NOT NULL,
        statusAtLink TEXT NOT NULL,
        linkedAt TEXT NOT NULL,
        PRIMARY KEY (taskId, nativeTaskId),
        UNIQUE (profile, nativeTaskId),
        UNIQUE (profile, nativeRunId)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS acceptanceRound (
        taskId TEXT NOT NULL REFERENCES binding(taskId),
        reportId TEXT NOT NULL,
        round INTEGER NOT NULL,
        digest TEXT NOT NULL,
        nativeTaskId TEXT,
        linkedAt TEXT NOT NULL,
        PRIMARY KEY (taskId, reportId, round),
        FOREIGN KEY (taskId, nativeTaskId) REFERENCES nativeRun(taskId, nativeTaskId)
      ) STRICT;
    `);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function checkBinding(db, context, create = false) {
  const { taskId, pair, scope } = context;
  const existing = db.prepare('SELECT scope FROM binding WHERE taskId = ?').get(taskId);
  if (existing) {
    requireLink(existing.scope === scope, 'binding_scope_changed');
    return true;
  }
  const occupied = db.prepare(`
    SELECT taskId FROM binding WHERE (linearTeam = ? AND linearIssue = ?)
      OR (githubRepository = ? AND githubIssue = ?)
  `).get(pair.linearTeam, pair.linearIssue, pair.githubRepository, pair.githubIssue);
  requireLink(!occupied, 'issue_already_bound');
  if (create) {
    db.prepare('INSERT INTO binding VALUES (?, ?, ?, ?, ?, ?)').run(
      taskId, scope, pair.linearTeam, pair.linearIssue, pair.githubRepository, pair.githubIssue,
    );
  }
  return create;
}

function transact(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function nativeTask(options, nativeTaskId) {
  const result = spawnSync(process.execPath, [
    upstream, 'gateway', 'call', 'tasks.get', '--json', '--timeout', '5000',
    '--expect-url', options.gatewayUrl, '--params', JSON.stringify({ taskId: nativeTaskId }),
  ], {
    env: { ...process.env, OPENCLAW_CONFIG_PATH: options.gatewayConfig, OPENCLAW_STATE_DIR: options.gatewayState },
    timeout: 12000, maxBuffer: 1024 * 1024, encoding: 'utf8',
  });
  requireLink(result.status === 0, 'native_task_unavailable');
  try {
    return JSON.parse(result.stdout).task;
  } catch {
    throw Error('task_links_native_response_invalid');
  }
}

function projectRun(record, nativeTaskId, context) {
  requireLink(record?.taskId === nativeTaskId && identifier.test(record.runId ?? '') &&
    identifier.test(record.runtime ?? '') && identifier.test(record.status ?? ''), 'native_run_unconfirmed');
  const owner = hash(record.ownerKey ?? null);
  const requester = hash(record.sessionKey ?? null);
  requireLink(context.owners.has(owner) && context.owners.has(requester), 'native_task_outside_scope');
  return { nativeTaskId, nativeRunId: record.runId, owner, requester, runtime: record.runtime, statusAtLink: record.status };
}

function withinScope(row, context) {
  return context.owners.has(row.owner) && context.owners.has(row.requester);
}

function runRow(db, context, nativeTaskId) {
  return db.prepare('SELECT * FROM nativeRun WHERE taskId = ? AND nativeTaskId = ?').get(context.taskId, nativeTaskId);
}

function saveRun(db, context, run) {
  const existing = db.prepare('SELECT * FROM nativeRun WHERE profile = ? AND (nativeTaskId = ? OR nativeRunId = ?)')
    .all(context.profile, run.nativeTaskId, run.nativeRunId);
  if (existing.length) {
    requireLink(existing.length === 1 && existing[0].taskId === context.taskId &&
      ['nativeTaskId', 'nativeRunId', 'runtime', 'owner', 'requester'].every(key => existing[0][key] === run[key]),
    'native_run_already_bound');
    return { nativeTaskId: run.nativeTaskId, nativeRunId: run.nativeRunId };
  }
  db.prepare('INSERT INTO nativeRun VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    context.taskId, context.profile, run.nativeTaskId, run.nativeRunId,
    run.owner, run.requester, run.runtime, run.statusAtLink, new Date().toISOString(),
  );
  return { nativeTaskId: run.nativeTaskId, nativeRunId: run.nativeRunId };
}

function projectReport(context, reportId, round) {
  const report = readAcceptanceReport({ store: context.options.acceptanceStore, reportId, round });
  const { pair } = context;
  requireLink(report.reportId === reportId && report.round === round &&
    report.links?.task === context.taskId && report.links?.linear?.toLowerCase() === pair.linearIssue &&
    report.links?.github?.toLowerCase() === `${pair.githubRepository}#${pair.githubIssue}`, 'report_pair_mismatch');
  requireLink(typeof report.sha256 === 'string' && /^[0-9a-f]{64}$/.test(report.sha256), 'report_round_unrecorded');
  return { reportId, round, digest: report.sha256, executionStatus: report.executionStatus, reviewStatus: report.reviewStatus };
}

function saveReport(db, context, report, nativeTaskId) {
  if (nativeTaskId) {
    const run = runRow(db, context, nativeTaskId);
    requireLink(run && withinScope(run, context), 'native_run_not_linked');
  }
  const existing = db.prepare('SELECT digest, nativeTaskId FROM acceptanceRound WHERE taskId = ? AND reportId = ? AND round = ?')
    .get(context.taskId, report.reportId, report.round);
  if (existing) {
    requireLink(existing.digest === report.digest && existing.nativeTaskId === nativeTaskId, 'report_round_already_bound');
  } else {
    db.prepare('INSERT INTO acceptanceRound VALUES (?, ?, ?, ?, ?, ?)').run(
      context.taskId, report.reportId, report.round, report.digest, nativeTaskId, new Date().toISOString(),
    );
  }
  return { ...report, nativeTaskId };
}

function list(db, context) {
  const { taskId, pair } = context;
  const bound = checkBinding(db, context);
  const runs = db.prepare('SELECT * FROM nativeRun WHERE taskId = ? ORDER BY linkedAt, nativeTaskId').all(taskId)
    .filter(row => withinScope(row, context))
    .map(({ nativeTaskId, nativeRunId, runtime, statusAtLink, linkedAt }) =>
      ({ nativeTaskId, nativeRunId, runtime, statusAtLink, linkedAt }));
  const visibleTasks = new Set(runs.map(run => run.nativeTaskId));
  const reportLinks = db.prepare(`
    SELECT reportId, round, digest, nativeTaskId, linkedAt FROM acceptanceRound
    WHERE taskId = ? ORDER BY linkedAt, reportId, round
  `).all(taskId).filter(row => !row.nativeTaskId || visibleTasks.has(row.nativeTaskId));
  const acceptance = reportLinks.map(row => {
    try {
      const view = projectReport(context, row.reportId, row.round);
      requireLink(view.digest === row.digest, 'report_round_digest_changed');
      return { ...row, executionStatus: view.executionStatus, reviewStatus: view.reviewStatus };
    } catch {
      return { ...row, executionStatus: 'unavailable', reviewStatus: 'unavailable' };
    }
  });
  return { taskId, bound, issues: pair, runs, acceptance };
}

export function taskLinks({ config, taskId, command, nativeTaskId, reportId, round, getNativeTask = nativeTask, checkAuthority = () => {} }) {
  const context = authority(config, taskId);
  const db = openDatabase(context.options.stateDir);
  try {
    checkAuthority();
    if (command === 'show') {
      const result = list(db, context);
      checkAuthority();
      return result;
    }
    checkBinding(db, context);
    if (command === 'link-run') {
      requireLink(typeof nativeTaskId === 'string' && identifier.test(nativeTaskId), 'native_task_id_required');
      const run = projectRun(getNativeTask(context.options, nativeTaskId), nativeTaskId, context);
      return transact(db, () => {
        checkAuthority();
        checkBinding(db, context, true);
        return saveRun(db, context, run);
      });
    }
    requireLink(command === 'link-report' && typeof reportId === 'string' &&
      Number.isSafeInteger(round) && round > 0, 'report_round_required');
    const report = projectReport(context, reportId, round);
    return transact(db, () => {
      checkBinding(db, context, true);
      checkAuthority();
      return saveReport(db, context, report, nativeTaskId ?? null);
    });
  } finally {
    db.close();
  }
}

const help = `Nori task links
  show --config PRIVATE.json --task ID
  link-run --config PRIVATE.json --task ID --native-task NATIVE_ID
  link-report --config PRIVATE.json --task ID --report REPORT_ID --round N [--native-task NATIVE_ID]
`;
const actionOptions = {
  show: [],
  'link-run': ['native-task'],
  'link-report': ['report', 'round', 'native-task'],
};

function main([command, ...args]) {
  if (!command || command === '--help') {
    process.stdout.write(help);
    return;
  }
  requireLink(Object.hasOwn(actionOptions, command), 'invalid_command');
  const options = Object.fromEntries(['config', 'task', ...actionOptions[command]].map(name => [name, { type: 'string' }]));
  const { values } = parseArgs({ args, options });
  requireLink(values.config && values.task, 'config_and_task_required');
  const path = resolve(values.config);
  const load = () => {
    try { return readTrackingConfig(path); }
    catch (error) {
      if (error.message === 'tracking_config_permissions') requireLink(false, 'unsafe_config');
      throw error;
    }
  };
  const config = load();
  const snapshot = hash(config);
  const checkAuthority = () => requireLink(hash(load()) === snapshot, 'authority_changed');
  const output = taskLinks({ config, checkAuthority, taskId: values.task, command, nativeTaskId: values['native-task'],
    reportId: values.report, round: Number(values.round) });
  checkAuthority();
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = /^(task_links|tracking)_[a-z0-9_]+$/.test(error.message) ? error.message : 'task_links_unavailable';
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  }
}
