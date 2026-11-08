import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, linkSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepareCommunityWorkspace } from '../scripts/prepare-community-workspace.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'nori-community-seed-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, destination: join(directory, 'candidate') };
}

test('stages only reviewed public assets and references one shared skill tree without modifying source', t => {
  const { destination } = fixture(t);
  const before = readFileSync(join(root, 'workspace/SOUL.md'));
  const manifest = prepareCommunityWorkspace({ destination });
  assert.equal(manifest.activationReady, false);
  assert.deepEqual(readdirSync(destination).sort(), ['candidate.json', 'workspace']);
  assert.equal(statSync(destination).mode & 0o777, 0o700);
  assert.equal(statSync(join(destination, 'candidate.json')).mode & 0o777, 0o600);
  const files = manifest.files.map(file => file.target);
  for (const disallowed of ['skills', 'USER.md', 'MEMORY.md', 'memory', 'state', 'openclaw.json']) assert.ok(!files.some(file => file === disallowed || file.startsWith(disallowed + '/')));
  assert.equal(manifest.nativeSettingsToReview.sharedSkillsExtraDir, join(root, 'workspace/skills'));
  assert.deepEqual(readFileSync(join(manifest.workspace, 'SOUL.md')), before);
  assert.deepEqual(readFileSync(join(root, 'workspace/SOUL.md')), before);
  for (const file of manifest.files) {
    assert.equal(file.sourceSha256, digest(readFileSync(join(root, file.source))));
    assert.equal(file.stagedSha256, digest(readFileSync(join(manifest.workspace, file.target))));
    assert.equal(statSync(join(manifest.workspace, file.target)).mode & 0o777, 0o600);
  }
  const onboarding = readFileSync(join(manifest.workspace, 'DISCORD_ONBOARDING.md'), 'utf8');
  assert.ok(!onboarding.includes('../templates/') && !onboarding.includes('../docs/') && !onboarding.includes('skills/rein-community-discovery/'));
  assert.ok(onboarding.includes('references/discord-channel-copy.json'));
  assert.deepEqual(readFileSync(join(manifest.workspace, 'secret/origin-story.js')), readFileSync(join(root, 'workspace/secret/origin-story.js')));
});

test('refuses existing candidates and workspace overlap without changing their data', t => {
  const { destination } = fixture(t); mkdirSync(destination);
  writeFileSync(join(destination, 'existing.txt'), 'preserve-me');
  assert.throws(() => prepareCommunityWorkspace({ destination }), /EEXIST/);
  assert.equal(readFileSync(join(destination, 'existing.txt'), 'utf8'), 'preserve-me');
  assert.throws(() => prepareCommunityWorkspace({ destination: join(root, 'workspace/new-community') }), /overlaps/);
  assert.throws(() => prepareCommunityWorkspace({ destination: root }), /overlaps/);
  assert.throws(() => prepareCommunityWorkspace({ destination: 'relative' }), /absolute/);
});

test('does not follow a symlink destination parent or a replaced public source', t => {
  const { directory, destination } = fixture(t), link = join(directory, 'parent-link');
  symlinkSync(directory, link);
  assert.throws(() => prepareCommunityWorkspace({ destination: join(link, 'candidate') }), /symlink/);
  const sourceRoot = join(directory, 'source'); mkdirSync(join(sourceRoot, 'templates'), { recursive: true });
  writeFileSync(join(directory, 'private.txt'), 'PRIVATE');
  symlinkSync(join(directory, 'private.txt'), join(sourceRoot, 'templates/community-agents.md'));
  assert.throws(() => prepareCommunityWorkspace({ destination, sourceRoot }), /symlink/);
  assert.ok(!readdirSync(directory).includes('candidate'));
  rmSync(join(sourceRoot, 'templates/community-agents.md'));
  linkSync(join(directory, 'private.txt'), join(sourceRoot, 'templates/community-agents.md'));
  assert.throws(() => prepareCommunityWorkspace({ destination, sourceRoot }), /asset_invalid/);
});

test('ignores personal and runtime files beside the public source assets', t => {
  const { directory } = fixture(t);
  const baseline = prepareCommunityWorkspace({ destination: join(directory, 'baseline') });
  const sourceRoot = join(directory, 'source');
  for (const file of baseline.files) {
    const path = join(sourceRoot, file.source);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, readFileSync(join(root, file.source)));
  }
  mkdirSync(join(sourceRoot, 'workspace/skills'), { recursive: true });
  for (const path of ['workspace/USER.md', 'workspace/MEMORY.md', 'workspace/memory/today.md', 'workspace/state/session.json', 'runtime/credentials.env']) {
    const target = join(sourceRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'PRIVATE_SOURCE_CANARY');
  }
  const staged = prepareCommunityWorkspace({ destination: join(directory, 'staged'), sourceRoot });
  const inspect = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) inspect(child);
      else assert.ok(!readFileSync(child).includes('PRIVATE_SOURCE_CANARY'));
    }
  };
  inspect(staged.workspace);
  assert.deepEqual(staged.files.map(file => file.target), baseline.files.map(file => file.target));
});
