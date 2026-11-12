import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { calendarDayBounds, collectMagpieUsage, summarizeUsage, renderReceiptSvg, renderReceiptPng,
  writeDailyReceipt, parseReceiptArgs } from '../scripts/daily-agent-receipt.mjs';

const bounds = calendarDayBounds({ date: '2026-11-01' });
const row = (extra = {}) => ({ t: '2026-11-01T08:00:00Z', agent: 'openclaw', agentName: 'OpenClaw', provider: 'p', providerName: 'Provider', model: 'm',
  in: 100, out: 20, cache_read: 200, cache_write: 10, reasoning: 5, cost: 0.0123, priced: true, status: 200, ...extra });
const response = (rows, total = rows.length, offset = 0) => new Response(JSON.stringify({ rows, total, offset }));

test('LA prior calendar day and DST boundaries use wall dates rather than 24-hour subtraction', () => {
  assert.deepEqual(bounds, { date: '2026-11-01', timeZone: 'America/Los_Angeles', start: '2026-11-01T07:00:00.000Z', end: '2026-11-02T08:00:00.000Z', hours: 25, queryPeriod: '2026-10-31..2026-11-02' });
  const spring = calendarDayBounds({ date: '2026-03-08' });
  assert.equal(spring.start, '2026-03-08T08:00:00.000Z'); assert.equal(spring.end, '2026-03-09T07:00:00.000Z'); assert.equal(spring.hours, 23);
  assert.equal(calendarDayBounds({ now: new Date('2026-03-09T07:30:00Z') }).date, '2026-03-08');
  assert.equal(calendarDayBounds({ now: new Date('2026-11-02T07:30:00Z') }).date, '2026-10-31');
  assert.equal(calendarDayBounds({ date: '2024-02-29', timeZone: 'UTC' }).hours, 24);
  for (const date of ['2026-02-29', '2026-13-01', 'yesterday', '2026-1-01']) assert.throws(() => calendarDayBounds({ date }), /Invalid calendar date/);
  assert.throws(() => calendarDayBounds({ date: '2026-01-01', timeZone: 'not-a-timezone' }), RangeError);
});

test('aggregation counts actual gateway attempts, cache-inclusive tokens, output reasoning once and exact [start,end)', () => {
  const summary = summarizeUsage([
    row({ t: bounds.start }), row({ status: 500, handed_on: true, err: 'sensitive error', cost: 0.001 }),
    row({ t: '2026-11-02T07:59:59.999Z', provider: 'p2', model: 'm2', cost: 0.02 }),
    row({ t: bounds.end }), row({ t: '2026-11-01T06:59:59Z' }), row({ source: 'log' }), row({ source: 'reported' }),
    row({ rejected: true }), row({ provider: '', status: 403 }),
  ], bounds);
  assert.equal(summary.totals.requests, 3); assert.equal(summary.totals.errors, 1);
  assert.equal(summary.totals.totalTokens, 990); assert.equal(summary.totals.reasoningTokens, 15);
  assert.equal(summary.totals.estimatedCostUsd, 0.0333); assert.equal(summary.totals.cacheReadPercent, 64.52);
  assert.equal(summary.agents.length, 1); assert.equal(summary.providers.length, 2); assert.equal(summary.models.length, 2);
  for (const dimension of ['agents', 'providers', 'models']) {
    assert.equal(summary[dimension].reduce((n, r) => n + r.requests, 0), summary.totals.requests);
    assert.equal(summary[dimension].reduce((n, r) => n + r.totalTokens, 0), summary.totals.totalTokens);
  }
  assert.match(summary.coverage.directAcp, /unknown/); assert.match(summary.coverage.attribution, /not established/);
});

test('missing prices remain unknown, known subtotal is preserved, and legacy cache fields stay unknown', () => {
  const summary = summarizeUsage([row(), row({ priced: false, cost: 0, cache_read: undefined, cache_write: undefined })], bounds);
  assert.equal(summary.totals.estimatedCostUsd, null); assert.equal(summary.totals.knownCostUsd, 0.0123);
  assert.equal(summary.totals.unpricedRequests, 1); assert.equal(summary.totals.cacheReadPercent, null);
  assert.equal(summary.totals.cacheMetricsMissingRequests, 1); assert.equal(summary.models[0].estimatedCostUsd, null);
  assert.match(renderReceiptSvg(summary), /\+ unknown/);
  const unpriced = renderReceiptSvg(summarizeUsage([row({ priced: false, cost: 0 })], bounds));
  assert.match(unpriced, /PRICE UNAVAILABLE/); assert.match(unpriced, /Price unavailable/);
  assert.doesNotMatch(unpriced, /\$0\.0000 \+ unknown/); assert.match(unpriced, /BY MAGPIE CLIENT/);
  assert.doesNotMatch(unpriced, /No prior-day comparison/);
  const empty = summarizeUsage([], bounds); assert.equal(empty.totals.estimatedCostUsd, 0); assert.equal(empty.totals.cacheReadPercent, null);
});

test('aggregate artifacts allow only safe dimensions, and SVG escapes XML injection', () => {
  const input = row({ model: '<script>alert("x")</script>&', rid: 'secret-request', route_id: 'secret-route', session: 'secret-session',
    host: 'secret-host', providerAccount: 'secret-account', callerKeyName: 'secret-key', prompt: 'secret-prompt', err: 'secret-error', extra: 'secret-extra' });
  const summary = summarizeUsage([input], bounds), json = JSON.stringify(summary), svg = renderReceiptSvg(summary);
  assert.doesNotMatch(json + svg, /secret-/); assert.doesNotMatch(svg, /<script>/); assert.match(svg, /&lt;script&gt;/);
  assert.equal(svg, renderReceiptSvg(summary)); assert.equal(json, JSON.stringify(summarizeUsage([input], bounds)));
  assert.doesNotMatch(svg, /<image|(?:href|src)=|<foreignObject/);
  assert.equal(summarizeUsage([row({ agent: 'a\n\u202eb' })], bounds).agents[0].agent, 'ab');
});

test('collector uses read-only native pagination, 3-day padded query, through source and local filtering', async () => {
  const calls = [];
  const summary = await collectMagpieUsage({ date: bounds.date, pageSize: 2, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? response([row(), row({ source: 'log' })], 3, 0) : response([row({ t: bounds.end })], 3, 2);
  } });
  assert.equal(summary.totals.requests, 1); assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, '/v1/magpie/usage/requests'); assert.equal(calls[0].url.searchParams.get('via'), 'through');
  assert.equal(calls[0].url.searchParams.get('period'), bounds.queryPeriod); assert.equal(calls[1].url.searchParams.get('offset'), '2');
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(calls[0].options.headers, { accept: 'application/json' });
});

test('collector fails closed on API failure, malformed data, truncation, growing totals and bounds', async () => {
  const cases = [
    [async () => new Response('sensitive error', { status: 401 }), /HTTP 401/],
    [async () => new Response('not json'), /malformed JSON/],
    [async () => new Response('{}'), /pagination/],
    [async () => response([], 1), /truncated/],
    [async () => response([row()], 0), /row bound or total/],
    [async () => response([row({ in: -1 })]), /input tokens/],
    [async () => response([row({ t: 'yesterday' })]), /timestamp/],
    [async () => response([row({ t: '2026-02-30T08:00:00Z' })]), /timestamp/],
    [async () => response([row({ priced: undefined })]), /pricing/],
    [async () => { throw new Error('secret credential'); }, /request failed/],
  ];
  for (const [fetchImpl, expected] of cases) await assert.rejects(collectMagpieUsage({ date: bounds.date, fetchImpl }), expected);
  let n = 0;
  await assert.rejects(collectMagpieUsage({ date: bounds.date, pageSize: 1, fetchImpl: async () => ++n === 1 ? response([row()], 2) : response([row()], 3, 1) }), /changed during pagination/);
  let duplicatePage = 0;
  await assert.rejects(collectMagpieUsage({ date: bounds.date, pageSize: 1, fetchImpl: async () => response([row({ rid: 'same-attempt' })], 2, duplicatePage++) }), /duplicate attempts/);
  await assert.rejects(collectMagpieUsage({ date: bounds.date, pageSize: 1, maxPages: 1, fetchImpl: async () => response([row()], 2) }), /page bound/);
  await assert.rejects(collectMagpieUsage({ date: bounds.date, maxRows: 1, fetchImpl: async () => response([row()], 2) }), /row bound/);
  await assert.rejects(collectMagpieUsage({ date: bounds.date, maxPageBytes: 4, fetchImpl: async () => response([]) }), /byte limit/);
  await assert.rejects(collectMagpieUsage({ date: bounds.date, fetchImpl: async () => response([], 0, 1) }), /pagination/);
  for (const magpieUrl of ['https://127.0.0.1:3425', 'http://example.com', 'http://user:secret@localhost', 'http://localhost/x']) {
    await assert.rejects(collectMagpieUsage({ date: bounds.date, magpieUrl }), /loopback/);
  }
});

test('actual PNG renderer and artifact writer produce valid deterministic private outputs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nori-daily-receipt-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const summary = summarizeUsage([row()], bounds), png = await renderReceiptPng(summary);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 760); assert.ok(png.readUInt32BE(20) > 1000);
  assert.deepEqual(png, await renderReceiptPng(summary));
  const paths = await writeDailyReceipt({ date: bounds.date, outputDir: directory, fetchImpl: async () => response([row()]) });
  assert.deepEqual(Object.keys(paths), ['date', 'png', 'svg', 'json']);
  assert.deepEqual(await readFile(paths.png), png); assert.equal(await readFile(paths.svg, 'utf8'), renderReceiptSvg(summary));
  assert.deepEqual(JSON.parse(await readFile(paths.json, 'utf8')), summary);
});

test('large breakdowns keep complete JSON while bounding raster dimensions', () => {
  const summary = summarizeUsage(Array.from({ length: 20 }, (_, i) => row({ model: `model-${i}` })), bounds);
  assert.equal(summary.models.length, 20);
  assert.match(renderReceiptSvg(summary), /8 more; full breakdown in JSON/);
});

test('CLI arguments match wrapper interface and reject duplicates, unknown options and missing values', () => {
  assert.deepEqual(parseReceiptArgs(['--date', '2026-11-01', '--output-dir', '/tmp/r', '--timezone', 'UTC', '--magpie-url', 'http://localhost:3425']),
    { date: '2026-11-01', outputDir: '/tmp/r', timeZone: 'UTC', magpieUrl: 'http://localhost:3425' });
  for (const args of [['--date'], ['--unknown', 'x'], ['--date', 'a', '--date', 'b']]) assert.throws(() => parseReceiptArgs(args), /Usage:/);
});
