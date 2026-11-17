#!/usr/bin/env node
// Dependency-free, read-only SEO collection. Importable dependencies are injected only in tests.
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_BASE = 'https://www.googleapis.com/webmasters/v3/sites/';
const BING_BASE = 'https://ssl.bing.com/webmaster/api.svc/json/';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const BING_METHODS = ['GetRankAndTrafficStats', 'GetQueryStats', 'GetPageStats', 'GetCrawlStats', 'GetFeeds'];
const MAX_RESPONSE = 8 * 1024 * 1024;
const MAX_REPORT = 40 * 1024 * 1024;

export class SeoError extends Error {
  constructor(code, httpStatus) { super(code); this.code = code; if (httpStatus) this.httpStatus = httpStatus; }
}
const fail = code => { throw new SeoError(code); };
const errorInfo = error => ({ code: error instanceof SeoError ? error.code : 'operation_failed',
  ...(error instanceof SeoError && error.httpStatus ? { httpStatus: error.httpStatus } : {}) });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2048) : null;
const iso = value => {
  if (typeof value !== 'string') return null;
  const legacy = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(value);
  const ms = legacy ? Number(legacy[1]) : Date.parse(value);
  return Number.isFinite(ms) && Math.abs(ms) < 8.64e15 ? new Date(ms).toISOString() : null;
};

function validSite(value, domainAllowed = false) {
  if (domainAllowed && typeof value === 'string' && /^sc-domain:(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash ||
        !u.hostname.includes('.') || u.hostname.endsWith('.') || value !== u.href || value.length > 2048) fail('invalid_site');
    return value;
  } catch { fail('invalid_site'); }
}

// Reject every symlink component, including ancestors. Canonicalize an OS-specific checkout
// path before provisioning; this function intentionally does not silently follow /tmp or /var.
export async function checkPath(file, { missing = false } = {}) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) fail('symlink_path');
      if (current !== absolute && !stat.isDirectory()) fail('invalid_path');
      // A writable non-sticky ancestor allows another user to swap path components.
      if (stat.isDirectory() && (stat.mode & 0o022) && !(stat.mode & 0o1000)) fail('unsafe_parent_permissions');
    } catch (error) {
      if (missing && error.code === 'ENOENT') return absolute;
      throw error instanceof SeoError ? error : new SeoError('path_unavailable');
    }
  }
  return absolute;
}

async function privateRead(file, limit = MAX_REPORT) {
  await checkPath(file);
  let handle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) ||
        (process.getuid && stat.uid !== process.getuid()) || stat.size > limit) fail('unsafe_file_permissions');
    const body = await handle.readFile('utf8');
    if (Buffer.byteLength(body) > limit) fail('file_too_large');
    return body;
  } finally { await handle?.close(); }
}

function parseJson(body) {
  try { return JSON.parse(body); } catch { fail('invalid_json'); }
}
const bounded = (value, fallback, low, high) => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < low || value > high) fail('invalid_config');
  return value;
};
function outsideSkills(file) {
  if (file.split(path.sep).some((part, i, parts) => part === 'skills' && parts[i - 1] === 'workspace')) fail('shared_skill_storage_forbidden');
  return file;
}

export async function loadConfig(filename) {
  if (!filename) fail('config_required');
  const configPath = outsideSkills(path.resolve(filename));
  const raw = parseJson(await privateRead(configPath, 65536));
  if (!object(raw)) fail('invalid_config');
  const allowed = ['googleSite', 'bingSite', 'googleCredentialsFile', 'bingApiKeyFile', 'outputDirectory', 'retention', 'pageSize', 'maxPages', 'minimumImpressions'];
  if (Object.keys(raw).some(key => !allowed.includes(key))) fail('unknown_config_field');
  const resolve = (value, fallback) => {
    if (value === undefined) value = fallback;
    if (typeof value !== 'string' || !value.length || value.includes('\0')) fail('invalid_config');
    return outsideSkills(path.resolve(path.dirname(configPath), value));
  };
  return {
    googleSite: validSite(raw.googleSite ?? 'sc-domain:rein-protocol.org', true),
    bingSite: validSite(raw.bingSite ?? 'https://www.rein-protocol.org/'),
    googleCredentialsFile: resolve(raw.googleCredentialsFile, 'google-service-account.json'),
    bingApiKeyFile: resolve(raw.bingApiKeyFile, 'bing-api-key.txt'),
    outputDirectory: resolve(raw.outputDirectory, 'reports'),
    retention: bounded(raw.retention, 30, 1, 90), pageSize: bounded(raw.pageSize, 1000, 1, 25000),
    maxPages: bounded(raw.maxPages, 10, 1, 20), minimumImpressions: bounded(raw.minimumImpressions, 100, 100, 1000000),
  };
}

async function privateDirectory(directory) {
  await checkPath(directory, { missing: true });
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await checkPath(directory);
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) fail('unsafe_directory_permissions');
}

export function windows(now = new Date()) {
  const pt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => pt.find(part => part.type === type).value;
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const shift = n => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  return { timezone: 'America/Los_Angeles', inclusive: true, dataState: 'final', current: { startDate: shift(-30), endDate: shift(-3) }, previous: { startDate: shift(-58), endDate: shift(-31) } };
}

function permitted(url, method) {
  if (url === TOKEN_URL && method === 'POST') return true;
  const u = new URL(url);
  if (u.username || u.password || u.hash || u.port || u.protocol !== 'https:') return false;
  if (u.origin === 'https://www.googleapis.com' && !u.search) {
    return (method === 'GET' && /^\/webmasters\/v3\/sites\/[^/]+(?:\/sitemaps)?$/.test(u.pathname)) ||
      (method === 'POST' && /^\/webmasters\/v3\/sites\/[^/]+\/searchAnalytics\/query$/.test(u.pathname));
  }
  return method === 'GET' && u.origin === 'https://ssl.bing.com' &&
    BING_METHODS.some(name => u.pathname === `/webmaster/api.svc/json/${name}`) &&
    [...u.searchParams.keys()].sort().join(',') === 'apikey,siteUrl';
}

async function responseJson(response) {
  if (!response.body?.getReader) fail('invalid_response');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) fail('response_too_large');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = parseJson(Buffer.concat(chunks).toString('utf8'));
  if (!object(result)) fail('invalid_response');
  return result;
}

export function transport({ fetch: fetchImpl = globalThis.fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 20000, maxDurationMs = 600000 } = {}) {
  const started = Date.now();
  return async function request(url, { method = 'GET', headers = {}, body } = {}) {
    if (!permitted(url, method)) fail('endpoint_forbidden');
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = maxDurationMs - (Date.now() - started);
      if (remaining <= 0) fail('collection_timeout');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
      let response;
      try {
        response = await fetchImpl(url, { method, headers, body, redirect: 'error', signal: controller.signal });
        if (response.redirected || (response.status >= 300 && response.status < 400)) fail('redirect_forbidden');
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          if ((response.status === 429 || response.status >= 500) && attempt < 2) {
            const retry = Number(response.headers?.get('retry-after'));
            clearTimeout(timer);
            await sleep(Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 5000) : 250 * (2 ** attempt));
            continue;
          }
          throw new SeoError('http_error', response.status);
        }
        return await responseJson(response);
      } catch (error) {
        if (error instanceof SeoError) throw error;
        // Never expose fetch's exception: it can contain an API key in the request URL.
        if (Date.now() - started >= maxDurationMs) fail('collection_timeout');
        if (attempt === 2) throw new SeoError(controller.signal.aborted ? 'request_timeout' : 'network_error');
      } finally { clearTimeout(timer); }
      await sleep(250 * (2 ** attempt));
    }
  };
}

export function serviceAssertion(credentials, now = new Date()) {
  if (!object(credentials) || credentials.type !== 'service_account' ||
      typeof credentials.client_email !== 'string' || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(credentials.client_email) ||
      typeof credentials.private_key !== 'string') fail('invalid_google_credentials');
  const issued = Math.floor(now.getTime() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email, scope: SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 })}`;
  try { return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url')}`; }
  catch { fail('invalid_google_credentials'); }
}

const metrics = row => ({ clicks: number(row.clicks), impressions: number(row.impressions), ctr: number(row.ctr), position: number(row.position) });
function googleRow(row, dimension) {
  if (!object(row) || (dimension && (!Array.isArray(row.keys) || row.keys.length !== 1 || typeof row.keys[0] !== 'string'))) fail('invalid_google_rows');
  if (['clicks', 'impressions', 'ctr', 'position'].some(field => number(row[field]) === null)) fail('invalid_google_rows');
  if (dimension === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(row.keys[0])) fail('invalid_google_rows');
  return { ...(dimension ? { [dimension]: text(row.keys[0]) } : {}), ...metrics(row) };
}
const dateSpan = dates => {
  const sorted = [...new Set(dates.filter(Boolean))].sort();
  return sorted.length ? { start: sorted[0], end: sorted.at(-1), points: sorted.length } : null;
};
function freshness(observed, now) {
  return { latestObservedAt: observed?.end ?? null,
    ageDays: observed ? Math.max(0, Math.floor((now.getTime() - Date.parse(observed.end)) / 86400000)) : null };
}
function dataset(rows, extras = {}) { return { status: rows.length ? 'healthy' : 'no_data', rows, ...extras }; }
function sourceStatus(datasets, performanceOnly = false) {
  const entries = Object.values(datasets);
  const successful = entries.filter(item => item.status === 'healthy' || item.status === 'no_data');
  if (!successful.length) return 'error';
  if (entries.some(item => item.status === 'error' || item.truncated)) return 'partial';
  return Object.entries(datasets).some(([key, item]) => item.status === 'healthy' && item.rows?.length &&
    (!performanceOnly || (!['site', 'sitemaps', 'GetFeeds', 'GetCrawlStats'].includes(key)))) ? 'healthy' : 'no_data';
}

export async function collectGoogle(config, request, now) {
  const fetchedAt = now.toISOString(), requestedWindow = windows(now);
  const base = `${GOOGLE_BASE}${encodeURIComponent(config.googleSite)}`;
  const result = { status: 'error', performanceDataStatus: 'error', fetchedAt, site: config.googleSite, requestedWindow, observedWindow: null, datasets: {}, comparison: null,
    provenance: { sites: { method: 'GET', endpoint: `${base}` }, sitemaps: { method: 'GET', endpoint: `${base}/sitemaps` }, analytics: { method: 'POST', endpoint: `${base}/searchAnalytics/query` } },
    caveats: ['Final Google web-search data only; missing dates are unavailable, never filled with zeros.', 'Search Console returns top rows and does not guarantee exhaustive page/query data; breakdown totals need not equal property totals.'] };
  try {
    const credentials = parseJson(await privateRead(config.googleCredentialsFile, 65536));
    const token = await request(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAssertion(credentials, now) }).toString() });
    if (typeof token.access_token !== 'string' || !token.access_token || /[\r\n]/.test(token.access_token)) fail('invalid_token_response');
    const headers = { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' };
    const read = async (key, action) => {
      try { result.datasets[key] = await action(); }
      catch (error) { result.datasets[key] = { status: 'error', error: errorInfo(error) }; }
    };
    await read('site', async () => {
      const value = await request(base, { headers });
      if (value.siteUrl !== config.googleSite || typeof value.permissionLevel !== 'string') fail('invalid_google_site');
      return { status: 'healthy', siteUrl: config.googleSite, permissionLevel: text(value.permissionLevel) };
    });
    await read('sitemaps', async () => {
      const value = await request(`${base}/sitemaps`, { headers });
      if (value.sitemap !== undefined && !Array.isArray(value.sitemap)) fail('invalid_google_sitemaps');
      const rows = (value.sitemap ?? []).slice(0, 1000).map(item => {
        if (!object(item) || typeof item.path !== 'string') fail('invalid_google_sitemaps');
        return { path: text(item.path), lastSubmitted: iso(item.lastSubmitted), lastDownloaded: iso(item.lastDownloaded),
          errors: decimalMetric(item.errors), warnings: decimalMetric(item.warnings), isPending: typeof item.isPending === 'boolean' ? item.isPending : null };
      });
      return dataset(rows, { truncated: (value.sitemap?.length ?? 0) > 1000 });
    });
    for (const period of ['current', 'previous']) {
      for (const dimension of [null, 'date', 'page', 'query']) {
        const key = `${period}_${dimension ?? 'total'}`;
        await read(key, async () => {
          const rows = []; let truncated = false;
          for (let page = 0; page < config.maxPages; page++) {
            const value = await request(`${base}/searchAnalytics/query`, { method: 'POST', headers,
              body: JSON.stringify({ ...requestedWindow[period], type: 'web', dataState: 'final', dimensions: dimension ? [dimension] : [], rowLimit: config.pageSize, startRow: page * config.pageSize }) });
            if (value.rows !== undefined && !Array.isArray(value.rows)) fail('invalid_google_rows');
            const batch = value.rows ?? [];
            if (batch.length > config.pageSize || (!dimension && batch.length > 1)) fail('invalid_google_rows');
            const normalized = batch.map(row => googleRow(row, dimension));
            if (dimension === 'date' && normalized.some(row => row.date < requestedWindow[period].startDate || row.date > requestedWindow[period].endDate)) fail('invalid_google_rows');
            rows.push(...normalized);
            if (batch.length < config.pageSize || !dimension) break;
            if (page === config.maxPages - 1) truncated = true;
          }
          const observedWindow = dimension === 'date' ? dateSpan(rows.map(row => row.date)) : null;
          return dataset(rows, { requestedWindow: requestedWindow[period], observedWindow, truncated });
        });
      }
    }
    result.status = sourceStatus(result.datasets, true);
    result.performanceDataStatus = sourceStatus(Object.fromEntries(Object.entries(result.datasets).filter(([key]) => !['site', 'sitemaps'].includes(key))));
    result.observedWindow = result.datasets.current_date?.observedWindow ?? null;
    const current = result.datasets.current_total?.rows?.[0];
    const previous = result.datasets.previous_total?.rows?.[0];
    result.comparison = current && previous ? Object.fromEntries(['clicks', 'impressions'].map(metric => [metric, {
      current: current[metric], previous: previous[metric], change: current[metric] - previous[metric],
      percentChange: previous[metric] > 0 ? (current[metric] - previous[metric]) / previous[metric] * 100 : null,
    }])) : null;
  } catch (error) { result.error = errorInfo(error); }
  result.freshness = freshness(result.observedWindow, now);
  return result;
}

function decimalMetric(value) {
  return typeof value === 'string' && /^\d{1,15}$/.test(value) ? number(Number(value)) : number(value);
}
const CRAWL_FIELDS = ['AllOtherCodes', 'BlockedByRobotsTxt', 'Code2xx', 'Code301', 'Code302', 'Code4xx', 'Code5xx', 'ContainsMalware', 'CrawlErrors', 'CrawledPages', 'InIndex', 'InLinks'];
export function bingRow(row, method) {
  if (!object(row)) fail('invalid_bing_rows');
  if (method === 'GetFeeds') {
    if (typeof row.Url !== 'string') fail('invalid_bing_rows');
    return { url: text(row.Url), status: text(row.Status), type: text(row.Type), lastCrawled: iso(row.LastCrawled), submitted: iso(row.Submitted), urlCount: number(row.UrlCount), fileSize: number(row.FileSize) };
  }
  const date = iso(row.Date);
  // Preserve the provider date verbatim: a legacy offset is not a local day/window specification.
  const normalized = { date, providerDate: text(row.Date) };
  if (!date) fail('invalid_bing_date');
  if (method === 'GetCrawlStats') {
    for (const key of CRAWL_FIELDS) normalized[key] = number(row[key]);
    if (CRAWL_FIELDS.every(key => normalized[key] === null)) fail('invalid_bing_rows');
  } else {
    normalized.clicks = number(row.Clicks); normalized.impressions = number(row.Impressions);
    if (normalized.clicks === null || normalized.impressions === null) fail('invalid_bing_rows');
    normalized.ctr = normalized.impressions > 0 ? normalized.clicks / normalized.impressions : null;
    if (method !== 'GetRankAndTrafficStats') {
      if (typeof row.Query !== 'string') fail('invalid_bing_rows');
      normalized[method === 'GetPageStats' ? 'page' : 'query'] = text(row.Query);
      normalized.avgClickPosition = number(row.AvgClickPosition);
      normalized.avgImpressionPosition = number(row.AvgImpressionPosition);
    }
  }
  return normalized;
}

export async function collectBing(config, request, now) {
  const result = { status: 'error', performanceDataStatus: 'error', fetchedAt: now.toISOString(), site: config.bingSite,
    requestedWindow: { mode: 'provider_defined', start: null, end: null }, observedWindow: null, datasets: {}, provenance: {},
    caveats: ['Bing methods accept siteUrl only: no requested 28-day filter or comparable previous window.',
      'Provider Date values are labels, not evidence of complete daily coverage or known interval boundaries; legacy offsets are preserved.',
      'Query/page data updates weekly and covers top rows; traffic/crawl data updates daily. Do not aggregate weekly labels as daily totals.',
      'Bing traffic includes multiple verticals (including Chat) and is not directly comparable to Google web search.'] };
  try {
    const apiKey = (await privateRead(config.bingApiKeyFile, 4096)).trim();
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(apiKey)) fail('invalid_bing_key');
    for (const method of BING_METHODS) {
      const endpoint = `${BING_BASE}${method}`;
      result.provenance[method] = { endpoint, method: 'GET', parameters: ['siteUrl', 'apikey (redacted)'] };
      try {
        const url = new URL(endpoint);
        url.searchParams.set('siteUrl', config.bingSite); url.searchParams.set('apikey', apiKey);
        const value = await request(url.href);
        if (!Array.isArray(value.d)) fail('invalid_bing_response');
        const limit = Math.min(config.pageSize * config.maxPages, 25000);
        const rows = value.d.slice(0, limit).map(row => bingRow(row, method));
        const observedWindow = dateSpan(rows.map(row => row.date));
        result.datasets[method] = dataset(rows, { observedWindow, freshness: freshness(observedWindow, now), truncated: value.d.length > limit,
          cadence: ['GetPageStats', 'GetQueryStats'].includes(method) ? 'weekly_update_period_unspecified' : method === 'GetFeeds' ? 'inventory' : 'daily_update_period_unspecified' });
      } catch (error) { result.datasets[method] = { status: 'error', error: errorInfo(error) }; }
    }
    result.status = sourceStatus(result.datasets, true);
    result.performanceDataStatus = sourceStatus(Object.fromEntries(Object.entries(result.datasets).filter(([key]) => !['GetFeeds', 'GetCrawlStats'].includes(key))));
    result.observedWindow = result.datasets.GetRankAndTrafficStats?.observedWindow ?? null;
  } catch (error) { result.error = errorInfo(error); }
  result.freshness = freshness(result.observedWindow, now);
  return result;
}

function opportunities(google, config) {
  if (google.status === 'error') return [];
  const rows = google.datasets.current_page?.rows ?? [];
  return rows.filter(row => row.impressions >= config.minimumImpressions && row.position >= 3 && row.position <= 20 && row.ctr < 0.03)
    .slice(0, 10).map(row => ({ kind: 'review_search_snippet', source: 'google', page: row.page, impressions: row.impressions, clicks: row.clicks, ctr: row.ctr, position: row.position,
      rationale: 'Observed page has sufficient impressions, position 3–20 and CTR below 3%; review intent, title and snippet. This heuristic is not a forecast or ranking guarantee.' }));
}

function preserve(source, previous, now) {
  const retained = previous?.status === 'healthy' || previous?.status === 'no_data' ? previous : previous?.lastSuccessful;
  if (['error', 'partial'].includes(source.status) && retained && retained.site === source.site) {
    const { lastSuccessful, ...snapshot } = retained;
    source.lastSuccessful = { ...snapshot, stale: true, retainedAt: now.toISOString() };
  }
  return source;
}

async function readLatest(directory) {
  const filename = path.join(directory, 'latest.json');
  // Missing is different from unsafe/corrupt: do not overwrite an unreadable previous snapshot.
  try { await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const value = parseJson(await privateRead(filename));
  if (!object(value) || value.schemaVersion !== 1 || !object(value.sources) || typeof value.fetchedAt !== 'string') fail('invalid_report');
  return value;
}

export function renderMarkdown(report) {
  const lines = ['# SEO collection', '', `Fetched: ${report.fetchedAt}`, '', 'Source | Status | Latest observed | Retained snapshot', '--- | --- | --- | ---'];
  for (const [name, source] of Object.entries(report.sources)) {
    lines.push(`${name} | ${source.status} | ${source.freshness?.latestObservedAt ?? 'unavailable'} | ${source.lastSuccessful ? `stale (${source.lastSuccessful.fetchedAt})` : 'none'}`);
    const total = source.datasets?.current_total?.rows?.[0];
    if (total) lines.push('', `Google current period: ${source.requestedWindow.current.startDate} through ${source.requestedWindow.current.endDate} (PT, inclusive, final): ${total.clicks} clicks; ${total.impressions} impressions; CTR ${total.ctr}; position ${total.position}.`);
    const prior = source.datasets?.previous_total?.rows?.[0];
    if (prior) lines.push('', `Google previous period: ${source.requestedWindow.previous.startDate} through ${source.requestedWindow.previous.endDate} (PT, inclusive): ${prior.clicks} clicks; ${prior.impressions} impressions.`);
  }
  lines.push('', `Review candidates: ${report.opportunities.length}. Page/query details are private data in the JSON report; none are printed by this command.`, '',
    'Unavailable data is not zero. Failed datasets remain unavailable; retained snapshots are explicitly stale and never substituted into current analysis.',
    'Google exposes top rows, not exhaustive coverage. Bing uses provider-defined dates/periods; query/page updates are weekly and traffic includes multiple verticals. Do not compare windows or sum incompatible periods.', '');
  return lines.join('\n');
}

async function atomicWrite(directory, name, body) {
  await checkPath(directory);
  const target = path.join(directory, name);
  await checkPath(target, { missing: true });
  const tmp = path.join(directory, `.seo-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(tmp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(body); await handle.sync(); await handle.close(); handle = null;
    await fs.rename(tmp, target);
  } finally { await handle?.close(); await fs.unlink(tmp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

async function retain(directory, count, current) {
  const files = (await fs.readdir(directory)).filter(name => /^seo-\d{4}-\d\d-\d\dT[\d-]+Z-[a-f0-9-]+\.json$/.test(name)).sort().reverse();
  const kept = new Set([current, ...files.filter(name => name !== current).slice(0, count - 1)]);
  for (const file of files) {
    await checkPath(path.join(directory, file));
    if (!kept.has(file)) await fs.unlink(path.join(directory, file));
  }
}

export async function collect(config, deps = {}) {
  const now = deps.now ?? new Date();
  await privateDirectory(config.outputDirectory);
  const lock = path.join(config.outputDirectory, '.collector.lock');
  await checkPath(lock, { missing: true });
  let handle;
  try { handle = await fs.open(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) { throw new SeoError(error.code === 'EEXIST' ? 'collector_locked' : 'lock_failed'); }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() })); await handle.sync();
    const previous = await readLatest(config.outputDirectory);
    const request = transport(deps);
    const [google, bing] = await Promise.all([collectGoogle(config, request, now), collectBing(config, request, now)]);
    const report = { schemaVersion: 1, fetchedAt: now.toISOString(), sources: {
      google: preserve(google, previous?.sources.google, now), bing: preserve(bing, previous?.sources.bing, now) }, opportunities: opportunities(google, config) };
    const body = `${JSON.stringify(report, null, 2)}\n`;
    if (Buffer.byteLength(body) > MAX_REPORT) fail('report_too_large');
    const name = `seo-${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
    await atomicWrite(config.outputDirectory, name, body);
    // Publish Markdown first; latest.json is the authoritative commit point. Each file is atomic.
    await atomicWrite(config.outputDirectory, 'latest.md', renderMarkdown(report));
    await atomicWrite(config.outputDirectory, 'latest.json', body);
    const dir = await fs.open(config.outputDirectory, constants.O_RDONLY);
    try { await dir.sync(); } finally { await dir.close(); }
    await retain(config.outputDirectory, config.retention, name);
    return { report, filename: path.join(config.outputDirectory, name) };
  } finally { await handle.close(); await fs.unlink(lock); }
}

export async function status(config, now = new Date()) {
  await privateDirectory(config.outputDirectory);
  const report = await readLatest(config.outputDirectory);
  if (!report) return { status: 'no_report', report: path.join(config.outputDirectory, 'latest.json') };
  return { status: 'available', fetchedAt: report.fetchedAt,
    ageHours: Math.max(0, Math.floor((now.getTime() - Date.parse(report.fetchedAt)) / 3600000)),
    sources: Object.fromEntries(['google', 'bing'].map(name => [name, { status: report.sources[name]?.status ?? 'error',
      staleSnapshot: Boolean(report.sources[name]?.lastSuccessful), lastSuccessfulAt: report.sources[name]?.lastSuccessful?.fetchedAt ?? null }])),
    report: path.join(config.outputDirectory, 'latest.json'), summary: path.join(config.outputDirectory, 'latest.md') };
}

export async function main(args = process.argv.slice(2), env = process.env, deps = {}) {
  try {
    let filename = env.NORI_SEO_CONFIG, mode = 'collect';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--config' && args[i + 1] && !args[i + 1].startsWith('--')) filename = args[++i];
      else if (['--status', '--latest'].includes(args[i])) mode = 'status';
      else if (args[i] === '--help') {
        (deps.stdout ?? console.log)('Usage: node collect.mjs --config /private/runtime/seo/config.json [--status|--latest]. NORI_SEO_CONFIG is also supported. Status prints health and report paths only.');
        return 0;
      } else fail('invalid_arguments');
    }
    const config = await loadConfig(filename);
    if (mode === 'collect') await collect(config, deps);
    const health = await status(config, deps.now);
    (deps.stdout ?? console.log)(JSON.stringify(health));
    return mode === 'collect' && Object.values(health.sources ?? {}).some(source => ['error', 'partial'].includes(source.status)) ? 2 : 0;
  } catch (error) { (deps.stderr ?? console.error)(JSON.stringify({ status: 'error', error: errorInfo(error) })); return 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
