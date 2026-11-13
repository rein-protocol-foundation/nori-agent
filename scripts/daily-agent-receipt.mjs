#!/usr/bin/env node
// Read-only Magpie ledger reporting. No prompts, accounts, sessions or request IDs
// leave the collector; the artifact schema is an explicit aggregate allowlist.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectNoriUsageSources } from './nori-usage-sources.mjs';
import { receiptIcon, providerIconName, modelIconName } from './daily-agent-receipt-icons.mjs';

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
  const model = label(/^(?:auto|.*\/auto)$/i.test(row.model ?? '') && typeof row.served === 'string' && !/^(?:auto|.*\/auto)$/i.test(row.served) ? row.served : row.model, 'Unknown model');
  // Reporting policy: failed, explicitly zero-usage attempts for an identified
  // model count as $0 even when the native ledger did not invoke its pricer.
  // Keep unresolved models, missing counters and nonzero usage unpriced.
  const zeroUsageFailure = (status >= 400 || Boolean(row.err)) && row.cost === 0 &&
    !/^(?:auto|.*\/auto|unknown(?: model)?)$/i.test(model) &&
    row.cache_read !== undefined && row.cache_write !== undefined &&
    input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0 && reasoning === 0;
  return { time: Date.parse(row.t), agent: label(row.agent, 'Unknown agent'), provider: label(row.provider, 'Unknown provider'),
    model, input, output, cacheRead, cacheWrite, reasoning,
    cacheMissing: row.cache_read === undefined || row.cache_write === undefined,
    error: status >= 400 || Boolean(row.err), priced: row.priced || zeroUsageFailure, cost: row.cost,
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
  fetchImpl = globalThis.fetch, sourcesConfig, pageSize = 500, maxPages = 100, maxRows = 50_000, timeoutMs = 15_000, maxPageBytes = 8_000_000 } = {}) {
  for (const [k, v] of Object.entries({ pageSize, maxPages, maxRows, timeoutMs, maxPageBytes })) if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`Invalid ${k}`);
  const bounds = calendarDayBounds({ date, timeZone, now }), origin = loopbackUrl(magpieUrl);
  const rows = [], identities = new Set(), gatewayResponseIds = []; let total;
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
      if (row && typeof row.response_id === 'string' && row.response_id && !row.source) gatewayResponseIds.push({ provider: row.provider, responseId: row.response_id });
      if (row && typeof row.rid === 'string' && row.rid) {
        const identity = JSON.stringify([row.rid, row.t, row.provider, row.model, row.status, row.tries, row.handed_on]);
        if (identities.has(identity)) throw new Error('Magpie usage pagination contains duplicate attempts');
        identities.add(identity);
      }
    }
    // Sanitize immediately; raw request metadata is never retained between pages.
    rows.push(...page.rows.map(safeRow));
    if (rows.length === total) {
      if (!sourcesConfig) return summarizeSafe(rows, bounds);
      const config = typeof sourcesConfig === 'string' ? JSON.parse(await readFile(resolve(sourcesConfig), 'utf8')) : sourcesConfig;
      const supplemental = await collectNoriUsageSources({ config, bounds, magpieUrl, fetchImpl, gatewayResponseIds, now });
      const summary = summarizeSafe([...rows, ...supplemental.rows.map(safeRow)], bounds);
      summary.requestBasis = 'Gateway attempts plus observed native direct/owned ACP usage events';
      summary.coverage.source = 'Magpie gateway plus explicitly configured Nori sources';
      summary.coverage.directAcp = 'Configured owned ACP sources included; unavailable/unconfigured sources remain outside coverage';
      summary.coverage.attribution = 'Native owner IDs for supplemental rows; gateway rows retain Magpie client attribution';
      summary.coverage.supplemental = supplemental.coverage;
      return summary;
    }
    if (page.rows.length === 0) throw new Error('Magpie usage pagination truncated');
  }
  throw new Error('Magpie usage pagination exceeds page bound');
}

const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const count = value => new Intl.NumberFormat('en-US').format(value);
const usd = value => `$${value.toFixed(4)}`;
const costLabel = totals => totals.requests > 0 && totals.pricedRequests === 0 ? 'Price unavailable' :
  totals.estimatedCostUsd === null ? `${usd(totals.knownCostUsd)} + unknown` : usd(totals.estimatedCostUsd);
// Conservative monospace wrapping, preserving exact IDs and reserving the cost column.
function wrapped(value, columns) {
  const lines = []; let current = '', width = 0;
  for (const character of value) {
    const cells = /[^\u0000-\u00ff]/.test(character) ? 2 : 1;
    if (current && width + cells > columns) { lines.push(current); current = ''; width = 0; }
    current += character; width += cells;
  }
  if (current) lines.push(current);
  return lines;
}
/** Day Card-derived SVG adapter. Source/license: assets/daily-agent-receipt/PROVENANCE.md.
 * Uses its compact paper/cost-row composition; does not execute the stock Canvas plugin.
 */
export function renderReceiptSvg(summary) {
  const incompleteCoverage = summary.coverage.supplemental && !summary.coverage.supplemental.complete;
  const t = summary.totals, width = 720, paperLeft = 60, paperRight = 660, left = 92, right = 628;
  const ink = '#1f1d20', muted = '#76736e';
  let y = 103; const body = [];
  const text = (value, x, baseline, size = 15, weight = 400, anchor = 'start', color = ink) => {
    body.push(`<text x="${x}" y="${baseline}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}" xml:space="preserve">${xml(value)}</text>`);
  };
  const center = (value, size = 15, weight = 400, color = ink) => { text(value, width / 2, y, size, weight, 'middle', color); y += size + 14; };
  const rule = () => { y += 6; body.push(`<path d="M${left} ${y}H${right}" stroke="#a8a49c" stroke-dasharray="5 5"/>`); y += 30; };
  const pair = (name, value, size = 15, weight = 400) => {
    text(name, left, y, size, weight); text(value, right, y, size, weight, 'end'); y += 28;
  };
  // The fixed right column never shares space with wrapped provider/model IDs.
  const costRow = (name, value, icon, nested) => {
    const size = nested ? 15 : 18, weight = nested ? 400 : 700;
    const iconSize = nested ? 17 : 23, iconX = left + (nested ? 24 : 0), nameX = iconX + iconSize + 10;
    const costWidth = Math.max(86, Array.from(value).length * size * 0.63);
    const columns = Math.max(8, Math.floor((right - costWidth - 18 - nameX) / (size * 0.63)));
    const lines = wrapped(name, columns);
    body.push(`<g data-receipt-row="${nested ? 'model' : 'provider'}">`);
    body.push(receiptIcon(icon, iconX, y - iconSize + 3, iconSize));
    text(value, right, y, size, weight, 'end');
    for (const part of lines) { text(part, nameX, y, size, weight); y += size + 9; }
    y += nested ? 5 : 6; body.push('</g>');
  };
  center('DAILY AI STATEMENT', 31, 700);
  center(summary.coverage.supplemental ? 'Nori · priced by Magpie' : 'Nori · routed through Magpie', 13);
  y += 9; pair('DATE', summary.date, 14); pair('TIMEZONE', summary.timeZone, 13);
  rule(); center('TOTAL ESTIMATED USD', 14); y += 29;
  // The total is the known subtotal. A raised marker signals an incomplete
  // price mapping without appending an unknown amount to the headline.
  body.push(`<text data-total-estimate="true" x="${width / 2}" y="${y}" font-size="43" fill="${ink}" text-anchor="middle" font-weight="700"><tspan>${xml(usd(t.knownCostUsd))}</tspan>${t.unpricedRequests || incompleteCoverage ? '<tspan baseline-shift="super" font-size="60%">*</tspan>' : ''}</text>`);
  y += 57;
  center('Magpie catalog estimate · not a bill', 12);
  center('Subscription charges are not calculated here.', 11, 400, muted);
  rule(); pair('REQUESTS / ATTEMPTS', count(t.requests)); pair('ERRORS', count(t.errors));
  rule(); text('PROVIDER / MODEL', left, y, 14, 400, 'start', muted); text('USD COST', right, y, 14, 400, 'end', muted); y += 34;
  const providers = [...summary.providers].sort((a, b) => b.knownCostUsd - a.knownCostUsd || (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0));
  const modelsByProvider = new Map();
  for (const model of summary.models) {
    if (!modelsByProvider.has(model.provider)) modelsByProvider.set(model.provider, []);
    modelsByProvider.get(model.provider).push(model);
  }
  if (!providers.length) { text(summary.coverage.supplemental ? 'No usage recorded in selected sources' : 'No gateway usage recorded', left, y, 15); y += 28; }
  for (const provider of providers) {
    costRow(provider.provider, costLabel(provider), providerIconName(provider.provider), false);
    const models = [...(modelsByProvider.get(provider.provider) ?? [])].sort((a, b) => b.knownCostUsd - a.knownCostUsd || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0));
    for (const model of models) costRow(model.model, costLabel(model), modelIconName(model.model, model.provider), true);
    y += 13;
  }
  rule(); pair('TOTAL TOKENS (INCL. CACHE)', count(t.totalTokens));
  pair('UNCACHED INPUT', count(t.inputTokens)); pair('OUTPUT (REASONING INCLUDED)', count(t.outputTokens));
  pair('CACHE HIT RATE', t.cacheReadPercent === null ? 'Unknown / no input' : `${t.cacheReadPercent.toFixed(1)}%`);
  pair('UNPRICED REQUESTS', count(t.unpricedRequests));
  rule();
  if (t.unpricedRequests) center(`* Known subtotal only; excludes ${count(t.unpricedRequests)} unpriced ${t.unpricedRequests === 1 ? 'request' : 'requests'}.`, 11);
  if (incompleteCoverage) center('* Source coverage incomplete; totals omit unavailable usage.', 10);
  center(summary.coverage.supplemental ? (summary.coverage.supplemental.complete ? 'Gateway + configured Nori direct / owned ACP sources' : 'Source coverage incomplete · see JSON evidence') : 'Gateway only · direct ACP outside coverage', 10);
  center(`${summary.interval.hours}-hour local day · retries count as attempts`, 11, 400, muted);
  y += 5; center('Day Card-derived · design inspired by nowdex.app', 10, 400, muted);
  const bottom = y + 12, height = bottom + 58;
  // Fail explicitly rather than silently dropping active providers/models or exhausting raster memory.
  if (height > 16_000) throw new Error('Receipt exceeds safe single-image height; no providers or models were truncated');
  let edge = `M${paperLeft} 36H${paperRight}V${bottom}`;
  for (let x = paperRight; x > paperLeft; x -= 12) edge += `L${x - 6} ${bottom + 6}L${Math.max(paperLeft, x - 12)} ${bottom}`;
  edge += 'Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Nori daily usage receipt"><rect width="100%" height="100%" fill="#c6d4cd"/><path d="${edge}" fill="#f7f4ed"/><g font-family="DejaVu Sans Mono, Menlo, Monaco, Consolas, monospace">${body.join('')}</g></svg>`;
}
export async function renderReceiptPng(summary) {
  const { Resvg } = await import('@resvg/resvg-js');
  const monospace = process.platform === 'darwin' ? 'Menlo' : process.platform === 'win32' ? 'Consolas' : 'DejaVu Sans Mono';
  return new Resvg(renderReceiptSvg(summary), { font: { loadSystemFonts: true, defaultFontFamily: monospace, monospaceFamily: monospace } }).render().asPng();
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
  const options = {}, names = { '--date': 'date', '--output-dir': 'outputDir', '--magpie-url': 'magpieUrl', '--timezone': 'timeZone', '--sources-config': 'sourcesConfig' };
  for (let i = 0; i < args.length; i++) {
    const key = names[args[i]];
    if (!key || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: daily-agent-receipt.mjs [--date YYYY-MM-DD] [--output-dir PATH] [--magpie-url http://127.0.0.1:3425] [--timezone America/Los_Angeles] [--sources-config PATH]');
    options[key] = args[++i];
  }
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeDailyReceipt(parseReceiptArgs(process.argv.slice(2))).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
