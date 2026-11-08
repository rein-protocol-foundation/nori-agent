// Hermetic native filesystem/skill feasibility probe; no bot login, credentials or live history.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, upstream } from './runtime-env.mjs';
import { prepareCommunityWorkspace } from './prepare-community-workspace.mjs';
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'nori-community-workspace-')));
const candidate = prepareCommunityWorkspace({ destination: join(temp, 'candidate') });
const workspace = candidate.workspace, internal = join(temp, 'internal');
const shared = join(temp, 'shared-skills'), skill = join(shared, 'new-general-skill');
const home = join(temp, 'home'), state = join(temp, 'state');
for (const path of [internal, join(skill, 'references'), home, state]) mkdirSync(path, { recursive: true });
assert.equal(readFileSync(join(workspace, 'SOUL.md'), 'utf8'), readFileSync(join(root, 'workspace/SOUL.md'), 'utf8'));
assert.equal(candidate.activationReady, false);
writeFileSync(join(workspace, 'public.md'), 'COMMUNITY_PUBLIC_REFERENCE');
writeFileSync(join(internal, 'private.md'), 'INTERNAL_PRIVATE_CANARY');
writeFileSync(join(skill, 'SKILL.md'), '---\nname: new-general-skill\ndescription: Synthetic general skill with a public reference.\n---\nRead references/public.md.\n');
writeFileSync(join(skill, 'references/public.md'), 'SHARED_SKILL_REFERENCE');
symlinkSync(join(internal, 'private.md'), join(skill, 'references/escape.md'));
const cases = {
  CASE_PUBLIC: { path: join(workspace, 'public.md'), expected: 'COMMUNITY_PUBLIC_REFERENCE' },
  CASE_SHARED_SKILL: { path: join(skill, 'references/public.md'), expected: 'SHARED_SKILL_REFERENCE' },
  CASE_EXISTING_SKILL: { path: join(root, 'workspace/skills/rein-community-discovery/SKILL.md'), expected: '# Find organization resources and activities' },
  CASE_PRIVATE: { path: join(internal, 'private.md'), denied: true },
  CASE_SKILL_ESCAPE: { path: join(skill, 'references/escape.md'), denied: true },
  CASE_MAIN: { path: join(internal, 'private.md'), expected: 'INTERNAL_PRIVATE_CANARY', agentId: 'main' },
};
const requests = new Map(); let serverFailure;
const server = createServer(async (req, res) => {
  try {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    const name = JSON.stringify(body.messages).match(/CASE_[A-Z_]+/)?.[0];
    assert.ok(cases[name], 'unknown synthetic request');
    const list = requests.get(name) ?? []; list.push(body); requests.set(name, list);
    const tool = list.length === 1;
    assert.ok(list.length <= 2, 'unexpected model retry/loop');
    const event = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0,
      delta: tool ? { role: 'assistant', tool_calls: [{ index: 0, id: 'call_read', type: 'function', function: {
        name: 'read', arguments: JSON.stringify({ path: cases[name].path }) } }] } : { role: 'assistant', content: 'PROBE_DONE' }, finish_reason: null }] };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.write(`data: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  } catch (error) { serverFailure = error; res.writeHead(500); res.end('Synthetic fixture failed'); }
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const configPath = join(temp, 'openclaw.json');
  writeFileSync(configPath, JSON.stringify({
    agents: { defaults: { workspace: internal, skipBootstrap: true, model: { primary: 'fixture/fixture', fallbacks: [] },
      timeoutSeconds: 45, compaction: { memoryFlush: { enabled: false } } }, entries: {
      main: { default: true, tools: { allow: ['read', 'exec'], fs: { workspaceOnly: false } } },
      'nori-community': { workspace, tools: { allow: ['read'], fs: { workspaceOnly: true }, elevated: { enabled: false } } },
    } },
    plugins: { allow: ['openai'], entries: { openai: { enabled: true } } },
    skills: { allowBundled: [], load: { extraDirs: [join(root, 'workspace/skills'), shared] } },
    tools: { toolSearch: false, codeMode: false },
    memory: { search: { enabled: false, rememberAcrossConversations: false } },
    models: { mode: 'replace', providers: { fixture: { api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      apiKey: 'synthetic-key', models: [{ id: 'fixture', name: 'Synthetic fixture', reasoning: false, input: ['text'],
        contextWindow: 32768, maxTokens: 512, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } },
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|LANG|LC_[A-Z_]+|TZ|TERM)$/.test(key)));
  Object.assign(env, { HOME: home, USERPROFILE: home, OPENCLAW_HOME: home, OPENCLAW_STATE_DIR: state,
    OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_NO_RESPAWN: '1', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BUNDLED_DOCTOR: '1', NO_COLOR: '1' });
  for (const [name, scenario] of Object.entries(cases)) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(upstream, 'openclaw.mjs'), 'agent', '--local', '--agent', scenario.agentId ?? 'nori-community',
        '--session-id', name.toLowerCase(), '--message', name, '--thinking', 'off', '--json'], { cwd: temp, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 90000);
      child.on('error', error => { clearTimeout(timeout); reject(error); }); child.on('exit', code => { clearTimeout(timeout); resolve({ code, output }); });
    });
    assert.ifError(serverFailure);
    assert.equal(result.code, 0, result.output.slice(-8000));
    const list = requests.get(name);
    assert.equal(list?.length, 2, JSON.stringify({ name, requests: list, output: result.output.slice(-6000) }));
    const toolNames = list[0].tools?.map(tool => tool.function.name) ?? [];
    assert.ok(toolNames.includes('read'));
    if (!scenario.agentId) for (const denied of ['exec', 'write', 'edit', 'apply_patch', 'sessions_spawn', 'sessions_list', 'agents_list']) assert.ok(!toolNames.includes(denied), `${name} unexpectedly exposes ${denied}`);
    else assert.ok(toolNames.includes('exec'), 'internal agent lost its configured capability');
    const resultText = JSON.stringify(list[1].messages.filter(message => message.role === 'tool'));
    if (scenario.expected) assert.ok(resultText.includes(scenario.expected), JSON.stringify({ name, resultText }));
    if (scenario.denied) {
      assert.ok(!resultText.includes('INTERNAL_PRIVATE_CANARY'), JSON.stringify({ name, resultText }));
      assert.match(resultText, /escapes|outside|denied|not allowed|symbolic|symlink/i);
    }
    console.log(`PASS ${name}: actual native CLI tools and external skill references.`);
  }
  assert.equal(readFileSync(join(internal, 'private.md'), 'utf8'), 'INTERNAL_PRIVATE_CANARY');
  console.log('PASS: native per-agent filesystem/tools plus shared skill discovery. No history/memory or live platform isolation claim.');
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
