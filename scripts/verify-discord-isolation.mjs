import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { root, upstream, environment, requireSource } from './runtime-env.mjs';
import { PUBLIC_TOOLS } from '../plugins/rein-discord/isolation.mjs';

requireSource();
const temp = mkdtempSync(join(tmpdir(), 'rein-native-discord-isolation-'));
const requests = [];
const server = createServer(async (req,res) => {
  let body='';for await(const chunk of req) body+=chunk;
  const request=JSON.parse(body);requests.push(request);
  const userIndex=request.messages.findLastIndex(m=>m.role==='user' && /CASE_[A-Z0-9_]+/.test(JSON.stringify(m.content)));
  const marker=JSON.stringify(request.messages[userIndex]?.content).match(/CASE_[A-Z0-9_]+/)?.[0];
  const toolResult=request.messages.slice(userIndex+1).some(m=>m.role==='tool');
  const tool=marker==='CASE_A1'||marker==='CASE_DM'?'rein_memory_remember':marker==='CASE_TOOL_FORGET'?'rein_memory_forget':'rein_memory_read';
  const args=tool==='rein_memory_remember'?{name:'canary',value:marker==='CASE_A1'?'ALICE_PUBLIC_MEMORY_6382':'ALICE_PRIVATE_MEMORY_9921'}:{};
  const delta=toolResult ? {role:'assistant',content:marker==='CASE_TOOL_FORGET'?'STALE_FORGOTTEN_OUTPUT_CANARY':'OK'} : {role:'assistant',tool_calls:[{index:0,id:`call_${marker}`,type:'function',function:{name:'tool_call',arguments:JSON.stringify({id:tool,args})}}]};
  res.writeHead(200, {'content-type':'text/event-stream'});
  const completion={id:'privacy-probe',object:'chat.completion.chunk',created:1,model:'canary',choices:[{index:0,delta,finish_reason:null}]};
  res.write(`data: ${JSON.stringify(completion)}\n\n`);
  res.write(`data: ${JSON.stringify({...completion,choices:[{index:0,delta:{},finish_reason:toolResult?'stop':'tool_calls'}]})}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const reservation=createSocketServer();
await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
const gatewayPort=reservation.address().port;
await new Promise(r=>reservation.close(r));
const publicDir=join(temp,'public');mkdirSync(publicDir);
const pluginDir=join(temp,'plugin');mkdirSync(pluginDir);
const fixture=readFileSync(join(root,'tests/fixtures/discord-isolation-gateway.ts'),'utf8').replaceAll('../../plugins/rein-discord/',`${join(root,'plugins/rein-discord')}/`);
writeFileSync(join(pluginDir,'index.ts'),fixture);
writeFileSync(join(pluginDir,'openclaw.plugin.json'),readFileSync(join(root,'plugins/rein-discord/openclaw.plugin.json')));
writeFileSync(join(pluginDir,'package.json'),JSON.stringify({name:'@rein-protocol/privacy-test-fixture',type:'module',openclaw:{extensions:['./index.ts']}}));
symlinkSync(join(root,'plugins/rein-discord/node_modules'),join(pluginDir,'node_modules'));
const privacy={agentId:'main',botUserId:'100000000000000008',tokenEnv:'REIN_TEST_NO_DISCORD_TOKEN',memoryPath:join(temp,'private/member.sqlite'),requireMention:false,
  guilds:[{id:'100000000000000001',channelIds:['100000000000000002'],userIds:['100000000000000003','100000000000000004']}],dmAllowFrom:['100000000000000003']};
const cfg={gateway:{mode:'local',bind:'loopback',port:gatewayPort,auth:{mode:'token',token:'synthetic-isolation-probe-no-real-credentials'}},
  agents:{defaults:{workspace:publicDir,skipBootstrap:true,model:{primary:'privacy-probe/canary'},compaction:{memoryFlush:{enabled:false}}}},
  memory:{search:{enabled:false,rememberAcrossConversations:false}},
  tools:{allow:PUBLIC_TOOLS,fs:{workspaceOnly:true},sessions:{visibility:'self'},agentToAgent:{enabled:false}},
  models:{providers:{'privacy-probe':{baseUrl:`http://127.0.0.1:${port}/v1`,apiKey:'synthetic-probe',api:'openai-completions',models:[{id:'canary',name:'canary',contextWindow:32768,maxTokens:512,reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}},
  channels:{discord:{enabled:true}},plugins:{allow:['rein-discord','openai'],load:{paths:[pluginDir]},entries:{discord:{enabled:false},'rein-discord':{enabled:true,config:privacy}}}};
const configPath=join(temp,'openclaw.json');writeFileSync(configPath,JSON.stringify(cfg));
const evidencePath=join(temp,'evidence.json');
let output='';
const child=spawn(process.execPath,[join(upstream,'openclaw.mjs'),'gateway','run','--allow-unconfigured'],{cwd:upstream,detached:true,
  env:{...environment(),OPENCLAW_STATE_DIR:join(temp,'state'),OPENCLAW_CONFIG_PATH:configPath,REIN_ISOLATION_EVIDENCE_PATH:evidencePath,OPENCLAW_SKIP_CRON:'1',OPENCLAW_SKIP_BUNDLED_DOCTOR:'1'},stdio:['ignore','pipe','pipe']});
const stop = signal => { try { process.kill(-child.pid,signal); } catch(error) { if(error.code!=='ESRCH')throw error; } };
child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
let exited=false;child.on('exit',()=>{exited=true;});
try {
  const deadline=Date.now()+150000;
  while(!existsSync(evidencePath)&&!exited&&Date.now()<deadline) await new Promise(r=>setTimeout(r,250));
  assert.ok(existsSync(evidencePath),`Native gateway did not complete the probe:\n${output.slice(-10000)}`);
  const evidence=JSON.parse(readFileSync(evidencePath));
  assert.ok(!evidence.error,evidence.error);
  assert.equal(evidence.privateMemorySaved,true,'DM tool must really persist a private note before testing its exclusion from public requests');
  assert.equal(requests.length,17,`Expected seventeen real provider requests; forget must not continue the old model loop:\n${output.slice(-10000)}`);
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
  for(const marker of ['CASE_A1','CASE_A2','CASE_B1','CASE_B2','CASE_A3','CASE_TOOL_FORGET','CASE_AFTER_TOOL_FORGET','CASE_A4']) {
    assert.ok(!JSON.stringify(requestsFor(marker)).includes('ALICE_PRIVATE_CANARY_3281'),`${marker} received DM context`);
    assert.ok(!JSON.stringify(requestsFor(marker)).includes('ALICE_PRIVATE_MEMORY_9921'),`${marker} received private memory`);
  }
  for(const marker of ['CASE_B1','CASE_B2','CASE_AFTER_TOOL_FORGET','CASE_A4'])assert.ok(!JSON.stringify(requestsFor(marker)).includes('ALICE_PUBLIC_MEMORY_6382'),`${marker} received another scope's or forgotten memory`);
  assert.equal(requestsFor('CASE_TOOL_FORGET').length,1,'forget must abort before a post-tool model request');
  assert.deepEqual(evidence.sent.filter(entry=>entry[2]==='100000000000000017').map(entry=>entry[1]),['已删除指定记忆，并开始新对话。']);
  assert.ok(!JSON.stringify(evidence.sent).includes('STALE_FORGOTTEN_OUTPUT_CANARY'));
  assert.ok(JSON.stringify(requestsFor('CASE_A2').at(-1).messages).includes('ALICE_PUBLIC_MEMORY_6382'),'own public memory must be usable');
  assert.ok(JSON.stringify(requestsFor('CASE_A3').at(-1).messages).includes('ALICE_PUBLIC_MEMORY_6382'),'own memory must survive session reset');
  assert.ok(!inputFor('CASE_DM').includes('ALICE_PUBLIC_CANARY_7406'),'DM must also be separate from public context');
  assert.notEqual(evidence.trace[0].sessionKey,evidence.trace[1].sessionKey);
  assert.equal(evidence.trace[0].sessionKey,evidence.trace[3].sessionKey);
  assert.notEqual(evidence.trace[0].sessionKey,evidence.trace[5].sessionKey);
  console.log('Native Gateway/provider probe passed: two synthetic users, separate DM, seventeen model requests with real memory tools; forget aborts before model continuation and sends only a host acknowledgement. No real Discord accounts or backend calls.');
} catch(error) {
  if(process.env.REIN_ISOLATION_KEEP_EVIDENCE==='1') {
    writeFileSync(join(temp,'gateway.log'),output);writeFileSync(join(temp,'requests.json'),JSON.stringify(requests,null,2));console.error(`Synthetic probe evidence retained at ${temp}`);
  }
  throw error;
} finally {
  stop('SIGTERM');await new Promise(r=>{if(exited)r();else{child.once('exit',r);setTimeout(()=>{stop('SIGKILL');r();},3000).unref();}});
  stop('SIGKILL');
  await new Promise(r=>server.close(r));
  if(process.env.REIN_ISOLATION_KEEP_EVIDENCE!=='1')rmSync(temp,{recursive:true,force:true});
}
