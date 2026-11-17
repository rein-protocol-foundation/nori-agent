import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPairSync, verify } from 'node:crypto';
import { BING_METHODS, bingRow, collect, loadConfig, main, serviceAssertion, status, transport, windows } from '../workspace/skills/nori-seo/scripts/collect.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const credentials = { type: 'service_account', client_email: 'seo@fixture.iam.gserviceaccount.com', private_key: pem,
  token_uri: 'https://attacker.invalid/do-not-use' };
const KEY = 'bing-secret-fixture-123456789';
const TOKEN = 'oauth-secret-fixture';
const NOW = new Date('2026-11-17T00:30:00Z'); // Still November 16 in Pacific time.
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });

async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'nori-seo-test-'));
  await fs.chmod(directory, 0o700);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'config.json');
  await fs.writeFile(filename, JSON.stringify({ pageSize: 2, maxPages: 2, retention: 2, ...overrides }), { mode: 0o600 });
  await fs.writeFile(path.join(directory, 'google-service-account.json'), JSON.stringify(credentials), { mode: 0o600 });
  await fs.writeFile(path.join(directory, 'bing-api-key.txt'), KEY, { mode: 0o600 });
  return { directory, filename, config: await loadConfig(filename) };
}

function mockNetwork({ empty = false, zero = false, failBing = null, failGoogle = null, allFail = false, metadata = false, pageRows = null } = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const u = new URL(url);
    if (allFail) throw new Error(`secret ${KEY} ${TOKEN} ${url}`);
    if (u.hostname === 'oauth2.googleapis.com') {
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      assert.equal(options.method, 'POST');
      return json({ access_token: TOKEN });
    }
    if (u.hostname === 'www.googleapis.com') {
      assert.equal(options.headers.authorization, `Bearer ${TOKEN}`);
      if (url.endsWith('/sitemaps')) return json(metadata ? { sitemap: [{ path: 'https://example.org/sitemap.xml', errors: '0' }] } : {});
      if (!url.endsWith('/query')) return json({ siteUrl: 'sc-domain:rein-protocol.org', permissionLevel: 'siteRestrictedUser' });
      const body = JSON.parse(options.body);
      if (failGoogle === (body.dimensions[0] ?? 'total')) return json({ secret: KEY }, 403);
      if (empty) return json({});
      const dimension = body.dimensions[0];
      const row = { clicks: zero ? 0 : 2, impressions: zero ? 0 : 200, ctr: zero ? 0 : 0.01, position: 8 };
      if (dimension === 'page' && pageRows) return json({ rows: pageRows(body) });
      if (dimension) row.keys = [dimension === 'date' ? body.endDate : dimension === 'page' ? 'https://rein-protocol.org/mission' : 'foundation mission'];
      return json({ rows: body.startRow ? [] : [row] });
    }
    assert.equal(u.hostname, 'ssl.bing.com');
    const method = u.pathname.split('/').at(-1);
    assert.ok(BING_METHODS.includes(method));
    assert.equal(options.method, 'GET');
    assert.equal(u.searchParams.get('apikey'), KEY);
    assert.equal(u.searchParams.get('siteUrl'), 'https://www.rein-protocol.org/');
    assert.deepEqual([...u.searchParams.keys()].sort(), ['apikey', 'siteUrl']);
    if (failBing === method) return json({ secret: KEY }, 403);
    if (empty && !(metadata && method === 'GetFeeds')) return json({ d: [] });
    if (method === 'GetFeeds') return json({ d: metadata ? [{ Url: 'https://example.org/sitemap.xml', Status: 'Success', UrlCount: 0 }] : [] });
    const row = { Date: '/Date(1794268800000-0800)/', Clicks: zero ? 0 : 3, Impressions: zero ? 0 : 123 };
    if (['GetPageStats', 'GetQueryStats'].includes(method)) { row.Query = method === 'GetPageStats' ? 'https://example.org/' : 'untrusted query'; row.AvgClickPosition = 7; row.AvgImpressionPosition = 8; }
    if (method === 'GetCrawlStats') row.InIndex = zero ? 0 : 11;
    return json({ d: [row] });
  };
  return { fetch, calls, sleep: async () => {}, now: NOW };
}

test('PT final windows are 28 inclusive dates and contiguous across DST/year boundaries', () => {
  assert.deepEqual(windows(NOW), { timezone: 'America/Los_Angeles', inclusive: true, dataState: 'final',
    current: { startDate: '2026-10-17', endDate: '2026-11-13' }, previous: { startDate: '2026-09-19', endDate: '2026-10-16' } });
  for (const date of ['2026-03-09T06:30:00Z', '2027-01-01T01:00:00Z']) {
    const result = windows(new Date(date));
    for (const key of ['current', 'previous']) assert.equal((Date.parse(result[key].endDate) - Date.parse(result[key].startDate)) / 86400000, 27);
    assert.equal(Date.parse(result.current.startDate) - Date.parse(result.previous.endDate), 86400000);
  }
});

test('service account assertion is signed, readonly and ignores credential token_uri', () => {
  const assertion = serviceAssertion(credentials, NOW);
  const [header, payload, signature] = assertion.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(claims.sub, undefined);
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')));
});

test('complete collection stores provenance, actual metrics, separate windows and bounded CLI output', async t => {
  const { config, filename } = await fixture(t);
  const net = mockNetwork();
  const output = [], errors = [];
  assert.equal(await main(['--config', filename], {}, { ...net, stdout: value => output.push(value), stderr: value => errors.push(value) }), 0);
  assert.deepEqual(errors, []);
  const health = JSON.parse(output[0]);
  assert.equal(health.sources.google.status, 'healthy');
  const body = await fs.readFile(health.report, 'utf8');
  const report = JSON.parse(body);
  assert.equal(report.sources.google.datasets.current_total.rows[0].impressions, 200);
  assert.equal(report.sources.google.comparison.clicks.change, 0);
  assert.equal(report.sources.bing.requestedWindow.mode, 'provider_defined');
  assert.equal(report.sources.bing.datasets.GetPageStats.rows[0].page, 'https://example.org/');
  assert.equal(report.sources.bing.datasets.GetQueryStats.cadence, 'weekly_update_period_unspecified');
  assert.equal(report.opportunities.length, 1);
  assert.ok(!body.includes(KEY) && !body.includes(TOKEN) && !body.includes(pem));
  assert.ok(!output[0].includes('foundation mission') && !output[0].includes('mission'));
  const googleBodies = net.calls.filter(call => call.url.endsWith('/query')).map(call => JSON.parse(call.body));
  assert.equal(googleBodies.length, 8);
  assert.ok(googleBodies.every(body => body.dataState === 'final' && body.type === 'web'));
  assert.deepEqual(new Set(googleBodies.map(body => body.dimensions.join())), new Set(['', 'date', 'page', 'query']));
  assert.equal((await fs.stat(config.outputDirectory)).mode & 0o777, 0o700);
  for (const name of await fs.readdir(config.outputDirectory)) assert.equal((await fs.stat(path.join(config.outputDirectory, name))).mode & 0o777, 0o600);
});

test('successful empty analytics remain no_data even with sitemap/feed inventory', async t => {
  const { config } = await fixture(t);
  const { report } = await collect(config, mockNetwork({ empty: true, metadata: true }));
  for (const name of ['google', 'bing']) {
    assert.equal(report.sources[name].status, 'no_data');
    assert.equal(report.sources[name].performanceDataStatus, 'no_data');
    assert.equal(report.sources[name].observedWindow, null);
  }
  assert.equal(report.sources.google.datasets.current_total.rows.length, 0);
  assert.equal(report.sources.google.comparison, null);
  assert.equal(report.opportunities.length, 0);
});

test('actual returned zeros are preserved; missing crawl fields stay null', async t => {
  const { config } = await fixture(t);
  const { report } = await collect(config, mockNetwork({ zero: true }));
  assert.equal(report.sources.google.status, 'healthy');
  assert.equal(report.sources.google.datasets.current_total.rows[0].clicks, 0);
  assert.equal(report.sources.google.comparison.clicks.percentChange, null);
  assert.equal(report.sources.bing.datasets.GetRankAndTrafficStats.rows[0].impressions, 0);
  assert.equal(report.sources.bing.datasets.GetRankAndTrafficStats.rows[0].ctr, null);
  assert.equal(report.sources.bing.datasets.GetCrawlStats.rows[0].Code2xx, null);
  assert.equal(report.sources.bing.datasets.GetCrawlStats.rows[0].InIndex, 0);
  assert.equal(report.opportunities.length, 0);
});

test('GSC pagination advances startRow and signals a reached local bound', async t => {
  const { config } = await fixture(t);
  const row = i => ({ keys: [`https://example.org/${i}`], clicks: 1, impressions: 100, ctr: 0.01, position: 10 });
  const net = mockNetwork({ pageRows: body => [row(body.startRow), row(body.startRow + 1)] });
  const { report } = await collect(config, net);
  assert.equal(report.sources.google.status, 'partial');
  assert.equal(report.sources.google.datasets.current_page.truncated, true);
  assert.equal(report.sources.google.datasets.current_page.rows.length, 4);
  const pages = net.calls.filter(call => call.body?.startsWith('{')).map(call => JSON.parse(call.body)).filter(body => body.dimensions[0] === 'page');
  assert.deepEqual(pages.map(body => body.startRow), [0, 2, 0, 2]);
});

test('partial and failed sources retain the original successful snapshot without replacing current data', async t => {
  const { config } = await fixture(t);
  await collect(config, mockNetwork());
  const next = { ...mockNetwork({ failBing: 'GetQueryStats', failGoogle: 'page' }), now: new Date('2026-11-18T00:30:00Z') };
  const { report } = await collect(config, next);
  for (const name of ['google', 'bing']) {
    assert.equal(report.sources[name].status, 'partial');
    assert.equal(report.sources[name].lastSuccessful.stale, true);
    assert.equal(report.sources[name].lastSuccessful.fetchedAt, NOW.toISOString());
  }
  assert.equal(report.sources.google.datasets.current_page.status, 'error');
  assert.equal(report.sources.google.datasets.current_page.rows, undefined);
  assert.equal(report.opportunities.length, 0);
  const failed = await collect(config, { ...mockNetwork({ allFail: true }), now: new Date('2026-11-19T00:30:00Z') });
  assert.equal(failed.report.sources.google.status, 'error');
  assert.equal(failed.report.sources.google.lastSuccessful.fetchedAt, NOW.toISOString());
  assert.equal(failed.report.sources.google.lastSuccessful.lastSuccessful, undefined);
  assert.equal((await fs.readdir(config.outputDirectory)).filter(name => name.startsWith('seo-')).length, 2);
});

test('failures are redacted in CLI and stored reports, including URL-containing network errors', async t => {
  const { config, filename } = await fixture(t);
  const output = [], errors = [];
  const code = await main(['--config', filename], {}, { ...mockNetwork({ allFail: true }), stdout: v => output.push(v), stderr: v => errors.push(v) });
  assert.equal(code, 2);
  const report = await fs.readFile(path.join(config.outputDirectory, 'latest.json'), 'utf8');
  const combined = JSON.stringify([output, errors, report]);
  assert.ok(!combined.includes(KEY) && !combined.includes(TOKEN) && !combined.includes('attacker'));
  assert.ok(combined.includes('network_error'));
  const http = await collect(config, mockNetwork({ failBing: 'GetFeeds' }));
  assert.deepEqual(http.report.sources.bing.datasets.GetFeeds.error, { code: 'http_error', httpStatus: 403 });
});

test('transport retries only bounded transient responses, caps retry-after and refuses redirect/endpoints', async () => {
  let count = 0; const delays = [];
  const request = transport({ fetch: async () => { count++; return count === 1 ? json({}, 429, { 'retry-after': '600' }) : count === 2 ? json({}, 503) : json({ access_token: 'ok' }); }, sleep: async ms => delays.push(ms) });
  assert.deepEqual(await request('https://oauth2.googleapis.com/token', { method: 'POST' }), { access_token: 'ok' });
  assert.equal(count, 3); assert.deepEqual(delays, [5000, 500]);
  await assert.rejects(request('https://evil.invalid/token', { method: 'POST' }), { code: 'endpoint_forbidden' });
  await assert.rejects(request('https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=x&siteUrl=y'), { code: 'endpoint_forbidden' });
  const redirect = transport({ fetch: async (_url, options) => { assert.equal(options.redirect, 'error'); return json({}, 302, { location: 'https://evil.invalid/' }); } });
  await assert.rejects(redirect('https://oauth2.googleapis.com/token', { method: 'POST' }), { code: 'redirect_forbidden' });
  let denied = 0;
  await assert.rejects(transport({ fetch: async () => { denied++; return json({ secret: KEY }, 403); } })('https://oauth2.googleapis.com/token', { method: 'POST' }), { code: 'http_error', httpStatus: 403 });
  assert.equal(denied, 1);
});

test('timeouts are bounded, and oversized or malformed responses fail safely', async () => {
  let attempts = 0;
  const timeout = transport({ timeoutMs: 5, sleep: async () => {}, fetch: async (_url, options) => {
    attempts++;
    return await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error(KEY)), { once: true }));
  } });
  await assert.rejects(timeout('https://oauth2.googleapis.com/token', { method: 'POST' }), { code: 'request_timeout' });
  assert.equal(attempts, 3);
  await assert.rejects(transport({ maxDurationMs: 0, fetch: async () => assert.fail('expired collection performed network request') })('https://oauth2.googleapis.com/token', { method: 'POST' }), { code: 'collection_timeout' });
  await assert.rejects(transport({ fetch: async () => new Response('{bad secret') })('https://oauth2.googleapis.com/token', { method: 'POST' }), { code: 'invalid_json' });
  await assert.rejects(transport({ fetch: async () => new Response('x'.repeat(8 * 1024 * 1024 + 1)) })('https://oauth2.googleapis.com/token', { method: 'POST' }), { code: 'response_too_large' });
});

test('config and credentials reject insecure permissions, symlinks, hardlinks and custom endpoints', async t => {
  const { config, filename, directory } = await fixture(t);
  await fs.chmod(filename, 0o644);
  await assert.rejects(loadConfig(filename), { code: 'unsafe_file_permissions' });
  await fs.chmod(filename, 0o600);
  const link = path.join(directory, 'alias.json');
  await fs.symlink(filename, link);
  await assert.rejects(loadConfig(link), { code: 'symlink_path' });
  const aliasDir = path.join(directory, 'aliased-directory');
  await fs.symlink(directory, aliasDir);
  await assert.rejects(loadConfig(path.join(aliasDir, 'config.json')), { code: 'symlink_path' });
  await fs.writeFile(filename, JSON.stringify({ tokenUrl: 'https://evil.invalid/' }));
  await assert.rejects(loadConfig(filename), { code: 'unknown_config_field' });
  await fs.writeFile(filename, JSON.stringify({ googleSite: 'sc-domain:../evil' }));
  await assert.rejects(loadConfig(filename), { code: 'invalid_site' });
  await fs.writeFile(filename, JSON.stringify({ bingSite: 'https://user:pass@example.org/' }));
  await assert.rejects(loadConfig(filename), { code: 'invalid_site' });
  await fs.writeFile(filename, JSON.stringify({ outputDirectory: 'workspace/skills/nori-seo/private' }));
  await assert.rejects(loadConfig(filename), { code: 'shared_skill_storage_forbidden' });
  await fs.chmod(config.googleCredentialsFile, 0o644);
  const { report } = await collect(config, mockNetwork());
  assert.equal(report.sources.google.error.code, 'unsafe_file_permissions');
  await fs.chmod(config.googleCredentialsFile, 0o600);
  await fs.link(config.bingApiKeyFile, path.join(directory, 'key-copy'));
  const linked = await collect(config, mockNetwork());
  assert.equal(linked.report.sources.bing.error.code, 'unsafe_file_permissions');
});

test('output permissions/symlink targets are refused and previous latest remains intact on write failure', async t => {
  const { config, directory } = await fixture(t);
  await fs.mkdir(config.outputDirectory, { mode: 0o755 });
  await assert.rejects(collect(config, mockNetwork()), { code: 'unsafe_directory_permissions' });
  await fs.chmod(config.outputDirectory, 0o700);
  await collect(config, mockNetwork());
  const before = await fs.readFile(path.join(config.outputDirectory, 'latest.json'), 'utf8');
  await fs.unlink(path.join(config.outputDirectory, 'latest.md'));
  const external = path.join(directory, 'external');
  await fs.writeFile(external, 'untouched', { mode: 0o600 });
  await fs.symlink(external, path.join(config.outputDirectory, 'latest.md'));
  await assert.rejects(collect(config, mockNetwork()), { code: 'symlink_path' });
  assert.equal(await fs.readFile(path.join(config.outputDirectory, 'latest.json'), 'utf8'), before);
  assert.equal(await fs.readFile(external, 'utf8'), 'untouched');
  assert.ok(!(await fs.readdir(config.outputDirectory)).some(name => name.endsWith('.tmp') || name === '.collector.lock'));
});

test('concurrent collectors are excluded; active lock is retained; released after collection', async t => {
  const { config } = await fixture(t);
  const net = mockNetwork();
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const pending = collect(config, { ...net, fetch: async (url, options) => { if (url.includes('oauth2')) { entered(); await blocked; } return net.fetch(url, options); } });
  await ready;
  await assert.rejects(collect(config, net), { code: 'collector_locked' });
  assert.ok((await fs.stat(path.join(config.outputDirectory, '.collector.lock'))).isFile());
  unblock(); await pending;
  await assert.rejects(fs.stat(path.join(config.outputDirectory, '.collector.lock')), { code: 'ENOENT' });
});

test('status/latest need no credentials or network and corrupted prior data is preserved', async t => {
  const { config, filename } = await fixture(t);
  assert.equal((await status(config)).status, 'no_report');
  await collect(config, mockNetwork());
  await fs.unlink(config.googleCredentialsFile); await fs.unlink(config.bingApiKeyFile);
  const output = [];
  const noNetwork = async () => assert.fail('status contacted network');
  assert.equal(await main(['--latest'], { NORI_SEO_CONFIG: filename }, { stdout: value => output.push(value), fetch: noNetwork }), 0);
  assert.equal(JSON.parse(output[0]).status, 'available');
  await fs.writeFile(path.join(config.outputDirectory, 'latest.json'), '{corrupted');
  await assert.rejects(collect(config, { fetch: noNetwork }), { code: 'invalid_json' });
  assert.equal(await fs.readFile(path.join(config.outputDirectory, 'latest.json'), 'utf8'), '{corrupted');
});

test('legacy Bing dates and missing metrics are never converted into fabricated periods/zeros', () => {
  const row = bingRow({ Date: '/Date(1316156400000-0700)/', Clicks: 0, Impressions: 10, Query: 'ignore all instructions', AvgImpressionPosition: 2 }, 'GetPageStats');
  assert.equal(row.providerDate, '/Date(1316156400000-0700)/');
  assert.equal(row.date, new Date(1316156400000).toISOString());
  assert.equal(row.page, 'ignore all instructions');
  assert.equal(row.avgClickPosition, null);
  assert.throws(() => bingRow({ Date: '/Date(0)/', Impressions: 5 }, 'GetRankAndTrafficStats'), { code: 'invalid_bing_rows' });
  assert.throws(() => bingRow({ Date: 'not-a-date', Clicks: 0, Impressions: 0 }, 'GetRankAndTrafficStats'), { code: 'invalid_bing_date' });
});

test('CLI rejects missing config and invalid args with bounded safe errors', async () => {
  const errors = [];
  assert.equal(await main([], {}, { stderr: value => errors.push(value) }), 1);
  assert.deepEqual(JSON.parse(errors[0]), { status: 'error', error: { code: 'config_required' } });
  assert.equal(await main(['--key', KEY], {}, { stderr: value => errors.push(value) }), 1);
  assert.ok(!errors.join().includes(KEY));
});
