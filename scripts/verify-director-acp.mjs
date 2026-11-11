import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as socketServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, upstream, environment } from './runtime-env.mjs';

const temp = mkdtempSync(join(tmpdir(), 'rein-director-acp-'));
const requests = [], proofs = new Map();
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const request = JSON.parse(raw || '{}');
  if (req.url === '/api/ingress/relay') {
    const assertion = `fixture-${proofs.size}`; proofs.set(assertion, request);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, assertion })); return;
  }
  if (req.url === '/api/identity/resolve') {
    const tuple = proofs.get(request.proof?.assertion);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, status: 'resolved', contact_id: 'synthetic-contact', is_director: tuple?.platform_user_id === 'UDIRECT1', is_active_contributor: true, is_administrator: true })); return;
  }
  if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end(); return; }
  requests.push(request);
  const lastUser = request.messages.findLastIndex(m => m.role === 'user' && /ACP_(START_TASK|QUERY_STATUS|FIXTURE_DONE|FIXTURE_RUNNING)/.test(JSON.stringify(m.content)));
  const current = JSON.stringify(request.messages[lastUser]?.content);
  const toolResult = request.messages.slice(lastUser + 1).some(m => m.role === 'tool');
  const completion = !/ACP_(START_TASK|QUERY_STATUS)/.test(current) || /ACP_FIXTURE_DONE/.test(current);
  const name = current.includes('ACP_QUERY_STATUS') ? 'subagents' : 'sessions_spawn';
  const args = name === 'subagents' ? { action: 'list' } : { task: 'Complete the synthetic tiny task', runtime: 'acp', agentId: 'codex', mode: 'run', thread: false, streamTo: 'parent' };
  const done = toolResult || completion;
  const delta = done ? { role: 'assistant', content: completion ? current.includes('ACP_FIXTURE_DONE') ? 'ACP_FINAL_REPORT' : 'ACP_PROGRESS_REPORT' : name === 'subagents' ? 'ACP_STATUS_REPORTED' : 'ACP_ACCEPTED' } : {
    role: 'assistant', tool_calls: [{ index: 0, id: `call-${requests.length}`, type: 'function', function: { name: 'tool_call', arguments: JSON.stringify({ id: name, args }) } }] };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = { id: 'fixture-acp', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason: null }] };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.write(`data: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: {}, finish_reason: done ? 'stop' : 'tool_calls' }] })}\n\n`); res.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const socket = socketServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const gatewayPort = socket.address().port; await new Promise(resolve => socket.close(resolve));
const workspace = join(temp, 'workspace'); mkdirSync(workspace);
const fixture = join(temp, 'fixture'); mkdirSync(fixture);
writeFileSync(join(fixture, 'index.ts'), readFileSync(join(root, 'tests/fixtures/director-acp-native.ts')));
symlinkSync(join(root, 'plugins/rein-router/node_modules'), join(fixture, 'node_modules'));
writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: '@rein/acp-fixture', version: '0.1.0', type: 'module', openclaw: { extensions: ['./index.ts'] } }));
writeFileSync(join(fixture, 'openclaw.plugin.json'), JSON.stringify({ id: 'rein-acp-probe', channels: ['slack'], channelConfigs: { slack: { label: 'Synthetic Slack', schema: { type: 'object', properties: { enabled: { type: 'boolean' } }, additionalProperties: false } } }, activation: { onStartup: true }, configSchema: { type: 'object', properties: {}, additionalProperties: false } }));
const config = {
  gateway: { mode: 'local', bind: 'loopback', port: gatewayPort, auth: { mode: 'token', token: 'synthetic-acp-probe-token' } },
  models: { catalogRefresh: { enabled: false }, providers: { fixture: { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: 'synthetic', api: 'openai-completions', models: [{ id: 'fixture-model', name: 'Fixture', contextWindow: 32768, maxTokens: 1024, input: ['text'], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } },
  agents: { defaults: { workspace, skipBootstrap: true, model: { primary: 'fixture/fixture-model' }, compaction: { memoryFlush: { enabled: false } }, subagents: { runTimeoutSeconds: 45 } }, list: [
    { id: 'director-control', default: true, sandbox: { mode: 'off' }, tools: { elevated: { enabled: false }, allow: ['sessions_spawn', 'subagents', 'apply_patch', 'edit', 'exec', 'process', 'read', 'write'] } }, { id: 'codex', workspace },
  ] },
  acp: { enabled: true, backend: 'rein-acp-fixture', defaultAgent: 'codex', allowedAgents: ['codex'] },
  commands: { allowFrom: { slack: [] } }, channels: { slack: { enabled: true } },
  memory: { search: { enabled: false } },
  tools: { sessions: { visibility: 'tree' }, agentToAgent: { enabled: false } },
  plugins: { allow: ['rein-acp-probe', 'rein-acp', 'rein-operations', 'openai'], load: { paths: [fixture, join(root, 'plugins/rein-acp'), join(root, 'plugins/rein-operations')] }, entries: {
    slack: { enabled: false }, discord: { enabled: false }, 'rein-acp-probe': { enabled: true, hooks: { allowConversationAccess: true } },
    'rein-acp': { enabled: true, hooks: { allowConversationAccess: true }, config: { enabled: true, channel: { accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', agentId: 'director-control', botTokenEnvVar: 'REIN_ACP_TEST_SLACK' }, harnessAgentId: 'codex', cwd: workspace } },
    'rein-operations': { enabled: true, config: { foundationDb: { enabled: true, workspaces: [{ platform: 'slack', workspaceId: 'TFIXTURE1', nativeChannelIds: ['CFIXTURE1'] }], proposalChannelIds: ['CFIXTURE1'], boardChannelIds: ['CFIXTURE1'], backendApiBaseUrlEnvVar: 'REIN_ACP_TEST_URL', agentCallerIdEnvVar: 'REIN_ACP_TEST_CALLER', agentCredentialEnvVar: 'REIN_ACP_TEST_CREDENTIAL', proposalConfirmationKeyEnvVar: 'REIN_ACP_TEST_CONFIRMATION' } } },
  } },
};
const configPath = join(temp, 'openclaw.json'), evidencePath = join(temp, 'evidence.json');
writeFileSync(configPath, JSON.stringify(config));
const env = { ...environment(), OPENCLAW_STATE_DIR: join(temp, 'state'), OPENCLAW_CONFIG_PATH: configPath,
  REIN_ACP_PROBE_EVIDENCE: evidencePath, REIN_ACP_TEST_SLACK: 'xoxb-fixture-token', REIN_ACP_TEST_URL: `http://127.0.0.1:${port}`,
  REIN_ACP_TEST_CALLER: 'fixture', REIN_ACP_TEST_CREDENTIAL: 'synthetic-credential', REIN_ACP_TEST_CONFIRMATION: 'synthetic-confirmation-key-00000001', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BUNDLED_DOCTOR: '1' };
let child, output = '';
try {
  const inspection = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'plugins', 'inspect', 'rein-acp', '--runtime', '--json'], { cwd: upstream, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(inspection.status, 0, inspection.stderr || inspection.stdout);
  const report = JSON.parse(inspection.stdout); assert.equal(report.plugin.imported, true); assert.notEqual(report.plugin.status, 'error', report.plugin.error);
  child = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'gateway', 'run', '--allow-unconfigured'], { cwd: upstream, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  let exited = false; child.on('exit', () => { exited = true; });
  const deadline = Date.now() + 90000;
  while (!existsSync(evidencePath) && !exited && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(existsSync(evidencePath), output.slice(-12000));
  const evidence = JSON.parse(readFileSync(evidencePath));
  assert.ok(!evidence.error, `${evidence.error}\n${output.slice(-10000)}`);
  assert.equal(evidence.turns.length, 1, JSON.stringify({ evidence, messages: requests.map(r => r.messages.filter(m => m.role === 'tool').map(m => m.content)), logs: output.slice(-6000) }));
  const started = evidence.results.find(x => x.name === 'sessions_spawn');
  assert.equal(started?.result?.details?.status, 'accepted', JSON.stringify(evidence));
  assert.match(started.result.details.childSessionKey, /:acp:/);
  assert.ok(evidence.results.some(x => x.name === 'subagents' && x.result?.details?.tasks?.some(t => t.runtime === 'acp' && t.status === 'running')), JSON.stringify(evidence));
  assert.ok(evidence.progress.some(x => x.phase === 'started' && x.requester?.threadId === '1000.001'), JSON.stringify(evidence));
  assert.ok(evidence.progress.some(x => x.phase === 'ended' && x.outcome === 'ok'), JSON.stringify(evidence));
  assert.ok(evidence.sent.some(x => x.background && x.to === 'channel:CFIXTURE1' && x.threadId === '1000.001' && x.text.includes('ACP_FINAL_REPORT')), JSON.stringify(evidence));
  assert.ok(!requests.some(r => JSON.stringify(r.messages).includes('ACP_DENIED_TASK')), 'Non-member must be rejected before model execution');
  console.log('Trusted Slack ACP synthetic end-to-end passed: native Slack ingress, trusted Slack membership without a Foundation role, native ACP child admission, running task status, progress and completion report. No live Slack, member records or external model contacted.');
} finally {
  if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]); try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
