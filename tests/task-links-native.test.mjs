import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { root, upstream } from '../scripts/runtime-env.mjs';

const exec = promisify(execFile);
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const close = server => new Promise(resolve => server.close(resolve));

test('real loopback Gateway executes and links two native runs across sessions',
  { skip: process.env.REIN_RUN_NATIVE_TASK_LINKS !== '1', timeout: 120000 }, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'nori-native-task-links-'));
    const paths = Object.fromEntries(['home', 'state', 'workspace', 'tmp'].map(name => [name, join(dir, name)]));
    await Promise.all(Object.values(paths).map(path => mkdir(path, { mode: 0o700 })));
    const agentInputs = [];
    const model = createHttpServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      const input = JSON.stringify(request.messages.filter(message => message.role === 'user'));
      const marker = /NATIVE_TASK_LINKS_(PRIMARY|FOLLOWUP)/.exec(input)?.[1];
      agentInputs.push(marker);
      if (!marker) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'fixture marker absent' }));
        return;
      }
      const base = { id: randomUUID(), object: 'chat.completion.chunk', created: 1, model: request.model };
      const delta = { role: 'assistant', content: `NATIVE_TASK_LINKS_${marker}_RESULT` };
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n` +
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n` +
        'data: [DONE]\n\n');
    });
    let child;
    let gatewayLog = '';
    async function stopGateway() {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
      try { await exited; } finally { clearTimeout(timer); }
    }
    t.after(async () => {
      await stopGateway();
      if (model.listening) {
        model.closeAllConnections();
        await close(model);
      }
      await rm(dir, { recursive: true, force: true });
    });
    await listen(model);
    const probe = createTcpServer();
    await listen(probe);
    const port = probe.address().port;
    await close(probe);
    const url = `ws://127.0.0.1:${port}`;
    const gatewayConfig = join(dir, 'openclaw.json');
    const env = {
      PATH: process.env.PATH, HOME: paths.home, TMPDIR: paths.tmp,
      XDG_CACHE_HOME: join(paths.home, '.cache'), XDG_CONFIG_HOME: join(paths.home, '.config'),
      OPENCLAW_STATE_DIR: paths.state, OPENCLAW_CONFIG_PATH: gatewayConfig,
      OPENCLAW_DISABLE_BONJOUR: '1', OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_SKIP_CRON: '1',
      OPENCLAW_SKIP_BUNDLED_DOCTOR: '1', NO_PROXY: '127.0.0.1,localhost',
      HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', NODE_USE_ENV_PROXY: '1',
    };
    const save = async (path, data) => writeFile(path, JSON.stringify(data), { mode: 0o600 });
    await save(gatewayConfig, {
      gateway: { mode: 'local', bind: 'loopback', port, auth: { mode: 'token', token: randomUUID() } },
      channels: {},
      discovery: { mdns: { mode: 'off' } },
      update: { checkOnStart: false },
      agents: { defaults: {
        workspace: paths.workspace, skipBootstrap: true, heartbeat: { every: '0m' },
        model: { primary: 'fixture/local', fallbacks: [] }, memorySearch: { enabled: false },
      } },
      models: { mode: 'replace', catalogRefresh: { enabled: false }, providers: {
        fixture: {
          api: 'openai-completions', apiKey: 'synthetic-only', baseUrl: `http://127.0.0.1:${model.address().port}/v1`,
          models: [{ id: 'local', name: 'Local deterministic fixture', reasoning: false, input: ['text'],
            contextWindow: 65536, maxTokens: 1024 }],
        },
      } },
      plugins: { allow: ['openai'], entries: { openai: { enabled: true } } },
    });
    const binary = join(upstream, 'openclaw.mjs');
    async function run(program, ...args) {
      try {
        const { stdout } = await exec(process.execPath, [program, ...args], { cwd: root, env, timeout: 30000 });
        return JSON.parse(stdout);
      } catch (error) {
        throw new Error(`Local command ${args.slice(0, 3).join(' ')} failed. ${error.stderr ?? error.message}\n` +
          gatewayLog.slice(-3000), { cause: error });
      }
    }
    const rpc = (method, params = {}) => run(binary, 'gateway', 'call', method, '--json', '--timeout', '5000',
      '--expect-url', url, '--params', JSON.stringify(params));
    async function startGateway() {
      child = spawn(process.execPath, [binary, 'gateway', 'run', '--allow-unconfigured'], {
        cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { gatewayLog = (gatewayLog + data).slice(-6000); });
      const deadline = Date.now() + 25000;
      for (;;) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(500) });
          if (response.ok) break;
        } catch {}
        assert.ok(Date.now() < deadline && child.exitCode === null, gatewayLog);
        await delay(100);
      }
    }

    await startGateway();
    assert.deepEqual((await rpc('tasks.list')).tasks, [], 'the disposable profile starts with no native runs');
    const owners = ['agent:main:task-links-primary', 'agent:main:task-links-followup'];
    const tracking = JSON.parse(await readFile(join(root, 'config/task-tracking.example.json'), 'utf8'));
    const [task] = tracking.tasks;
    task.nativeOwnerKeys = owners;
    tracking.stateDir = join(dir, 'tracking');
    tracking.taskLinks = {
      stateDir: join(dir, 'task-links'), acceptanceStore: join(dir, 'acceptance'), gatewayConfig,
      gatewayState: paths.state, gatewayUrl: url,
    };
    const trackingConfig = join(dir, 'tracking.json');
    await save(trackingConfig, tracking);
    const link = (command, ...args) => run(join(root, 'scripts/task-links.mjs'), command,
      '--config', trackingConfig, '--task', task.id, ...args);

    const linked = [];
    let followupOutput;
    for (const [index, marker] of ['PRIMARY', 'FOLLOWUP'].entries()) {
      const owner = owners[index];
      const completed = await run(binary, 'agent', '--session-key', owner, '--message',
        `Read back NATIVE_TASK_LINKS_${marker} through the fixture.`, '--json', '--timeout', '20');
      assert.equal(completed.status, 'ok', JSON.stringify(completed));
      const output = completed.result?.payloads?.find(payload => payload.text === `NATIVE_TASK_LINKS_${marker}_RESULT`);
      assert.ok(output,
        'the agent result came back through the real Gateway');
      const list = await rpc('tasks.list');
      const execution = list.tasks.find(record => record.runId === completed.runId);
      assert.ok(execution, 'the Gateway durably recorded the returned run ID');
      const { task: detail } = await rpc('tasks.get', { taskId: execution.taskId });
      assert.equal(detail.ownerKey, owner);
      assert.equal(detail.sessionKey, owner);
      assert.equal(detail.runId, completed.runId);
      assert.equal(detail.status, 'completed');
      const assoc = await link('link-run', '--native-task', detail.taskId);
      assert.deepEqual(assoc, { nativeTaskId: detail.taskId, nativeRunId: detail.runId });
      linked.push({ ...assoc, statusAtLink: detail.status });
      if (index === 0) {
        const first = child.pid;
        await stopGateway();
        await startGateway();
        assert.notEqual(child.pid, first);
      } else {
        followupOutput = { ...assoc, output: output.text };
      }
    }
    assert.deepEqual(agentInputs, ['PRIMARY', 'FOLLOWUP']);
    assert.equal(new Set(linked.map(row => row.nativeTaskId)).size, 2);
    assert.equal(new Set(linked.map(row => row.nativeRunId)).size, 2);
    assert.equal((await rpc('tasks.list')).tasks.length, 2, 'linking starts no new native run');
    const shown = await link('show');
    assert.equal(shown.taskId, task.id);
    assert.equal(shown.issues.linearIssue, task.linearIssue);
    assert.equal(shown.issues.githubIssue, task.githubIssue);
    assert.deepEqual(shown.runs.map(({ linkedAt, runtime, ...row }) => row), linked);
    const productOutput = join(dir, 'followup-output.json');
    await save(productOutput, followupOutput);
    const plan = join(dir, 'plan.json');
    const results = join(dir, 'results.json');
    await save(plan, {
      objective: 'Read back the native follow-up output through the local Gateway.',
      links: { task: task.id, linear: task.linearIssue, github: `${tracking.github.repository}#${task.githubIssue}` },
      requester: 'task-link-fixture', resourceOwner: 'task-link-fixture',
      reviewerUid: process.geteuid() === 45678 ? 45679 : 45678,
      items: [{ id: 'followup', expected: 'The follow-up returns its synthetic result marker.',
        environment: 'local-loopback-gateway', requiredEvidence: ['product-output'] }],
    });
    await save(results, {
      followup: { verdict: 'pass', observation: 'The native response returned the expected fixture marker.',
        evidence: [{ type: 'product-output', path: productOutput }] },
    });
    const accept = (command, ...args) => run(
      join(root, 'workspace/skills/nori-acceptance/scripts/acceptance.mjs'), command,
      '--store', tracking.taskLinks.acceptanceStore, ...args,
    );
    const { reportId } = await accept('start', '--plan', plan);
    await accept('record', '--report', reportId, '--round', '1', '--results', results);
    await link('link-report', '--report', reportId, '--round', '1', '--native-task', followupOutput.nativeTaskId);
    const [report] = (await link('show')).acceptance;
    assert.equal(report.reportId, reportId);
    assert.equal(report.nativeTaskId, followupOutput.nativeTaskId);
    assert.equal(report.executionStatus, 'passed');
    assert.equal(report.reviewStatus, 'awaiting_review');
    t.diagnostic(JSON.stringify({ fixture: 'loopback-gateway', gatewayRestarted: true, task: task.id,
      pair: shown.issues, nativeRuns: linked, modelRequests: agentInputs.length,
      acceptance: { reportId, round: report.round, nativeTaskId: report.nativeTaskId,
        executionStatus: report.executionStatus, reviewStatus: report.reviewStatus } }));
  });
