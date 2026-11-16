// Read-only, pinned-schema preflight. This file deliberately has no apply/import operation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const quote = value => `"${value.replaceAll('"', '""')}"`;
const sha = data => createHash('sha256').update(data).digest('hex');

export function prepareCommunityState({ sourceDb, accountId = 'default' }) {
  sourceDb = resolve(sourceDb);
  assert.ok(statSync(sourceDb).isFile(), 'source must be an existing checkpointed database file');
  for (const suffix of ['-wal', '-journal']) {
    assert.ok(!existsSync(sourceDb + suffix) || statSync(sourceDb + suffix).size === 0,
      'Use a stopped-service, checkpointed offline snapshot; preflight does not checkpoint or modify the source.');
  }
  const before = sha(readFileSync(sourceDb));
  const expectedVersion = JSON.parse(readFileSync(new URL('../vendor/openclaw/package.json', import.meta.url), 'utf8')).openclaw.schemaVersions.agent;
  const db = new DatabaseSync(sourceDb, { readOnly: true });
  try {
    const meta = db.prepare("SELECT role, schema_version, agent_id FROM schema_meta WHERE meta_key='primary'").get();
    assert.equal(meta?.role, 'agent', 'source is not an agent database');
    assert.equal(meta?.agent_id, 'main', 'source owner must be the original Discord main');
    assert.equal(meta?.schema_version, expectedVersion, 'source metadata version differs from pinned runtime');
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, expectedVersion, 'source persistence version differs from pinned runtime');
    assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok']);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], 'source contains broken foreign keys');
    const inventory = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name, sql }) => {
      const virtualModule = /\bCREATE\s+VIRTUAL\s+TABLE\b/i.test(sql ?? '') ? /\bUSING\s+(\w+)/i.exec(sql)?.[1] ?? 'unknown' : undefined;
      if (virtualModule) return { table: name, rows: null, rowCountStatus: /vec|vss/i.test(virtualModule) ? 'requires-extension' : 'not-counted-virtual', virtualModule, agentColumns: [], sessionReferences: [], actorReferences: [], encodedPayloadColumns: [], foreignKeys: [] };
      const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(row => row.name);
      return { table: name, rows: db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n,
        agentColumns: columns.filter(column => /(^|_)agent_id$/.test(column)),
        sessionReferences: columns.filter(column => /session_(key|id)$/.test(column) || ['spawned_by', 'current_window_id', 'parent_id'].includes(column)),
        actorReferences: columns.filter(column => /actor|profile|identity/.test(column)),
        encodedPayloadColumns: columns.filter(column => /json|blob|zstd|payload/.test(column)),
        foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().map(row => ({ table: row.table, from: row.from, to: row.to, onDelete: row.on_delete })),
      };
    });
    const windows = db.prepare('SELECT session_id, session_key, channel, account_id, chat_type, session_entry_provenance FROM session_windows ORDER BY session_id').all();
    const candidates = [], retained = [];
    for (const window of windows) {
      const proved = window.session_entry_provenance === 1 && window.channel === 'discord' && window.account_id === accountId
        && ['channel', 'direct', 'group'].includes(window.chat_type) && window.session_key.startsWith('agent:main:discord:');
      const storage = db.prepare('SELECT seq, event_json, hex(event_zstd) AS event_zstd_hex, event_utf8_bytes, navigation_json, created_at FROM transcript_events WHERE session_id=? ORDER BY seq').all(window.session_id);
      const item = { sessionId: window.session_id, sourceKey: window.session_key, eventCount: storage.length,
        rawEventStorageHash: sha(JSON.stringify(storage)), sourceEvidence: { channel: window.channel, accountId: window.account_id, chatType: window.chat_type, provenanceRecorded: window.session_entry_provenance === 1 } };
      if (proved) candidates.push({ ...item, targetKey: `agent:nori-community:${window.session_key.slice('agent:main:'.length)}` });
      else retained.push({ ...item, reason: 'Missing or conflicting persisted Discord channel/account/chat/canonical-key proof; keep original ownership.' });
    }
    const sourceHashUnchanged = before === sha(readFileSync(sourceDb));
    assert.equal(sourceHashUnchanged, true, 'source changed during preflight');
    return { status: 'blocked', writesSource: false, createsOrOverwritesTarget: false,
      sourceOwner: meta.agent_id, sourceSchemaVersion: expectedVersion, sourceHash: before, sourceHashUnchanged,
      candidates, retained, archivedGenerations: db.prepare('SELECT count(*) AS n FROM session_transcript_archives').get().n,
      inventory: inventory.filter(table => table.rows === null || table.rows > 0 || table.agentColumns.length || table.sessionReferences.length || table.actorReferences.length),
      blockers: ['No supported lossless OpenClaw-to-OpenClaw session/window/archive importer or cross-agent transfer API was found.',
        'An explicit offline converter still needs reviewed dependency closure, canonical-key/JSON field mapping, global actor/profile collision handling, native target admission and byte/hash verification.'],
      completion: 'Preflight only. Retaining source preserves recovery, but does not complete migration or preserve historical access in the target.' };
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 2 || args.length === 4, 'Usage: node scripts/prepare-community-state.mjs --source-db <offline.sqlite> [--account-id default]');
  assert.equal(args[0], '--source-db');
  if (args.length === 4) assert.equal(args[2], '--account-id');
  console.log(JSON.stringify(prepareCommunityState({ sourceDb: args[1], accountId: args[3] }), null, 2));
}
