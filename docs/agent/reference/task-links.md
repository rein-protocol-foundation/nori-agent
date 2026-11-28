# Task links across sessions

The Task link registry keeps a stable business Task associated with the operator-approved Linear
issue, GitHub issue, native OpenClaw executions, and private acceptance rounds. Reuse the same
Task ID in later sessions and after reruns. Linear and GitHub keep their existing issue sync.
OpenClaw remains authoritative for execution, and the acceptance store remains authoritative for
product verdicts and reviewer decisions.

## Configure a private scope

Use the existing [task-tracking configuration](task-tracking.md) with these additional fields.
The example uses synthetic paths and owner keys. Keep the real configuration owner-only, and use
the registered Task and issue IDs already approved for the same audience.

```json
{
  "taskLinks": {
    "stateDir": "/absolute/private/task-links",
    "acceptanceStore": "/absolute/private/acceptance",
    "gatewayConfig": "/absolute/private/openclaw/openclaw.json",
    "gatewayState": "/absolute/private/openclaw",
    "gatewayUrl": "ws://127.0.0.1:18789"
  },
  "tasks": [
    {
      "id": "fixture-task",
      "linearIssue": "00000000-0000-4000-8000-000000000008",
      "githubIssue": 42,
      "audienceApproved": true,
      "nativeOwnerKeys": ["agent:fixture:primary", "agent:fixture:followup"]
    }
  ]
}
```

Use the actual configured loopback Gateway URL and existing authorized access. The command
`tasks.get` checks native access. Both the returned owner and requester session keys must be
explicitly approved for the Task. Add a follow-up session only after confirming the same task
audience and scope. Removing a key hides its run and attached report links from subsequent reads
while preserving their history in the private registry. A Task, its sessions, and its issues
continue to have separate identifiers.

Keep the registry outside Git and shared workspace memory. Its parent must exist. The CLI creates
an owner-only directory with a private SQLite database. Pair and run uniqueness are enforced
inside transactions; repeated linkage of the same record is idempotent. Changing a stored pair,
platform account, gateway profile, delegated grant, or acceptance store causes a scope mismatch.
Resolve changes with the operator before adding further links.

## Attach existing records

Use the native task ID returned by an authorized native status lookup. The registry asks the
Gateway for that task and records the actual run ID only when the task, run and owner scope
can be confirmed. It keeps identifiers and the observed status at the time of attachment, with
no task prompt, result, credential, raw session key, or private conversation. For fresh execution
status, use the authorized native status command.

```sh
node scripts/task-links.mjs link-run --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID" \
  --native-task "$NATIVE_TASK_ID"
node scripts/task-links.mjs show --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID"
```

When preparing a [product acceptance plan](../verification/nori-acceptance.md), set its `links.task` to the business
Task ID, `links.linear` to the matching Linear issue UUID, and `links.github` to the configured
`owner/repository#number`. Attach a recorded round from the configured private acceptance store.
Supply the linked native task ID when that specific execution produced the result.

```sh
node scripts/task-links.mjs link-report --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID" \
  --report "$REPORT_ID" --round 1 --native-task "$NATIVE_TASK_ID"
node scripts/task-links.mjs show --config "$PRIVATE_TRACKING_CONFIG" --task "$TASK_ID"
```

After a return and retest, attach the new recorded round using its round number. Older links
stay available. `show` reads the linked acceptance round and its feedback from the original
store, checks the round digest, and returns separate execution and review statuses with no
feedback text or evidence files. A missing or invalid report shows both statuses as
`unavailable`. A passing report stays `awaiting_review` until the authorized reviewer accepts.
The registry does not create issues, update their status, post comments, share reports, start
runs, or approve a round. Keep product acceptance and issue lifecycle decisions separate.

## Verify locally

```sh
node --test tests/task-links.test.mjs
```

The fixtures exercise scoped native responses, multiple sessions, restart, immutable pair
conflicts, concurrent duplicate links, private permissions, and reports with real local signed
return and acceptance receipts.

With the pinned Gateway built, run the opt-in integration from the repository root.

```sh
REIN_RUN_NATIVE_TASK_LINKS=1 node --test tests/task-links-native.test.mjs
```

This test starts an isolated loopback OpenClaw Gateway and a deterministic loopback model. It
executes two native Agent turns in distinct sessions, restarts the Gateway between turns, and
attaches both completed task/run references to a single Task through the public `tasks.get` method.
The test confirms that attachment creates no additional native runs and links the follow-up's
returned output as a private acceptance round awaiting review. It uses synthetic issue references
and makes no chat deliveries or external issue changes.
