import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creationPlan, nativeAgentCreation } from '../plugins/rein-acp/agent-creation.mjs';
import { createTaskLoop } from '../plugins/rein-acp/task-loop.mjs';
import { validateAcpConfig } from '../plugins/rein-acp/runtime.mjs';

const channel = 'CDEVELOP1', owner = 'UOWNER01';
const config = { enabled: true, taskLoop: true, channel: { channelId: 'CTEST001', workspaceId: 'TTEST001',
  accountId: 'default', agentId: 'main', botTokenEnvVar: 'SLACK_TOKEN' }, harnessAgentId: 'codex', cwd: '/tmp/fixture',
  additionalChannelIds: [channel], agentCreationChannelId: channel };
const request = { action: 'create_agent', agentId: 'cmo' };

async function fixture({ senderId = owner, chatId = channel, trigger = 'user', service } = {}) {
  let member = true, namedOwners = ['slack:' + owner], creations = 0;
  const src = { trigger, agentId: 'main', accountId: 'default', channel: 'slack', chatId, senderId,
    runId: 'r', sessionId: 's', sessionKey: 'agent:main:slack:channel:' + chatId.toLowerCase() + ':thread:100.01' };
  const api = createTaskLoop({ config, authorize: async () => member,
    liveConfig: () => ({ commands: { ownerAllowFrom: namedOwners }, plugins: { entries: { 'rein-acp': { config } } } }),
    agentCreation: service ?? { plan: args => creationPlan('/state', args), async create(plan, check) {
      await check(); creations++; return { status: 'created', agentId: plan.id };
    } },
  });
  await api.beforeAgentRun({}, src);
  const invocation = { ...src, toolCallId: 'call', requester: { channel: 'slack', accountId: 'default', senderId } };
  const tool = api.toolFactory.create({ ...src, requesterSenderId: senderId, assertInvocationCurrent() {} });
  return { api, src, gate: (args = request, compact = false) => api.beforeToolCall(compact
    ? { toolName: 'tool_call', params: { id: 'rein_task', args } } : { toolName: 'rein_task', params: args }, invocation),
    execute: (args = request) => tool.execute('call', args), leave: () => { member = false; },
    revoke: () => { namedOwners = []; }, count: () => creations };
}

test('creation requires a canonical fresh ID and an opted-in development channel', () => {
  assert.equal(validateAcpConfig(config).agentCreationChannelId, channel);
  assert.throws(() => validateAcpConfig({ ...config, agentCreationChannelId: 'COTHER01' }));
  for (const id of ['main','openclaw','crestodian','constructor','../project','--bind','CMO','x\ny'])
    assert.throws(() => creationPlan('/state', { ...request, agentId: id }));
  assert.throws(() => creationPlan('/state', { ...request, workspace: '/etc' }));
  assert.deepEqual(creationPlan('/state', request), { id: 'cmo', workspace: '/state/workspace-cmo', agentDir: '/state/agents/cmo/agent' });
});

test('gateway owner in the configured Slack thread can create once after reviewing native approval', async () => {
  const f = await fixture();
  assert.equal(await f.gate(request, true), undefined);
  const { requireApproval } = await f.gate();
  assert.match(requireApproval.description, /agents.entries.cmo/);
  assert.deepEqual(requireApproval.allowedDecisions, ['allow-once','deny']);
  requireApproval.onResolution('allow-once');
  assert.equal((await f.execute()).details.status, 'created');
  await assert.rejects(f.execute());
  assert.equal(f.count(), 1);
});

test('another member, another channel and a background run cannot request creation', async () => {
  for (const opts of [{ senderId: 'UMEMBER1' }, { chatId: 'CTEST001' }, { trigger: 'cron' }]) {
    const f = await fixture(opts);
    for (const compact of [true,false]) assert.equal((await f.gate(request, compact)).block, true);
    assert.equal(f.count(), 0);
  }
});

test('missing approval, timeout, changed arguments, revocation or a retired turn makes no change', async () => {
  for (const scenario of ['none','deny','timeout','allow-always','retarget','extra','action','leave','revoke','ended']) {
    const f = await fixture();
    const gate = await f.gate();
    if (scenario !== 'none') gate.requireApproval.onResolution(['deny','timeout','allow-always'].includes(scenario) ? scenario : 'allow-once');
    if (scenario === 'leave') f.leave();
    if (scenario === 'revoke') f.revoke();
    if (scenario === 'ended') f.api.agentEnd({}, f.src);
    const args = { ...request };
    if (scenario === 'retarget') args.agentId = 'other';
    if (scenario === 'extra') args.bind = 'slack';
    if (scenario === 'action') args.action = 'stop';
    await assert.rejects(f.execute(args));
    assert.equal(f.count(), 0);
  }
});

test('approved calls persist through the pinned CLI and preserve existing agents and directories on retry', {
  skip: process.env.NORI_NATIVE_AGENT_CREATION_TEST !== '1' && 'requires the built OpenClaw CLI',
}, async t => {
  const stateDir = await mkdtemp(join(tmpdir(), 'nori-agent-creation-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const configPath = join(stateDir, 'openclaw.json');
  const main = { name: 'Main', workspace: join(stateDir, 'main') };
  await writeFile(configPath, JSON.stringify({ gateway: { mode: 'local' }, agents: {
    defaults: { systemAgent: { agentId: 'main' } }, entries: { main },
  } }));
  const service = nativeAgentCreation({ stateDir,
    runtimeSource: fileURLToPath(new URL('../plugins/rein-acp/index.ts', import.meta.url)),
    env: { PATH: process.env.PATH, HOME: stateDir, OPENCLAW_CONFIG_PATH: configPath },
  });
  async function approvedRequest(agentId) {
    const f = await fixture({ service });
    const args = { action: 'create_agent', agentId };
    const { requireApproval } = await f.gate(args);
    requireApproval.onResolution('allow-once');
    return (await f.execute(args)).details;
  }
  assert.equal((await approvedRequest('cmo')).status, 'created');
  const stored = await readFile(configPath, 'utf8');
  const entries = JSON.parse(stored).agents.entries;
  assert.deepEqual(entries.main, main);
  assert.equal(entries.cmo.workspace, join(stateDir, 'workspace-cmo'));
  assert.equal(entries.cmo.agentDir, join(stateDir, 'agents', 'cmo', 'agent'));
  assert.equal((await approvedRequest('cmo')).status, 'already_exists');
  await mkdir(join(stateDir, 'workspace-taken'));
  await assert.rejects(approvedRequest('taken'), /agent_creation_directory_conflict/);
  assert.equal(await readFile(configPath, 'utf8'), stored);
});
