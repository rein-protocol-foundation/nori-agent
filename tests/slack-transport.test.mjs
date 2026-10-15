import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config,body } from './fixtures/slack-isolation-data.mjs';
import { normalizeSlackEvent,startIsolatedSlack,createSlackClients } from '../plugins/rein-slack/gateway.mjs';
import { createMemberMemory } from '../plugins/rein-isolation/memory.mjs';
import { createTurnControl } from '../plugins/rein-isolation/turn-control.mjs';
const c=config('/synthetic/private/member.sqlite');
function fakeWeb() {
  const infos=[],posts=[];
  return {infos,posts,auth:{async test(){return {ok:true,team_id:c.teamId,user_id:c.botUserId,bot_id:'BSYNTH001'};}},
    conversations:{async info({channel}){infos.push(channel);return {ok:true,channel:{id:channel,is_im:channel.startsWith('D'),is_private:channel.startsWith('G'),user:'USYNTHA01',is_mpim:false,is_ext_shared:false}};}},
    chat:{async postMessage(p){posts.push(p);return {ok:true};}}};
}
test('authenticated Slack message normalizes only native routing and current text',async()=>{
  const web=fakeWeb();const normalized=await normalizeSlackEvent(c,body({thread_ts:'1800000000.000002',blocks:[{text:'OTHER-USER-CANARY'}],files:[{secret:'CANARY'}]}),web);
  assert.equal(normalized.senderId,'USYNTHA01');assert.equal(normalized.threadId,'1800000000.000002');
  assert.equal(normalized.text,'hello');assert.equal(normalized.mentioned,true);assert.ok(!JSON.stringify(normalized).includes('CANARY'));
  assert.deepEqual(web.infos,['CSYNTHPUB']);
});
for(const [name,overrides] of [
  ['other team',{team_id:'TSYNTH002'}],['other app',{api_app_id:'ASYNTH002'}],['missing authorization',{authorizations:[]}],
  ['wrong installation principal',{authorizations:[{team_id:c.teamId,user_id:'USYNTHBAD',is_bot:true}]}],
  ['user token authorization',{authorizations:[{team_id:c.teamId,user_id:c.botUserId,is_bot:false}]}],
  ['Slack Connect',{is_ext_shared_channel:true}],['non-event payload',{type:'interactive_message'}],
]) test(`reject ${name} before any channel lookup`,async()=>{
  const web=fakeWeb();assert.equal(await normalizeSlackEvent(c,body({},overrides),web),null);assert.deepEqual(web.infos,[]);
});
for(const [name,overrides] of [
  ['bot message',{bot_id:'BSYNTH001'}],['own echo',{user:c.botUserId}],['edited message',{subtype:'message_changed'}],
  ['unknown channel',{channel:'CSYNTHBAD'}],['claimed email actor',{user:'admin@example.invalid'}],
  ['foreign event team',{team:'TSYNTH002'}],['malformed timestamp',{ts:'not-an-event'}],['invalid thread',{thread_ts:'bad'}],
  ['unknown event',{type:'reaction_added'}],['unlinked unapproved DM',{channel:'DSYNTH001',user:'USYNTHBAD'}],
]) test(`reject ${name} at transport admission`,async()=>{
  const web=fakeWeb();assert.equal(await normalizeSlackEvent(c,body(overrides),web),null);assert.deepEqual(web.infos,[]);
});
for(const [name,metadata] of [
  ['changed visibility',{is_private:true}],['multiparty DM',{is_mpim:true}],['external shared channel',{is_ext_shared:true}],
  ['wrong native channel',{id:'CSYNTHBAD'}],['missing visibility',{is_private:undefined}],
]) test(`fresh channel metadata rejects ${name}`,async()=>{
  const web=fakeWeb();const original=web.conversations.info;web.conversations.info=async p=>{
    const result=await original(p);Object.assign(result.channel,metadata);return result;
  };
  assert.equal(await normalizeSlackEvent(c,body(),web),null);
});
test('private channel and DM audiences come from verified metadata and approved peer',async()=>{
  const web=fakeWeb();assert.equal((await normalizeSlackEvent(c,body({channel:'GSYNTHPRI'}),web)).audience,'private');
  assert.equal((await normalizeSlackEvent(c,body({channel:'DSYNTH001'}),web)).kind,'direct');
  const original=web.conversations.info;web.conversations.info=async p=>{const r=await original(p);r.channel.user='USYNTHB02';return r;};
  assert.equal(await normalizeSlackEvent(c,body({channel:'DSYNTH001'}),web),null);
});
async function transport(t,dispatch) {
  const dir=mkdtempSync(join(tmpdir(),'rein-slack-transport-'));const conf=config(join(dir,'private/member.sqlite'));
  const memory=createMemberMemory(conf.memoryPath),turns=createTurnControl(),web=fakeWeb(),socket=new EventEmitter(),controller=new AbortController();
  const inputs=[],statuses=[],warnings=[];let ready;
  const started=new Promise(resolve=>{ready=resolve;});let disconnected=0;
  socket.start=async()=>{socket.emit('connected');ready();};socket.disconnect=async()=>{disconnected++;};
  const previous=[process.env[conf.botTokenEnv],process.env[conf.appTokenEnv]];
  process.env[conf.botTokenEnv]='synthetic-bot-token';process.env[conf.appTokenEnv]='synthetic-app-token';
  t.after(async()=>{controller.abort();await running;memory.close();rmSync(dir,{recursive:true,force:true});
    for(const [i,name] of [conf.botTokenEnv,conf.appTokenEnv].entries())if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});
  const runtime={inbound:{ingress:{async resolveStable(){return {ingress:{admission:'dispatch'}};}},buildContext:p=>p,
    async dispatch(p){inputs.push(p);return dispatch?dispatch(p):p.delivery.deliver({text:'safe reply'},{kind:'final'});}}};
  const running=startIsolatedSlack({config:conf,cfg:{},runtime,memory,turns,signal:controller.signal,status:s=>statuses.push(s),log:{warn:m=>warnings.push(m)}},{web,socket});
  await started;
  const deliver=async(body,ack=async()=>{})=>socket.listeners('slack_event')[0]({body,ack});
  return {web,deliver,inputs,statuses,warnings,controller,running,get disconnected(){return disconnected;}};
}
test('Socket Mode acks retries but dispatches each native message only once',async t=>{
  const f=await transport(t);let acks=0;const ack=async()=>{acks++;};
  await f.deliver(body(),ack);await f.deliver(body(),ack);
  assert.equal(acks,2);assert.equal(f.inputs.length,1);assert.equal(f.web.posts.length,1);
  f.controller.abort();await f.running;assert.ok(f.disconnected>0);assert.equal(f.statuses.at(-1).running,false);
});
test('final replies stay in the immutable originating thread and split Unicode safely',async t=>{
  const text='a'.repeat(2999)+'😀'+'b'.repeat(3100);
  const f=await transport(t,p=>p.delivery.deliver({text,to:'CSYNTHBAD',threadId:'1800000000.000099',mediaUrl:'https://example.invalid/private'},{kind:'final'}));
  await f.deliver(body({thread_ts:'1800000000.000002'}));
  assert.equal(f.web.posts.map(p=>p.text).join(''),text);
  for(const post of f.web.posts){assert.equal(post.channel,'CSYNTHPUB');assert.equal(post.thread_ts,'1800000000.000002');assert.ok(post.text.length<=3000);assert.ok(post.text.isWellFormed());assert.equal(post.unfurl_links,false);}
});
test('failed acknowledgement is contained and never reaches the model',async t=>{
  const f=await transport(t);await f.deliver(body(),async()=>{throw new Error('SENSITIVE-SOCKET-CANARY');});
  assert.deepEqual(f.inputs,[]);assert.equal(f.warnings.length,1);assert.ok(!f.warnings[0].includes('CANARY'));
});
test('Slack auth mismatch fails before socket startup or receiving messages',async()=>{
  const web=fakeWeb(),controller=new AbortController();let starts=0;
  const socket={async start(){starts++;}};
  process.env.REIN_TEST_SLACK_BAD_BOT='synthetic';process.env.REIN_TEST_SLACK_BAD_APP='synthetic';
  try {
    await assert.rejects(()=>startIsolatedSlack({config:{...c,teamId:'TSYNTH002',botTokenEnv:'REIN_TEST_SLACK_BAD_BOT',appTokenEnv:'REIN_TEST_SLACK_BAD_APP'},signal:controller.signal},{web,socket}),/identity/);
    assert.equal(starts,0);assert.deepEqual(web.infos,[]);
  } finally {delete process.env.REIN_TEST_SLACK_BAD_BOT;delete process.env.REIN_TEST_SLACK_BAD_APP;}
});


test('pinned Slack SDK clients construct without connecting or requiring live credentials',async()=>{
  const clients=await createSlackClients('synthetic-bot-token','synthetic-app-token',{warn(){}});
  assert.equal(typeof clients.web.conversations.info,'function');
  assert.equal(typeof clients.socket.start,'function');
  await clients.socket.disconnect();
});


test('Slack message-level controls avoid native slash-command handling',async()=>{
  for(const [command,normalized] of [['!new','/new'],['!reset','/reset'],['!forget','/forget']]) {
    const result=await normalizeSlackEvent(c,body({text:`<@${c.botUserId}> ${command}`}),fakeWeb());
    assert.equal(result.text,normalized);assert.equal(result.mentioned,true);
  }
  for(const text of ['constructor','__proto__','!forget all'])
    assert.equal((await normalizeSlackEvent(c,body({text}),fakeWeb())).text,text);
});
