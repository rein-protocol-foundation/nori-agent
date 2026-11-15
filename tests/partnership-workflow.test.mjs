import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createPartnershipWorkflow, validatePartnershipConfig, assertPartnershipRuntimeConfig } from '../plugins/rein-partnership/workflow.mjs';
import { createNativeLobster } from '../plugins/rein-partnership/native.mjs';
import { createPartnershipStore } from '../plugins/rein-partnership/store.mjs';

const base = { enabled: true, channel: { accountId: 'default', workspaceId: 'TTEST001', channelId: 'CTEST001', agentId: 'main', botTokenEnvVar: 'SLACK_BOT_TOKEN' },
  from: 'noreply@example.org', testRecipients: ['test@example.org'], approvalTtlMs: 60_000 };
const source = { runId: 'run-1', agentId: 'main', sessionKey: 'agent:main:slack:default:channel:ctest001', senderId: 'UALICE01',
  accountId: 'default', channel: 'slack', chatId: 'CTEST001', trigger: 'user', messageProvider: 'slack', inputProvenance: { kind: 'external_user' } };
const args = { action: 'prepare', sourceTaskId: 'native-research-1', entry: 'Selected institution: example partner; eligibility unverified.',
  to: 'test@example.org', subject: 'Partnership discussion', text: 'Hello,\nDraft text with literal $(not-executed), `not-run`, $HOME and ${material}.\nThank you.' };

async function fixture(t, options = {}) {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'partnership-test-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let now = 1_000_000, member = true, posts = [], previews = [], gets = [];
  const config = validatePartnershipConfig({ ...base, ...options.config });
  const mail = options.mail ?? {
    async send(material, key) { posts.push({ material, key }); return { id: 'receipt-1', provider: 'resend', accepted: true, deliveryVerified: false }; },
    async retrieve(id) { gets.push(id); return { id, from: base.from, to: [args.to], subject: args.subject, text: args.text, last_event: 'delivered' }; },
  };
  const lobster = options.lobster ?? createNativeLobster({ stateDir: path.join(stateDir, 'lobster') });
  const make = (changes = {}) => createPartnershipWorkflow({ config, authorize: async () => member, stateDir, lobster, mail, clock: () => now, ...changes });
  let runtime = make();
  async function prepare(input = {}, context = {}, toolContext = {}) {
    const ctx = { ...source, ...context, runId: randomUUID() };
    await runtime.beforeAgentRun({}, ctx);
    const toolCallId = randomUUID();
    const hook = { ...ctx, toolCallId, requester: { senderId: ctx.senderId, channel: ctx.channel, accountId: ctx.accountId } };
    const blocked = await runtime.beforeToolCall({ toolName: 'rein_partnership', params: { ...args, ...input } }, hook);
    if (blocked?.block) throw Error(blocked.blockReason);
    const tool = runtime.toolFactory.create({ ...ctx, requesterSenderId: ctx.senderId, sandboxed: false, assertInvocationCurrent() {},
      deliveryContext: { channel: 'slack', accountId: 'default', to: 'channel:CTEST001', threadId: '1000.001' },
      delivery: { async send(value) { previews.push(value); } }, ...toolContext });
    return (await tool.execute(toolCallId, { ...args, ...input })).details;
  }
  async function command(command, context = {}) {
    return (await runtime.command({ ...source, args: command.replace(/^\/partnership\s+/, ''), to: 'channel:CTEST001', isAuthorizedSender: true,
      messageThreadId: '1000.001', commandBody: command, ...context })).details;
  }
  return { stateDir, config, lobster, mail, posts, gets, previews, prepare, command,
    restart(changes) { runtime = make(changes); return runtime; }, get runtime() { return runtime; },
    setMember(value) { member = value; }, advance(ms) { now += ms; } };
}

test('real native approval preserves exact material, requires designated approver, and dispatches once', async t => {
  const f = await fixture(t);
  const draft = await f.prepare();
  assert.equal(draft.status, 'awaiting_approval'); assert.equal(f.posts.length, 0);
  assert.ok(f.previews[0].text.includes(draft.material.text));
  assert.ok(f.previews[0].text.includes(draft.approveCommand));
  assert.ok(f.previews[0].text.includes(`Test recipient: ${draft.material.to}`));
  assert.equal(draft.material.text, args.text); assert.match(draft.digest, /^[a-f0-9]{64}$/);
  assert.equal((await f.command(draft.approveCommand, { senderId: 'UBOB0001' })).error, 'partnership_unavailable');
  const accepted = await f.command(draft.approveCommand);
  assert.equal(accepted.status, 'accepted'); assert.equal(accepted.receipt.deliveryVerified, false);
  assert.deepEqual(f.posts[0].material, draft.material); assert.match(f.posts[0].key, /^partnership\//);
  assert.equal((await f.command(draft.approveCommand)).status, 'accepted'); assert.equal(f.posts.length, 1);
  const reconciled = await f.command(`/partnership reconcile ${draft.taskId}`);
  assert.equal(reconciled.receipt.deliveryVerified, true); assert.deepEqual(f.gets, ['receipt-1']); assert.equal(f.posts.length, 1);
  assert.equal((await stat(path.join(f.stateDir, `${draft.taskId}.json`))).mode & 0o777, 0o600);
});

test('restart recovers the identical native checkpoint and decision association', async t => {
  const f = await fixture(t), draft = await f.prepare();
  f.restart({ lobster: createNativeLobster({ stateDir: path.join(f.stateDir, 'lobster') }) });
  const recovered = await f.command(`/partnership status ${draft.taskId}`);
  assert.equal(recovered.digest, draft.digest); assert.equal(recovered.checkpointId, draft.checkpointId); assert.deepEqual(recovered.material, draft.material);
  assert.equal((await f.command(recovered.approveCommand)).status, 'accepted'); assert.equal(f.posts.length, 1);
});

test('denial and duplicate denial never send or reopen the workflow', async t => {
  const f = await fixture(t), draft = await f.prepare();
  assert.equal((await f.command(draft.cancelCommand)).status, 'cancelled');
  assert.equal((await f.command(draft.approveCommand)).status, 'cancelled');
  assert.equal((await f.command(draft.cancelCommand)).status, 'cancelled'); assert.equal(f.posts.length, 0);
});

test('supersession rejects the old material and checkpoint; only exact new draft can send', async t => {
  const f = await fixture(t), old = await f.prepare();
  const revised = await f.prepare({ taskId: old.taskId, expectedVersion: old.version, text: 'Revised exact version.' });
  assert.equal(revised.version, 2); assert.notEqual(revised.digest, old.digest); assert.notEqual(revised.checkpointId, old.checkpointId);
  assert.equal((await f.command(old.approveCommand)).error, 'partnership_decision_stale');
  assert.equal((await f.command(revised.approveCommand)).status, 'accepted'); assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].material.text, 'Revised exact version.');
});

test('expiry, changed approver configuration, and membership revocation block sending', async t => {
  const expired = await fixture(t), draft = await expired.prepare(); expired.advance(60_000);
  assert.equal((await expired.command(draft.approveCommand)).status, 'expired'); assert.equal(expired.posts.length, 0);
  const changed = await fixture(t), original = await changed.prepare();
  changed.restart({ config: { ...changed.config, approverId: 'UBOB0001' } });
  assert.equal((await changed.command(original.approveCommand)).error, 'partnership_approver_changed'); assert.equal(changed.posts.length, 0);
  const revoked = await fixture(t), paused = await revoked.prepare(); revoked.setMember(false);
  assert.equal((await revoked.command(paused.approveCommand)).error, 'partnership_authority_unavailable'); assert.equal(revoked.posts.length, 0);
});

test('authority revoked while native resume runs prevents mail dispatch', async t => {
  const f = await fixture(t), draft = await f.prepare();
  f.restart({ lobster: { ...f.lobster, async resume(value) { const result = await f.lobster.resume(value); f.setMember(false); return result; } } });
  assert.equal((await f.command(draft.approveCommand)).status, 'blocked'); assert.equal(f.posts.length, 0);
});

test('wrong thread, session, channel, sender, authorization and command binding fail closed', async t => {
  const f = await fixture(t), draft = await f.prepare();
  for (const changed of [{ messageThreadId: '1000.002' }, { messageThreadId: undefined }, { sessionKey: 'another-session' },
    { to: 'channel:COTHER01' }, { channel: 'discord' }, { isAuthorizedSender: false }, { accountId: 'another' }, { agentId: 'community' }]) {
    const result = await f.command(draft.approveCommand, changed); assert.equal(result.status, 'unavailable');
  }
  for (const command of [draft.approveCommand.replace(draft.digest, 'a'.repeat(64)), draft.approveCommand.replace(draft.checkpointId, 'invalid'),
    `${draft.approveCommand} extra`, draft.approveCommand.replace(' approve ', ' APPROVE '), `/partnership approve ${draft.taskId}`])
    assert.equal((await f.command(command)).status, 'unavailable');
  f.restart({ config: { ...f.config, channel: { ...f.config.channel, workspaceId: 'TOTHER01' } } });
  assert.equal((await f.command(draft.approveCommand)).error, 'partnership_unavailable');
  assert.equal(f.posts.length, 0);
});

test('missing native checkpoint blocks without replaying prepare or sending', async t => {
  const f = await fixture(t), draft = await f.prepare();
  await rm(path.join(f.stateDir, 'lobster'), { recursive: true, force: true });
  f.restart();
  const result = await f.command(draft.approveCommand);
  assert.equal(result.status, 'blocked'); assert.match(result.blocker, /checkpoint missing/); assert.equal(f.posts.length, 0);
  assert.equal((await f.command(draft.approveCommand)).status, 'blocked');
});

test('missing or tampered durable template blocks resume without recreating or overwriting it', async t => {
  for (const operation of ['remove', 'tamper']) {
    const f = await fixture(t), draft = await f.prepare();
    const record = JSON.parse(await readFile(path.join(f.stateDir, `${draft.taskId}.json`), 'utf8'));
    const template = path.join(f.stateDir, 'lobster', 'templates', `${record.checkpoint.templateDigest}.lobster`);
    if (operation === 'remove') await rm(template); else await writeFile(template, 'tampered workflow');
    f.restart({ lobster: createNativeLobster({ stateDir: path.join(f.stateDir, 'lobster') }) });
    assert.equal((await f.command(draft.approveCommand)).status, 'blocked'); assert.equal(f.posts.length, 0);
    if (operation === 'remove') await assert.rejects(readFile(template), /ENOENT/);
    else assert.equal(await readFile(template, 'utf8'), 'tampered workflow');
  }
});

test('unknown provider outcome persists and cannot be retried after restart or repeated approval', async t => {
  let attempted = 0;
  const f = await fixture(t, { mail: { async send() { attempted++; throw Error('connection lost after dispatch'); } } });
  const draft = await f.prepare(); assert.equal((await f.command(draft.approveCommand)).status, 'unknown');
  f.restart(); assert.equal((await f.command(draft.approveCommand)).status, 'unknown');
  assert.equal((await f.command(`/partnership reconcile ${draft.taskId}`)).error, 'partnership_no_receipt'); assert.equal(attempted, 1);
});

test('concurrent runtime instances acquire one durable send claim', async t => {
  const f = await fixture(t), draft = await f.prepare(), first = f.runtime;
  const second = f.restart();
  const command = { ...source, args: draft.approveCommand.replace('/partnership ', ''), to: 'channel:CTEST001',
    isAuthorizedSender: true, messageThreadId: '1000.001', commandBody: draft.approveCommand };
  const results = await Promise.all([first.command(command), second.command(command)]);
  assert.equal(results.filter(result => result.details.status === 'accepted').length, 1);
  assert.equal(results.filter(result => result.details.error === 'partnership_locked').length, 1); assert.equal(f.posts.length, 1);
});

test('orphan locks and interrupted dispatch/resume states require explicit resolution', async t => {
  const f = await fixture(t), draft = await f.prepare();
  const recordPath = path.join(f.stateDir, `${draft.taskId}.json`), lockPath = `${recordPath}.lock`;
  await mkdir(lockPath);
  assert.equal((await f.command(draft.approveCommand)).error, 'partnership_locked');
  await rm(lockPath, { recursive: true });
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  for (const status of ['dispatching', 'resuming', 'pending_preview', 'preparing']) {
    await writeFile(recordPath, JSON.stringify({ ...record, status })); f.restart();
    assert.equal((await f.command(draft.approveCommand)).status, status);
    const observed = await f.command(`/partnership status ${draft.taskId}`);
    assert.equal(observed.status, status); assert.match(observed.blocker, /No automatic retry/);
  }
  assert.equal(f.posts.length, 0);
});

test('filesystem claim excludes a separate process', async t => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'partnership-lock-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const id = randomUUID(), module = new URL('../plugins/rein-partnership/store.mjs', import.meta.url).href;
  const program = `import {createPartnershipStore} from ${JSON.stringify(module)}; await createPartnershipStore(process.argv[1]).locked(process.argv[2],async()=>{process.stdout.write('locked\\n'); await new Promise(resolve=>process.stdin.once('data',resolve));});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', program, stateDir, id], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await once(child.stdout, 'data');
  await assert.rejects(createPartnershipStore(stateDir).locked(id, async () => {}), /partnership_locked/);
  child.stdin.end('release'); await once(child, 'exit');
  await createPartnershipStore(stateDir).locked(id, async () => {});
});

test('failed exact-preview delivery leaves the workflow blocked without usable approval', async t => {
  const f = await fixture(t);
  const draft = await f.prepare({}, {}, { delivery: { async send() { throw Error('Slack reply failed'); } } });
  assert.equal(draft.status, 'blocked'); assert.equal(draft.approveCommand, undefined); assert.equal(f.posts.length, 0);
  assert.match(draft.blocker, /preview delivery/);
});

test('tool custody, sandbox, background provenance, and fixed recipient configuration are enforced', async t => {
  const f = await fixture(t);
  assert.equal(f.runtime.toolFactory.create({ agentId: 'main', sandboxed: true }), null);
  assert.equal(f.runtime.toolFactory.create({ agentId: 'community', sandboxed: false }), null);
  await assert.rejects(f.prepare({}, { trigger: 'cron' }), /current trusted Slack/);
  await assert.rejects(f.prepare({}, { inputProvenance: { kind: 'inter_session' } }), /current trusted Slack/);
  await assert.rejects(f.prepare({ to: 'real-partner@example.org' }), /material_invalid/);
  await assert.rejects(f.prepare({ approverId: 'UBOB0001' }), /material_invalid/);
  await assert.rejects(f.prepare({}, {}, { deliveryContext: { channel: 'slack', to: 'channel:COTHER01', accountId: 'default' } }), /delivery_scope/);
  await assert.rejects(f.prepare({}, {}, { assertInvocationCurrent() { throw Error('stale host invocation'); } }), /stale host/);
  await assert.rejects(f.runtime.toolFactory.create({ agentId: 'main', assertInvocationCurrent() {} }).execute('forged', args), /authority_unavailable/);
  assert.equal(f.posts.length, 0);
});

test('disabled configuration is inert and runtime prerequisites fail closed', () => {
  assert.deepEqual(validatePartnershipConfig(), { enabled: false });
  const disabled = createPartnershipWorkflow({ config: { enabled: false }, stateDir: '/unused', authorize: async () => true });
  assert.equal(disabled.toolFactory.create({ agentId: 'main' }), null);
  assert.throws(() => validatePartnershipConfig({ ...base, from: 'Nori <noreply@example.org>' }), /config_invalid/);
  assert.throws(() => assertPartnershipRuntimeConfig(validatePartnershipConfig(base), {}), /runtime_invalid/);
  assert.doesNotThrow(() => assertPartnershipRuntimeConfig(validatePartnershipConfig(base), { plugins: { entries: { 'rein-partnership': { hooks: { allowConversationAccess: true } } } }, agents: { entries: { main: { sandbox: { mode: 'off' } } } } }));
});

test('native shell receives no ambient Slack or mail credentials', async t => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'partnership-env-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const templatePath = path.join(stateDir, 'env.lobster');
  await writeFile(templatePath, `name: env-probe\nsteps:\n  - id: inspect\n    command: >-\n      "$PARTNERSHIP_NODE" -e 'console.log(JSON.stringify({slack:process.env.PARTNERSHIP_TEST_SLACK_SECRET,mail:process.env.PARTNERSHIP_TEST_MAIL_SECRET}))'\n`);
  process.env.PARTNERSHIP_TEST_SLACK_SECRET = 'synthetic-slack-secret'; process.env.PARTNERSHIP_TEST_MAIL_SECRET = 'synthetic-mail-secret';
  t.after(() => { delete process.env.PARTNERSHIP_TEST_SLACK_SECRET; delete process.env.PARTNERSHIP_TEST_MAIL_SECRET; });
  const native = createNativeLobster({ stateDir: path.join(stateDir, 'checkpoints'), templatePath });
  const result = await native.prepare({ material: args, initiator: 'UALICE01', approver: 'UALICE01' });
  assert.equal(result.status, 'ok'); assert.deepEqual(result.output, [{}]);
});

test('native engine enforces the saved approver identity independently', async t => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'partnership-identity-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const native = createNativeLobster({ stateDir });
  const prepared = await native.prepare({ material: args, initiator: 'UALICE01', approver: 'UBOB0001' });
  const refused = await native.resume({ checkpoint: prepared.requiresApproval, approve: true, actor: 'UALICE01' });
  assert.equal(refused.ok, false);
  assert.equal((await native.resume({ checkpoint: prepared.requiresApproval, approve: true, actor: 'UBOB0001' })).status, 'ok');
  assert.ok((await readdir(stateDir)).length >= 0);
});
