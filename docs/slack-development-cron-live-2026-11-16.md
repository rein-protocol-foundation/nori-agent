# Development-channel Cron repair — November 16, 2026

SA-OPS-01 / #66 follow-up. Owner: Codex. **CONFIGURATION APPLIED; LIVE CREATION
STILL BLOCKED; COMPATIBILITY PATCH LOCAL VERIFIED.** No product milestone advances.

The operator authorized live configuration repair, preservation of sandbox isolation,
and an actual Slack creation → clock-triggered execution → delivery acceptance test.
On November 17, the operator also authorized committing, merging and deploying the
minimal source patch, followed by the actual scheduled-run and thread-delivery acceptance.

## Live configuration and recovery

Inspected production revision `9ed4cb29bc77120242cd500b7e7353118edbfdf1`, native
OpenClaw `4a11f89e840b2bb3eedcad2820ab25b8520905b6`. The updater was idle with no
transaction. Under its deployment lock, saved private configuration and existing-job
snapshots in:

`/home/ubuntu/rein-agent/runtime/openclaw/operator-backups/development-cron-20261117T014106Z/`

Native `config patch --dry-run --json` passed schema and secret-reference resolution.
Applied exactly three fields, retaining existing array entries:

- `agents.entries.nori-development.tools.allow`: add `automations`.
- `agents.entries.nori-development.tools.sandbox.tools.alsoAllow`: add `automations`.
- `commands.ownerAllowFrom`: explicitly authorize the existing approved Slack administrator.

The native owner grant is a Gateway owner permission, not a channel-local ACL; the
Router still requires the configured private Slack channel, approved agent, and current
membership for creation. Other channel bindings and tool policies were not widened.
No additional provider route was necessary: the existing unrestricted `general` default
is eligible for native background work.

Hot reload applied at **17:41:23 PST**; the service PID remained unchanged. An exact
configuration comparison (excluding native write metadata) found only these three
changes. Native `sandbox explain` confirmed `mode=all`, SSH backend, sandboxed sessions,
and elevated execution disabled. Sandbox execution host, filesystem workspace restriction,
SSH identity, host-key checks, and session scope were preserved.

Rollback: under the updater lock, compare current configuration against this snapshot,
then restore only these three fields through native configuration operations. Do not
overwrite later unrelated changes or restore the job snapshot into the live database.
The backup contains private configuration and must remain outside the repository.

## Real-channel result

[Acceptance request and failure reply](https://reinprotocolf-e2q1425.slack.com/archives/C0CD97XD6CA/p1794879703230019)
were sent/read through the Slack connector using the operator's actual account.
The request asked for one native isolated task, approximately two minutes later, to
compute `23 * 29` inside the SSH sandbox and return execution evidence to the thread.
It expressly excluded manual `run` and unrelated work.

The session's persisted tool inventory includes `automations`; the scheduler reports
enabled. The first add and subsequent agent diagnostic variants were refused by the
Router's trusted-creation gate. **No successful job ID, timed execution, or delivery was
established.** Do not count the model's diagnostic attempts as successful acceptance.
Read-only Slack API checks separately confirmed the expected bot/workspace, private
channel identity, bot membership, and current requester membership.

## Local compatibility repair and checks

The pinned native `buildAgentHookContextChannelFields` projects a threaded session to
`<lowercase-channel-id>:thread:<timestamp>`, while the original Router gate accepts only
the uppercase transport channel ID or its `channel:` form. A local probe with the actual
session shape reproduces this representation mismatch. The failed live gate did not
emit per-predicate diagnostics; successful deployment/retest must establish whether
this repair fully resolves the live rejection.

The bounded patch to `plugins/rein-router/cron-ingress.mjs` additionally recognizes the
native projection only when its base session belongs to the same observed Slack channel
and agent and its exact Slack thread suffix matches. It retains the host-observed
run/session/requester/account checks and fresh live membership check. Session strings
alone grant no authority; no vendor, scheduler, store, model, or sandbox replacement.

Verification:

- 41 targeted routing/creation/model-input tests passed. New cases cover threaded compact
  calls, different channel/thread/user/account/run, missing or ended observed runs, revoked
  membership, and mismatched/invalid source-session shapes.
- Complete Node suite: **1427 tests, 1423 passed, 4 existing conditional skips, 0 failed**.
- Native threaded Cron fixture passed actual tool creation/update/declaration/disable/
  enable/remove, two creators, unauthorized/public refusals, a real child, Gateway restart,
  and two automatic senderless executions with synthetic Slack/model transport. Its observed
  tool-call channel projection remains the transport form, so the normalized projection
  is covered separately by the native-helper probe and boundary regression tests.
- Scaffold and scoped whitespace checks passed. No production suite was run.

Private local native evidence: `/var/folders/wg/2v96p0b11nvd57tglhqxrjbw0000gp/T/sa-ops-cron-oCsuW1/`.
The full Node test log is `/tmp/nori-development-cron-node-tests.log`.
No raw production transcript, credential, member record, or usage log is included here.

Next: release the now-authorized minimal Router source patch through the normal PR/merge
deployment workflow; then repeat the real-channel test, inspect the native creation audit,
wait for the scheduler without `cron.run`, verify sandbox execution and original-thread
delivery, and confirm existing tasks remain intact. Live acceptance remains open.
