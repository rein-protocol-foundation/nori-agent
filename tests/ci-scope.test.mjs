import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyChanges, changedPaths, requiredChecksPass } from '../scripts/ci-scope.mjs';

const none = { plugins: false, routing: false, isolation: false };
const plugins = { plugins: true, routing: false, isolation: false };
const all = { plugins: true, routing: true, isolation: true };

test('ordinary Nori tools and reply guards avoid unrelated native integrations', () => {
  for (const path of [
    'plugins/rein-operations/index.ts', 'plugins/rein-operations/openclaw.plugin.json',
    'plugins/rein-operations/community-tools.ts', 'plugins/rein-operations/vote-reply-guard.ts',
    'tests/plugin.test.mjs', 'tests/vote-reply-guard.test.mjs', 'scripts/verify-plugin.mjs',
    'workspace/skills/rein-community-discovery/SKILL.md',
  ]) {
    assert.deepEqual(classifyChanges([path]), path.endsWith('.md') ? none : plugins, path);
  }
});

test('routing changes select routing; channel contracts select both native suites', () => {
  assert.deepEqual(classifyChanges(['plugins/rein-router/runtime.mjs']), { ...plugins, routing: true });
  assert.deepEqual(classifyChanges(['plugins/rein-router/magpie.lock.json']), { ...plugins, routing: true });
  for (const path of ['plugins/rein-discord/index.ts', 'plugins/rein-slack/gateway.mjs', 'plugins/rein-isolation/scope.mjs']) {
    assert.deepEqual(classifyChanges([path]), all, path);
  }
});

test('upstream, CI, dependencies, native fixtures and unknown code fail safe to full coverage', () => {
  for (const path of [
    'vendor/openclaw', '.gitmodules', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'scripts/runtime-env.mjs', 'scripts/ci-scope.mjs', '.github/workflows/openclaw.yml',
    '.github/actions/setup-openclaw/action.yml', 'tests/fixtures/slack-isolation-gateway.ts',
    'tests/magpie-ui-native.test.mjs', 'plugins/future-plugin/index.ts', 'new-runtime/file.mjs',
    'config/subscription-router.example.json',
  ]) assert.deepEqual(classifyChanges([path]), all, path);
  assert.deepEqual(classifyChanges([], { full: true }), all);
});

test('documentation avoids runtime setup and combined changes retain all selected coverage', () => {
  assert.deepEqual(classifyChanges(['README.md', 'docs/setup.md', 'assets/brand/logo.png']), none);
  assert.deepEqual(classifyChanges(['docs/setup.md', 'plugins/rein-operations/community-tools.ts']), plugins);
  assert.deepEqual(classifyChanges(['plugins/rein-operations/community-tools.ts', 'vendor/openclaw']), all);
  assert.deepEqual(classifyChanges(['scripts/agent-browser.mjs', '.github/workflows/browser.yml']), plugins);
});

test('required gate rejects failed, cancelled or unexpectedly skipped selected checks', () => {
  const results = { changes: 'success', plugins: 'success', routing: 'skipped', isolation: 'skipped' };
  assert.equal(requiredChecksPass(plugins, results), true);
  assert.equal(requiredChecksPass(none, { ...results, plugins: 'skipped' }), true);
  for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
    assert.equal(requiredChecksPass(plugins, { ...results, plugins: result }), false);
    assert.equal(requiredChecksPass(plugins, { ...results, changes: result }), false);
  }
  assert.equal(requiredChecksPass(all, results), false);
  assert.equal(requiredChecksPass(all, { changes: 'success', plugins: 'success', routing: 'success', isolation: 'success' }), true);
});

test('git diff includes deletions, both sides of renames, and uses the PR merge base', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'rein-ci-scope-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'ci@example.invalid');
  git('config', 'user.name', 'CI fixture');
  mkdirSync(join(cwd, 'plugins/rein-router'), { recursive: true });
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, 'plugins/rein-router/runtime.mjs'), 'synthetic fixture\n');
  git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  git('mv', 'plugins/rein-router/runtime.mjs', 'docs/moved.md');
  git('commit', '-qm', 'rename');
  const head = git('rev-parse', 'HEAD');
  assert.deepEqual(changedPaths(base, head, { cwd }).sort(), ['docs/moved.md', 'plugins/rein-router/runtime.mjs']);
  assert.equal(classifyChanges(changedPaths(base, head, { cwd })).routing, true);
  git('checkout', '-q', '--detach', base);
  writeFileSync(join(cwd, 'base-only.mjs'), 'synthetic base advance\n');
  git('add', '.'); git('commit', '-qm', 'base advanced');
  const advancedBase = git('rev-parse', 'HEAD');
  assert.deepEqual(changedPaths(advancedBase, head, { cwd, pullRequest: true }).sort(), ['docs/moved.md', 'plugins/rein-router/runtime.mjs']);
  assert.throws(() => changedPaths('0'.repeat(40), head, { cwd }), /Missing base/);
});
