# Issue creation and discovery

Nori can create one authorized GitHub source issue and discover the Linear issue created by
the existing native sync. The same entry point can bind an existing pair without creating
anything. The resulting private configuration can be used by the
[status adapter](task-tracking.md) and [Task link registry](task-links.md).

## Supply the authorized task

Add an `issuePairing` block to the private tracking configuration. Keep the approved GitHub
repository and Linear account and team in the ordinary tracking fields. Set `nativeSync` only
after the native repository/team pairing and issue audience have been confirmed. The CLI
checks the configured GitHub repository's numeric ID and current full name, the Linear team
ID/key, and both authenticated accounts. An optional `linearProjectId` restricts the Linear
pair readback.

The example is synthetic. Use an existing owner-only parent outside Git for the pairing
store. Retain the same store, Task ID, and operation ID across invocations. Put the exact
external issue title and body in the trusted operator configuration. Include one new opaque
UUID reference in the approved title. That reference is public and lets recovery match the
issue without putting a private Task ID or report in its text. The create path supports public
repositories and rejects mentions, HTML delimiters, and image embeddings.

```json
{
  "issuePairing": {
    "stateDir": "/absolute/private/issue-pairing",
    "githubRepositoryId": "123456789",
    "linearTeamKey": "TEST",
    "tasks": [
      {
        "id": "fixture-task",
        "operationId": "fixture-issue-create",
        "audienceApproved": true,
        "create": {
          "reference": "00000000-0000-4000-8000-000000000042",
          "title": "Synthetic product check [nori:00000000-0000-4000-8000-000000000042]",
          "body": "Synthetic fixture for a publicly visible product check."
        },
        "nativeOwnerKeys": []
      }
    ]
  }
}
```

Set the operator config file to mode `0600`. For the first issue pair, the pairing input can
have an empty top-level `tasks` list. It can also include already bound tasks so the staged output
preserves them. Supply actual native owner keys when the Task will link private OpenClaw runs.
An empty list permits report-only linkage.

Use only organizational resources authorized for the current caller and audience. Nori uses
its configured accounts by default. Delegated GitHub creation also requires a current scoped
grant that permits GitHub writes, and the config is rechecked before every remote request.
An approved title and body contain no private source material, report paths, media, or credentials.

## Create or discover

```sh
node scripts/task-pair.mjs create --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID" --apply
node scripts/task-pair.mjs discover --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID"
node scripts/task-pair.mjs show --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID"
node scripts/task-pair.mjs stage --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID" \
  --output "$PRIVATE_STAGING_DIR/tracking-paired.json"
```

`create` checks for an existing source or mirror by the approved reference before reserving
a single write in the private store. After that durable reservation, it posts the exact title
and body once to the approved GitHub repository. Native sync is the only mirror writer.
Repeated create calls, restarts, and concurrent invocations against the same store can only
read back an already reserved operation. The private registry assumes the operator uses one
store for this repository and team. The external service provides no atomic uniqueness
constraint for the approved title.

After a timeout or missing response, `discover` checks the approved exact title in the Linear
team and makes a bounded scan of recent GitHub issues for the public reference. It verifies
canonical repository identity, source author and approved content when restoring an unknown
source issue, and the exact GitHub issue URL in the Linear issue's actual attachments. A scan
that exceeds its bounds remains `lookup_unavailable`. Missing proof can leave `write_unknown`
or `sync_pending`. Preserve the original receipt and inspect the native sync configuration
or the authorized issue manually if discovery cannot establish the result. A recorded
`conflict` blocks further automatic writes and staging for that intent.

To bind an existing issue pair, replace `create` with `existing` and supply the approved
`githubIssue` number, `linearIssue` UUID, or both. Use `discover`; it makes no issue writes.
When only the GitHub number is available, the Linear title search must find a canonical
attachment to that exact issue. If the two titles diverged, supply the approved Linear UUID.

A `paired` result means both issues were read back with the canonical attachment. It does
not change issue status or imply product acceptance. Exit code 2 means the pair is
prepared, pending, uncertain, or conflicting. Exit code 1 means the command or its
preconditions failed. `show` reads the local receipt. `stage` uses the verified pair,
validates the generated status-adapter configuration, and publishes a new owner-only file
without overwriting an existing file. The staging directory must already exist outside Git.
Keep the original pairing config and store for historical recovery.

## Verify locally

```sh
node --test tests/task-pair.test.mjs
```

The fixtures exercise trusted account/repository scope, exact payload, a write timeout,
concurrent claims, restart recovery, pre-existing pairs, native attachment verification,
and staging. This command uses synthetic responses and creates no external issue.
