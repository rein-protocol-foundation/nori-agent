// Native UI smoke and documentation screenshots use synthetic providers only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, chmod, writeFile, readFile, rm } from 'node:fs/promises';
import { realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { magpiePaths, verifyMagpieInstallation, projectRoot } from './magpie-dependency.mjs';
import { listen } from './router-console.mjs';

export async function verifyRouterConsole({ screenshots = false } = {}) {
  const prepared = await verifyMagpieInstallation();
  const root = realpathSync(await mkdtemp(join(tmpdir(), 'rein-console-native-')));
  const paths = magpiePaths(root);
  let child, browser, mock, deny;
  let inferenceCalls = 0, lastPayload;
  try {
    for (const dir of [join(root,'plugins/rein-router'),join(root,'.toolchain/magpie-bin'),join(root,'runtime/magpie/config/magpie'),join(root,'runtime/openclaw')]) await mkdir(dir,{recursive:true,mode:0o700});
    await copyFile(prepared.binaryPath,paths.binary);await chmod(paths.binary,0o700);
    await copyFile(`${prepared.binaryPath}.json`,`${paths.binary}.json`);
    await copyFile(magpiePaths(projectRoot).lock,paths.lock);
    mock = createServer(async (req,res) => {
      let body='';for await (const chunk of req) body+=chunk;
      res.setHeader('Content-Type','application/json');
      if (req.method==='GET') return res.end(JSON.stringify({data:[{id:'gemini-2.5-flash'},{id:'gpt-5.4'}]}));
      inferenceCalls++;lastPayload=JSON.parse(body);
      res.end(JSON.stringify({id:'synthetic',object:'chat.completion',model:lastPayload.model,choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'synthetic-tool',type:'function',function:{name:'synthetic_lookup',arguments:'{}'}}]}}]}));
    });
    const mockPort=await listen(mock);
    deny=createServer((req,res)=>{req.resume();res.writeHead(403);res.end();});
    deny.on('connect',(_req,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'));
    const proxy=`http://127.0.0.1:${await listen(deny)}`;
    const providers={providers:[{id:'demo',name:'Demo Subscription',key:'synthetic-not-a-provider-key',chat:`http://127.0.0.1:${mockPort}/v1`,models:['gemini-2.5-flash','gpt-5.4'],contexts:{'*':65536}}],noAutoGroups:true};
    await writeFile(join(root,'runtime/magpie/config/magpie/providers.json'),JSON.stringify(providers),{mode:0o600});
    await writeFile(join(root,'runtime/magpie/config/magpie/settings.json'),JSON.stringify({noAutoUpdate:true,noAccountDiscovery:true,noStats:true,noUsageStats:true,quotaReads:'asked',proxy}),{mode:0o600});
    await writeFile(join(root,'runtime/openclaw/openclaw.json'),JSON.stringify({agents:{defaults:{model:'existing/model'}},channels:{discord:{enabled:true}},tools:{allow:['synthetic_lookup']}}),{mode:0o600});
    const free=createServer();const gatewayPort=await listen(free);await new Promise(r=>free.close(r));
    const entry = new URL('./router-console.mjs', import.meta.url).href;
    const code=`import { runRouterConsole } from ${JSON.stringify(entry)};await runRouterConsole({root:process.env.REIN_CONSOLE_FIXTURE,port:0,gatewayPort:${gatewayPort},noOpen:true,environment:process.env});`;
    const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|LANG|LC_[A-Z_]+|TZ|TERM)$/.test(k)));
    child=spawn(process.execPath,['--input-type=module','-e',code],{env:{...clean,REIN_CONSOLE_FIXTURE:root,HTTP_PROXY:proxy,HTTPS_PROXY:proxy,NO_PROXY:'127.0.0.1,localhost'},stdio:['ignore','pipe','pipe']});
    const link=await new Promise((ok,no)=>{
      let output='';const timeout=setTimeout(()=>no(new Error('native console startup timed out')),20000);
      child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/OpenClaw Router: (http:\/\/127\.0\.0\.1:\d+\/\?k=[a-f0-9]+)/);if(match){clearTimeout(timeout);ok(match[1]);}});
      child.stderr.on('data',chunk=>{output+=chunk;});child.on('exit',()=>{clearTimeout(timeout);no(new Error('native console exited: '+output));});
    });
    const require=createRequire(new URL('../vendor/openclaw/package.json',import.meta.url));
    const {chromium}=require('playwright');browser=await chromium.launch({headless:true, ...(!existsSync(chromium.executablePath()) && process.platform==='darwin' && existsSync('/Applications/Google Chrome.app') ? {channel:'chrome'} : {})});
    const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.stack));
    await page.goto(link);
    try { await page.waitForSelector('#rein-save',{state:'visible',timeout:12000}); } catch(e) { console.error('UI errors:',errors);console.error((await page.locator('body').innerText()).slice(0,2500));await page.screenshot({path:'/tmp/rein-router-console-debug.png',fullPage:true});throw e; }
    await page.waitForFunction(()=>document.querySelector('#rein-catalog')?.textContent.includes('Demo Subscription'));
    assert.equal(errors.length,0,errors.join('\n'));
    assert.ok(await page.locator('#view-agents').isHidden());
    if (screenshots) {
      await mkdir(resolve(projectRoot,'docs/images/router-console'),{recursive:true});
      await page.screenshot({path:resolve(projectRoot,'docs/images/router-console/01-router-overview.png'),fullPage:true});
      await page.getByRole('button',{name:'管理 Providers ↗'}).click();
      await page.waitForSelector('#view-providers',{state:'visible'});
      await page.waitForFunction(()=>document.querySelector('#view-providers')?.textContent.includes('Demo Subscription'));
      await page.screenshot({path:resolve(projectRoot,'docs/images/router-console/02-magpie-providers.png'),fullPage:true});
      await page.locator('#nav button[data-view="rein-router"]').click();
    }
    await page.getByRole('switch',{name:'确认 Demo Subscription 计费设置'}).click();
    await page.getByRole('button',{name:'保存并连接 OpenClaw',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#rein-message')?.textContent.length>0,{},{timeout:12000});
    assert.ok((await page.locator('#rein-message').innerText()).startsWith('已同步到 OpenClaw'),await page.locator('#rein-message').innerText());
    const host=JSON.parse(await readFile(join(root,'runtime/openclaw/openclaw.json'),'utf8'));
    assert.equal(host.agents.defaults.model.primary,'rein-magpie/auto');
    assert.equal(host.plugins.entries['rein-router'].config.gateway.managed.mode,'console');
    assert.deepEqual(host.channels,{discord:{enabled:true}});
    assert.equal(inferenceCalls,0,'configuration never invokes paid inference');
    const env=await readFile(join(root,'runtime/magpie/gateway.env'),'utf8');const key=env.trim().split('=')[1];
    const metadata=await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`,{headers:{Authorization:`Bearer ${key}`,Origin:'null'}});
    assert.equal(metadata.status,200);
    const models=await metadata.json();assert.equal(models.data.length,2);
    // Tool-call transport through the exact native gateway, to the local synthetic provider only.
    const call=await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,Origin:'null','Content-Type':'application/json'},body:JSON.stringify({model:'demo/gpt-5.4',messages:[{role:'user',content:'Run the synthetic lookup'}],tools:[{type:'function',function:{name:'synthetic_lookup',parameters:{type:'object',properties:{}}}}],stream:false})});
    const toolResult=await call.json();assert.equal(call.status,200,JSON.stringify(toolResult));assert.equal(toolResult.choices[0].message.tool_calls[0].function.name,'synthetic_lookup');assert.equal(lastPayload.tools[0].function.name,'synthetic_lookup');
    if(screenshots){
      await page.getByRole('switch',{name:'启用 Dynamic Router 和 Jev 分类计费'}).click();
      await page.locator('#rein-jev-key').fill(''); // No hosted Jev call or secret in a screenshot.
      await page.mouse.move(1100,700);await page.mouse.wheel(0,5000);
      await page.waitForTimeout(400);
      await page.screenshot({path:resolve(projectRoot,'docs/images/router-console/03-dynamic-router.png')});
      await page.setViewportSize({width:390,height:844});await page.locator('#rein-jev-key').blur();await page.mouse.move(240,400);await page.mouse.wheel(0,-5000);await page.waitForTimeout(400);
      await page.screenshot({path:resolve(projectRoot,'docs/images/router-console/04-mobile.png'),fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    }
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('Native Router Console OK: upstream UI kit, provider page, one-save sync, scoped catalog, tool calls and responsive layout. Synthetic provider only; no hosted Jev calls.');
  } finally {
    await browser?.close();
    if(child && child.exitCode===null){child.kill('SIGTERM');await new Promise(resolveDone=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolveDone();},8000);child.once('exit',()=>{clearTimeout(timer);resolveDone();});});}
    for(const server of [mock,deny])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await rm(root,{recursive:true,force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await verifyRouterConsole({screenshots:process.argv.includes('--screenshots')});
