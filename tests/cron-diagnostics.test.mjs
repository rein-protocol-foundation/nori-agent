import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectCronJobs } from '../plugins/rein-acp/cron-diagnostics.mjs';
import { createTaskLoop } from '../plugins/rein-acp/task-loop.mjs';

test('read-only diagnostic matches the specific operator job, store and failed run after recovery', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cron-diagnosis-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const database = join(dir, 'state.sqlite'), db = new DatabaseSync(database);
  db.exec(`CREATE TABLE cron_jobs(store_key,job_id,name,agent_id,owner_agent_id,job_json,enabled);
    CREATE TABLE cron_run_receipts(store_key,job_id,receipt_id,status,started_at_ms,finished_at_ms,error_text);
    CREATE TABLE task_runs(task_kind,source_id,detail_json);
    INSERT INTO cron_jobs VALUES ('store','i','daily','main',NULL,'{"sessionTarget":"isolated"}',1),
      ('store','p','other','main',NULL,'{"owner":{"accountId":"a"},"sessionTarget":"isolated"}',1);
    INSERT INTO cron_run_receipts VALUES ('store','i','a','error',101,102,'command exited with code 1'),
      ('store','i','b','ok',110,120,NULL), ('other','i','z','error',120,130,'timeout');
    INSERT INTO task_runs VALUES ('automation_run','i','{"storeKey":"store","runAtMs":101,"diagnostics":{"entries":[{"severity":"error","message":"private unexpected EOF"}]}}'),
      ('automation_run','i','{"storeKey":"other","runAtMs":101,"error":"permission denied"}');`);
  db.close();
  const [job, hidden] = inspectCronJobs({ database, store: 'store', agentId: 'main' }, ['daily','other']);
  assert.equal(job.latest.status, 'ok');
  assert.deepEqual(job.latestFailure.recordedReasons, ['command exited with code 1','model or upstream connection ended mid-response']);
  assert.deepEqual(hidden, { name: 'other', status: 'unavailable' });
  assert.doesNotMatch(JSON.stringify(job), /private/);
});

test('only a current named owner in the configured private channel can inspect cron receipts', async () => {
  const channel = 'CDEVELOP1', senderId = 'UOWNER01';
  const config = { channel: { channelId: 'CTEST001', accountId: 'default', agentId: 'main' },
    additionalChannelIds: [channel], cronDiagnosticsChannelId: channel };
  let reads = 0;
  for (const [chatId, owners, member, succeeds] of [
    [channel, ['slack:' + senderId], true, true], ['CTEST001', ['slack:' + senderId], true, false],
    [channel, ['*'], true, false], [channel, ['slack:' + senderId], false, false],
  ]) {
    const runtime = createTaskLoop({ config, authorize: async () => member, inspectCron: jobs => { reads++; return jobs; } });
    const src = { trigger: 'user', agentId: 'main', accountId: 'default', channel: 'slack', chatId, senderId,
      runId: 'r', sessionId: 's', sessionKey: 'agent:main:slack:channel:' + chatId.toLowerCase() + ':thread:100.01' };
    const args = { action: 'cron_diagnosis', jobs: ['daily'] };
    await runtime.beforeAgentRun({}, src);
    const gate = await runtime.beforeToolCall({ toolName: 'rein_task', params: args }, { ...src, toolCallId: 'call',
      requester: { channel: 'slack', accountId: 'default', senderId } });
    const tool = runtime.toolFactory.create({ ...src, requesterSenderId: senderId, assertInvocationCurrent() {},
      getRuntimeConfig: () => ({ commands: { ownerAllowFrom: owners }, plugins: { entries: { 'rein-acp': { config } } } }) });
    if (succeeds) assert.equal((await tool.execute('call', args)).details.status, 'inspected');
    else if (!gate?.block) await assert.rejects(tool.execute('call', args));
  }
  assert.equal(reads, 1);
});
