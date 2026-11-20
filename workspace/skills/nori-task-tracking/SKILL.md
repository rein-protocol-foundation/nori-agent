---
name: nori-task-tracking
description: Create or discover approved Linear/GitHub issue pairs for Nori tasks, update status and confirm native synchronization with durable recovery receipts.
---

# Linear and GitHub task tracking

Use the repository's `scripts/task-tracking.mjs` with the operator-provided **private** configuration
path. On OCI the repository is normally `/home/ubuntu/rein-agent`; verify the actual checkout first.
Do not use the synthetic example as production configuration. This skill grants no credentials,
account access, task visibility or authority. It is channel-independent.

Linear's native GitHub Issues Sync owns mirroring in both directions. Use `scripts/task-pair.mjs`
when an authorized Task needs a new source issue or an existing pair verified. Creation requires an
operator-approved exact title and body, public reference, and audience in the private config.
Run `create --config <private-config> --task <id> --apply` only for that approved task. On a delayed
or uncertain result, use `discover` with the same config and Task ID. Preserve the operation receipt.
Use `stage` to prepare a private tracking config once discovery proves the canonical Linear
attachment and GitHub issue. See `docs/task-pairing.md` for setup and recovery.

The status adapter adds source status updates, bounded readback, and durable receipts. Confirm the
actual team, project, and issue audience before working. Reuse existing issue IDs and keep private
content outside synchronized issues.

1. Read the task's goal, acceptance criteria and existing native task/run references. Simple chat
   does not require a ticket. Reuse the configured stable task ID across sessions and attempts.
2. Inspect both systems: `node scripts/task-tracking.mjs inspect --config <private-config> --task <id>`.
3. Give each authorized status change a new stable operation ID.
   `node scripts/task-tracking.mjs set --config <private-config> --task <id> --source linear --status <configured-status> --operation <unique-id> --apply`.
   `--source github` also works for unambiguous mapped states. Detailed active states are selected
   in Linear because GitHub open/closed cannot select between multiple active workflow states.
4. Report success **only** when the result is `synchronized`. `sync_pending`, `write_unknown` and
   `observation_unavailable` mean incomplete/uncertain, not done. Repeating an operation ID observes
   it without blindly replaying a write. A missing response is not evidence of failure before effect.
5. Recover with `reconcile --config <private-config> --task <id> --operation <same-id>`; it performs
   no remote writes. Only an explicitly intended retry uses `retry ... --apply`, which rechecks the
   original snapshots and refuses observed conflicts. Do not rotate operation IDs to evade pending work.
6. Link each verified native task and each recorded acceptance round with `scripts/task-links.mjs`.
   Use the same configured Task ID across authorized sessions. Check the configured pair, native
   owner and requester scope, and acceptance-store scope before attaching a link. Read linked
   execution and reviewer statuses with `task-links.mjs show`. See `docs/task-links.md`.
7. Task cancellation is separate from issue closure: use native stop controls and verify actual
   settlement. Issue state, merged code, passing tests and product acceptance are different facts.
   Use the Acceptance skill to collect review evidence; never infer a user's approval from a pass.

Nori normally acts using its own configured service accounts. A requester is not automatically the
represented principal. User-account work requires an operator-provisioned delegated configuration,
with actual account IDs, grant reference, expiration and the exact approved issue pairs. The CLI
checks token account IDs again before writes. Do not substitute a requester's token, read another
mailbox, or transfer private results into a channel just because someone asked.

Keep credentials in the configured environment/private secret store and receipts in private runtime
storage. Do not copy raw conversations, private descriptions or report artifacts into GitHub issues.
See `docs/task-tracking.md` for setup, limitations and recovery.
