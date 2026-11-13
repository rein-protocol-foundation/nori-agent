import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as socketServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, upstream } from './runtime-env.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';

assert.ok(existsSync(join(upstream, 'dist')), 'Build the pinned native runtime first.');
const temp = mkdtempSync(join(tmpdir(), 'nori-partnership-'));
for (const dir of ['home', 'state', 'tmp', 'workspace', 'fixture']) mkdirSync(join(temp, dir), { mode: 0o700 });
console.log(`Partnership synthetic evidence: ${temp}`);
const evidencePath = join(temp, 'evidence.json'), commandsPath = join(temp, 'commands.json');
const evidence = () => existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath)) : {};
const draft = { action: 'prepare', sourceTaskId: 'synthetic-shortlist-1', entry: 'Example Civic Institute — https://civic.example.invalid — eligibility unknown',
  to: 'test@example.invalid', subject: 'Synthetic partnership draft', text: 'Hello Example Civic Institute,\nThis is a synthetic partnership test. No real outreach.' };
let modelCalls = 0;
const server = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    if (req.method === 'GET') { res.end(JSON.stringify({ data: [{ id: 'fixture/standard' }] })); return; }
    const request = JSON.parse(raw); modelCalls++;
    const at = request.messages.findLastIndex(m => m.role === 'user' && JSON.stringify(m.content).includes('PARTNERSHIP_PREPARE'));
    const cancelDraft = at >= 0 && JSON.stringify(request.messages[at].content).includes('PARTNERSHIP_PREPARE_CANCEL');
    const toolResult = request.messages.slice(at + 1).findLast(m => m.role === 'tool');
    const delta = toolResult ? { role: 'assistant', content: `PARTNERSHIP_PREVIEW\n${typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content)}` }
      : { role: 'assistant', tool_calls: [{ index: 0, id: `partnership-call-${modelCalls}`, type: 'function', function: { name: 'tool_call', arguments: JSON.stringify({ id: 'rein_partnership', args: { ...draft, ...(cancelDraft ? { subject: 'Synthetic cancelled draft' } : {}) } }) } }] };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = { id: 'partnership-fixture', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason: null }] };
    res.end(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: toolResult ? 'stop' : 'tool_calls' }] })}\n\ndata: [DONE]\n\n`);
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: String(error) })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const socket = socketServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const gatewayPort = socket.address().port; await new Promise(resolve => socket.close(resolve));
const fixture = join(temp, 'fixture');
writeFileSync(join(fixture, 'index.ts'), readFileSync(join(root, 'tests/fixtures/partnership-workflow.ts')));
symlinkSync(join(root, 'plugins/rein-router/node_modules'), join(fixture, 'node_modules'));
writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: '@rein/partnership-fixture', version: '0.1.0', type: 'module', openclaw: { extensions: ['./index.ts'] } }));
writeFileSync(join(fixture, 'openclaw.plugin.json'), JSON.stringify({ id: 'partnership-fixture', channels: ['slack'], activation: { onStartup: true },
  channelConfigs: { slack: { label: 'Synthetic Slack', schema: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean' } } } } }, configSchema: { type: 'object', properties: {}, additionalProperties: false } }));
const router = { enabled: true, gateway: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnvVar: 'PARTNERSHIP_MODEL_KEY' },
  routes: [{ id: 'standard', provider: 'fixture', gatewayModel: 'fixture/standard', effort: 'high', billingSource: 'synthetic', billingMode: 'subscription', billingVerified: true, purpose: 'Synthetic partnership fixture', contextWindow: 131072, maxTokens: 4096 }], defaultRoute: 'standard', nativeAgentRoutes: { main: ['standard'] },
  trustedSlackChannels: [{ agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'PARTNERSHIP_SLACK' }] };
const config = buildOpenClawFragment(router, join(root, 'plugins/rein-router'));
Object.assign(config, { gateway: { mode: 'local', bind: 'loopback', port: gatewayPort, auth: { mode: 'token', token: 'partnership-synthetic-gateway' } },
  channels: { slack: { enabled: true } }, session: { dmScope: 'per-account-channel-peer', groupScope: 'per-group' },
  commands: { text: true, allowFrom: { slack: ['UALICE01', 'UBOB0001'] } },
  agents: { defaults: { workspace: join(temp, 'workspace'), skipBootstrap: true, heartbeat: { every: '0m' }, model: { primary: 'rein-magpie/standard', fallbacks: [] }, compaction: { memoryFlush: { enabled: false } } },
    entries: { main: { default: true, sandbox: { mode: 'off' }, tools: { allow: ['rein_partnership'] } }, community: { sandbox: { mode: 'all' } } } },
  memory: { search: { enabled: false } }, bindings: [{ agentId: 'main', match: { channel: 'slack' } }] });
config.models.catalogRefresh = { enabled: false };
config.plugins.allow.push('partnership-fixture', 'rein-partnership', 'openai');
config.plugins.load.paths.unshift(fixture, join(root, 'plugins/rein-partnership'));
config.plugins.entries['partnership-fixture'] = { enabled: true, hooks: { allowConversationAccess: true } };
config.plugins.entries['rein-partnership'] = { enabled: true, hooks: { allowConversationAccess: true }, config: { enabled: true,
  channel: { agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'PARTNERSHIP_SLACK' },
  from: 'nori@example.invalid', testRecipients: ['test@example.invalid'], apiKeyEnvVar: 'PARTNERSHIP_RESEND_KEY' } };
config.plugins.entries.slack = { enabled: false }; config.plugins.entries['rein-router'].hooks = { allowConversationAccess: true };
const configPath = join(temp, 'openclaw.json'); writeFileSync(configPath, JSON.stringify(config));
const env = { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'), OPENCLAW_STATE_DIR: join(temp, 'state'), OPENCLAW_CONFIG_PATH: configPath,
  PARTNERSHIP_EVIDENCE: evidencePath, PARTNERSHIP_COMMANDS: commandsPath, PARTNERSHIP_SLACK: 'xoxb-synthetic', PARTNERSHIP_RESEND_KEY: 're_synthetic', PARTNERSHIP_MODEL_KEY: 'sk-magpie-key-synthetic-partnership-000000000000', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BUNDLED_DOCTOR: '1' };
let child;
async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve));
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
  const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 10000);
  await stopped; clearTimeout(timer); child = undefined;
}
async function phase(name) {
  let log = '', exited = false;
  child = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'gateway', 'run', '--allow-unconfigured'], { cwd: upstream, env: { ...env, PARTNERSHIP_PHASE: name }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; }); child.once('exit', () => { exited = true; });
  const deadline = Date.now() + 90000;
  while (!evidence().phases?.some(p => p.phase === name) && !evidence().error && !exited && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  writeFileSync(join(temp, `${name}.log`), log);
  assert.ok(!evidence().error, `${evidence().error}\n${log.slice(-5000)}`);
  assert.ok(evidence().phases?.some(p => p.phase === name), log.slice(-7000));
  await stop();
}
try {
  const inspect = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'plugins', 'inspect', 'rein-partnership', '--runtime', '--json'], { cwd: upstream, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(join(temp, 'loader.log'), inspect.stdout + inspect.stderr);
  assert.equal(inspect.status, 0, inspect.stderr || inspect.stdout);
  const loaded = JSON.parse(inspect.stdout);
  assert.equal(loaded.plugin.imported, true); assert.equal(loaded.diagnostics.filter(d => d.level === 'error').length, 0, JSON.stringify(loaded.diagnostics));
  assert.ok(loaded.tools.some(t => t.names.includes('rein_partnership')));
  const disabledConfig = structuredClone(config), disabledPath = join(temp, 'disabled.json');
  disabledConfig.plugins.entries['rein-partnership'].config.enabled = false;
  writeFileSync(disabledPath, JSON.stringify(disabledConfig));
  const disabled = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'plugins', 'inspect', 'rein-partnership', '--runtime', '--json'], { cwd: upstream,
    env: { ...env, OPENCLAW_CONFIG_PATH: disabledPath }, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(join(temp, 'disabled-loader.log'), disabled.stdout + disabled.stderr);
  assert.equal(disabled.status, 0, disabled.stderr || disabled.stdout);
  assert.equal(JSON.parse(disabled.stdout).tools.length, 0, 'disabled config must register no preparation tool');
  await phase('prepare');
  const prepared = evidence().tools.find(t => t.name === 'rein_partnership')?.result?.details;
  assert.equal(prepared?.status, 'awaiting_approval', JSON.stringify(evidence().tools));
  const cancelled = evidence().tools.find(t => t.name === 'rein_partnership' && t.params?.subject === 'Synthetic cancelled draft')?.result?.details;
  assert.equal(cancelled?.status, 'awaiting_approval');
  assert.equal(evidence().mail.length, 0); assert.ok(prepared.approveCommand); assert.ok(prepared.checkpointId);
  assert.ok(evidence().sent.some(s => String(s.threadId ?? s.thread) === '1000.001' && s.text.includes(draft.to) &&
    s.text.includes(draft.subject) && s.text.includes(draft.text) && s.text.includes(prepared.approveCommand)), 'deterministic preview must show the exact full body and approval command in the original thread');
  const callsBefore = modelCalls;
  writeFileSync(commandsPath, JSON.stringify([
    { text: prepared.approveCommand, options: { sender: 'UBOB0001' } },
    { text: prepared.approveCommand, options: { thread: '1000.999' } },
    { text: prepared.approveCommand }, { text: prepared.approveCommand },
    { text: `/partnership reconcile ${prepared.taskId}` },
    { text: cancelled.cancelCommand }, { text: cancelled.approveCommand },
  ]));
  await phase('decision');
  const e = evidence();
  assert.notEqual(e.phases[0].pid, e.phases[1].pid, 'restart must use a different Gateway process');
  assert.equal(modelCalls, callsBefore, 'approval commands must bypass the model');
  assert.equal(e.mail.length, 1, 'unauthorized/foreign-thread/duplicate approvals must not send');
  assert.deepEqual(e.dispatches.filter(d => d.text.startsWith('/partnership')).map(d => d.mailAfter - d.mailBefore), [0, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(e.mail[0].body.to, [draft.to]); assert.equal(e.mail[0].body.text, draft.text); assert.equal(e.mail[0].body.subject, draft.subject); assert.ok(e.mail[0].key);
  const replies = e.sent.filter(s => s.request?.startsWith('/partnership'));
  assert.ok(replies.some(s => /accepted/.test(s.text) && s.text.includes('fixture-receipt-1')));
  assert.ok(replies.some(s => /delivered/.test(s.text)));
  assert.ok(replies.some(s => s.request === cancelled.cancelCommand && /cancelled/.test(s.text)));
  console.log('PASS: real pinned loader/Gateway/Slack ingress; native model-free approvals; exact draft; pause/restart/resume; one provider request; receipt/delivery distinction; original-thread acknowledgment. All transport, model and provider data synthetic.');
} finally { await stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
