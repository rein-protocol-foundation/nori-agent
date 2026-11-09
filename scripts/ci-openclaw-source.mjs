import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Cache a standalone, credential-free checkout before any installation/build writes.
// Do not cache the parent checkout's .git/modules or its authentication configuration.
export function prepareSource({ root = process.cwd(), repository = 'https://github.com/openclaw/openclaw.git' } = {}) {
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const entry = git(root, ['ls-tree', 'HEAD', '--', 'vendor/openclaw']);
  const match = /^160000 commit ([a-f0-9]{40,64})\tvendor\/openclaw$/.exec(entry);
  if (!match) throw new Error('Expected a pinned OpenClaw gitlink');
  const revision = match[1];
  const source = join(root, 'vendor/openclaw');
  mkdirSync(source, { recursive: true });
  if (!existsSync(join(source, '.git'))) {
    if (readdirSync(source).length) throw new Error('Refusing to overwrite an unrecognized source directory');
    git(source, ['init', '-q']);
    git(source, ['remote', 'add', 'origin', repository]);
    // Fetch the pin directly; submodule update can first fetch a large default-branch tip.
    git(source, ['fetch', '--depth=1', '--no-tags', 'origin', revision]);
    git(source, ['checkout', '--detach', 'FETCH_HEAD']);
    git(source, ['submodule', 'update', '--init', '--recursive', '--depth=1']);
  }
  if (git(source, ['rev-parse', 'HEAD']) !== revision) throw new Error('Cached OpenClaw revision does not match the pin');
  if (git(source, ['status', '--porcelain', '--untracked-files=all', '--ignored'])) {
    throw new Error('OpenClaw source cache is not pristine');
  }
  if (git(source, ['submodule', 'status', '--recursive']).split('\n').some(line => /^[+-U]/.test(line))) {
    throw new Error('OpenClaw nested submodule revision mismatch');
  }
  return revision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Verified pristine OpenClaw source: ${prepareSource()}`);
}
