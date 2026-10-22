import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createConnection, createServer } from 'node:net';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { magpiePaths, projectRoot, readMagpieLock } from '../scripts/magpie-dependency.mjs';

const pause = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } };
async function until(check, message) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { if (check()) return; await pause(15); }
  assert.fail(message);
}
async function freePort() {
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r)); return port;
}
async function listening(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.setTimeout(500, () => done(true));
  });
}

// Real wrapper and detached child processes; only loopback fixture servers, no accounts or inference.
for (const stage of ['readiness', 'initial-sync']) for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} during Console ${stage} reaps the gateway, releases its lock and tolerates signals during cleanup`,
    { skip: process.platform === 'win32', timeout: 25000 }, async t => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'rein-console-lifecycle-')));
      const paths = magpiePaths(root), phaseFile = join(root, 'phase.json'), proceed = join(root, 'proceed');
      let child, nativePid, output = '';
      t.after(async () => {
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        if (nativePid && alive(nativePid)) { try { process.kill(-nativePid, 'SIGKILL'); } catch {} }
        await until(() => !child || child.exitCode !== null || child.signalCode !== null, 'fixture wrapper must close');
        rmSync(root, { recursive: true, force: true });
      });
      for (const dir of [dirname(paths.binary), dirname(paths.lock)]) mkdirSync(dir, { recursive: true });
      copyFileSync(magpiePaths(projectRoot).lock, paths.lock);
      const binary = `#!/usr/bin/env node
const fs = require('node:fs'), http = require('node:http'), net = require('node:net');
if (process.argv[2] === 'update') process.exit(0);
const phase = name => fs.writeFileSync(${JSON.stringify(phaseFile)}, JSON.stringify({name,pid:process.pid}));
const servers = [], mode = ${JSON.stringify(stage)};
process.on('SIGTERM', () => { phase('cleanup'); setTimeout(() => { for(const s of servers) s.close(); process.exit(0); },450); });
const gateway = net.createServer(s=>s.end()); servers.push(gateway);
const [host,port] = process.env.MAGPIE_ADDR.split(':');
gateway.listen(Number(port),host,()=>{if(mode==='readiness')phase('readiness');});
if(mode==='initial-sync'){
  let providerReads=0;
  const native=http.createServer((req,res)=>{
    req.resume(); res.setHeader('Content-Type','application/json');
    if(req.url==='/api/providers'){
      if(++providerReads>1){
        phase('initial-sync'); const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(proceed)})){clearInterval(timer);res.end('{"providers":[]}');}},15);
      }else res.end('{"providers":[]}');
    }else res.end('{"keys":[]}');
  });
  servers.push(native); const addr=process.argv[process.argv.indexOf('--addr')+1].split(':');native.listen(Number(addr[1]),addr[0]);
}
`;
      writeFileSync(paths.binary, binary, { mode: 0o700 });
      const pin = readMagpieLock(root);
      writeFileSync(paths.receipt, JSON.stringify({ revision: pin.revision, version: pin.version,
        sha256: createHash('sha256').update(binary).digest('hex') }));
      const gatewayPort = await freePort();
      const entry = new URL('../scripts/router-console.mjs', import.meta.url).href;
      const code = `import {runRouterConsole} from ${JSON.stringify(entry)};try{process.exitCode=await runRouterConsole({root:${JSON.stringify(root)},gatewayPort:${gatewayPort},port:0,noOpen:true})??0;}catch(e){console.error(e.message);process.exitCode=1;}`;
      child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
      const phase = () => { try { return JSON.parse(readFileSync(phaseFile, 'utf8')); } catch { return {}; } };
      await until(() => phase().name === stage || child.exitCode !== null || child.signalCode !== null, 'fixture must reach startup phase');
      assert.equal(phase().name, stage, output); nativePid = phase().pid;
      const lock = join(root, 'runtime/magpie/.rein-magpie.lock'); assert.ok(existsSync(lock));
      assert.equal(await listening(gatewayPort), true);
      child.kill(signal); writeFileSync(proceed, 'continue');
      await until(() => phase().name === 'cleanup' || child.exitCode !== null || child.signalCode !== null, 'startup termination must reach cleanup');
      assert.equal(phase().name, 'cleanup', output);
      assert.equal(child.exitCode, null);
      assert.equal(child.signalCode, null);
      assert.ok(existsSync(lock), 'cleanup must keep ownership until the gateway is reaped');
      assert.equal(child.kill(signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT'), true);
      await until(() => child.exitCode !== null || child.signalCode !== null, 'interrupted Console must exit');
      assert.equal(child.signalCode, null, 'handlers must stay installed until cleanup completes');
      assert.equal(child.exitCode, signal === 'SIGINT' ? 130 : 143, output);
      assert.equal(alive(nativePid), false, 'detached native gateway must be reaped');
      assert.equal(await listening(gatewayPort), false, 'gateway port must close');
      assert.equal(existsSync(lock), false, 'managed profile lock must be released');
      assert.ok(!output.includes('OpenClaw Router:'), 'cancelled startup must not announce an active Console');
    });
}
