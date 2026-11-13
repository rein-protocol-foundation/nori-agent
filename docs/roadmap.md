# Nori-Agent implementation roadmap

## #82 / SA-M2 compatibility review — November 13, 2026

Owner: Codex. Fixed unmanaged M1 change/replacement admission while continuation is enabled,
using an internal confirmed predecessor receipt and preserving managed-flow restrictions.
Static checks only; no product milestone advancement. Next: PR review/CI, no deployment.

## SA-M2-01–06 / #58 native continuation core — November 13, 2026

**CORE IMPLEMENTED / STATIC CHECKS ONLY; product acceptance open.** Owner: Codex
orchestrator / runtime-verified Sol High implementation worker. The opt-in managed Flow
controller now stores full goals/criteria, durable scope/stop intent and bounds, accepted run
links, current-owner inventory, native recovery wakes and criteria review/supplements. Same-owner,
same-audience combined replies retain every pending flow. M1 remains the default.

[Implementation and limits](task-continuation.md): native seven-day cleanup does not satisfy
SA-M2-06 selected retention/deletion; atomic launch/stop, hard ACP deadlines and exactly-once
parent delivery are not established. Static syntax/JSON/scaffold/diff checks only; no new tests,
probes, acceptance, live operations or publication. Product boxes and M3 remain unchanged.
Next: parent static review and explicit handoff of these native limitations.


## SA-M2-01–06 / #58 native seams — November 12, 2026

Owner: Codex orchestrator / verified Sol High CLI worker. **BLOCKED; PRODUCT NOT IMPLEMENTED**.
Base `1280a75` includes independently merged PR #74 (all head checks passed); native pin `4a11f89`.
[Reproducible evidence and minimal upstream contracts](task-continuation.md): actual two-process
Gateway restart, persisted managed flow, senderless native wake, fresh/active completion supplement,
canonical run linkage and original-thread delivery pass for one known synthetic owner/task.
Local-plugin keyed state is refused; two flows sharing an owner session but different threads
coalesce into one delivery route and fail the destination assertion. No workaround scheduler,
sidecar history store, vendor patch or product plugin/config/skill change was added.
61 targeted decoder/M1/ACP/#66/Router tests pass. Product cancellation/budget/retention and live
Slack/research/Codex acceptance remain untested. Retention duration remains undecided; the actual
SDK gaps, not that parameter, blocked implementation. Next: review the native storage and
per-event reply contracts, then resume #58; no M3, external publication or deployment.

## Slack task-loop functional naming — November 12, 2026

Owner: Codex orchestrator and verified Sol High worker. **IMPLEMENTED / LOCAL VERIFIED**.
Six task-loop files, decoder symbols, fixture IDs/markers/env, imports, links and the
`verify:slack-task-loop` command now use functional names. AGENTS.md records the naming rule.
PRD SA-M1-01–05 and historical evidence paths remain for traceability; no milestone advancement.
The first renamed native run (`nori-task-loop-8Q0JNO`) failed because an explicitly skipped
pre-execution tool call counted as completed in the synthetic model. The fixture now excludes
only that exact skip marker, while counting errors with uncertain effects to prevent blind retry.
Production task-control logic is unchanged. Final checks: 20 targeted tests, scaffold/diff checks,
and actual renamed native loader/Gateway run `nori-task-loop-5tplBg` passed. Earlier failed
evidence remains retained. No vendor edits, live operations or deployment. Next: review this
naming follow-up; real Slack acceptance remains separate. [Runbook](slack-task-loop.md).


## SA-M1-01–05 / #60 native task loop — November 12, 2026

Owner: Codex orchestrator, same verified Sol High CLI implementation worker. Native pin `4a11f89`.
**IMPLEMENTED / LOCAL VERIFIED; real Slack/research/Codex product acceptance pending**.
[Evidence and limits](slack-task-loop.md): native Task/Flow/session ownership, channel-independent
skill and reversible additive ACP mode, without a new engine/store. 19 targeted units and final
expanded native run `nori-m1-PzyVU6` pass: research change/stop, ACP pending/settled/failed
cancellation, actual accepted/canonical IDs, member/revocation/foreign-scope controls and original
thread delivery while ordinary chat continues. ACP task summaries and delayed canonical visibility
are explicitly handled. Full suite: 1331 pass, 2 existing skips, 0 fail; existing ACP/Cron, loader
and skill-discovery checks pass. Earlier failed runs remain documented. User-authorized publication is tracked in [PR #74](https://github.com/rein-protocol-foundation/nori-agent/pull/74).
After merging main: 1343 tests pass, 3 conditional skips, 0 fail. Automatic code review of the
implementation found no issues; current CI/review is on the PR. Next: finish checks and report;
no merge/deployment/outreach or next task. Live acceptance remains separately gated. Product checkboxes and M0/M2/M3 remain unchanged.

## SA-OBS-02 / #68 daily receipt — November 12, 2026

Coverage follow-up (Codex, 2026-11-12): **DEPLOYED / LIVE PREVIEW VERIFIED**. Audit confirmed missing
direct Qwen and isolated Nori ACP usage in the gateway-only receipt. The operator
identified the compared OpenAI dashboard spend as unrelated local OpenCode usage.
Optional all-agent/profile collection, owned ACP exports and incomplete subtotal
marking preserve native prices and delivery history. Full suite: 1368 pass / 4
conditional skips / zero failures; native integration 1/1. PR #78 CI passed and
deployed `262878681fa6`. Native backfill added 94 records; repeat skipped all 94.
Seven daily previews and integrated sender preview passed; prices unchanged.
First scheduled delivery with expanded sources remains pending. No product milestone advances.

Owner: Codex. **DEPLOYED / ENABLED; manual native run and Slack image verified.**
[PR #72](https://github.com/rein-protocol-foundation/nori-agent/pull/72) passed all CI,
merged and deployed as `831093f8bba3` on 2026-11-12 at 09:19:57 UTC.
Nori's active bot now has `files:write`; the existing credential remains valid.
The native command job is enabled for 09:00 America/Los_Angeles to #nori-alerts.
Its manual run succeeded and delivered the previous-day PNG, independently read
back from Slack. [Runbook and evidence](daily-agent-receipt.md).
Next: observe the first clock-triggered run on November 12 at 09:00 PST; it should
skip the already-sent November 11 receipt. The next new receipt is due November 13
at 09:00 PST. Clock-triggered acceptance remains pending. This receipt slice does
not complete Axiom/channel attribution, budget alerts, SA-M0-09, M0/M1 or AC01–AC20.

Pricing follow-up: **deployed / manual live verified**. [PR #73](https://github.com/rein-protocol-foundation/nori-agent/pull/73)
passed CI and deployed as `4d627691ac62`; native `alibaba-cn` mapping priced all
44 prior-day requests. The `pricing-v2` image was read back and deduplicated.

Provider layout follow-up: **deployed / manual live verified**. Owner: Codex.
[PR #75](https://github.com/rein-protocol-foundation/nori-agent/pull/75) passed CI and
deployed `33c44dc268b5`; Provider → model USD rows, icons and bottom token summaries
were visually verified in production. Slack `provider-v3` read-back and repeated-send
suppression passed; original records remain. Native ledger audit confirmed Google/
OpenAI maker-price fallback already handles subscription aliases; the unnecessary
catalog mutation failed and was fully rolled back. Next: first clock-triggered run.
No broader product milestone advances from this layout/configuration follow-up.

## SA-OPS-01 / #66 native execution — November 10, 2026

Owner Codex; America/Los_Angeles; implementation base `b36f21b3`, investigation base `ac8d766`,
native pin `4a11f89`; #61/#69 merged. **IMPLEMENTED / LOCAL VERIFIED; no product acceptance**.
[Current evidence](sa-ops-native-authority.md): native owns execution; trusted Slack creation,
owner-scoped audit, membership-only ACP and Provider/usage boundaries are implemented. Native
Cron lifecycle/restart, two-user audit, public refusal, development-subscription default/job override,
announce, and real native child spawn/senderless execution/parent result are locally exercised.
Native fallback candidates, scoped credential/network boundaries and normalized indirect public
reachability have regression tests. Run11: Node 1309/1307/0/2, 31 targeted tests, projection,
loader, ACP, scaffold and links/diff passed. Native enable's post-commit schema error remains;
store state is checked without retry. Live Slack/production, complete memory, broader child
continuation and cancellation/revocation races remain unverified. Next: final review and already
authorized parent commit/push workflow; no deployment/new Issue. M0/M1 and governance remain open.

## Super Agent roadmap — separate scope, November 9, 2026

Super Agent M0–M3 are distinct from the historical governance milestones below. [PRD v0.6](super-agent-nori-prd-en.md) and the [feature checklist](super-agent-feature-checklist.md) record the approved native-first direction: configuration → existing community integration → necessary thin adapter. M1 Slack/native research and existing ACP coding is first (#60/#66); M2 reuses native continuation/recovery (#58); M3 reuses Lobster/mail (#59), with first-release necessity pending. M0 remains an independent shared-Gateway/Discord milestone (#57), including useful Community Q/A, Qwen-first escalation/Magpie limits (#67), native memory/runtime compatibility (#54–#56) and Axiom usage/09:00 Slack reporting (#68). It is not a blanket prerequisite for internal tasks. M0 is unaccepted; source/CI evidence is distinct from product acceptance. Scope owner: project owner; implementation assignees pending. Tracker: [#65](https://github.com/rein-protocol-foundation/nori-agent/issues/65). This revision changes documents and tickets only; retention duration and M3 optionality remain open, not a reason to rebuild native platforms.

The product targets NGO/NPO and public-benefit operations across routine decisions, financial resource coordination, people management and community maintenance. The milestones below are the initial Foundation implementation, not the full product scope. Broader people workflows, policy-bound daily decisions and resource coordination require subsequent requirements and acceptance work.

Further product directions for discussion are fundraising and donor relations, program/service delivery, mission and impact evaluation, governance/compliance coordination, participation and protection of people served, and communications/partnerships. These are not scheduled milestones. Select an initial organization segment and an end-to-end workflow before expanding the delivery plan; define evidence of success and action authority for each. See the [PRD discussion](PRD-agent-community-operations.md#proposed-product-extensions-for-discussion).

The local deterministic cores for proposals, governance and a rehearsal ledger are implemented and tested. The activity, change, oversight and outbox cores are unreachable from the plugin entry and their implementation moved to a follow-up PR. The milestones below remain open as **production acceptance**: trusted identity, chat and website adapters, approved policy, provider receipts and end-to-end pilot evidence are still required. See [implementation and deployment](implementation-and-deployment-zh.md).

Final acceptance state: cases 2-10 of the ten synthetic Slack rehearsals are accepted on
synthetic development evidence, and case 1 was skipped by the owner and is not passed. The current
PR head carries the renamed interfaces with unit and loader-level validation only and has no live
Slack retest; `prod_*` tables are untouched and the production migration and release gates remain.
See the [v0.1 governance acceptance record](governance-acceptance-2026-09-28.md).

For a requirement-by-requirement status, see the [P0 acceptance matrix](p0-acceptance-matrix.md).

Discord onboarding conversation content now ships in the workspace, separately from the v0.1
governance slice: optional introductions, peer discussion, free learning resources, public in-person
events and resource contributions. A server-scoped public directory starts unconfigured, with a
synthetic example and pending conversation checks in the [onboarding guide](discord-onboarding.md).
Discord connectivity, real resource entries, search/registration/submission/reminder integrations,
persistent progress and live member acceptance remain open; these templates do not pass those gates.

The strict P0 v0.1 slice is the shorter slice in [PRD §2.3](PRD-agent-community-operations.md): Slack
identity, a simple Contributor proposal, a simple Board vote and result, and a read-only funds
snapshot. M0 is decided for the v0.1 slice (Slack, the organization's own database, simple one-person-one-vote).
M1/M2 as written below carry the deferred remainder, including zero-budget fast track, budget
allocation, competing proposals and the weighted round model; they do not block the v0.1 slice.

| Milestone | Deliverable | Acceptance |
| --- | --- | --- |
| M0: decisions and contracts | Policy decisions, runtime version, one chat platform, storage and tool contracts | v0.1 items decided (Slack, own database, one-person-one-vote); remaining §16 decisions assigned before their phase |
| M1: member to proposal | Identity linking, draft/version confirmation, evaluation and configured zero-budget path | AC01–AC04 |
| M2: facilitated evaluation | Snapshots, deterministic ballots/tally, cutoff, budget allocation and audit | AC05–AC08 |
| M3: execution | Unique spaces, scheduling, changes, cancellation and handover | AC09–AC11 |
| M4: outcomes | Evidence and consent, separate finance state, confirmed publication and corrections | AC12–AC15 |
| M5: reliable pilot | Audience permissions, durable recovery, exceptions and pause/resume | AC16–AC20 |

## P0 release evidence

- [ ] AC01–AC04: ineligible submission rejected; valid owner confirmation; policy-scoped zero-budget approval; every funded request routed to Board.
- [ ] AC05–AC08: frozen inputs; no proxy/late/ambiguous votes; configured abstention/recusal/quorum/ties; no overspend under concurrency.
- [ ] AC09–AC11: exactly one space after retries; reminders reflect actual status; cancellation/handover updates all effects.
- [ ] AC12–AC15: incremental evidence; alternatives to photos; final-version and rights confirmation; unique publication; finance statuses independent.
- [ ] AC16–AC19: private information isolation; outage recovery; accountable exception summaries; scoped pause and controlled recovery.
- [ ] AC20: end-to-end zero-budget and funded event rehearsals, including outcomes and settlement records.

P1 adds recurring communities, contributor growth, matching, feedback analysis and authorized social image/text publishing. P2 adds the second chat platform, cross-platform identity, multi-region coordination and governance evolution. No video, autonomous payments, signing, token issuance or on-chain voting in P0.

SA-OBS-02 follow-up (2026-11-13, Codex): explicit zero-usage failures for identified
models now count as $0 in receipts. DEPLOYED / LIVE PREVIEW VERIFIED: 35 tests,
scaffold/diff and PR #80 CI passed; deployed `400019cf2b01`. November 6 preview
retains cost and error count, with zero unpriced DeepSeek records; no milestone advancement.
