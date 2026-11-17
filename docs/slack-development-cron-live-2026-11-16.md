# Development-channel Cron repair — November 16, 2026

SA-OPS-01 / #66 follow-up. Owner: Codex. **LIVE CREATION, AUTOMATIC SANDBOX EXECUTION AND THREAD DELIVERY PASSED.** No product milestone advances.

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

## November 17 deployed diagnosis and schema repair

[PR #106](https://github.com/rein-protocol-foundation/nori-agent/pull/106) passed all seven
CI checks, merged as `45e61fcfb0903f9d1d1bd1d4faf4715908540c95`, and deployed at
23:38:02 UTC. Its real-channel retest B still failed creation; the thread projection
compatibility change was not the production blocker.

A temporary passive plugin observed only host hook metadata and match booleans. Agent
and tool contexts agreed on run, session, sender, account and canonical channel, but
trusted-channel selection returned false. The native `applyJsonSchemaDefaults` pass
followed the trusted-list `$ref` to `developmentChannels.default=[]`, manufacturing an
explicit empty trusted list even when the operator omitted it. Rein correctly interprets
an explicit empty list as revocation, so documented omission/inheritance never took effect.

The source fix removes that referenced default. Rein's validator still defaults absent
lists safely. Four tests call the actual pinned native default helper and verify omitted
inheritance, explicit-empty revocation, explicit trusted-list retention and both-omitted
denial. The native authority probe passed these four cases plus its seven original authority
cases and disabled-plugin registration check; 78 targeted Node tests and scaffold passed.

For immediate production repair, the existing development channel was explicitly copied
into `trustedSlackChannels`. No channel or identity was added. This exposed a second
configuration issue after the shared-Gateway migration: native agent-to-agent policy is
**enabled for all agent pairs when omitted**. Router therefore correctly refused startup
with `rein_router_public_reachable_trusted_agent`; retest C produced an unresolved `auto`
model error while Router was unavailable, not a successful automation.

Native configuration patch validation passed before applying an explicit enabled A2A allow
list of the four existing internal agents (`main`, `nori-development`, `director-control`,
`codex`). Community retains native same-agent access and its existing tools, memory and
public backend; its tools already exclude cross-agent send/spawn. Internal cooperation is
retained, and the public-to-internal configuration path is closed. The shared Gateway was
restarted and readiness returned 200 with Router model resolution active. The temporary
diagnostic plugin was removed from all load/allow/entry configuration before this restart.

Private release backup (configuration and exact definitions of all 13 existing jobs):
`runtime/openclaw/operator-backups/development-cron-release-20261117T232433Z/` on the host.
It includes pre-diagnostic, pre-trust and pre-A2A snapshots. Restore only the fields changed
by this task if rollback is needed; do not replace live jobs or overwrite concurrent updates.

## Actual channel creation after configuration repair

[Acceptance D and its thread](https://reinprotocolf-e2q1425.slack.com/archives/C0CD97XD6CA/p1794959425852369)
created native job `ed7429fa-71b0-4205-a78c-538d7974cd86` at 23:51:26 UTC for
2026-11-17 23:54:00 UTC. The first message arrived in the service restart window;
a follow-up after readiness explicitly requested this one task, with no manual run.
The native transcript shows one successful `add` followed only by read-only `get`/`list`.
The host-authored creation stamp, owner session, account and explicit Slack thread delivery
match this actual authorized request. Session prompt metadata reports `mode=all`, sandboxed.
All 13 pre-existing job definitions still match the release snapshot exactly.

The scheduler started the job at **23:54:00.055 UTC**, without a manual request run ID,
and finished at **23:54:10.507 UTC**. Receipt `956f01ea-8e79-4910-90c9-d50e942ac547`
is `ok`; job state reports `lastDelivered=true`, `lastDeliveryStatus=delivered`, zero errors.
The isolated native run's prompt report says `mode=all`, `sandboxed=true`; its actual `exec`
output contains `37*41 = 1517`, UTC `2026-11-17 23:54:06`, user `nori-dev`, and a workspace
under `/home/nori-dev/workspaces/openclaw-ssh-workspace-…/workspace`. Slack readback confirms
the same result in the original thread. The completed one-off is retained as disabled audit
evidence (`deleteAfterRun=false`), not a recurring task.

The follow-up native scheduler fixture also passed on the manifest fix: actual native
creation/store/scheduler, two-user audit, mutation controls, public refusal, child execution,
restart and senderless default/override runs with synthetic model/Slack transport. This
supports compatibility; acceptance D above supplies the separate real-user/live inference
and delivery evidence. A local shell initially used unsupported Node 21 and one invocation
used an incorrect script filename; neither is counted as a passing check. Both corrected
invocations used the pinned Node 24.16.0 and passed.
