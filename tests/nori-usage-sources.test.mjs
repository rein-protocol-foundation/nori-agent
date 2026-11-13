import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, cpSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import test from 'node:test';
import { collectNoriUsageSources, exportNoriUsage, refreshNoriUsage } from '../scripts/nori-usage-sources.mjs';
import { calendarDayBounds, collectMagpieUsage } from '../scripts/daily-agent-receipt.mjs';

const bounds = calendarDayBounds({ date: '2026-11-05' });
const time = '2026-11-05T10:00:00.000Z';
const now = new Date('2026-11-06T12:00:00Z');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nori-sources-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function event(id, provider = 'bailian', extra = {}) {
  return { type: 'message', id, timestamp: time, parentId: null,
    message: { role: 'assistant', provider, model: 'qwen3.8-flash', timestamp: Date.parse(time),
      content: [{ type: 'text', text: 'SENSITIVE-BODY' }], usage: { input: 10, output: 2, cacheRead: 5, cacheWrite: 1 }, ...extra } };
}
function profile(root, agents) {
  mkdirSync(join(root, 'state'), { recursive: true });
  const registry = new DatabaseSync(join(root, 'state/openclaw.sqlite'));
  registry.exec('CREATE TABLE agent_databases(agent_id TEXT,path TEXT)');
  for (const [id, entries] of Object.entries(agents)) {
    const directory = join(root, 'agents', id, 'agent'); mkdirSync(directory, { recursive: true });
    const file = join(directory, 'openclaw-agent.sqlite');
    registry.prepare('INSERT INTO agent_databases VALUES (?,?)').run(id, `agents/${id}/agent/openclaw-agent.sqlite`);
    const database = new DatabaseSync(file);
    database.exec('CREATE TABLE transcript_events(session_id TEXT,seq INTEGER,event_json TEXT,created_at INTEGER,event_zstd BLOB,event_utf8_bytes INTEGER,navigation_json TEXT)');
    entries.forEach((item, i) => {
      const body = JSON.stringify(item.event ?? item), bytes = Buffer.from(body);
      database.prepare('INSERT INTO transcript_events VALUES (?,?,?,?,?,?,?)').run('stable-session', i + 1,
        item.compressed ? null : body, Date.parse(time), item.compressed ? zstdCompressSync(bytes) : null,
        item.compressed ? bytes.length : null, item.compressed ? '{"version":1}' : null);
    });
    database.close();
  }
  registry.close();
}
function nativeService() {
  const reported = new Map(), requests = [], gateway = [];
  const fetchImpl = async (url, options = {}) => {
    url = new URL(url); requests.push({ url, ...options });
    assert.equal(url.pathname, '/v1/magpie/usage/requests');
    if (options.method === 'POST') {
      let accepted = 0, skipped = 0;
      for (const row of JSON.parse(options.body)) {
        assert.equal('cost' in row, false); assert.equal('priced' in row, false);
        if (reported.has(row.rid)) skipped++;
        else { reported.set(row.rid, { ...row, source: 'reported', priced: !['auto', 'Unknown model'].includes(row.model), cost: row.model === 'auto' ? 0 : 0.42 }); accepted++; }
      }
      return new Response(JSON.stringify({ accepted, skipped }));
    }
    const all = url.searchParams.get('via') === 'through' ? gateway : [...reported.values()];
    const offset = Number(url.searchParams.get('offset'));
    return new Response(JSON.stringify({ rows: all.slice(offset, offset + 500), total: all.length, offset }));
  };
  return { reported, requests, gateway, fetchImpl };
}

test('all dynamic agent DBs, compressed events and historical branches count; gateway routes and copied profiles dedupe', async t => {
  const root = fixture(t), original = join(root, 'slack'), copy = join(root, 'copy');
  profile(original, { main: [event('e1'), { event: event('e2'), compressed: true }, event('gateway', 'rein-magpie')],
    'new-agent': [event('e3', 'bailian', { responseId: 'provider-response-3' })] });
  cpSync(original, copy, { recursive: true });
  const config = { profiles: [{ id: 'slack', root: original }, { id: 'copied-profile', root: copy }],
    gatewayProviderIds: ['rein-magpie'], providerAliases: { bailian: 'bailian-token-plan' } };
  const result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 3); assert.equal(result.coverage.complete, true);
  assert.equal(result.rows.reduce((n, row) => n + row.in + row.out + row.cache_read + row.cache_write, 0), 54);
  assert.equal(result.coverage.sources[0].agents, 2);
  assert.equal(result.coverage.sources[1].duplicates, 3);
  assert.equal(result.coverage.sources[0].excludedGateway, 1);
  assert.ok(result.rows.every(row => row.provider === 'bailian-token-plan'));
  assert.doesNotMatch(JSON.stringify(result), /SENSITIVE-BODY|provider-response-3|stable-session|openclaw-agent.sqlite/);
  assert.ok(result.rows.every(row => /^nori-usage:[a-f0-9]{64}$/.test(row.rid)));
});

test('shared stable identity with conflicting accounting flags incomplete and blocks refresh without writes', async t => {
  const root = fixture(t), first = join(root, 'first'), second = join(root, 'second');
  profile(first, { main: [event('same-id')] });
  profile(second, { main: [event('same-id', 'bailian', { usage: { input: 99, output: 2 } })] });
  const config = { profiles: [{ id: 'first', root: first }, { id: 'second', root: second }] };
  const result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 1); assert.equal(result.coverage.identityConflicts, 1); assert.equal(result.coverage.complete, false);
  const native = nativeService();
  await assert.rejects(refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl }), /Incomplete owned usage coverage/);
  assert.equal(native.requests.filter(request => request.method === 'POST').length, 0);
});

test('same body/tokens with distinct event IDs remains distinct; known response match suppresses gateway overlap', async t => {
  const root = fixture(t); profile(root, { main: [event('first'), event('second'), event('third', 'bailian', { responseId: 'already-gateway' })] });
  const result = await collectNoriUsageSources({ config: { profiles: [{ id: 'slack', root }] }, bounds,
    gatewayResponseIds: [{ provider: 'bailian', responseId: 'already-gateway' }], readNativePrices: false });
  assert.equal(result.rows.length, 2); assert.equal(result.coverage.sources[0].excludedGateway, 1);
});

test('missing roots, corrupt compressed payloads and no configured scopes never claim complete coverage', async t => {
  const root = fixture(t); profile(root, { main: [{ event: event('broken'), compressed: true }] });
  const database = new DatabaseSync(join(root, 'agents/main/agent/openclaw-agent.sqlite'));
  database.exec("UPDATE transcript_events SET event_zstd=x'010203'"); database.close();
  for (const config of [{}, { profiles: [{ id: 'missing', root: join(root, 'missing') }] }, { profiles: [{ id: 'broken', root }] }]) {
    const result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
    assert.equal(result.coverage.complete, false);
  }
});

function codexJournal(root, file, { thread = 'owned-thread', originator = 'acpx', model = 'gpt-5.4-mini', events = [] } = {}) {
  mkdirSync(join(root, 'sessions/2026/11/05'), { recursive: true });
  const header = { type: 'session_meta', timestamp: time, payload: { id: thread, originator, model_provider: 'pilot-openai', source: originator === 'acpx' ? 'vscode' : 'cli' } };
  const context = { type: 'turn_context', timestamp: time, payload: { turn_id: 'turn-1', model } };
  writeFileSync(join(root, 'sessions/2026/11/05', file), [header, context, ...events].map(value => JSON.stringify(value)).join('\n') + '\n');
}
const counters = (input, cached, output) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, cache_write_input_tokens: 0, reasoning_output_tokens: 1 });
const record = (response, usage) => ({ type: 'token_usage_record', timestamp: time, payload: { response_id: response, turn_id: 'turn-1', usage } });
const cumulative = (usage, timestamp = time) => ({ type: 'event_msg', timestamp, payload: { type: 'token_count', info: { total_token_usage: usage, last_token_usage: counters(9999, 0, 999) } } });

test('owned acpx Codex per-call records beat repeated cumulative snapshots, dedupe copied files and exclude standalone CLI', async t => {
  const root = fixture(t);
  const observations = [record('response-a', counters(100, 80, 10)), cumulative(counters(100, 80, 10)),
    record('response-b', counters(50, 20, 5)), cumulative({ ...counters(150, 100, 15), reasoning_output_tokens: 2 })];
  codexJournal(root, 'a.jsonl', { events: observations }); codexJournal(root, 'copy.jsonl', { events: observations });
  codexJournal(root, 'desktop.jsonl', { thread: 'not-nori', originator: 'codex_cli_rs', events: [record('standalone', counters(999, 0, 99))] });
  codexJournal(root, 'guardian.jsonl', { thread: 'guardian', model: 'codex-auto-review', events: [record('guardian-response', counters(20, 5, 3))] });
  const config = { codexRoots: [{ id: 'acp-pilot', root, originators: ['acpx'], providerAliases: { 'pilot-openai': 'openai' } }] };
  const result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 3); assert.equal(result.coverage.complete, true);
  assert.equal(result.rows.filter(row => row.model === 'gpt-5.4-mini').reduce((n, row) => n + row.in, 0), 50);
  assert.equal(result.rows.filter(row => row.model === 'gpt-5.4-mini').reduce((n, row) => n + row.cache_read, 0), 100);
  assert.equal(result.coverage.sources[0].excludedUnowned, 1);
  assert.equal(result.rows.find(row => row.model === 'codex-auto-review').priced, false);
  assert.doesNotMatch(JSON.stringify(result), /response-a|response-b|guardian-response|not-nori|owned-thread/);
});

test('legacy Codex fallback uses cumulative deltas including a reset, never last_token_usage', async t => {
  const root = fixture(t);
  codexJournal(root, 'legacy.jsonl', { events: [cumulative(counters(10, 2, 1)), cumulative(counters(30, 5, 3), '2026-11-05T10:00:01Z'),
    cumulative(counters(4, 1, 1), '2026-11-05T10:00:02Z')] });
  const result = await collectNoriUsageSources({ config: { codexRoots: [{ id: 'acp', root }] }, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.reduce((n, row) => n + row.in + row.cache_read, 0), 34);
  assert.equal(result.rows.reduce((n, row) => n + row.out, 0), 4);
});

test('protected aggregate export validates uid, freshness, interval and permissions without exposing transcript IDs', async t => {
  const root = fixture(t), source = join(root, 'profile'); profile(source, { main: [event('e')] });
  const exported = await exportNoriUsage({ config: { sourceId: 'owned-export', profiles: [{ id: 'slack', root: source }] }, bounds, fetchImpl: nativeService().fetchImpl, now });
  const path = join(root, 'export.json'); writeFileSync(path, JSON.stringify(exported), { mode: 0o600 });
  const input = { id: 'owned-export', path, expectedUid: process.getuid(), maxAgeHours: 1 };
  const result = await collectNoriUsageSources({ config: { imports: [input] }, bounds, now, readNativePrices: false });
  assert.equal(result.rows.length, 1); assert.equal(result.coverage.complete, true);
  for (const changed of [{ expectedUid: process.getuid() + 1 }, { maxAgeHours: 0.00001 }]) {
    const result = await collectNoriUsageSources({ config: { imports: [{ ...input, ...changed }] }, bounds,
      now: new Date(now.getTime() + 60_000), readNativePrices: false });
    assert.equal(result.coverage.complete, false); assert.equal(result.rows.length, 0);
  }
  chmodSync(path, 0o666);
  assert.equal((await collectNoriUsageSources({ config: { imports: [input] }, bounds, now, readNativePrices: false })).coverage.complete, false);
});

test('mirror/runtime placeholders are not inference; ambiguous nonzero ACP aggregates flag a gap', async t => {
  const root = fixture(t);
  profile(root, { main: [event('actual'), event('mirror', 'openclaw', { model: 'delivery-mirror' }),
    event('empty-acp', 'openclaw', { model: 'acp-runtime', usage: { input: 0, output: 0 } })] });
  let result = await collectNoriUsageSources({ config: { profiles: [{ id: 'slack', root }] }, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 1); assert.equal(result.coverage.sources[0].excludedPlaceholders, 2);
  assert.equal(result.coverage.complete, true);
  const db = new DatabaseSync(join(root, 'agents/main/agent/openclaw-agent.sqlite'));
  db.prepare('INSERT INTO transcript_events VALUES (?,?,?,?,?,?,?)').run('stable-session', 4,
    JSON.stringify(event('unknown-acp', 'openclaw', { model: 'acp-runtime' })), Date.parse(time), null, null, null); db.close();
  result = await collectNoriUsageSources({ config: { profiles: [{ id: 'slack', root }] }, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 1); assert.equal(result.coverage.complete, false);
});

test('Codex mid-turn model changes keep captured/explicit per-call identities; isolated exports perform no native requests', async t => {
  const root = fixture(t);
  codexJournal(root, 'switch.jsonl', { events: [record('before-switch', counters(10, 2, 1)),
    { type: 'turn_context', timestamp: time, payload: { turn_id: 'turn-1', model: 'gpt-6.1-sol' } },
    record('after-switch', counters(20, 3, 2)),
    { ...record('explicit-model', counters(30, 4, 3)), payload: { ...record('explicit-model', counters(30, 4, 3)).payload, model: 'gpt-6-astra' } }] });
  const exported = await exportNoriUsage({ config: { sourceId: 'owned', codexRoots: [{ id: 'acp', root }] }, bounds,
    fetchImpl: () => { throw new Error('Exporter must never call Magpie'); } });
  assert.deepEqual(exported.rows.map(row => row.model), ['gpt-5.4-mini', 'gpt-6.1-sol', 'gpt-6-astra']);
  assert.equal(exported.coverage.complete, true);
});

test('partially retained modern records versus cumulative evidence cannot claim complete or import', async t => {
  const root = fixture(t);
  codexJournal(root, 'partial.jsonl', { events: [record('one', counters(100, 80, 10)), cumulative(counters(150, 100, 15))] });
  const config = { codexRoots: [{ id: 'acp', root }] }, native = nativeService();
  const result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
  assert.equal(result.coverage.complete, false);
  assert.match(result.coverage.sources[0].reason, /do not reconcile/);
  await assert.rejects(refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl }), /Incomplete owned usage coverage/);
  assert.equal(native.requests.some(request => request.method === 'POST'), false);
});

test('protected import refuses a symlink and validates interval coverage', async t => {
  const root = fixture(t), path = join(root, 'export.json');
  const value = { schemaVersion: 1, sourceId: 'acp', exportedAt: now.toISOString(), interval: { start: time, end: bounds.end }, rows: [], coverage: { complete: true } };
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  const config = { imports: [{ id: 'acp', path, expectedUid: process.getuid(), maxAgeHours: 1 }] };
  assert.equal((await collectNoriUsageSources({ config, bounds, now, readNativePrices: false })).coverage.complete, false);
  value.interval.start = bounds.start; writeFileSync(path, JSON.stringify(value));
  const link = join(root, 'link.json'); symlinkSync(path, link); config.imports[0].path = link;
  assert.equal((await collectNoriUsageSources({ config, bounds, now, readNativePrices: false })).coverage.complete, false);
});

test('export CLI executes audited module from stdin with core imports only', t => {
  const root = fixture(t), configPath = join(root, 'export-config.json');
  codexJournal(root, 'owned.jsonl', { events: [record('one', counters(20, 5, 2))] });
  writeFileSync(configPath, JSON.stringify({ sourceId: 'acp', codexRoots: [{ id: 'acp', root }] }));
  const result = spawnSync(process.execPath, ['--input-type=module', '-', 'export', '--export-config', configPath,
    '--start', bounds.start, '--end', bounds.end], { input: readFileSync(new URL('../scripts/nori-usage-sources.mjs', import.meta.url)), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const exported = JSON.parse(result.stdout); assert.equal(exported.sourceId, 'acp'); assert.equal(exported.rows.length, 1);
  assert.doesNotMatch(result.stdout, /owned-thread|SENSITIVE|response_id/);
});

test('native loopback POST uses http without browser headers and keeps native authentication boundary intact', async t => {
  const root = fixture(t); profile(root, { main: [event('local')] });
  const reported = new Map(); let postCount = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST') {
      assert.equal(request.headers['sec-fetch-mode'], undefined); postCount++;
      const chunks = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => {
        for (const row of JSON.parse(Buffer.concat(chunks))) reported.set(row.rid, { ...row, source: 'reported', priced: true, cost: 0.5 });
        response.end(JSON.stringify({ accepted: 1, skipped: 0 }));
      });
    } else {
      const rows = url.searchParams.get('via') === 'reported' ? [...reported.values()] : [];
      response.end(JSON.stringify({ rows, total: rows.length, offset: 0 }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const result = await refreshNoriUsage({ config: { profiles: [{ id: 'slack', root }] }, bounds,
    magpieUrl: `http://127.0.0.1:${server.address().port}` });
  assert.equal(postCount, 1); assert.equal(result.rows[0].cost, 0.5);
});

function addArchiveTables(database) {
  database.exec(`CREATE TABLE session_transcript_archives(session_id TEXT,generation TEXT,encoding TEXT,archive_sha256 TEXT,created_at INTEGER,archive_blob BLOB);
    CREATE TABLE session_transcript_cold_archives(session_id TEXT,generation TEXT,archive_name TEXT,archive_sha256 TEXT,event_count INTEGER,raw_bytes INTEGER,archive_bytes INTEGER,last_seq INTEGER,archived_at INTEGER,storage TEXT,archive_blob BLOB)`);
}
const sha = value => createHash('sha256').update(value).digest('hex');
function resetArchive(database, sessionId, items, encoding = 'identity', corrupt = false) {
  const text = [{ type: 'session', id: sessionId, version: 3, timestamp: time }, ...items].map(value => JSON.stringify(value)).join('\n') + '\n';
  const bytes = encoding === 'zstd' ? zstdCompressSync(Buffer.from(text)) : Buffer.from(text);
  database.prepare('INSERT INTO session_transcript_archives VALUES (?,?,?,?,?,?)').run(sessionId, `generation-${sessionId}`,
    encoding, corrupt ? '0'.repeat(64) : sha(bytes), Date.parse(time), bytes);
}
function coldArchive(database, root, sessionId, items, storage, overrides = {}) {
  const events = items.map((item, index) => ({ seq: index + 1, event_json: JSON.stringify(item), created_at: Date.parse(time) }));
  const text = [{ kind: 'header', version: 1, sessionId, generation: `generation-${sessionId}` },
    ...events.map(row => ({ kind: 'event', row })), { kind: 'fts', row: { text: 'SENSITIVE-FTS' } }].map(item => JSON.stringify(item)).join('\n') + '\n';
  const bytes = zstdCompressSync(Buffer.from(text)), digest = sha(bytes), name = `${digest}.jsonl.zst`;
  if (storage === 'file') {
    const directory = join(root, 'agents/main/sessions/cold'); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, name), bytes);
  }
  const value = { sessionId, generation: `generation-${sessionId}`, archive_name: name, archive_sha256: digest,
    event_count: events.length, raw_bytes: events.reduce((n, row) => n + Buffer.byteLength(row.event_json), 0) + Math.max(0, events.length - 1),
    archive_bytes: bytes.length, last_seq: events.length, archived_at: Date.parse(time), storage, archive_blob: storage === 'sqlite' ? bytes : null, ...overrides };
  database.prepare('INSERT INTO session_transcript_cold_archives VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(value.sessionId, value.generation,
    value.archive_name, value.archive_sha256, value.event_count, value.raw_bytes, value.archive_bytes, value.last_seq, value.archived_at, value.storage, value.archive_blob);
  return value;
}

test('read-only reset/deleted and cold sqlite/file archives preserve incurred usage and stable-identity deduplication', async t => {
  const root = fixture(t); profile(root, { main: [event('hot')] });
  const file = join(root, 'agents/main/agent/openclaw-agent.sqlite'), database = new DatabaseSync(file);
  addArchiveTables(database);
  resetArchive(database, 'reset-old', [event('reset-plain')]);
  resetArchive(database, 'reset-zstd', [event('reset-compressed')], 'zstd');
  coldArchive(database, root, 'cold-db', [event('cold-sqlite')], 'sqlite');
  coldArchive(database, root, 'cold-file', [event('cold-file')], 'file');
  // A concurrent/retained duplicate of a hot event must not add its cost twice.
  resetArchive(database, 'stable-session', [event('hot')]);
  database.close();
  const before = readFileSync(file);
  const result = await collectNoriUsageSources({ config: { profiles: [{ id: 'slack', root }] }, bounds, readNativePrices: false });
  assert.equal(result.coverage.complete, true); assert.equal(result.rows.length, 5);
  assert.equal(result.coverage.sources[0].archives, 5); assert.equal(result.coverage.sources[0].duplicates, 1);
  assert.deepEqual(readFileSync(file), before);
  assert.doesNotMatch(JSON.stringify(result), /SENSITIVE-BODY|SENSITIVE-FTS|cold-db|reset-old/);
});

test('corrupt digests, cold header/count/path mismatches and unsupported archive formats produce explicit gaps', async t => {
  for (const kind of ['digest', 'count', 'path', 'header', 'encoding']) {
    const root = join(fixture(t), kind); profile(root, { main: [event('hot')] });
    const database = new DatabaseSync(join(root, 'agents/main/agent/openclaw-agent.sqlite')); addArchiveTables(database);
    if (kind === 'digest') resetArchive(database, 'bad-digest', [event('archived')], 'identity', true);
    else if (kind === 'encoding') resetArchive(database, 'unsupported', [event('archived')], 'unsupported');
    else {
      coldArchive(database, root, 'bad-cold', [event('archived')], 'sqlite', kind === 'count' ? { event_count: 7 } :
        kind === 'path' ? { archive_name: '../outside.jsonl.zst' } : { generation: 'wrong-generation' });
    }
    database.close();
    const config = { profiles: [{ id: 'slack', root }] }, native = nativeService();
    const result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
    assert.equal(result.coverage.complete, false, kind);
    await assert.rejects(refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl }), /Incomplete owned usage coverage/);
    assert.equal(native.requests.some(request => request.method === 'POST'), false);
  }
});

test('repeated owned native reported RID is rejected before a POST or incomplete/negative accounting', async t => {
  const root = fixture(t); profile(root, { main: [event('owned')] });
  const config = { profiles: [{ id: 'slack', root }] };
  const row = (await collectNoriUsageSources({ config, bounds, readNativePrices: false })).rows[0];
  let posts = 0;
  const fetchImpl = async (url, options) => {
    if (options.method === 'POST') posts++;
    const rows = new URL(url).searchParams.get('via') === 'reported' ? [{ ...row, priced: true, cost: 1 }, { ...row, priced: true, cost: 1 }] : [];
    return new Response(JSON.stringify({ rows, total: rows.length, offset: 0 }));
  };
  await assert.rejects(refreshNoriUsage({ config, bounds, fetchImpl }), /Duplicate native reported usage identity/);
  await assert.rejects(collectNoriUsageSources({ config, bounds, fetchImpl }), /Duplicate native reported usage identity/);
  assert.equal(posts, 0);
});

test('unmetered direct inference flags a gap unless stable response/event has complete usage elsewhere', async t => {
  const root = fixture(t); profile(root, { main: [event('fragment', 'bailian', { responseId: 'same-response', usage: undefined }),
    event('complete', 'bailian', { responseId: 'same-response' }), event('routed', 'rein-magpie', { usage: undefined }),
    event('placeholder', 'openclaw', { model: 'delivery-mirror', usage: undefined })] });
  const config = { profiles: [{ id: 'slack', root }], gatewayProviderIds: ['rein-magpie'] };
  let result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 1); assert.equal(result.coverage.complete, true);
  const database = new DatabaseSync(join(root, 'agents/main/agent/openclaw-agent.sqlite'));
  database.prepare('INSERT INTO transcript_events VALUES (?,?,?,?,?,?,?)').run('stable-session', 5,
    JSON.stringify(event('unmetered-direct', 'bailian', { usage: undefined })), Date.parse(time), null, null, null); database.close();
  result = await collectNoriUsageSources({ config, bounds, readNativePrices: false });
  assert.equal(result.rows.length, 1); assert.equal(result.coverage.complete, false); assert.equal(result.coverage.sources[0].unmetered, 1);
  const native = nativeService();
  await assert.rejects(refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl }), /Incomplete owned usage coverage/);
  assert.equal(native.requests.some(request => request.method === 'POST'), false);
});

test('native refresh omits cost, prices unselected/guardian models natively and remains idempotent across collector restarts', async t => {
  const root = fixture(t); codexJournal(root, 'owned.jsonl', { events: [record('owned', counters(100, 50, 10))] });
  codexJournal(root, 'guardian.jsonl', { thread: 'guardian', model: 'codex-auto-review', events: [record('guardian', counters(20, 5, 3))] });
  const config = { codexRoots: [{ id: 'acp', root, providerAliases: { 'pilot-openai': 'openai' } }] };
  const native = nativeService();
  const preview = await collectNoriUsageSources({ config, bounds, fetchImpl: native.fetchImpl });
  assert.equal(preview.rows.every(row => !row.priced), true);
  assert.equal(native.requests.some(request => request.method === 'POST'), false);
  const first = await refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl });
  assert.equal(first.refresh.accepted, 2); assert.equal(first.rows.every(row => row.priced && row.cost === 0.42), true);
  const second = await refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl });
  assert.equal(second.refresh.accepted, 0); assert.equal(second.refresh.skipped, 2);
  assert.equal(native.reported.size, 2);
  assert.equal((await collectNoriUsageSources({ config, bounds, fetchImpl: native.fetchImpl })).rows.every(row => row.priced), true);
});

test('conflicting prior native RID blocks POST and unrelated reported usage never enters the receipt', async t => {
  const root = fixture(t); profile(root, { main: [event('owned')] });
  const config = { profiles: [{ id: 'slack', root }] }, native = nativeService();
  const expected = (await collectNoriUsageSources({ config, bounds, readNativePrices: false })).rows[0];
  native.reported.set(expected.rid, { ...expected, in: 999, source: 'reported', priced: true, cost: 1 });
  await assert.rejects(refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl }), /Conflicting native reported usage identity/);
  assert.equal(native.requests.some(request => request.method === 'POST'), false);
  native.reported.clear(); native.reported.set('not-owned', { ...expected, rid: 'not-owned', source: 'reported', priced: true, cost: 999 });
  const result = await collectNoriUsageSources({ config, bounds, fetchImpl: native.fetchImpl });
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].priced, false); assert.equal(result.rows[0].cost, 0);
});

test('receipt opt-in combines only native-owned supplement and gateway; served auto uses proven model', async t => {
  const root = fixture(t); profile(root, { main: [event('direct'), event('routed', 'rein-magpie')] });
  const config = { profiles: [{ id: 'slack', root }], gatewayProviderIds: ['rein-magpie'] }, native = nativeService();
  await refreshNoriUsage({ config, bounds, fetchImpl: native.fetchImpl });
  native.gateway.push({ t: time, agent: 'openclaw', provider: 'bailian', model: 'auto', served: 'deepseek-v4.1-flash',
    in: 5, out: 2, cache_read: 0, cache_write: 0, priced: true, cost: 0.1, status: 200 });
  const result = await collectMagpieUsage({ date: bounds.date, sourcesConfig: config, fetchImpl: native.fetchImpl });
  assert.equal(result.totals.requests, 2); assert.equal(result.totals.estimatedCostUsd, 0.52);
  assert.equal(result.coverage.supplemental.complete, true);
  assert.equal(result.models.some(row => row.model === 'deepseek-v4.1-flash'), true);
  assert.doesNotMatch(JSON.stringify(result), /nori-usage:|SENSITIVE-BODY|stable-session/);
});
