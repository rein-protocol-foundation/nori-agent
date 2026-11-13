import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as socketServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, upstream } from './runtime-env.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';
import { selectContinuationChildInput } from '../tests/fixtures/task-continuation-model-input.mjs';

assert.ok(existsSync(join(upstream, 'dist')), 'Build the pinned vendor/openclaw runtime first; see docs/setup.md. This probe never installs or builds.');
const temp = mkdtempSync(join(tmpdir(), 'nori-continuation-'));
for (const dir of ['home', 'state', 'tmp', 'workspace', 'fixture']) mkdirSync(join(temp, dir), { mode: 0o700 });
const evidencePath = join(temp, 'evidence.jsonl'), requests = [];
const probeCase = process.argv.find(arg => arg.startsWith('--case='))?.slice(7) ?? 'single';
assert.ok(['single', 'coalesced'].includes(probeCase), 'Use --case=single or --case=coalesced');
const owner = 'agent:main:slack:default:channel:cfixture1';
const evidence = () => existsSync(evidencePath) ? readFileSync(evidencePath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
console.log(`Native continuation seam evidence: ${temp}`);
let phase = 'prepare', fixtureError;
const server = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const part of req) raw += part;
    if (req.method === 'GET') { res.end(JSON.stringify({ data: [{ id: 'fixture/standard' }] })); return; }
    const request = JSON.parse(raw);
    if (requests.length >= 24) throw Error('Scripted seam model request bound exceeded');
    const messages = request.messages, all = JSON.stringify(messages);
    const rows = evidence(), main = rows.findLast(e => e.kind === 'run' && e.phase === phase && e.ctx.sessionKey === owner);
    const childInput = selectContinuationChildInput(messages);
    requests.push({ phase, nativeMainRunId: main?.ctx.runId, ...request });
    let action, args, content;
    if (phase === 'prepare') {
      if (main?.prompt.includes('CONTINUATION_OTHER')) content = 'CONTINUATION_OTHER_ACK';
      else if (!rows.some(e => e.kind === 'tool' && e.runId === main?.ctx.runId && e.event.toolName === 'continuation_probe')) {
        action = 'continuation_probe'; args = { action: 'prepare', probeKey: main?.prompt.includes('CONTINUATION_SECOND_INTAKE') ? 'b' : 'a' };
      }
      else content = 'CONTINUATION_PREPARED';
    } else if (childInput === 'gap') {
      const deadline = Date.now() + 20000;
      while (!evidence().some(e => e.kind === 'agent-ended' && e.phase === 'recover' && e.sessionKey === 'agent:main:slack:default:channel:cfixture1')) {
        if (Date.now() > deadline || res.destroyed) throw Error('Requester recovery turn did not finish');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      content = 'CONTINUATION_GAP_RESULT: source and fit present; eligibility omitted.';
    } else if (childInput === 'supplement') {
      const deadline = Date.now() + 20000;
      while (!evidence().some(e => e.kind === 'holding')) {
        if (Date.now() > deadline || res.destroyed) throw Error('Active handoff hold was not reached');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      content = 'CONTINUATION_CHILD_RESULT: synthetic source verifies eligibility.';
    } else if (probeCase === 'coalesced') {
      const inventory = rows.find(e => e.kind === 'recovered-inventory');
      content = `CONTINUATION_COALESCED_RESULT ${inventory.flows.map(f => `${f.stateJson.probeKey}=${f.flowId}`).join(' ')}`;
    } else {
      if (!main) throw Error('No actual native requester context');
      const completion = main.ctx.inputProvenance?.kind === 'inter_session';
      const source = rows.find(e => e.kind === 'tool' && e.event.toolName === 'sessions_spawn' && e.event.result?.details?.childSessionKey === main.ctx.inputProvenance?.sourceSessionKey);
      if (source?.event.params.label === 'continuation-seam-supplement') throw Error('Supplement unexpectedly created a fresh requester turn instead of active handoff');
      const count = rows.filter(e => e.kind === 'tool' && e.runId === main.ctx.runId && ['continuation_probe', 'sessions_spawn'].includes(e.event.toolName)).length;
      if (count === 0) { action = 'continuation_probe'; args = { action: 'observe' }; }
      else if (count === 1) {
        action = 'sessions_spawn'; args = { task: completion ? 'CONTINUATION_SUPPLEMENT_CHILD: find synthetic eligibility evidence' : 'CONTINUATION_GAP_CHILD: synthetic shortlist with omitted eligibility',
          label: completion ? 'continuation-seam-supplement' : 'continuation-seam-initial', runtime: 'subagent', mode: 'run', cleanup: 'keep', runTimeoutSeconds: 20 };
      } else if (count === 2) { action = 'continuation_probe'; args = { action: 'link' }; }
      else if (count === 3 && completion) { action = 'continuation_probe'; args = { action: 'hold' }; }
      else content = all.includes('CONTINUATION_CHILD_RESULT') ? 'CONTINUATION_SEAM_COMPLETE: synthetic eligibility reviewed.' : 'CONTINUATION_RECOVERY_REVIEWED';
    }
    const delta = action ? { role: 'assistant', tool_calls: [{ index: 0, id: `continuation-${requests.length}`, type: 'function', function: { name: 'tool_call', arguments: JSON.stringify({ id: action, args }) } }] } : { role: 'assistant', content };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const base = { id: 'continuation-fixture', object: 'chat.completion.chunk', created: 1, model: request.model };
    res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: action ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
  } catch (error) { fixtureError = String(error); if (!res.destroyed) { res.writeHead(500); res.end(JSON.stringify({ error: fixtureError })); } }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const socket = socketServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const fixture = join(temp, 'fixture');
writeFileSync(join(fixture, 'index.ts'), readFileSync(join(root, 'tests/fixtures/task-continuation.ts')));
symlinkSync(join(root, 'plugins/rein-router/node_modules'), join(fixture, 'node_modules'));
writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: '@rein/continuation-fixture', type: 'module', openclaw: { extensions: ['./index.ts'] } }));
writeFileSync(join(fixture, 'openclaw.plugin.json'), JSON.stringify({ id: 'task-continuation-fixture', channels: ['slack'], activation: { onStartup: true }, contracts: { tools: ['continuation_probe'] },
  channelConfigs: { slack: { label: 'Synthetic Slack', schema: { type: 'object', properties: { enabled: { type: 'boolean' } }, additionalProperties: false } } }, configSchema: { type: 'object', properties: {}, additionalProperties: false } }));
const router = { enabled: true, gateway: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnvVar: 'CONTINUATION_KEY' },
  routes: [{ id: 'standard', provider: 'fixture', gatewayModel: 'fixture/standard', effort: 'high', billingSource: 'synthetic', billingMode: 'subscription', billingVerified: true, purpose: 'Native continuation fixture', contextWindow: 131072, maxTokens: 2048 }], defaultRoute: 'standard', nativeAgentRoutes: { main: ['standard'] },
  trustedSlackChannels: [{ agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'CONTINUATION_SLACK' }] };
const config = buildOpenClawFragment(router, join(root, 'plugins/rein-router'));
Object.assign(config, { gateway: { mode: 'local', bind: 'loopback', port, auth: { mode: 'token', token: 'continuation-synthetic-gateway' } }, channels: { slack: { enabled: true } }, session: { groupScope: 'per-group' },
  agents: { defaults: { workspace: join(temp, 'workspace'), skipBootstrap: true, heartbeat: { every: '0m', target: 'last' }, model: { primary: 'rein-magpie/standard', fallbacks: [] }, subagents: { runTimeoutSeconds: 20 }, compaction: { memoryFlush: { enabled: false } } },
    entries: { main: { default: true, sandbox: { mode: 'off' }, tools: { elevated: { enabled: false }, allow: ['continuation_probe', 'rein_task', 'sessions_spawn', 'subagents', 'sessions_send', 'sessions_history', 'read', 'exec'] } }, codex: {} } },
  tools: { sessions: { visibility: 'tree' }, agentToAgent: { enabled: true, allow: ['main', 'codex'] } }, acp: { enabled: true, backend: 'synthetic-unused', allowedAgents: ['codex'] }, memory: { search: { enabled: false } }, bindings: [{ agentId: 'main', match: { channel: 'slack' } }] });
config.models.catalogRefresh = { enabled: false };
config.plugins.allow.push('task-continuation-fixture', 'rein-acp', 'openai'); config.plugins.load.paths.unshift(fixture, join(root, 'plugins/rein-acp'));
config.plugins.entries['task-continuation-fixture'] = { enabled: true, hooks: { allowConversationAccess: true } };
config.plugins.entries['rein-acp'] = { enabled: true, hooks: { allowConversationAccess: true, allowPromptInjection: true }, config: { enabled: true, taskLoop: true,
  channel: { agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'CONTINUATION_SLACK' }, harnessAgentId: 'codex', cwd: join(temp, 'workspace') } };
config.plugins.entries.slack = { enabled: false }; config.plugins.entries['rein-router'].hooks = { allowConversationAccess: true };
const configPath = join(temp, 'openclaw.json'); writeFileSync(configPath, JSON.stringify(config));
const env = { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'), OPENCLAW_STATE_DIR: join(temp, 'state'), OPENCLAW_CONFIG_PATH: configPath,
  CONTINUATION_CASE: probeCase, CONTINUATION_OWNER: owner, CONTINUATION_EVIDENCE: evidencePath, CONTINUATION_SLACK: 'xoxb-synthetic', CONTINUATION_KEY: 'sk-magpie-key-synthetic-continuation-000000000000', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BUNDLED_DOCTOR: '1' };
let child, log = '';
const stop = async () => { if (!child) return; const done = new Promise(resolve => child.once('exit', resolve)); try { process.kill(-child.pid, 'SIGTERM'); } catch {} await Promise.race([done, new Promise(resolve => setTimeout(resolve, 4000))]); try { process.kill(-child.pid, 'SIGKILL'); } catch {} child = undefined; };
const waitFor = async check => { const end = Date.now() + 60000; while (!check()) { const error = fixtureError ?? evidence().find(e => e.kind === 'fixture-error')?.error; if (error || Date.now() > end || child?.exitCode != null || /failed during register|gateway_start hook failed/.test(log)) throw Error(`Native seam deadline/refusal: ${error ?? ''}\n${log.slice(-6000)}`); await new Promise(resolve => setTimeout(resolve, 100)); } };
try {
  const inspected = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'plugins', 'inspect', 'rein-acp', '--runtime', '--json'], { cwd: upstream, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(join(temp, 'loader.log'), inspected.stdout + inspected.stderr);
  assert.equal(inspected.status, 0, inspected.stderr || inspected.stdout);
  assert.equal(JSON.parse(inspected.stdout).plugin.imported, true);
  for (phase of ['prepare', 'recover']) {
    child = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'gateway', 'run', '--allow-unconfigured'], { cwd: upstream, env: { ...env, CONTINUATION_PHASE: phase }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const pid = child.pid;
    const capture = data => { log += data; writeFileSync(join(temp, 'gateway.log'), log); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    await waitFor(() => evidence().some(e => phase === 'prepare' ? e.kind === 'prepare-done' : e.kind === 'sent' && e.text.includes(probeCase === 'coalesced' ? 'CONTINUATION_COALESCED_RESULT' : 'CONTINUATION_SEAM_COMPLETE')));
    writeFileSync(join(temp, `${phase}-pid.json`), JSON.stringify({ pid }));
    await stop();
  }
  const rows = evidence(), wake = rows.find(e => e.kind === 'run' && e.phase === 'recover' && e.ctx.sessionKey === owner && e.ctx.inputProvenance?.sourceTool === 'background-task');
  assert.notEqual(JSON.parse(readFileSync(join(temp, 'prepare-pid.json'))).pid,
    JSON.parse(readFileSync(join(temp, 'recover-pid.json'))).pid, 'recovery must use a different Gateway process');
  assert.ok(wake, 'actual startup wake must reach agent execution');
  assert.equal(wake.ctx.inputProvenance?.kind, 'internal_system'); assert.ok(!wake.ctx.senderId, 'no fabricated online human');
  assert.equal(wake.ctx.trigger, 'heartbeat');
  assert.ok(requests.some(r => r.nativeMainRunId === wake.ctx.runId && JSON.stringify(r.messages).includes('CONTINUATION_RECOVERY')), 'persisted recovery event must reach native model input');
  assert.ok(rows.some(e => e.kind === 'keyed-store-refused' && e.code === 'PLUGIN_TRUST_REFUSED'), 'keyed store refusal must remain a negative assertion');
  if (probeCase === 'coalesced') {
    const inventory = rows.find(e => e.kind === 'recovered-inventory'), sent = rows.filter(e => e.kind === 'sent' && e.text.includes('CONTINUATION_COALESCED_RESULT'));
    const coalescedInput = requests.find(r => r.nativeMainRunId === wake.ctx.runId && inventory.flows.every(f => JSON.stringify(r.messages).includes(`CONTINUATION_RECOVERY flow=${f.flowId}`)));
    assert.ok(coalescedInput, 'coalescence case must actually present both persisted events in one native turn');
    const mismatches = inventory.flows.filter(flow => !sent.some(s => s.accountId === flow.requesterOrigin.accountId && s.to === flow.requesterOrigin.to && String(s.threadId) === String(flow.requesterOrigin.threadId) && s.text.includes(`${flow.stateJson.probeKey}=${flow.flowId}`)));
    const result = { probeCase, coalescedNativeRunId: wake.ctx.runId, bothFlowEventsInOneNativeTurn: true, persistedOrigins: inventory.flows.map(f => ({ flowId: f.flowId, probeKey: f.stateJson.probeKey, origin: f.requesterOrigin })), actualDeliveries: sent, mismatchedFlowIds: mismatches.map(f => f.flowId) };
    writeFileSync(join(temp, 'result.json'), JSON.stringify(result, null, 2));
    assert.equal(mismatches.length, 0, 'Coalesced per-flow results must each reach their own captured original thread');
    console.log('PASS: coalesced same-owner flows preserve each original thread.');
  } else {
  assert.ok(rows.some(e => e.kind === 'observed' && e.phase === 'recover' && e.flow?.stateJson?.scopeRevision === 1));
  assert.ok(rows.some(e => e.kind === 'tool' && e.event.toolName === 'sessions_spawn' && e.event.result?.details?.status === 'accepted'), 'wake must retain native delegation');
  const handoff = rows.find(e => e.kind === 'run' && e.phase === 'recover' && e.ctx.inputProvenance?.sourceTool === 'subagent_announce' && e.ctx.sessionKey === wake.ctx.sessionKey);
  assert.ok(handoff, 'initial child must trigger a fresh native completion review');
  assert.ok(rows.some(e => e.kind === 'tool' && e.runId === handoff.ctx.runId && e.event.toolName === 'sessions_spawn' && e.event.result?.details?.status === 'accepted'), 'native completion must retain follow-up delegation authority');
  assert.ok(requests.some(r => r.nativeMainRunId === handoff.ctx.runId && JSON.stringify(r.messages).includes('CONTINUATION_CHILD_RESULT')), 'supplement completion must reach the active native handoff turn');
  const linked = rows.filter(e => e.kind === 'linked'); assert.equal(linked.length, 2);
  assert.ok(linked.every(e => e.linked.created && e.linked.task.parentFlowId === e.flowId && e.retainedCanonical.id === e.canonical.id));
  const accepted = rows.filter(e => e.kind === 'tool' && e.event.toolName === 'sessions_spawn' && e.event.result?.details?.status === 'accepted');
  assert.equal(accepted.length, 2, 'linkage must not duplicate native spawn acceptance');
  const childRuns = rows.filter(e => e.kind === 'run' && e.phase === 'recover' && e.ctx.sessionKey.startsWith('agent:main:subagent:'));
  assert.equal(childRuns.length, 2, 'linkage must not create additional child executions');
  assert.deepEqual(new Set(childRuns.map(e => e.ctx.runId)), new Set(accepted.map(e => e.event.result.details.runId)));
  assert.ok(rows.some(e => e.kind === 'sent' && e.text.includes('CONTINUATION_SEAM_COMPLETE') && e.to === 'channel:CFIXTURE1' && String(e.threadId) === '1000.001'));
  writeFileSync(join(temp, 'result.json'), JSON.stringify({ probeCase, wake: wake.ctx, handoff: handoff.ctx, linked, passed: true }, null, 2));
  console.log('PASS: native loader, two actual Gateway processes, persisted managed flow/configured owner, senderless startup wake, Router inference, fresh/active native completion follow-up, real child linkage and original-thread completion. Keyed state refused as expected; synthetic transport/model only.');
  }
} finally {
  await stop(); writeFileSync(join(temp, 'gateway.log'), log); writeFileSync(join(temp, 'model-requests.json'), JSON.stringify(requests));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
