import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as socketServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const root=process.cwd();
const blockedArtifact = process.argv.includes('--blocked-artifact');
const upstream=resolve(process.env.REIN_TEST_OPENCLAW??join(root,'vendor/openclaw'));const original=resolve(upstream,'../..');
const temp=mkdtempSync(join(tmpdir(),'rein-acp-settlement-'));for(const d of ['state','workspace','fixture','home'])mkdirSync(join(temp,d));
const evidencePath=join(temp,'evidence.json');const evidence=()=>existsSync(evidencePath)?JSON.parse(readFileSync(evidencePath,'utf8')):{tools:[]};
const fixtureSource=readFileSync(join(root,'tests/fixtures/slack-task-loop.ts'),'utf8');
const fetchShim=fixtureSource.slice(fixtureSource.indexOf('const originalFetch'),fixtureSource.indexOf("export default definePluginEntry"));
const channel=fixtureSource.slice(fixtureSource.indexOf("  api.registerChannel({"),fixtureSource.indexOf("      try {\n        await dispatch('TASK_LOOP_RESEARCH_START')"));
const source=`import {writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {readFileWithinRoot} from 'openclaw/plugin-sdk/file-access-runtime';
import {definePluginEntry} from 'openclaw/plugin-sdk/plugin-entry';
import {registerAcpRuntimeBackend,unregisterAcpRuntimeBackend,tryDispatchAcpReplyHook} from 'openclaw/plugin-sdk/acp-runtime';
import {createTaskContinuation} from ${JSON.stringify(join(root,'plugins/rein-acp/continuation.mjs'))};
import {createSlackDevelopmentAuthorizer} from ${JSON.stringify(join(root,'plugins/rein-router/slack-development.mjs'))};
const state=process[Symbol.for('rein.terminal.native.state')]??={tools:[],sent:[],runs:[],backend:[],membership:true,done:false};
${fetchShim}
export default definePluginEntry({id:'terminal-native-fixture',name:'Terminal native fixture',register(api){
const config={channel:{agentId:'main',accountId:'default',workspaceId:'TFIXTURE1',channelId:${blockedArtifact ? "'CPILOT001'" : "'CFIXTURE1'"},botTokenEnvVar:'SYNTHETIC_SLACK'},additionalChannelIds:${blockedArtifact ? "['CFIXTURE1']" : '[]'},continuation:{maxAttempts:4,maxNoProgress:2,maxActiveFlows:16,maxRuntimeMs:3600000},harnessAgentId:'codex',cwd:process.env.SYNTHETIC_WORKSPACE};
const controller=createTaskContinuation({config,readFileWithinRoot,tasks:api.runtime.tasks,events:api.runtime.events,subagent:{...api.runtime.subagent,waitForRun:async()=>({status:'timeout'})},system:api.runtime.system,session:api.runtime.agent.session,authorize:createSlackDevelopmentAuthorizer({config:{developmentChannels:[config.channel,...config.additionalChannelIds.map(channelId=>({...config.channel,channelId}))]}}),isNativeChild:ctx=>ctx.sessionKey?.includes(':acp:'),logger:api.logger});
const receiptSlot=process[Symbol.for('rein.terminal.native.receipt')]??={value:null};
api.registerService({id:'fast-native-acp',start(){registerAcpRuntimeBackend({id:'fast-native-acp',healthy:()=>true,runtime:{async ensureSession(input){return {sessionKey:input.sessionKey,backend:'fast-native-acp',runtimeSessionName:input.sessionKey,cwd:input.cwd};},getCapabilities(){return {controls:['session/status','session/set_config_option','session/set_mode']};},async setConfigOption(){},async setMode(){},async getStatus(){return {summary:'Synthetic ACP backend'};},async *runTurn(input){state.backend.push({event:'start',session:input.handle.sessionKey});save();
let result='SYNTHETIC_FAST_ACP_RESULT: bounded task complete; synthetic check passed.';
if (${blockedArtifact}) {
  const [file] = input.text.match(/acp-review-[0-9a-f]{64}[.]md/) ?? [];
  if (!file) throw Error('Expected assigned review file');
  writeFileSync(join(input.handle.cwd,file),'Verified synthetic report');
  result='Synthetic report written. Permission denied for another requested file.';
}
yield {type:'text_delta',text:result};yield {type:'done',stopReason:'end_turn'};state.backend.push({event:'done',session:input.handle.sessionKey});save();},async cancel(){},async close(){}}});},stop(){unregisterAcpRuntimeBackend('fast-native-acp');globalThis.fetch=originalFetch;}});
api.on('reply_dispatch',tryDispatchAcpReplyHook,{eligibleDispatchKinds:['acp']});
api.registerTool(controller.toolFactory,{names:['rein_continuation']});
api.on('before_agent_run',async(event,ctx)=>{state.runs.push({runId:ctx.runId,sessionKey:ctx.sessionKey,provenance:ctx.inputProvenance});save();await controller.beforeAgentRun(event,ctx);});
api.on('before_tool_call',controller.beforeToolCall,{priority:200});
api.on('after_tool_call',(event,ctx)=>{state.tools.push({name:event.toolName,params:event.params,result:event.result,error:event.error,runId:ctx.runId});if(event.toolName==='sessions_spawn'&&event.result?.details?.status==='accepted')receiptSlot.value={event,ctx};save();});
api.on('before_prompt_build',controller.beforePromptBuild);
api.on('agent_end',controller.agentEnd);
api.on('gateway_start',controller.gatewayStart);
api.on('gateway_stop',controller.gatewayStop);
api.registerTool({contextVersion:2,create(ctx){return {name:'terminal_probe',label:'Synthetic race probe',description:'Observe actual native fast completion before controller reconciliation.',parameters:{type:'object',properties:{},additionalProperties:false},async execute(){
ctx.assertInvocationCurrent();const receipt=receiptSlot.value;if(!receipt)throw Error('Actual accepted receipt missing');
const accepted=receipt.event.result.details;
const wait=await api.runtime.subagent.waitForRun({runId:accepted.runId,timeoutMs:15000});
const runs=api.runtime.tasks.async.runs.fromToolContext(ctx);let task;const end=Date.now()+15000;
do{task=await runs.resolve(accepted.runId);if(task?.status==='succeeded')break;await new Promise(r=>setTimeout(r,25));}while(Date.now()<end);
if(task?.status!=='succeeded'||task.runId!==accepted.runId||task.childSessionKey!==accepted.childSessionKey||task.ownerKey!==ctx.sessionKey||task.scope!=='session')throw Error('Actual exact terminal native backing missing');
const flows=api.runtime.tasks.async.managedFlows.fromToolContext(ctx);const flow=(await flows.list()).find(f=>f.controllerId==='rein/task-continuation');if(!flow)throw Error('Actual controller flow absent');
const refused=await flows.runTask({flowId:flow.flowId,runtime:task.runtime,sourceId:task.sourceId,runId:task.runId,childSessionKey:task.childSessionKey,agentId:task.agentId,task:task.title});
if(refused.created||refused.reason!=='Task backing ownership could not be verified.')throw Error('Expected real native terminal-projection refusal missing');
state.nativeRace={accepted,wait,task,refused,flowBefore:flow};save();
await controller.afterToolCall(receipt.event,receipt.ctx);
const observed=await flows.get(flow.flowId);state.nativeRace.flowAfter=observed;save();
if(observed.stateJson.attempts[0].settlement?.source!=='native_acp_lifecycle')throw Error('Native post-cleanup event receipt was not saved independently of wait cache/review');
if(observed.stateJson.attempts[0].linkage!=='terminal_reference_only'||observed.stateJson.attempts[0].linked===true)throw Error('Controller did not preserve honest reference-only linkage');
return {content:[{type:'text',text:'Native refusal reproduced; exact terminal reference persisted.'}],details:{flowId:flow.flowId,runId:task.runId}};
}};}},{names:['terminal_probe']});
${channel}
      try {await dispatch('TERMINAL_REFERENCE_RACE');state.done=true;save();}catch(error){state.error=String(error);save();}
      await new Promise(resolve=>{if(ctx.abortSignal.aborted)resolve();else ctx.abortSignal.addEventListener('abort',resolve,{once:true});});
    }},
  });
}});
`;
const fixture=join(temp,'fixture');writeFileSync(join(fixture,'index.ts'),source);symlinkSync(join(original,'plugins/rein-router/node_modules'),join(fixture,'node_modules'));
writeFileSync(join(fixture,'package.json'),JSON.stringify({name:'@rein/terminal-native-fixture',type:'module',openclaw:{extensions:['./index.ts']}}));
writeFileSync(join(fixture,'openclaw.plugin.json'),JSON.stringify({id:'terminal-native-fixture',channels:['slack'],contracts:{tools:['rein_continuation','terminal_probe']},activation:{onStartup:true},channelConfigs:{slack:{label:'Synthetic Slack',schema:{type:'object',properties:{enabled:{type:'boolean'}},additionalProperties:false}}},configSchema:{type:'object',properties:{},additionalProperties:false}}));
let requests=0,modelError;
const server=createServer(async(req,res)=>{try{let raw='';for await(const chunk of req)raw+=chunk;const request=JSON.parse(raw);if(++requests>18)throw Error('Synthetic model call limit');const rows=evidence();const tools=rows.tools;const begun=tools.find(t=>t.name==='rein_continuation'&&t.params?.action==='begin')?.result?.details;const delegated=tools.find(t=>t.name==='rein_continuation'&&t.params?.action==='delegate')?.result?.details;let name,args,content;
if(!begun){name='rein_continuation';args={action:'begin',goal:'Synthetic fast ACP check',criteria:'Synthetic completed bounded result',runtime:'acp'};}
else if(!delegated){name='rein_continuation';args={action:'delegate',flow:begun.flowId,instruction:'Perform synthetic bounded task'};}
else if(!tools.some(t=>t.name==='sessions_spawn')){name='sessions_spawn';args={task:delegated.task,runtime:'acp',agentId:'codex',cwd:join(temp,'workspace'),mode:'run',thread:false,streamTo:'parent'};}
else if(!tools.some(t=>t.name==='sessions_spawn'&&t.result?.details?.status==='accepted')){throw Error('Native spawn refused: '+JSON.stringify(tools.filter(t=>t.name==='sessions_spawn')));}
else if(!tools.some(t=>t.name==='terminal_probe')){name='terminal_probe';args={};}
else if(!tools.some(t=>t.name==='rein_continuation'&&t.params?.action==='status')){name='rein_continuation';args={action:'status',flow:begun.flowId};}
else if(blockedArtifact && !tools.some(t=>t.name==='rein_continuation'&&t.params?.action==='read_review_file')) {
  name='rein_continuation';args={action:'read_review_file',flow:begun.flowId,scopeRevision:1};
}
else if(!tools.some(t=>t.name==='rein_continuation'&&t.params?.action==='review')){name='rein_continuation';args={action:'review',flow:begun.flowId,scopeRevision:1,outcome:blockedArtifact?'blocked':'complete',evidence:'Synthetic actual native ACP completion and bounded result verified',effects:'none',progress:true};}
else content='TERMINAL_REFERENCE_NATIVE_COMPLETE';
const delta=name?{role:'assistant',tool_calls:[{index:0,id:`terminal-${requests}`,type:'function',function:{name:'tool_call',arguments:JSON.stringify({id:name,args})}}]}:{role:'assistant',content};
res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'terminal-native-synthetic',object:'chat.completion.chunk',created:1,model:request.model};res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:name?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
}catch(error){modelError=String(error);res.writeHead(500);res.end(JSON.stringify({error:modelError}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const socket=socketServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const config={gateway:{mode:'local',bind:'loopback',port,auth:{mode:'token',token:'synthetic-terminal-native-token'}},models:{catalogRefresh:{enabled:false},providers:{fixture:{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'synthetic',api:'openai-completions',models:[{id:'synthetic',name:'Synthetic',contextWindow:65536,maxTokens:2048,input:['text'],reasoning:false,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}},agents:{ownership:'explicit',defaults:{workspace:join(temp,'workspace'),skipBootstrap:true,systemAgent:{agentId:'main'},model:{primary:'fixture/synthetic',fallbacks:[]},heartbeat:{every:'0m',target:'last'},compaction:{memoryFlush:{enabled:false}}},entries:{main:{sandbox:{mode:'off'},tools:{elevated:{enabled:false},allow:['rein_continuation','terminal_probe','sessions_spawn','subagents','apply_patch','edit','exec','process','read','write']}},codex:{workspace:join(temp,'workspace')}}},acp:{enabled:true,backend:'fast-native-acp',defaultAgent:'codex',allowedAgents:['codex']},tools:{sessions:{visibility:'tree'},agentToAgent:{enabled:true,allow:['main','codex']}},channels:{slack:{enabled:true}},bindings:[{agentId:'main',match:{channel:'slack'}}],plugins:{allow:['terminal-native-fixture','openai'],load:{paths:[fixture]},entries:{'terminal-native-fixture':{enabled:true,hooks:{allowConversationAccess:true,allowPromptInjection:true}},slack:{enabled:false},discord:{enabled:false}}}};
const configPath=join(temp,'openclaw.json');writeFileSync(configPath,JSON.stringify(config));const env={...process.env,HOME:join(temp,'home'),OPENCLAW_STATE_DIR:join(temp,'state'),OPENCLAW_CONFIG_PATH:configPath,TASK_LOOP_EVIDENCE:evidencePath,SYNTHETIC_WORKSPACE:join(temp,'workspace'),SYNTHETIC_SLACK:'xoxb-synthetic',OPENCLAW_SKIP_CRON:'1',OPENCLAW_SKIP_BUNDLED_DOCTOR:'1'};let child,log='';console.log(`Native ACP settlement evidence: ${temp}`);
try{const inspected=spawnSync(process.execPath,[join(upstream,'openclaw.mjs'),'plugins','inspect','terminal-native-fixture','--runtime','--json'],{cwd:upstream,env,encoding:'utf8',maxBuffer:8*1024*1024});writeFileSync(join(temp,'loader.log'),inspected.stdout+inspected.stderr);assert.equal(inspected.status,0,inspected.stderr||inspected.stdout);assert.equal(JSON.parse(inspected.stdout).plugin.imported,true);assert.notEqual(JSON.parse(inspected.stdout).plugin.status,'error',JSON.parse(inspected.stdout).plugin.error);
child=spawn(process.execPath,[join(upstream,'openclaw.mjs'),'gateway','run','--allow-unconfigured'],{cwd:upstream,env,detached:true,stdio:['ignore','pipe','pipe']});const capture=data=>{log+=data;writeFileSync(join(temp,'gateway.log'),log);};child.stdout.on('data',capture);child.stderr.on('data',capture);
const deadline=Date.now()+60000;while(!evidence().done){const rows=evidence();if(rows.error||modelError||child.exitCode!=null||Date.now()>deadline)throw Error(`${rows.error??modelError??'Gateway deadline/exit'}\n${log.slice(-6000)}`);await new Promise(r=>setTimeout(r,100));}
const rows=evidence();const review=rows.tools.find(t=>t.name==='rein_continuation'&&t.params?.action==='review');assert.equal(rows.nativeRace.task.status,'succeeded');assert.equal(rows.nativeRace.task.runtime,'acp');assert.equal(rows.nativeRace.refused.created,false);assert.equal(rows.nativeRace.flowBefore.stateJson.attempts[0].linked,undefined);assert.equal(rows.nativeRace.flowAfter.stateJson.attempts[0].linkage,'terminal_reference_only');if (blockedArtifact) {
  assert.equal(rows.nativeRace.task.terminalOutcome,'blocked');
  assert.equal(rows.nativeRace.flowAfter.stateJson.attempts[0].settlement.outcome,'blocked');
  assert.equal(rows.tools.find(t=>t.params?.action==='read_review_file')?.result?.details?.content,'Verified synthetic report');
  assert.equal(review.result?.details?.report?.outcome,'blocked',JSON.stringify(review));
} else assert.equal(review.result?.details?.phase,'complete',JSON.stringify(review));
assert.equal(review.result.details.attempts[0].taskId,rows.nativeRace.task.id);assert.equal(review.result.details.attempts[0].settlement.source,'native_acp_lifecycle');assert.equal(rows.backend.filter(e=>e.event==='start').length,1);assert.ok(rows.sent.some(s=>s.text.includes('TERMINAL_REFERENCE_NATIVE_COMPLETE')));console.log(JSON.stringify({status:'PASS',nativeRuntime:'acp',exactTaskId:rows.nativeRace.task.id,runId:rows.nativeRace.task.runId,nativeRunTaskRefused:true,controllerPhase:review.result.details.phase,settlement:review.result.details.attempts[0].settlement.source,childExecutions:1,temp}));
}finally{if(child){const done=new Promise(r=>child.once('exit',r));try{process.kill(-child.pid,'SIGTERM');}catch{}await Promise.race([done,new Promise(r=>setTimeout(r,4000))]);try{process.kill(-child.pid,'SIGKILL');}catch{}}server.closeAllConnections();await new Promise(r=>server.close(r));}
