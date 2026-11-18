// Test-only native projections: execution is native; creation is restricted to trusted ingress.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyJsonSchemaDefaults } from '../../vendor/openclaw/src/shared/json-schema-defaults.js';
import { buildEmbeddedAgentHookContext } from '../../vendor/openclaw/src/agents/embedded-agent-runner/run/agent-hook-context.js';
import { buildAgentHookContext } from '../../vendor/openclaw/src/agents/harness/hook-context.js';
import { createRouter } from '../../plugins/rein-router/runtime.mjs';
import routerPlugin from '../../plugins/rein-router/index.js';
import { createCronIngress } from '../../plugins/rein-router/cron-ingress.mjs';
import { validateRouterConfig } from '../../plugins/rein-router/policy.mjs';
// Exercise the actual native manifest-default pass, before Rein's validator sees
// the object. A default on the referenced development list must not manufacture
// an explicit empty trusted list and silently revoke omitted-list inheritance.
const manifest = JSON.parse(readFileSync(new URL('../../plugins/rein-router/openclaw.plugin.json', import.meta.url), 'utf8'));
const development = { agentId: 'developer', accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', botTokenEnvVar: 'SLACK_BOT_TOKEN' };
for (const [name, raw, expected] of [
  ['omitted inherits', { developmentChannels: [development] }, [development]],
  ['explicit empty revokes', { developmentChannels: [development], trustedSlackChannels: [] }, []],
  ['explicit list retained', { trustedSlackChannels: [development] }, [development]],
  ['both omitted deny', {}, []],
] as const) {
  const input = JSON.parse(JSON.stringify(raw));
  const loaded = applyJsonSchemaDefaults(manifest.configSchema, input);
  if (!Object.hasOwn(raw, 'trustedSlackChannels')) assert.equal(Object.hasOwn(loaded, 'trustedSlackChannels'), false, name);
  assert.deepEqual(validateRouterConfig(loaded).trustedSlackChannels, expected, name);
  console.log(`PASS: native manifest defaults: ${name}`);
}
const channel={agentId:'main',accountId:'default',workspaceId:'TFIXTURE1',channelId:'CFIXTURE1'};
const base={runId:'synthetic',agentId:'main',sessionId:'session',sessionKey:'agent:main:cron:fixture',workspaceDir:'/synthetic',trigger:'cron'};
const model={modelProviderId:'rein-magpie',modelId:'standard'};
const embedded=(changes={})=>({...buildEmbeddedAgentHookContext({...base,messageChannel:'slack',agentAccountId:'default',...changes},'main',undefined),...model});
const human={...base,...model,channel:'slack',accountId:'default',senderId:'UALICE01',chatId:'CFIXTURE1',trigger:'user'};
const route={id:'standard',provider:'fixture',gatewayModel:'fixture/standard',effort:'high',billingSource:'synthetic',billingMode:'subscription',billingVerified:true,purpose:'fixture',contextWindow:32768,maxTokens:1024};
const cases=[['trusted Slack',human,true],['embedded Cron',embedded(),false],['harness Cron',{...buildAgentHookContext({...base,...model,channel:'slack',accountId:'default'})},false],
  ['memory',embedded({trigger:'memory'}),false],['child announcement',{...embedded({trigger:'user'}),inputProvenance:{kind:'inter_session',sourceTool:'subagent_announce',sourceChannel:'internal'}},false],
  ['forged system',embedded({trigger:'system'}),false],['forged external without sender',{...embedded({trigger:'user'}),inputProvenance:{kind:'external_user'}},false]] as const;
for(const [name,ctx,creator] of cases){
  const router=createRouter({config:{enabled:true,gateway:{baseUrl:'http://127.0.0.1:3425/v1',apiKeyEnvVar:'UNUSED'},routes:[route],defaultRoute:'standard'},decisions:{evaluate:async()=>assert.fail('no Jev for fixed native models')}});
  await router.beforeModelResolve({prompt:'Synthetic work'},ctx);
  assert.equal(router.beforeAgentRun({},ctx).outcome,'pass');
  const gate=createCronIngress({channels:[channel],authorize:async()=>true,readJobs:async()=>[]});gate.observe({},ctx);
  const result=await gate.beforeToolCall({toolName:'automations',params:{action:'add',job:{name:'fixture'}}},{runId:ctx.runId,sessionId:ctx.sessionId,sessionKey:ctx.sessionKey,agentId:ctx.agentId,channelId:ctx.chatId ? `channel:${ctx.chatId}` : undefined,requester:{channel:ctx.channel,accountId:ctx.accountId,senderId:ctx.senderId}});
  assert.equal(result?.block===true,!creator,name);
  console.log(`PASS: ${name}: native execution passes; creation ${creator?'passes':'blocked'}`);
}
console.log('SA-OPS: 7 native projection/creation boundary cases passed. No scheduler, network or external inference.');

// Real entry point: disabled configuration registers no hooks/provider/tools or lifecycle.
await routerPlugin.register({pluginConfig:{enabled:false},config:{},runtime:{}} as never);
console.log('PASS: disabled Router entry registers no capabilities (enabled native loader exercised by Cron fixture).');
