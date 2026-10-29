import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlackDevelopmentAuthorizer, developmentChannelFor } from '../plugins/rein-router/slack-development.mjs';
import { createRouter, assertRuntimeConfig } from '../plugins/rein-router/runtime.mjs';
import { buildOpenClawFragment, validateRouterConfig } from '../plugins/rein-router/policy.mjs';
const entry = { accountId:'default',workspaceId:'TFIXTURE1',channelId:'CFIXTURE1',agentId:'nori-development',botTokenEnvVar:'SLACK_TEST_TOKEN' };
const context = { runId:'r1',agentId:entry.agentId,sessionKey:'agent:nori-development:slack:fixture',sessionId:'s1',channel:'slack',accountId:'default',senderId:'UMEMBER1',chatId:entry.channelId,trigger:'user',modelProviderId:'rein-magpie',modelId:'auto' };
const route = (id, access='all') => ({ id,effort:'high',provider:'fixture',gatewayModel:`fixture/${id}`,billingSource:'fixture',billingMode:'subscription',billingVerified:true,purpose:'Coding',contextWindow:32768,maxTokens:1024,access });
const config = { enabled:true,gateway:{baseUrl:'http://127.0.0.1:3425/v1',apiKeyEnvVar:'TEST_KEY'},routes:[route('standard'),route('premium','development-complex-coding')],defaultRoute:'standard',fallbackRoutes:[],decision:{allowPaidJev:true},adminSenders:[],developmentChannels:[entry] };
const goodChannel = { id:entry.channelId,context_team_id:entry.workspaceId,is_private:true,is_member:true,is_archived:false,is_im:false,is_mpim:false };
function authorization(overrides={}, foundation=async()=>true) {
  const calls=[];
  const payloads={ 'auth.test':{team_id:entry.workspaceId,user_id:'UBOT0001',bot_id:'BBOT0001'},'conversations.info':{channel:goodChannel},'conversations.members':{members:['UMEMBER1','UADMIN01']},...overrides };
  const check=createSlackDevelopmentAuthorizer({config,env:{SLACK_TEST_TOKEN:'xoxb-fixture-token'},authorizeFoundation:foundation,fetchImpl:async(url,opts)=>{
    const method=url.split('/').at(-1);calls.push(method);assert.equal(opts.redirect,'error');
    assert.notEqual(method,'conversations.history','membership authorization must not inspect invitation history');
    const value=typeof payloads[method]==='function'?await payloads[method](new URLSearchParams(opts.body)):payloads[method];
    return Response.json({ok:true,...value});
  }});
  return {check,calls};
}
test('configured private channel membership and Foundation authority suffice without an administrator list or invitation history',async()=>{
  let backend=0;const {check,calls}=authorization({},async()=>{backend++;return true;});
  assert.equal(await check(context),true);assert.equal(await check(context),true);assert.equal(backend,2);assert.equal(calls.length,6);
  assert.equal(await check({...context,senderId:'UADMIN01'}),true);assert.equal(backend,3);
});
test('channel, membership and current backend denial fail closed',async()=>{
  for(const overrides of [
    {'auth.test':{team_id:'TOTHER01',user_id:'UBOT0001',bot_id:'BBOT0001'}},
    ...[{is_private:false},{is_shared:true},{is_archived:true},{context_team_id:'TOTHER01'}].map(delta=>({'conversations.info':{channel:{...goodChannel,...delta}}})),
    {'conversations.members':{members:['UADMIN01']}},
    {'conversations.members':{ok:false,error:'ratelimited'}},
  ]){let backend=0;assert.equal(await authorization(overrides,async()=>{backend++;return true;}).check(context),false);assert.equal(backend,0);}
  for(const foundation of [async()=>false,async()=>{throw Error('unavailable');}])assert.equal(await authorization({},foundation).check(context),false);
});
test('leaving the configured channel revokes access on the next check',async()=>{
  let joined=true,backend=0;
  const {check}=authorization({'conversations.members':()=>({members:joined?['UMEMBER1']:[]})},async()=>{backend++;return true;});
  assert.equal(await check(context),true);
  joined=false;assert.equal(await check(context),false);assert.equal(backend,1);
});
test('paginated membership is supported without accepting repeated cursors',async()=>{
  const paged=authorization({'conversations.members':p=>p.get('cursor')?{members:['UMEMBER1']}:{members:['UADMIN01'],response_metadata:{next_cursor:'members2'}}});
  assert.equal(await paged.check(context),true);
  const repeated=authorization({'conversations.members':{members:[],response_metadata:{next_cursor:'same'}}});assert.equal(await repeated.check(context),false);assert.equal(repeated.calls.length,4);
});
test('missing and conflicting native context never reaches Slack or backend',async()=>{
  for(const delta of [{senderId:undefined},{runId:undefined},{channel:'discord'},{accountId:'other'},{chatId:'COTHER01'},{agentId:'main'},{trigger:'cron'},{inputProvenance:{kind:'inter_session'}},{channelContext:{sender:{id:'UOTHER01'}}},{channelContext:{chat:{id:'COTHER01'}}}]){
    const {check,calls}=authorization();assert.equal(developmentChannelFor(config,{...context,...delta}),null);assert.equal(await check({...context,...delta}),false);assert.equal(calls.length,0);
  }
});
const complex = probabilityTrue => ({status:'ok',result:{answers:{route:{type:'choice',choice:'premium',probabilities:{premium:0.98}},task:{type:'choice',choice:'coding',probabilities:{coding:0.98}},contextIndependent:{type:'boolean',probabilityTrue:0.99},complexDevelopment:{type:'boolean',probabilityTrue}}}});
const toolContext=delta=>({runId:context.runId,agentId:context.agentId,sessionKey:context.sessionKey,requester:{channel:'slack',accountId:'default',senderId:context.senderId},...delta});
test('developer tools recheck revocation and cannot inherit another run or requester',async()=>{
  let allowed=true,checks=0;const r=createRouter({config,authorizeDevelopment:async()=>{checks++;return allowed;},decisions:{evaluate:async()=>complex(0.99)}});
  assert.equal((await r.beforeModelResolve({prompt:'Implement and test multiple files'},context)).modelOverride,'premium');
  assert.equal(r.beforeAgentRun({},{...context,modelId:'premium'}).outcome,'pass');
  assert.equal(await r.beforeToolCall({},toolContext()),undefined);assert.equal(checks,2);
  for(const delta of [{runId:'other'},{sessionKey:'other'},{requester:{channel:'slack',accountId:'default',senderId:'UOTHER01'}},{requester:undefined}])assert.equal((await r.beforeToolCall({},toolContext(delta))).block,true);
  allowed=false;assert.equal((await r.beforeToolCall({},toolContext())).block,true);
  assert.equal((await r.beforeModelResolve({prompt:'Implement and test'}, {...context,runId:'r2'})).modelOverride,'standard');
  assert.equal(r.beforeAgentRun({},{...context,runId:'r2',modelId:'standard'}).outcome,'block');
});
test('simple terminal work stays on normal route; manual premium and fallback cannot bypass classification',async()=>{
  const r=createRouter({config:{...config,fallbackRoutes:['premium']},authorizeDevelopment:async()=>true,decisions:{evaluate:async()=>complex(0.1)}});
  assert.equal((await r.beforeModelResolve({prompt:'Print Python version'},context)).modelOverride,'standard');
  assert.equal(r.beforeAgentRun({},{...context,modelId:'standard'}).outcome,'pass');
  assert.equal(r.beforeAgentRun({},{...context,modelId:'premium'}).outcome,'block');
  const manual={...context,runId:'manual',modelId:'premium'};await r.beforeModelResolve({prompt:'Print Python version'},manual);
  assert.equal(r.beforeAgentRun({},manual).outcome,'block');
  const ordinary={...context,runId:'ordinary',modelId:'standard'};await r.beforeModelResolve({prompt:'Print Python version'},ordinary);assert.equal(r.beforeAgentRun({},ordinary).outcome,'pass');
});
test('development agents require explicit isolation with elevated execution disabled',()=>{
  const c=validateRouterConfig(config),host=buildOpenClawFragment(c, new URL("../plugins/rein-router", import.meta.url).pathname);assert.throws(()=>assertRuntimeConfig(c,host),/development agent/);
  host.agents.list=[{id:entry.agentId,sandbox:{mode:'all',backend:'ssh'},tools:{elevated:{enabled:false}}}];assert.doesNotThrow(()=>assertRuntimeConfig(c,host));
  host.agents.list[0].tools.elevated.enabled=true;assert.throws(()=>assertRuntimeConfig(c,host),/development agent/);
});
