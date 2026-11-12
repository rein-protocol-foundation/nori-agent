import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as socketServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, cpSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { root, upstream } from './runtime-env.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';
import { selectM1ModelInput as currentInput } from '../tests/fixtures/m1-model-input.mjs';

assert.ok(existsSync(join(upstream, 'dist')), 'Parent must finish the pinned native build first; this script never installs/builds.');
const temp = mkdtempSync(join(tmpdir(), 'nori-m1-'));
for (const dir of ['home', 'state', 'tmp', 'workspace', 'fixture']) mkdirSync(join(temp, dir), { mode: 0o700 });
console.log(`M1 synthetic evidence: ${temp}`);
const evidencePath = join(temp, 'evidence.json'), requests = [];
const evidence = () => existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath)) : {};
const tools = () => evidence().tools ?? [];
const spawned = label => tools().find(t => t.name === 'sessions_spawn' && t.params?.label === label && t.result?.details?.status === 'accepted')?.result.details;
const controlled = () => tools().filter(t => t.name === 'rein_task');
const nativeId = label => controlled().findLast(t => t.params?.task === spawned(label)?.runId && t.result?.details?.taskId)?.result.details.taskId;
const shortlist = 'M1_SHORTLIST_DATA (all data and sources synthetic):\n1. Example Public Benefit Fund — https://fund-a.example.invalid/criteria — fit: public-benefit operations; eligibility: nonprofit status unknown; priority: high.\n2. Example Civic Institute — https://institute-b.example.invalid/program — fit: civic coordination; eligibility: application cycle unknown; priority: medium.';
let closing = false;
const server = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    if (req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'fixture/standard' }] })); return; }
    const request = JSON.parse(raw || '{}'); assert.ok(Array.isArray(request.messages)); requests.push(request);
    const { at, tag, sourceSessionKey } = currentInput(request.messages);
    const count = request.messages.slice(at + 1).filter(m => m.role === 'tool').length;
    const cancelledReport = controlled().some(t => {
      const d = t.result?.details;
      return d?.childSessionKey === sourceSessionKey && request.messages.some(m =>
        JSON.stringify(m.content).includes(`CANCELLED / OLD-SCOPE REPORT for native task ${d.taskId}, run ${d.runId}.`));
    });
    let name, args, content;
    const acpSpawn = (task, label) => ({ task, label, runtime: 'acp' }); // Host must supply all fixed ACP fields at both compact/canonical boundaries.
    if (tag === 'M1_RESEARCH_START') {
      if (count === 0) { name = 'sessions_spawn'; args = { task: 'M1_RESEARCH_CHILD\nGoal: synthetic funding/partner shortlist.\nCompletion criteria: exactly two entries, each with sources, mission fit, eligibility or explicit unknown, and contact priority; no outreach.', label: 'm1-research', runtime: 'subagent', mode: 'run', cleanup: 'keep' }; }
      else if (count === 1) { name = 'rein_task'; args = { action: 'status', task: spawned('m1-research').runId }; }
      else content = `M1_ACCEPTED task=${nativeId('m1-research')} run=${spawned('m1-research').runId}; goal: two funding/partner candidates; criteria: sources, fit, eligibility/unknown, priority; research only.`;
    } else if (['M1_RESEARCH_CHANGE_START', 'M1_RESEARCH_STOP_START'].includes(tag)) {
      const label = tag === 'M1_RESEARCH_CHANGE_START' ? 'm1-research-change' : 'm1-research-stop';
      if (!count) { name = 'sessions_spawn'; args = { task: `${tag === 'M1_RESEARCH_CHANGE_START' ? 'M1_RESEARCH_CHANGE_CHILD' : 'M1_RESEARCH_STOP_CHILD'}\nGoal: held synthetic research.\nCompletion criteria: revised shortlist or explicit stopped report. No outreach.`, label, runtime: 'subagent', mode: 'run', cleanup: 'keep' }; }
      else if (count === 1) { name = 'rein_task'; args = { action: 'status', task: spawned(label).runId }; }
      else content = `M1_RESEARCH_CONTROL_ACCEPTED task=${nativeId(label)} run=${spawned(label).runId}`;
    } else if (['M1_RESEARCH_CHANGE_CHILD', 'M1_RESEARCH_STOP_CHILD'].includes(tag)) {
      while (!(tag === 'M1_RESEARCH_CHANGE_CHILD' ? evidence().researchControlReleased : evidence().researchStopReleased) && !closing && !res.destroyed) await new Promise(resolve => setTimeout(resolve, 25));
      content = 'M1_OLD_RESEARCH_RESULT: synthetic partial shortlist; no outreach performed; unknown eligibility.';
    } else if (tag === 'M1_RESEARCH_CHANGE') {
      if (!count) { name = 'rein_task'; args = { action: 'change', task: spawned('m1-research-change').runId, goal: 'M1_RESEARCH_REPLACEMENT', criteria: 'New synthetic two-entry shortlist; sources, fit, unknown eligibility and priority. No outreach.' }; }
      else if (count === 1) { name = 'sessions_spawn'; args = { task: controlled().findLast(t => t.params?.action === 'change')?.result?.details?.replacementTask ?? 'Unconfirmed research replacement must be blocked', label: 'm1-research-replacement', runtime: 'subagent', mode: 'run', cleanup: 'keep' }; }
      else if (count === 2 && spawned('m1-research-replacement')) { name = 'rein_task'; args = { action: 'status', task: spawned('m1-research-replacement').runId }; }
      else content = 'M1_RESEARCH_CHANGE_REPORTED: native cancellation and settlement result; new scope only if confirmed.';
    } else if (tag === 'M1_RESEARCH_STOP') {
      if (!count) { name = 'rein_task'; args = { action: 'stop', task: spawned('m1-research-stop').runId }; } else content = 'M1_RESEARCH_STOP_REPORTED: native cancellation result; no replacement.';
    } else if (tag === 'M1_RESEARCH_REPLACEMENT') content = shortlist;
    else if (tag === 'M1_RESEARCH_CHILD') {
      while (!evidence().researchReleased && !closing) await new Promise(resolve => setTimeout(resolve, 25));
      content = shortlist;
    } else if (tag === 'M1_UNRELATED_CHAT') content = 'M1_UNRELATED_REPLY: unrelated chat answered while research remains active.';
    else if (tag === 'M1_RESEARCH_STATUS') { if (!count) { name = 'rein_task'; args = { action: 'status', task: spawned('m1-research').runId }; } else content = 'M1_STATUS: native child is active; goal is the two-entry shortlist; no additional native progress detail yet.'; }
    else if (tag === 'M1_RESEARCH_COMPLETION') content = cancelledReport
      ? `M1_CANCELLED_REPORT source=${sourceSessionKey}: cancelled/old scope; partial research only, no outreach performed; cannot satisfy the revised goal.`
      : `M1_SHORTLIST_FINAL: checked exactly two entries; each has a source, fit, eligibility explicitly unknown, and priority. Synthetic fixture, not live research.\n${shortlist}`;
    else if (['M1_MIDTURN_REVOKED_READ', 'M1_MIDTURN_REVOKED_LIST'].includes(tag)) { if (!count) { name = tag.endsWith('LIST') ? 'sessions_list' : 'sessions_history'; args = name === 'sessions_history' ? { sessionKey: spawned('m1-research').childSessionKey, limit: 4 } : { limit: 4, messageLimit: 1 }; } else content = 'M1_MIDTURN_REFUSED'; }
    else if (tag === 'M1_FOREIGN_READ') { if (!count) { name = 'sessions_history'; args = { sessionKey: spawned('m1-research').childSessionKey, limit: 3 }; } else content = 'M1_SCOPE_REFUSED'; }
    else if (tag === 'M1_FOREIGN_STOP') { if (!count) { name = 'subagents'; args = { action: 'cancel', taskId: nativeId('m1-research') }; } else content = 'M1_SCOPE_REFUSED'; }
    else if (tag === 'M1_FOREIGN_CHANGE') { if (!count) { name = 'sessions_send'; args = { sessionKey: spawned('m1-research').childSessionKey, mode: 'steer', message: 'Unauthorized changed scope' }; } else content = 'M1_SCOPE_REFUSED'; }
    else if (tag === 'M1_ACP_START' || tag === 'M1_ACP_FAIL_START') {
      const label = tag === 'M1_ACP_START' ? 'm1-acp-slow' : 'm1-acp-fail';
      if (!count) { name = 'sessions_spawn'; args = acpSpawn(`${tag === 'M1_ACP_START' ? 'M1_ACP_SLOW' : 'M1_ACP_FAIL'}\nGoal: bounded synthetic coding task.\nCompletion criteria: report result and validation.`, label); }
      else if (count === 1) { name = 'rein_task'; args = { action: 'status', task: spawned(label).runId }; }
      else content = `M1_ACP_ACCEPTED ${label} task=${nativeId(label)} run=${spawned(label).runId}`;
    } else if (['M1_ACP_CHANGE_PENDING', 'M1_ACP_CHANGE_FAILED', 'M1_ACP_CHANGE_SETTLED'].includes(tag)) {
      const label = tag === 'M1_ACP_CHANGE_FAILED' ? 'm1-acp-fail' : 'm1-acp-slow';
      if (!count) { name = 'rein_task'; args = { action: 'change', task: spawned(label).runId, goal: 'M1_ACP_REPLACEMENT revised bounded task', criteria: 'Report the new run result and synthetic validation; older scope cannot satisfy it.' }; }
      else if (count === 1) {
        const changed = controlled().findLast(t => t.params?.action === 'change')?.result?.details;
        name = 'sessions_spawn'; args = acpSpawn(changed?.replacementTask ?? 'Unconfirmed replacement must be blocked', 'm1-acp-replacement');
      } else if (count === 2 && tag === 'M1_ACP_CHANGE_SETTLED') { name = 'rein_task'; args = { action: 'status', task: spawned('m1-acp-replacement').runId }; }
      else content = `${tag}_REPORTED: cancellation plus fresh delegation only after confirmed settlement; pending/failed cancellation starts no replacement. Synthetic partial artifact prepared; external send outcome uncertain; cancellation is not rollback.${tag === 'M1_ACP_CHANGE_SETTLED' ? ` Accepted run=${spawned('m1-acp-replacement').runId} session=${spawned('m1-acp-replacement').childSessionKey}; canonical task=${nativeId('m1-acp-replacement') ?? 'not yet available'}; replaces task=${nativeId('m1-acp-slow')} run=${spawned('m1-acp-slow').runId}; revised goal and criteria retained in the accepted native task.` : ''}`;
    } else if (tag === 'M1_ACP_REPLACEMENT_STATUS') {
      if (!count) { name = 'rein_task'; args = { action: 'status', task: spawned('m1-acp-replacement').runId }; }
      else content = `M1_REPLACEMENT_STATUS task=${nativeId('m1-acp-replacement')} run=${spawned('m1-acp-replacement').runId}; current native status and revised criteria observed.`;
    } else if (tag === 'M1_ACP_COMPLETION') {
      content = cancelledReport ? `M1_CANCELLED_REPORT source=${sourceSessionKey}: cancelled/old scope; synthetic partial artifact prepared; external send outcome uncertain; cancellation is not rollback. Cannot satisfy revised goal.` : `M1_ACP_FINAL_REPORT source=${sourceSessionKey}: native child outcome received; synthetic coding result and validation only, no claim of actual edits or deployment.`;
    }
    else content = `M1_ACK ${tag}`;
    const done = !name;
    const delta = done ? { role: 'assistant', content } : { role: 'assistant', tool_calls: [{ index: 0, id: `m1-call-${requests.length}`, type: 'function', function: { name: 'tool_call', arguments: JSON.stringify({ id: name, args }) } }] };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = { id: 'm1-fixture', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason: null }] };
    res.end(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: done ? 'stop' : 'tool_calls' }] })}\n\ndata: [DONE]\n\n`);
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: String(error) })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const socket = socketServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const gatewayPort = socket.address().port; await new Promise(resolve => socket.close(resolve));
cpSync(join(root, 'workspace/skills/nori-task-loop'), join(temp, 'workspace/skills/nori-task-loop'), { recursive: true });
const fixture = join(temp, 'fixture');
writeFileSync(join(fixture, 'index.ts'), readFileSync(join(root, 'tests/fixtures/m1-slack-task-loop.ts')));
symlinkSync(join(root, 'plugins/rein-router/node_modules'), join(fixture, 'node_modules'));
writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: '@rein/m1-fixture', version: '0.1.0', type: 'module', openclaw: { extensions: ['./index.ts'] } }));
writeFileSync(join(fixture, 'openclaw.plugin.json'), JSON.stringify({ id: 'm1-task-fixture', channels: ['slack'], activation: { onStartup: true },
  channelConfigs: { slack: { label: 'Synthetic Slack', schema: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean' } } } } }, configSchema: { type: 'object', properties: {}, additionalProperties: false } }));
const router = { enabled: true, gateway: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnvVar: 'M1_KEY' },
  routes: [{ id: 'standard', provider: 'fixture', gatewayModel: 'fixture/standard', effort: 'high', billingSource: 'synthetic', billingMode: 'subscription', billingVerified: true, purpose: 'M1 loopback fixture', contextWindow: 131072, maxTokens: 2048 }], defaultRoute: 'standard',
  nativeAgentRoutes: { main: ['standard'], codex: ['standard'] }, trustedSlackChannels: [{ agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'M1_SLACK' }] };
const config = buildOpenClawFragment(router, join(root, 'plugins/rein-router'));
Object.assign(config, { gateway: { mode: 'local', bind: 'loopback', port: gatewayPort, auth: { mode: 'token', token: 'm1-synthetic-gateway' } },
  channels: { slack: { enabled: true } }, session: { dmScope: 'per-account-channel-peer', groupScope: 'per-group' },
  agents: { defaults: { workspace: join(temp, 'workspace'), skipBootstrap: true, heartbeat: { every: '0m' }, model: { primary: 'rein-magpie/standard', fallbacks: [] }, subagents: { runTimeoutSeconds: 120 }, compaction: { memoryFlush: { enabled: false } } },
    entries: { main: { default: true, sandbox: { mode: 'off' }, tools: { elevated: { enabled: false }, allow: ['rein_task', 'sessions_spawn', 'subagents', 'sessions_send', 'sessions_history', 'sessions_list', 'sessions_search', 'session_status', 'sessions', 'apply_patch', 'edit', 'exec', 'process', 'read', 'write'] } }, codex: { workspace: join(temp, 'workspace') }, 'nori-development': { sandbox: { mode: 'all' } } } },
  tools: { sessions: { visibility: 'tree' }, agentToAgent: { enabled: true, allow: ['main', 'codex'] } },
  acp: { enabled: true, backend: 'm1-acp-fixture', defaultAgent: 'codex', allowedAgents: ['codex'] }, memory: { search: { enabled: false } },
  bindings: [{ agentId: 'nori-development', match: { channel: 'slack', peer: { kind: 'channel', id: 'CDEV0001' } } }, { agentId: 'main', match: { channel: 'slack' } }] });
config.models.catalogRefresh = { enabled: false };
config.plugins.allow.push('m1-task-fixture', 'rein-acp', 'openai'); config.plugins.load.paths.unshift(fixture, join(root, 'plugins/rein-acp'));
config.plugins.entries['m1-task-fixture'] = { enabled: true, hooks: { allowConversationAccess: true } };
config.plugins.entries['rein-acp'] = { enabled: true, hooks: { allowConversationAccess: true, allowPromptInjection: true }, config: { enabled: true, taskLoop: true,
  channel: { agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'M1_SLACK' }, harnessAgentId: 'codex', cwd: join(temp, 'workspace') } };
config.plugins.entries.slack = { enabled: false }; config.plugins.entries['rein-router'].hooks = { allowConversationAccess: true };
const configPath = join(temp, 'openclaw.json'); writeFileSync(configPath, JSON.stringify(config));
const env = { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'), OPENCLAW_STATE_DIR: join(temp, 'state'), OPENCLAW_CONFIG_PATH: configPath,
  M1_EVIDENCE: evidencePath, M1_SLACK: 'xoxb-synthetic', M1_KEY: 'sk-magpie-key-synthetic-m1-000000000000', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BUNDLED_DOCTOR: '1' };
let child, log = '';
try {
  const inspection = spawnSync(process.execPath, [join(upstream, 'openclaw.mjs'), 'plugins', 'inspect', 'rein-acp', '--runtime', '--json'], { cwd: upstream, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(join(temp, 'loader.log'), inspection.stdout + inspection.stderr);
  assert.equal(inspection.status, 0, inspection.stderr || inspection.stdout);
  const loaded = JSON.parse(inspection.stdout);
  assert.equal(loaded.plugin.imported, true);
  assert.equal(loaded.diagnostics.filter(d => d.level === 'error').length, 0, JSON.stringify(loaded.diagnostics));
  assert.ok(loaded.tools.some(t => t.names.includes('rein_task')), 'actual loader must register the native task-control tool');
  child = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'gateway', 'run', '--allow-unconfigured'], { cwd: upstream, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
  let exited = false; child.on('exit', () => { exited = true; });
  const deadline = Date.now() + 150000;
  while (!evidence().done && !evidence().error && !exited && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  const e = evidence(); assert.ok(!e.error, `${e.error}\n${log.slice(-5000)}`); assert.equal(e.done, true, log.slice(-7000));
  assert.ok(nativeId('m1-research')); assert.ok(spawned('m1-research').runId);
  assert.ok(e.sent.some(s => s.request === 'M1_UNRELATED_CHAT' && s.text.includes('M1_UNRELATED_REPLY')));
  assert.ok(e.sent.some(s => s.request === 'M1_RESEARCH_STATUS' && s.sender === 'UBOB0001'));
  assert.ok(e.sent.some(s => s.background && s.to === 'channel:CFIXTURE1' && String(s.threadId) === '1000.001' && s.text.includes('M1_SHORTLIST_FINAL')));
  assert.ok(!requests.some(r => /^M1_(NONMEMBER|REVOKED)_/.test(currentInput(r.messages).tag)), 'denied requester must not reach inference');
  assert.equal(e.sent.filter(s => /^M1_(NONMEMBER|REVOKED)_/.test(s.request ?? '')).length, 6, 'nonmember and revoked read/change/stop each refused');
  const midturn = e.tools.filter(t => t.name === 'tool_call' && ['sessions_history', 'sessions_list'].includes(t.params?.id) && t.params.args.limit === 4);
  assert.equal(midturn.length, 2); assert.ok(midturn.every(t => /membership/i.test(t.error ?? '')), JSON.stringify(midturn));
  assert.ok(e.sent.some(s => s.request === 'M1_MIDTURN_REVOKED_READ'));
  const foreign = e.tools.filter(t => (t.name === 'sessions_history' && t.params?.limit === 3) || t.name === 'sessions_send');
  assert.ok(foreign.length >= 8); assert.ok(foreign.every(t => t.result?.details?.status === 'forbidden' || /forbidden|not allowed|outside|not visible/i.test(t.error ?? '')));
  const stops = e.tools.filter(t => t.name === 'subagents' && t.params?.action === 'cancel');
  assert.ok(stops.length >= 4); assert.ok(stops.every(t => t.result?.details?.status === 'forbidden'));
  const researchChange = controlled().find(t => t.params?.action === 'change' && t.params.task === spawned('m1-research-change').runId)?.result?.details;
  assert.equal(researchChange?.replacementAllowed, true, JSON.stringify(researchChange));
  assert.ok(nativeId('m1-research-replacement'));
  assert.notEqual(spawned('m1-research-change').runId, spawned('m1-research-replacement').runId);
  assert.equal(controlled().find(t => t.params?.action === 'stop')?.result?.details?.settled, true);
  const changes = controlled().filter(t => t.params?.action === 'change' && t.params.task !== spawned('m1-research-change').runId).map(t => t.result?.details);
  assert.match(changes[0]?.partialEvidence?.progress ?? '', /external send outcome uncertain/);
  assert.ok(e.sent.some(s => s.request === 'M1_ACP_CHANGE_PENDING' && s.text.includes('external send outcome uncertain')));
  assert.equal(changes[0]?.status, 'cancellation_pending', 'A cancelled native task projection must not imply ACP run cleanup has settled');
  assert.equal(changes[1]?.replacementAllowed, true, JSON.stringify(changes));
  assert.equal(changes[2]?.status, 'cancellation_failed', JSON.stringify(changes));
  assert.equal(e.tools.filter(t => t.name === 'sessions_spawn' && t.params?.label === 'm1-acp-replacement' && t.result?.details?.status === 'accepted').length, 1);
  assert.notEqual(spawned('m1-acp-replacement').runId, spawned('m1-acp-slow').runId);
  assert.ok(nativeId('m1-acp-replacement'));
  assert.notEqual(nativeId('m1-acp-replacement'), nativeId('m1-acp-slow'));
  // ACP stores a summary in its native Task row; the accepted full prompt must reach
  // the native backend unchanged, including the predecessor and revised criteria.
  const db = new DatabaseSync(join(temp, 'state/state/openclaw.sqlite'), { readOnly: true });
  try {
    const row = db.prepare('SELECT task_id, owner_key, task FROM task_runs WHERE run_id = ?').get(spawned('m1-acp-replacement').runId);
    assert.equal(row.task_id, nativeId('m1-acp-replacement'));
    assert.equal(row.owner_key, e.ingress.find(i => i.text === 'M1_ACP_CHANGE_SETTLED').sessionKey);
    assert.ok(row.task.startsWith('Goal: M1_ACP_REPLACEMENT'));
  } finally { db.close(); }
  const replacementInput = e.backend.find(b => b.event === 'start' && b.session === spawned('m1-acp-replacement').childSessionKey)?.text;
  assert.equal(replacementInput, e.tools.find(t => t.name === 'sessions_spawn' && t.params?.label === 'm1-acp-replacement' && t.result?.details?.status === 'accepted').params.task);
  assert.ok(replacementInput.includes(nativeId('m1-acp-slow')), 'actual native backend receives predecessor scope');
  assert.ok(e.sent.some(s => s.request === 'M1_ACP_CHANGE_SETTLED' && s.text.includes(spawned('m1-acp-replacement').runId) && !s.text.includes('undefined')));
  assert.ok(e.sent.some(s => s.request === 'M1_ACP_REPLACEMENT_STATUS' && s.text.includes(nativeId('m1-acp-replacement')) && s.text.includes(spawned('m1-acp-replacement').runId)));
  assert.ok(e.backend.findIndex(b => b.event === 'settled') < e.backend.findIndex(b => b.event === 'start' && b.text.includes('User-directed replacement')));
  assert.ok(e.sent.some(s => s.request === 'M1_ACP_CHANGE_PENDING' && s.sender === 'UBOB0001'), 'second current shared-audience member controls the original native task');
  assert.ok(e.progress.some(p => p.phase === 'started' && String(p.requester?.threadId) === '1000.001'), 'native ACP progress retains original thread');
  assert.ok(e.sent.some(s => s.background && s.to === 'channel:CFIXTURE1' && String(s.threadId) === '1000.001' && s.text.includes('M1_ACP_FINAL_REPORT') && s.text.includes(spawned('m1-acp-replacement').childSessionKey)));
  assert.ok(!e.sent.some(s => s.text.includes('M1_ACP_FINAL_REPORT') && s.text.includes(spawned('m1-acp-slow').childSessionKey)), 'late old-scope completion cannot satisfy revised scope');
  const initial = e.ingress.find(i => i.text === 'M1_RESEARCH_START'), unrelated = e.ingress.find(i => i.text === 'M1_UNRELATED_CHAT');
  assert.equal(initial.sessionKey, unrelated.sessionKey); assert.notEqual(initial.thread, unrelated.thread);
  for (const t of e.tools.filter(t => t.name === 'sessions_spawn' && t.params?.runtime === 'acp' && t.result?.details?.status === 'accepted')) {
    assert.equal(t.params.agentId, 'codex'); assert.equal(t.params.cwd, join(temp, 'workspace'));
    assert.equal(t.params.mode, 'run'); assert.equal(t.params.thread, false); assert.equal(t.params.streamTo, 'parent');
  }
  const originalRun = e.runs.find(r => r.sessionKey === spawned('m1-research-change').childSessionKey), newRun = e.runs.find(r => r.sessionKey === spawned('m1-research-replacement').childSessionKey);
  assert.ok(originalRun.modelProvider); assert.equal(originalRun.modelProvider, newRun.modelProvider); assert.equal(originalRun.modelId, newRun.modelId);
  assert.ok(e.capabilities.find(r => r.runId === originalRun.runId)?.tools.includes('exec'));
  assert.deepEqual(e.capabilities.find(r => r.runId === originalRun.runId)?.tools, e.capabilities.find(r => r.runId === newRun.runId)?.tools);
  for (const label of ['m1-research-change', 'm1-research-stop', 'm1-acp-slow']) assert.ok(e.runs.filter(r => r.provenance?.sourceSessionKey === spawned(label).childSessionKey).length <= 1, 'cancelled native completion must not be converted into delivery retries');
  console.log('PASS: real pinned loader/Gateway/native tasks, shared audience and foreign-scope denials, unrelated chat, original-thread shortlist, ACP pending/settled/failed cancellation and new actual replacement run. All transport/model/research/ACP data synthetic; live acceptance pending.');
} finally {
  closing = true;
  if (child) { const stopped = new Promise(resolve => child.once('exit', resolve)); try { process.kill(-child.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 4000))]); try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  writeFileSync(join(temp, 'gateway.log'), log); writeFileSync(join(temp, 'model-requests.json'), JSON.stringify(requests));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
