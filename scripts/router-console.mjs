import { createServer } from 'node:http';
import { createServer as createSocketServer, createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { magpiePaths, projectRoot, verifyMagpieInstallation } from './magpie-dependency.mjs';
import { disableMagpieAutoUpdate } from './magpie-ui.mjs';
import { acquireManagedProfileLock, buildManagedEnvironment, ensureManagedDirectories } from '../plugins/rein-router/managed-gateway.mjs';
import { stopOwnedProcessTree } from '../plugins/rein-router/process-tree.mjs';
import { createConsoleSync } from './router-console-sync.mjs';

const assets = new URL('../plugins/rein-router/console/', import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeError = e => /^(?:router_|magpie_|rein_magpie_)[a-z_]+$/.test(e?.message ?? '') ? e.message : 'router_console_unavailable';
export async function boundedBody(stream, max = 4 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length; if (size > max) throw new Error('router_response_too_large'); chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function listen(server, port = 0) {
  await new Promise((ok, no) => { server.once('error', no); server.listen(port, '127.0.0.1', () => { server.off('error', no); ok(); }); });
  return server.address().port;
}
export async function nativeClient(origin, secret) {
  const port = new URL(origin).port;
  return async (path, body) => {
    const response = await fetch(new URL(path, origin), { method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: `magpie_web_${port}=${secret}`, Origin: origin, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('router_magpie_api_failed');
    return JSON.parse((await boundedBody(response.body)).toString('utf8'));
  };
}

/** Decorate upstream's page through its public kernel; do not patch its source or assets. */
export function decorateMagpieHtml(html, { initialView = '' } = {}) {
  const appTag = /<script src="app\.js(?:\?[^"<>]*)?"><\/script>/;
  const startTag = /<script src="start\.js(?:\?[^"<>]*)?"><\/script>/;
  const kernelTag = /<script src="kernel\.js(?:\?[^"<>]*)?"><\/script>/;
  if (!appTag.test(html) || !startTag.test(html) || !kernelTag.test(html) ||
      html.search(kernelTag) > html.search(appTag) || html.search(appTag) > html.search(startTag) ||
      !html.includes('<html') || !html.includes('<body>') || !html.includes('<head>') || !html.includes('</head>') ||
      !html.includes('data-view="providers"') || !html.includes('<button data-view="routing"') ||
      !html.includes('<template data-slot="page"')) throw new Error('router_magpie_ui_incompatible');
  const nav = '<button data-view="rein-router"><svg class="nav-ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 10h5l4-5h5M8 10l4 5h5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span data-t>OpenClaw Router</span></button>';
  // Classic script execution order stays upstream-owned. Preloads remove the
  // request waterfall without changing those scripts to async/defer or bundling them.
  const scripts = [...html.matchAll(/<script src="([a-zA-Z0-9_./?=&%-]+)"><\/script>/g)]
    .map(match => match[1]).filter(src => !src.startsWith('//') && !src.includes('..'));
  const preloads = [...new Set([...scripts, '/_rein/boot.js', '/_rein/router.js'])]
    .map(src => `<link rel="preload" as="script" href="${src.replaceAll('&', '&amp;')}">`).join('');
  const critical = `<style>
html[data-rein-boot] body>:not(#rein-boot){visibility:hidden!important}
#rein-boot{position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;gap:16px;padding:32px;background:#f3f4f5;color:#253e33;font:14px/1.7 "Avenir Next","PingFang SC",sans-serif}
#rein-boot strong{font-size:28px;font-weight:500;letter-spacing:-.6px}#rein-boot p{margin:0;color:#5c6a60}#rein-boot a{color:#253e33}#rein-boot a[hidden]{display:none}
</style>`;
  const boot = `<section id="rein-boot" data-target="${initialView === 'rein-router' ? 'rein-router' : ''}" aria-label="Magpie 加载状态"><strong>Magpie</strong><p role="status">正在打开${initialView === 'rein-router' ? ' OpenClaw Router' : '配置页面'}…</p><a href="" hidden>重新加载</a><noscript>请启用 JavaScript 后重新加载此页面。</noscript></section><script src="/_rein/boot.js"></script>`;
  return html.replace('<html', '<html data-rein-boot')
    .replace('<head>', '<head>' + critical + preloads)
    .replace('</head>', '<link rel="stylesheet" href="/_rein/router.css"></head>')
    .replace('<body>', '<body>' + boot)
    .replace('<button data-view="routing"', nav + '<button data-view="routing"')
    .replace(appTag, tag => '<script src="/_rein/router.js"></script>' + tag)
    .replace(startTag, tag => tag + '<script>document.documentElement.setAttribute("data-rein-started", "");</script>');
}

export async function createConsoleServer({ sync, nativeOrigin, nativeSecret, port = 0, token = randomBytes(24).toString('hex') }) {
  const css = await readFile(new URL('router.css', assets)), js = await readFile(new URL('router.js', assets)), boot = await readFile(new URL('boot.js', assets));
  let origin, cookie;
  const same = value => typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
  const server = createServer(async (req, res) => {
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.headers.host !== new URL(origin).host) return reply(403, { error: 'router_host_denied' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/' && same(url.searchParams.get('k'))) {
        res.setHeader('Set-Cookie', `${cookie}=${token}; Path=/; HttpOnly; SameSite=Strict`);
        res.writeHead(303, { Location: '/?view=rein-router' }); return res.end();
      }
      if (!req.headers.cookie?.split(';').some(v => { const [name, value] = v.trim().split('='); return name === cookie && same(value); }))
        return reply(401, { error: 'router_sign_in_required' });
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin) ||
          (req.method !== 'GET' && req.headers.origin !== origin)) return reply(403, { error: 'router_origin_denied' });
      if (url.pathname === '/_rein/router.css' || url.pathname === '/_rein/router.js' || url.pathname === '/_rein/boot.js') {
        res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
        return res.end(url.pathname.endsWith('.css') ? css : url.pathname.endsWith('/boot.js') ? boot : js);
      }
      if (url.pathname === '/_rein/api/state' && req.method === 'GET') return reply(200, await sync.view());
      if (url.pathname === '/_rein/api/jev-key/reveal' && req.method === 'POST') return reply(200, await sync.revealJevKey());
      if (url.pathname === '/_rein/api/refresh' && req.method === 'POST') return reply(200, await sync.refresh());
      if (url.pathname === '/_rein/api/settings' && req.method === 'POST') {
        const body = JSON.parse((await boundedBody(req, 64 * 1024)).toString('utf8'));
        return reply(200, await sync.save(body.settings, body.jevApiKey));
      }
      if (url.pathname.startsWith('/_rein/')) return reply(404, { error: 'router_not_found' });
      // Updates remain a reviewed repository operation, never a UI binary replacement.
      if (url.pathname.startsWith('/api/update/') && req.method !== 'GET') return reply(409, { error: 'router_magpie_version_pinned' });
      const native = new URL(req.url, nativeOrigin);
      const headers = { Cookie: `magpie_web_${new URL(nativeOrigin).port}=${nativeSecret}`, Origin: nativeOrigin,
        'Content-Type': req.headers['content-type'] ?? 'application/json', 'Accept-Encoding': 'identity' };
      const response = await fetch(native, { method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(30000),
        ...(['GET','HEAD'].includes(req.method) ? {} : { body: await boundedBody(req, 8 * 1024 * 1024) }) });
      const bytes = await boundedBody(response.body, 32 * 1024 * 1024);
      const type = response.headers.get('content-type') ?? 'application/octet-stream';
      res.statusCode = response.status; res.setHeader('Content-Type', type);
      if (response.headers.get('location')?.startsWith('/')) res.setHeader('Location', response.headers.get('location'));
      if (type.includes('text/html') && url.pathname === '/') res.end(decorateMagpieHtml(bytes.toString('utf8'), { initialView: url.searchParams.get('view') }));
      else res.end(bytes);
      if (req.method === 'POST' && response.ok) void sync.refresh().catch(() => {});
    } catch (e) { if (!res.headersSent) reply(400, { error: safeError(e) }); else res.end(); }
  });
  const actual = await listen(server, port); origin = `http://127.0.0.1:${actual}`; cookie = `rein_router_${actual}`;
  const timer = setInterval(() => { void sync.refresh().catch(() => {}); }, 5000); timer.unref();
  return { server, origin, link: `${origin}/?k=${token}`, close: async () => {
    clearInterval(timer); server.closeAllConnections(); await new Promise(r => server.close(r));
  } };
}

async function occupied(port) {
  return new Promise(resolveOccupied => {
    const s = createConnection({ host: '127.0.0.1', port });
    const done = value => { s.destroy(); resolveOccupied(value); };
    s.once('connect', () => done(true)); s.once('error', e => done(e.code !== 'ECONNREFUSED')); s.setTimeout(300, () => done(true));
  });
}

export async function runRouterConsole({ root = projectRoot, noOpen = false, port = 3431, gatewayPort = 3425,
  environment = process.env, onReady } = {}) {
  let child, web, sync, stopping, release, requestedSignal, finish, childClosed = false;
  const finished = new Promise(resolveDone => { finish = resolveDone; });
  const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
    requestedSignal ??= signal; finish();
  }]));
  const assertRunning = () => { if (requestedSignal) throw new Error('router_console_interrupted'); };
  const stop = () => stopping ??= (async () => {
    await web?.close();
    await sync?.close().catch(() => {});
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const result = await stopOwnedProcessTree(child); if (!result.complete) throw new Error('router_console_cleanup_required');
    } else if (child?.pid && await occupied(gatewayPort)) throw new Error('router_console_cleanup_required');
    await release?.();
  })();
  // Latch termination before any asynchronous setup can acquire a lock or start a detached child.
  for (const [signal, handler] of handlers) process.on(signal, handler);
  try {
    const installation = await verifyMagpieInstallation({ root }); assertRunning();
    const paths = magpiePaths(root), base = `http://127.0.0.1:${gatewayPort}/v1`;
    const env = buildManagedEnvironment({ homeDir: paths.homeDir, baseUrl: base, environment, allowSubscriptionAccounts: true });
    await ensureManagedDirectories(env); assertRunning();
    release = await acquireManagedProfileLock(paths.homeDir); assertRunning();
    if (await occupied(gatewayPort)) throw new Error('router_magpie_port_in_use');
    assertRunning();
    await disableMagpieAutoUpdate(installation.binaryPath, { cwd: paths.homeDir, env }); assertRunning();
    const probe = createSocketServer(); const nativePort = await listen(probe); await new Promise(r => probe.close(r)); assertRunning();
    const nativeSecret = randomBytes(24).toString('hex'), nativeOrigin = `http://127.0.0.1:${nativePort}`;
    child = spawn(installation.binaryPath, ['web', '--gateway', '--no-open', '--addr', `127.0.0.1:${nativePort}`], {
      cwd: paths.homeDir, env: { ...env, MAGPIE_WEB_KEY: nativeSecret }, detached: process.platform !== 'win32', stdio: ['ignore','ignore','ignore'], shell: false,
    });
    let startError; child.once('error', e => { startError = e; });
    child.once('close', () => { childClosed = true; finish(); });
    const native = await nativeClient(nativeOrigin, nativeSecret);
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assertRunning();
      if (startError || childClosed || child.exitCode !== null || child.signalCode !== null) throw new Error('router_magpie_start_failed');
      try { await native('/api/providers'); ready = true; break; } catch { assertRunning(); await sleep(100); }
    }
    assertRunning();
    if (!ready) throw new Error('router_magpie_start_timeout');
    sync = createConsoleSync({ root, native, gatewayBaseUrl: base });
    try { await sync.init(); } catch { /* Persisted errors are displayed in the UI; never unblock its key. */ }
    assertRunning();
    web = await createConsoleServer({ sync, nativeOrigin, nativeSecret, port });
    assertRunning();
    if (onReady) await onReady({ origin: web.origin, token: new URL(web.link).searchParams.get('k') });
    else console.log(`OpenClaw Router: ${web.link}\nMagpie owns providers and models. Keep this terminal open. Ctrl-C stops this gateway.`);
    if (!noOpen) {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
      const opened = spawn(command, process.platform === 'win32' ? ['url.dll,FileProtocolHandler', web.link] : [web.link], { stdio: 'ignore', shell: false });
      opened.on('error', () => {});
    }
    await finished;
  } catch (e) { if (!requestedSignal) throw e; }
  finally {
    // Repeated signals must not bypass key revocation, process reaping or lock release.
    try { await stop(); }
    finally { for (const [signal, handler] of handlers) process.off(signal, handler); }
  }
  return requestedSignal === 'SIGINT' ? 130 : requestedSignal === 'SIGTERM' ? 143 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(v => v !== '--no-open') || args.length > 1) throw new Error('router_arguments_invalid');
    process.exitCode = await runRouterConsole({ noOpen: args.includes('--no-open') });
  } catch (e) { console.error(safeError(e)); process.exitCode = 1; }
}
