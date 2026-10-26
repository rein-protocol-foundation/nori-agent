import test from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { readMagpieCatalog, compileCatalog, mergeRouterFragment, recommendPolicy } from '../plugins/rein-router/catalog-sync.mjs';
import { createConsoleSync, validateConsoleSettings } from '../scripts/router-console-sync.mjs';
import { createConsoleServer, decorateMagpieHtml } from '../scripts/router-console.mjs';
import { createRouter } from '../plugins/rein-router/runtime.mjs';
import { loadMagpieGatewayEnvironment } from '../scripts/magpie-gateway-env.mjs';

const metadata = () => ({ providers: [{ id: 'test', name: 'Test subscription', ready: true, models: [
  { id: 'flash', name: 'Flash', on: true, reasonless: true, context: 65536, output: 8192 },
  { id: 'pro', name: 'Pro', on: true, efforts: ['low','medium','high'], context: 131072, output: 16384 },
] }] });
const settings = () => ({ enabled: true, dynamic: false, allowPaidUsage: false,
  funding: { test: { mode: 'subscription', confirmed: true } }, policy: {}, fallbacks: [] });
const gateway = { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'REIN_MAGPIE_GATEWAY_KEY', subscriptionOnly: true };
const compile = (c = readMagpieCatalog(metadata()), s = settings()) => compileCatalog({ catalog:c, settings:s, gateway, pluginPath:'/synthetic/plugins/rein-router' });

test('native metadata projects exact exposed models, capabilities and limits without credentials or groups', () => {
  const raw = metadata(); raw.providers[0].key = 'NEVER-EXPOSE'; raw.providers[0].headers = { Authorization:'NEVER-EXPOSE' };
  raw.providers[0].models.push({ id:'hidden',on:false }, {id:'image',on:true,kind:'image'}, {id:'../bad',on:true});
  raw.providers.push({id:'off',name:'Off',off:true,models:[{id:'x',on:true}]});
  const catalog = readMagpieCatalog(raw);
  assert.deepEqual(catalog.map(m=>m.id), ['test/flash','test/pro']);
  assert.equal(catalog[0].maxTokens,8192); assert.deepEqual(catalog[1].efforts,['low','medium','high']);
  assert.ok(!JSON.stringify(catalog).includes('NEVER-EXPOSE'));
  const result = compile(catalog); assert.equal(result.policy.quick.model, 'test/flash'); assert.equal(result.policy.code.effort,'high');
  assert.equal(result.fragment.models.providers['rein-magpie'].models.length,7);
});

test('unconfirmed, paid and provider fallback paths never silently enter the OpenClaw catalog', () => {
  assert.throws(()=>compile(undefined,{...settings(),funding:{}}),/no_eligible_models/);
  const s = settings(); s.funding.test.mode='pay-as-you-go'; assert.throws(()=>compile(undefined,s),/no_eligible_models/);
  s.allowPaidUsage=true;
  assert.throws(()=>compile(undefined,s),/paid_usage_not_authorized/); // both policy switches required
  const c = readMagpieCatalog(metadata()); c[0].hasFallback=true; c[1].hasFallback=true;
  assert.throws(()=>compile(c),/no_eligible_models/);
});

test('strategies reject removed models and unsupported efforts instead of inventing provider models', () => {
  const s=settings();s.policy={code:{model:'test/pro',effort:'off'}};
  assert.throws(()=>compile(undefined,s),/effort_invalid_code/);
  s.policy.code={model:'removed/pro',effort:'high'};assert.throws(()=>compile(undefined,s),/model_missing_code/);
  assert.throws(()=>validateConsoleSettings(JSON.parse('{"funding":{"__proto__":{}}}')),/invalid/);
});

test('automatic defaults require a capable effort before any OpenClaw configuration is published', async t => {
  for (const dynamic of [false, true]) {
    const f = await fixture(t), before = await readFile(f.hostPath, 'utf8');
    f.raw.providers[0].models = f.raw.providers[0].models.filter(m => m.reasonless);
    await assert.rejects(f.sync.save({ ...settings(), dynamic }), /router_capable_default_required/);
    assert.equal(await readFile(f.hostPath, 'utf8'), before);
    assert.equal(f.keys.length, 0);
    for (const effort of ['off', 'low']) {
      const s = { ...settings(), dynamic, policy: { general: { model: effort === 'off' ? 'test/flash' : 'test/pro', effort } } };
      assert.throws(() => compile(undefined, s), /router_capable_default_required/);
    }
  }
});

test('recommendations choose a capable default even when a reasonless model has a higher name rank', () => {
  const c = readMagpieCatalog(metadata()); c[0].id = 'test/large-pro'; c[1].id = 'test/mini';
  const result = compile(c);
  assert.equal(result.policy.general.model, 'test/mini');
  assert.equal(result.policy.general.effort, 'medium');
  const manual = result.fragment.plugins.entries['rein-router'].config.routes.find(r => r.gatewayModel === 'test/large-pro');
  assert.equal(manual.effort, 'off');
  assert.ok(result.fragment.models.providers['rein-magpie'].models.some(m => m.id === manual.id));
  c[1].efforts = ['high', 'off', 'low'];
  assert.equal(compile(c).policy.general.effort, 'high', 'capable recommendations must not depend on metadata effort ordering');
});

test('merging preserves unrelated provider, agents, tools, channels, secrets and model overrides', () => {
  const host={ models:{providers:{existing:{baseUrl:'unchanged'}}},agents:{defaults:{model:'existing/a',models:{'existing/a':{alias:'old'}}},list:[{id:'nori',model:'existing/a'}]},
    channels:{discord:{enabled:true}},tools:{allow:['test']}, secrets:{providers:{store:{source:'file'}}}, plugins:{entries:{other:{enabled:true}}} };
  const original=structuredClone(host), f=compile().fragment;
  const out=mergeRouterFragment(host,f,{pluginPath:'/test/plugin',typesafePath:'/test/typesafe'});
  assert.deepEqual(host,original);assert.deepEqual(out.channels,host.channels);assert.deepEqual(out.agents.list,host.agents.list);
  assert.deepEqual(out.tools,host.tools);assert.deepEqual(out.secrets,host.secrets);assert.deepEqual(out.models.providers.existing,host.models.providers.existing);
  assert.equal(out.agents.defaults.model.primary,'rein-magpie/auto');
});

async function fixture(t) {
  const root=realpathSync(await mkdtemp(join(tmpdir(),'rein-console-test-')));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'runtime/openclaw'),{recursive:true});
  const hostPath=join(root,'runtime/openclaw/openclaw.json');await writeFile(hostPath,JSON.stringify({channels:{slack:{enabled:true}},agents:{defaults:{model:'old/a'}}}),{mode:0o600});
  let raw=metadata(), keys=[], calls=[];
  const unavailable = new Set();
  const native=async (path,body)=>{
    calls.push({path,body});
    if (unavailable.has(path)) throw new Error('synthetic-native-unavailable');
    if(path==='/api/providers')return structuredClone(raw);
    if(path==='/api/caller-keys')return {keys:structuredClone(keys).map(({secret,...k})=>k)};
    if(path.endsWith('/add-key'))keys.push({id:'owned',name:body.name,secret:'sk-magpie-key-'+ 'a'.repeat(48)});
    else if(path.endsWith('/copy-key')){}
    else if(path.endsWith('/off-key'))keys.find(k=>k.id===body.key).off=true;
    else if(path.endsWith('/on-key'))keys.find(k=>k.id===body.key).off=false;
    else if(path.endsWith('/models-key'))keys.find(k=>k.id===body.key).models=body.models;
    else throw new Error('unexpected request');
    return {keys:structuredClone(keys).map(({secret,...k})=>k),secret:keys.find(k=>k.id===body?.key)?.secret ?? keys.at(-1)?.secret};
  };
  const sync=createConsoleSync({root,native,spendCheck:async()=>{}});await sync.init();
  return {root,hostPath,sync,calls,keys,unavailable,get raw(){return raw;},set raw(v){raw=v;}};
}

test('one save creates scoped credentials, backs up and merges profile; polling tracks new and removed models', async t=>{
  const f=await fixture(t);await f.sync.save(settings());
  assert.deepEqual(f.keys[0].models,['test/flash','test/pro']);assert.equal(f.keys[0].off,false);
  const config=JSON.parse(await readFile(f.hostPath,'utf8'));
  assert.equal(config.plugins.entries['rein-router'].config.gateway.managed.mode,'console');
  assert.deepEqual(config.channels,{slack:{enabled:true}});
  const baseline=await readFile(join(f.root,'runtime/openclaw/openclaw.before-router-console.json'),'utf8');
  f.raw.providers[0].models.push({id:'new-pro',name:'New',on:true,efforts:['medium','high']});
  await f.sync.refresh();assert.equal(f.keys[0].models.length,3);
  f.raw.providers[0].models=f.raw.providers[0].models.filter(m=>m.id!=='pro');
  await f.sync.refresh();assert.equal(f.keys[0].models.length,2);
  assert.equal(await readFile(join(f.root,'runtime/openclaw/openclaw.before-router-console.json'),'utf8'),baseline);
  assert.equal((await stat(join(f.root,'runtime/magpie/gateway.env'))).mode&0o777,0o600);
  await f.sync.close();assert.equal(f.keys[0].off,true);
});

test('loss of all models disables the owned key; recovery works without enabling paid providers',async t=>{
  const f=await fixture(t);await f.sync.save(settings());const previous=f.raw;f.raw={providers:[]};
  await assert.rejects(f.sync.refresh(),/catalog_empty/);assert.equal(f.keys[0].off,true);
  f.raw=previous;await f.sync.refresh();assert.equal(f.keys[0].off,false);
  f.raw.providers.push({id:'paid',name:'Paid API',models:[{id:'new',on:true}]});await f.sync.refresh();
  assert.ok(f.keys[0].models.every(m=>!m.startsWith('paid/')));
});

test('Jev secrets never appear in state, OpenClaw JSON or backups and are loaded only for opted-in console profiles',async t=>{
  const f=await fixture(t);const s={...settings(),dynamic:true};
  await assert.rejects(f.sync.save(s),/jev_key_required/);
  await f.sync.save(s,'synthetic-jev-test-key');
  assert.ok(!JSON.stringify(await f.sync.view()).includes('synthetic-jev-test-key'));
  const host=await readFile(f.hostPath,'utf8');assert.ok(!host.includes('synthetic-jev-test-key'));
  const env=loadMagpieGatewayEnvironment({root:f.root,environment:{OPENCLAW_CONFIG_PATH:f.hostPath}});
  assert.equal(env.JEV_API_KEY,'synthetic-jev-test-key');
  const cfg=JSON.parse(host);cfg.plugins.entries['rein-router'].config.decision.allowPaidJev=false;cfg.plugins.entries.typesafe.enabled=false;await writeFile(f.hostPath,JSON.stringify(cfg));
  assert.equal(loadMagpieGatewayEnvironment({root:f.root,environment:{OPENCLAW_CONFIG_PATH:f.hostPath}}).JEV_API_KEY,undefined);
});

test('an ambient Jev key cannot mark the console configured, enable routing or rescue a deleted saved key', async t => {
  const previous = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = 'synthetic-shell-jev';
  t.after(() => { if (previous === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = previous; });
  const f = await fixture(t), before = await readFile(f.hostPath, 'utf8');
  assert.equal((await f.sync.view()).jevKeyConfigured, false);
  await assert.rejects(f.sync.save({ ...settings(), dynamic: true }), /router_jev_key_required/);
  assert.equal(await readFile(f.hostPath, 'utf8'), before);
  assert.equal(f.keys.length, 0);
  await f.sync.save({ ...settings(), dynamic: true }, 'synthetic-project-jev');
  assert.equal((await f.sync.view()).jevKeyConfigured, true);
  const env = loadMagpieGatewayEnvironment({ root: f.root, environment: {
    OPENCLAW_CONFIG_PATH: f.hostPath, JEV_API_KEY: process.env.JEV_API_KEY,
  } });
  assert.equal(env.JEV_API_KEY, 'synthetic-project-jev');
  await rm(join(f.root, 'runtime/magpie/router-console-secret.json'));
  await assert.rejects(f.sync.refresh(), /router_jev_key_required/);
  assert.equal(f.keys[0].off, true);
  assert.equal((await f.sync.view()).jevKeyConfigured, false);
});

test('symlink config targets cannot be overwritten by the console',async t=>{
  const f=await fixture(t);const target=join(f.root,'target');await writeFile(target,'unchanged');await rm(f.hostPath);await symlink(target,f.hostPath);
  await assert.rejects(f.sync.save(settings()),/path_invalid|sync_failed/);assert.equal(await readFile(target,'utf8'),'unchanged');
});

test('UI proxy requires authenticated session, exact host and same-origin mutations', async t=>{
  const f=await fixture(t);const server=await createConsoleServer({sync:f.sync,nativeOrigin:'http://127.0.0.1:9',nativeSecret:'private',token:'test-session-token'});
  t.after(()=>server.close());
  assert.equal((await fetch(server.origin+'/_rein/api/state')).status,401);
  const login=await fetch(server.link,{redirect:'manual'});const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie};
  assert.equal((await fetch(server.origin+'/_rein/api/state',{headers})).status,200);
  assert.equal((await fetch(server.origin+'/_rein/api/refresh',{method:'POST',headers})).status,403);
  assert.equal((await fetch(server.origin+'/_rein/api/refresh',{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'}})).status,403);
  assert.equal((await fetch(server.origin+'/_rein/api/refresh',{method:'POST',headers:{...headers,Origin:server.origin}})).status,200);
  const rejected = await new Promise(resolve => { const r=request(server.origin+'/_rein/api/state',{headers:{...headers,Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);}); r.end(); });
  assert.equal(rejected,403);
});

test('saved Jev keys are revealed only by authenticated same-origin POST and never by normal state', async t => {
  const f = await fixture(t), secret = 'synthetic-reveal-only-jev';
  await assert.rejects(f.sync.revealJevKey(), /router_jev_key_required/);
  await f.sync.save({ ...settings(), enabled: false }, secret);
  const keyPath = join(f.root, 'runtime/magpie/router-console-secret.json');
  const beforeKey = await readFile(keyPath, 'utf8'), beforeConfig = await readFile(f.hostPath, 'utf8');
  const server = await createConsoleServer({ sync: f.sync, nativeOrigin: 'http://127.0.0.1:9', nativeSecret: 'private' });
  t.after(() => server.close());
  const path = server.origin + '/_rein/api/jev-key/reveal';
  assert.equal((await fetch(path, { method: 'POST', headers: { Origin: server.origin } })).status, 401);
  const login = await fetch(server.link, { redirect: 'manual' });
  const Cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(path, { headers: { Cookie } })).status, 404);
  assert.equal((await fetch(path, { method: 'POST', headers: { Cookie } })).status, 403);
  assert.equal((await fetch(path, { method: 'POST', headers: { Cookie, Origin: 'https://attacker.invalid' } })).status, 403);
  const response = await fetch(path, { method: 'POST', headers: { Cookie, Origin: server.origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { jevApiKey: secret });
  const state = await fetch(server.origin + '/_rein/api/state', { headers: { Cookie } });
  const text = await state.text(); assert.ok(!text.includes(secret));
  assert.equal(JSON.parse(text).jevKeyConfigured, true);
  assert.equal(await readFile(keyPath, 'utf8'), beforeKey);
  assert.equal(await readFile(f.hostPath, 'utf8'), beforeConfig);
  await rm(keyPath);
  const missing = await fetch(path, { method: 'POST', headers: { Cookie, Origin: server.origin } });
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { error: 'router_jev_key_required' });
});

test('native page decoration adds page using upstream kernel and leaves Provider editor in place',()=>{
  const html='<head></head><button data-view="providers">Providers</button><button data-view="routing">Routing</button><script src="kernel.js"></script><script src="app.js"></script>';
  const result=decorateMagpieHtml(html);assert.ok(result.includes('data-view="providers"'));assert.ok(result.includes('data-view="rein-router"'));
  assert.ok(result.indexOf('/_rein/router.js')<result.indexOf('src="app.js"'));assert.throws(()=>decorateMagpieHtml('<html>changed</html>'),/incompatible/);
});

test('an explicit Agent target receives routing without changing defaults or other agents',()=>{
  const host={agents:{defaults:{model:'old/default'},list:[{id:'nori',model:'old/nori',tools:{allow:['lookup']}},{id:'other',model:'old/other'}]}};
  const out=mergeRouterFragment(host,compile().fragment,{pluginPath:'/test',typesafePath:'/typesafe',targetAgent:'nori'});
  assert.equal(out.agents.defaults.model,'old/default');assert.equal(out.agents.list[0].model.primary,'rein-magpie/auto');
  assert.deepEqual(out.agents.list[0].tools,host.agents.list[0].tools);assert.equal(out.agents.list[1].model,'old/other');
});

test('an invalid tightened policy stays paused across refreshes instead of restoring old authorization',async t=>{
  const f=await fixture(t);await f.sync.save(settings());
  const tightened=settings();tightened.funding.test.confirmed=false;
  await assert.rejects(f.sync.save(tightened),/no_eligible_models/);assert.equal(f.keys[0].off,true);
  await assert.rejects(f.sync.refresh(),/no_eligible_models/);assert.equal(f.keys[0].off,true);
  assert.equal(JSON.parse(await readFile(join(f.root,'runtime/magpie/router-console.json'),'utf8')).funding.test.confirmed,false);
});

test('pausing revokes the active key before a failed catalog refresh and never re-enables it on recovery', async t => {
  const f = await fixture(t); await f.sync.save(settings());
  const before = await readFile(f.hostPath, 'utf8'); f.calls.length = 0;
  f.unavailable.add('/api/providers');
  await assert.rejects(f.sync.save({ ...settings(), enabled: false }));
  assert.equal(f.keys[0].off, true);
  assert.ok(f.calls.findIndex(c => c.path.endsWith('/off-key')) < f.calls.findIndex(c => c.path === '/api/providers'));
  assert.equal(JSON.parse(await readFile(join(f.root,'runtime/magpie/router-console.json'),'utf8')).enabled, false);
  f.unavailable.clear(); await f.sync.refresh();
  assert.equal(f.keys[0].off, true);
  assert.ok(!f.calls.some(c => c.path.endsWith('/on-key')));
  assert.equal(await readFile(f.hostPath, 'utf8'), before);
});

test('a failed key revocation is retried on disabled refreshes after native service recovery', async t => {
  const f = await fixture(t); await f.sync.save(settings()); f.calls.length = 0;
  f.unavailable.add('/api/caller-keys/off-key');
  await assert.rejects(f.sync.save({ ...settings(), enabled: false }));
  assert.equal(f.keys[0].off, false);
  f.unavailable.clear(); await f.sync.refresh();
  assert.equal(f.keys[0].off, true);
  assert.ok(!f.calls.some(c => c.path.endsWith('/on-key')));
});

test('removing a saved default automatically repairs policy from the remaining confirmed catalog',async t=>{
  const f=await fixture(t);
  f.raw.providers[0].models.push({id:'zz-pro',on:true,efforts:['medium','high']});
  const s=settings();s.policy=recommendPolicy(readMagpieCatalog(f.raw));await f.sync.save(s);
  f.raw.providers[0].models=f.raw.providers[0].models.filter(m=>m.id!=='pro');await f.sync.refresh();
  const host=JSON.parse(await readFile(f.hostPath,'utf8'));
  assert.equal(host.plugins.entries['rein-router'].config.routes.find(r=>r.id==='general').gatewayModel,'test/zz-pro');
});

test('losing the last capable model pauses the key without publishing an unusable default, then recovers', async t => {
  const f = await fixture(t); await f.sync.save(settings());
  const before = await readFile(f.hostPath, 'utf8'), previous = structuredClone(f.raw);
  f.raw.providers[0].models = f.raw.providers[0].models.filter(m => m.reasonless);
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(f.sync.refresh(), /router_capable_default_required/);
    assert.equal(f.keys[0].off, true);
    assert.equal(await readFile(f.hostPath, 'utf8'), before);
    assert.equal((await f.sync.view()).error, 'router_capable_default_required');
  }
  f.raw = previous; await f.sync.refresh();
  assert.equal(f.keys[0].off, false);
  assert.equal((await f.sync.view()).error, null);
});


test('disabling Dynamic Router removes its decision dependency and preserves another Agent using TypeSafe',async t=>{
  const f=await fixture(t);await f.sync.save({...settings(),dynamic:true},'synthetic-jev-test-key');
  await f.sync.save(settings());
  const host=JSON.parse(await readFile(f.hostPath,'utf8'));
  assert.equal(host.agents.defaults.decisionModel,undefined);
  assert.equal(host.plugins.entries.typesafe.enabled,false);
  assert.equal(loadMagpieGatewayEnvironment({root:f.root,environment:{OPENCLAW_CONFIG_PATH:f.hostPath}}).JEV_API_KEY,undefined);
  await f.sync.save({...settings(),dynamic:true});
  const shared=JSON.parse(await readFile(f.hostPath,'utf8'));
  shared.agents.list=[{id:'other',model:'old/other',decisionModel:'typesafe/jev-latest'}];
  await writeFile(f.hostPath,JSON.stringify(shared));
  await f.sync.save(settings());
  const after=JSON.parse(await readFile(f.hostPath,'utf8'));
  assert.equal(after.agents.list[0].decisionModel,'typesafe/jev-latest');assert.equal(after.plugins.entries.typesafe.enabled,true);
  assert.equal(loadMagpieGatewayEnvironment({root:f.root,environment:{OPENCLAW_CONFIG_PATH:f.hostPath}}).JEV_API_KEY,'synthetic-jev-test-key');
});


test('a paused or unavailable Console gateway blocks the run before spending on Jev',async()=>{
  const config=structuredClone(compile().fragment.plugins.entries['rein-router'].config);
  config.gateway.managed={mode:'console',binaryPath:'/synthetic/magpie',homeDir:'/synthetic/home'};
  config.decision.allowPaidJev=true;let decisions=0;
  const router=createRouter({config,environment:{REIN_MAGPIE_GATEWAY_KEY:'sk-magpie-key-'+ 'a'.repeat(48)},
    fetchImpl:async()=>new Response('{}',{status:403}),decisions:{evaluate:async()=>{decisions++;throw new Error('must not classify');}}});
  const ctx={agentId:'nori',sessionKey:'synthetic',runId:'paused',modelProviderId:'rein-magpie',modelId:'auto',channel:'discord'};
  assert.equal(await router.beforeModelResolve({prompt:'A simple question'},ctx),undefined);
  assert.equal(router.beforeAgentRun({}, {...ctx,modelId:'general'}).reason,'rein_router_gateway_unavailable');assert.equal(decisions,0);
});
