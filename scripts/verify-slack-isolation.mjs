import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { root, upstream, environment, requireSource } from './runtime-env.mjs';
import { CHANNEL_TOOLS } from '../plugins/rein-slack/isolation.mjs';
import { config as slackConfig } from '../tests/fixtures/slack-isolation-data.mjs';

requireSource();
const temp = mkdtempSync(join(tmpdir(), 'rein-native-slack-isolation-'));
const requests = [], backendCalls=[], serverErrors=[];
const proofs=new Map();
const server = createServer(async (req,res) => {
  try {
  let body='';for await(const chunk of req) body+=chunk;
  const request=JSON.parse(body);
  if(req.url.startsWith('/api/')) {
    backendCalls.push({path:req.url,body:request});
    let response;
    if(req.url==='/api/ingress/relay') {const assertion=`synthetic-proof-${backendCalls.length}`;proofs.set(assertion,request);response={assertion,expires_at:'2030-01-01T00:00:00Z'};}
    else {
      const actor=proofs.get(request.proof?.assertion);
      assert.ok(actor,'operation must carry a proof minted from native ingress');
      if(req.url==='/api/identity/resolve')response={ok:true,status:'resolved',contact_id:`synthetic-${actor.platform_user_id}`,is_active_contributor:true,is_director:actor.platform_user_id==='USYNTHA01'};
      else if(req.url==='/api/agent/operations')response={ok:true,result:{status:'snapshot',reason:'snapshot',currency:'USD',availableMinor:12345,sourceNote:'PRIVATE_BOARD_FUNDS_CANARY',recordedAt:'2030-01-01T00:00:00Z',recordedBy:'synthetic-operator'}};
      else throw new Error('Unexpected synthetic backend operation');
    }
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(response));return;
  }
  requests.push(request);
  const userIndex=request.messages.findLastIndex(m=>m.role==='user' && /CASE_[A-Z0-9_]+/.test(JSON.stringify(m.content)));
  const marker=JSON.stringify(request.messages[userIndex]?.content).match(/CASE_[A-Z0-9_]+/)?.[0];
  const toolResult=request.messages.slice(userIndex+1).some(m=>m.role==='tool');
  const tool=['CASE_A1','CASE_DM','CASE_THREAD_A'].includes(marker)?'rein_memory_remember':['CASE_PRIVATE','CASE_BOARD_B'].includes(marker)?'rein_funds':marker==='CASE_TOOL_FORGET'?'rein_memory_forget':'rein_memory_read';
  const args=tool==='rein_memory_remember'?{name:'canary',value:marker==='CASE_A1'?'ALICE_PUBLIC_MEMORY_6382':marker==='CASE_DM'?'ALICE_PRIVATE_MEMORY_9921':'ALICE_THREAD_MEMORY_8821'}:tool==='rein_funds'?{currency:'USD'}:{};
  const delta=toolResult ? {role:'assistant',content:marker==='CASE_TOOL_FORGET'?'STALE_FORGOTTEN_OUTPUT_CANARY':'OK'} : {role:'assistant',tool_calls:[{index:0,id:`call_${marker}`,type:'function',function:{name:'tool_call',arguments:JSON.stringify({id:tool,args})}}]};
  res.writeHead(200, {'content-type':'text/event-stream'});
  const completion={id:'privacy-probe',object:'chat.completion.chunk',created:1,model:'canary',choices:[{index:0,delta,finish_reason:null}]};
  res.write(`data: ${JSON.stringify(completion)}\n\n`);
  res.write(`data: ${JSON.stringify({...completion,choices:[{index:0,delta:{},finish_reason:toolResult?'stop':'tool_calls'}]})}\n\n`);
  res.end('data: [DONE]\n\n');
  } catch(error) { serverErrors.push(String(error));if(!res.headersSent)res.writeHead(500);res.end('{}'); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const reservation=createSocketServer();
await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
const gatewayPort=reservation.address().port;
await new Promise(r=>reservation.close(r));
const publicDir=join(temp,'public');mkdirSync(publicDir);
const pluginDir=join(temp,'plugin');mkdirSync(pluginDir);
const fixture=readFileSync(join(root,'tests/fixtures/slack-isolation-gateway.ts'),'utf8').replaceAll('../../plugins/rein-slack/',`${join(root,'plugins/rein-slack')}/`);
writeFileSync(join(pluginDir,'index.ts'),fixture);
writeFileSync(join(pluginDir,'openclaw.plugin.json'),readFileSync(join(root,'plugins/rein-slack/openclaw.plugin.json')));
writeFileSync(join(pluginDir,'package.json'),JSON.stringify({name:'@rein-protocol/privacy-test-fixture',type:'module',openclaw:{extensions:['./index.ts']}}));
symlinkSync(join(root,'plugins/rein-slack/node_modules'),join(pluginDir,'node_modules'));
const privacy=slackConfig(join(temp,'private/member.sqlite'));
const foundationDb={enabled:true,platform:'slack',backendApiBaseUrlEnvVar:'REIN_TEST_FOUNDATION_URL',agentCallerIdEnvVar:'REIN_TEST_CALLER_ID',agentCredentialEnvVar:'REIN_TEST_CALLER_SECRET',proposalConfirmationKeyEnvVar:'REIN_TEST_CONFIRMATION_KEY',
  workspaces:[{platform:'slack',workspaceId:privacy.teamId,nativeChannelIds:privacy.channels.map(c=>c.id)}],proposalChannelIds:['CSYNTHPUB'],boardChannelIds:['GSYNTHPRI']};
const cfg={gateway:{mode:'local',bind:'loopback',port:gatewayPort,auth:{mode:'token',token:'synthetic-isolation-probe-no-real-credentials'}},
  agents:{defaults:{workspace:publicDir,skipBootstrap:true,model:{primary:'privacy-probe/canary'},compaction:{memoryFlush:{enabled:false}}}},
  memory:{search:{enabled:false,rememberAcrossConversations:false}},
  tools:{allow:CHANNEL_TOOLS,fs:{workspaceOnly:true},sessions:{visibility:'self'},agentToAgent:{enabled:false}},
  models:{providers:{'privacy-probe':{baseUrl:`http://127.0.0.1:${port}/v1`,apiKey:'synthetic-probe',api:'openai-completions',models:[{id:'canary',name:'canary',contextWindow:32768,maxTokens:512,reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}},
  channels:{slack:{enabled:true}},plugins:{allow:['rein-slack','rein-operations','openai'],load:{paths:[pluginDir,join(root,'plugins/rein-operations')]},entries:{slack:{enabled:false},'rein-slack':{enabled:true,config:privacy},'rein-operations':{enabled:true,config:{foundationDb}}}}};
const configPath=join(temp,'openclaw.json');writeFileSync(configPath,JSON.stringify(cfg));
const evidencePath=join(temp,'evidence.json');
let output='';
const child=spawn(process.execPath,[join(upstream,'openclaw.mjs'),'gateway','run','--allow-unconfigured'],{cwd:upstream,detached:true,
  env:{...environment(),OPENCLAW_STATE_DIR:join(temp,'state'),OPENCLAW_CONFIG_PATH:configPath,REIN_ISOLATION_EVIDENCE_PATH:evidencePath,OPENCLAW_SKIP_CRON:'1',OPENCLAW_SKIP_BUNDLED_DOCTOR:'1',REIN_TEST_FOUNDATION_URL:`http://127.0.0.1:${port}`,REIN_TEST_CALLER_ID:'synthetic-slack-agent',REIN_TEST_CALLER_SECRET:'synthetic-caller-secret',REIN_TEST_CONFIRMATION_KEY:'synthetic-confirmation-key-with-at-least-32-characters',REIN_TEST_SLACK_BOT:'synthetic-bot-token',REIN_TEST_SLACK_APP:'synthetic-app-token'},stdio:['ignore','pipe','pipe']});
const stop = signal => { try { process.kill(-child.pid,signal); } catch(error) { if(error.code!=='ESRCH')throw error; } };
child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
let exited=false;child.on('exit',()=>{exited=true;});
try {
  const deadline=Date.now()+150000;
  while(!existsSync(evidencePath)&&!exited&&Date.now()<deadline) await new Promise(r=>setTimeout(r,250));
  assert.ok(existsSync(evidencePath),`Native gateway did not complete the probe:\n${output.slice(-10000)}`);
  const evidence=JSON.parse(readFileSync(evidencePath));
  assert.ok(!evidence.error,evidence.error);
  assert.deepEqual(serverErrors,[]);
  assert.equal(evidence.privateMemorySaved,true,'DM tool must really persist a private note before testing its exclusion from public requests');
  assert.equal(requests.length,29,`Expected twenty-nine real provider requests; forget must not continue the old model loop:\n${output.slice(-10000)}`);
  const requestsFor=marker=>requests.filter(r=>{
    const user=r.messages.findLast(m=>m.role==='user' && /CASE_[A-Z0-9_]+/.test(JSON.stringify(m.content)));
    return JSON.stringify(user?.content).match(/CASE_[A-Z0-9_]+/)?.[0]===marker;
  });
  const inputFor=marker=>{
    const request=requestsFor(marker)[0];
    assert.ok(request,`Missing provider request for ${marker}`);return JSON.stringify(request.messages);
  };
  assert.ok(inputFor('CASE_A2').includes('ALICE_PUBLIC_CANARY_7406'),'same-user public context must persist');
  for(const marker of ['CASE_B1','CASE_B2','CASE_A3','CASE_AFTER_TOOL_FORGET','CASE_A4'])assert.ok(!inputFor(marker).includes('ALICE_PUBLIC_CANARY_7406'),`${marker} received Alice context`);
  for(const marker of ['CASE_A1','CASE_A2','CASE_B1','CASE_B2','CASE_A3','CASE_THREAD_A','CASE_THREAD_B','CASE_THREAD_A2','CASE_THREAD_NEW','CASE_TOOL_FORGET','CASE_AFTER_TOOL_FORGET','CASE_A4']) {
    assert.ok(!JSON.stringify(requestsFor(marker)).includes('ALICE_PRIVATE_CANARY_3281'),`${marker} received DM context`);
    assert.ok(!JSON.stringify(requestsFor(marker)).includes('ALICE_PRIVATE_MEMORY_9921'),`${marker} received private memory`);
  }
  for(const marker of ['CASE_B1','CASE_B2','CASE_AFTER_TOOL_FORGET','CASE_A4'])assert.ok(!JSON.stringify(requestsFor(marker)).includes('ALICE_PUBLIC_MEMORY_6382'),`${marker} received another scope's or forgotten memory`);
  assert.equal(requestsFor('CASE_TOOL_FORGET').length,1,'forget must abort before a post-tool model request');
  assert.equal(evidence.sent.filter(entry=>entry.text==='已删除指定记忆，并开始新对话。').length,1);
  assert.ok(!JSON.stringify(evidence.sent).includes('STALE_FORGOTTEN_OUTPUT_CANARY'));
  assert.ok(JSON.stringify(requestsFor('CASE_A2').at(-1).messages).includes('ALICE_PUBLIC_MEMORY_6382'),'own public memory must be usable');
  assert.ok(JSON.stringify(requestsFor('CASE_A3').at(-1).messages).includes('ALICE_PUBLIC_MEMORY_6382'),'own memory must survive session reset');
  assert.ok(!inputFor('CASE_DM').includes('ALICE_PUBLIC_CANARY_7406'),'DM must also be separate from public context');
  const inputWithTools=marker=>JSON.stringify(requestsFor(marker).at(-1).messages);
  assert.ok(inputWithTools('CASE_PRIVATE').includes('PRIVATE_BOARD_FUNDS_CANARY'),'Board tool must execute through the existing backend');
  assert.ok(!inputWithTools('CASE_BOARD_B').includes('PRIVATE_BOARD_FUNDS_CANARY'));
  for(const marker of ['CASE_PRIVATE','CASE_BOARD_B']) {
    assert.ok(!inputWithTools(marker).includes('ALICE_PRIVATE_MEMORY_9921'));
    assert.ok(!inputWithTools(marker).includes('ALICE_PRIVATE_CANARY_3281'));
  }
  assert.ok(inputWithTools('CASE_BOARD_B').includes('board_membership_required'),'a non-director must still be refused');
  for(const marker of ['CASE_A2','CASE_B2','CASE_A3','CASE_A4','CASE_THREAD_NEW'])assert.ok(!inputWithTools(marker).includes('PRIVATE_BOARD_FUNDS_CANARY'));
  assert.ok(inputWithTools('CASE_THREAD_A2').includes('ALICE_THREAD_MEMORY_8821'));
  assert.ok(inputFor('CASE_THREAD_A2').includes('THREAD_CONTEXT_CANARY'),'same-user thread context must persist');
  for(const marker of ['CASE_THREAD_A','CASE_THREAD_NEW']) {
    assert.ok(!inputWithTools(marker).includes('ALICE_PUBLIC_MEMORY_6382'),'thread notes must not inherit parent-room notes');
    assert.ok(!inputFor(marker).includes('ALICE_PUBLIC_CANARY_7406'),'thread context must not inherit parent-room history');
  }

  for(const marker of ['CASE_THREAD_B','CASE_THREAD_NEW','CASE_A3']) {
    assert.ok(!inputWithTools(marker).includes('ALICE_THREAD_MEMORY_8821'));
    assert.ok(!inputFor(marker).includes('THREAD_CONTEXT_CANARY'));
  }
  const relays=backendCalls.filter(call=>call.path==='/api/ingress/relay');
  assert.deepEqual(new Set(relays.map(call=>call.body.platform_user_id)),new Set(['USYNTHA01','USYNTHB02']));
  for(const {body:relay} of relays) {assert.equal(relay.platform,'slack');assert.equal(relay.workspace_id,privacy.teamId);assert.equal(relay.channel_id,'GSYNTHPRI');}
  const fundCalls=backendCalls.filter(call=>call.path==='/api/agent/operations');
  assert.equal(fundCalls.length,1,'non-director must not read the funds snapshot');
  assert.equal(fundCalls[0].body.operation,'available_funds');
  assert.equal(fundCalls[0].body.input.channelId,'GSYNTHPRI');
  assert.equal(fundCalls[0].body.input.workspaceId,privacy.teamId);
  assert.notEqual(evidence.trace[0].sessionKey,evidence.trace[1].sessionKey);
  assert.equal(evidence.trace[0].sessionKey,evidence.trace[5].sessionKey);
  assert.equal(evidence.acks.length,17);
  assert.ok(evidence.sent.some(reply=>reply.thread_ts==='1800000001.000001'));
  console.log('Native Slack probe passed: 29 actual model requests, two synthetic users, public/private channels, DM, threads, scoped memory, atomic forget and existing Foundation actor/Board checks. No real Slack or Foundation connection.');
} catch(error) {
  if(process.env.REIN_ISOLATION_KEEP_EVIDENCE==='1') {
    writeFileSync(join(temp,'gateway.log'),output);writeFileSync(join(temp,'requests.json'),JSON.stringify(requests,null,2));writeFileSync(join(temp,'backend.json'),JSON.stringify(backendCalls,null,2));console.error(`Synthetic probe evidence retained at ${temp}`);
  }
  throw error;
} finally {
  stop('SIGTERM');await new Promise(r=>{if(exited)r();else{child.once('exit',r);setTimeout(()=>{stop('SIGKILL');r();},3000).unref();}});
  stop('SIGKILL');
  await new Promise(r=>server.close(r));
  if(process.env.REIN_ISOLATION_KEEP_EVIDENCE!=='1')rmSync(temp,{recursive:true,force:true});
}
