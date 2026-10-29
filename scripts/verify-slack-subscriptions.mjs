import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, upstream, environment, requireSource } from './runtime-env.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';

requireSource();
const temp = mkdtempSync(join(tmpdir(), 'rein-slack-subscription-probe-'));
const requests = [];
const decisions = [];
const identityCalls = [], proofs = new Map();
let administratorRevoked = false;
const markerFor = request => JSON.stringify(request.messages?.findLast(message =>
  message.role === 'user' && /CASE_SLACK_[A-Z]+/.test(JSON.stringify(message.content)))?.content)?.match(/CASE_SLACK_[A-Z]+/)?.[0];
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !['/v1/systemone', '/v1/chat/completions', '/api/ingress/relay', '/api/identity/resolve'].includes(req.url)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Synthetic endpoint unavailable' } })); return;
  }
  let body = ''; for await (const chunk of req) body += chunk;
  let request;
  try { request = JSON.parse(body); } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Synthetic request invalid' } })); return;
  }
  if (req.url.startsWith('/api/')) {
    identityCalls.push({ path: req.url, body: request });
    assert.equal(req.headers.authorization, 'Bearer synthetic-router-backend-secret');
    assert.equal(req.headers['x-rein-caller-id'], 'synthetic-router');
    let result;
    if (req.url === '/api/ingress/relay') {
      assert.equal(request.platform, 'slack'); assert.equal(request.workspace_id, 'T0000000001');
      assert.equal(request.channel_id, 'C0000000001');
      const assertion = `synthetic-assertion-${proofs.size}`; proofs.set(assertion, request);
      result = { ok: true, assertion };
    } else {
      const tuple = proofs.get(request.proof?.assertion); assert.ok(tuple);
      const linked = tuple.platform_user_id === 'U0000000001';
      result = { ok: true, status: linked ? 'resolved' : 'identity_not_linked', contact_id: linked ? 'synthetic-contact' : null,
        is_administrator: linked && !administratorRevoked };
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(result)); return;
  }
  if (req.url === '/v1/systemone') {
    decisions.push(request);
    const coding = /CASE_SLACK_(CODE|CLAIM|ACCOUNT|SMALL|PREMIUM|REVOKED)/.test(request.state.currentRequest);
    const complex = coding && !request.state.currentRequest.includes('CASE_SLACK_SMALL');
    const choice = (criteria, selected) => ({ type: 'choice', choice: selected, confidence: 0.99,
      probabilities: Object.fromEntries(Object.keys(criteria).map(key => [key, key === selected ? 0.99 : 0.01 / (Object.keys(criteria).length - 1)])) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: 'jev-slack-fixture', answers: {
      route: choice(request.questions.route.criteria, 'google'),
      task: choice(request.questions.task.criteria, coding ? 'coding' : 'simple'),
      contextIndependent: { type: 'noul', noul: 0.99 },
      complexDevelopment: { type: 'noul', noul: complex ? 0.99 : 0.01 },
    }, usage: { input_tokens: 25, output_tokens: 0 } }));
    return;
  }
  requests.push(request);
  const marker = markerFor(request);
  const lastUser = request.messages.findLastIndex(message => message.role === 'user' && /CASE_SLACK_[A-Z]+/.test(JSON.stringify(message.content)));
  const toolResult = request.messages.slice(lastUser + 1).some(message => message.role === 'tool');
  if (marker === 'CASE_SLACK_PREMIUM' && toolResult) administratorRevoked = true;
  const delta = toolResult ? { role: 'assistant', content: `OK ${marker}` } : {
    role: 'assistant', tool_calls: [{ index: 0, id: `call_${marker}`, type: 'function',
      function: { name: 'tool_call', arguments: JSON.stringify({ id: 'rein_probe_echo', args: { marker } }) } }],
  };
  res.writeHead(200, { 'content-type': 'text/event-stream', 'x-magpie-provider': 'fixture', 'x-magpie-model': request.model });
  const event = { id: 'synthetic-slack-subscription-probe', object: 'chat.completion.chunk', created: 1,
    model: request.model, choices: [{ index: 0, delta, finish_reason: null }] };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.write(`data: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: {}, finish_reason: toolResult ? 'stop' : 'tool_calls' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const reservation = createSocketServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const gatewayPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const workspace = join(temp, 'workspace'); mkdirSync(workspace);
const pluginDir = join(temp, 'fixture'); mkdirSync(pluginDir);
writeFileSync(join(pluginDir, 'index.ts'), readFileSync(join(root, 'tests/fixtures/slack-subscription-router.ts')));
writeFileSync(join(pluginDir, 'openclaw.plugin.json'), JSON.stringify({ id: 'rein-slack-probe', name: 'Synthetic Slack subscription probe',
  channels: ['slack'], channelConfigs: { slack: { label: 'Synthetic Slack', schema: {
    type: 'object', properties: { enabled: { type: 'boolean' } }, additionalProperties: false,
  } } }, activation: { onStartup: true }, contracts: { tools: ['rein_probe_echo'] },
  configSchema: { type: 'object', properties: {}, additionalProperties: false } }));
writeFileSync(join(pluginDir, 'package.json'), JSON.stringify({ name: '@rein-protocol/slack-subscription-probe-fixture', version: '0.1.0', type: 'module', openclaw: { extensions: ['./index.ts'] } }));
symlinkSync(join(root, 'plugins/rein-router/node_modules'), join(pluginDir, 'node_modules'));
const router = { enabled: true, allowPaidUsage: true, gateway: { baseUrl: `http://127.0.0.1:${port}/v1`, apiKeyEnvVar: 'REIN_SLACK_PROBE_GATEWAY_KEY', subscriptionOnly: false },
  routes: ['openai', 'claude', 'google'].map(id => ({ id, provider: `Synthetic ${id}`, gatewayModel: `fixture/${id}`,
    billingSource: 'synthetic allowance fixture', billingMode: id === 'claude' ? 'pay-as-you-go' : 'subscription', billingVerified: true,
    ...(id === 'claude' ? { access: 'admin-complex-coding' } : {}),
    purpose: id === 'google' ? 'Economical self-contained queries' : 'Capable research and coding',
    effort: id === 'google' ? 'off' : id === 'claude' ? 'high' : 'medium', contextWindow: 32768, maxTokens: 512 })),
  defaultRoute: 'openai', fallbackRoutes: [], channels: ['slack'],
  adminSenders: ['U0000000001', 'U0000000002'].map(senderId => ({ channel: 'slack', accountId: 'default', senderId })),
  decision: { allowPaidJev: true, timeoutMs: 5000, maxPromptChars: 16000 } };
const cfg = buildOpenClawFragment(router, join(root, 'plugins/rein-router'));
cfg.models.catalogRefresh = { enabled: false };
cfg.gateway = { mode: 'local', bind: 'loopback', port: gatewayPort, auth: { mode: 'token', token: 'synthetic-slack-subscription-probe' } };
Object.assign(cfg.agents.defaults, { workspace, skipBootstrap: true, decisionModel: 'typesafe/jev-latest', compaction: { memoryFlush: { enabled: false } } });
cfg.memory = { search: { enabled: false, rememberAcrossConversations: false } };
cfg.tools = { allow: ['rein_probe_echo'], fs: { workspaceOnly: true }, sessions: { visibility: 'self' }, agentToAgent: { enabled: false } };
cfg.channels = { slack: { enabled: true } };
cfg.plugins.allow.push('rein-slack-probe', 'typesafe', 'openai');
cfg.plugins.load.paths.push(pluginDir, join(upstream, 'extensions/typesafe'));
cfg.plugins.entries.slack = { enabled: false };
cfg.plugins.allow.push('rein-operations');
cfg.plugins.load.paths.push(join(root, 'plugins/rein-operations'));
cfg.plugins.entries['rein-operations'] = { enabled: true, config: { foundationDb: { enabled: true,
  backendApiBaseUrlEnvVar: 'REIN_PROBE_BACKEND_URL', agentCallerIdEnvVar: 'REIN_PROBE_BACKEND_CALLER',
  agentCredentialEnvVar: 'REIN_PROBE_BACKEND_SECRET', proposalConfirmationKeyEnvVar: 'REIN_PROBE_CONFIRMATION_KEY',
  workspaces: [{ platform: 'slack', workspaceId: 'T0000000001', nativeChannelIds: ['C0000000001'] }],
  proposalChannelIds: ['C0000000001'], boardChannelIds: ['C0000000001'] } } };
cfg.plugins.entries.discord = { enabled: false };
cfg.plugins.entries['rein-slack-probe'] = { enabled: true };
cfg.plugins.entries.typesafe = { enabled: true, config: { baseUrl: `http://127.0.0.1:${port}` } };
const configPath = join(temp, 'openclaw.json'); writeFileSync(configPath, JSON.stringify(cfg));
const evidencePath = join(temp, 'evidence.json');
const env = { ...environment(), OPENCLAW_STATE_DIR: join(temp, 'state'), OPENCLAW_CONFIG_PATH: configPath,
  REIN_PROBE_BACKEND_URL: `http://127.0.0.1:${port}`, REIN_PROBE_BACKEND_CALLER: 'synthetic-router',
  REIN_PROBE_BACKEND_SECRET: 'synthetic-router-backend-secret', REIN_PROBE_CONFIRMATION_KEY: 'synthetic-confirmation-key',
  REIN_SLACK_PROBE_GATEWAY_KEY: 'sk-magpie-key-synthetic-local-probe-00000000', REIN_SLACK_PROBE_EVIDENCE_PATH: evidencePath,
  OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BUNDLED_DOCTOR: '1' };
let child, output = '';
const stop = signal => { try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
try {
  const inspected = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'plugins', 'inspect', 'rein-router', '--runtime', '--json'],
    { cwd: upstream, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(inspected.status, 0, inspected.stderr || inspected.stdout);
  const report = JSON.parse(inspected.stdout);
  assert.equal(report.plugin.imported, true); assert.notEqual(report.plugin.status, 'error', report.plugin.error);
  assert.equal(report.diagnostics.filter(item => item.level === 'error').length, 0);
  child = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'gateway', 'run', '--allow-unconfigured'],
    { cwd: upstream, detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  let exited = false; child.on('exit', () => { exited = true; });
  const deadline = Date.now() + 120000;
  while (!existsSync(evidencePath) && !exited && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(existsSync(evidencePath), `Native Slack probe incomplete:\n${output.slice(-12000)}`);
  const evidence = JSON.parse(readFileSync(evidencePath));
  assert.ok(!evidence.error, `${evidence.error}\n${output.slice(-12000)}`);
  const expected = { CASE_SLACK_SIMPLE: ['fixture/google:none', true, 'default', 'U0000000001'],
    CASE_SLACK_CODE: ['fixture/claude:high', true, 'default', 'U0000000001'],
    CASE_SLACK_CLAIM: ['fixture/openai:medium', false, 'default', 'U0000000002'],
    CASE_SLACK_ACCOUNT: ['fixture/openai:medium', false, 'secondary', 'U0000000001'],
    CASE_SLACK_MANUAL: ['fixture/openai:medium', null, 'default', 'U0000000001'],
    CASE_SLACK_SMALL: ['fixture/openai:medium', true, 'default', 'U0000000001'],
    CASE_SLACK_PREMIUM: ['fixture/claude:high', true, 'default', 'U0000000001'],
    CASE_SLACK_REVOKED: ['fixture/openai:medium', false, 'default', 'U0000000001'] };
  assert.equal(decisions.length, 7, 'Only unrestricted manual selections bypass Jev');
  const toolContexts = [];
  for (const [marker, [model, administrator, accountId, senderId]] of Object.entries(expected)) {
    const calls = requests.filter(request => markerFor(request) === marker);
    assert.equal(calls.length, 2, `${marker} must execute a native tool round trip; calls=${calls.map(call => call.model)}\n${output.slice(-8000)}`);
    assert.ok(calls.every(call => call.model === model), `${marker} model mismatch: ${calls.map(call => call.model)}`);
    const lastUser = calls[1].messages.findLastIndex(message => message.role === 'user' &&
      JSON.stringify(message.content).includes(marker));
    const toolMessages = calls[1].messages.slice(lastUser + 1).filter(message => message.role === 'tool');
    assert.equal(toolMessages.length, 1, `${marker} must return exactly one current native tool result`);
    const toolResult = JSON.parse(toolMessages[0].content);
    assert.equal(toolResult.tool?.name, 'rein_probe_echo', `${marker} echo tool did not execute`);
    const tool = toolResult.result?.details;
    assert.equal(tool?.marker, marker, `${marker} missing native echo result details`);
    toolContexts.push(tool);
    assert.equal(tool.channel, 'slack'); assert.equal(tool.channelId, 'C0000000001');
    assert.equal(tool.accountId, accountId); assert.equal(tool.senderId, senderId);
    assert.equal(tool.sessionKey, `agent:main:slack:channel:rein-probe-${accountId}-${senderId.toLowerCase()}`);
    const decision = decisions.find(entry => entry.state.currentRequest.includes(marker));
    if (administrator === null) assert.equal(decision, undefined);
    else { assert.ok(decision); assert.equal(decision.state.channel, 'slack'); assert.equal(decision.state.administrator, administrator,
      `${marker}: backend authority differs`); }
    assert.ok(evidence.sent.some(entry => entry.marker === marker && entry.text === `OK ${marker}`), `${marker} final reply missing`);
  }
  assert.equal(toolContexts.length, 8, 'Every Slack case must execute its native tool once');
  assert.equal(identityCalls.filter(c => c.path === '/api/ingress/relay').length, 6, 'Recheck each allowlisted automatic or restricted-manual task');
  assert.ok(!JSON.stringify(decisions).includes('synthetic-assertion'), 'Identity proofs must never reach Jev');
  assert.equal(new Set(toolContexts.map(entry => entry.sessionKey)).size, 3, 'Native sender and account scopes must stay separate');
  assert.ok(requests.every(request => /^fixture\/(google|claude|openai):(none|medium|high)$/.test(request.model)), 'Unknown model or sentinel escaped');
  console.log('Native synthetic Slack subscription probe passed: trusted ingress, signed Foundation identity, unlinked sender and revoked administrator denial, complex-development access, simple coding exclusion, restricted manual classification and native tool round trips. No Slack accounts or live providers contacted.');
} finally {
  if (child) { stop('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]); stop('SIGKILL'); }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
