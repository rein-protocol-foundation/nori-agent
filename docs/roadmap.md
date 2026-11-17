# Nori-Agent implementation roadmap

## NORI-AI-NEWS bilingual and formatting correction — November 16, 2026

Owner Codex. **LIVE VERIFIED; PR ROLLOUT PENDING**. User requests Chinese and English editions in the same
Slack/Discord channels, without pagination and with concise local issuance timestamps.
Original 14 Chinese messages corrected in place; original delivery ledgers retained.
SchemaVersion 2 pairs both languages per event and preserves legacy receipt verification.
English supplements require exact original Chinese content/routes and complete receipts.
39 focused tests, scaffold, whitespace and 60 native fallback checks pass. Existing native
jobs now use the bilingual prompt. All 20 English supplement receipts confirmed; repeated
publication creates no duplicates. API readback matches all 34 messages; native clients show
rendered cards and concise times. Next: PR/CI/rollout verification. [Runbook and evidence](ai-news.md). No unrelated milestone advanced.


## 任务摘要无期限保留与真实任务验收 — 2026-11-16

用户选择服务器摘要无期限保留、默认不删除，Slack原文保留。可选摘要薄适配已实现并本地验证；
仅新任务opt-in，公开native SQLite worker、自有私有库、当前owner/audience授权、分页、重启、
删除副本及防复活tombstone。1436 tests pass / 4 existing skips；70 focused pass；真实loader通过。
原生七天cleanup仅fixture模拟，真实保留/删除尚待Slack验收，不推进产品完成。
任务控制PR #94已合并并部署66700d0；研究交付/后台聊天/实际进度已观察，勘误已补充。
真实编码产物独立13测试通过，但ACP两次blocked，完整自主验收未通过；配置与沙箱修复待批准。
详见[摘要契约](task-summary-retention.md)与[真实验收记录](task-lifecycle-live-2026-11-16.md)。
负责人Codex；下一步完成实际入口验证。


## Task stop/change and recovery follow-up — November 16, 2026

#58 / SA-M2-01–05; owner Codex (runtime-verified Astra Medium).
**IMPLEMENTED / LOCAL VERIFIED; new live race acceptance pending.** Reconciled the stale checkout
with `332cdf0` and retained prior PRD/planning/runtime edits. #87–#91 already establish scoped live
restart/supplement/merged-delivery acceptance; do not redo that development. New changes preserve
explicit cancellation outcomes, release known-unlaunched reservations, reconcile all-owner status,
reject foreign settlement receipts and retain concrete gaps on budget exhaustion.
[Contract, failures and checks](task-continuation-controls.md): 53 targeted checks pass; full suite
1418 pass / 4 conditional skips / 0 failures on the final version. Native two-process seam
passes; policy-disabled M1 probe failed its ACP report wait once and passed standalone unchanged.
No new deployment/live acceptance. Retention/delete and ACP hard deadline remain unsupported;
#54's accepted Community scope does not waive internal controls. Next: authorized real-entry
stop/change acceptance; product retention/SDK decision separately. Existing unrelated work retained.

## NORI-AI-NEWS — November 16, 2026

Owner: Codex. **ENABLED / FIRST SCHEDULED DELIVERY VERIFIED**. Nine public feeds and
native daily 09:00 / Monday 09:15 jobs (America/Los_Angeles). On November 16 the daily
job started at 09:00:00.020 and sent nine stories as three messages per platform by
09:03:21; the 09:15 weekly run reused all eight original receipts without re-sending.
Slack desktop and Discord browser rendering verified, together with both native channel
payloads. Nine original-link buttons and no exposed Markdown or duplicate bodies observed.
28 focused Python and eight CI-scope tests pass; Python news tests now run in scaffold CI.
First interrupted weekly rehearsal is retained as failed evidence. No private runtime data or
unrelated shared-worktree changes included. [Exact evidence and recovery](ai-news.md).
Repository rollout: [PR #96](https://github.com/rein-protocol-foundation/nori-agent/pull/96).
Recovery: retain the native jobs and per-edition receipts across deployments.
No unrelated product milestone advanced.

## Partnership production follow-up — November 16, 2026

SA-M3-01–05 / #59; Codex. Live draft preview passed after configuration activation; native
Slack lowercase command identities require a boundary fix. 22 focused tests pass. Actual
approval/send/delivery evidence pending deployment; no broader milestone advanced.

## 2026-11-15 — Community runtime ticket accepted and closed

#54 / SA-M0-06; scope owner: project owner; record owner: Codex.
**COMPLETED under the owner-confirmed current scope.** The owner accepts existing
OpenClaw time controls and Rein admission/concurrency/daily-request budgets as
sufficient for Community. Concurrent Community subagent calls are not required.
Strict whole-chain deadlines, uncooperative-tool settlement guarantees and full
Gateway cancellation/reload/restart verification are deferred enhancements, not
completion gates for this ticket. Earlier BLOCKED entries are historical and
superseded for ticket status; their technical evidence remains valid.
GitHub #54 was updated with a scope note and closed as completed. No new runtime
implementation, deployment or live acceptance is claimed; other migration/privacy
gates remain unchanged. Existing evidence: 20/20 admission/routing regressions and
native diagnostic passed in the prior investigation. Next: no further implementation
for this scope; revisit only if stricter execution or concurrent child work is needed.

### Community runtime limits — November 14, 2026

#54 / SA-M0-06; owner Codex; **BLOCKED, native gaps reproduced locally**.
[Native inventory and reproduction](community-runtime-limits.md) on `4a11f89e`:
Community-only run timeout/concurrency configuration rejected; native timeout queue
can admit a successor before held work settles. Existing admission/routing 20/20
passed. No product milestone advanced. Model/tool/fallback deadline integration,
Gateway reload/restart and live acceptance remain pending. Next: review the narrow
host-owned deadline and actual-settlement lease contract; retain #52 admission/budgets.

## #58 scoped live acceptance — November 15, 2026

Owner: Codex / Sol High. PASS: real same-owner two-task OCI restart, automatic supplements, recoverable invalid parameters, succeeded/complete closure and actual merged Slack delivery. PRs #87–#90 merged; final tested code ca5a384. Configuration restored; no active tasks. [Evidence](task-continuation-live-2026-11-15.md). Native delivery/retention limits remain; no broader product milestone implied.

## #58 successful-drain recovery — November 15, 2026

Owner: Codex. PR #89 live test exposed successful child completion before parent review/restart, leaving wait cache absent. Native successful terminal authority verified; narrow durable-success fallback and closure retest in progress. Earlier cancelled-run supplements and actual research delivery remain verified.

## #58 delivery observed; closure correction — November 15, 2026

Owner: Codex. Two-task restart and actual merged Slack delivery VERIFIED on #88. Flow closure still needs correcting invalid complete/gaps input.40 focused tests pass; final closure retest pending. [Evidence](task-continuation-live-2026-11-15.md).

## #58 final-review follow-up — November 15, 2026

Owner: Codex. PR #87 deployed: two-task restart supplement VERIFIED live; final delivery NOT ACCEPTED. Follow-up repairs successful terminal receipts accompanied by stale working liveness. [Evidence and next test](task-continuation-live-2026-11-15.md).

## #58 restart repair — November 15, 2026

Owner: Codex / Sol High. IN PROGRESS: invalid-handle recovery, durable cancellation settlement and managed completion review. 29 focused checks and aggregate 1401 repository cases pass (4 skips, dependency repaired); PR #87 merge and Slack/OCI restart acceptance pending; previous failed observation retained. See [live evidence](task-continuation-live-2026-11-14.md).

## NORI-BRANDING / Slack reply coverage — November 14, 2026

Owner: Codex. Configuration-only live fix: all 17 visible active Slack channels are
allowlisted; only the missing deployment channel was added. Router/host-guard naming
updated locally; native denial branding remains blocked on an upstream presentation
API. No product milestone advancement. [Scope and next steps](nori-branding.md).




## Current plan — November 15, 2026

Owner: product owner (scope), Codex (documentation); implementation owners pending.
**SCOPE UPDATED; NO NEW PRODUCT ACCEPTANCE.** [Remaining development and acceptance](super-agent-delivery-plan.md)
is the current task order and acceptance contract under [PRD v0.7](super-agent-nori-prd-en.md).
Use OpenClaw native/community tools; preserve delivered task, mail and Rein internal capabilities.
Complete general coordination and an isolated development-to-acceptance exercise before Nori-led
internal business-tool expansion. Optional mail is not a core completion gate. Community rollout,
shared-Gateway migration and operations remain separately tracked with their existing gates.
The November 15 owner decision accepts existing Community runtime controls (#54); stricter
whole-chain limits are deferred. Preserve the separate uncommitted investigation evidence. Retention and other recorded
native limitations remain open. Earlier dated next-step statements below are historical, not current
sequencing. Local documents only; remote tickets remain unsynchronized.


## Slack reaction permission maintenance / #77 / C02 support — November 13, 2026

Owner: Codex. **LIVE API VERIFIED; configuration-only**. Existing Nori reauthorized with only
`reactions:write` added. Reproduced `missing_scope` before repair; same deployed credential then
passed add/read-back/remove/cleanup on an existing message. No restart or deployment.
Automatic acknowledgement/model-selected reaction acceptance remains untested; observe the next
normal mention. No milestone advancement. [Evidence](implementation-and-deployment.md).


## PR #83 CI compatibility follow-up — November 13, 2026

SA-M1-01–05 / #60; owner Codex. Prompt-before-admission cancellation guard corrected;
21 targeted tests and full suite 1393 pass / 4 skips / 0 failures. Native probes
`bQmAto` / `VDTCWA` pass; latest-head CI/review pending; no product milestone advancement. [Dated evidence](implementation-and-deployment.md).

## SA-M3-01–05 / #59 — November 13, 2026

Owner: Codex Astra Medium with verified Sol High implementation. **IMPLEMENTED / LOCAL VERIFIED;
product acceptance pending**. [Runbook, failures and evidence](partnership-workflow.md): optional
fixed Lobster workflow, exact native preview, host-bound human Slack approval, designated test
recipients, durable send claim and read-only receipt reconciliation. Native checkpoint/template
survives actual Gateway restart; stale/duplicate/cancelled/unauthorized decisions do not send.
21 targeted tests pass; full suite 1390 passed / 4 conditional skips / 0 failed; actual pinned
loader/ingress/command/restart fixture `nori-partnership-qS7WYp` passes with synthetic transports.
M1 PR #74 is merged. M2 #58 is owner-closed but its final delivery evidence remains unverified;
separate uncommitted M2 work was preserved. No M1/M2 live acceptance is inferred. Next: review
local source and separately authorize deployed-profile/live Slack/designated-test-recipient
acceptance. No publication, merge, deployment or real send; M0 and AC01–AC20 unchanged.
## #58 live observation — November 14, 2026

Owner: Codex. PARTIAL / NOT ACCEPTED: authorized Slack/OCI restart produced an automatic
A/B status reply, but B launch was unknown, A interrupted and same-owner coverage was invalidated
by thread follow-ups. Stop intents saved and original config restored. Next: diagnose launch,
settlement and uncertainty reporting before another scoped test. [Evidence](task-continuation-live-2026-11-14.md).

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

For a requirement-by-requirement status, see the [acceptance evidence](acceptance-evidence.md).

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

## Documentation auto-pull — November 14, 2026

Task DOCS-AUTO-PULL; owner Codex. IMPLEMENTED / local verification; installed-controller
rollout pending. Known non-runtime docs fast-forward without build/restart/report; full
current-to-target diff keeps code, workspace policies and skills on the deployment path.
Source-sync journal preserves recovery and build-cache continuity. Configuration/maintenance
work only; no product milestone advancement. [Runbook](auto-update-zh.md#纯文档自动拉取).
