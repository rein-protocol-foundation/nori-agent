import { DatabaseSync } from 'node:sqlite';

// This database belongs only to continuation summaries, never native Task/Flow state.
export function createSqliteWorkerBackend(_input, { databasePath }) {
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS summaries (
      scope TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
      payload TEXT, deleted_at INTEGER, PRIMARY KEY(scope, id)
    )`);
  return {
    execute({ type, input }) {
      const { scope, id } = input;
      if (type === 'put') {
        db.prepare(`INSERT INTO summaries VALUES (?, ?, ?, ?, NULL)
          ON CONFLICT(scope,id) DO UPDATE SET revision=excluded.revision, payload=excluded.payload
          WHERE summaries.deleted_at IS NULL AND excluded.revision >= summaries.revision`)
          .run(scope, id, input.revision, JSON.stringify(input.summary));
        return db.prepare('SELECT deleted_at FROM summaries WHERE scope=? AND id=?').get(scope, id).deleted_at == null ? 'retained' : 'deleted';
      }
      if (type === 'read') {
        const row = db.prepare('SELECT payload FROM summaries WHERE scope=? AND id=? AND deleted_at IS NULL').get(scope, id);
        return row ? JSON.parse(row.payload) : null;
      }
      if (type === 'list') return db.prepare('SELECT id,payload FROM summaries WHERE scope=? AND deleted_at IS NULL AND id>? ORDER BY id LIMIT ?')
        .all(scope, input.after, input.limit).map(row => ({ id: row.id, summary: JSON.parse(row.payload) }));
      if (type === 'delete') {
        // Keep only opaque scope/id and a tombstone. Even an in-flight stale put
        // or later native status/restart must never reconstruct this payload.
        db.prepare(`INSERT INTO summaries VALUES (?, ?, 0, NULL, ?)
          ON CONFLICT(scope,id) DO UPDATE SET payload=NULL, revision=0, deleted_at=COALESCE(summaries.deleted_at,excluded.deleted_at)`)
          .run(scope, id, input.at);
        return { deleted: true };
      }
      throw Error('rein_summary_operation_invalid');
    },
    close() { db.close(); },
  };
}
