import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';

// Both paths are operator-owned. The tool accepts only an exported name.
// Install the destination setgid to the dedicated Codex group, mode 2750.
export async function bindDevelopmentCredential(name, { names, sourceFile, bindingDir }) {
  if (!names.includes(name) || !/^NORI_[A-Z0-9_]+$/.test(name)) throw Error('credential_name_unavailable');
  const source = await open(sourceFile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let value;
  try {
    const info = await source.stat();
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) || info.size > 1024 * 1024)
      throw Error('credential_source_permissions_invalid');
    value = parseEnv(await source.readFile('utf8'))[name];
  } finally { await source.close(); }
  if (!value || /[\r\n\0]/.test(value)) throw Error('credential_source_unavailable');

  const dir = await open(bindingDir, constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const tmp = join(bindingDir, '.' + randomUUID());
  let file;
  try {
    const info = await dir.stat();
    if (info.uid !== process.getuid() || (info.mode & 0o7777) !== 0o2750 || info.gid === process.getgid())
      throw Error('credential_binding_permissions_invalid');
    file = await open(tmp, 'wx', 0o600);
    if ((await file.stat()).gid !== info.gid) throw Error('credential_binding_group_invalid');
    await file.writeFile(value);
    await file.chmod(0o640);
    await file.sync();
    await rename(tmp, join(bindingDir, name));
    await dir.sync();
    return { name, status: 'bound' };
  } finally {
    if (file) {
      await file.close();
      await unlink(tmp).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await dir.close();
  }
}
