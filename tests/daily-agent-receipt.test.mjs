import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { providerIconName, modelIconName, receiptIcon } from '../scripts/daily-agent-receipt-icons.mjs';
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
  assert.doesNotMatch(unpriced, /\$0\.0000 \+ unknown/); assert.match(unpriced, /PROVIDER \/ MODEL/);
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

test('Day Card-derived main body nests exact model IDs under provider subtotals with costs only', () => {
  const longName = 'qwen3.5-plus-enterprise-long-context-model-with-complete-release-identifier-2026-11-12';
  const summary = summarizeUsage([row({ model: longName, cost: 1.2345 }),
    row({ model: 'mixed-model', cost: 0.25 }), row({ model: 'mixed-model', priced: false, cost: 0 }),
    row({ model: 'unpriced-model', priced: false, cost: 0 })], bounds);
  const svg = renderReceiptSvg(summary);
  const main = svg.slice(svg.indexOf('PROVIDER / MODEL'), svg.indexOf('TOTAL TOKENS (INCL. CACHE)'));
  const modelRows = [...main.matchAll(/<g data-receipt-row="model">([\s\S]*?)<\/g>/g)].map(match => match[1]);
  const firstRow = [...modelRows[0].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
  assert.equal(firstRow.slice(1).join(''), longName);
  assert.doesNotMatch(main, /…|tokens|attempts|failed|Input|input|output|Cache|cache/);
  assert.match(main, /\$1\.2345/); assert.match(main, /\$0\.2500 \+ unknown/); assert.match(main, /Price unavailable/);
  assert.doesNotMatch(svg, /BY MAGPIE CLIENT|MODEL \/ USAGE|DAILY TOTALS/);
  assert.match(svg, /Magpie catalog estimate · not a bill/);
  assert.match(svg, /Subscription charges are not calculated here/);
  assert.equal(summary.models.find(entry => entry.model === longName).estimatedCostUsd, 1.2345);
});

test('only active providers appear; the same model at two providers keeps two subtotals and rows', () => {
  const summary = summarizeUsage([row({ provider: 'openai', model: 'same-model', cost: 0.1 }),
    row({ provider: 'google', model: 'same-model', cost: 0.2 }),
    row({ provider: 'inactive-provider', t: bounds.end })], bounds);
  const svg = renderReceiptSvg(summary);
  assert.equal((svg.match(/data-receipt-row="provider"/g) ?? []).length, 2);
  assert.equal((svg.match(/data-receipt-row="model"/g) ?? []).length, 2);
  assert.equal((svg.match(/>same-model<\/text>/g) ?? []).length, 2);
  assert.doesNotMatch(svg, /inactive-provider/);
  assert.match(svg, /data-icon="google"/); assert.match(svg, /data-icon="openai"/);
  assert.match(svg, /UNPRICED REQUESTS/);
  assert.equal(summary.totals.unpricedRequests, 0);
});

test('bundled vector hashes and brand selection preserve source provenance', async () => {
  const base = new URL('../assets/daily-agent-receipt/', import.meta.url);
  const hashes = JSON.parse(await readFile(new URL('icons.sha256.json', base), 'utf8'));
  for (const [name, hash] of Object.entries(hashes)) {
    const source = await readFile(new URL(`icons/${name}`, base));
    assert.equal(createHash('sha256').update(source).digest('hex'), hash);
    assert.doesNotMatch(source.toString(), /<(?:script|image|foreignObject)\b|(?:href|src)=/i);
  }
  assert.equal(providerIconName('bailian-token-plan'), 'alibaba');
  assert.equal(modelIconName('deepseek-v4.1-flash', 'bailian-token-plan'), 'deepseek');
  assert.equal(modelIconName('qwen3.8-flash', 'bailian-token-plan'), 'qwen');
  assert.equal(modelIconName('gemini-3.6-flash', 'google'), 'gemini');
  assert.equal(modelIconName('gpt-6.1-sol', 'openai'), 'openai');
  const { Resvg } = await import('@resvg/resvg-js');
  for (const name of ['alibaba', 'deepseek', 'qwen', 'openai', 'google', 'gemini']) {
    const image = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${receiptIcon(name, 4, 4, 24)}</svg>`,
      { font: { loadSystemFonts: false } }).render();
    assert.ok(image.pixels.some((value, index) => index % 4 === 3 && value > 0), `${name} vector must rasterize visible pixels`);
    assert.deepEqual([...image.asPng().subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }

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
  const brandedRow = row({ provider: 'bailian-token-plan', model: 'deepseek-v4.1-flash' });
  const summary = summarizeUsage([brandedRow], bounds), png = await renderReceiptPng(summary);
  assert.match(renderReceiptSvg(summary), /data-icon="alibaba"/);
  assert.match(renderReceiptSvg(summary), /data-icon="deepseek"/);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 720); assert.ok(png.readUInt32BE(20) > 1000);
  assert.deepEqual(png, await renderReceiptPng(summary));
  const paths = await writeDailyReceipt({ date: bounds.date, outputDir: directory, fetchImpl: async () => response([brandedRow]) });
  assert.deepEqual(Object.keys(paths), ['date', 'png', 'svg', 'json']);
  assert.deepEqual(await readFile(paths.png), png); assert.equal(await readFile(paths.svg, 'utf8'), renderReceiptSvg(summary));
  assert.deepEqual(JSON.parse(await readFile(paths.json, 'utf8')), summary);
});

test('more than twelve groups render every provider/model and oversized images fail explicitly', () => {
  const summary = summarizeUsage(Array.from({ length: 20 }, (_, i) => row({ provider: `provider-${i}`, model: `model-${i}` })), bounds);
  const svg = renderReceiptSvg(summary);
  assert.equal(summary.models.length, 20);
  assert.equal((svg.match(/data-receipt-row="provider"/g) ?? []).length, 20);
  assert.equal((svg.match(/data-receipt-row="model"/g) ?? []).length, 20);
  assert.doesNotMatch(svg, /more; full breakdown|…/);
  const oversized = summarizeUsage(Array.from({ length: 500 }, (_, i) => row({ provider: `provider-${i}`, model: `model-${i}` })), bounds);
  assert.throws(() => renderReceiptSvg(oversized), /safe single-image height/);
});

test('CLI arguments match wrapper interface and reject duplicates, unknown options and missing values', () => {
  assert.deepEqual(parseReceiptArgs(['--date', '2026-11-01', '--output-dir', '/tmp/r', '--timezone', 'UTC', '--magpie-url', 'http://localhost:3425']),
    { date: '2026-11-01', outputDir: '/tmp/r', timeZone: 'UTC', magpieUrl: 'http://localhost:3425' });
  for (const args of [['--date'], ['--unknown', 'x'], ['--date', 'a', '--date', 'b']]) assert.throws(() => parseReceiptArgs(args), /Usage:/);
});
