// Pinned native internals are used only to manufacture synthetic source state and test admission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordInboundSession } from '../../vendor/openclaw/src/channels/session.ts';
import { prepareCommunityState } from '../../scripts/prepare-community-state.mjs';
import { importSqliteSessionRows } from '../../vendor/openclaw/src/config/sessions/session-accessor.sqlite-import.test-support.ts';
import { closeOpenClawAgentDatabasesForTest, openOpenClawAgentDatabase } from '../../vendor/openclaw/src/state/openclaw-agent-db.ts';
import { resolveOpenClawAgentSqlitePath } from '../../vendor/openclaw/src/state/openclaw-agent-db.paths.ts';
import { listSessionEntries, loadTranscriptEventsSync, getSessionEntry, upsertSessionEntry } from '../../vendor/openclaw/src/plugin-sdk/session-store-runtime.ts';

const root = process.env.OPENCLAW_STATE_DIR!;
assert.ok(root.includes('nori-community-state-migration-'), 'fixture must use isolated synthetic state');
const envFor = (name: string) => ({ ...process.env, OPENCLAW_STATE_DIR: join(root, name) });
const sourceEnv = { ...process.env };
const targetEnv = envFor('target');
const sourceDb = resolveOpenClawAgentSqlitePath({ agentId: 'main', env: sourceEnv });
const targetDb = resolveOpenClawAgentSqlitePath({ agentId: 'nori-community', env: targetEnv });
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const originalEvents = new Map<string, unknown[]>();
for (let index = 0; index < 5; index++) {
  const known = index < 4;
  const id = `synthetic-${index}`;
  const sessionKey = known ? `agent:main:discord:channel:synthetic-room-${index}` : 'agent:main:explicit:unknown-source';
  const events = [
    { type: 'session', version: 3, id },
    { type: 'message', id: `${id}-user`, timestamp: '2026-01-01T00:00:00Z',
      message: { role: 'user', content: `Synthetic request ${index}`, __openclaw: { senderIsOwner: false, actorId: `actor-${index}` } } },
    { type: 'message', id: `${id}-assistant`, timestamp: '2026-01-01T00:00:01Z',
      message: { role: 'assistant', content: 'Synthetic response', usage: { input: 17, output: 9, cacheRead: 3, totalTokens: 26 },
        __openclaw: { runId: `run-${index}` } } },
  ];
  originalEvents.set(id, events);
  let sourceEntry: Record<string, unknown> = { sessionId: id, updatedAt: 1, createdVia: 'run' };
  if (known) {
    await upsertSessionEntry({ agentId: 'main', env: sourceEnv, storePath: sourceDb, sessionKey, entry: { sessionId: id, updatedAt: 1 } });
    const tasks: Promise<unknown>[] = [];
    await recordInboundSession({ storePath: sourceDb, sessionKey,
      ctx: { SessionKey: sessionKey, Provider: 'discord', Surface: 'discord', ChatType: 'channel', AccountId: 'default',
        SenderId: `actor-${index}`, From: `discord:actor-${index}`, To: `channel:synthetic-room-${index}` },
      updateLastRoute: { sessionKey, channel: 'discord', accountId: 'default', to: `channel:synthetic-room-${index}` },
      onRecordError: error => { throw error; }, trackSessionMetaTask: task => tasks.push(task),
    });
    await Promise.all(tasks);
    sourceEntry = getSessionEntry({ agentId: 'main', env: sourceEnv, storePath: sourceDb, sessionKey })!;
  }
  await importSqliteSessionRows({ agentId: 'main', env: sourceEnv, storePath: sourceDb, sessionKey,
    entry: { ...sourceEntry, profileInvolvement: [{ profileId: `actor-${index}`, role: 'participant' }] } as never,
    readTranscriptEvents: append => { for (const event of events) append(event); },
  });
}
closeOpenClawAgentDatabasesForTest();
const sourceHash = digest(readFileSync(sourceDb));
const plan = prepareCommunityState({ sourceDb });
assert.equal(plan.candidates.length, 4, JSON.stringify(plan.retained.map(row => row.sourceEvidence)));
assert.equal(plan.retained.length, 1);
assert.equal(plan.status, 'blocked');
assert.ok(plan.inventory.some(table => table.virtualModule && table.rows === null), 'virtual rows must be explicitly uncounted');
assert.deepEqual(prepareCommunityState({ sourceDb }), plan, 'repeated preflight must not mutate or overwrite state');
const entries = listSessionEntries({ agentId: 'main', env: sourceEnv, storePath: sourceDb, readOnly: true });
assert.equal(entries.length, 5);
for (const { sessionKey, entry } of entries) {
  const exported = loadTranscriptEventsSync({ agentId: 'main', env: sourceEnv, storePath: sourceDb, sessionKey, sessionId: entry.sessionId });
  assert.equal(digest(JSON.stringify(exported)), digest(JSON.stringify(originalEvents.get(entry.sessionId))), 'public raw read changed events');
}
const known = entries.find(row => row.sessionKey.includes('synthetic-room-0'))!;
const targetKey = 'agent:nori-community:discord:channel:synthetic-room-0';
await upsertSessionEntry({ agentId: 'nori-community', env: targetEnv, storePath: targetDb, sessionKey: targetKey, entry: known.entry });
const importedEvents = loadTranscriptEventsSync({ agentId: 'nori-community', env: targetEnv, storePath: targetDb,
  sessionKey: targetKey, sessionId: known.entry.sessionId });
assert.equal(importedEvents.length, 0, 'entry-only API unexpectedly imported raw transcript');
assert.equal(Object.hasOwn(known.entry, 'profileInvolvement'), false, 'public projection unexpectedly retains internal actor association');
closeOpenClawAgentDatabasesForTest();
assert.equal(digest(readFileSync(sourceDb)), sourceHash, 'SDK inspection or destination upsert modified source database');
const copiedDb = join(root, 'wrong-owner.sqlite');
copyFileSync(sourceDb, copiedDb);
assert.throws(() => openOpenClawAgentDatabase({ agentId: 'nori-community', env: targetEnv, path: copiedDb }), /owner|belongs|agent/i,
  'renaming/copying main database must fail native Community owner admission');
closeOpenClawAgentDatabasesForTest();
assert.equal(digest(readFileSync(sourceDb)), sourceHash);
console.log(JSON.stringify({ syntheticOnly: true, sourceWindows: 5, plannedDiscordWindows: plan.candidates.length, retainedUnknownWindows: plan.retained.length, readonlyPlanIdempotent: true, schemaAgentColumns: plan.inventory.filter(table => table.agentColumns.length).map(table => ({ table: table.table, columns: table.agentColumns })), schemaReferenceInventory: plan.inventory.filter(table => table.sessionReferences.length || table.actorReferences.length).map(table => ({ table: table.table, sessionReferences: table.sessionReferences, actorReferences: table.actorReferences, foreignKeys: table.foreignKeys })), publicRawReadPreservesEventsAndUsage: true,
  publicUpsertRawEventCount: importedEvents.length, publicProjectionOmitsInternalActorAssociations: true,
  copiedMainDatabaseRejectedForCommunityOwner: true, sourceFileHashUnchanged: true,
  conclusion: 'Public entry upsert is not a lossless transcript/state importer; no ownership metadata rewrite was attempted.' }, null, 2));
