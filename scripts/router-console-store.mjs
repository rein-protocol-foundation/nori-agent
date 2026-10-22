import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function regularPath(root, path) {
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('router_path_invalid');
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      const s = await lstat(current);
      if (s.isSymbolicLink() || (!s.isDirectory() && current !== path) ||
          (current === path && (!s.isFile() || s.nlink !== 1))) throw new Error('router_path_invalid');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

export async function readPrivate(root, path, fallback, { publicFile = false } = {}) {
  await regularPath(root, path);
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const s = await file.stat();
    if (!s.isFile() || s.nlink !== 1 || s.size > 4 * 1024 * 1024 ||
        (!publicFile && process.platform !== 'win32' && s.mode & 0o077)) throw new Error('router_file_invalid');
    return await file.readFile('utf8');
  } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
  finally { await file?.close(); }
}

/** Compare before replacing: a concurrent OpenClaw/UI edit is never silently overwritten. */
export async function writePrivate(root, path, value, expected) {
  await regularPath(root, path);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await regularPath(root, path);
  const temp = join(dirname(path), `.router-${randomUUID()}.tmp`);
  let file;
  try {
    file = await open(temp, 'wx', 0o600); await file.writeFile(value); await file.sync(); await file.close(); file = null;
    if (expected !== undefined && await readPrivate(root, path, '', { publicFile: true }) !== expected)
      throw new Error('router_config_changed_retry');
    await rename(temp, path);
  } finally { await file?.close(); await unlink(temp).catch(() => {}); }
}
