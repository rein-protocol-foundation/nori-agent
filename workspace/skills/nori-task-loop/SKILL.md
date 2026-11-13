---
name: nori-task-loop
description: Coordinate user-requested background research or coding through native OpenClaw tasks, with clear goals, progress, user-directed change/stop and evidence-backed delivery. Use for delegated tasks and task status/control; ordinary unrelated chat stays ordinary chat. Requires native task tools and current host authorization.
---

# Native background tasks

This channel-independent skill grants no capability or organizational authority. Use available
native tools and authenticated host context. Missing tools or authority are concrete blockers.
Keep task records and outputs in native private state and their authorized conversation, outside
shared workspace references. Never copy transcripts, member data or credentials into this skill.

## Optional durable continuation

When the host exposes `rein_continuation`, use it for new background requests instead of the
legacy flow below. The host keeps goals and limits in native managed Flows, with the same
native owner/audience and existing native child sessions. This skill is not retained task storage.

1. Call `begin` with the agreed full `goal`, `criteria` and native `runtime`. Report the returned
   flow ID, immutable deadline/attempt/no-progress bounds and queued state. Do not create a new
   flow to reset a stopped, limited or uncertain task's budgets. A new user request is distinct
   from an autonomous supplement.
2. Call `delegate` with the flow ID and a concrete `instruction`, then call native `sessions_spawn`
   once with the exact returned `task` and recorded runtime. The host reserves this assignment
   before launch, retains actual accepted run/session IDs and links available native backing.
   Research keeps `cleanup="keep"` and default completion delivery; its timeout cannot exceed
   the remaining deadline. ACP retains the configured M1 harness/cwd/arguments. Do not retry an
   absent receipt or unknown native outcome. Accepted is not complete; canonical backing can lag.
3. Finish intake promptly and handle unrelated conversation normally. On a child completion or
   restart wake, first call `status` without a flow to read the current durable owner inventory.
   Events may coalesce or omit hints; represent every pending flow, not only the last event.
   Call `status` for each flow that requires reconciliation before review or more work.
4. Check actual evidence against each flow's current full criteria and `scopeRevision`. Call
   `review` with that revision, `outcome`, concise `evidence`, remaining `gaps`, truthful
   `effects` (`none`, `confirmed`, or `unknown`) and whether evidence demonstrates `progress`.
   Complete only when the current native run succeeded and every criterion is satisfied.
   A child's success or a plausible answer alone is insufficient. Do not omit unknown eligibility.
5. If criteria are incomplete and effects are known, use `outcome="continue"` with concrete gaps.
   A ready result permits one bounded supplement through `delegate`, without another user
   reminder. This preserves the same deadline and counters. Unknown external outcomes, exhausted
   limits or pending cancellation forbid another launch. Report partial evidence and the exact gap.
6. Use `stop` or `change` on the flow for a current user instruction. Change takes the complete
   new goal/criteria, advances scope immediately, stops old work and waits for native settlement.
   Only then may the same flow become ready; old results cannot complete new scope. Limits never
   reset. A stopped terminal flow does not restart. Cancellation is not rollback: disclose performed
   and uncertain actions, native cancellation failure and unconfirmed settlement.

A combined reply may include several flows in the **same native owner/audience**, even when
captured original threads differ. Name every flow and its current scope, outcome, evidence and
remaining gaps. Never combine across accounts, channels, native sessions or private audiences.
The captured route remains a native routing preference; do not claim every original thread got
its own reply. Native parent report receipt remains pending/uncertain: success of an agent turn is
not delivery evidence. Retained pending reports may replay after restart; acknowledge possible
repetition rather than claiming exactly-once delivery.

Research timeouts are bounded at native launch. ACP deadlines are checked on native events/status
and recovery; this adapter has no timer and cannot promise hard wall-clock termination of ACP.
A launch race can leave admitted effects uncertain; wait for evidence and never respawn blindly.
Native terminal flows use upstream's fixed seven-day cleanup. Selected retention, explicit deletion
and summaries surviving native cleanup are unsupported at this pin; do not promise them or store
private history in workspace skills. Missing/expired artifacts are unavailable, not success.

The remaining sections describe legacy M1 tools when continuation is absent, and unmanaged M1
runs already in progress. Do not apply legacy replacement controls to managed continuation runs.

## Intake and delegation

For a clear request, restate its goal and completion criteria without routine reconfirmation.
Research criteria include scope and shortlist size; each entry must contain source links, mission
fit, eligibility constraints or explicitly unknown information, and suggested contact priority.
Research grants no outreach, account creation or sending permission. Clarify only material ambiguity.

Start native `sessions_spawn` in one-shot `mode="run"`; put the agreed goal and criteria in the
actual `task` string passed through native delegation. ACP Task/Flow titles are summaries;
the full criteria remain in the authorized conversation and execution input, not necessarily
in the task-status title. Research uses
`runtime="subagent"` and `cleanup="keep"`, retaining native completion announcement through the
parent and its captured reply route. Omit `completionTarget`; test the default announcement. Do not select parent-only silent delivery for this pilot.
Coding uses the existing configured ACP/Codex backend, `runtime="acp"`,
`thread=false`, `streamTo="parent"`, with the operator's existing harness/cwd and client-native
authentication. Do not copy login tokens or route coding-client auth through Magpie.

An accepted spawn returns real `runId` and `childSessionKey`, not a canonical task ID. Call
`rein_task` action `status`, task=`runId`, to resolve the native `taskId`. Report the actual IDs,
the agreed goal/criteria and accepted/queued state. Native ACP can accept a run before its task
record is visible. If that immediate lookup is unavailable, retain the actual accepted run/session
receipt and say the canonical task record is not yet available; do not fabricate a task ID, report
failure/completion, or spawn again. Resolve it on the next authorized status request or native
completion. An arbitrary unavailable ID without an accepted receipt remains unavailable. Controls
require actual owner-bound backing. Native Task/Flow owns execution, storage and cleanup;
do not create a sidecar task database, scheduler, polling service or recovery loop.

Finish the intake turn promptly. The native child runs separately; answer unrelated conversation
normally. For progress use `rein_task status` or native `subagents list` and summarize actual
native progress/results/blockers. If only running status is known, say no further progress detail
is available. A wait timeout is an observation timeout, not task failure or cancellation.

## Audience and changes

Use the host's native session and original account/channel/thread. In the opt-in trusted private
channel pilot, the native shared channel/thread audience may collaboratively read and control its
shared tasks; ownership is not sender-private. Different native sessions/channels/accounts remain
outside that scope. A sender-private request belongs in an authorized private native conversation;
never put it into a shared transcript, child prompt or shared answer. Private-channel membership
alone does not make all conversations or all member data shared. Business tools retain their own
authority checks; ordinary research/coding does not require a Foundation Contributor/Director role.

For user-requested stop, call `rein_task stop`. For a changed goal, use `rein_task change` with
the old native task/run ID and the complete new goal/criteria. The pilot uses **native cancellation
plus a fresh native delegation**, not in-place steer. It must observe native cancellation, the
cancelled task record and terminal Gateway run evidence before returning `replacementAllowed=true`.
Pending, unavailable or failed cancellation forbids replacement. Report the uncertainty and wait
for a new authorized user instruction; do not automatically retry or restart.

When replacement is allowed, use the exact returned `replacementTask`, the same native runtime,
and the existing configured harness/cwd. Report new actual IDs and the old/new scope association.
Do not reuse an old run ID, silently reset attempt limits, or count a late result from the old
scope as completion of the revised task. Cancellation is not rollback; disclose available native partial results and already performed
or uncertain external actions separately in stop/status. If a cancelled completion arrives, return an
explicitly cancelled/old-scope report to its captured destination without launching or retrying work.
Native cancellation may suppress its usual announcement; do not promise a later report in that case. This skill adds no automatic restart recovery or autonomous
follow-up workflow.

## Review and delivery

When the native child returns, match its actual identity and scope to the task before reviewing.
Check the current agreed criteria. Deliver through the original authorized parent conversation
and thread, preserving its audience; do not redirect to the latest unrelated chat, DM or public
channel. A child's success does not establish task completion by itself.

For a shortlist, include the requested number of candidates or explain a specific limit; give
sources, fit, eligibility/unknowns and priority for every entry. Label synthetic fixtures and
unverified claims explicitly. Report completed, blocked, limited, failed and cancelled outcomes
accurately. Missing eligibility may be explicitly unknown in this pilot; do not claim automatic
follow-up acceptance. Coding reports actual changes, checks/results and unresolved issues;
completion, PR creation, merge and deployment remain distinct events.
