import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPairClient } from '../scripts/task-pair-client.mjs';
import { pairTask, validatePairConfig } from '../scripts/task-pair.mjs';
import { validateTrackingConfig } from '../scripts/task-tracking.mjs';

const id = last => `00000000-0000-4000-8000-0000000000${last}`;
const approved = {
  id: 'approved-task', operationId: 'task-intent-1', audienceApproved: true,
  create: { reference: id('12'), title: `Synthetic public fixture [nori:${id('12')}]`, body: 'Safe fixture issue body.' },
};
const repo = 'example/nori-agent';
const issueUrl = number => `https://github.com/${repo}/issues/${number}`;
const repoApi = `https://api.github.com/repos/${repo}`;

function fixture(t, task = approved) {
  const directory = mkdtempSync(join(tmpdir(), 'nori-task-pair-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const raw = JSON.parse(readFileSync(new URL('../config/task-tracking.example.json', import.meta.url), 'utf8'));
  Object.assign(raw, { stateDir: join(directory, 'tracking'), tasks: [], pollAttempts: 2, pollIntervalMs: 0 });
  raw.issuePairing = { stateDir: join(directory, 'pairs'), linearTeamKey: 'TEST',
    githubRepositoryId: '904', tasks: [structuredClone(task)] };
  const team = { id: raw.linear.teamId, key: 'TEST' };
  const env = { [raw.github.tokenEnv]: 'github-fixture-key', [raw.linear.tokenEnv]: 'linear-fixture-key' };
  const calls = [], posts = [];
  const source = new Map(), mirror = new Map();
  const github = (number, title = approved.create.title, body = approved.create.body, user = raw.github.actorId) => ({
    number, title, body, user: { id: Number(user) }, repository_url: repoApi, state: 'open', updated_at: 'now',
  });
  const linear = (linearId, numbers, title = approved.create.title, overrides = {}) => ({
    id: linearId, title, team, state: { id: raw.statuses.todo.linearStateId, type: 'unstarted' }, updatedAt: 'now',
    attachments: { nodes: numbers.map(number => ({ url: issueUrl(number) })), pageInfo: { hasNextPage: false } },
    ...overrides,
  });
  const remote = {
    repository: { id: 904, full_name: repo, private: false, has_issues: true, archived: false },
    author: raw.github.actorId, post: undefined, incomplete: false,
  };
  async function fetchImpl(input, options) {
    const url = new URL(input), body = options.body && JSON.parse(options.body);
    calls.push([options.method, url.pathname, body?.query?.split('(')[0]]);
    const response = result => Response.json(result);
    if (url.hostname === 'api.github.com') {
      if (url.pathname === '/user') return response({ id: Number(remote.author) });
      if (input === repoApi) {
        remote.onRepositoryRead?.();
        return response(remote.repository);
      }
      if (input.startsWith(repoApi + '/issues/')) {
        return response(source.get(Number(url.pathname.split('/').at(-1))));
      }
      if (url.pathname === `/repos/${repo}/issues` && options.method === 'POST') {
        posts.push(body);
        if (remote.post) return remote.post(body);
        const result = github(42, body.title, body.body);
        source.set(42, result);
        return response(result);
      }
      if (url.pathname === `/repos/${repo}/issues`) {
        assert.equal(url.searchParams.get('state'), 'all');
        assert.ok(url.searchParams.get('since'));
        return response(remote.incomplete ? Array.from({ length: 100 }, (_, n) => github(500 + n, 'Unrelated')) :
          [...source.values()]);
      }
    }
    if (url.hostname === 'api.linear.app') {
      if (body.query.includes('TrackingActor')) return response({ data: { viewer: { id: raw.linear.actorId } } });
      if (body.query.includes('PairTeam')) return response({ data: { team } });
      if (body.query.includes('PairByTitle')) {
        assert.deepEqual(body.variables.team, 'TEST');
        return response({ data: { issues: { nodes: [...mirror.values()].filter(row => row.title === body.variables.title),
          pageInfo: { hasNextPage: false } } } });
      }
      if (body.query.includes('PairLinearIssue') || body.query.includes('TrackingIssue')) {
        return response({ data: { issue: mirror.get(body.variables.id) ?? null } });
      }
    }
    throw new Error('Unexpected fixture call');
  }
  async function run(command, options = {}) {
    const config = validatePairConfig(raw);
    const checkAuthority = options.checkAuthority ?? (() => {});
    return pairTask({ config, taskId: task.id, command, apply: true, sleep: async () => {},
      client: createPairClient(config, { fetchImpl, env, checkAuthority }), ...options });
  }
  return { directory, raw, source, mirror, calls, posts, github, linear, remote, run };
}

test('create persists a one-time write claim and recovers timeout and mirror delay across invocations', async t => {
  const f = fixture(t);
  let signalPost, releasePost;
  const postStarted = new Promise(resolve => { signalPost = resolve; });
  const postReleased = new Promise(resolve => { releasePost = resolve; });
  f.remote.post = async request => {
    signalPost();
    await postReleased;
    f.source.set(42, f.github(42, request.title, request.body));
    throw Error('connection dropped after effect');
  };
  const runner = f.run('create');
  await postStarted;
  assert.equal((await f.run('show')).status, 'write_unknown');
  const overlap = await f.run('create');
  assert.equal(overlap.status, 'write_unknown');
  assert.deepEqual(f.posts, [{ title: approved.create.title, body: approved.create.body }]);
  releasePost();
  const awaiting = await runner;
  assert.equal(awaiting.status, 'sync_pending');
  assert.equal(awaiting.githubIssue, 42);
  f.mirror.set(id('18'), f.linear(id('18'), [42]));
  const paired = await f.run('discover');
  assert.equal(paired.status, 'paired');
  assert.deepEqual(paired.trackingTask, { id: approved.id, audienceApproved: true, githubIssue: 42, linearIssue: id('18') });
  assert.deepEqual(await f.run('create'), paired);
  assert.equal(f.posts.length, 1);

  const output = join(f.directory, 'approved-tracking.json');
  const beforeStage = f.calls.length;
  assert.equal((await f.run('stage', { output })).staged, true);
  assert.equal(f.calls.length, beforeStage, 'staging is local');
  assert.equal(statSync(output).mode & 0o777, 0o600);
  const config = validateTrackingConfig(JSON.parse(readFileSync(output, 'utf8')));
  assert.equal(config.tasks[0].linearIssue, id('18'));
  assert.deepEqual(config.tasks[0].nativeOwnerKeys, []);
  assert.equal(config.issuePairing, undefined);
  await assert.rejects(f.run('stage', { output }), /EEXIST/);
});

test('uncertain creation with no observed effect or source ID cannot be replayed', async t => {
  const f = fixture(t);
  f.remote.post = async () => { throw Error('connection lost before response'); };
  assert.equal((await f.run('create')).status, 'write_unknown');
  assert.equal((await f.run('create')).status, 'write_unknown');
  assert.equal((await f.run('discover')).status, 'write_unknown');
  await assert.rejects(f.run('stage', { output: join(f.directory, 'tracking.json') }), /verified_pair_required/);
  f.raw.issuePairing.tasks[0].operationId = 'trying-again';
  await assert.rejects(f.run('create'), /operation_scope_conflict/);
  assert.equal(f.posts.length, 1);
});

test('preflight blocks incomplete lookup and respects actual repository and actor authority', async t => {
  const f = fixture(t);
  f.remote.incomplete = true;
  assert.equal((await f.run('create')).status, 'lookup_unavailable');
  assert.equal((await f.run('show')).status, 'prepared');
  f.remote.incomplete = false;
  f.remote.author = '2';
  await assert.rejects(f.run('create'), /tracking_actor_mismatch/);
  f.remote.author = f.raw.github.actorId;
  f.remote.repository.id = 905;
  await assert.rejects(f.run('create'), /scope_mismatch/);
  f.remote.repository.id = 904;
  f.remote.repository.private = true;
  await assert.rejects(f.run('create'), /public_issue_creation_unavailable/);
  assert.equal(f.posts.length, 0);
});

test('authority revoked during final scope check prevents any POST', async t => {
  const f = fixture(t);
  let repositoryReads = 0;
  f.remote.onRepositoryRead = () => { repositoryReads++; };
  const checkAuthority = () => {
    if (repositoryReads >= 2) throw Error('task_pair_authority_changed');
  };
  await assert.rejects(f.run('create', { checkAuthority }), /authority_changed/);
  assert.equal((await f.run('show')).status, 'prepared');
  assert.equal(f.posts.length, 0);
});

test('existing Linear-only pair is identified by canonical attachment and mismatches stay private', async t => {
  const existing = { id: 'existing-task', operationId: 'existing-task-lookup', audienceApproved: true,
    existing: { linearIssue: id('19') } };
  const f = fixture(t, existing);
  f.source.set(10, f.github(10, 'Actual existing title'));
  f.mirror.set(id('19'), f.linear(id('19'), [], 'Changed from the GitHub title', {
    attachments: { pageInfo: { hasNextPage: false }, nodes: [{ url: issueUrl(10).replace('/issues/', '/pull/') }] },
  }));
  assert.equal((await f.run('discover')).status, 'sync_pending');
  f.mirror.set(id('19'), f.linear(id('19'), [10], 'Changed from the GitHub title'));
  const paired = await f.run('discover');
  assert.equal(paired.status, 'paired');
  assert.equal(paired.githubIssue, 10);
  f.mirror.set(id('19'), f.linear(id('19'), [11], 'Changed again'));
  assert.equal((await f.run('discover')).status, 'conflict');
  assert.equal((await f.run('show')).status, 'conflict');
  await assert.rejects(f.run('stage', { output: join(f.directory, 'stage.json') }), /verified_pair_required/);
  assert.equal(f.posts.length, 0);
});

test('a matching existing source or unmirrored Linear intent cannot trigger duplicate creation', async t => {
  const f = fixture(t);
  f.mirror.set(id('19'), f.linear(id('19'), []));
  assert.equal((await f.run('create')).status, 'sync_pending');
  assert.equal(f.posts.length, 0);
  f.source.set(12, f.github(12));
  f.mirror.set(id('19'), f.linear(id('19'), [12]));
  const result = await f.run('discover');
  assert.equal(result.githubIssue, 12);
  assert.equal(result.status, 'paired');
  assert.equal(f.posts.length, 0);
});

test('contradictory matches are blocked durably and unsafe payloads never reach transport', async t => {
  const f = fixture(t);
  f.source.set(12, f.github(12));
  f.source.set(13, f.github(13));
  assert.equal((await f.run('create')).status, 'conflict');
  f.source.clear();
  assert.equal((await f.run('create')).status, 'conflict');
  f.raw.issuePairing.tasks[0].create.body = 'Mention @all or embed ![remote](https://example.invalid).';
  await assert.rejects(f.run('create'), /public_payload_unapproved/);
  assert.equal(f.posts.length, 0);
});

test('CLI requires explicit create apply and accepts only private authority files', t => {
  const f = fixture(t);
  const path = join(f.directory, 'operator-config.json');
  writeFileSync(path, JSON.stringify(f.raw), { mode: 0o600 });
  const entry = fileURLToPath(new URL('../scripts/task-pair.mjs', import.meta.url));
  const cli = command => spawnSync(process.execPath, [entry, command, '--config', path, '--task', approved.id], {
    cwd: f.directory, env: { HOME: f.directory, PATH: '/usr/bin:/bin' }, timeout: 10000, encoding: 'utf8',
  });
  const unapproved = cli('create');
  assert.equal(unapproved.status, 1);
  assert.match(unapproved.stderr, /create_approval_required/);
  const local = cli('show');
  assert.equal(local.status, 2);
  assert.equal(JSON.parse(local.stdout).status, 'prepared');
  chmodSync(path, 0o640);
  const exposed = cli('show');
  assert.equal(exposed.status, 1);
  assert.match(exposed.stderr, /config_permissions/);
});
