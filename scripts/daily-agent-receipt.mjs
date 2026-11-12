#!/usr/bin/env node
// Read-only Magpie ledger reporting. No prompts, accounts, sessions or request IDs
// leave the collector; the artifact schema is an explicit aggregate allowlist.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
export const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function dateMillis(date) {
  if (!datePattern.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date; expected YYYY-MM-DD');
  return Date.parse(`${date}T00:00:00Z`);
}
function shiftDate(date, days) { return new Date(dateMillis(date) + days * DAY).toISOString().slice(0, 10); }
function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
}
function partsAt(format, ms) {
  return Object.fromEntries(format.formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
function midnight(date, format) {
  const target = dateMillis(date);
  let value = target;
  for (let i = 0; i < 6; i++) {
    const p = partsAt(format, value);
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    if (wall === target) return value;
    value += target - wall;
  }
  throw new Error('Calendar date has no supported midnight in this timezone');
}

/** Exact [start,end) calendar-day bounds, including 23/25-hour DST days. */
export function calendarDayBounds({ date, timeZone = DEFAULT_TIMEZONE, now = new Date() } = {}) {
  const format = formatter(timeZone);
  if (date === undefined) {
    const p = partsAt(format, new Date(now).getTime());
    date = shiftDate(`${p.year}-${p.month}-${p.day}`, -1);
  }
  dateMillis(date);
  const start = midnight(date, format), end = midnight(shiftDate(date, 1), format);
  return { date, timeZone, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    hours: (end - start) / 3_600_000, queryPeriod: `${shiftDate(date, -1)}..${shiftDate(date, 1)}` };
}

function integer(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Malformed Magpie ${field}`);
  return value;
}
function label(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string') throw new Error('Malformed Magpie dimension');
  // Labels are bounded metadata, never raw errors, URLs, account or session fields.
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 100) || fallback;
}
function safeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Malformed Magpie row');
  if (typeof row.t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.t) || !Number.isFinite(Date.parse(row.t))) throw new Error('Malformed Magpie timestamp');
  try { dateMillis(row.t.slice(0, 10)); } catch { throw new Error('Malformed Magpie timestamp'); }
  const input = integer(row.in, 'input tokens'), output = integer(row.out, 'output tokens');
  const cacheRead = integer(row.cache_read ?? 0, 'cache-read tokens'), cacheWrite = integer(row.cache_write ?? 0, 'cache-write tokens');
  const reasoning = integer(row.reasoning ?? 0, 'reasoning tokens');
  const status = integer(row.status, 'status');
  if (status > 599 || typeof row.priced !== 'boolean' || typeof row.cost !== 'number' || !Number.isFinite(row.cost) || row.cost < 0 ||
      (row.err !== undefined && typeof row.err !== 'string')) throw new Error('Malformed Magpie pricing or status');
  if ((row.source !== undefined && !['', 'log', 'reported'].includes(row.source)) ||
      (row.rejected !== undefined && typeof row.rejected !== 'boolean')) throw new Error('Malformed Magpie source');
  return { time: Date.parse(row.t), agent: label(row.agent, 'Unknown agent'), provider: label(row.provider, 'Unknown provider'),
    model: label(row.model, 'Unknown model'), input, output, cacheRead, cacheWrite, reasoning,
    cacheMissing: row.cache_read === undefined || row.cache_write === undefined,
    error: status >= 400 || Boolean(row.err), priced: row.priced, cost: row.cost,
    gateway: !row.source && !row.rejected && !(row.provider === '' && status >= 400) };
}
function emptyTotals() {
  return { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    reasoningTokens: 0, totalTokens: 0, knownCostUsd: 0, pricedRequests: 0, unpricedRequests: 0, cacheMetricsMissingRequests: 0 };
}
function add(t, r) {
  t.requests++; t.errors += Number(r.error); t.inputTokens += r.input; t.outputTokens += r.output;
  t.cacheReadTokens += r.cacheRead; t.cacheWriteTokens += r.cacheWrite; t.reasoningTokens += r.reasoning;
  t.totalTokens += r.input + r.output + r.cacheRead + r.cacheWrite;
  if (r.priced) { t.knownCostUsd += r.cost; t.pricedRequests++; } else t.unpricedRequests++;
  t.cacheMetricsMissingRequests += Number(r.cacheMissing);
  for (const key of Object.keys(emptyTotals())) {
    const value = t[key];
    if (!Number.isFinite(value) || (key !== 'knownCostUsd' && !Number.isSafeInteger(value))) throw new Error('Magpie aggregate exceeds numeric bounds');
  }
}
function finish(t) {
  const prompt = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
  return { ...t, knownCostUsd: Number(t.knownCostUsd.toFixed(10)),
    estimatedCostUsd: t.unpricedRequests ? null : Number(t.knownCostUsd.toFixed(10)),
    cacheReadPercent: t.cacheMetricsMissingRequests || !prompt ? null : Number((100 * t.cacheReadTokens / prompt).toFixed(2)) };
}
function summarizeSafe(rows, bounds) {
  const totals = emptyTotals(), groups = { agents: new Map(), providers: new Map(), models: new Map() };
  for (const row of rows) {
    if (!row.gateway || row.time < Date.parse(bounds.start) || row.time >= Date.parse(bounds.end)) continue;
    add(totals, row);
    for (const [dimension, key, fields] of [
      ['agents', row.agent, { agent: row.agent }], ['providers', row.provider, { provider: row.provider }],
      ['models', JSON.stringify([row.provider, row.model]), { provider: row.provider, model: row.model }],
    ]) {
      if (!groups[dimension].has(key)) groups[dimension].set(key, { ...fields, ...emptyTotals() });
      add(groups[dimension].get(key), row);
    }
  }
  const sorted = map => [...map.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, t]) => finish(t));
  return { schemaVersion: 1, title: 'Nori daily usage receipt', date: bounds.date, timeZone: bounds.timeZone,
    interval: { start: bounds.start, end: bounds.end, hours: bounds.hours, endExclusive: true },
    currency: 'USD', costBasis: 'Magpie API estimate; not a bill', requestBasis: 'Gateway ledger attempts, including retry attempts',
    tokenBasis: 'Input excludes cache read/write; total includes both. Reasoning is a subset of output and is not added again.',
    coverage: { source: 'Magpie gateway only', directAcp: 'Outside coverage; unknown',
      attribution: 'Magpie client agent IDs; internal Nori agents and channels are not established',
      cache: 'Cache read share = cache read / (uncached input + cache read + cache write); missing legacy counters remain unknown' },
    totals: finish(totals), agents: sorted(groups.agents), providers: sorted(groups.providers), models: sorted(groups.models) };
}
/** Aggregate raw ledger rows through a strict allowlist; never return request data. */
export function summarizeUsage(rows, bounds) {
  if (!Array.isArray(rows)) throw new Error('Malformed Magpie rows');
  return summarizeSafe(rows.map(safeRow), bounds);
}
function loopbackUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Magpie URL must be a loopback HTTP origin'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Magpie URL must be a loopback HTTP origin');
  return url;
}
async function readPage(response, maxBytes) {
  if (!response.ok) throw new Error(`Magpie usage API returned HTTP ${response.status}`);
  if (!response.body) throw new Error('Magpie usage API returned an empty body');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Magpie usage page exceeds byte limit');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Magpie usage API returned malformed JSON'); }
}
/** Fetch complete bounded pagination; fail rather than produce a truncated report. */
export async function collectMagpieUsage({ date, timeZone = DEFAULT_TIMEZONE, now, magpieUrl = 'http://127.0.0.1:3425',
  fetchImpl = globalThis.fetch, pageSize = 500, maxPages = 100, maxRows = 50_000, timeoutMs = 15_000, maxPageBytes = 8_000_000 } = {}) {
  for (const [k, v] of Object.entries({ pageSize, maxPages, maxRows, timeoutMs, maxPageBytes })) if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`Invalid ${k}`);
  const bounds = calendarDayBounds({ date, timeZone, now }), origin = loopbackUrl(magpieUrl);
  const rows = [], identities = new Set(); let total;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const url = new URL('/v1/magpie/usage/requests', origin);
    url.search = new URLSearchParams({ period: bounds.queryPeriod, limit: String(pageSize), offset: String(rows.length), via: 'through' });
    const signal = AbortSignal.timeout(timeoutMs);
    let page;
    try {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal, headers: { accept: 'application/json' } });
      page = await readPage(response, maxPageBytes);
    } catch (error) {
      if (/^Magpie /.test(error.message)) throw error;
      throw new Error('Magpie usage request failed; no receipt generated');
    }
    if (!page || !Array.isArray(page.rows) || !Number.isSafeInteger(page.total) || page.total < 0 ||
        page.offset !== rows.length || page.rows.length > pageSize) throw new Error('Malformed Magpie pagination');
    if (total !== undefined && page.total !== total) throw new Error('Magpie usage changed during pagination; retry collection');
    total = page.total;
    if (total > maxRows || rows.length + page.rows.length > total) throw new Error('Magpie usage exceeds row bound or total');
    // Detect repeated pages using ephemeral identities; never export these fields.
    for (const row of page.rows) {
      if (row && typeof row.rid === 'string' && row.rid) {
        const identity = JSON.stringify([row.rid, row.t, row.provider, row.model, row.status, row.tries, row.handed_on]);
        if (identities.has(identity)) throw new Error('Magpie usage pagination contains duplicate attempts');
        identities.add(identity);
      }
    }
    // Sanitize immediately; raw request metadata is never retained between pages.
    rows.push(...page.rows.map(safeRow));
    if (rows.length === total) return summarizeSafe(rows, bounds);
    if (page.rows.length === 0) throw new Error('Magpie usage pagination truncated');
  }
  throw new Error('Magpie usage pagination exceeds page bound');
}

const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const count = value => new Intl.NumberFormat('en-US').format(value);
const usd = value => `$${value.toFixed(4)}`;
const costLabel = totals => totals.requests > 0 && totals.pricedRequests === 0 ? 'Price unavailable' :
  totals.estimatedCostUsd === null ? `${usd(totals.knownCostUsd)} + unknown` : usd(totals.estimatedCostUsd);
function clipped(value, width = 38) { return value.length > width ? `${value.slice(0, width - 1)}…` : value; }
/** Deterministic SVG: no remote resources, generated imagery, timestamps or invented comparisons. */
export function renderReceiptSvg(summary) {
  const t = summary.totals, width = 760, left = 100, right = 660;
  let y = 90; const body = [];
  const line = (text, { size = 18, color = '#3f4941', anchor = 'start', weight = 400, x = left } = {}) => {
    body.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${xml(text)}</text>`); y += size + 14;
  };
  const rule = () => { y += 6; body.push(`<path d="M${left} ${y}H${right}" stroke="#b4b9aa" stroke-dasharray="4 6"/>`); y += 32; };
  const pair = (name, value) => {
    body.push(`<text x="${left}" y="${y}" font-size="18" fill="#586153">${xml(name)}</text><text x="${right}" y="${y}" font-size="18" text-anchor="end" fill="#26392d">${xml(value)}</text>`); y += 34;
  };
  line('NORI', { size: 42, weight: 700, anchor: 'middle', x: width / 2 });
  line('DAILY USAGE RECEIPT', { size: 16, anchor: 'middle', x: width / 2 });
  y += 12; line(summary.date, { size: 24, anchor: 'middle', x: width / 2 });
  line(summary.timeZone, { size: 15, anchor: 'middle', x: width / 2 });
  rule(); line('ESTIMATED COST · USD', { size: 16 });
  line(t.requests > 0 && t.pricedRequests === 0 ? 'PRICE UNAVAILABLE' : costLabel(t), { size: 34, weight: 700 });
  line('Magpie API estimate · not a bill', { size: 14 });
  if (t.unpricedRequests) line(`${count(t.unpricedRequests)} attempts have no known price`, { size: 14 });
  rule(); pair('Gateway attempts', count(t.requests)); pair('Failed attempts', count(t.errors));
  pair('Total tokens incl. cache', count(t.totalTokens)); pair('Uncached input', count(t.inputTokens));
  pair('Output incl. reasoning', count(t.outputTokens)); pair('Reasoning (within output)', count(t.reasoningTokens));
  pair('Cache read / write', `${count(t.cacheReadTokens)} / ${count(t.cacheWriteTokens)}`);
  pair('Cache read share of input', t.cacheReadPercent === null ? 'Unknown / no input' : `${t.cacheReadPercent.toFixed(1)}%`);
  if (t.cacheMetricsMissingRequests) line('Legacy cache counters missing', { size: 14 });
  const group = (heading, entries, name) => {
    rule(); line(heading, { size: 16, weight: 700 });
    if (!entries.length) line('No gateway usage recorded', { size: 16 });
    const displayed = [...entries].sort((a, b) => b.knownCostUsd - a.knownCostUsd || b.requests - a.requests).slice(0, 12);
    for (const entry of displayed) {
      line(clipped(name(entry)), { size: 17 });
      line(`${count(entry.requests)} req / ${count(entry.errors)} err / ${count(entry.totalTokens)} tok`, { size: 14 });
      line(`${costLabel(entry)}  · cache ${entry.cacheReadPercent === null ? '?' : `${entry.cacheReadPercent.toFixed(1)}%`}`, { size: 14 });
      y += 6;
    }
    if (entries.length > displayed.length) line(`+ ${entries.length - displayed.length} more; full breakdown in JSON`, { size: 13 });
  };
  group('BY MAGPIE CLIENT', summary.agents, e => e.agent);
  group('BY PROVIDER', summary.providers, e => e.provider);
  group('BY MODEL / PROVIDER', summary.models, e => `${e.model} / ${e.provider}`);
  rule();
  for (const note of ['Gateway traffic only; retries count as attempts.', 'Direct ACP usage: outside coverage / unknown.', 'Internal Nori agent/channel attribution: unknown.', `${summary.date} · ${summary.timeZone} · ${summary.interval.hours}h`]) line(note, { size: 13 });
  y += 12; line('REIN PROTOCOL FOUNDATION', { size: 13, anchor: 'middle', x: width / 2 });
  const bottom = y + 30, height = bottom + 60;
  let edge = `M64 36H696V${bottom}`;
  for (let x = 696; x > 64; x -= 16) edge += `L${x - 8} ${bottom + 9}L${Math.max(64, x - 16)} ${bottom}`;
  edge += 'Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Nori daily usage receipt"><rect width="100%" height="100%" fill="#a9b6a3"/><path d="${edge}" fill="#faf8ed"/><g font-family="DejaVu Sans Mono, monospace">${body.join('')}</g></svg>`;
}
export async function renderReceiptPng(summary) {
  const { Resvg } = await import('@resvg/resvg-js');
  return new Resvg(renderReceiptSvg(summary), { font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans Mono' } }).render().asPng();
}
export async function writeDailyReceipt(options = {}) {
  const summary = await collectMagpieUsage(options), svg = renderReceiptSvg(summary), png = await renderReceiptPng(summary);
  const outputDir = resolve(options.outputDir ?? 'runtime/daily-agent-receipts');
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const stem = join(outputDir, `nori-usage-${summary.date}`);
  const paths = { date: summary.date, png: `${stem}.png`, svg: `${stem}.svg`, json: `${stem}.json` };
  await writeFile(paths.json, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  await writeFile(paths.svg, svg, { mode: 0o600 }); await writeFile(paths.png, png, { mode: 0o600 });
  return paths;
}
export function parseReceiptArgs(args) {
  const options = {}, names = { '--date': 'date', '--output-dir': 'outputDir', '--magpie-url': 'magpieUrl', '--timezone': 'timeZone' };
  for (let i = 0; i < args.length; i++) {
    const key = names[args[i]];
    if (!key || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: daily-agent-receipt.mjs [--date YYYY-MM-DD] [--output-dir PATH] [--magpie-url http://127.0.0.1:3425] [--timezone America/Los_Angeles]');
    options[key] = args[++i];
  }
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeDailyReceipt(parseReceiptArgs(process.argv.slice(2))).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
