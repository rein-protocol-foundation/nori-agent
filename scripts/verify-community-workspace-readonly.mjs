// Run as the Gateway service identity before enabling Community. No writes or model calls.
import { accessSync, constants, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyCommunityWorkspaceReadOnly(workspace) {
  if (!isAbsolute(workspace ?? '') || process.getuid?.() === 0)
    throw new Error('community_workspace_check_requires_service_identity');
  workspace = resolve(workspace);
  if (realpathSync(workspace) !== workspace) throw new Error('community_workspace_symlink');
  const writable = path => { try { accessSync(path, constants.W_OK); return true; }
    catch (error) { if (error.code === 'EACCES' || error.code === 'EROFS') return false; throw error; } };
  let files = 0;
  const inspect = path => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) ||
        (stat.isFile() && stat.nlink !== 1)) throw new Error('community_workspace_special_file');
    if (stat.uid === process.getuid?.() || writable(path)) throw new Error('community_workspace_mutable');
    accessSync(path, constants.R_OK | (stat.isDirectory() ? constants.X_OK : 0));
    if (stat.isDirectory()) for (const name of readdirSync(path)) inspect(join(path, name));
    else files++;
  };
  inspect(workspace);
  // Prevent replacing an immutable subtree through a service-writable parent.
  for (let path = dirname(workspace); ; path = dirname(path)) {
    if (lstatSync(path).uid === process.getuid?.() || writable(path))
      throw new Error('community_workspace_replaceable_parent');
    if (dirname(path) === path) break;
  }
  return { readOnly: true, checkedAsServiceUid: process.getuid?.(), files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-community-workspace-readonly.mjs /absolute/workspace');
  console.log(JSON.stringify(verifyCommunityWorkspaceReadOnly(process.argv[2])));
}
