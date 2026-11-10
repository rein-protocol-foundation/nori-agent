// Hermetic OCI acceptance of the real OpenClaw provider hooks + pinned Magpie gateway.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as socketServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { root, upstream } from './runtime-env.mjs';
import { magpieBuildEnvironment } from './magpie-dependency.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';
import lock from '../plugins/rein-router/magpie.lock.json' with { type: 'json' };
const source = resolve(process.argv[2] ?? join(root, '.toolchain/magpie'));
assert.equal(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).stdout.trim(), lock.revision);
assert.equal(spawnSync('git', ['diff', '--quiet', 'HEAD'], { cwd: source }).status, 0);
const temp = mkdtempSync(join(tmpdir(), 'nori-scoped-routing-'));
const requests = [], children = [];
let nativeOutput = '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const marker = body => JSON.stringify(body.messages?.findLast(message => message.role === 'user' && /CASE_[A-Z_]+/.test(JSON.stringify(message.content)))).match(/CASE_[A-Z_]+/)?.[0];
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: ['openai', 'claude', 'google', 'bailian', 'payg'].map(id => ({ id })) })); return; }
  let text = ''; for await (const chunk of req) text += chunk;
  const body = JSON.parse(text), name = marker(body);
  requests.push({ model: body.model, marker: name, maxTokens: body.max_tokens ?? body.max_completion_tokens });
  if ((name === 'CASE_COMMUNITY_FAILURE' && body.model.startsWith('claude')) || name === 'CASE_COMMUNITY_EMPTY') {
    res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: '503 synthetic upstream unavailable' } })); return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model: body.model,
    choices: [{ index: 0, delta: { role: 'assistant', content: `OK ${name}` }, finish_reason: null }] };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.write(`data: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const helper = join(source, `.rein-scoped-probe-${process.pid}`); mkdirSync(helper);
  const binary = join(temp, 'magpie-probe');
  try {
    writeFileSync(join(helper, 'main.go'), readFileSync(join(root, 'tests/fixtures/magpie-gateway.go')));
    const built = spawnSync('go', ['build', '-mod=readonly', '-tags', 'nogui', '-o', binary, `./.rein-scoped-probe-${process.pid}`],
      { cwd: source, env: magpieBuildEnvironment(root), encoding: 'utf8', timeout: 600000 });
    assert.equal(built.status, 0, built.stderr);
  } finally { rmSync(helper, { recursive: true, force: true }); }
  const magpie = spawn(binary, ['-upstream', `http://127.0.0.1:${server.address().port}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(magpie); let readyText = '';
  magpie.stdout.on('data', bytes => { readyText += bytes; }); magpie.stderr.resume();
  const readyDeadline = Date.now() + 15000;
  while (!readyText.includes('\n') && Date.now() < readyDeadline && magpie.exitCode === null) await delay(100);
  const line = readyText.split('\n').find(line => line.startsWith('REIN_MAGPIE_FIXTURE_READY '));
  assert.ok(line, 'isolated Magpie fixture did not start');
  const ready = JSON.parse(line.slice('REIN_MAGPIE_FIXTURE_READY '.length));
  const router = { enabled: true, gateway: { baseUrl: ready.baseUrl, apiKeyEnvVar: 'REIN_SCOPED_PROBE_KEY' },
    routes: ['openai', 'claude', 'google'].map(id => ({ id, provider: 'Synthetic fixture', gatewayModel: `rein-fixture-${id}/${id}`,
      gatewayKeyEnvVar: `REIN_SCOPED_${id.toUpperCase()}`, billingMode: 'subscription', billingVerified: true,
      billingSource: 'Synthetic fixture', effort: 'medium', purpose: 'Hermetic probe', contextWindow: 32768, maxTokens: 512 })),
    defaultRoute: 'openai', fallbackRoutes: [], decision: { allowPaidJev: false }, scopedPolicies: {
      main: { allowedRoutes: ['openai', 'claude'], allowPaidUsage: false, default: { primary: 'openai', fallbacks: ['claude'] },
        platforms: { slack: { primary: 'openai' } }, origins: [{ platform: 'slack', accountId: 'default', workspaceId: 'T0123456ABC', channelIds: ['C0123456ABC'] }],
        maxOutputTokens: 512, requestTimeoutMs: 30000 },
      'nori-community': { allowedRoutes: ['google', 'claude'], allowPaidUsage: false, default: { primary: 'google', fallbacks: [] },
        platforms: { discord: { primary: 'claude' } },
        channels: [{ platform: 'discord', accountId: 'default', workspaceId: '100000000000000001', channelId: '100000000000000002', primary: 'google', fallbacks: [] }],
        origins: [{ platform: 'discord', accountId: 'default', workspaceId: '100000000000000001', channelIds: ['100000000000000002', '100000000000000004'] }],
        maxOutputTokens: 512, requestTimeoutMs: 30000,
        usageLimits: { perUserPerMinute: 20, perConversationPerMinute: 30, perUserConcurrent: 1, perConversationConcurrent: 1, maxConcurrent: 1, maxGatewayRequestsPerDay: 100 } },
    } };
  // Keep each preference internally consistent; platform override adds the reverse fallback.
  router.scopedPolicies['nori-community'].default.fallbacks = [];
  router.scopedPolicies['nori-community'].platforms.discord.fallbacks = ['google'];
  router.scopedPolicies['nori-budget-probe'] = {
    ...structuredClone(router.scopedPolicies['nori-community']), platforms: {}, channels: [],
    origins: [{ platform: 'discord', accountId: 'default', workspaceId: '100000000000000001', channelIds: ['100000000000000006'] }],
    usageLimits: { perUserPerMinute: 5, perConversationPerMinute: 5, perUserConcurrent: 1,
      perConversationConcurrent: 1, maxConcurrent: 1, maxGatewayRequestsPerDay: 1 },
  };
  const cfg = buildOpenClawFragment(router, join(root, 'plugins/rein-router'));
  const reserved = socketServer(); await new Promise(resolve => reserved.listen(0, '127.0.0.1', resolve));
  const port = reserved.address().port; await new Promise(resolve => reserved.close(resolve));
  cfg.gateway = { mode: 'local', bind: 'loopback', port, auth: { mode: 'token', token: 'synthetic-scoped-probe-token' } };
  const workspace = join(temp, 'workspace'); mkdirSync(workspace);
  Object.assign(cfg.agents.defaults, { workspace, skipBootstrap: true, timeoutSeconds: 60, compaction: { memoryFlush: { enabled: false } } });
  cfg.agents.entries = Object.fromEntries(['main', 'nori-community', 'nori-budget-probe'].map(id => [id, { workspace, model: { primary: 'rein-magpie/auto', fallbacks: [] } }]));
  cfg.agents.ownership = 'explicit';
  cfg.bindings = [
    { agentId: 'main', match: { channel: 'slack', accountId: 'default' } },
    { agentId: 'nori-community', match: { channel: 'discord', accountId: 'default' } },
    { agentId: 'nori-budget-probe', match: { channel: 'discord', accountId: 'default', peer: { kind: 'channel', id: '100000000000000006' } } },
  ];
  cfg.memory = { search: { enabled: false, rememberAcrossConversations: false } };
  cfg.tools = { allow: [] }; cfg.channels = { slack: { enabled: true }, discord: { enabled: true } };
  const fixture = join(temp, 'fixture'); mkdirSync(fixture);
  writeFileSync(join(fixture, 'index.ts'), readFileSync(join(root, 'tests/fixtures/scoped-routing-gateway.ts')));
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'rein-scoped-probe', type: 'module', openclaw: { extensions: ['./index.ts'] } }));
  writeFileSync(join(fixture, 'openclaw.plugin.json'), JSON.stringify({ id: 'rein-scoped-probe', name: 'Synthetic M0 probe', channels: ['slack', 'discord'],
    configSchema: { type: 'object', properties: {}, additionalProperties: false } }));
  symlinkSync(join(root, 'plugins/rein-router/node_modules'), join(fixture, 'node_modules'));
  cfg.plugins.allow.push('rein-scoped-probe', 'openai'); cfg.plugins.load.paths.push(fixture);
  Object.assign(cfg.plugins.entries, { slack: { enabled: false }, discord: { enabled: false }, 'rein-scoped-probe': { enabled: true, hooks: { allowConversationAccess: true } } });
  const state = join(temp, 'state'), home = join(temp, 'home'); mkdirSync(state); mkdirSync(home);
  for (const id of ['main', 'nori-community', 'nori-budget-probe']) {
    const agentDir = join(state, 'agents', id, 'agent'); mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ retry: { provider: { maxRetries: 0 } } }));
  }
  const configPath = join(temp, 'openclaw.json'), evidence = join(temp, 'evidence.json'); writeFileSync(configPath, JSON.stringify(cfg));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|LANG|LC_[A-Z_]+|TZ|TERM)$/.test(key)));
  Object.assign(env, { PATH: join(root, '.toolchain/node_modules/.bin') + delimiter + env.PATH,
    HOME: home, USERPROFILE: home, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configPath,
    REIN_SCOPED_PROBE_KEY: ready.apiKey, REIN_SCOPED_EVIDENCE: evidence, REIN_SCOPED_CONTEXTS: join(temp, 'contexts.jsonl'), OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BUNDLED_DOCTOR: '1' });
  for (const id of ['openai', 'claude', 'google']) env[`REIN_SCOPED_${id.toUpperCase()}`] = ready.routeKeys[`rein-fixture-${id}/${id}`];
  const native = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'gateway', 'run', '--allow-unconfigured'],
    { cwd: temp, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(native);
  const capture = bytes => { if (nativeOutput.length < 256000) nativeOutput += bytes; };
  native.stdout.on('data', capture); native.stderr.on('data', capture);
  const deadline = Date.now() + 180000;
  while (!existsSync(evidence) && native.exitCode === null && Date.now() < deadline) await delay(250);
  assert.ok(existsSync(evidence), `native fixture did not finish: ${nativeOutput.slice(-8000)}`);
  const report = JSON.parse(readFileSync(evidence));
  const contexts = readFileSync(join(temp, 'contexts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(report.failures, [], JSON.stringify({ report, output: nativeOutput.slice(-16000) }));
  for (const expected of ['CASE_SLACK', 'CASE_COMMUNITY_OVERRIDE', 'CASE_COMMUNITY_PLATFORM', 'CASE_COMMUNITY_FAILURE'])
    assert.ok(report.sent.some(reply => reply.marker === expected && reply.text.includes(`OK ${expected}`)), JSON.stringify({ expected, report, requests, output: nativeOutput.slice(-5000) }));
  const calls = name => requests.filter(request => request.marker === name).map(request => request.model);
  assert.ok(calls('CASE_SLACK').every(model => model === 'openai'));
  assert.ok(calls('CASE_COMMUNITY_OVERRIDE').every(model => model === 'google'));
  assert.ok(calls('CASE_COMMUNITY_PLATFORM').every(model => model === 'claude'));
  assert.deepEqual([...new Set(calls('CASE_COMMUNITY_FAILURE'))], ['claude', 'google']);
  assert.ok(calls('CASE_COMMUNITY_EMPTY').length > 0 && calls('CASE_COMMUNITY_EMPTY').every(model => model === 'google'));
  assert.ok(requests.every(request => request.model !== 'payg' && request.maxTokens <= 512));
  assert.ok(contexts.some(context => context.agentId === 'main') && contexts.some(context => context.agentId === 'nori-community'), JSON.stringify(contexts));
  assert.ok(report.sent.some(reply => reply.marker === 'CASE_BUDGET_FIRST' && reply.text.includes('OK CASE_BUDGET_FIRST')));
  assert.equal(calls('CASE_BUDGET_FIRST').length, 1, JSON.stringify(requests));
  assert.equal(calls('CASE_BUDGET_EXHAUSTED').length, 0, JSON.stringify(requests));
  console.log('PASS: durable daily budget blocks the next request; native settlement frees sequential concurrency slots. Synthetic ingress only.');
  console.log('PASS: actual OpenClaw scoped hooks and pinned Magpie; two agents, platform/channel precedence, ordered fallback, empty fallback, hidden paid provider denied, capped output; Jev absent. Synthetic ingress, not live platform acceptance.');
} finally {
  for (const child of children.reverse()) if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
