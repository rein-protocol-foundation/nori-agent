// Prepare public source artifacts only. Never edit a live OpenClaw configuration or existing workspace.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const ASSETS = [
  ['templates/community-agents.md', 'AGENTS.md'],
  ['workspace/SOUL.md', 'SOUL.md'], ['workspace/IDENTITY.md', 'IDENTITY.md'],
  ['workspace/DISCORD_ONBOARDING.md', 'DISCORD_ONBOARDING.md'],
  ['workspace/community-directory.json', 'community-directory.json'],
  ['workspace/secret/origin-story.js', 'secret/origin-story.js'],
  ['workspace/avatars/rein-agent.png', 'avatars/rein-agent.png'],
  ['templates/discord-channel-copy.json', 'references/discord-channel-copy.json'],
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path)); };
function noSymlinks(path) {
  const absolute = resolve(path), { root } = parse(absolute);
  let current = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('community_seed_symlink_disallowed');
  }
}
export function prepareCommunityWorkspace({ destination, sourceRoot = projectRoot }) {
  if (typeof destination !== 'string' || !isAbsolute(destination)) throw new Error('community_seed_absolute_destination_required');
  destination = resolve(destination); sourceRoot = resolve(sourceRoot);
  if (inside(join(sourceRoot, 'workspace'), destination) || inside(destination, sourceRoot)) throw new Error('community_seed_destination_overlaps_source');
  noSymlinks(dirname(destination)); noSymlinks(sourceRoot);
  const files = ASSETS.map(([source, target]) => {
    const path = join(sourceRoot, source); noSymlinks(path);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024) throw new Error('community_seed_asset_invalid');
    const original = readFileSync(path); let bytes = original;
    if (target === 'DISCORD_ONBOARDING.md') bytes = Buffer.from(original.toString('utf8')
      .replaceAll('skills/rein-community-discovery/SKILL.md', '原生技能目录中的 rein-community-discovery 技能')
      .replaceAll('../templates/discord-channel-copy.json', 'references/discord-channel-copy.json')
      .replaceAll('维护方法见 ../docs/discord-onboarding-zh.md。', '目录由授权维护者更新。'));
    return { source, target, original, bytes };
  });
  const sharedSkills = join(sourceRoot, 'workspace/skills'); noSymlinks(sharedSkills);
  if (!lstatSync(sharedSkills).isDirectory()) throw new Error('community_seed_skills_directory_required');
  // Exclusive creation: never overwrite an existing candidate, live workspace or historical data.
  mkdirSync(destination, { mode: 0o700 });
  const workspace = join(destination, 'workspace'); mkdirSync(workspace, { mode: 0o700 });
  for (const file of files) {
    const path = join(workspace, file.target); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, file.bytes, { flag: 'wx', mode: 0o600 });
  }
  const manifest = {
    version: 1, activationReady: false,
    purpose: 'Public Community workspace seed and native setting review; not an OpenClaw config.',
    conversationPolicy: { publicHistory: 'shared-room-or-thread', dmScope: 'per-account-channel-peer', privateMemory: 'owner-and-audience' },
    workspace,
    files: files.map(({ source, target, original, bytes }) => ({ source, target, sourceSha256: hash(original), stagedSha256: hash(bytes) })),
    nativeSettingsToReview: {
      agentId: 'nori-community', name: 'Nori · Community', workspace,
      fs: { workspaceOnly: true }, elevated: { enabled: false },
      sharedSkillsExtraDir: sharedSkills,
      messageCrossContext: { allowWithinProvider: false, allowAcrossProviders: false },
    },
    requiredBeforeActivation: [
      'Use native shared public room/thread history; enforce distinct DM sessions and owner/audience private memory before retrieval and writes.',
      'Preserve automatic private memory; the read-only tool policy used in the feasibility probe is not a production policy.',
      'Finalize and verify Community tools, delegation, media-file reads and message action/destination authority.',
      'Move internal global memory roots into internal agents; an empty Community extraPaths does not subtract global roots.',
      'Preserve existing Slack development bindings, native channel settings and operator capabilities.',
      'Configure distinct backend callers, scoped Magpie preferences/budgets and host-enforced run deadlines.',
      'Verify native skills and new skill references; audit third-party/shared skill trees for private data.',
      'Pass two-account platform acceptance and preserved-history cutover/rollback before enabling a shared Gateway.',
    ],
  };
  writeFileSync(join(destination, 'candidate.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-community-workspace.mjs /absolute/new/candidate-directory');
  const result = prepareCommunityWorkspace({ destination: process.argv[2] });
  console.log(JSON.stringify({ workspace: result.workspace, activationReady: result.activationReady, files: result.files.length }));
}
