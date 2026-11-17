import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { prepareCommunityState } from '../scripts/prepare-community-state.mjs';

test('native SDK feasibility: raw reads preserve source, entry upsert cannot migrate transcript', { timeout: 180000 }, () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temp = mkdtempSync(join(tmpdir(), 'nori-community-state-migration-'));
  try {
    const config = join(temp, 'openclaw.json');
    writeFileSync(config, '{}');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|LANG|LC_[A-Z_]+|TZ)$/.test(key)));
    Object.assign(env, { HOME: temp, USERPROFILE: temp, OPENCLAW_STATE_DIR: temp, OPENCLAW_CONFIG_PATH: config,
      TSX_TSCONFIG_PATH: join(realpathSync(join(root, 'vendor/openclaw/node_modules')), '..', 'tsconfig.json') });
    const result = spawnSync(process.execPath, ['--import', join(root, 'vendor/openclaw/scripts/tsx.mjs'),
      join(root, 'tests/fixtures/community-state-migration.ts')], { cwd: temp, env, encoding: 'utf8', timeout: 170000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message || 'synthetic SDK migration feasibility failed');
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.publicUpsertRawEventCount, 0);
    assert.equal(report.plannedDiscordWindows, 4);
    assert.equal(report.retainedUnknownWindows, 1);
    assert.equal(report.readonlyPlanIdempotent, true);
    console.log(JSON.stringify({ schemaAgentColumns: report.schemaAgentColumns, sessionReferenceTables: report.schemaReferenceInventory.map(table => table.table) }));
    assert.equal(report.sourceFileHashUnchanged, true);
    assert.equal(report.copiedMainDatabaseRejectedForCommunityOwner, true);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});


test('read-only preflight reports vec0 counts as requiring extension without loading it', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const requireRuntime = createRequire(join(root, 'vendor/openclaw/package.json'));
  const vec = requireRuntime('sqlite-vec');
  const temp = mkdtempSync(join(tmpdir(), 'nori-community-state-migration-vec-'));
  const sourceDb = join(temp, 'source.sqlite');
  try {
    const db = new DatabaseSync(sourceDb, { allowExtension: true });
    try {
      db.exec(readFileSync(join(root, 'vendor/openclaw/src/state/openclaw-agent-schema.sql'), 'utf8'));
      db.exec("INSERT INTO schema_meta(meta_key,role,schema_version,agent_id,created_at,updated_at) VALUES ('primary','agent',23,'main',1,1); PRAGMA user_version=23");
      vec.load(db);
      db.exec('CREATE VIRTUAL TABLE fixture_vectors USING vec0(embedding float[2])');
    } finally { db.close(); }
    const report = prepareCommunityState({ sourceDb });
    const virtual = report.inventory.find(table => table.table === 'fixture_vectors');
    assert.equal(virtual?.rows, null);
    assert.equal(virtual?.rowCountStatus, 'requires-extension');
    assert.equal(virtual?.virtualModule, 'vec0');
    assert.equal(report.sourceHashUnchanged, true);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
