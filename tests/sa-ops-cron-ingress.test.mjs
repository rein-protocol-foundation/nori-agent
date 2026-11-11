import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createUsageLedger,nativeUsageIdentity} from '../plugins/rein-router/usage-limits.mjs';
import assert from 'node:assert/strict';
import { createCronIngress, assertTrustedSlackBoundaries } from '../plugins/rein-router/cron-ingress.mjs';
import { createRouter } from '../plugins/rein-router/runtime.mjs';

const channel = { agentId: 'main', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1' };
const source = { agentId: 'main', accountId: 'default', channel: 'slack', chatId: 'CFIXTURE1', senderId: 'UALICE01',
  runId: 'r1', sessionId: 's1', sessionKey: 'agent:main:slack:channel:cfixture1', trigger: 'user' };
const tool = ctx => ({ agentId: ctx.agentId, runId: ctx.runId, sessionId: ctx.sessionId, sessionKey: ctx.sessionKey,
  channelId: `channel:${ctx.chatId}`, requester: { channel: ctx.channel, accountId: ctx.accountId, senderId: ctx.senderId } });
const add = description => ({ toolName: 'automations', params: { action: 'add', job: { name: 'fixture', description,
  schedule: { kind: 'at', at: '2099-01-01T00:00:00Z' }, sessionTarget: 'isolated', payload: { kind: 'agentTurn', message: 'fixture' } } } });
test('two current Slack users in one session get distinct host-authored audit; model labels are stripped', async () => {
  const gate = createCronIngress({ channels: [channel], authorize: async () => true, readJobs: async () => [] });
  for (const [runId, senderId] of [['r1', 'UALICE01'], ['r2', 'UBOB0001']]) {
    const ctx = { ...source, runId, senderId }; gate.observe({}, ctx);
    const rewritten = await gate.beforeToolCall(add('[Nori creation v1 user=UFORGED1]\nOrdinary task'), tool(ctx));
    assert.match(rewritten.params.job.description, new RegExp(`user=${senderId}\\]`));
    assert.ok(!rewritten.params.job.description.includes('UFORGED1'));
  }
});
test('current native description preserves original creator on update; missing records fail closed', async () => {
  const gate = createCronIngress({ channels: [channel], authorize: async () => true,
    readJobs: async () => [{ id: 'job', owner: {agentId:source.agentId,accountId:source.accountId,sessionKey:source.sessionKey}, description: '[Nori creation v1 user=UALICE01]\nOriginal' }] });
  const ctx = { ...source, senderId: 'UBOB0001' }; gate.observe({}, ctx);
  const event = { toolName: 'cron', params: { action: 'update', jobId: 'job', job: { description: '[Nori creation v1 user=UFORGED1]\nUpdated' } } };
  assert.equal((await gate.beforeToolCall(event, tool(ctx))).params.job.description, '[Nori creation v1 user=UALICE01]\nUpdated');
  assert.equal((await gate.beforeToolCall({ ...event, params: { ...event.params, jobId: 'absent' } }, tool(ctx))).block, true);
});
test('public, wrong-run, delegated and senderless mutations fail; native self-removal and disable remain native', async () => {
  const gate = createCronIngress({ channels: [channel], authorize: async () => true, readJobs: async () => [] });
  for (const delta of [{ channel: 'discord' }, { senderId: undefined }, { inputProvenance: { kind: 'inter_session' } }, { agentId: 'public' }, { trigger: 'cron' }]) {
    const ctx = { ...source, ...delta }; gate.observe({}, ctx);
    assert.equal((await gate.beforeToolCall(add('fixture'), tool(ctx))).block, true);
  }
  gate.observe({}, source);
  assert.equal((await gate.beforeToolCall(add('fixture'), { ...tool(source), runId: 'other' })).block, true);
  assert.equal(await gate.beforeToolCall({ toolName: 'automations', params: { action: 'remove', jobId: 'self' } }, {}), undefined);
  assert.equal(await gate.beforeToolCall({ toolName: 'automations', params: { action: 'update', jobId: 'self', job: { enabled: false } } }, {}), undefined);
});
test('compact aliases and flat fields are rewritten; executor retarget and ambiguous fields cannot escape', async () => {
  const gate = createCronIngress({ channels: [channel], authorize: async () => true, readJobs: async () => [] }); gate.observe({}, source);
  const event = { toolName: 'tool_call', params: { id: 'openclaw:core:cron', args: { action: 'add', name: 'flat', description: 'flat', payload: { kind: 'agentTurn', message: 'x' } } } };
  const result = await gate.beforeToolCall(event, tool(source));
  assert.match(result.params.args.job.description, /user=UALICE01/); assert.equal(result.params.args.description, undefined);
  assert.equal((await gate.beforeToolCall({ ...add('x'), params: { action: 'add', job: { agentId: 'other' } } }, tool(source))).block, true);
  assert.equal((await gate.beforeToolCall({ ...add('x'), params: { action: 'add', job: { ' description ': 'forged' } } }, tool(source))).block, true);
});
test('only effective public-to-trusted policies fail; allowed internal cooperation and unknown channels survive', () => {
  const base={agents:{ownership:'explicit',entries:{main:{},public:{},worker:{}}},
    bindings:[{agentId:'public',match:{channel:'discord'}}],tools:{agentToAgent:{enabled:false}}};
  for(const host of [
    {...base,bindings:[{agentId:'main',match:{channel:'discord'}}]},
    {...base,tools:{agentToAgent:{enabled:true,allow:['*']}}},
    {...base,agents:{...base.agents,defaults:{subagents:{allowAgents:['main']}}}},
    {...base,agents:{...base.agents,entries:{...base.agents.entries,public:{subagents:{allowAgents:['*']}}}}},
  ]) assert.throws(()=>assertTrustedSlackBoundaries([channel],host),/rein_router_/);
  assert.doesNotThrow(()=>assertTrustedSlackBoundaries([channel],{...base,
    tools:{agentToAgent:{enabled:true,allow:['main','worker']}}}));
  assert.doesNotThrow(()=>assertTrustedSlackBoundaries([channel],{...base,
    tools:{agentToAgent:{enabled:true,allow:['pub*']}}}));
  assert.doesNotThrow(()=>assertTrustedSlackBoundaries([channel],{...base,
    bindings:[{agentId:'main',match:{channel:'private-custom'}}],channels:{'private-custom':{enabled:true}},
    tools:{agentToAgent:{enabled:true}}}));
});
test('trimmed native action names cannot bypass creation checks, including compact aliases',async()=>{
  const gate=createCronIngress({channels:[channel],authorize:async()=>true,readJobs:async()=>[]});
  for(const action of [' add ',' update ']){
    const event={toolName:'automations',params:{action,job:{enabled:true}}};
    assert.equal((await gate.beforeToolCall(event,tool(source))).block,true);
    assert.equal((await gate.beforeToolCall({toolName:'tool_call',params:{id:'openclaw:core:cron',args:event.params}},tool(source))).block,true);
  }
  gate.observe({},source);
  assert.equal((await gate.beforeToolCall({...add('test'),params:{...add('test').params,action:' add '}},tool(source))).params.action,'add');
});
test('native fixed default/override never calls Jev; configured Provider and billing ceilings remain', async () => {
  const route = id => ({ id, provider: 'fixture', gatewayModel: `fixture/${id}`, billingSource: 'synthetic',
    billingMode: 'subscription', billingVerified: true, purpose: 'fixture', effort: 'high', contextWindow: 32768, maxTokens: 1024 });
  const router = createRouter({ config: { enabled: true, gateway: { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'TEST_KEY' },
    routes: [route('standard'), route('override')], defaultRoute: 'standard', decision: { allowPaidJev: true } },
    decisions: { evaluate: async () => assert.fail('native fixed selection must not invoke Jev') } });
  for (const modelId of ['auto', 'override', 'forbidden']) {
    const ctx = { ...source, senderId: undefined, trigger: 'cron', modelProviderId: 'rein-magpie', modelId, runId: modelId };
    const selected = await router.beforeModelResolve({ prompt: 'ordinary work' }, ctx);
    assert.equal(selected.modelOverride, modelId === 'auto' ? 'standard' : modelId);
    assert.equal(router.beforeAgentRun({}, { ...ctx, modelId: selected.modelOverride }).outcome, modelId === 'forbidden' ? 'block' : 'pass');
  }
});

test('native eligibility is enforced with and without model resolution, including scoped agents',async()=>{
  const route=id=>({id,provider:'fixture',gatewayModel:`fixture/${id}`,gatewayKeyEnvVar:'TEST_KEY',effort:'high',billingSource:'synthetic',billingMode:'subscription',billingVerified:true,purpose:'fixture',contextWindow:32768,maxTokens:1024});
  const policy={allowedRoutes:['standard','override'],allowPaidUsage:false,default:{primary:'standard',fallbacks:[]},origins:[{platform:'slack',accountId:'default',workspaceId:'TFIXTURE1',channelIds:['CFIXTURE1']}],maxOutputTokens:512,requestTimeoutMs:1000};
  for(const scoped of [false,true]) for(const resolve of [false,true]) for(const modelId of ['standard','override']){
    const r=createRouter({config:{enabled:true,gateway:{baseUrl:'http://127.0.0.1:3425/v1',apiKeyEnvVar:'TEST_KEY'},routes:[route('standard'),route('override')],defaultRoute:'standard',nativeAgentRoutes:{main:['standard']},...(scoped?{scopedPolicies:{main:policy}}:{})}});
    const ctx={...source,senderId:undefined,trigger:'cron',modelProviderId:'rein-magpie',modelId};
    if(resolve) await r.beforeModelResolve({prompt:'work'},ctx);
    assert.equal(r.beforeAgentRun({},ctx).outcome,modelId==='standard'?'pass':'block',JSON.stringify({scoped,resolve,modelId}));
  }
});


test('native exact channel projection accepts bare/prefixed ID and refuses other channels/prefixes', async () => {
  const gate = createCronIngress({channels:[channel],authorize:async()=>true,readJobs:async()=>[]});
  gate.observe({},source);
  for (const channelId of [source.chatId, `channel:${source.chatId}`])
    assert.ok((await gate.beforeToolCall(add('task'),{...tool(source),channelId})).params);
  for (const channelId of [undefined,'COTHER01','channel:COTHER01',`slack:${source.chatId}`,`prefix:channel:${source.chatId}`])
    assert.equal((await gate.beforeToolCall(add('task'),{...tool(source),channelId})).block,true);
});
test('audit merging never returns other owner/session/account stamps; old ownerless descriptions fail closed', async () => {
  const event={toolName:'automations',params:{action:'update',jobId:'private',job:{description:'new description'}}};
  for (const owner of [undefined,{agentId:'other',accountId:source.accountId,sessionKey:source.sessionKey},
    {agentId:source.agentId,accountId:'other',sessionKey:source.sessionKey},
    {agentId:source.agentId,accountId:source.accountId,sessionKey:'other'}]) {
    const gate=createCronIngress({channels:[channel],authorize:async()=>true,
      readJobs:async()=>[{id:'private',owner,description:'[Nori creation v1 user=PRIVATE]'}]});
    gate.observe({},source);
    const result=await gate.beforeToolCall(event,tool(source));
    assert.equal(result.block,true);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    assert.ok((await gate.beforeToolCall({...event,params:{...event.params,job:{name:'safe rename'}}},tool(source))).params);
  }
});
test('auth/store rejection and combined deadline explicitly block without leaking errors or hanging timers',async()=>{
  const event={toolName:'automations',params:{action:'update',jobId:'private',job:{description:'new'}}};
  for(const authorize of [async()=>{throw Error('private auth');},async()=>true]) {
    const gate=createCronIngress({channels:[channel],authorize,readJobs:async()=>{throw Error('private store');}});
    gate.observe({},source);const result=await gate.beforeToolCall(event,tool(source));
    assert.equal(result.block,true);assert.ok(!JSON.stringify(result).includes('private'));
  }
  for(const slow of ['auth','store']){
    const never=()=>new Promise(()=>{});
    const gate=createCronIngress({channels:[channel],deadlineMs:20,
      authorize:slow==='auth'?never:async()=>true,readJobs:slow==='store'?never:async()=>[]});
    gate.observe({},source);assert.equal((await gate.beforeToolCall(event,tool(source))).block,true);
  }
});

test('background subscription eligibility never widens coding-only access',async()=>{
  const route=id=>({id,provider:'fixture',gatewayModel:`fixture/${id}`,gatewayKeyEnvVar:'TEST_KEY',effort:'high',billingSource:'synthetic',billingMode:'subscription',billingVerified:true,purpose:'fixture',contextWindow:32768,maxTokens:1024});
  const base={enabled:true,gateway:{baseUrl:'http://127.0.0.1:3425/v1',apiKeyEnvVar:'TEST_KEY'},routes:[route('standard'),{...route('premium'),access:'development-complex-coding'},{...route('plan'),billingMode:'coding-plan'}],defaultRoute:'standard'};
  for(const modelId of ['premium','plan']){
    const ctx={...source,senderId:undefined,trigger:'cron',modelProviderId:'rein-magpie',modelId};
    const router=createRouter({config:base});await router.beforeModelResolve({prompt:'work'},ctx);
    assert.equal(router.beforeAgentRun({},ctx).outcome,'block');
  }
});

test('senderless native runs retain durable per-agent concurrency and Provider request budgets',t=>{
  const stateDir=mkdtempSync(join(tmpdir(),'sa-ops-native-usage-'));
  const limits={perUserPerMinute:10,perConversationPerMinute:10,perUserConcurrent:2,perConversationConcurrent:2,maxConcurrent:1,maxGatewayRequestsPerDay:1};
  let ledger=createUsageLedger({stateDir});
  t.after(()=>{ledger.close();rmSync(stateDir,{recursive:true,force:true});});
  const ctx={...source,senderId:undefined,trigger:'cron'};
  const first=nativeUsageIdentity(ctx),second=nativeUsageIdentity({...ctx,runId:'r2',sessionKey:'agent:main:cron:other'});
  ledger.admit(first,limits);assert.throws(()=>ledger.admit(second,limits),/request_limit/);
  ledger.reserveRequest(first,limits);
  ledger.settle({runId:ctx.runId,agentId:ctx.agentId,sessionKey:ctx.sessionKey,stream:'lifecycle',data:{phase:'end',executionSettled:true}});
  ledger.close();ledger=createUsageLedger({stateDir});
  assert.throws(()=>ledger.admit(second,limits),/daily_budget/);
});


test('native non-scoped fallback preserves primary, checks every candidate and follows declared order',async()=>{
  const route=id=>({id,provider:'fixture',gatewayModel:`fixture/${id}`,effort:'high',billingSource:'synthetic',billingMode:'subscription',billingVerified:true,purpose:'fixture',contextWindow:32768,maxTokens:1024});
  const cfg={enabled:true,gateway:{baseUrl:'http://127.0.0.1:3425/v1',apiKeyEnvVar:'TEST_KEY'},routes:['primary','fallback','later','unapproved'].map(route),defaultRoute:'primary',fallbackRoutes:['fallback','later','unapproved'],nativeAgentRoutes:{main:['primary','fallback','later']}};
  for (const modelId of ['auto','primary']){
    const ctx={...source,senderId:undefined,trigger:'cron',modelProviderId:'rein-magpie',modelId};
    const r=createRouter({config:cfg,decisions:{evaluate:async()=>assert.fail('native fixed primary must not call Jev')}});
    assert.equal((await r.beforeModelResolve({prompt:'work'},ctx)).modelOverride,'primary');
    assert.equal(r.beforeAgentRun({}, {...ctx,modelId:'primary'}).outcome,'pass');
    r.lifecycleEvent({runId:ctx.runId,stream:'lifecycle',data:{phase:'error'}});
    assert.equal(r.beforeAgentRun({}, {...ctx,modelId:'later'}).reason,'rein_router_fallback_order_disallowed');
    assert.equal(r.beforeAgentRun({}, {...ctx,modelId:'unapproved'}).reason,'rein_router_native_route_disallowed');
    assert.equal((await r.beforeModelResolve({prompt:'work'}, {...ctx,modelId:'fallback'})).modelOverride,'primary');
    assert.equal(r.beforeAgentRun({}, {...ctx,modelId:'fallback'}).outcome,'pass');
    assert.equal(r.beforeAgentRun({}, {...ctx,modelId:'later'}).outcome,'pass');
    assert.equal(r.beforeAgentRun({}, {...ctx,modelId:'primary'}).reason,'rein_router_fallback_order_disallowed');
  }
});

test('original development subscription default works for senderless Cron/memory only with explicit Agent eligibility',async()=>{
  const route=id=>({id,provider:'fixture',gatewayModel:`fixture/${id}`,effort:'high',billingSource:'synthetic',billingMode:'subscription',billingVerified:true,purpose:'fixture',contextWindow:32768,maxTokens:1024});
  const cfg={enabled:true,gateway:{baseUrl:'http://127.0.0.1:3425/v1',apiKeyEnvVar:'TEST_KEY'},routes:[route('standard'),{...route('development'),access:'development-complex-coding'},{...route('plan'),billingMode:'coding-plan'},{...route('admin'),access:'admin-complex-coding'}],defaultRoute:'standard'};
  for(const trigger of ['cron','memory']) for(const resolve of [true,false]){
    const ctx={...source,agentId:'nori-development',senderId:undefined,trigger,modelProviderId:'rein-magpie',modelId:'development'};
    for(const explicit of [true,false]){
      const r=createRouter({config:{...cfg,...(explicit?{nativeAgentRoutes:{'nori-development':['development']}}:{})},decisions:{evaluate:async()=>assert.fail('no live user/role/Jev on native execution')}});
      if(resolve) assert.equal((await r.beforeModelResolve({prompt:'work'},ctx)).modelOverride,'development');
      assert.equal(r.beforeAgentRun({},ctx).outcome,explicit?'pass':'block');
    }
  }
  for(const forbidden of ['plan','admin']) assert.throws(()=>createRouter({config:{...cfg,nativeAgentRoutes:{'nori-development':[forbidden]}}}),/nativeAgentRoutes/);
});

test('public reachability uses native normalized targets and catches indirect spawn/send hops',()=>{
  const base={agents:{ownership:'explicit',entries:{main:{subagents:{allowAgents:['worker']}},public:{},worker:{}}},bindings:[{agentId:'public',match:{channel:'discord'}}],tools:{agentToAgent:{enabled:false}}};
  for(const target of ['MAIN',' MAIN ']) assert.throws(()=>assertTrustedSlackBoundaries([channel],{...base,agents:{...base.agents,entries:{...base.agents.entries,public:{subagents:{allowAgents:[target]}}}}}),/reachable/);
  for(const edge of ['spawn','send']){
    const host=structuredClone(base);host.agents.entries.public.subagents={allowAgents:[' WORKER ']};
    if(edge==='spawn')host.agents.entries.worker.subagents={allowAgents:[' MAIN ']};
    else host.tools.agentToAgent={enabled:true,allow:['worker','main']};
    assert.throws(()=>assertTrustedSlackBoundaries([channel],host),/reachable/);
  }
  const isolated=structuredClone(base);isolated.agents.entries.worker.subagents={allowAgents:[' MAIN ']};isolated.tools.agentToAgent={enabled:true,allow:['main','worker']};
  assert.doesNotThrow(()=>assertTrustedSlackBoundaries([channel],isolated));
  isolated.agents.entries.public.subagents={allowAgents:['nonexistent']};
  assert.doesNotThrow(()=>assertTrustedSlackBoundaries([channel],isolated));
  const list=structuredClone(isolated);list.agents.list=Object.entries(list.agents.entries).map(([id,entry])=>({id,...entry}));delete list.agents.entries;
  list.agents.list.find(entry=>entry.id==='public').subagents={allowAgents:[' WORKER ']};
  assert.throws(()=>assertTrustedSlackBoundaries([channel],list),/reachable/);
});
