import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createScopedOwner,sessionKey } from '../plugins/rein-isolation/scope.mjs';
import { createMemberMemory } from '../plugins/rein-isolation/memory.mjs';
import { createTurnControl } from '../plugins/rein-isolation/turn-control.mjs';
import { validateIsolationConfig,assertSlackRuntime,resolveOwner,CHANNEL_TOOLS,PRIVATE_TOOLS } from '../plugins/rein-slack/isolation.mjs';
import { createMemoryToolFactory } from '../plugins/rein-slack/memory-tools.mjs';
import { createIsolatedReceiver } from '../plugins/rein-slack/inbound.mjs';

import { config,event } from './fixtures/slack-isolation-data.mjs';
const ctx = owner=>({messageChannel:'slack',agentId:'main',agentAccountId:'default',nativeChannelId:owner.channelId,requesterSenderId:owner.senderId,sessionKey:sessionKey(owner),assertInvocationCurrent(){}});
function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'rein-slack-isolation-'));const c=config(join(dir,'private/member.sqlite'));
  const memory=createMemberMemory(c.memoryPath),turns=createTurnControl();
  t.after(()=>{memory.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,c,memory,turns};
}
const runtimeConfig = workspace=>({agents:{defaults:{workspace,skipBootstrap:true,compaction:{memoryFlush:{enabled:false}}}},
  memory:{search:{enabled:false,rememberAcrossConversations:false}},plugins:{entries:{slack:{enabled:false}}},channels:{slack:{enabled:true}},
  tools:{allow:CHANNEL_TOOLS,fs:{workspaceOnly:true},sessions:{visibility:'self'},agentToAgent:{enabled:false}}});

test('Slack config validates native identifiers and explicit channel audiences',t=>{
  const {c}=fixture(t);assert.equal(validateIsolationConfig(c),c);
  for(const modified of [{...c,teamId:'I am admin'},{...c,appId:'bad'},{...c,botUserId:'BOTHERBOT'},{...c,channels:[c.channels[0],c.channels[0]]},
    {...c,channels:[{id:'CSYNTHPUB'}]},{...c,dmAllowFrom:['alias@example.invalid']}])assert.throws(()=>validateIsolationConfig(modified));
});
test('same-channel members, private channels, DMs and separate threads have disjoint scopes',t=>{
  const {c}=fixture(t);
  const owners=[event(),event({senderId:'USYNTHB02'}),event({channelId:'GSYNTHPRI',audience:'private'}),
    event({channelId:'DSYNTH001',kind:'direct'}),event({threadId:'1800000000.000002'}),event({threadId:'1800000000.000003'})].map(e=>resolveOwner(c,e));
  assert.ok(owners.every(Boolean));assert.equal(new Set(owners.map(o=>o.key)).size,owners.length);
  assert.equal(owners[2].kind,'channel');assert.equal(owners[2].audience,'private');assert.match(sessionKey(owners[2]),/:slack:channel:/);
  assert.match(sessionKey(owners[3]),/:slack:direct:/);
  assert.equal(resolveOwner(c,event()).key,owners[0].key);
});
test('scope namespaces prevent cross-platform, account, bot and workspace collisions',()=>{
  const base={agentId:'main',platform:'slack',accountId:'default',botUserId:'same-bot'};
  const e={spaceId:'same-space',channelId:'same-room',senderId:'same-user',audience:'public',kind:'channel'};
  const configs=[base,{...base,platform:'discord'},{...base,platform:'feishu'},{...base,accountId:'second'},{...base,botUserId:'other-bot'}];
  const keys=configs.map(c=>createScopedOwner(c,e).key);keys.push(createScopedOwner(base,{...e,spaceId:'other-space'}).key);
  assert.equal(new Set(keys).size,keys.length);
  const privateRoom=createScopedOwner(base,{...e,audience:'private'}),dm=createScopedOwner(base,{...e,audience:'private',kind:'direct'});
  assert.notEqual(privateRoom.key,dm.key);
  assert.notEqual(createScopedOwner(base,{...e,channelId:'room:thread:ts'}).key,createScopedOwner(base,{...e,channelId:'room',threadId:'ts'}).key);
});
test('the shared scope preserves existing Discord v1 note ownership hashes',()=>{
  const c={agentId:'main',platform:'discord',botUserId:'100000000000000008'};
  const e={spaceId:'100000000000000001',channelId:'100000000000000002',senderId:'100000000000000003',kind:'channel',audience:'public'};
  const legacy=createHash('sha256').update(JSON.stringify([1,'main','discord','default',c.botUserId,e.spaceId,e.channelId,e.audience,e.senderId])).digest('hex');
  assert.equal(createScopedOwner(c,e).key,legacy);
});
test('unknown teams, channels, bots, users and visibility mismatches fail closed',t=>{
  const {c}=fixture(t);
  for(const overrides of [{teamId:'TSYNTH002'},{channelId:'CSYNTHBAD'},{kind:'group'},{bot:true},{senderId:c.botUserId},{audience:'private'},
    {channelId:'DSYNTH001',kind:'direct',senderId:'USYNTHBAD'},{threadId:'untrusted-thread'}])assert.equal(resolveOwner(c,event(overrides)),null);
});
test('startup guard keeps per-agent overrides, broad tools and mixed platforms disabled',t=>{
  const {c,dir}=fixture(t);const workspace=join(dir,'public');mkdirSync(workspace);const cfg=runtimeConfig(workspace);
  assert.doesNotThrow(()=>assertSlackRuntime(cfg,c,workspace));
  for(const bad of [{...cfg,memory:{}},{...cfg,agents:{...cfg.agents,entries:{main:{memory:{search:{rememberAcrossConversations:true}}}}}},
    {...cfg,channels:{...cfg.channels,discord:{enabled:true}}},{...cfg,tools:{...cfg.tools,allow:['exec']}},{...cfg,bindings:[{}]}])
    assert.throws(()=>assertSlackRuntime(bad,c,workspace));
});
test('Foundation enrollment cannot silently attach another workspace or channel',t=>{
  const {c,dir}=fixture(t);const workspace=join(dir,'public');mkdirSync(workspace);const cfg=runtimeConfig(workspace);
  for(const workspaceId of [c.teamId,'TSYNTH002']) {
    cfg.plugins.entries['rein-operations']={config:{foundationDb:{enabled:true,workspaces:[{platform:'slack',workspaceId,nativeChannelIds:['CSYNTHPUB']}]}}};
    if(workspaceId===c.teamId)assert.doesNotThrow(()=>assertSlackRuntime(cfg,c,workspace));else assert.throws(()=>assertSlackRuntime(cfg,c,workspace),/Foundation enrollment/);
  }
});
test('private-channel/DM memory cannot be read by a public invocation or another sender',async t=>{
  const {c,memory,turns}=fixture(t);const a=resolveOwner(c,event()),b=resolveOwner(c,event({senderId:'USYNTHB02'}));
  const dm=resolveOwner(c,event({channelId:'DSYNTH001',kind:'direct'}));
  const privateRoom=resolveOwner(c,event({channelId:'GSYNTHPRI',audience:'private'}));
  memory.remember(dm,'note','DM-ONLY-CANARY',()=>{});memory.remember(privateRoom,'note','PRIVATE-CHANNEL-CANARY',()=>{});
  memory.remember(b,'note','BOB-ONLY-CANARY',()=>{});memory.remember(a,'note','ALICE-PUBLIC-CANARY',()=>{});
  const turn=turns.open(sessionKey(a),new AbortController().signal,a);t.after(()=>turn.close());
  const factory=createMemoryToolFactory(c,()=>memory,turns),context=ctx(a);
  const tools=factory(context);assert.ok(tools);
  const value=JSON.stringify(await tools[0].execute('t',{ownerId:b.senderId,audience:'private'}));
  assert.ok(value.includes('ALICE-PUBLIC-CANARY'));for(const forbidden of ['DM-ONLY','PRIVATE-CHANNEL','BOB-ONLY'])assert.ok(!value.includes(forbidden));
  assert.equal(factory({...context,requesterSenderId:b.senderId}),null);
  assert.equal(factory({...context,messageChannel:'discord'}),null);
  assert.equal(factory({...context,sessionKey:sessionKey(dm)}),null);
});
test('thread-owned tools require the live host turn and reject forged thread/session owners',async t=>{
  const {c,memory,turns}=fixture(t);const a=resolveOwner(c,event({threadId:'1800000000.000002'}));
  const factory=createMemoryToolFactory(c,()=>memory,turns);assert.equal(factory(ctx(a)),null);
  const turn=turns.open(sessionKey(a),new AbortController().signal,a);const tools=factory(ctx(a));
  await tools[1].execute('t',{name:'n',value:'THREAD-ONLY'});assert.equal(memory.read(a).notes[0].value,'THREAD-ONLY');
  turn.close();assert.equal(factory(ctx(a)),null);
});
function receiver(t,dispatch) {
  const f=fixture(t);const inputs=[],sent=[];
  const runtime={inbound:{ingress:{async resolveStable(){return {ingress:{admission:'dispatch'}};}},buildContext:p=>p,
    async dispatch(p){inputs.push(p);return dispatch ? dispatch(p,f) : p.delivery.deliver({text:'safe'},{kind:'final'});}}};
  const receive=createIsolatedReceiver({...f,config:f.c,cfg:{},runtime,signal:new AbortController().signal,send:async(...args)=>sent.push(args)});
  return {...f,inputs,sent,receive};
}
test('receive assigns same-room sender/thread keys before recording or model work',async t=>{
  const {receive,inputs}=receiver(t);
  await receive(event());await receive(event({senderId:'USYNTHB02',id:'1800000000.000002'}));
  await receive(event({threadId:'1800000000.000003',id:'1800000000.000004'}));
  assert.equal(new Set(inputs.map(p=>p.route.sessionKey)).size,3);
  for(const p of inputs)assert.equal(p.ctxPayload.route.routeSessionKey,p.route.sessionKey);
  assert.equal(inputs[2].ctxPayload.conversation.nativeChannelId,'CSYNTHPUB');
  assert.equal(inputs[2].ctxPayload.conversation.id,'CSYNTHPUB:thread:1800000000.000003');
});
test('private channels preserve channel classification and existing governance tools; DMs exclude them',async t=>{
  const {receive,inputs}=receiver(t);
  await receive(event({channelId:'GSYNTHPRI',audience:'private'}));
  await receive(event({channelId:'DSYNTH001',kind:'direct',id:'1800000000.000002'}));
  assert.equal(inputs[0].ctxPayload.conversation.kind,'channel');assert.ok(inputs[0].toolsAllow.includes('rein_poll_vote'));
  assert.equal(inputs[1].ctxPayload.conversation.kind,'direct');assert.deepEqual(inputs[1].toolsAllow,PRIVATE_TOOLS);
});
test('ambient history, quotes, thread roots and attachments never enter a Slack model request',async t=>{
  const {receive,inputs}=receiver(t);
  await receive(event({quotedText:'PRIVATE-QUOTED-CANARY',history:['OTHER-USER-CANARY'],threadStarter:'PRIVATE-ROOT-CANARY',attachments:['PRIVATE-FILE-CANARY']}));
  assert.ok(!JSON.stringify(inputs).includes('CANARY'));
});
test('deduplication is conversation-scoped and does not discard equal timestamps in another channel',async t=>{
  const {receive,inputs}=receiver(t);
  await receive(event());await receive(event());await receive(event({channelId:'GSYNTHPRI',audience:'private'}));
  assert.equal(inputs.length,2);
});
test('reset/forget affect only the current Slack sender, conversation and audience',async t=>{
  const {receive,c,memory}=receiver(t);const a=resolveOwner(c,event()),b=resolveOwner(c,event({senderId:'USYNTHB02'}));
  memory.remember(a,'n','A',()=>{});memory.remember(b,'n','B',()=>{});
  await receive(event({text:'/reset'}));assert.equal(memory.generation(a),1);assert.equal(memory.generation(b),0);
  assert.equal(memory.read(a).notes[0].value,'A');
  await receive(event({text:'/forget',id:'1800000000.000002'}));assert.deepEqual(memory.read(a).notes,[]);assert.equal(memory.read(b).notes[0].value,'B');
});
test('Slack model-driven forgetting uses shared abort/suppression and a host acknowledgement',async t=>{
  const {receive,sent,c,memory}=receiver(t,async(p,f)=>{
    const owner=resolveOwner(f.c,event());const tools=createMemoryToolFactory(f.c,()=>f.memory,f.turns)(ctx(owner));
    await tools[2].execute('t',{});assert.equal(p.replyOptions.abortSignal.aborted,true);
    assert.deepEqual(await p.delivery.deliver({text:'FORGOTTEN-CANARY'},{kind:'final'}),{visibleReplySent:false});
  });
  const owner=resolveOwner(c,event());memory.remember(owner,'n','FORGOTTEN-CANARY',()=>{});
  assert.equal((await receive(event())).forgotten,true);assert.equal(sent.length,1);
  assert.equal(sent[0][1],'已删除指定记忆，并开始新对话。');assert.deepEqual(memory.read(owner).notes,[]);
});
