// Run with the pinned OpenClaw tsx loader. Read native scope decisions without
// creating jobs, acquiring operator authority, or modifying runtime state.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const upstream = resolve(process.env.REIN_TEST_OPENCLAW ?? 'vendor/openclaw');
const {
  applyCronCreateCallerScopeDefault, cronCreateMatchesCallerScope, cronJobMatchesCallerScope,
} = await import(pathToFileURL(resolve(upstream, 'src/gateway/server-methods/cron-caller-scope.ts')).href);

const caller = agentId => ({
  agentId, accountId: 'default', sessionKey: `agent:${agentId}:slack:channel:cfixture:thread:1.002`,
});
const job = {
  name: 'Sandbox verification', schedule: { kind: 'at', at: '2099-01-01T00:00:00Z' },
  sessionTarget: 'isolated', payload: { kind: 'agentTurn', message: 'Verify fixture' },
};
const main = caller('main'), development = caller('nori-development');
function createAs(creator, executor) {
  return applyCronCreateCallerScopeDefault({ ...job, agentId: executor.agentId }, creator);
}
function canCreate(creator, executor) {
  return cronCreateMatchesCallerScope({ job: createAs(creator, executor), callerScope: creator });
}
const existing = createAs(development, development);
const evidence = {
  sandboxAgentCreatesSandboxJob: canCreate(development, development),
  mainCreatesMainJob: canCreate(main, main),
  mainCreatesSandboxAgentJob: canCreate(main, development),
  originalOwnerCanAccessExistingJob: cronJobMatchesCallerScope({ job: existing, callerScope: development }),
  mainCanAccessExistingJob: cronJobMatchesCallerScope({ job: existing, callerScope: main }),
};
assert.deepEqual(evidence, {
  sandboxAgentCreatesSandboxJob: true, mainCreatesMainJob: true, mainCreatesSandboxAgentJob: false,
  originalOwnerCanAccessExistingJob: true, mainCanAccessExistingJob: false,
});
console.log(JSON.stringify(evidence));
