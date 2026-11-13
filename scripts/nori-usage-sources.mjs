#!/usr/bin/env node
// Explicit Nori-owned sources only; transcript reads never mutate source history.
// The explicit refresh action appends sanitized records through Magpie's native API.
import { DatabaseSync } from 'node:sqlite';
import { request as httpRequest } from 'node:http';
import { constants as fsConstants } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_EVENT = 4 * 1024 * 1024, MAX_ROWS = 100_000, MAX_FILE = 64 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const safeName = value => typeof value === 'string' && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
function whole(value = 0) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid usage counter');
  return value;
}
function boundedName(value) {
  if (!safeName(value) || !value) throw new Error('Invalid usage dimension');
  return value;
}
function validateBounds(bounds) {
  const start = Date.parse(bounds?.start), end = Date.parse(bounds?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Invalid usage interval');
  return { start, end };
}
function sourceEntry(source, type) {
  if (!idPattern.test(source.id ?? '')) throw new Error('Every usage source requires a bounded id');
  return { id: source.id, type, status: 'complete', records: 0, excludedGateway: 0, excludedUnowned: 0, duplicates: 0, invalid: 0 };
}
function issue(entry, reason) { entry.status = entry.records ? 'partial' : 'unavailable'; entry.reason = reason; }
function within(path, root) { const sub = relative(root, path); return !sub.startsWith('..') && !isAbsolute(sub); }
function aliases(config, source) { return { ...(config.providerAliases ?? {}), ...(source.providerAliases ?? {}) }; }
function gatewaySet(config, source) { return new Set([...(config.gatewayProviderIds ?? []), ...(source.gatewayProviderIds ?? [])]); }
function normalizeUsage(raw, codex = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Missing usage');
  if (codex ? raw.input_tokens === undefined && raw.output_tokens === undefined : raw.input === undefined && raw.inputTokens === undefined && raw.output === undefined && raw.outputTokens === undefined) throw new Error('Missing usage counters');
  const input = whole(codex ? raw.input_tokens : raw.input ?? raw.inputTokens);
  const output = whole(codex ? raw.output_tokens : raw.output ?? raw.outputTokens);
  const cacheRead = whole(codex ? raw.cached_input_tokens : raw.cacheRead ?? raw.cache_read);
  const cacheWrite = whole(codex ? raw.cache_write_input_tokens : raw.cacheWrite ?? raw.cache_write);
  const reasoning = whole(raw.reasoning_output_tokens ?? raw.reasoning ?? 0);
  if (codex && input < cacheRead + cacheWrite) throw new Error('Cache exceeds prompt');
  return { in: codex ? input - cacheRead - cacheWrite : input, out: output, cache_read: cacheRead,
    cache_write: cacheWrite, cache_write_1h: whole(raw.cache_write_1h ?? raw.cacheWrite1h), reasoning };
}
function responseIdentity(provider, responseId) { return hash(JSON.stringify(['response', provider, responseId])); }
function makeRow({ timestamp, provider, model, usage, agent, identity, responseId, aliases: providerAliases, status = 200 }) {
  provider = boundedName(providerAliases[provider] ?? provider);
  model = boundedName(model || 'Unknown model');
  const ms = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(ms)) throw new Error('Missing usage timestamp');
  return { t: new Date(ms).toISOString(), agent, provider, model, ...usage, status,
    rid: `nori-usage:${responseId ? responseIdentity(provider, responseId) : hash(identity)}`,
    priced: false, cost: 0 };
}

function nativeOrigin(value = 'http://127.0.0.1:3425') {
  const origin = new URL(value);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Magpie usage requires a loopback HTTP origin');
  return origin;
}
function nativePost(url, options) {
  // undici fetch adds browser Sec-Fetch-* headers. Magpie intentionally refuses unauthenticated
  // browser writes; a native loopback service uses node:http without those browser markers.
  return new Promise((resolve, reject) => {
    const body = Buffer.from(options.body);
    const request = httpRequest(url, { method: 'POST', headers: { ...options.headers, 'content-length': String(body.length) } }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 8_000_000) request.destroy(new Error('Native usage response exceeds bound'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) { reject(new Error('Native usage API refused import')); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid native import response')); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Native usage import timeout')), 15_000);
    request.on('close', () => clearTimeout(timer)); request.on('error', reject); request.end(body);
  });
}
async function nativeRequest(url, fetchImpl, options = {}) {
  if (options.method === 'POST' && fetchImpl === globalThis.fetch) return nativePost(url, options);
  const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000), ...options });
  if (!response.ok || !response.body) throw new Error('Native usage API unavailable');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 8_000_000) throw new Error('Native usage page exceeds bound');
      chunks.push(Buffer.from(part.value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function nativePeriod(bounds) {
  const start = new Date(bounds.start - 86_400_000).toISOString().slice(0, 10);
  const end = new Date(bounds.end + 86_400_000).toISOString().slice(0, 10);
  return `${start}..${end}`;
}
export async function readNativeUsageRows({ bounds, via, magpieUrl, fetchImpl = globalThis.fetch }) {
  const interval = validateBounds(bounds), rows = []; let total;
  const origin = nativeOrigin(magpieUrl);
  for (let page = 0; page < 200; page++) {
    const url = new URL('/v1/magpie/usage/requests', origin);
    url.search = new URLSearchParams({ period: nativePeriod(interval), via, offset: String(rows.length), limit: '500' });
    const value = await nativeRequest(url, fetchImpl, { headers: { accept: 'application/json' } });
    if (!value || !Array.isArray(value.rows) || value.rows.length > 500 || value.offset !== rows.length || !Number.isSafeInteger(value.total) || value.total < 0 || value.total > MAX_ROWS || (total !== undefined && total !== value.total) || rows.length + value.rows.length > value.total) throw new Error('Native usage pagination invalid or changed');
    total = value.total;
    rows.push(...value.rows.map(row => ({ ...Object.fromEntries(rowKeys.map(key => [key, row[key]])), source: row.source, response_id: row.response_id })));
    if (rows.length === total) return rows.filter(row => Date.parse(row.t) >= interval.start && Date.parse(row.t) < interval.end);
    if (!value.rows.length) throw new Error('Native usage pagination truncated');
  }
  throw new Error('Native usage page limit exceeded');
}
function sameAccounting(expected, actual) {
  return Date.parse(expected.t) === Date.parse(actual.t) && expected.provider === actual.provider && expected.model === actual.model &&
    ['in', 'out', 'cache_read', 'cache_write', 'cache_write_1h', 'reasoning', 'status'].every(key => whole(expected[key]) === whole(actual[key]));
}
async function applyNativeReported(rows, options) {
  if (!rows.length) return { matched: 0, pending: 0 };
  const owned = new Map(rows.map(row => [row.rid, row]));
  let matched = 0; const seen = new Set();
  for (const actual of await readNativeUsageRows({ ...options, via: 'reported' })) {
    const row = owned.get(actual.rid); if (!row) continue;
    if (seen.has(actual.rid)) throw new Error('Duplicate native reported usage identity');
    seen.add(actual.rid);
    if (!sameAccounting(row, actual)) throw new Error('Conflicting native reported usage identity');
    if (typeof actual.priced !== 'boolean' || typeof actual.cost !== 'number' || !Number.isFinite(actual.cost) || actual.cost < 0) throw new Error('Invalid native reported pricing');
    row.priced = actual.priced; row.cost = actual.cost; matched++;
  }
  return { matched, pending: rows.length - matched };
}

function metadata(json, compressed, size, createdAt, sessionId, seq) {
  let body;
  if (typeof json === 'string') {
    if (Buffer.byteLength(json) > MAX_EVENT) throw new Error('Transcript event exceeds bound');
    body = json;
  } else {
    if (!(compressed instanceof Uint8Array) || compressed.byteLength > MAX_EVENT || !Number.isSafeInteger(size) || size < 1 || size > MAX_EVENT) throw new Error('Invalid compressed event');
    const bytes = zstdDecompressSync(compressed, { maxOutputLength: size });
    if (bytes.byteLength !== size) throw new Error('Compressed event size mismatch');
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  const event = JSON.parse(body), message = event.message;
  if (event.type !== 'message' || message?.role !== 'assistant') return null;
  if (!message.usage && (!(message.provider ?? event.provider) || !(message.model ?? event.model))) return null;
  // Raw content, account fields and paths never cross the SQLite projection boundary.
  return JSON.stringify({ timestamp: message.timestamp ?? event.timestamp ?? createdAt, usage: message.usage,
    provider: message.provider ?? event.provider, model: message.model ?? event.model, api: message.api,
    responseId: message.responseId, eventId: event.id ?? message.idempotencyKey,
    sessionId, seq, status: ['error', 'aborted'].includes(message.stopReason) ? 500 : 200 });
}
function acceptProfileMetadata(item, { source, config, agentId, entry, bounds, accept }) {
  try {
    const ms = typeof item.timestamp === 'number' ? item.timestamp : Date.parse(item.timestamp);
    if (ms < bounds.start || ms >= bounds.end) return;
    if (item.model === 'delivery-mirror') { entry.excludedPlaceholders = (entry.excludedPlaceholders ?? 0) + 1; return; }
    if ([item.provider, item.model, item.api].includes('acp-runtime')) {
      const usage = item.usage ? normalizeUsage(item.usage) : { in: 0, out: 0, cache_read: 0, cache_write: 0 };
      if (usage.in + usage.out + usage.cache_read + usage.cache_write === 0) { entry.excludedPlaceholders = (entry.excludedPlaceholders ?? 0) + 1; return; }
      issue(entry, 'Nonzero ACP runtime aggregate lacks concrete inference identity'); entry.invalid++; return;
    }
    if (gatewaySet(config, source).has(item.provider)) { entry.excludedGateway++; return; }
    const row = makeRow({ ...item, usage: item.usage ? normalizeUsage(item.usage) : { in: 0, out: 0, cache_read: 0, cache_write: 0, cache_write_1h: 0, reasoning: 0 }, agent: `nori:${source.id}:${agentId}`,
      aliases: aliases(config, source), identity: JSON.stringify(['openclaw', item.sessionId, item.eventId ?? item.seq, item.provider]), responseId: item.responseId });
    if (!item.usage) row.unmetered = true;
    if (accept(row, entry)) entry.records++;
  } catch { entry.invalid++; issue(entry, 'Invalid usage metadata'); }
}
async function stableFile(path, { expectedUid, privateMode = false } = {}) {
  const descriptor = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const info = await descriptor.stat();
    if (!info.isFile() || info.size > MAX_FILE || (expectedUid !== undefined && info.uid !== expectedUid) || (privateMode && (info.mode & 0o022))) throw new Error('Unsafe source file boundary');
    const buffer = Buffer.alloc(info.size + 1); let bytes = 0;
    while (bytes < buffer.length) { const part = await descriptor.read(buffer, bytes, buffer.length - bytes, bytes); if (!part.bytesRead) break; bytes += part.bytesRead; }
    const after = await descriptor.stat();
    if (bytes !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error('Source file changed during read');
    return buffer.subarray(0, bytes);
  } finally { await descriptor.close(); }
}
function archiveText(bytes, digest, compressed) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_FILE || !/^[a-f0-9]{64}$/.test(digest) || hash(bytes) !== digest) throw new Error('Archive digest/bounds mismatch');
  const decoded = compressed ? zstdDecompressSync(bytes, { maxOutputLength: MAX_FILE }) : bytes;
  return new TextDecoder('utf-8', { fatal: true }).decode(decoded);
}
async function collectArchives(database, file, root, context) {
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  const entry = context.entry; let bytesRead = 0, scanned = 0;
  const consume = (eventJson, sessionId, seq, createdAt) => {
    if (++scanned > MAX_ROWS || Buffer.byteLength(eventJson) > MAX_EVENT) throw new Error('Archive events exceed bounds');
    const projected = metadata(eventJson, null, null, createdAt, sessionId, seq);
    if (projected) acceptProfileMetadata(JSON.parse(projected), context);
  };
  const accountBytes = size => { bytesRead += size; if (size > MAX_FILE || bytesRead > 256 * 1024 * 1024) throw new Error('Archive scan exceeds byte bound'); };
  if (tables.has('session_transcript_archives')) {
    const archives = database.prepare('SELECT session_id,generation,encoding,archive_sha256,created_at,length(archive_blob) AS bytes FROM session_transcript_archives LIMIT 1001');
    let count = 0;
    for (const archive of archives.iterate()) {
      try {
        if (++count > 1000) throw new Error('Archive inventory exceeds bound');
        accountBytes(archive.bytes);
        if (!['identity', 'zstd'].includes(archive.encoding)) throw new Error('Unsupported archive encoding');
        const blob = database.prepare('SELECT archive_blob FROM session_transcript_archives WHERE session_id=? AND generation=?').get(archive.session_id, archive.generation).archive_blob;
        const text = archiveText(blob, archive.archive_sha256, archive.encoding === 'zstd');
        let seq = 0, header = false;
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (!header) { if (event.type !== 'session' || event.id !== archive.session_id) throw new Error('Archive session header mismatch'); header = true; }
          consume(line, archive.session_id, ++seq, archive.created_at);
        }
        if (!header) throw new Error('Missing archive header');
        entry.archives = (entry.archives ?? 0) + 1;
      } catch { issue(entry, 'Reset/deleted transcript archive unavailable or invalid'); entry.invalid++; }
    }
  }
  if (tables.has('session_transcript_cold_archives')) {
    const archives = database.prepare('SELECT session_id,generation,archive_name,archive_sha256,event_count,raw_bytes,archive_bytes,last_seq,archived_at,storage FROM session_transcript_cold_archives LIMIT 1001');
    let count = 0;
    for (const archive of archives.iterate()) {
      try {
        if (++count > 1000 || !/^[a-f0-9]{64}\.jsonl\.zst$/.test(archive.archive_name)) throw new Error('Invalid cold archive inventory/path');
        accountBytes(archive.archive_bytes);
        let bytes;
        if (archive.storage === 'sqlite') bytes = database.prepare('SELECT archive_blob FROM session_transcript_cold_archives WHERE session_id=?').get(archive.session_id).archive_blob;
        else if (archive.storage === 'file') {
          const dbDirectory = dirname(file);
          const artifactDirectory = basename(dbDirectory) === 'agent' ? join(dirname(dbDirectory), 'sessions') : dbDirectory;
          const directory = join(artifactDirectory, 'cold');
          // Native artifact placement: agents/<id>/agent/DB -> agents/<id>/sessions/cold.
          const coldPath = join(directory, archive.archive_name), canonical = await realpath(coldPath);
          if (!within(canonical, root)) throw new Error('Cold archive outside trusted root');
          bytes = await stableFile(coldPath);
        } else throw new Error('Unsupported cold archive storage');
        if (bytes?.byteLength !== archive.archive_bytes) throw new Error('Cold archive byte count mismatch');
        const text = archiveText(bytes, archive.archive_sha256, true);
        let header = false, events = 0, rawBytes = 0, previous = -1;
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          if (Buffer.byteLength(line) > MAX_EVENT * 2 + 4096) throw new Error('Cold archive event exceeds bound');
          const item = JSON.parse(line);
          if (!header) {
            if (item.kind !== 'header' || item.version !== 1 || item.sessionId !== archive.session_id || item.generation !== archive.generation) throw new Error('Cold archive header mismatch');
            header = true; continue;
          }
          if (item.kind === 'event') {
            const row = item.row;
            if (!Number.isSafeInteger(row?.seq) || row.seq <= previous || typeof row.event_json !== 'string') throw new Error('Invalid cold archive event');
            previous = row.seq; events++; rawBytes += Buffer.byteLength(row.event_json);
            consume(row.event_json, archive.session_id, row.seq, row.created_at);
          } else if (!['identity', 'active', 'index', 'fts'].includes(item.kind)) throw new Error('Unsupported cold archive record');
        }
        if (!header || events !== archive.event_count || rawBytes + Math.max(0, events - 1) !== archive.raw_bytes || previous !== archive.last_seq) throw new Error('Cold archive event accounting mismatch');
        entry.archives = (entry.archives ?? 0) + 1;
      } catch { issue(entry, 'Cold transcript archive unavailable or invalid'); entry.invalid++; }
    }
  }
}
async function collectProfile(source, config, bounds, accept, seenFiles) {
  const entry = sourceEntry(source, 'openclaw');
  try {
    const root = await realpath(resolve(source.root));
    const registryPath = await realpath(resolve(root, source.stateDatabase ?? 'state/openclaw.sqlite'));
    if (!within(registryPath, root)) throw new Error('Registry outside trusted root');
    const registry = new DatabaseSync(registryPath, { readOnly: true });
    let agents;
    try { agents = registry.prepare('SELECT agent_id, path FROM agent_databases').all(); } finally { registry.close(); }
    if (agents.length > 1000) throw new Error('Agent registry exceeds bound');
    entry.agents = agents.length;
    const map = aliases(config, source), gateways = gatewaySet(config, source);
    for (const agent of agents) {
      let database;
      try {
        const file = await realpath(resolve(root, agent.path));
        if (!within(file, root)) throw new Error('Agent database outside trusted root');
        const info = await stat(file), physical = `${info.dev}:${info.ino}`;
        if (seenFiles.has(physical)) { entry.duplicates++; continue; }
        seenFiles.add(physical);
        database = new DatabaseSync(file, { readOnly: true });
        database.exec('BEGIN');
        database.function('nori_usage_metadata', { deterministic: true, directOnly: true }, metadata);
        // All historical branches represent incurred inference, not only the visible conversation branch.
        const query = database.prepare('SELECT nori_usage_metadata(event_json,event_zstd,event_utf8_bytes,created_at,session_id,seq) AS metadata FROM transcript_events ORDER BY session_id,seq');
        let scanned = 0;
        for (const result of query.iterate()) {
          if (++scanned > MAX_ROWS) throw new Error('Transcript scan exceeds bound');
          if (!result.metadata) continue;
          acceptProfileMetadata(JSON.parse(result.metadata), { source, config, agentId: agent.agent_id, entry, bounds, accept });
        }
        await collectArchives(database, file, root, { source, config, agentId: agent.agent_id, entry, bounds, accept });
      } catch { issue(entry, 'Agent usage storage unavailable or exceeds bounds'); }
      finally { database?.close(); }
    }
  } catch { issue(entry, 'Profile registry unavailable'); }
  return entry;
}
async function codexFiles(root, depth = 0, found = []) {
  if (depth > 5) return found;
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (found.length > 5000) throw new Error('Codex file inventory exceeds bound');
    const path = join(root, item.name);
    if (item.isDirectory()) await codexFiles(path, depth + 1, found);
    else if (item.isFile() && item.name.endsWith('.jsonl')) found.push(path);
  }
  return found;
}
function subtractCounters(current, previous) {
  const keys = ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'reasoning_output_tokens'];
  const next = Object.fromEntries(keys.map(key => [key, whole(current[key])]));
  if (!previous || keys.some(key => next[key] < previous[key])) return next;
  return Object.fromEntries(keys.map(key => [key, next[key] - previous[key]]));
}
async function collectCodex(source, config, bounds, accept) {
  const entry = sourceEntry(source, 'codex-owned');
  if (source.originators !== undefined && (!Array.isArray(source.originators) || !source.originators.length || source.originators.length > 32 || !source.originators.every(value => safeName(value) && value))) throw new Error('Explicit Codex originators must be a bounded list');
  const map = aliases(config, source), gateways = gatewaySet(config, source);
  const threads = new Map();
  try {
    const root = await realpath(resolve(source.root)); let files = [], scannedBytes = 0, scannedEvents = 0;
    for (const folder of ['sessions', 'archived_sessions']) {
      try { files.push(...await codexFiles(join(root, folder))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    entry.files = files.length;
    for (const file of files.sort()) {
      try {
        const info = await stat(file); scannedBytes += info.size; if (info.size > MAX_FILE || scannedBytes > 256 * 1024 * 1024) throw new Error('Codex journal exceeds bound');
        const content = await readFile(file, 'utf8');
        let meta, turn, model, previous, sequence = 0;
        const records = [], legacy = [], contexts = new Map();
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          if (++sequence > MAX_ROWS || ++scannedEvents > MAX_ROWS || Buffer.byteLength(line) > MAX_EVENT) throw new Error('Codex journal exceeds event bounds');
          let event;
          try { event = JSON.parse(line); } catch { entry.invalid++; continue; }
          const p = event.payload ?? {};
          if (event.type === 'session_meta') meta ??= p;
          if (event.type === 'turn_context') { turn = p.turn_id ?? turn; model = p.model ?? model; if (turn && model) contexts.set(turn, model); }
          if (event.type === 'token_usage_record' && p.usage) records.push({ t: event.timestamp, p, turn: p.turn_id ?? turn, model });
          if (event.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
            const total = p.info.total_token_usage, delta = subtractCounters(total, previous); previous = Object.fromEntries(Object.keys(delta).map(key => [key, whole(total[key])]));
            legacy.push({ t: event.timestamp, usage: delta, turn, model });
          }
        }
        if (!meta || !idPattern.test(source.id) || !(source.originators ?? ['acpx']).includes(meta.originator)) { entry.excludedUnowned++; continue; }
        const threadId = boundedName(meta.id ?? meta.thread_id), provider = meta.model_provider;
        if (gateways.has(provider)) { entry.excludedGateway += records.length || legacy.length; continue; }
        let thread = threads.get(threadId);
        if (!thread) { thread = { records: [], legacy: [] }; threads.set(threadId, thread); }
        for (const record of records) thread.records.push({ ...record, model: record.p.model ?? record.model ?? contexts.get(record.turn), provider, threadId });
        for (const record of legacy) thread.legacy.push({ ...record, model: record.model ?? contexts.get(record.turn), provider, threadId });
      } catch { issue(entry, 'Owned Codex journal unavailable or malformed'); }
    }
    for (const thread of threads.values()) {
      // A modern per-call record and legacy cumulative checkpoint describe the same calls.
      // Prefer records for a turn; cumulative deltas are fallback for legacy-only turns.
      const recordedTurns = new Set(thread.records.map(record => record.turn ?? '__unknown__'));
      for (const turn of recordedTurns) {
        const explicit = thread.records.filter(record => (record.turn ?? '__unknown__') === turn);
        const legacy = thread.legacy.filter(record => (record.turn ?? '__unknown__') === turn);
        if (!legacy.length) continue;
        const counters = ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'reasoning_output_tokens'];
        if (counters.some(key => explicit.reduce((n, record) => n + whole(record.p.usage[key]), 0) !== legacy.reduce((n, record) => n + whole(record.usage[key]), 0))) {
          issue(entry, 'Modern and cumulative Codex evidence do not reconcile'); entry.invalid++;
        }
      }
      const observations = [...thread.records, ...thread.legacy.filter(record => !recordedTurns.has(record.turn ?? '__unknown__'))];
      for (const item of observations) {
        try {
          const ms = Date.parse(item.t); if (ms < bounds.start || ms >= bounds.end) continue;
          const raw = item.p?.usage ?? item.usage;
          if (Object.values(raw).every(value => !value)) continue;
          const row = makeRow({ timestamp: item.t, provider: item.provider, model: item.model || 'Unknown model',
            usage: normalizeUsage(raw, true), agent: `nori:${source.id}:codex`, aliases: map,
            responseId: item.p?.response_id, identity: JSON.stringify(['codex', item.threadId, item.turn, item.t, raw]) });
          if (accept(row, entry)) entry.records++;
        } catch { entry.invalid++; issue(entry, 'Invalid owned Codex usage metadata'); }
      }
    }
  } catch { issue(entry, 'Owned Codex root unavailable'); }
  return entry;
}

const rowKeys = ['t', 'agent', 'provider', 'model', 'in', 'out', 'cache_read', 'cache_write', 'cache_write_1h', 'reasoning', 'status', 'rid', 'priced', 'cost'];
function exportedRow(row) { return Object.fromEntries(rowKeys.map(key => [key, row[key]])); }
async function collectImport(source, bounds, now, accept) {
  const entry = sourceEntry(source, 'protected-export');
  try {
    if (!Number.isSafeInteger(source.expectedUid) || !Number.isFinite(source.maxAgeHours) || source.maxAgeHours <= 0) throw new Error('Import requires owner and freshness bounds');
    const contents = (await stableFile(source.path, { expectedUid: source.expectedUid, privateMode: true })).toString('utf8');
    const value = JSON.parse(contents);
    const exported = Date.parse(value.exportedAt), interval = validateBounds(value.interval);
    if (value.schemaVersion !== 1 || value.sourceId !== source.id || !Number.isFinite(exported) || exported > now + 60_000 || now - exported > source.maxAgeHours * 3_600_000 || interval.start > bounds.start || interval.end < bounds.end || !Array.isArray(value.rows) || value.rows.length > MAX_ROWS) throw new Error('Stale or incomplete source export');
    if (!value.coverage?.complete) issue(entry, 'Exporter reported incomplete coverage');
    for (const candidate of value.rows) {
      try {
        if (!candidate || Object.keys(candidate).some(key => !rowKeys.includes(key)) || !/^nori-usage:[a-f0-9]{64}$/.test(candidate.rid)) throw new Error('Invalid exported usage identity');
        const usage = normalizeUsage({ input: candidate.in, output: candidate.out, cacheRead: candidate.cache_read, cacheWrite: candidate.cache_write, cache_write_1h: candidate.cache_write_1h, reasoning: candidate.reasoning });
        const row = { ...exportedRow(candidate), ...usage, provider: boundedName(candidate.provider), model: boundedName(candidate.model), agent: boundedName(candidate.agent), priced: false, cost: 0 };
        const ms = Date.parse(row.t); if (!Number.isFinite(ms) || !Number.isSafeInteger(row.status) || row.status < 100 || row.status > 599) throw new Error('Invalid exported timestamp');
        if (ms >= bounds.start && ms < bounds.end && accept(row, entry)) entry.records++;
      } catch { entry.invalid++; issue(entry, 'Invalid exported usage row'); }
    }
  } catch { issue(entry, 'Protected source export unavailable, stale or unsafe'); }
  return entry;
}

/** Collect sanitized inference rows; identity hashes stay local and never become report dimensions. */
export async function collectNoriUsageSources({ config, bounds, magpieUrl, fetchImpl, gatewayResponseIds = [], readNativePrices = true, now = new Date() } = {}) {
  const interval = validateBounds(bounds), nowMs = new Date(now).getTime();
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Explicit Nori usage source configuration required');
  for (const key of ['profiles', 'codexRoots', 'imports']) if (config[key] !== undefined && (!Array.isArray(config[key]) || config[key].length > 32)) throw new Error('Invalid usage source configuration');
  const rows = [], sources = [], identities = new Map(), unmetered = new Map(), seenFiles = new Set();
  const gatewayIds = new Set();
  for (const entry of gatewayResponseIds) gatewayIds.add(`nori-usage:${responseIdentity(entry.provider, entry.responseId)}`);
  let conflicts = 0;
  const accept = (row, entry) => {
    if (row.unmetered) {
      if (!unmetered.has(row.rid)) unmetered.set(row.rid, new Set());
      unmetered.get(row.rid).add(entry); return false;
    }
    if (rows.length >= MAX_ROWS) throw new Error('Supplemental row limit exceeded');
    if (gatewayIds.has(row.rid)) { entry.excludedGateway++; return false; }
    const previous = identities.get(row.rid);
    const fingerprint = JSON.stringify([row.t, row.provider, row.model, row.in, row.out, row.cache_read, row.cache_write, row.cache_write_1h, row.reasoning, row.status]);
    if (previous) {
      if (previous !== fingerprint) { conflicts++; issue(entry, 'Conflicting stable usage identity'); }
      else entry.duplicates++;
      return false;
    }
    identities.set(row.rid, fingerprint); rows.push(row); return true;
  };
  for (const source of config.profiles ?? []) sources.push(await collectProfile(source, config, interval, accept, seenFiles));
  for (const source of config.codexRoots ?? []) sources.push(await collectCodex(source, config, interval, accept));
  for (const source of config.imports ?? []) sources.push(await collectImport(source, interval, nowMs, accept));
  for (const [identity, entries] of unmetered) {
    if (identities.has(identity) || gatewayIds.has(identity)) continue;
    for (const entry of entries) { entry.unmetered = (entry.unmetered ?? 0) + 1; issue(entry, 'Direct inference has no usage evidence'); }
  }
  let pricing = 'not-refreshed', native = { matched: 0, pending: rows.length };
  if (readNativePrices) {
    try { native = await applyNativeReported(rows, { bounds, magpieUrl, fetchImpl }); pricing = 'native-reported'; }
    catch (error) {
      // Conflicting identities must fail rather than silently displaying one payload.
      if (/^(?:Conflicting|Duplicate) native reported usage identity$/.test(error.message)) throw error;
      pricing = 'unavailable';
    }
  }
  return { rows: rows.map(exportedRow), coverage: { complete: sources.length > 0 && sources.every(entry => entry.status === 'complete') && conflicts === 0,
    sources, pricing, native, identityConflicts: conflicts, ownership: 'Explicit configured Nori profiles and isolated ACP roots only; standalone CLI excluded' } };
}

export async function exportNoriUsage({ config, bounds, magpieUrl, fetchImpl, now = new Date() }) {
  if (!idPattern.test(config.sourceId ?? '')) throw new Error('Export requires sourceId');
  const result = await collectNoriUsageSources({ config, bounds, magpieUrl, fetchImpl, now, readNativePrices: false });
  return { schemaVersion: 1, sourceId: config.sourceId, exportedAt: new Date(now).toISOString(), exporterUid: process.getuid?.() ?? null,
    interval: { start: new Date(bounds.start).toISOString(), end: new Date(bounds.end).toISOString() }, ...result };
}
/** Explicit accounting refresh only: append owned direct usage through Magpie's native ingest API.
 * Reads/previews never call this. Native Magpie, not this module, calculates every cost.
 */
export async function refreshNoriUsage({ config, bounds, magpieUrl, fetchImpl = globalThis.fetch, now = new Date() }) {
  const gateway = await readNativeUsageRows({ bounds, magpieUrl, fetchImpl, via: 'through' });
  const gatewayResponseIds = gateway.filter(row => row.response_id && !row.source).map(row => ({ provider: row.provider, responseId: row.response_id }));
  const result = await collectNoriUsageSources({ config, bounds, magpieUrl, fetchImpl, gatewayResponseIds, readNativePrices: false, now });
  if (!result.coverage.complete) throw new Error('Incomplete owned usage coverage; refresh refused');
  // Check immutable accounting payload BEFORE POST: the native API correctly skips an existing RID,
  // but intentionally does not overwrite a conflicting record under that same RID.
  await applyNativeReported(result.rows, { bounds, magpieUrl, fetchImpl });
  const origin = nativeOrigin(magpieUrl);
  let accepted = 0, skipped = 0;
  for (let offset = 0; offset < result.rows.length; offset += 500) {
    const batch = result.rows.slice(offset, offset + 500).map(row => {
      const { priced, cost, ...record } = row; return record;
    });
    const response = await nativeRequest(new URL('/v1/magpie/usage/requests', origin), fetchImpl,
      { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(batch) });
    if (!Number.isSafeInteger(response.accepted) || !Number.isSafeInteger(response.skipped) || response.accepted < 0 || response.skipped < 0 || response.accepted + response.skipped !== batch.length) throw new Error('Invalid native import acknowledgement');
    accepted += response.accepted; skipped += response.skipped;
  }
  const native = await applyNativeReported(result.rows, { bounds, magpieUrl, fetchImpl });
  if (native.pending) throw new Error('Native imported usage is not fully readable');
  result.coverage.pricing = 'native-reported'; result.coverage.native = native;
  return { ...result, refresh: { accepted, skipped, namespace: 'nori-usage:', mutation: 'Native append-only reported usage; no provider/rate changes' } };
}
async function main(args) {
  const action = args.shift();
  if (!['export', 'refresh'].includes(action)) throw new Error('Expected export or refresh subcommand');
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--export-config', '--sources-config', '--start', '--end', '--output', '--magpie-url'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw new Error('Invalid usage-source arguments');
    values[args[i]] = args[i + 1];
  }
  const config = JSON.parse(await readFile(values['--sources-config'] ?? values['--export-config'], 'utf8'));
  const options = { config, bounds: { start: values['--start'], end: values['--end'] }, magpieUrl: values['--magpie-url'] };
  const result = action === 'export' ? await exportNoriUsage(options) : await refreshNoriUsage(options);
  const output = `${JSON.stringify(result)}\n`;
  if (values['--output']) { await writeFile(resolve(values['--output']), output, { mode: 0o600, flag: 'wx' }); console.log(JSON.stringify({ output: resolve(values['--output']) })); }
  else console.log(output.trimEnd());
}
if ((process.argv[1] === '-' && import.meta.url.endsWith('/[eval1]')) || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  main(process.argv.slice(2)).catch(() => { console.error('Nori usage export failed; inspect source configuration and coverage.'); process.exitCode = 1; });
}
