import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const summaryScope = source => digest([source.sessionKey, source.agentId,
  source.accountId, source.channel, source.chatId?.toLowerCase()]);
const summaryId = flowId => digest(flowId);

/** Lazy, feature-owned native worker store. No expiry, transcript reads or migration. */
export function createRetainedSummaries({ stateDir, openSqliteWorkerStore }) {
  let opening;
  async function connect() {
    if (!opening) opening = (async () => {
      const root = await realpath(stateDir);
      const directory = join(root, 'rein-acp');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory)
        throw Error('rein_summary_unsafe_directory');
      await chmod(directory, 0o700);
      const databasePath = join(directory, 'task-summaries.sqlite');
      let file;
      try { file = await open(databasePath, 'wx', 0o600); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      finally { await file?.close(); }
      const info = await lstat(databasePath);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw Error('rein_summary_unsafe_file');
      await chmod(databasePath, 0o600);
      return openSqliteWorkerStore({ moduleUrl: new URL('./retained-summaries-backend.mjs', import.meta.url), databasePath, input: null });
    })().catch(error => { opening = undefined; throw error; });
    return opening;
  }
  const execute = async (type, source, flowId, extra = {}) => (await connect()).execute({ type,
    input: { scope: summaryScope(source), id: summaryId(flowId ?? null), ...extra } });
  return {
    put: summary => execute('put', summary.source, summary.flowId, { revision: summary.nativeRevision, summary }),
    async list(source, { limit = 20, cursor } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw Error('rein_summary_limit_invalid');
      const scope = summaryScope(source);
      let after = '';
      if (cursor !== undefined) {
        if (typeof cursor !== 'string' || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error('rein_summary_cursor_invalid');
        let value;
        try { value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); }
        catch { throw Error('rein_summary_cursor_invalid'); }
        if (value?.v !== 1 || value.scope !== scope || !/^[a-f0-9]{64}$/.test(value.after ?? '') ||
            Object.keys(value).length !== 3) throw Error('rein_summary_cursor_invalid');
        after = value.after;
      }
      const rows = await execute('list', source, undefined, { after, limit: limit + 1 });
      const page = rows.slice(0, limit);
      return { summaries: page.map(row => row.summary), nextCursor: rows.length > limit
        ? Buffer.from(JSON.stringify({ v: 1, scope, after: page.at(-1).id })).toString('base64url') : null };
    },
    read: (source, flowId) => execute('read', source, flowId),
    delete: (source, flowId, at) => execute('delete', source, flowId, { at }),
    async close() { if (opening) { const store = await opening; opening = undefined; await store.close(); } },
  };
}

export function terminalSummary(flow) {
  const state = flow.stateJson;
  return { version: 1, flowId: flow.flowId, ownerKey: flow.ownerKey, source: {
    sessionKey: state.source.sessionKey, sessionId: state.source.sessionId, agentId: state.source.agentId,
    channel: state.source.channel, accountId: state.source.accountId, chatId: state.source.chatId, senderId: state.source.senderId,
  }, origin: flow.requesterOrigin, nativeRevision: flow.revision, nativeStatus: flow.status,
  goal: state.goal, criteria: state.criteria, scopeRevision: state.scopeRevision, outcome: state.phase,
  report: state.report, createdAt: state.createdAt, endedAt: flow.endedAt ?? state.report?.at,
  runs: state.attempts.filter(attempt => attempt.runId).map(attempt => ({ runId: attempt.runId,
    taskId: attempt.taskId ?? null, childSessionKey: attempt.childSessionKey, scopeRevision: attempt.scopeRevision,
    status: attempt.nativeStatus ?? null })),
  artifactAvailability: 'not_verified',
  artifactNotice: 'Saved references and report text do not verify that external files still exist or are accessible.',
  retention: { status: 'retained', expiresAt: null, nativeExecutionAuthority: false },
  };
}
