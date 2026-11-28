# Retained task summaries

Updated 2026-11-16. Scope: SA-M2-06, minimal optional terminal-summary copies.
Native Task/Flow records remain the execution authority. The adapter uses the public
`openclaw/plugin-sdk/sqlite-runtime.openSqliteWorkerStore` with a feature-owned backend,
and `api.runtime.state.resolveStateDir()` for its state root. It does not open native internal
databases, claim official-plugin trust, change the vendor, add a scheduler, or collect history.

Enable alongside existing task-loop and continuation configuration:

```json
{
  "taskLoop": true,
  "continuation": {
    "enabled": true,
    "retainedSummaries": { "enabled": true }
  }
}
```

The default is disabled. Only tasks begun while enabled receive a native Flow opt-in marker.
Old tasks are not imported. When an opted-in task becomes terminal, its minimal goal, criteria,
result/evidence, missing work, effects uncertainty, actual run/task/session references, source
owner/session UUID and original audience are copied. Instructions, full attempts, transcripts,
other histories and arbitrary workspace files are not copied. The server keeps these copies
indefinitely; there is no automatic expiry or deletion. Slack chat is never deleted by this feature.

The private database is `<stateDir>/rein-acp/task-summaries.sqlite`. The directory is restricted
to mode `0700`, the file to `0600`. Feature directory/file symlinks and hard-linked database
files are rejected. A configured state root is canonicalized before creating the private feature
subdirectory. Keep normal server backups under the existing operator's data-access policy.

`rein_continuation` adds three actions for the current authorized human:

- `list_summaries`: list copies for this stable native owner, configured account, agent, channel and
  audience. Defaults to 20 records; `limit` accepts 1–50. A non-null `nextCursor` means more
  records exist: pass it as `cursor` to continue. Cursors are bounded opaque scope-bound tokens.
- `read_summary`, with `flow`: read a selected copy, including after native Flow cleanup.
- `delete_summary`, with `flow`: clear only this retained copy. No content or source identity is
  retained in its tombstone: opaque hashes and deletion time prevent later terminal status,
  restart or racing stale writes from recreating it.

Identity comes from host admission, current session inventory and live configured-channel
membership checks, never tool arguments. Reads and deletes check authority before and after
asynchronous storage access. A stale/missing current host session UUID fails closed. The original
UUID remains immutable provenance: a current authorized human in the same stable owner/audience can recall summaries
after `/new` or `/reset`. This does not reassign records or relax executable Flow UUID checks.
A native background wake can reconcile native state and save an opted-in terminal result using the saved source's
current authority, but cannot list, read or delete summary copies.

Every returned summary explicitly says artifact availability is `not_verified`. A saved path,
URL, report or run ID does not prove that a file exists, can be downloaded, or remains accessible.
No artifact existence or access check is performed. Missing files therefore remain unverified,
and must not be presented as available deliverables.

Deletion returns `fullDeletion: false` and states that native Flow/Task records, Slack chat,
external files and backups were not deleted. The pinned native managed Flow API has no selected
full-copy deletion operation. Secure SQLite deletion clears the active payload; this is not a
promise to erase filesystem snapshots, backups, chat or native records. An operation that commits
before authority is revoked may have taken effect, but its result is withheld if the post-check
fails. No claim of atomic revocation of external effects is added.

Native terminal persistence and copying are separate operations. A copy failure leaves native
execution state intact and returns `summaryRetention.status: "failed"`; it must not be described
as durably retained. Authorized status and startup retry only marked terminal tasks while native
state exists. Startup also logs copy failures. A crash or repeated storage failure lasting beyond
native retention can lose an uncopied summary; there is no migration, independent retry scheduler
or guaranteed capture after native cleanup. Successful copies have no TTL and survive worker and
Gateway restarts. They cannot resume work or certify delivery.

Disable the setting to restore ordinary continuation behavior and stop accessing the copy store;
existing copies and tombstones remain. Re-enabling exposes permitted copies under the same live
identity boundary, and retries still-present opted-in terminal tasks. Disabling does not cancel
work, delete data, or reset budgets. Rollback consists of disabling this additive setting; do not
remove the database if its tombstones are needed to prevent reconstruction after re-enabling.

## Verification

Use the pinned Node toolchain after building the public OpenClaw distribution:

```sh
.toolchain/node_modules/.bin/node --test tests/task-continuation.test.mjs tests/task-summary-retention.test.mjs tests/slack-task-loop.test.mjs tests/director-acp.test.mjs
```

A dependency-free worktree can set `REIN_TEST_SQLITE_SDK` to the file URL of the original
checkout's built public `dist/plugin-sdk/sqlite-runtime.js`. Tests always use a disposable own
SQLite database and synthetic source/task data; no live model or Slack calls are needed.

Actual public-worker checks cover a nine-day-old summary across close/reopen, private file modes,
foreign owner/account/channel/agent scopes, reset-window provenance continuity, bounded pagination,
two concurrent workers, revision ordering,
delete/write races, empty tombstone payload, restart and stale-write non-resurrection, and symlink
rejection. Controller tests use actual workers with synthetic native Flow/Task fixtures to cover
terminal persistence, failure/retry, no old-data import, live and mid-operation revocation,
background deletion denial, session replacement, deletion boundaries and disabled compatibility.
The seven-day native cleanup is simulated by removing fixture Flow/Task records before restart;
this does not establish an actual native-maintenance integration or real-user acceptance.

Final local verification: 70 focused tests passed with zero failures/skips; complete repository
regression passed with 1436 passed, four existing conditional skips and zero failures (1440 total).
Node syntax checks, scaffold checks and `git diff --check` passed. The actual pinned native
`plugins inspect rein-acp --runtime --json` loader accepted the synthetic opt-in configuration
and registered both tools without plugin errors. Public worker tests independently executed the
feature's `.mjs` backend. No live services, real model or Slack transport were contacted.

An initial full run failed because this worktree lacked installed dependencies and the sandbox
refused existing tests' loopback listeners. Reusing the original checkout's dependencies and
running with authorized local-listener access produced the passing full result above. An initial
focused run exposed a list-key bug and a synthetic fixture setup error; both were corrected before
the passing focused and complete runs. The first loader probe had an invalid legacy agent roster;
the explicit current roster configuration passed. These failures are not acceptance evidence.
