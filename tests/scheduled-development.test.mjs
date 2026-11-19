import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduledSpawnAllowed, scheduleInThread } from '../plugins/rein-router/scheduled-development.mjs';

const source = { chatId: 'CFIXTURE1', agentId: 'main', accountId: 'default',
  sessionKey: 'agent:main:slack:channel:cfixture1:thread:1000.001' };
const worker = 'nori-development';
const message = 'Test a string containing "); throw Error("unexpected"); // and a newline\nthen verify.';
const add = (job, executor = worker) => scheduleInThread({ source, job, action: 'add', worker: executor });
const assigned = add({ payload: { kind: 'agentTurn', message, toolsAllow: ['exec'] } });
const id = '07edf615-2a2a-40cc-8243-ad9ffeedb34f';
const current = { ...assigned, id, agentId: 'main', owner: source, scheduledToolPolicy: { version: 1, mode: 'account',
  ownerAccountId: 'default', ownerSessionKey: source.sessionKey } };
const ctx = { agentId: 'main', runId: 'cron-trigger:' + id + ':' + id, sessionKey: 'agent:main:cron:' + id + ':trigger' };
const channel = { channelId: source.chatId, accountId: source.accountId, agentId: worker };
const args = JSON.parse(/^const child = await sessions_spawn\(([^\n]+)\);/u.exec(assigned.payload.script)[1]);

test('native cron stores the task as inert data, requires an isolated child and captures only requested work tools', () => {
  assert.equal(args.task, message);
  assert.equal(args.sandbox, 'require');
  assert.equal(args.context, 'isolated');
  assert.equal(args.agentId, worker);
  assert.deepEqual(assigned.payload.toolsAllow, ['sessions_spawn','agents_wait','exec']);
  assert.equal(assigned.delivery.threadId, '1000.001');
  assert.deepEqual(add(assigned), assigned, 'canonical hook follows compact dispatch');
  for (const patch of [{delivery:null},{delivery:{threadId:'1000.002'}},{sessionTarget:'main'},
    {trigger:{script:'untrusted'}},{payload:{kind:'script',script:'other'}},{payload:{kind:'agentTurn',message,toolsAllow:['gateway']}}])
    assert.throws(() => add({payload:{kind:'agentTurn',message},...patch}));
});

test('native scheduled spawn requires exact stored job, source program, owner, destination and run', async () => {
  const check = (job = current, context = ctx, request = args) =>
    scheduledSpawnAllowed(context, request, [channel], async key => key === id ? job : undefined);
  assert.equal(await check(), true);
  for (const delta of [{agentId:'main'}, {sandbox:'inherit'}, {task:'other'}, {cwd:'/tmp'}])
    assert.equal(await check(current,ctx,{...args,...delta}), false);
  for (const delta of [{owner:undefined},{owner:{...source,accountId:'other'}},{scheduledToolPolicy:undefined},
    {delivery:{...assigned.delivery,threadId:'1000.002'}},{payload:{...assigned.payload,script:assigned.payload.script+' other'}},
    {payload:{...assigned.payload,toolsAllow:['exec']}}]) assert.equal(await check({...current,...delta}),false);
  assert.equal(await check(current,{...ctx,runId:'other'}),false);
  assert.equal(await check(current,{...ctx,sessionKey:source.sessionKey}),false);
});

test('time adjustments preserve the stored sandbox program and require the original native owner session', () => {
  const schedule={kind:'every',everyMs:90000};
  assert.deepEqual(scheduleInThread({source,worker,current,action:'update',job:{schedule}}),{schedule});
  assert.throws(()=>scheduleInThread({source,worker,current:{...current,owner:{...source,sessionKey:'other'}},action:'update',job:{schedule}}));
  const ordinary=scheduleInThread({source,action:'add',job:{payload:{kind:'agentTurn',message:'Reminder'}}});
  assert.deepEqual(ordinary.payload.toolsAllow,[]);
  assert.throws(()=>scheduleInThread({source,action:'add',job:{payload:{kind:'agentTurn',message,toolsAllow:['exec']}}}));
});
