import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSource } from '../scripts/ci-openclaw-source.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nori-source-cache-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'root');
  const repository = join(dir, 'upstream');
  for (const cwd of [root, repository]) {
    mkdirSync(cwd);
    git(cwd, 'init', '-q');
    git(cwd, 'config', 'user.name', 'Synthetic CI');
    git(cwd, 'config', 'user.email', 'ci@example.invalid');
  }
  writeFileSync(join(repository, 'file.txt'), 'pinned fixture\n');
  writeFileSync(join(repository, '.gitignore'), 'node_modules/\n');
  git(repository, 'add', '.'); git(repository, 'commit', '-qm', 'pin');
  const pin = git(repository, 'rev-parse', 'HEAD');
  writeFileSync(join(repository, 'file.txt'), 'newer upstream tip\n');
  git(repository, 'commit', '-qam', 'later');
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${pin},vendor/openclaw`);
  git(root, 'commit', '-qm', 'gitlink');
  return { root, repository, pin, source: join(root, 'vendor/openclaw') };
}

test('cold fetch selects the exact pin, and a pristine warm checkout needs no remote', t => {
  const f = fixture(t);
  assert.equal(prepareSource(f), f.pin);
  assert.equal(git(f.source, 'rev-parse', '--is-shallow-repository'), 'true');
  assert.equal(git(f.source, 'status', '--porcelain'), '');
  renameSync(f.repository, `${f.repository}-offline`);
  assert.equal(prepareSource(f), f.pin);
});

test('source reuse rejects tracked, untracked and ignored installation residue', t => {
  const f = fixture(t);
  prepareSource(f);
  writeFileSync(join(f.source, 'file.txt'), 'dirty');
  assert.throws(() => prepareSource(f), /not pristine/);
  git(f.source, 'checkout', '--', 'file.txt');
  writeFileSync(join(f.source, 'unexpected.txt'), 'dirty');
  assert.throws(() => prepareSource(f), /not pristine/);
  rmSync(join(f.source, 'unexpected.txt'));
  mkdirSync(join(f.source, 'node_modules'));
  writeFileSync(join(f.source, 'node_modules/package.json'), '{}');
  assert.throws(() => prepareSource(f), /not pristine/);
});

test('wrong revisions and occupied directories fail without overwriting data', t => {
  const f = fixture(t);
  mkdirSync(f.source, { recursive: true });
  writeFileSync(join(f.source, 'keep.txt'), 'keep');
  assert.throws(() => prepareSource(f), /Refusing to overwrite/);
  rmSync(join(f.source, 'keep.txt'));
  prepareSource(f);
  const tip = git(f.repository, 'rev-parse', 'HEAD');
  git(f.root, 'update-index', '--cacheinfo', `160000,${tip},vendor/openclaw`);
  git(f.root, 'commit', '-qm', 'new pin');
  assert.throws(() => prepareSource(f), /does not match the pin/);
  assert.equal(git(f.source, 'rev-parse', 'HEAD'), f.pin);
});
