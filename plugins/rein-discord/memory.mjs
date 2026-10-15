import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, lstatSync, existsSync, openSync, closeSync, constants } from 'node:fs';
import { dirname } from 'node:path';

export const MEMORY_READ_PAGE_SIZE = 5;
// Reserve room for the tool's audience envelope below a 16 KiB JSON result.
export const MEMORY_READ_MAX_BYTES = 16000;

export function createMemberMemory(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Reject symlink and hard-linked databases before chmod or opening SQLite.
  // The operator supplies a private, non-symlink state directory outside every
  // model-readable workspace.
  if (lstatSync(dirname(path)).isSymbolicLink()) throw new Error('Memory directory cannot be a symlink');
  if ((lstatSync(dirname(path)).mode & 0o077) !== 0) throw new Error('Memory directory must be private (0700)');
  if (!existsSync(path)) closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600));
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.nlink !== 1) throw new Error('Unsafe memory database: require a single-link regular file');
  chmodSync(path, 0o600);
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS scopes(owner TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS memories(owner TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY(owner,name));`);
  const ownerKey = owner => {
    if (!owner || !/^[a-f0-9]{64}$/.test(owner.key)) throw new Error('Trusted owner required');
    return owner.key;
  };
  const validName = name => {
    if (typeof name !== 'string' || !/^[\p{L}\p{N}_ .-]{1,80}$/u.test(name)) throw new Error('Invalid memory name');
    return name;
  };
  const generation = owner => db.prepare('SELECT generation FROM scopes WHERE owner=?').get(ownerKey(owner))?.generation ?? 0;
  const advanceGeneration = key => db.prepare('INSERT INTO scopes(owner,generation) VALUES(?,1) ON CONFLICT(owner) DO UPDATE SET generation=generation+1').run(key);
  return {
    generation,
    read(owner, { name, after } = {}) {
      if (name !== undefined) validName(name);
      if (after !== undefined) validName(after);
      if (name !== undefined && after !== undefined) throw new Error('Use a note name or a page cursor, not both');
      const key = ownerKey(owner);
      const rows = name !== undefined
        ? db.prepare('SELECT name,value FROM memories WHERE owner=? AND name=? LIMIT 1').all(key, name)
        : db.prepare('SELECT name,value FROM memories WHERE owner=? AND name>? ORDER BY name LIMIT ?')
          .all(key, after ?? '', MEMORY_READ_PAGE_SIZE + 1);
      const notes = [];
      for (const note of rows.slice(0, MEMORY_READ_PAGE_SIZE)) {
        const candidate = { notes: [...notes, note], nextCursor: notes.length + 1 < rows.length ? note.name : null };
        if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MEMORY_READ_MAX_BYTES) {
          if (!notes.length) throw new Error('Stored note exceeds the memory read budget');
          break;
        }
        notes.push(note);
      }
      return { notes, nextCursor: notes.length < rows.length ? notes.at(-1).name : null };
    },
    remember(owner, name, value, assertCurrent) {
      validName(name);
      if (typeof value !== 'string' || value.length < 1 || value.length > 2000) throw new Error('Memory value must contain 1–2000 characters');
      if (typeof assertCurrent !== 'function') throw new Error('Current invocation required');
      assertCurrent();
      const key = ownerKey(owner);
      const count = db.prepare('SELECT count(*) AS n FROM memories WHERE owner=?').get(key).n;
      const exists = db.prepare('SELECT 1 FROM memories WHERE owner=? AND name=?').get(key, name);
      if (!exists && count >= 50) throw new Error('Memory limit reached; remove an existing note first');
      db.prepare('INSERT INTO memories(owner,name,value) VALUES(?,?,?) ON CONFLICT(owner,name) DO UPDATE SET value=excluded.value').run(key, name, value);
    },
    forget(owner, name, assertCurrent) {
      if (typeof assertCurrent !== 'function') throw new Error('Current invocation required');
      if (name !== undefined) validName(name);
      const key = ownerKey(owner);
      // A delete must never commit without its clean-session generation.
      // IMMEDIATE also prevents another writer changing the scope after the
      // live invocation/generation guard and before these synchronous effects.
      db.exec('BEGIN IMMEDIATE');
      try {
        assertCurrent();
        if (name === undefined) db.prepare('DELETE FROM memories WHERE owner=?').run(key);
        else db.prepare('DELETE FROM memories WHERE owner=? AND name=?').run(key, name);
        advanceGeneration(key);
        db.exec('COMMIT');
      } catch (error) {
        // SQLite may already have rolled back on an I/O error. Preserve the
        // original failure in that case; neither caller may report success.
        try { db.exec('ROLLBACK'); } catch { /* Transaction already ended. */ }
        throw error;
      }
    },
    reset(owner) {
      advanceGeneration(ownerKey(owner));
      return generation(owner);
    },
    close() { db.close(); },
  };
}
