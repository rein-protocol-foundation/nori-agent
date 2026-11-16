# Task stop, scope change and recovery controls

Updated November 16, 2026 (America/Los_Angeles). Tracking #58 / SA-M2-01–05.
Owner: Codex, runtime-verified GPT-6 Astra Medium. Local implementation and verification;
Initial implementation was local only. The owner subsequently authorized a separate commit,
PR and CI/review follow-up; merge, deployment and live operations remain unauthorized.

## Baseline and scope

The checkout initially held `87416cc` plus uncommitted PRD v0.7, planning and runtime
investigation documents. GitHub evidence and the already-fetched `origin/main` showed
PRs #87–#91 had delivered subsequent continuation fixes and scoped real acceptance.
The branch was fast-forwarded to `332cdf0`; prior tracked edits were restored from
`continuation-development-preserve-existing-docs-20261116` (stash retained). Conflicting
append-only records were combined, retaining both histories; untracked files were not removed.

[November 15 live evidence](task-continuation-live-2026-11-15.md) already proves the recorded
same-owner two-task restart, deliberate-gap supplements, corrected tool inputs, complete Flow
closure and actual merged Slack result. This task does not repeat those live operations or
infer new acceptance from merged PRs. #54 is closed under the owner's accepted Community
controls; strict whole-chain deadlines remain deferred, not a dependency of this slice.
That decision does not waive internal stop/recovery requirements.

## Changes and observable contract

The existing public native Task/Flow APIs remain the storage and execution authority.
Only `plugins/rein-acp/continuation.mjs` and its focused tests change runtime behavior.

- `stopRequested` is the durable stop-intent confirmation point. Subsequent delegation/spawn
  is refused; it is not confirmation that already-admitted work ended. A revision conflict
  cannot be reported as a saved stop. Existing attempts and all original budgets remain.
- Each accepted attempt exposes cancellation `pending`, `failed`, `confirmed`, or `not_needed`,
  timestamp and reason. A successful cancel call alone stays pending until settlement evidence
  is available. Native finalization pending is preserved; failures retain the native refusal
  or a fixed exception explanation. `not_needed` means the execution ended independently,
  possibly successfully despite the request: cancellation success is not claimed.
- Normal terminal wait observations reject explicit foreign run/receipt IDs. Existing exact
  native subagent terminal-receipt, durable-success and promoted-cancel proofs are retained.
  An ACP cancelled projection or observation timeout alone is insufficient. Terminal state
  does not establish that remote external effects were rolled back or even known.
- `status` without a flow now reconciles every authorized flow as promised by the recovery
  wake, including stop intent and deadlines, instead of merely listing stale saved state.
- A launch refused **inside** the canonical pre-launch hook, before permission returns to the
  host, releases only its exact known-unlaunched reservation under native revision checks.
  Concurrent stop/change intent is preserved. Expired prepared work is stopped on reconciliation.
  This avoids converting a proven pre-admission refusal into an unknown external outcome.
- There remains a non-atomic window **after** that hook permits launch and before the accepted
  receipt is saved. Stop in this window records intent and reports an unknown outcome until
  the receipt arrives; the accepted work is then cancelled/reconciled. Crash without a receipt
  prohibits replay. This adapter cannot promise zero execution or effects after stop intent.
- Change increments scope immediately. Old work must settle before a replacement assignment;
  its late success cannot complete the new revision. The old evidence stays in the old attempt.
- Attempt/no-progress exhaustion preserves the review's actual evidence, concrete missing work
  and effect certainty in the partial handoff, rather than replacing them with all criteria.
  Restart and increased operator defaults do not reset existing flow limits.

Deadlines remain eligibility limits plus reconciliation-triggered cancellation; wait timeouts
only bound observation. Research native timeout is capped by remaining budget; ACP has no
adapter-level hard deadline API. No timer, scheduler, history platform or vendor patch was added.
Stop/change is available when the parent processes the authorized control tool; this is not an
out-of-band interrupt of an occupied parent turn. Disabled continuation preserves M1 and retained
state but does not itself cancel work or reconcile stop intent while disabled.

## Verification

Synthetic controller/regression checks: 53 passed, zero failures/skips across
`task-continuation.test.mjs`, `slack-task-loop.test.mjs`, and `director-acp.test.mjs`.
The continuation suite now has 25 tests (10 added), covering refused/throwing/pending cancellation,
restart, late receipt/success, pre-admission stop/deadline, immutable budgets, unknown effects,
ACP timeout, foreign settlement receipts and owner/audience/session filtering. The new budget
handoff assertion initially failed because concrete gaps were overwritten; it passes after repair.

Full repository regression: 1418 passed, 4 existing conditional skips, zero failures (1422 total).
Final review also verifies that stopping a supplement cannot inherit the prior attempt’s known
effect certainty. Both the 53-test targeted run and final full-suite rerun include that guard.

Native isolated seam probe `nori-continuation-YSnloe` passed using two actual Gateway processes,
native managed Flow persistence, senderless wake, actual child linkage, follow-up and original
thread route. Its model, membership and transport are synthetic, and its controller is the
historical seam fixture: this does **not** validate the new production cancellation controller.
Both native probes initially failed to bind loopback under the sandbox (`EPERM`) and were
rerun with authorized local listener access. No external model/Slack calls were used.

The policy-disabled M1 native compatibility probe `nori-task-loop-pUfNLP` failed waiting for
`cancelled ACP report before replacement`; its evidence and logs remain in disposable local
storage. Standalone repeat `nori-task-loop-KDVHQy` passed unchanged, covering real native loader,
ordinary chat, original-thread delivery, authority denials, ACP pending/settled/failed cancellation
and actual replacement execution. Timing sensitivity remains; the first failure is not erased. The strengthened independent
report assertion was not removed or weakened. This failure is not counted as acceptance.

Reproduction (after the documented pinned toolchain/build):

```sh
.toolchain/node_modules/.bin/node --test tests/task-continuation.test.mjs tests/slack-task-loop.test.mjs tests/director-acp.test.mjs
.toolchain/node_modules/.bin/node scripts/probe-task-continuation.mjs --case=single
.toolchain/node_modules/.bin/node scripts/verify-slack-task-loop.mjs
```

## Remaining acceptance and recovery

Normal delivery retains native original-thread routing. Recovery may combine tasks only within
one authorized owner/audience, listing each task's scope, result/gaps and status. `agent_end` is
not a delivery receipt; no claim of per-thread or exactly-once delivery is added.

Selected summary retention/deletion remains unsupported: the pinned public managed Flow API
has no selected retention/delete operation, and native terminal cleanup is fixed at seven days
(`task-flow-maintenance-policy.ts`). No retention duration is selected here, and no replacement
history storage is created. Product retention choice and a supported SDK contract remain separate.

Next: separately authorize real-entry stop/change races for this new controller; monitor the
recorded intermittent native ACP report observation failure. Historical real recovery evidence remains
valid only for its recorded revision and scope. No product-wide acceptance is claimed. Local
rollback is the two runtime/test file diffs against `332cdf0`; existing Flow fields are additive
and no runtime data was migrated. Turning the policy off is not cancellation or deletion.

## Pre-PR review — November 16, 2026

The review reproduced a stale report when native settlement promoted a provisional subagent kill:
the caller overwrote the confirmed evidence with its earlier snapshot. Re-read the owner-bound
native record after settlement and require its fingerprint to match the saved proof before
reporting stopped. The new regression failed before this fix and passed afterwards; 54 focused
tests pass. Final full-suite verification: 1419 passed, 4 existing conditional skips,
zero failures (1423 total); scaffold, staged document links and diff checks pass.

The PR is based on `64d0ff1`, including the separately merged scope-planning PR #93. Only this
controller, tests, continuation documentation and task-specific tracking entries are submitted.
Community diagnostics and concurrent AI-news changes remain outside this PR. The latest scope
plan's accepted Community wording is retained; only the continuation row is advanced locally.

## CI fallback notification diagnosis

PR #94 run `43857871202` reproduced the M1 fixture timeout at the independent cancelled ACP
report assertion. Native evidence showed a `background-task` heartbeat, an exact labelled
`Background task cancelled` notice, and a late child result; the scripted model only recognized
the plugin's `subagent_announce` prompt. It therefore emitted the fixture's normal-result label.
The recorded failing model input reproduces this decoder mismatch without another Gateway run.

The synthetic decoder now also recognizes the current native cancellation notice when its run
label, current completion child session and observed native cancellation status match. Historical
notices, foreign runs/sessions/labels and plain text do not match. No runtime identity, native
record or production permission is manufactured. All existing independent delivery, canonical
cancel status, no-premature-replacement and old-scope rejection assertions remain unchanged.
55 targeted tests pass, including the new decoder regression. Native rerun
`nori-task-loop-43csHm` passes unchanged acceptance assertions; CI is tracked in PR #94; prior failed runs remain evidence rather than being silently retried away.

## Review: concurrent status before admission

The final-head review identified a second pre-admission interleaving: a concurrent all-flow status
can temporarily save launch uncertainty while authorization waits. The hook proved no launch but
restored only the attempt, leaving the Flow stuck. A regression reproduced `outcome_unknown`
instead of `prepared`. The release now restores both states and removes only the obsolete launch
uncertainty notice; concurrent stop/change intent and original budgets remain intact. Restart can
reuse the same unlaunched assignment without another attempt. The 56-test focused suite passes;
final full-suite verification also passes: 1421 passed, 4 existing conditional skips, zero
failures (1425 total). CI/review are followed on the amended PR.
