# Native continuation live observation — 2026-11-14

Tracking: #58 / PR #82 / SA-M2. Owner: Codex. **PARTIAL OBSERVATION; NOT ACCEPTED.**
The owner explicitly authorized real Slack task messages, an OCI Gateway restart and Slack read-back.
This supersedes static-only authorization for this test, not for unrelated operations.

## Setup and execution

- Observed production checkout: `87416cc7cadeacddefb9f5ec5fd94be0a46e3b2a`; working tree clean.
  Continuation source was present, but rein-acp was disabled and continuation unconfigured.
- Temporarily enabled taskLoop/continuation for existing main in private `#rein-agent-test`.
  Added only its two optional tools; preserved the development channel binding/sandbox.
  Native candidate config validation passed; original private config was backed up.
- Sent task A (three NGO digitalization grants) and task B (three nonprofit collaboration tools),
  with a 120-second initial child wait and read-only research, no outreach or business writes.
- Initial messages were sent before Socket readiness. They were later processed, rather than proven
  lost. Follow-up messages in their threads created separate owner sessions and an additional A flow.
  Therefore this run does **not** validate the planned same-owner multi-route case.
- At 19:22:01 PST, requested `systemctl restart nori-slack` under the updater maintenance lock.
  Only test-owned active task/exec records were observed. Gateway PID changed from `380355` to
  `381446` at 19:23:17 PST. Native drain timed out after about 75 seconds and interrupted work.
  Slack Socket reconnected at 19:23:45 PST. No “continue” prompt was sent during observation.

## Evidence and result

| Test state | Observation before cleanup |
| --- | --- |
| Root A, `09ecaea7-5068-4e53-9074-731860bb2f47` | Prepared; no accepted receipt. Additional flow caused by delayed original ingress plus follow-up. |
| Thread A, `ab92c194-10a0-4b80-aa01-11d8fd17c688` | Accepted run `4c51eede-71ea-43fb-a21e-e2e6f1ff0299`; after restart native status cancelled, flow phase review, no retained final report. |
| Thread B, `6a2bd27f-2f8a-4af4-9e97-baf018233d17` | Already outcome_unknown **before** the test restart; no validated accepted run receipt. Later transcript inspection: uppercase taskName rejected before launch; corrected retry blocked by continuation admission. |

At 19:24:59 PST, Nori automatically posted a combined A/B status report in B's thread:
[actual bot reply](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794713099882569).
Both requested labels were represented, so automatic status delivery was observed. Neither research
output was completed. This is not proof of arbitrary delivery reliability, same-owner coalescence,
full workflow recovery or successful research.

The bot overstated B's unknown result as “no actual execution” and attributed it to the restart;
unknown receipt does not establish either claim, and B was unknown before restart. Recovery also
attempted review without scopeRevision, producing rein_continuation_current_scope_review_required.
These are observed failures/limitations, not a passing acceptance result.

## Cleanup and next step

Explicit Slack cleanup requests persisted stop intent for all three flows. Root A reached stopped
(native failed); A remained cancellation_pending, and B remained outcome_unknown. No native
running/queued task records remained. Pending settlement was preserved, not rewritten or deleted.
Original config was restored with full parsed equality; no channel binding, sandbox, credentials,
transcripts or histories were replaced. The final restoration restart created PID `382303`.
Private config backups and detailed runtime evidence remain outside the repository.

Next: diagnose the missing B acceptance receipt and interrupted-run settlement/review handling;
correct uncertainty reporting. A future same-owner case must avoid thread-keyed follow-up ingress
and wait for verified Socket readiness before sending. No product milestone is advanced here.

## Read-only diagnosis — November 15, 2026

B's native spawn returned `Invalid taskName` for `NATIVE-RECOVERY-20261114-B`
(requirement `[a-z][a-z0-9_-]*`). The hook classified this definitive validation rejection
as `outcome_unknown`; the model's subsequent lowercase retry was blocked. This happened
before restart. A's corrected review included scopeRevision=1 but returned
`rein_continuation_run_not_settled`, despite canonical cancellation evidence. The first
missing-revision error was corrected by the model and was not the final blocker.
The contemporaneous raw waitForRun return was not retained. Source fixes and new live
evidence must be assessed separately from this failed run.
