# Continuation repair live test — November 15, 2026

Tracking #58 / PRs #87–#90. Owner: Codex. **FINAL SCOPED LIVE ACCEPTANCE PASSED.**
Earlier failed runs are preserved below; the final run verifies complete Flow closure and actual Slack delivery.
User authorized repair, PR merge, deployment, real Slack/restart test and completion.

PR #87 merged as `e279e9105d877cb4b41f839a0348a1d145e3dbc1` after seven CI checks
passed and no unresolved review threads. OCI deployed it at 19:53:24 UTC. Temporary
continuation config passed native validation; Slack Socket ready at 19:56:45 UTC.

[One real Slack request](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794772642942609)
created both flows in `agent:main:slack:channel:c0c4l0yn814`:

| Task | Flow | First run | Automatic supplement |
| --- | --- | --- | --- |
| A: three NGO digitalization grants | cebb3037-5463-4968-8ee5-c1b371b11507 | ca163631-5499-4097-93a5-81d35cf3f66b | dc24c849-2173-4d65-8900-daf841c0457e |
| B: three free nonprofit collaboration tools | f32e4c14-57a1-437f-9668-eba48dd59cfb | 7db494cd-77f3-449d-b47d-bc8076f96287 | ffa782ba-b789-43ac-a637-2c5fd21b5347 |

B's deliberately uppercase taskName was rejected before admission, then corrected to lowercase
using the same prepared assignment and accepted. Both first attempts were running before the
19:59:05 UTC restart (PID450741 →451684). Drain expired at20:00:20; Slack reconnected20:00:49.
Without any human continue prompt, both flows confirmed native cancellation, reviewed continue
and launched attempt2. This proves same-owner concurrent restart supplement for this case.

B's supplement succeeded with real three-tool output. Final review repeatedly failed
`rein_continuation_run_not_settled`. A direct read-only native `agent.wait` returned
`status=ok`, finite `endedAt`, `stopReason=stop`, an exact-run terminalReceipt and visible
terminalReply, **alongside livenessState=working**. The old liveness gate wrongly overrode
terminal completion evidence. This test is not a final-delivery pass. An explicit
[stop request](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794773151661239)
requested cleanup; parent stop processing was delayed by repeated review failures. Both child runs ended successfully, no native active tasks remained. Original config was restored (PID453048); results and histories retained. Follow-up: 38 targeted tests pass for terminal receipt validation and existing controls. New PR and fresh live test pending.

## Second run on PR #88 — delivery observed, Flow closure mismatch

PR #88 merged as `cca4adbc5eca64c58bf86cfb0e0e57cfcda99d71`, seven CI checks passed,
OCI updated20:21:46UTC; Socket ready20:25:35.
[Fresh request](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794774374087459)
created A `50a32f95-3a3d-40f7-88b7-b2d23f528608` and B `b4e847f6-1998-4b87-a89a-6a4d15887719`
in the same channel owner. Both accepted before restart20:27:45UTC (455787→456602);
drain aborted them20:29:01 and Socket reconnected20:29:29. Without human continuation,
attempt2 runs `9de3bf92-5650-4c76-8604-100e96350e6c` (A) and
`fff52fc4-48bf-4446-89cf-c7828d977638` (B) started and succeeded.

The native terminal receipt fix worked: persisted settlement source `native_terminal_receipt`.
At20:33:14UTC the bot delivered [one combined six-item research reply](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794774794605569)
with sources, eligibility/quotas/deadlines and explicitly unknown details. Neither task was omitted.
This is actual automatic Slack delivery evidence, not inferred from agent_end.

Both final reviews supplied `outcome=complete` but nonempty `gaps` saying no unfinished items.
The controller saved a complete report but failed each Flow as limited. Full lifecycle closure
therefore still failed. Follow-up validation must reject contradictory input before consuming
review/budgets or terminalizing the Flow, allowing the model to correct the same invocation.
No semantic parsing of free-text gaps is appropriate. Original config restoration initiated
20:33:49UTC; no active child tasks remained. Existing results and histories preserved.

## Third run on PR #89 — successful drain before parent review

PR #89 merged as `7710ab62c5797c9a9c4c56a8438b0da52bce8e39` after seven green CI
checks, deployed20:47:27UTC. [Deterministic two-task request](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794775894597109)
created flows `b89670be-aa9a-48c4-a131-245def93165c` and `0cf4ddb4-fa0f-44ca-924a-14b5f788c1ed`.
Both accepted before restart20:53:11UTC (460316→460953). Unlike the prior runs, both
child turns ended succeeded during drain at20:53:21, before the new Socket connected20:53:50.
The owner recovered to review, but no settlement had been saved before shutdown. Native
agent.wait for `8cbae81f-ab07-4c46-b854-79e05172bee2` returned only status=timeout after
restart, despite canonical and managed tasks retaining succeeded+finite endedAt+no error.
Both remained review. This exposes the success-before-parent-review crash window; it is not
a passing final closure test. Explicit stop requested, no active child tasks, config restoration
initiated. Durable successful terminal authority must be checked against pinned native lifecycle
before adding a fallback; active/yielded/uncertain execution must not be treated as settled.

## Final run on PR #90 — PASS

PR #90 merged as `ca5a3849e3173d258b1656575b420c8af7808165` after seven green CI
checks and no unresolved review threads. OCI updated21:10:16UTC. Test configuration passed
native validation and Socket connected21:14:16.
[One request](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794777277481519)
created two independent flows in the same owner `agent:main:slack:channel:c0c4l0yn814`.

| Task | Flow | First run | Supplement run | Final state |
| --- | --- | --- | --- | --- |
| A: Python sum1..100 | db486993-57a5-4ec4-b44a-6b98adb0b34f | f0272a41-4ade-450c-b1b2-61ee44f8641a | cd34adba-d1fa-4960-84f3-62ec5715b61b | succeeded / complete |
| B: SHA-256 of fixed ASCII input | ff9be044-0b64-4dbe-a4d0-947dafe5ac16 | 9bf18435-aa78-4bd8-91b5-0721ef6e68ad | 5fadbecf-1539-43da-81bd-8d20a6aa4a3f | succeeded / complete |

Both accepted before the21:15:39UTC restart (464506→465054). Both sleep commands were
interrupted, so children returned missing-work evidence without computing. Their turns ended
succeeded during drain; new Socket connected21:16:15. Parent recovery used persisted
`native_succeeded_record` proof and reviewed continue, then both attempt2 calculations
ran without a human continue prompt. Final settlement source was `native_terminal_receipt`.

Transcript read-back confirmed B's uppercase handle was rejected before admission and corrected
on the same prepared assignment. A's injected `complete` plus `gaps=无未完成项` was rejected
with `rein_continuation_complete_gaps_invalid`; omission of gaps completed the same Flow.
No new Flow or extra calculation attempt was used for either parameter correction.

At21:17:42UTC, [one actual Slack bot reply](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794777462253009)
delivered both results and succeeded/complete statuses. Independently checked:
- A: `5050`.
- B: `4cef9b8e97c47726021695c5a5398eec8fd76ea8b60642a0e95da465a152bed1`
  for `nori-recovery-final-20261115` (28 ASCII bytes, no newline).

No active native tasks remained. Original configuration restored after the observation;
private backups and runtime histories remain outside the repository. No vendor modification,
DBOS, new scheduler or business-data mutation was introduced.

Scope: real same-owner multi-task restart recovery, parameter correction, bounded supplements,
complete Flow closure and observed merged Slack delivery passed. Earlier research run separately
verified actual six-item A/B content delivery. This is not an exactly-once delivery guarantee,
universal provider/crash guarantee, or completion of unsupported retention/delete scope.
