import { mkdir, open, readFile, rename, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const taskIdValid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

/** Cross-process exclusive locks never infer that an orphan is safe to remove. */
export function createPartnershipStore(stateDir) {
  const ensure = () => mkdir(stateDir, { recursive: true, mode: 0o700 });
  const location = id => {
    if (!taskIdValid(id)) throw Error('partnership_task_invalid');
    return path.join(stateDir, `${id}.json`);
  };
  return {
    async read(id) {
      try { return JSON.parse(await readFile(location(id), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw Error('partnership_record_unreadable'); }
    },
    async write(record) {
      await ensure();
      const target = location(record.taskId), temporary = `${target}.${randomUUID()}.tmp`;
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); }
      finally { await handle.close(); }
      try {
        await rename(temporary, target);
        const directory = await open(stateDir, 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      } finally { await unlink(temporary).catch(() => {}); }
    },
    async locked(id, operation) {
      await ensure();
      const lock = `${location(id)}.lock`;
      try { await mkdir(lock, { mode: 0o700 }); }
      catch (error) { if (error.code === 'EEXIST') throw Error('partnership_locked: concurrent or interrupted operation; inspect durable evidence before operator resolution'); throw error; }
      try { return await operation(); }
      finally { await rmdir(lock); }
    },
  };
}
