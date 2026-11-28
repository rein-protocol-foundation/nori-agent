# Linear / GitHub task tracking

The repository command `npm run task:tracking -- <arguments>` invokes the same CLI as `node scripts/task-tracking.mjs <arguments>`.

Tracking: **Super Agent v2 / SA2-TASK**, independent of the original Super Agent PRD.
Status: live create, status projection and read-only recovery verified on two labelled synthetic issue pairs. The installation uses the existing REI ↔ rein-protocol-foundation/nori-agent pairing. See the [dated matrix](../verification/super-agent-v2-verification.md).

## Reuse before implementation

[Linear's official GitHub integration](https://linear.app/docs/github) already supports two-way issue
creation/sync. Configure the selected repository and Linear team there, with Nori's actual accounts.
Review audience exposure first: title, description, labels and synced-thread comments can be copied.
Existing issues need the official importer; do not bulk-import or create duplicates automatically.
The official integration remains the only mirror writer. Nori writes the chosen source, then reads
both sides; humans can edit either product, and native sync handles those edits without this CLI.

GitHub Projects custom workflow statuses are not mirrored by this integration. The first adapter
uses GitHub open/closed and completed/not_planned, with detailed workflow state in Linear. GitHub's
issue-status preview is not assumed enabled. This is explicit coarse projection, not exact equality.
Configure PR merge automation so product work can remain awaiting acceptance where appropriate.
Linear cancellation can also close associated PRs under its configured relationships; inspect that
existing automation before choosing a cancellation state. This adapter does not rewrite automation.

## Private configuration and identity

Start from `config/task-tracking.example.json` and save actual settings under ignored private runtime
storage. The example has synthetic identifiers. `nativeSync: true` records the operator's declared
prerequisite; it is not remote proof that integration setup has succeeded. Live two-way acceptance
must confirm that separately. Supply the real Linear workspace/project selection through its team
setup and explicit issue pairs; this adapter does not create teams/projects or change integration settings.

`actor.mode: nori` selects Nori's own explicitly configured account IDs and token environment names.
For user-account work, an operator provisions `mode: delegated`, `principalId`, `grantId`, `expiresAt`,
and the exact account/issue pair scope. Supply requester, resourceOwner, outputAudience and writeSources. A protected operator change can set revoked to true. Keep the credentials and configuration outside the authority of chat users. The CLI requires an owner-only configuration file, rereads its grant across network boundaries and verifies provider identities before writing. It must represent a real authorized grant. Configuration is
trusted operator input, not chat/model input; keep it and credentials inaccessible to unauthorized
callers. Loading a skill does not grant access to it. A broad shell runner must retain its existing
host admission controls. This adapter is not a universal delegated-credential broker for other tools.

Every action checks the actual GitHub `/user` and Linear `viewer.id`; immediately before writes it
checks again. Wrong accounts, expired grants, wrong team/issue/repository and PRs masquerading as
issues are rejected. Use an actual account token (OAuth/API key as configured); GitHub installation
tokens without a `/user` identity need a separate reviewed actor-resolution implementation.

Only status is written. Task pair declarations require `audienceApproved: true`; this is a record of
operator review, not a detector for private text. No issue descriptions/comments, mailbox contents,
credential values or raw error bodies enter receipts. Store receipts outside shared `workspace/`.

## Commands

```sh
node scripts/task-tracking.mjs inspect --config /private/path/tracking.json --task example-task
node scripts/task-tracking.mjs set --config /private/path/tracking.json --task example-task --status in_progress --source linear --operation task-start-1 --apply
node scripts/task-tracking.mjs reconcile --config /private/path/tracking.json --task example-task --operation task-start-1
```

`set` supports `--source github` for unambiguous projections such as closure. To reopen from GitHub, use `--source github --projection open` in place of `--status`. The readback accepts only configured open Linear states and records the exact state reached. To choose a specific detailed active state, write from Linear. User edits in GitHub continue to
use official sync's own mapping; `inspect` shows the actual resulting Linear state.

`synchronized` is emitted only after observed values match the requested projection. Exit code 2
means drift, pending, conflict or unavailable/uncertain outcome; code 1 means invalid input or failed
preconditions. `inspect` is current state; a terminal receipt is historical evidence of that operation.
Call inspect for a fresh check after other users may have changed the task.

The private receipt stores immutable operation intent, account/pair binding, original snapshots and
latest observation. Repeating `set` with the same operation ID only reconciles. A new conflicting
operation cannot overtake pending work. `reconcile` never mutates either remote service. To explicitly
retry a source mutation use `retry --config ... --task ... --operation ... --apply`; it rereads both
sides and only writes when the original source snapshot is unchanged and the peer is unchanged or
already at the desired state. Already observed source success is not replayed. Conflicts require
review and a new intended operation; never blindly repair the peer while native sync is running.

Writes across two services are not transactional. Snapshot comparison detects observed races; it
cannot provide remote compare-and-swap or prove an unobservable concurrent edit did not occur. A
same-state request does not force native sync to re-emit an event; if the peer remains stale the
receipt stays pending and the operator should inspect Linear's sync-error banner. There is no hidden
daemon or unbounded retry. Native authorized Cron may call reconcile if recurring checks are desired.

The SQLite writer lock rejects overlapping CLI processes and the OS releases it when the holder dies. Each receipt update flushes a new file and its parent directory before returning. During migration, stop the preview CLI. A pre-existing preview `.writer-lock` requires checking the old owner and preserving the receipts before resuming. Do not delete receipts or create a fresh operation ID to evade uncertainty.
Rollback disables the caller/schedule and keeps receipts, tasks, native records and external issues.

## Validation and remaining acceptance

`node --test tests/task-tracking.test.mjs` covers both source directions, state precision, delayed
sync, restart, concurrent writers, write-after-timeout, scope changes, observed conflicts, redacted
errors, actual-account mismatch, team/pair mismatch and GraphQL partial failure. Tests use synthetic
clients/responses; they do not establish actual credentials, Linear automation or production acceptance.

The [task tracking skill](../../../workspace/skills/nori-task-tracking/SKILL.md) connects the CLI to an operator-authorized runtime. [Task links](task-links.md) attach native executions and privately stored acceptance rounds. Existing issue status never initiates a native stop, restart or reviewer decision. `inspect` verifies the Linear attachment against the canonical GitHub issue URL. Missing attachment evidence, including a link outside the first 100 attachments, fails closed.

The adapter records the requester, executor, represented principal, both credential accounts, resource owner, cost attribution and output audience for each new write. Unknown cost stays unknown. Use explicit operator facts in the actor configuration. Changing either account, scope or state mapping prevents reusing an earlier write receipt. New operations preserve pre-existing discrepancies. Reconcile and compare both systems before resolving a conflict. The operator can disable the calling skill or schedule and retain all receipts.

Sources: [Linear API](https://linear.app/developers/graphql),
[GitHub issue updates](https://docs.github.com/en/rest/issues/issues#update-an-issue).
