import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, lstatSync, existsSync, openSync, closeSync, constants } from 'node:fs';
import { dirname } from 'node:path';

export function createMemberMemory(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Reject symlink databases. The operator must supply a private, non-symlink
  // state directory outside every model-readable workspace.
  if (lstatSync(dirname(path)).isSymbolicLink()) throw new Error('Memory directory cannot be a symlink');
  if ((lstatSync(dirname(path)).mode & 0o077) !== 0) throw new Error('Memory directory must be private (0700)');
  if (!existsSync(path)) closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600));
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('Unsafe memory database');
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
  return {
    generation,
    read(owner) { return db.prepare('SELECT name,value FROM memories WHERE owner=? ORDER BY name').all(ownerKey(owner)); },
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
      assertCurrent();
      if (name === undefined) db.prepare('DELETE FROM memories WHERE owner=?').run(ownerKey(owner));
      else db.prepare('DELETE FROM memories WHERE owner=? AND name=?').run(ownerKey(owner), name);
    },
    reset(owner) {
      db.prepare('INSERT INTO scopes(owner,generation) VALUES(?,1) ON CONFLICT(owner) DO UPDATE SET generation=generation+1').run(ownerKey(owner));
      return generation(owner);
    },
    close() { db.close(); },
  };
}
