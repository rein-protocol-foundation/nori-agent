// Diagnostics intentionally import pinned native implementations; production must use public SDKs.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { importSqliteSessionRows } from '../../vendor/openclaw/src/config/sessions/session-accessor.sqlite-import.test-support.ts';
import { resolveOpenClawAgentSqlitePath } from '../../vendor/openclaw/src/state/openclaw-agent-db.paths.ts';
import { configureMemoryCoreDreamingState, getMemorySearchManager } from '../../vendor/openclaw/extensions/memory-core/runtime-api.ts';
import { filterMemorySearchHitsBySessionVisibility } from '../../vendor/openclaw/extensions/memory-core/session-search-visibility-api.ts';
import { createPluginStateKeyedStore } from '../../vendor/openclaw/src/plugin-state/plugin-state-store.ts';
import { recordInboundSession } from '../../vendor/openclaw/src/channels/session.ts';
import { appendTranscriptMessage } from '../../vendor/openclaw/src/config/sessions/session-accessor.sqlite-transcript-write.ts';
import { deleteSessionEntryLifecycle, resetSessionEntryLifecycle } from '../../vendor/openclaw/src/config/sessions/session-accessor.sqlite-lifecycle.ts';
import { loadMemorySessionMetadata, listSessionTranscriptCorpusEntriesForAgent } from '../../vendor/openclaw/src/plugin-sdk/memory-core-host-engine-sessions.ts';
import { resolveEffectiveSessionToolsVisibility } from '../../vendor/openclaw/src/plugin-sdk/session-visibility.ts';
import { listSpawnedSessionKeysWithResult } from '../../vendor/openclaw/src/plugin-sdk/session-visibility-internal.ts';
import { resolveSessionTranscriptIdentity } from '../../vendor/openclaw/src/plugin-sdk/session-transcript-runtime.ts';
import { callGateway } from '../../vendor/openclaw/src/gateway/call.ts';
import { createSessionsSearchTool } from '../../vendor/openclaw/src/agents/tools/sessions-search-tool.ts';
import { readAgentMemoryFile } from '../../vendor/openclaw/packages/memory-host-sdk/src/host/read-file.ts';
import { resolveAdmissionPolicy, sessionExclusionReason, sessionIngestionSourceFromCorpus } from '../../vendor/openclaw/extensions/memory-core/src/session-ingestion.ts';
import { runDreamingSweepPhases } from '../../vendor/openclaw/extensions/memory-core/src/dreaming-phases.ts';
import { recordShortTermRecalls } from '../../vendor/openclaw/extensions/memory-core/src/short-term-promotion-record.ts';
import { registerShortTermPromotionDreaming } from '../../vendor/openclaw/extensions/memory-core/src/dreaming.ts';
import { MEMORY_DREAMING_SYSTEM_EVENT_TEXT } from '../../vendor/openclaw/src/memory-host-sdk/dreaming.ts';

const stateDir = process.env.OPENCLAW_STATE_DIR!;
assert.equal(realpathSync(process.cwd()), realpathSync(stateDir), 'probe must run inside its isolated temporary state');
configureMemoryCoreDreamingState(options => createPluginStateKeyedStore('memory-core', options));
const communityWorkspace = join(stateDir, 'community-seed');
const mainWorkspace = join(stateDir, 'main-workspace');
mkdirSync(communityWorkspace, { recursive: true });
mkdirSync(mainWorkspace, { recursive: true });
const communityId = 'nori-community';
const phase = process.argv[2];
assert.ok(['seed-and-reset', 'restart-and-dreaming'].includes(phase));
const keyA = `agent:${communityId}:discord:community:direct:alice`;
const keyB = `agent:${communityId}:discord:community:direct:bob`;
const keyPublic = `agent:${communityId}:discord:channel:public-room`;
const keyMain = 'agent:main:slack:staff:direct:director';
const pluginConfig = { memoryPolicy: { excludeSessions: { channels: ['discord'] } },
  dreaming: { enabled: true, phases: { light: { enabled: true }, rem: { enabled: false }, deep: { enabled: false } } } };
const cfg = {
  plugins: { enabled: false },
  gateway: { mode: 'local', bind: 'loopback', port: 0, auth: { mode: 'token', token: randomBytes(24).toString('hex') }, controlUi: { enabled: false } },
  discovery: { mdns: { mode: 'off' } }, update: { checkOnStart: false }, cron: { enabled: false }, browser: { enabled: false },
  agents: { ownership: 'explicit', entries: {
    main: { workspace: mainWorkspace, memory: { search: { sources: ['memory'], rememberAcrossConversations: true } } },
    [communityId]: { workspace: communityWorkspace,
      memory: { search: { sources: ['sessions'], experimental: { sessionMemory: true }, rememberAcrossConversations: false } },
      sandbox: { mode: 'all', scope: 'session', workspaceAccess: 'none' },
    },
  } },
  memory: { search: { provider: 'none', store: { vector: { enabled: false } }, query: { minScore: 0 } } },
  tools: { sessions: { visibility: 'all' } },
};
const canary = 'violetcommunitycanary';
const mainCanary = 'cobaltmaincanary';
const unknownCanary = 'scarletmissingmetadatacanary';
const findingsPath = join(stateDir, 'community-session-memory-findings.json');
const findings: Record<string, unknown> = phase === 'seed-and-reset' ? {} : JSON.parse(readFileSync(findingsPath, 'utf8'));
const storePath = (agentId: string) => resolveOpenClawAgentSqlitePath({ agentId });
const scope = (agentId: string, sessionKey: string, sessionId: string) => ({ agentId, sessionKey, sessionId, storePath: storePath(agentId) });
async function seed(agentId: string, key: string, id: string, content: string, channel?: string, chatType: 'direct' | 'channel' = 'direct') {
  await importSqliteSessionRows({
    agentId, sessionKey: key, storePath: storePath(agentId),
    entry: { sessionId: id, updatedAt: Date.now(), chatType },
  });
  if (channel) {
    const tasks: Promise<unknown>[] = [];
    await recordInboundSession({ storePath: storePath(agentId), sessionKey: key,
      ctx: { SessionKey: key, Provider: channel, Surface: channel, ChatType: chatType, AccountId: agentId,
        From: `${channel}:synthetic-sender`, To: `${channel}:synthetic-target` },
      updateLastRoute: { sessionKey: key, channel, to: `${channel}:synthetic-target`, accountId: agentId },
      onRecordError: error => { throw error; }, trackSessionMetaTask: task => tasks.push(task),
    });
    await Promise.all(tasks);
  }
  await appendTranscriptMessage(scope(agentId, key, id), { message: { role: 'user', content } });
  if (channel) assert.equal(loadMemorySessionMetadata(scope(agentId, key, id))?.channel, channel, 'native ingress channel metadata missing');
}

// A token-authenticated local native gateway supplies real spawned-session ownership checks.
const listener = createServer();
await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
cfg.gateway.port = (listener.address() as { port: number }).port;
await new Promise<void>(resolve => listener.close(() => resolve()));
process.env.OPENCLAW_GATEWAY_TOKEN = cfg.gateway.auth.token;
// Pin every native client's destination even if an imported config reader cached the initial {}.
process.env.OPENCLAW_GATEWAY_PORT = String(cfg.gateway.port);
writeFileSync(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify(cfg));
const gateway = spawn(process.execPath, [fileURLToPath(new URL('../../vendor/openclaw/openclaw.mjs', import.meta.url)), 'gateway', 'run'], {
  cwd: stateDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
});
let gatewayLog = '';
gateway.stdout?.on('data', data => { gatewayLog = (gatewayLog + String(data)).slice(-32000); });
gateway.stderr?.on('data', data => { gatewayLog = (gatewayLog + String(data)).slice(-32000); });
const gatewayClosed = new Promise<void>(resolve => gateway.once('exit', () => resolve()));
// Also retire the child if a failed seed/import or the outer harness timeout exits this process.
process.once('exit', () => gateway.kill('SIGKILL'));
process.once('SIGTERM', () => { gateway.kill('SIGKILL'); process.exit(143); });
process.once('SIGINT', () => { gateway.kill('SIGKILL'); process.exit(130); });
for (let attempt = 0; ; attempt++) {
  try { if ((await fetch(`http://127.0.0.1:${cfg.gateway.port}/readyz`)).ok) break; } catch {}
  if (gateway.exitCode !== null || attempt >= 150) {
    gateway.kill('SIGKILL');
    throw new Error(`isolated native gateway unavailable: ${gatewayLog.replaceAll(cfg.gateway.auth.token, '[redacted]')}`);
  }
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (phase === 'seed-and-reset') {
  // Let the Gateway perform first-run migrations before this process acquires data leases.
  writeFileSync(join(communityWorkspace, 'MEMORY.md'), 'Public seed: community events are open to everyone.');
  writeFileSync(join(mainWorkspace, 'MEMORY.md'), `Private main workspace preference: ${mainCanary}.`);
  await seed(communityId, keyA, 'alice-session', `My private preference is ${canary}.`, 'discord');
  await seed(communityId, keyB, 'bob-session', 'My private preference is amberbobcanary.', 'discord');
  await seed(communityId, keyPublic, 'public-session', 'The public event is jadepubliccanary.', 'discord', 'channel');
  await seed('main', keyMain, 'main-session', `My operational preference is ${mainCanary}.`, 'slack');
}
let { manager, error } = await getMemorySearchManager({ cfg: cfg as never, agentId: communityId });
assert.ok(manager, error ?? 'native memory manager unavailable');
const has = (hits: Array<{ snippet: string }>, token: string) => hits.some(hit => hit.snippet.includes(token));
const identityDiagnostic = async () => {
  // This SDK subpath is private-local after July: useful evidence, never a production seam.
  const sentinel = `agent:${communityId}:unresolved-${randomBytes(12).toString('hex')}`;
  const known = await resolveSessionTranscriptIdentity({ agentId: communityId, sessionId: 'alice-session', sessionKey: sentinel });
  const unknown = await resolveSessionTranscriptIdentity({ agentId: communityId, sessionId: `unknown-${randomBytes(12).toString('hex')}`, sessionKey: sentinel });
  assert.equal(unknown.sessionKey, sentinel, 'unknown native identity unexpectedly acquired a canonical key');
  return { knownKey: known.sessionKey, resolvesOriginalDm: known.sessionKey === keyA, unknownReturnsSentinel: true };
};
const nativeSessionSearchDiagnostic = async (token = canary) => {
  const byKey = new Map<string, { results: Array<{ snippet: string }>; archivedTranscriptsExcluded?: number; indexing?: boolean }>();
  for (const key of [keyA, keyB, keyPublic]) {
    byKey.set(key, await callGateway({ method: 'sessions.search', params: {
      agentId: communityId, sessionKeys: [key], query: token, limit: 25,
    } }));
  }
  assert.equal(has(byKey.get(keyB)!.results, token), false, 'native SQL search crossed B key into A history');
  assert.equal(has(byKey.get(keyPublic)!.results, token), false, 'native SQL search crossed public key into A history');
  const ownTool = createSessionsSearchTool({ agentId: communityId, agentSessionKey: keyA, sandboxed: true, config: cfg as never });
  const own = await ownTool.execute('synthetic-own-search', { query: token, sessionKey: keyA });
  const ownDetails = own.details as { results?: Array<{ snippet: string }>; archivedTranscriptsExcluded?: number; status?: string };
  const otherTool = createSessionsSearchTool({ agentId: communityId, agentSessionKey: keyB, sandboxed: true, config: cfg as never });
  const other = await otherTool.execute('synthetic-cross-owner-search', { query: token, sessionKey: keyA });
  const otherDetails = other.details as { status?: string; results?: Array<{ snippet: string }> };
  assert.equal(otherDetails.status, 'forbidden', 'native B sessions_search accepted explicit A target');
  return { rpcSameDmRecall: has(byKey.get(keyA)!.results, token), nativeToolSameDmRecall: has(ownDetails.results ?? [], token),
    bobAndPublicScopedQueriesEmpty: true, nativeToolRejectsBobTargetingAlice: true,
    archivedTranscriptsExcluded: byKey.get(keyA)!.archivedTranscriptsExcluded ?? 0,
    indexing: byKey.get(keyA)!.indexing ?? false };
};
const query = async (token: string) => await manager.search(token, { sessionKey: keyA, sources: ['sessions'], minScore: 0, maxResults: 100 });
const read = async (requesterSessionKey: string, hits: Awaited<ReturnType<typeof query>>, agentId = communityId, sandboxed = true) => await filterMemorySearchHitsBySessionVisibility({
  cfg: cfg as never, agentId, requesterSessionKey, sandboxed, hits,
});
const assertDenyOthers = async (hits: Awaited<ReturnType<typeof query>>) => {
  for (const key of [keyB, keyPublic]) assert.equal(has(await read(key, hits), canary), false, 'another Community audience received A canary');
  assert.equal(has(await read(keyMain, hits, 'main', false), canary), false, 'main received Community private canary');
};
const workspaceText = (root: string) => readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(md|txt|json|jsonl)$/.test(entry.name))
  .map(entry => readFileSync(join(entry.parentPath, entry.name), 'utf8')).join('\n');
try {
  const ownership = await listSpawnedSessionKeysWithResult({ requesterSessionKey: keyA });
  assert.equal(ownership.ok, true, `local gateway ownership query must succeed; fail-closed denial is not acceptance: ${JSON.stringify(ownership)}`);
  // No explicit sync: search must use the native on-session-start/on-search synchronization.
  const raw = await query(canary);
  assert.ok(raw.some(hit => hit.snippet.includes(canary)), 'automatic native search did not index the synthetic transcript');
  await assertDenyOthers(raw);
  if (phase === 'seed-and-reset') {
    assert.ok(has(await read(keyA, raw), canary), 'A cannot recall its own native transcript');
    assert.equal(resolveEffectiveSessionToolsVisibility({ cfg: cfg as never, sandboxed: true }), 'tree');
    assert.equal(resolveEffectiveSessionToolsVisibility({ cfg: cfg as never, sandboxed: false }), 'all');
    const main = await getMemorySearchManager({ cfg: cfg as never, agentId: 'main' });
    assert.ok(main.manager, main.error);
    try { assert.ok(has(await main.manager.search(mainCanary, { sessionKey: keyMain, sources: ['memory'], minScore: 0 }), mainCanary), 'main workspace memory unavailable'); }
    finally { await main.manager.close?.(); }
    assert.equal(has(await query(mainCanary), mainCanary), false, 'Community indexed main transcript');
    assert.equal((await readAgentMemoryFile({ cfg: cfg as never, agentId: communityId, relPath: 'MEMORY.md' })).status, 'ok');
    await assert.rejects(readAgentMemoryFile({ cfg: cfg as never, agentId: communityId, relPath: join(mainWorkspace, 'MEMORY.md') }));
    findings.minimal = { automaticTranscriptIndexing: true, explicitSyncCalled: false, ownRecall: true, otherAudiencesDenied: true,
      mainWorkspaceMemoryPreserved: true, publicSeedReadable: true, mainPrivateFileDenied: true, liveLocalGatewayOwnership: true };
    // Use the real reset handler, not a test-authored buildNextEntry that copies metadata.
    const resetRpc = await callGateway<{ ok: true; entry: { sessionId: string } }>({ method: 'sessions.reset', params: {
      key: keyA, agentId: communityId, reason: 'reset', expectedSessionId: 'alice-session',
    } });
    assert.equal(resetRpc.ok, true);
    await appendTranscriptMessage(scope(communityId, keyA, resetRpc.entry.sessionId), { message: { role: 'user', content: 'The same Alice DM continues after reset.' } });
    const resetMetadata = loadMemorySessionMetadata(scope(communityId, keyA, resetRpc.entry.sessionId));
    findings.resetMetadata = { usedNativeGatewayReset: true, channel: resetMetadata?.channel, accountId: resetMetadata?.accountId, chatType: resetMetadata?.chatType };
    assert.equal(resetMetadata?.channel, 'discord', 'native reset failed to preserve Discord admission metadata');
    assert.equal(resetMetadata?.accountId, communityId, 'native reset failed to preserve source account');
    assert.equal(resetMetadata?.chatType, 'direct', 'native reset failed to preserve DM chat type');
    const reset = await query(canary);
    findings.retainedReset = { rawCanaryPresent: has(reset, canary), sameDmRecall: has(await read(keyA, reset), canary), paths: reset.map(hit => hit.path) };
    findings.retainedIdentityResolver = await identityDiagnostic();
    assert.equal((findings.retainedIdentityResolver as { resolvesOriginalDm: boolean }).resolvesOriginalDm, true,
      'private-local SDK identity diagnostic did not recover original DM ownership');
    findings.retainedNativeSessionsSearch = await nativeSessionSearchDiagnostic();
    assert.equal((findings.retainedNativeSessionsSearch as { nativeToolSameDmRecall: boolean }).nativeToolSameDmRecall, true,
      'native sessions_search lost retained history after reset');
    await assertDenyOthers(reset);
  } else {
    findings.processRestart = { newProcess: true, rawCanaryPresent: has(raw, canary), sameDmRecall: has(await read(keyA, raw), canary) };
    findings.restartedIdentityResolver = await identityDiagnostic();
    findings.restartedNativeSessionsSearch = await nativeSessionSearchDiagnostic();
    assert.equal((findings.restartedNativeSessionsSearch as { nativeToolSameDmRecall: boolean }).nativeToolSameDmRecall, true,
      'native sessions_search lost retained history across process/Gateway restart');
    // Separately represent older rotated-window history. Current Gateway reset keeps the
    // transcript ID; this diagnostic must not mislabel a synthetic rollover as current reset.
    await resetSessionEntryLifecycle({ agentId: communityId, storePath: storePath(communityId),
      target: { canonicalKey: keyA, storeKeys: [keyA] },
      buildNextEntry: ({ currentEntry }) => ({ ...currentEntry!, sessionId: 'alice-legacy-rotation',
        previousSessionId: currentEntry!.sessionId, updatedAt: Date.now() }) });
    await appendTranscriptMessage(scope(communityId, keyA, 'alice-legacy-rotation'), {
      message: { role: 'user', content: 'Synthetic legacy rotation retains the original Alice DM history.' },
    });
    const rotated = await query(canary);
    findings.legacyRotatedWindow = { syntheticNativeLifecycleRollover: true, rawCanaryPresent: has(rotated, canary),
      sameDmMemorySearchRecall: has(await read(keyA, rotated), canary), identity: await identityDiagnostic(),
      nativeSessionsSearch: await nativeSessionSearchDiagnostic() };
    assert.equal((findings.legacyRotatedWindow as { sameDmMemorySearchRecall: boolean }).sameDmMemorySearchRecall, false,
      'pinned legacy rotated-window memory_search behavior changed; reassess the diagnostic');
    assert.equal((findings.legacyRotatedWindow as { nativeSessionsSearch: { nativeToolSameDmRecall: boolean } }).nativeSessionsSearch.nativeToolSameDmRecall, true,
      'native sessions_search did not recover synthetic legacy rotated-window history');
    await assertDenyOthers(rotated);
    const policy = resolveAdmissionPolicy(pluginConfig);
    const entries = await listSessionTranscriptCorpusEntriesForAgent(communityId, { includeRetainedSqlite: true });
    findings.discordAdmission = entries.filter(entry => entry.artifactKind === 'active-session').map(entry => {
      const source = sessionIngestionSourceFromCorpus(entry); assert.ok(source);
      const reason = sessionExclusionReason(source, policy); assert.equal(reason, 'channel:discord');
      return { sessionId: entry.sessionId, reason };
    });
    const logger = { info() {}, warn() {}, error() {} };
    // Supply actual nonempty native session hits, so this tests recorder source admission even
    // when the retained-history visibility bug currently makes the model-visible result empty.
    await recordShortTermRecalls({ workspaceDir: communityWorkspace, query: canary, results: raw });
    assert.equal(workspaceText(communityWorkspace).includes(canary), false, 'session recall wrote private text into shared seed');
    await runDreamingSweepPhases({ agentId: communityId, workspaceDir: communityWorkspace, cfg: cfg as never, pluginConfig, logger });
    assert.equal(workspaceText(communityWorkspace).includes('amberbobcanary'), false, 'excluded Discord transcript entered shared seed');
    await runDreamingSweepPhases({ agentId: 'main', workspaceDir: mainWorkspace, cfg: cfg as never, pluginConfig, logger });
    findings.dreaming = { discordExcluded: true, transcriptRecallDoesNotWriteSeed: true,
      slackMainSessionCorpusCreated: readdirSync(mainWorkspace, { recursive: true }).some(name =>
        String(name).includes('session-corpus') && String(name).endsWith('.txt') && readFileSync(join(mainWorkspace, String(name)), 'utf8').includes(mainCanary)) };
    assert.equal((findings.dreaming as { slackMainSessionCorpusCreated: boolean }).slackMainSessionCorpusCreated, true, 'Slack main stopped entering native dreaming corpus');
    await seed(communityId, `agent:${communityId}:unclassified`, 'missing-metadata', `My sensitive legacy preference is ${unknownCanary}.`);
    const unclassified = (await listSessionTranscriptCorpusEntriesForAgent(communityId, { includeRetainedSqlite: true })).find(entry => entry.sessionId === 'missing-metadata');
    assert.ok(unclassified, 'unclassified transcript missing from native corpus');
    const unclassifiedSource = sessionIngestionSourceFromCorpus(unclassified);
    assert.ok(unclassifiedSource, 'unclassified transcript was not a native ingestion candidate');
    assert.equal(sessionExclusionReason(unclassifiedSource, policy), undefined, 'unclassified session unexpectedly matched Discord exclusion');
    await runDreamingSweepPhases({ agentId: communityId, workspaceDir: communityWorkspace, cfg: cfg as never, pluginConfig, logger });
    findings.missingMetadata = { exclusionReasonAbsent: true, canaryWrittenToSharedSeed: workspaceText(communityWorkspace).includes(unknownCanary),
      gate: 'Unclassified legacy and child sessions are not covered by channel exclusion.' };
    // An immutable PUBLIC seed is the write boundary; private transcript/index state remains
    // separate and writable. Remove only this probe's synthetic promotion files before testing.
    rmSync(join(communityWorkspace, 'memory'), { recursive: true, force: true });
    chmodSync(join(communityWorkspace, 'MEMORY.md'), 0o444);
    chmodSync(communityWorkspace, 0o555);
    try {
      assert.throws(() => writeFileSync(join(communityWorkspace, 'forbidden.txt'), 'synthetic'), /EACCES|EPERM/,
        'probe must run as an unprivileged user for the immutable-seed boundary');
      const postBoundaryCanary = 'mainafterreadonlycanary';
      await appendTranscriptMessage(scope(communityId, `agent:${communityId}:unclassified`, 'missing-metadata'), {
        message: { role: 'user', content: `New private preference after seed became immutable: ${unknownCanary}second.` },
      });
      await appendTranscriptMessage(scope('main', keyMain, 'main-session'), {
        message: { role: 'user', content: `Remember this internal operational preference: ${postBoundaryCanary}.` },
      });
      // The native managed-sweep hook is gated by deep.enabled even for light ingestion.
      const sweepPluginConfig = structuredClone(pluginConfig);
      sweepPluginConfig.dreaming.phases.deep.enabled = true;
      const sweepConfig = { ...cfg, agents: { ...cfg.agents,
        entries: { [communityId]: cfg.agents.entries[communityId], main: cfg.agents.entries.main } },
        plugins: { entries: { 'memory-core': { enabled: true, config: sweepPluginConfig } } } };
      let dreamingHook: any;
      const errors: string[] = [];
      registerShortTermPromotionDreaming({ config: sweepConfig,
        runtime: { config: { current: () => sweepConfig } },
        registerService() {}, on(name: string, handler: any) { if (name === 'before_agent_reply') dreamingHook = handler; },
        logger: { info() {}, warn() {}, error(message: string) { errors.push(message); } },
      } as never);
      const handled = await dreamingHook({ cleanedBody: MEMORY_DREAMING_SYSTEM_EVENT_TEXT },
        { trigger: 'cron', agentId: communityId, workspaceDir: communityWorkspace });
      assert.equal(handled?.handled, true, 'native multi-workspace dreaming hook did not complete');
      assert.ok(errors.some(message => message.includes(communityWorkspace) && /EACCES|EPERM/.test(message)),
        `native dreaming did not exercise the OS write boundary: ${JSON.stringify(errors)}`);
      assert.equal(workspaceText(communityWorkspace).includes(unknownCanary), false,
        'unclassified private text escaped into immutable public seed');
      assert.ok(workspaceText(mainWorkspace).includes(postBoundaryCanary),
        'Community write rejection stopped subsequent main dreaming');
      const afterBoundaryCanary = 'violetreadonlyactivecanary';
      await appendTranscriptMessage(scope(communityId, keyA, 'alice-legacy-rotation'), {
        message: { role: 'user', content: `New private preference in the active DM: ${afterBoundaryCanary}.` },
      });
      // Native transcript-update indexing has a five-second debounce and search serves the
      // published generation while reconciliation runs. Wait boundedly, never call sync().
      let afterBoundaryHits = await query(afterBoundaryCanary);
      for (let attempt = 0; attempt < 30 && !has(afterBoundaryHits, afterBoundaryCanary); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        afterBoundaryHits = await query(afterBoundaryCanary);
      }
      const incrementalMemorySearchRecall = has(await read(keyA, afterBoundaryHits), afterBoundaryCanary);
      const activeNativeRecall = await nativeSessionSearchDiagnostic(afterBoundaryCanary);
      assert.equal(activeNativeRecall.nativeToolSameDmRecall, true, 'immutable seed disabled automatic native session recall');
      // Verify normal manager startup catches up without a forced sync while the seed is still
      // immutable. Incremental memory_search and native sessions_search are distinct indexes.
      await manager.close?.();
      ({ manager, error } = await getMemorySearchManager({ cfg: cfg as never, agentId: communityId }));
      assert.ok(manager, error);
      afterBoundaryHits = await query(afterBoundaryCanary);
      const memorySearchStartupRecall = has(await read(keyA, afterBoundaryHits), afterBoundaryCanary);
      for (const key of [keyB, keyPublic]) assert.equal(has(await read(key, afterBoundaryHits), afterBoundaryCanary), false);
      assert.equal((await nativeSessionSearchDiagnostic()).nativeToolSameDmRecall, true,
        'immutable seed disabled native retained-window continuity');
      findings.immutableSeed = { osWriteDenied: true, unclassifiedPrivatePromotionDenied: true, incrementalMemorySearchRecall,
        memorySearchStartupRecall, nativeActiveSessionRecall: activeNativeRecall.nativeToolSameDmRecall,
        nativeSweepContinuedToMain: true, automaticTranscriptRecallPreserved: true, otherAudiencesDenied: true,
        limitation: 'memory_search on the synthetic rotated window may remain stale; native sessions_search is the required continuity path, including for new transcript records.' };
    } finally {
      chmodSync(communityWorkspace, 0o700); chmodSync(join(communityWorkspace, 'MEMORY.md'), 0o600);
    }
    // Deletion is distinct from reset: retained archive bytes must not reappear in native
    // sessions_search after recreating the same DM. Do this only after restart continuity.
    const archived = await deleteSessionEntryLifecycle({ agentId: communityId, storePath: storePath(communityId),
      target: { canonicalKey: keyA, storeKeys: [keyA] }, archiveTranscript: true });
    assert.equal(archived.deleted, true);
    findings.archiveCount = archived.archivedTranscripts.length;
    await seed(communityId, keyA, 'alice-after-archive', 'The same Alice DM resumes after explicit deletion.', 'discord');
    const archiveHits = await query(canary);
    findings.afterDelete = { rawCanaryPresent: has(archiveHits, canary), sameDmMemorySearchRecall: has(await read(keyA, archiveHits), canary) };
    findings.afterDeleteIdentityResolver = await identityDiagnostic();
    findings.afterDeleteNativeSessionsSearch = await nativeSessionSearchDiagnostic();
    assert.equal((findings.afterDeleteNativeSessionsSearch as { nativeToolSameDmRecall: boolean }).nativeToolSameDmRecall, false,
      'deleted transcript became visible again through native sessions_search');
    await assertDenyOthers(archiveHits);
    findings.nativeSessionsSearchContinuityPassed = true;
    findings.unadaptedMemorySearchContinuityPassed = Boolean((findings.retainedReset as { sameDmRecall: boolean }).sameDmRecall && (findings.processRestart as { sameDmRecall: boolean }).sameDmRecall);
    findings.liveAcceptanceProven = false;
    findings.scope = 'Synthetic native SQLite, native filter, local token-auth gateway and native dreaming; no live channels/models/providers.';
  }
  writeFileSync(findingsPath, JSON.stringify(findings));
  console.log(JSON.stringify({ phase, ...findings }, null, 2));
} finally {
  await manager.close?.();
  gateway.kill('SIGTERM');
  await Promise.race([gatewayClosed, new Promise<void>(resolve => setTimeout(() => { gateway.kill('SIGKILL'); resolve(); }, 5000).unref())]);
}
