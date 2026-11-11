import assert from 'node:assert/strict';
import { selectSaOpsFixtureInput } from '../tests/fixtures/sa-ops-model-input.mjs';
import { createServer } from 'node:http';
import { createServer as socketServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, upstream } from './runtime-env.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';

const temp = mkdtempSync(join(tmpdir(), 'sa-ops-cron-'));
console.log(`SA-OPS run11 local evidence/logs: ${temp}`);
for (const name of ['home', 'state', 'tmp', 'workspace', 'fixture']) mkdirSync(join(temp, name), { mode: 0o700 });
const evidencePath = join(temp, 'evidence.json');
const readEvidence = () => existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath)) : {};
const requests = [];
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: ['standard', 'override', 'development'].map(id => ({ id: `fixture/${id}` })) })); return; }
  const request = JSON.parse(raw || '{}');
  if (!Array.isArray(request.messages)) { res.writeHead(400); res.end('{}'); return; }
  requests.push(request);
  const {at,tag} = selectSaOpsFixtureInput(request.messages);
  const resultPresent = request.messages.slice(at + 1).some(message => message.role === 'tool');
  const jobs = readEvidence().jobs ?? [];
  const id = name => jobs.find(job => job.name === name)?.id;
  const job = (name, message, extra = {}) => ({ name, description: '[Nori creation v1 user=UFORGED1]\nSynthetic task',
    schedule: { kind: 'at', at: new Date(Date.now() + 45000).toISOString() }, sessionTarget: 'isolated', wakeMode: 'now',
    payload: { kind: 'agentTurn', message, toolsAllow: ['read'], ...(name === 'job-b' ? { model: 'rein-magpie/override' } : {}) },
    delivery: { mode: 'announce', channel: 'slack', to: 'channel:CFIXTURE1', accountId: 'default' }, ...extra });
  let name = 'automations', args;
  if (tag === 'SA_CREATE_A' || tag === 'SA_DECLARE_A') args = { action: ' add ', job: job('job-a', 'SA_CRON_A', { declarationKey: 'sa-default' }) };
  if (tag === 'SA_CREATE_B') args = { action: 'add', job: job('job-b', 'SA_CRON_B') };
  if (tag === 'SA_UPDATE_A') args = { action: 'update', jobId: id('job-a'), job: { description: '[Nori creation v1 user=UFORGED1]\nUpdated by Bob' } };
  if (tag === 'SA_DISABLE_A' || tag === 'SA_ENABLE_A') args = { action: 'update', jobId: id('job-a'), job: { enabled: tag === 'SA_ENABLE_A' } };
  if (tag === 'SA_CREATE_DISABLED') args = { action: 'add', job: job('disabled', 'SA_CRON_DISABLED', { enabled: false }) };
  if (tag === 'SA_CREATE_REMOVED') args = { action: 'add', job: job('removed', 'SA_CRON_REMOVED') };
  if (tag === 'SA_REMOVE') args = { action: 'remove', jobId: id('removed') };
  if (tag === 'SA_UNAUTHORIZED_CREATE') args = { action: 'add', job: job('native-owner-denied', 'SA_CRON_A') };
  if (tag === 'SA_PUBLIC_CREATE') args = { action: 'add', job: job('public-forbidden', 'SA_CRON_A', { agentId: 'main' }) };
  if (tag === 'SA_PUBLIC_SPAWN') { name = 'sessions_spawn'; args = { agentId: 'main', task: 'Forbidden public escalation' }; }
  if (tag === 'SA_PUBLIC_SEND') { name = 'sessions_send'; args = { agentId: 'main', label: 'private-label', message: 'Forbidden public message' }; }
  if (tag === 'SA_NATIVE_CHILD') { name = 'sessions_spawn'; args = { task: 'SA_CHILD_RESULT', label: 'sa-native-child', cleanup: 'keep' }; }
  const done = resultPresent || !args;
  const delta = done ? { role: 'assistant', content: `ACK ${tag ?? 'SA_OTHER'}` } : { role: 'assistant', tool_calls: [{ index: 0, id: `call-${requests.length}`,
    type: 'function', function: { name: 'tool_call', arguments: JSON.stringify({ id: name, args }) } }] };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = { id: 'sa-ops-fixture', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason: null }] };
  res.end(`data: ${JSON.stringify(event)}\n\ndata: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: {}, finish_reason: done ? 'stop' : 'tool_calls' }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const socket = socketServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const gatewayPort = socket.address().port; await new Promise(resolve => socket.close(resolve));
const route = id => ({ id, provider: 'fixture', gatewayModel: `fixture/${id}`, effort: 'high', billingSource: 'synthetic',
  billingMode: 'subscription', billingVerified: true, purpose: 'Local fixture', contextWindow: 32768, maxTokens: 1024 });
const router = { enabled: true, gateway: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnvVar: 'SA_OPS_KEY' },
  routes: [route('standard'), route('override'), {...route('development'),access:'development-complex-coding'}], defaultRoute: 'standard',
  nativeAgentRoutes: {main:['standard','override','development']},
  trustedSlackChannels: [{ agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'SA_OPS_SLACK' }] };
const config = buildOpenClawFragment(router, join(root, 'plugins/rein-router'));
Object.assign(config, { gateway: { mode: 'local', bind: 'loopback', port: gatewayPort, auth: { mode: 'token', token: 'sa-ops-synthetic-local-token' } },
  cron: { enabled: true }, commands: { ownerAllowFrom: ['slack:UALICE01', 'slack:UBOB0001'] }, channels: { slack: { enabled: true }, discord: { enabled: true } },
  tools: { sessions: { visibility: 'tree' }, agentToAgent: { enabled: true, allow: ['main', 'worker'] } }, memory: { search: { enabled: false } },
  bindings: [{ agentId: 'main', match: { channel: 'slack' } }, { agentId: 'public', match: { channel: 'discord' } }],
  agents: { ownership: 'explicit', defaults: { workspace: join(temp, 'workspace'), skipBootstrap: true, model: { primary: 'rein-magpie/standard', fallbacks: [] },
    compaction: { memoryFlush: { enabled: false } } }, entries: { main: { tools: { allow: ['automations', 'sessions_spawn', 'read'] } },
      public: { tools: { allow: ['automations', 'sessions_spawn', 'sessions_send', 'read'] } } } } });
config.models.catalogRefresh = { enabled: false };
const fixture = join(temp, 'fixture');
writeFileSync(join(fixture, 'index.ts'), readFileSync(join(root, 'tests/fixtures/sa-ops-cron-native.ts')));
symlinkSync(join(root, 'plugins/rein-router/node_modules'), join(fixture, 'node_modules'));
writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: '@rein/sa-ops-cron-fixture', version: '0.1.0', type: 'module', openclaw: { extensions: ['./index.ts'] } }));
writeFileSync(join(fixture, 'openclaw.plugin.json'), JSON.stringify({ id: 'sa-ops-cron-fixture', channels: ['slack', 'discord'],
  channelConfigs: Object.fromEntries(['slack', 'discord'].map(id => [id, { label: id, schema: { type: 'object', properties: { enabled: { type: 'boolean' } }, additionalProperties: false } }])),
  activation: { onStartup: true }, configSchema: { type: 'object', properties: {}, additionalProperties: false } }));
config.plugins.allow.push('sa-ops-cron-fixture', 'openai'); config.plugins.load.paths.unshift(fixture);
config.plugins.entries['sa-ops-cron-fixture'] = { enabled: true, hooks: { allowConversationAccess: true } };
config.plugins.entries['rein-router'].hooks = { allowConversationAccess: true };
config.plugins.entries.slack = { enabled: false }; config.plugins.entries.discord = { enabled: false };
const configPath = join(temp, 'openclaw.json'); writeFileSync(configPath, JSON.stringify(config));
const env = { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'),
  OPENCLAW_STATE_DIR: join(temp, 'state'), OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_SKIP_BUNDLED_DOCTOR: '1',
  SA_OPS_EVIDENCE: evidencePath, SA_OPS_SLACK: 'xoxb-synthetic', SA_OPS_KEY: 'sk-magpie-key-synthetic-sa-ops-0000000000' };
let child, output = '';
async function start(phase) {
  child = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'gateway', 'run', '--allow-unconfigured'], {
    cwd: upstream, env: { ...env, SA_OPS_PHASE: phase }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
}
async function stop() {
  if (!child) return;
  const current = child; child = undefined;
  const stopped = new Promise(resolve => current.once('exit', resolve));
  try { process.kill(-current.pid, 'SIGTERM'); } catch {}
  await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 4000))]);
  try { process.kill(-current.pid, 'SIGKILL'); } catch {}
}
async function waitFor(check, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (!check(readEvidence())) {
    const evidence = readEvidence(); assert.ok(!evidence.error, evidence.error);
    if (Date.now() > deadline) throw Error('Native fixture deadline; inspect gateway.log');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
try {
  await start('create'); await waitFor(e => e.done);
  const before = readEvidence(); writeFileSync(join(temp, 'before-restart.json'), JSON.stringify(before));
  assert.equal(before.runs.filter(run => run.trigger === 'cron').length, 0, 'restart before due time');
  const a = before.jobs.find(job => job.name === 'job-a'), b = before.jobs.find(job => job.name === 'job-b');
  assert.ok(a && b, 'native tool created both jobs');
  assert.match(a.description, /user=UALICE01\]/); assert.match(b.description, /user=UBOB0001\]/);
  assert.ok(!a.description.includes('UFORGED1')); assert.equal(a.owner.sessionKey, b.owner.sessionKey);
  const snapshot = step => before.lifecycle.find(row => row.step === step).jobs;
  assert.equal(snapshot('SA_DISABLE_A').find(job => job.name === 'job-a').enabled, false);
  assert.equal(snapshot('SA_ENABLE_A').find(job => job.name === 'job-a').enabled, true);
  assert.match(snapshot('SA_UPDATE_A').find(job => job.name === 'job-a').description, /user=UALICE01\]/);
  assert.equal(snapshot('SA_DECLARE_A').filter(job => job.name === 'job-a').length, 1);
  assert.ok(before.contexts.some(ctx => ctx.requester?.senderId === 'UALICE01' && ctx.requester.senderIsOwner === true));
  assert.ok(before.contexts.some(ctx => ctx.requester?.senderId === 'UBOB0001' && ctx.requester.senderIsOwner === true));
  assert.ok(before.contexts.some(ctx => ctx.requester?.senderId === 'UNOOWNER1' && ctx.requester.senderIsOwner === false));
  assert.ok(before.tools.some(tool => /Unknown tool id: automations/.test(tool.error ?? '')), 'native non-owner automation denial');
  assert.ok(before.tools.some(tool => /agentId is not allowed for sessions_spawn/.test(tool.error ?? '')), 'native public spawn denial');
  assert.ok(before.tools.some(tool => tool.name === 'sessions_send' && tool.result?.details?.status === 'forbidden'), 'native public send denial with allowed internal collaboration still enabled');
  // Pinned native output-schema validation can report an error after committing enable.
  // Never retry that mutation: the actual store snapshots above establish its state.
  assert.equal(before.jobs.some(job => ['removed', 'public-forbidden', 'native-owner-denied'].includes(job.name)), false);
  assert.ok(before.runs.some(run=>run.sessionKey?.includes(':subagent:')), 'actual native child launched');
  assert.ok(before.sent.some(row=>row.text?.includes('ACK SA_CHILD_RESULT')), 'actual child result returned through parent');
  await stop();
  config.agents.entries.main.model = {primary:'rein-magpie/development',fallbacks:[]};
  writeFileSync(configPath, JSON.stringify(config));
  writeFileSync(evidencePath, '{}'); await start('run');
  await waitFor(e => e.sent?.some(row => row.text?.includes('ACK SA_CRON_A')) && e.sent?.some(row => row.text?.includes('ACK SA_CRON_B')), 75000);
  const after = readEvidence();
  const cron = after.runs.filter(run => run.trigger === 'cron');
  assert.equal(cron.length, 2); assert.ok(cron.every(run => !run.senderId));
  assert.deepEqual(cron.map(run => run.model).sort(), ['development', 'override']);
  assert.ok(after.jobs.find(job => job.name === 'disabled').enabled === false);
  writeFileSync(join(temp, 'model-requests.json'), JSON.stringify(requests));
  console.log('PASS: actual native automations/scheduler/store; two-user audit/update/declaration, disable/enable/remove, public refusal, actual native child launch/result, restart, senderless development subscription default+override execution. No live Slack or external inference.');
} finally {
  await stop(); writeFileSync(join(temp, 'gateway.log'), output);
  writeFileSync(join(temp, 'model-requests.json'), JSON.stringify(requests));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
