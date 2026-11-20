# Nori-Agent development, verification and deployment record

## 2026-11-19 · US14 observability · Slack acknowledgement deadline

Operations owner: Nori maintenance. Installed the optional gateway observer and independent systemd exporter on OCI. The gateway reported observer startup, the exporter started, and Axiom reported that monitor `eWp4aVfHFuP1lqLpYg` was updated. Each missed Slack 👀 deadline now has its own group. The shared monitor retains its five-minute schedule and 120-second ingestion delay. Functional tests and incident delivery exercises were skipped at the operator’s request. The host config backup is `/var/backups/nori-slack-acknowledgements/20261120T005537Z`. See the [event contract and rollback](slack-acknowledgement-alert.md).

## 2026-11-20 UTC — Lark community and internal routing

Owner Codex. `configureLarkRouting()` builds a candidate from the existing shared Slack and Discord Gateway and Router Console settings. It takes two distinct Lark applications, disjoint group allowlists, and an app-specific internal administrator identity. Both accounts accept explicit group mentions. The candidate isolates conversations by group and sender and disables gateway chat history and Lark document tools. Community uses its existing metered subscription policy. The internal Lark app was published and OCI received an administrator test mention. Shared Gateway configuration and same-group replies are pending [live verification](acceptance-evidence.md#2026-11-20-utc--lark-routing).

## 2026-11-20 UTC — SA2 Slack acknowledgement

Owner Codex. The live five-message context check passed on `fcf0b69`. A positive Jev decision now starts the native Slack acknowledgement for the admitted message before worker routing under the default group-mention policy. The worker continues while Slack processes the request. PR #142 deployed as `0bdc8be`. Tempest confirmed the reaction in production. The gateway write and Slack readback matched the original message. [Evidence](acceptance-evidence.md)

## 2026-11-19 · Slack participation context

SA2, Codex. The participation classifier now uses up to five native, authorized prior messages and records the count without message text. Two previously missed production inputs passed hosted replay. Confirm the context count on the next natural event after deployment.

## 2026-11-20 UTC — SA-M1 / SA-M2 — Slack development review and queued requests

Owner Codex. Production was running f776627 when the stalled follow-up was inspected. The repair pins ACP lifecycle checks to the previously bound Task ID, distinguishes a managed ACP announcement from the owning review wake, and preserves native yield for a currently authorized human in the development channel. Queued turns can identify the exact configured peer through the host’s thread-qualified channel field. The sender, account, session and membership checks remain in force. All seven PR checks passed. The standard updater deployed `227e8a7` at 03:15:46 UTC. In the original private Slack thread, both Codex runs completed autonomous parent review and both retained summaries were read back with no expiry. Explicit deletion cleared three existing copies. Reconciliation preserved the tombstones. Independent comparisons preserved all 31 earlier messages, ten project files, four review files and six native tasks. Both projects passed their post-deletion tests (13 and 10). The previous failed follow-up still has no retained copy. No runtime configuration change was necessary. [Acceptance evidence](acceptance-evidence.md) · [Release PR #139](https://github.com/rein-protocol-foundation/nori-agent/pull/139).

## 2026-11-19 · Super Agent v2 Slack activation

Production Slack activation on November 19 (Pacific time). The existing Nori installation now accepts unmentioned requests in `#nori-development` with its existing channel user rules and main agent binding. Only this room was added to the participation policy. Runtime plugin inspection showed the reply-dispatch hook and the production gateway reported ready. No acceptance message was sent to the business channel during this activation. In `#rein-agent-test`, the same production bot read a newly uploaded text attachment and returned the verification word from the file in its original thread. For the synthetic #131 pair, mismatched account and team checks rejected the request after two and four successful provider reads respectively. An unapproved audience was rejected before network access. All three checks made zero remote writes. The requester waived independent human acceptance. The previous chat approval for github-reopen stands. Private observations and the production rollback configuration are retained on OCI.

## 2026-11-19 — Super Agent v2 integration and partial product verification

An OCI replay exercised five recorded Slack inputs and one duplicate concurrently. Four hosted Jev calls succeeded. The candidate suppressed the fifth input at capacity and rejected the duplicate. A 100 ms deadline returned silence after one call. With paid inference disabled, the same help request returned silence with zero calls. These were isolated replays without outbound Slack delivery.

A Slack CLI test sender initially received a generic error for `/status`. With its identity explicitly scoped to the test room and native commands, Slack returned the native status table. The sender selected `bailian-token-plan/auto` for that thread, verified the model with a second status read, and restored the default. The temporary grants were removed. A passive app-attributed message produced zero classifier calls and no candidate reply. The OCI executor retained the initial error and successful follow-up in separate private reports for Tempest.

The independent test gateway delivered an unmentioned help reply and a useful out-of-duty clarification. It silenced chatter. An admitted worker emitted NO_REPLY after enabling native optional silence for Slack groups. The default had emitted a visible error. Native threaded send/edit, scoped Linear delegation on #131 and delayed revocation were verified. The staging Foundation administrator flag was true for the verified sender and false in production. The #124 public summary was found in Linear after Markdown normalization.

Tempest returned only `github-reopen` for retest and accepted the observed result in chat. After GitHub #123 reopened, Linear REI-17 retained Backlog and the adapter reported synchronized. The adapter wrote only to GitHub. The first-round passes for `linear-close` and `github-recovery` were carried forward without rerunning either check. The private OCI readback records the retest. This closes the three issue-sync checks; the formal reviewer receipt and overall v2 acceptance remain open.

Merged current main through #129. The integrated regression completed with 1,640 passes, four opt-in skips and zero failures. The OCI gateway completed two owner-verified native runs for the same real issue pair, #124 / REI-18. The dedicated Socket Mode app joined the private test room and the candidate gateway connected. [Implementation PR](https://github.com/rein-protocol-foundation/nori-agent/pull/130).

SA2, owner Codex. Developed on an isolated branch and integrated upstream scheduler PR #121. Added task tracking and private run/report linkage, independent offline acceptance, scoped Slack participation and replay. Real Linear/GitHub verification exposed an incorrect detailed expectation on reopen. The corrected coarse projection passed. OCI produced private reports with separate OS principals for execution and review. The authorized Slack desktop account was a current Director without website administrator authority. New routing was measured in isolation. Production deployment and the positive administrator path remain open. [Checks, observations, rollback and pending work](super-agent-v2-verification.md).

## 2026-11-19 — Firecrawl enabled for OCI web search

Codex switched the shared Gateway default from `parallel-free` to `firecrawl`. The
plugin reads its key through an OpenClaw file SecretRef in the preserved private runtime.
The main agent's `web_search` returned two results for an IETF query and identified
Firecrawl as the provider. Community listed Firecrawl as available, configured and
selected. Both agents passed authenticated Gateway health checks. The standalone
Community tool probe was blocked by its active-request policy and triggered the first
rollback. Verification used the shared Gateway without sending a Discord message.
During restart, the Gateway logged an interrupted cron run associated with Slack.

## 2026-11-19 — Discord welcome and reminder copy

COMMUNITY-ONBOARDING-01; owner Codex. Local copy update verified by 37 focused tests.
Both messages invite members to introduce themselves with what they go by and a
little about themselves. The Sunday invitation explains how to skip future reminders.
Production rollout is pending. After release, review the next eligible scheduled message.

## 2026-11-19 — Development ACP report handoff

SA-M1 / SA-M2, owner Codex. Locally verified. Each new development ACP assignment
has one designated UTF-8 review file in the configured harness directory. An
authorized parent reads up to 64 KiB through `rein_continuation read_review_file`
using the Flow ID and scope revision. The gateway account must be able to read
that file. The response identifies the exact bytes with a SHA-256 digest.
Previously created assignments have no designated file. A native blocked result
now wakes the parent for review even when the harness exited normally. The
original incident Flow was inspected read-only. All seven release checks passed.
OCI deployed `f19900a` and reconnected to Slack at 01:02 UTC on November 20.
One live GTM request verified parent readback, an original-thread reply and
retained Flow completion without a reminder. [Verification record](acceptance-evidence.md#development-acp-text-review).

The operator authorized read/write access for all tasks running as the SSH account
`nori-dev` across the shared ACP workspace. On OCI, named and default POSIX ACLs
were applied after a private permissions snapshot. All 77 files and 42 directories
were accessible. Through the configured SSH connection, the worker read the original
report and modified and created files in a new harness-owned directory. The gateway
read both files. Default ACLs follow the creation mode requested by the writer.
The gateway also recovered after restoring workspace traversal for its service group.

## 2026-11-18 — Discord daily archive deployed

COMMUNITY-ONBOARDING-01; owner Codex. PR #117 passed CI and deployed `faaa9d0` at
2026-11-19 07:19 UTC. Configuration activation used the updater lock, retained private
rollback snapshots, preserved existing DM/identity/search/skills/router/sandbox settings
and all 14 prior Cron definitions. Gateway health and the actual new plugin load passed.
Initial historical collection recorded one contribution and sent nothing. The new daily
UTC16 job is enabled in **archive-only mode**: Nori lacks Send Messages in welcome and
Manage Roles/Channels. The user has been asked to grant only that channel permission.
No privilege grant, test-channel message, or production reminder was sent.
Next: verify permission, enable the existing job's delivery branches, and observe actual
daily/Sunday receipts and human recognition. A local follow-up fixes opt-out/resume
controls being mistaken for completed introductions; 37 focused tests pass.
[Evidence and rollback](daily-discord-onboarding.md).

## 2026-11-18 — Daily Discord onboarding prepared

COMMUNITY-ONBOARDING-01; owner Codex with a runtime-verified Sol High worker for the
collector/store. **Local verified, live activation pending.** Added deterministic
UTC16 native-job runner, durable original-message archive, recovery/receipt handling,
optional current-member recall tool and pure additive configuration builders. Preserved
all pre-existing changes and vendor source. 25 new focused checks, 34 compatibility
checks, scaffold and native plugin loading passed. Full suite and live sends/archival/
scheduled-run/recognition acceptance were not run. No configuration or schedule changed
on production. Pending: user channel choice, deployment coordination and native operator
activation, then real acceptance. Verified backend identity binding remains separate;
cross-platform profile joining is future work. [Details](daily-discord-onboarding.md).


## 2026-11-18 — Discord member onboarding access

SA-M0 / #57; owner Codex; **requested restoration passed real acceptance**. PR #113 deployed
`cbb76c9`; #115 clarified pending email status and deployed `0e7a0f2`. Open DMs, current-member
self-check, email binding, resource queries, public web search/fetch and shared job-matching skill
were exercised in real Discord. The test account was unlinked, rebound through its actual received
email, and verified against the original member. Final restart preserved all compared histories and
main/Slack settings; real Slack task/summary reads passed. Event search was empty and detail tested
not_found, so positive event-detail acceptance remains unproven. No vendor changes or broader
roadmap completion claimed. [Evidence, boundaries and recovery](discord-onboarding-access-2026-11-18.md).

## 2026-11-18: ACP settlement capture (first live acceptance passed)

SA-M1/SA-M2; owner Codex. PR #111 passed seven CI checks (1496 plugin passes, four existing skips)
and deployed b944c4c. One actual ACP run persisted native_acp_lifecycle evidence before parent
review. The receipt survived the 05:38 UTC shared Gateway restart; the parent independently
passed 23 tests and reviewed complete. Maintenance repeated 23 passes in the existing sandbox.
The server summary is retained with expiresAt null; original histories and 45 private files remain.
A bounded one-recomputation follow-up for parent/observer CAS races is awaiting release verification.
Historical proof remains unavailable and crash atomicity requires an upstream durable receipt;
this does not complete the full PRD. [Evidence and limits](acp-settlement-recovery-2026-11-18.md).


## 2026-11-17: formal task release and autonomous coding acceptance

SA-M1/SA-M2/SA-M2-06; owner Codex. PR #98 candidate a56081a passed all seven CI checks
(1486 plugin tests passed, four existing skips), merged as 2aed6422 and deployed healthy.
rein-acp now loads from the standard source path. Shared Gateway topology and both agents'
authority remain intact; all baseline history rows for five agents and 82 private files were preserved.
Nori implemented --min-count through one new ACP run with failing tests first, implementation,
parent review and 23 passing tests independently repeated by maintenance. Native settlement,
complete review, indefinite summary readback, cross-owner denial and absent-artifact handling passed.
The old ACP run still lacks durable settlement; no full-PRD completion claim is made.
[Evidence, failed calls and restart record](task-lifecycle-closeout-2026-11-17.md).


## Development-channel Cron repair — November 17, 2026

SA-OPS-01 / #66 follow-up; owner Codex. **LIVE ACCEPTANCE PASSED; SCHEMA DEFAULT REGRESSION CORRECTED.**
PR #106 merged/deployed after seven green checks. Its thread compatibility fix alone did not
resolve production: native schema defaults manufactured an empty trusted-channel list, and
shared-Gateway A2A defaults allowed public-to-internal reachability. Explicit existing-channel
trust and internal-only A2A configuration restored Router while preserving sandbox isolation.
Actual Slack creation, clock-triggered SSH execution (37 × 41 = 1517), and original-thread
announce passed at 23:54 UTC; all 13 existing task definitions were unchanged. The one-line
manifest correction now has native default-loader and scheduler regression coverage, plus
78 focused Node passes and scaffold checks. No product milestone advancement.
[Evidence, failed attempts, actual receipts and rollback](slack-development-cron-live-2026-11-16.md).

Final release: PR #107 passed all seven checks and deployed `d5cb3d3a` at 00:22:05 UTC
on November 18 (November 17 PST). The same job ran automatically again at 00:25:15 UTC
and delivered 1517 to the original thread. A native update/get output-schema warning for
`state.scheduleErrorCount` remains a separate upstream limitation; persisted update and
both scheduled executions/deliveries were independently verified. See the linked evidence.


## 2026-11-17 — Shared Gateway migration completed

SA-M0 / #57; owner Codex; **LIVE ACCEPTANCE PASSED**. PR #103 passed all seven CI checks and
merged/deployed as `496b9d30eaa1`. One Gateway now serves Slack and Discord, and the authenticated
Dashboard has one “打开 Nori” entry. All original Slack rows/configuration, four existing agent roles,
12 original Cron definitions and SEO files were preserved; all 4,990 old Discord profile files remain.
Real Slack tool/retained-summary checks and Discord resource/reset/restart/private-memory/public-scope
checks passed. The standalone Discord service is disabled and automatic updates resumed.
[Full evidence, limitations and recovery](shared-gateway-acceptance-2026-11-17.md).
This supersedes earlier pending/hold entries below and completes this cutover scope, not the full roadmap.

## 2026-11-17 — Shared Gateway cutover resumed

SA-M0 / #57; owner Codex. The owner lifted the migration hold and authorized deployment,
restarts and real Slack/Discord acceptance. The other deployment chat released its window.
All Slack state/capabilities must remain; Community starts with a fresh agent database while
retaining the old Discord profile and local files for recovery. PR #101 is deployed, but its
single-entry UI still requires the actual topology/configuration cutover.

Native rehearsal exposed legacy Slack governance fields in the standalone Discord backend config.
The candidate now creates a Discord-only query/identity profile without governance channels or
signing-key dependency. Community registration skips governance initialization; internal profiles
retain strict validation and existing tool registration. Focused profile/config/router tests:
18 passed; scaffold and native candidate schema validation passed. Live cutover and acceptance
remain pending; this entry does not claim production completion. Next: reviewed source delivery,
locked backup/cutover, data-preservation checks and actual channel/Dashboard verification.

## NORI-SEO-DATA — November 17, 2026

Owner: Codex. **LIVE CONNECTED / SCHEDULED; both native rehearsals verified.**
[PR #102](https://github.com/rein-protocol-foundation/nori-agent/pull/102) passed all seven
CI checks and deployed as `8aebca51a41775eb28d4a7cfe87356d9c3d6b6ef` at
21:51:40 UTC. Google service account uses `siteRestrictedUser` and read-only OAuth;
Bing's account-wide key is restricted to read methods in the collector. Both providers
successfully returned sitemap inventory and empty performance datasets from the OCI host.
Empty metrics remain unavailable, not zero. The native daily command rehearsal succeeded
in 2.257 seconds. Native main-agent skill discovery and private file modes passed.
The first weekly review wrote private files but misinterpreted rolling-window overlap and
the next Monday's date; it also speculated about permissions without an API error.
Those shortcomings were retained and the review prompt corrected. The second review succeeded
in 50.871 seconds, explicitly corrected the earlier claims and preserved the original. Daily
07:00 and Monday 07:15 PT jobs are enabled with delivery/failure alerts disabled. First
clock-triggered execution is future evidence. [Runbook](seo-data.md). No product milestone advanced.

## 2026-11-17 — PR #101 integration review

SA-M0 / #57; owner Codex. Resolved four documentation-only conflicts against `b2bab84`, retaining
both tasks’ evidence. 39 focused integration regressions passed. Review found that standalone
Community could retain global identity aliases despite sender-scoped DMs. The common memory
configuration boundary now rejects nonempty aliases without modifying the input or internal aliases;
8 focused configuration tests pass, covering standalone rejection and empty-map compatibility.
CI and final merge verification are tracked on PR #101. Shared migration/deployment remains on hold.

## 2026-11-17 — Shared Gateway Dashboard entry prepared

SA-M0 / #57; owner Codex; **implemented locally, not deployed**. The owner requires one Admin
Dashboard entry after Gateway consolidation. The landing page now shows one “打开 Nori” action
for a single configured Gateway and retains instance navigation for split deployments. The shared
candidate optionally generates a Dashboard config matched to the retained main port/basePath,
preserving authentication settings; native main display metadata becomes “Nori · 主助手”. Agent IDs,
Slack state, other agent capabilities and vendor source are unchanged. Channel labels remain useful
inside native sessions/settings; they are not separate management entrypoints.

Validation: 10 focused Dashboard/candidate tests pass, including login, persistent cookie restart,
proxy identity, WebSocket revocation and split/single navigation. Desktop/mobile synthetic previews
pass with one action and no mobile horizontal overflow. An initial test incorrectly expected unknown
paths to return 404; the existing Router fallback is outside this change, and that assertion was
removed. Shared live UI/channel acceptance is pending the blocked migration; no milestone advances.
Next: apply the candidate only with the actual shared cutover, then verify native Agents, WebSocket
and all retained Slack data. [Configuration and recovery](dashboard-zh.md).

## 2026-11-17 — Discord retention exception; draft PR publication authorized

SA-M0 private-memory boundary / #57; owner Codex; scope decision: project owner.
Shared-Gateway migration remains **BLOCKED/on hold** as requested. The owner permits discarding
Discord history/data when needed for consolidation, while preserving local files where feasible.
**All Slack data must be preserved.** Lossless Discord history import is therefore no longer a
mandatory gate; the November 16 SDK finding remains historical evidence, not a requirement to wait
for upstream before considering fresh Discord state. The current planner remains read-only and
shared activation remains disabled. Next, when migration resumes: prepare fresh Discord state,
inventory/backup local files, prove Slack data preservation and revalidate the shared topology.

This update authorizes branch push and a draft PR only, with no merge or production deletion/cutover.
Documentation/scaffold and diff checks cover this scope update; prior runtime evidence and its
limitations remain unchanged. No product milestone advances. See [current scope and evidence](community-private-memory.md).

## 2026-11-16 — Private Community memory activated; shared history migration blocked

SA-M0 private-memory boundary / #57; owner Codex. Deployed native owner/audience-scoped
session memory and approved request limits to the existing Discord Gateway, retaining its `main`
database owner. Root-owned public seed prevents unclassified history from writing into shared files;
main Slack configuration and running processes were preserved. A narrow model-free `rein_status`
health compatibility fix was deployed only in Discord's private router artifact; failed health cutovers
automatically restored configuration without deleting history. Corrected the existing backend's
308 bare-domain redirect to its canonical origin and rebuilt the native keyword index.

Real Discord passed DM reset recall, restart + reset recall, public-scope negative lookup, recovered
catalog retrieval and post-rebuild `memory_search`; real Slack executed the requested calculation
and returned 1147. Original 5 windows / 388 transcript event identities remain present. 71 focused
regressions passed; native memory and offline migration fixtures passed. An initial local regression
attempt lacked localhost permission; rerunning with permitted loopback passed. Real two-human-account
DM isolation and application-command reset remain unproven (text `/reset` passed); synthetic legacy
rotated-window `memory_search` can remain stale, so native `sessions_search` is required continuity.

Shared-Gateway migration remains **BLOCKED**: this OpenClaw pin exposes no supported lossless
cross-agent raw-history import. No vendor patch, ownership rewrite or history deletion was performed.
Configuration activation does not complete #57 or the wider product milestone. Next: upstream atomic
raw history export/import seam; preserve current isolated topology and coordinate releases.
See [implementation, evidence, limitations and recovery](community-private-memory.md).

## 2026-11-16 — Native Slack buttons for partnership test mail

SA-M3-01–05 / #59; owner Codex; PR #99. **IMPLEMENTED / LOCAL VERIFIED; button deployment
and real-user acceptance pending.** The leading-space command workaround is superseded by
native “批准并发送测试邮件”, “取消” and “刷新送达状态” buttons. Full draft preview remains in
the original thread. The plugin uses public native outbound and interactive registration APIs,
with persisted nonce/message/scope binding, current host authorization and membership checks.
Legacy commands and stored checkpoints remain compatible; no vendor changes or state migration.

Verification: 27 focused tests pass; full suite after merging main: 1441 passed / 4 conditional skips / 0 failures.
The pinned native Slack outbound adapter also preserves one exact card, action values and
thread receipt with injected transport.
The initial full-suite attempt in the incomplete worktree failed on missing dependencies; an
isolated verification copy with existing local dependencies passes without changing other worktrees. Real pinned loader/Gateway fixture `nori-partnership-6zW9cY`
passes distinct-process preparation/button approval/legacy command checks; seven button actions
produce POST deltas `[0, 0, 1, 0, 0, 0, 0]`, with zero model calls for decisions and one exact
synthetic email. It also verifies cancellation, duplicate no-op and delivered reconciliation.
Slack/provider transport remains synthetic. The earlier real command-based delivery evidence
below does not establish button usability. Next: updated PR CI/review, authorized deployment,
then actual Slack card/approval/test-recipient delivery verification. No milestone expansion.

## NORI-AI-NEWS bilingual and formatting correction — November 16, 2026

Owner Codex. **LIVE VERIFIED**. User requests Chinese and English editions in the same
Slack/Discord channels, without pagination and with concise local issuance timestamps.
Original 14 Chinese messages corrected in place; original delivery ledgers retained.
SchemaVersion 2 pairs both languages per event and preserves legacy receipt verification.
English supplements require exact original Chinese content/routes and complete receipts.
39 focused tests, scaffold, whitespace and 60 native fallback checks pass. Existing native
jobs now use the bilingual prompt. All 20 English supplement receipts confirmed; repeated
publication creates no duplicates. API readback matches all 34 messages; native clients show
rendered cards and concise times. A native Nori preview-only run generated and validated
two bilingual stories in 35 seconds, with no delivery; its disabled temporary job was removed.
Merge/rollout evidence is tracked in [PR #100](https://github.com/rein-protocol-foundation/nori-agent/pull/100).
The next scheduled bilingual run remains future evidence. [Runbook and evidence](ai-news.md). No unrelated milestone advanced.


## Scoped live acceptance closeout — November 16, 2026

Owner Codex / Astra High. Release d90578704cfe uses api.runtimeSource for stable summary worker identity and exact terminal native references for late reconciliation. 75 focused tests and native config/runtime loading pass. Only Slack restarted (PID533146); Discord/Router/Web PIDs unchanged. Real Slack reads confirm indefinite summaries, deletion tombstone persistence and a new single-run ACP verification with native_wait/complete surviving restart. The original pre-fix ACP flow still lacks settled evidence; no completion was fabricated. PR #98 remains open to avoid an unauthorized full-service restart. [Full evidence and limitations](task-lifecycle-activation-2026-11-16.md).

## Approved activation and scoped sandbox repair — November 16, 2026

Owner Codex / Astra High. Explicit approval now covers the private test channel task tools, continuation/context, thread replies and Slack-only restart, plus exact bubblewrap 0.9.0-1ubuntu0.3 and Ubuntu bwrap AppArmor profile. Native config validation passed; full configuration backed up. Only Slack PID changed. One package installed, zero upgrades/removals; global restrictions remain enabled. Actual ACP binary probe passes workspace write/outside write denial/host-loopback denial. Real Slack summary read/change/stop/copy deletion and scope denial observed; Nori stdin delivery independently passes18tests. Late terminal Task-to-Flow projection refusal remains a recorded blocker under repair; restart retention is pending. [Exact evidence and limitations](task-lifecycle-activation-2026-11-16.md).

## Indefinite summary copies and live task acceptance — November 16, 2026

Owner Codex, runtime-verified Astra High; implementation verified Sol High. Owner selected
indefinite server retention and preservation of Slack chat. Optional minimal summary storage uses
public native SQLite worker APIs, current owner/audience checks, pagination, reset continuity and
non-resurrecting deletion of retained copies only. No native database mutation, vendor edit or
history migration. 70 focused tests and 1436 full-suite tests pass, with 4 existing skips; actual
plugin loader passes. Native cleanup is simulated in fixtures, not a live-maintenance acceptance.
PR #94 conflict resolution preserved both independent document entries, 56 focused tests and seven
CI checks passed; merged/deployed as 66700d0 at 19:02:33 UTC. Slack configuration activation was
rejected by automatic approval review; exact settings await user confirmation. Existing ACP
produced two actual blocked runs and code independently passing 13 tests; startup required human
correction, so full autonomous development is not accepted. Native research delivered in the original
thread while ordinary chat/progress worked during execution; source review required two corrections.
A narrowly scoped distro bubblewrap/AppArmor repair is prepared but awaits explicit approval.
PR #97 review at f6dd3df has no findings; no feature activation or shared release yet. [Live record](task-lifecycle-live-2026-11-16.md),
[summary contract/rollback](task-summary-retention.md). No product milestone advanced.


Release follow-up: #97 final head passed all seven CI checks and merged as 9ed4cb2; updater completed at 19:50:59 UTC. Four services are healthy; all 69 protected static files retain identical content, mode and ownership. The Discord private plugin/launcher and root-owned public seed are preserved. Live native DB read was refused as locked, so no independent row-level history claim is made. rein-acp remains disabled; configuration and sandbox approvals are still pending. Rollback and limits are in the live record. No product completion advanced.

## Task stop/change, recovery and budget handoff — November 16, 2026

Tracking #58 / SA-M2-01–05. Owner: Codex, runtime-verified GPT-6 Astra Medium as requested.
**IMPLEMENTED / LOCAL VERIFIED; no new deployment or live acceptance.** Reused already-fetched
main `332cdf0` after discovering #87–#91 superseded the initial checkout. Prior tracked edits
were backed up in a retained stash, restored and merged with all upstream records; untracked PRD,
planning and runtime investigation files were preserved. No new commit/push/PR/merge to remote.

Added explicit pending/failed/confirmed/not-needed cancellation evidence, known-unlaunched custody
release for stop/deadline races, reconciliation on all-flow status, foreign-run wait rejection,
and concrete partial evidence/gaps at limits. No scheduler, vendor, mail or business-tool changes.
Ten new controller tests cover scope/stop/restart/limits/authority/ACP uncertainty. The budget
handoff test first exposed loss of concrete gaps, then passed after repair. See the
[contract and handoff](task-continuation-controls.md) for confirmation points and remaining windows.

Checks: 53 targeted pass; full repository 1418 pass / 4 conditional skips / 0 fail on the final version.
Final review additionally prevents a stopped supplement inheriting its predecessor’s known effects. Isolated two-process native seam passes.
Both probes initially hit sandbox loopback EPERM; permitted reruns used synthetic transports only.
M1 native probe failed waiting for an independent ACP cancel report, then passed standalone unchanged;
retain both results. Syntax/scaffold/local-link/diff and preservation checks passed.
Existing #91 real acceptance is referenced, not re-executed. Updated stale delivery-plan #54 next
steps to respect November 15 closure. No deployment, external send or paid inference occurred.

Remaining: new control races need separately authorized real-entry/provider acceptance; no exactly-once
or arbitrary-crash guarantee. Selected retention/delete is still unsupported and duration undecided;
ACP hard deadline remains unavailable. Next: review this local diff and authorize the bounded live
control acceptance if desired; monitor the intermittent M1 report observation failure. Rollback
reverts only this task's runtime/test delta; no state/history migration or deletion occurred.

Review follow-up: reproduced and fixed stale provisional cancellation evidence after native promotion;
54 focused tests and final full suite (1419 passed / 4 conditional skips / 0 failures) pass. Owner now authorizes the separate commit/PR and CI/review follow-up only.
Based on `64d0ff1` (#93); unrelated working changes remain uncommitted. No merge/deployment.

CI follow-up: run 43857871202 reproduced the cancelled ACP report fixture failure. The native background-task notice was present, but the scripted model recognized only the announce prompt. Added exact-current-run notification decoding and negative cases without changing production behavior or weakening delivery assertions. 55 targeted tests and native nori-task-loop-43csHm pass; CI/review rerun on the amended PR follows.

Review race follow-up: concurrent all-flow status during launch authorization could leave a known-unlaunched Flow stuck after its attempt was released. Reproduced, restored the Flow phase and cleared only obsolete launch uncertainty; restart reuses the same attempt. 56 targeted tests and final full suite 1421 passed / 4 conditional skips / 0 failures. PR #94 remains unmerged; final CI/review pending.

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

## 2026-11-16 — Partnership production activation and Slack command identity

SA-M3-01–05 / #59; owner Codex. User authorized production integration and one real test
recipient. Production code/dependencies existed but plugin loading, optional tool admission,
command authorization, sender/recipient and mail credential configuration were absent.
Backed up private runtime configuration, reused existing Slack/Resend credentials and verified
sender domain, and enabled the fixed workflow in the existing private test channel for its
verified administrator. A real Slack prepare displayed an exact draft and durable checkpoint.
Approval then failed before dispatch: native Slack command authorization lowercases user IDs,
whereas the plugin required uppercase IDs. Normalize only ASCII Slack user IDs at the command
boundary; retain native authorization, live membership, configured approver and scope checks.
22 focused tests pass, including lowercase approval, forged/wrong identity rejection and duplicate
no-op. Live approval/send/reconciliation remain pending deployment of this compatibility fix.
No secrets or runtime records are included here; existing acceptance evidence is not overwritten.

Deployment follow-up: the owner explicitly authorized merging PR #95. All seven CI checks
passed and review had no findings. Merge `e2c4083` completed at 17:28:25 UTC; the normal
updater reported `updated` at 17:31:28 UTC, with all four application services active.
The original version-1 draft survived restart, still awaiting approval with no send intent
or receipt. The connected Slack sender appended attribution to the approval command;
strict argument validation rejected it before dispatch. The initial diagnosis of ineffective
computer-control input was incorrect: the owner's Slackbot screenshot showed that Slack
intercepts a leading `/` as an unregistered app slash command.

**LIVE TEST PASS, November 16 at 17:21–17:22 America/Los_Angeles.** Under the owner's
existing test-send authorization, Codex submitted the exact saved approval through the
authenticated administrator's Slack web UI with one space before `/partnership`. The original
version-1 checkpoint resumed after intervening deployments. Resend accepted the email to the
designated test address; read-only reconciliation matched the exact sender, recipient, subject
and body and recorded `delivered`. A repeated approval returned the same receipt and retained
the original decision/send-intent timestamps. [Slack acceptance and delivery evidence](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794878546727399).
Runtime revision: `9ed4cb2`, including PR #95. This verifies the authorized test workflow and
provider-reported delivery, not inbox placement, reading, or real-partner outreach authority.
The preview, skill and runbook now explain plain-text submission with a leading space and no
connector attribution. These wording changes require publication; the working production
path uses the already deployed implementation. No runtime records or credentials committed.

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

## 2026-11-14 — Community runtime/concurrency feasibility (#54 / SA-M0-06)

Owner: Codex. **LOCAL GAP REPRODUCED; implementation/product acceptance BLOCKED**.
Synced to `87416cc`, including merged #83/#84. The renamed canonical acceptance
record is `acceptance-evidence.md`; the pre-existing untracked
`product-acceptance-evidence.md` is preserved. Added an isolated native diagnostic
and [configuration inventory / narrow host proposal](community-runtime-limits.md).
The real schema rejects per-Community run timeout/concurrency, and the native queue
starts a successor before a timed-out held task actually settles. Cooperative
synthetic signal consumers settle; this is not provider/tool integration acceptance.
Existing admission/routing tests: 20/20 passed, including reload, dead-process recovery,
contention and fallback budget preservation. Initial fixture alias/roster setup failures
were corrected. No production code/config or upstream source changed; no external
send, paid inference, PR, merge or deployment. Full Gateway fallback/cancellation,
reload/restart and live acceptance remain pending. Next: obtain the narrow supported
host deadline/actual-settlement contract before implementing a Community adapter.

## 2026-11-15 — Super Agent scope and remaining acceptance plan

Owner: Codex; scope confirmed by the product owner. Updated PRD to v0.7 and aligned the feature
checklist, roadmap and acceptance index with the [remaining plan](super-agent-delivery-plan.md).
General tools use OpenClaw/native community integrations. Preserve completed mail and existing Rein
business tools; new internal business functionality follows general Super Agent acceptance and is
then led by Nori through development and acceptance. Added cross-business reuse and an isolated
coding-delivery acceptance contract. Public rollout/operations retain their independent gates.
Existing uncommitted runtime-limit diagnostics and document changes were preserved. No runtime code,
configuration, vendor, external tickets, publishing or deployment changed. Documentation checks are
recorded below after validation; product checks were not run and no product milestone advances.
Blockers: existing native limits and undecided retention remain, as listed in the plan. Next: assign
the next bounded integration/acceptance task; remote issue synchronization remains pending.


Validation: scaffold, local document links, preservation of pre-existing tracking records and diff whitespace checks passed. Runtime/product tests were not run (documentation-only).

## #58 scoped live acceptance PASS — November 15, 2026

Owner: Codex / verified Sol High implementation. PRs #87–#90 merged after seven green CI checks each and no unresolved findings. Final deployed ca5a384: same-owner A/B interrupted by actual OCI restart, recovered without human continue, corrected invalid spawn/review inputs in the same Flows, and both reached succeeded/complete. Actual merged Slack results independently checked. Original config restored; no active native tasks; histories retained. [Full evidence including failed attempts](task-continuation-live-2026-11-15.md). #58 updated; no exactly-once, arbitrary-crash or retention/delete claim.

## #58 durable success during drain — November 15, 2026

Owner: Codex / Sol High. PR #89 deployed with seven green checks. A deterministic live restart hit a distinct window: child turns succeeded during graceful drain, before parent review, then volatile agent.wait timed out after restart. Verified pinned native lifecycle only publishes owner-fenced successful tasks after execution and completion capture settle, excluding sessions_yield. Narrow durable-success fallback and final retest in progress. Prior actual A/B research delivery remains verified. [Evidence](task-continuation-live-2026-11-15.md).

## #58 final-review input correction — November 15, 2026

Owner: Codex / Sol High. PR #88 deployed after seven green CI checks. Real two-task restart delivered both complete research results automatically in Slack, but complete reviews with textual no-gaps failed Flow closure. Follow-up rejects contradictory completion fields before consuming review/budgets; 40 targeted tests plus syntax/scaffold/diff pass. Fresh closure acceptance pending. [Evidence](task-continuation-live-2026-11-15.md).

## #58 successful-run settlement follow-up — November 15, 2026

Owner: Codex / Sol High. PR #87 merged, seven CI checks passed, deployed e279e91. Same-owner live test verified invalid-name correction and automatic supplement for BOTH interrupted tasks. Final review blocked because native wait returned a valid successful terminal receipt with stale livenessState=working. Follow-up repair and fresh live test pending; [evidence](task-continuation-live-2026-11-15.md).

## #58 continuation restart repair — November 15, 2026

Owner: Codex with verified Sol High implementation. In progress: preserve prepared assignment on invalid native taskName; reconcile provisional subagent cancellation through the public native API; permit authorized current managed completion review through the M1 report-only boundary. Prior failed live evidence retained. 29 targeted tests and scaffold/diff checks pass. Full run: 1383 passed / 4 skipped; missing local Lobster dependency caused one file import failure, repaired by frozen install; that file then passed all 18 cases. Native fixture failed SQLite worker cleanup; existing native config excluded selected tests. PR #87 CI and live Slack/restart evidence pending. User authorized PR merge, deployment and scoped live test; no product milestone advancement before evidence.

## NORI-BRANDING — November 14, 2026

Verification follow-up: native Router browser smoke passed (synthetic providers); live Slack
readiness returned HTTP 200/ready and configuration comparison proved only the requested
channel entry changed.

Owner: Codex. Authorized live configuration fix adds the deployment channel to the
existing Slack reply allowlist (16 → 17); bot/user inventories agree, all bot memberships
confirmed. A private backup preceded atomic replacement under the updater lock;
configuration hot reload and Socket Mode reconnection were observed. Existing sender
restrictions and mention gates preserved. No application deployment or chat send.
Project-owned Router/host-guard copy now uses Nori locally; 51 targeted tests pass.
Native Slack denial is hardcoded upstream before reply hooks: full branding remains
blocked on the [proposed public presentation interface](nori-branding.md). Next:
upstream interface review, normal source deployment, then real-user acceptance.
PR #84 deployed because every merged main PR triggers deployment; docs-only filtering
is absent. Existing unrelated checkout edits were preserved.



## 2026-11-13 — Slack emoji reaction permission repair / #77 / C02 support

Owner: Codex. **LIVE API VERIFIED; configuration-only maintenance** (America/Los_Angeles).
Using the deployed bot credential, `reactions.add` failed with `missing_scope`, explicitly
requiring `reactions:write`. Added only that Bot Token Scope to the existing Nori app and,
after the operator confirmed the authorization form's terms, completed workspace reauthorization.
The existing `incoming-webhook` scope required a channel selection; the operator confirmed
`#nori-alerts`, where Slack recorded an integration-added notice. No webhook secret was copied.

The unchanged deployed credential then passed `auth.test` with the same bot identity and
`reactions:write` in `x-oauth-scopes`. On the same existing operator message, adding `eyes`
returned `ok: true`; read-back through existing `conversations.history` permissions confirmed
the bot's reaction. Removal returned `ok: true`, and read-back confirmed cleanup. No
`reactions:read` or other scope was added. Slack service remained active with the same PID;
the live tracked checkout stayed clean. No credential replacement, restart, code deployment
or new test message was needed. Rollback: remove the added scope and reauthorize if required;
this restores the original reaction failure.

The operator subsequently reported that the repair succeeded. This is operator-reported
confirmation, separate from the API evidence above. No blocker remains for the reproduced
API permission failure. Automatic acknowledgement timing,
model-selected reactions and other conversation types were not retested; this is not full C02
or product acceptance. Next: observe the next normal mention for end-to-end acknowledgement
behavior. No product milestone advances. Local scaffold and diff checks passed;
no code tests were required for this OAuth-only repair.
Documentation follow-up: acceptance records use the functional filename `acceptance-evidence.md`;
repository links and the development instructions were updated without changing acceptance status.
[Slack method/scope requirement](https://docs.slack.dev/reference/methods/reactions.add/).

Merge follow-up (2026-11-14, Codex): synchronized PR #84 with main after PR #83 merged;
retained both branches’ records across all four conflicted documents and the functional
acceptance filename. Scaffold, link/preservation and diff checks passed; CI tracked on PR #84.

## 2026-11-13 — PR #83 CI follow-up / SA-M1-01–05 compatibility

Owner: Codex. **LOCAL VERIFIED; remote CI/review pending**.
Run `43525515709` failed the existing Slack task-loop assertion that an old ACP result cannot
satisfy replacement scope. Local `nori-task-loop-WcMVwe` reproduced it: the native task remained
cancelled, but the model prompt lacked the old-scope restriction. Native lifecycle inspection and
trace confirmed prompt assembly precedes `before_agent_run`. The task-loop prompt hook now reads
the owner-bound native task directly; the plugin wrapper awaits it. Admission and tool gates remain
in place. The regression fixture waits for a standalone cancelled report before requesting the
replacement, so coalescing cannot hide this ordering defect. No vendored code changed.

Checks so far: 21/21 task-loop tests; full suite 1397 total / 1393 passed / 4 existing conditional
skips / 0 failures; scaffold and diff checks passed. The earlier CI/local failure is retained above.
Native probes `nori-task-loop-bQmAto` and strengthened `nori-task-loop-VDTCWA` pass; the latter
requires an independently delivered cancelled report before replacement. Product acceptance and
live operations remain unchanged. Next: push and follow latest-head CI and review on PR #83.

## 2026-11-13 — SA-M3-01–05 / #59 partnership test workflow

Owner: Codex (runtime-verified Astra Medium, explicit user override), one verified Sol High
implementation worker. **IMPLEMENTED / LOCAL VERIFIED; product acceptance pending**. Clean base
`3942608`, reused checkout on `tempest/partnership-test-workflow`. [Runbook and recovery](partnership-workflow.md).
M1 #74 is merged. M2 #58 is owner-closed, but its final delivery evidence is not independently
verified; the separate `48856e8` checkout has preserved uncommitted continuation work and its
committed probe records blockers. No M1/M2 acceptance or unrelated completion was inferred.

The optional plugin reuses public Lobster `2026.9.13`, trusted native Slack command identity and
existing membership checks. One fixed template pauses on exact material; model-free human
approval binds workspace/account/channel/session/thread, approver, task/version and checkpoint.
A deterministic native preview precedes usable approval. Durable intent precedes the only Resend
POST; unknown outcomes never retry automatically. Receipts distinguish accepted and delivered.
The real restart probe exposed ephemeral plugin-capture template paths; immutable digest-keyed
copies in private profile state now preserve native resume dependencies without vendor edits.

Checks: 21/21 focused tests, full repository suite 1394 total / 1390 passed / 4 existing opt-in
skips / 0 failed. Native `nori-partnership-qS7WYp` passes enabled/disabled loader inspection,
actual ingress/commands, different-PID restart, exact approved send, cancellation, unauthorized/
wrong-thread/duplicate/post-cancellation decisions and receipt reconciliation. Only one synthetic
provider POST; decision commands invoke no model. Earlier fixture evidence-state and captured-path
failures are retained in the runbook. No live transport/model/provider calls, production config,
publish, merge or deployment. Real Slack approval, operator-designated real test recipient and
deployed profile/provider evidence remain pending. Next: local review, then separately authorized
live acceptance. Product checkboxes, M0 and AC01–AC20 remain unchanged.

Final compatibility checks: existing `verify:plugin` passes all three native loader profiles;
native discovery passes all nine workspace skills including `nori-partnership-draft`; scaffold,
diff and clean tracked vendor checks pass. After the final interrupted-preview status clarification,
the 21 focused tests pass again. Remote CI was not run at that handoff.

Publication follow-up: the owner authorized committing, pushing and opening
[PR #83](https://github.com/rein-protocol-foundation/nori-agent/pull/83). Commit `92f5773` contains
the implementation. After the initial base check at `3942608`, M2 PR #82 merged as `50b1275`;
this branch incorporates it, preserving both sets of documentation and both verification commands.
M2 delivery is now available in [its runbook](task-continuation.md), superseding the initial
unverified-delivery observation above; M2 product limitations and live acceptance remain open.
Remote CI/review remain pending. No PR merge into main or deployment is authorized.
After synchronization, the full suite passes: 1396 total / 1392 passed / 4 conditional skips /
0 failures; scaffold and staged diff checks pass. This regression does not establish M2 live acceptance.
## 2026-11-14 — #58 authorized live restart observation

Owner: Codex. Partial observation, not acceptance. Real Slack A/B tasks and OCI restart on
`87416cc7`: A was interrupted, B lacked an accepted receipt before restart; automatic combined
status reply reached Slack. Delayed ingress/follow-ups created different owners and an extra flow,
so same-owner coalescence was not tested. Missing review revision, overclaimed unknown outcome
and pending cancellation remain. All test stop intents persisted; original config restored.
[Evidence and next steps](task-continuation-live-2026-11-14.md). No source fix or milestone advancement.

## 2026-11-13 — #82 review: unmanaged M1 replacement compatibility

Owner: Codex. Addressed review comment 4561989210: continuation now accepts the exact
replacement authorized by the existing M1 hook after cancellation and run settlement,
only when the predecessor is not a managed-flow attempt. The internal handoff carries
native predecessor IDs; model text alone cannot grant an exemption. Existing M1 membership,
runtime, exact-task and one-shot checks run first. Managed assignments retain their gate.
Static syntax/transpile, scaffold and diff checks passed; tests/probes/acceptance were not
run per owner instruction. PR #82 is the delivery; product acceptance and native limitations
remain unchanged. Next: review the pushed correction and CI; no merge or deployment.

## 2026-11-13 — SA-M2-01–06 / #58 native continuation core

Owner: Codex orchestrator / runtime-verified GPT-6.1 Sol High implementation worker.
**CORE IMPLEMENTED / STATIC CHECKS ONLY; no product acceptance.** Added opt-in
`rein_continuation` using native managed Flow state, session inventory, system wakes and existing
M1/native spawn controls. Durable goals/criteria, scope revision, stop intent, accepted run links,
attempt/deadline/no-progress bounds, semantic review/supplement and restart reconciliation are
implemented. Same-owner/audience replies may combine flows; pending terminal reports replay while
native retention keeps them, with receipt explicitly pending/uncertain.

Checks: three runtime `.mjs` syntax checks, TypeScript transpile syntax diagnostics, changed JSON
parsing, `node scripts/check.mjs` and `git diff --check` passed. These are static checks, not
behavioral evidence. No tests/probes/acceptance were run or added; no Gateway, provider, real
Slack, deployment, publishing or external sends. Prior synthetic evidence is historical only.

Remaining: SA-M2-06 selected retention/deletion unsupported (native terminal cleanup fixed at seven
days); launch/stop has no atomic native transaction; ACP deadline is reconciliation-time rather
than hard timed termination; pending reports may repeat because parent receipt is not established.
[Detailed contract and limitations](task-continuation.md). Product checkboxes stay open; M3 is
out of scope. Next: parent review and handoff, without enabling production or claiming acceptance.


## 2026-11-12 — SA-M2-01–06 / #58 native continuation seams

Owner: Codex orchestrator (Astra High), same verified Sol High CLI worker. **BLOCKED;
PRODUCT NOT IMPLEMENTED.** Isolated `tempest/m2-native-continuation`, base `1280a75`.
PR #74 was open at initial branch preparation, then independently merged with all head checks
successful; its merge tree equals the original `95f1eac` baseline. Only this local branch was
fast-forwarded. [Full evidence, failures, commands and upstream proposal](task-continuation.md).

A real fixed-pin loader/Gateway probe verified one known-owner flow across two processes,
senderless startup wake through Router/M1, fresh completion→eligibility supplement, active
completion injection, actual task/run linkage and original-thread delivery after unrelated chat.
Two observed gaps prevent selecting the general product implementation: local keyed state is
restricted to bundled/official plugins, and same-session events from distinct original threads
coalesce into one automatic reply route. The latter remains an intentionally failing acceptance
assertion. Known-owner fixture recovery is not dynamic owner-discovery or product authorization.

The native build and 61 targeted decoder/M1/ACP/#66/Router tests pass. Earlier fixture-decoding
and assertion errors are retained alongside the passing single-case evidence. Product code,
config and skills are unchanged; full product cancellation/budget/unknown-effect/retention
verification and live Slack/research/Codex/production acceptance were not performed. No production
retention value was selected. Final parent checks are appended to the evidence runbook.
Next: review the minimal supported storage and per-event reply contracts, then continue #58.
No vendor source changes, sidecar history platform, custom scheduler, push, PR, remote merge,
deployment, real sends or M3 work. A local diagnostic commit is the handoff, not completion of #58.
## 2026-11-13 — SA-OBS-02 zero-usage failure accounting

Owner: Codex. DEPLOYED / LIVE PREVIEW VERIFIED. Per operator instruction, identified-model failed
attempts with explicit zero token counters and zero recorded cost count as $0
in receipts, even when native priced=false. Unknown models, missing counters and
nonzero usage remain unknown; source ledger, rates and delivery state are unchanged.
Checks: receipt/source tests 35/35; scaffold/diff and all PR #80 CI passed.
Deployed `400019cf2b01` at 2026-11-13 09:41:23 UTC. Integrated November 6 preview:
DeepSeek 121 attempts / 1 error / $0.3136786682 / zero unpriced; daily known cost
unchanged at $0.3846581493, two unresolved auto records remain. Source coverage
complete; no manual send. No milestone advancement.


## 2026-11-12 — SA-OBS-02 usage coverage correction

Owner: Codex. **DEPLOYED / LIVE PREVIEW VERIFIED.** The operator traced the OpenAI
dashboard comparison to local OpenCode, not Nori. Read-only SQLite/zstd and
isolated ACP inspection nevertheless confirmed real omissions: direct Qwen
requests across Nori profiles and Codex runs under the dedicated ACP account.
No account-wide dashboard total is imported and native catalog rates remain
unchanged. Three historical Bailian auto records lack actual model identity;
unknown costs remain explicit with a superscript marker on the known subtotal.

Implementation adds optional configured profile registries, direct usage and
owned Codex imports, with sanitized isolated-account exports and source-aware
deduplication. The sender preserves native scheduling and delivery state; failed
exports stop before generation or sending. Checks: Node 43/43, nested sender
Python 17/17, native Magpie pricing/restart/stdin-export integration 1/1, scaffold
and diff passed. A sanitized metadata replay matched 94 missing calls and
1,614,503 tokens; all seven live agent databases had zero archives at audit time.
The first full run exposed an existing worker fixture URL-encoding bug in paths
with spaces; using fileURLToPath restored its 8/8 test pass. After integrating current main, the full suite passed: 1372 tests, 1368 pass,
4 conditional skips, zero failures. The new native integration was also run
explicitly and passed. PR #78 passed all CI and deployed as `262878681fa6` at
2026-11-13 02:44:06 UTC; all four services are healthy. Live native refresh accepted
94 records, then accepted 0 / skipped 94 on repeat. Seven daily previews total
479 attempts, 14,520,939 tokens and $1.0706050245 known estimated cost, with four
unpriced records. The protected-account exporter and integrated sender preview
passed. Provider/channel configuration equality checks passed; no price or routing
change. Existing delivery records and images remain intact; no correction was sent.
The existing 09:00 LA job ran successfully on November 12 and remains enabled for
November 13. First scheduled delivery using the expanded sources is pending.
No product milestone advances.
See [runbook and rollback](daily-agent-receipt.md).

## 2026-11-12 — Slack task-loop functional naming

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

## 2026-11-12 — SA-OBS-02 Provider receipt layout

Owner: Codex. Status: **DEPLOYED / MANUAL LIVE VERIFIED**. User selected Day Card
style/icon reuse with the existing server sender. PR #75 passed all CI and deployed
`33c44dc268b590acf1d92c8af7afeae1bf7ce9ae` at 10:38:56 UTC. Four app services healthy.
Node 13/13, Python 12/12, scaffold/diff and actual/synthetic visual checks passed.
Nori sent `provider-v3` file `F0CH5NH47Q9`; Slack read-back confirmed message
`1794480068.252469` and repeat invocation returned `already-sent`. Original and
`pricing-v2` delivery records remain. Provider/model rows contain USD costs only;
token summary/cache-hit rate/unpriced count are at the bottom.

Price audit correction: an absent catalog field on built-in subscription model
selections does not mean missing prices. Native maker-price fallback already covers
current Gemini/Sol/Terra models. An unnecessary native catalog edit failed; the
providers file was restored byte-for-byte and Router restarted. The original public
metadata/catalog plus a credential-free synthetic native ledger priced 10/11 stored
model entries with no new mappings. The exception is retired unused Gemini 3 Pro;
three historical `auto` records lack actual model identity. No invented prices,
live ledger edits or credential/endpoint/model changes were retained.

[Runbook/evidence](daily-agent-receipt.md) records limitations and rollback.
Next: observe first clock-triggered delivery. No broader product milestone advances.

## 2026-11-12 — SA-OBS-02 receipt pricing and corrected delivery

Owner: Codex. Status: **IMPLEMENTED / TARGETED VERIFIED; rollout pending**.
The follow-up defaults China Token Plan imports to native `alibaba-cn` catalog
pricing, puts model/usage/estimate in the receipt main body, and adds an explicit
revision key for an authorized correction without deleting original delivery state.
Native synthetic verification passed: mapping reprices history, preserves subscription
endpoints/key/models and ledger bytes, and rollback restores unknown pricing.
Importer/native tests: 19 passed. Renderer/sender targeted checks and full CI will be
recorded in the separate PR. Next: merge only after passing checks, deploy, apply
native catalog mapping to the existing private profile, preview and send `pricing-v2`
to #nori-alerts, independently read back the file and confirm deduplication.
The user explicitly authorized this PR, merge/deployment and one corrected send.
[Runbook](daily-agent-receipt.md) includes private rollback, catalog estimate limits
and revision recovery. Live acceptance evidence will be recorded in the PR after
execution; no broader SA-OBS-02 milestone is completed by this correction.


## 2026-11-12 — SA-OBS-02 / #68 daily receipt

Owner: Codex. Status: **DEPLOYED / ENABLED; MANUAL LIVE VERIFIED**.
The user explicitly authorized Slack `files:write` and reauthorization, merging
PR #72, deployment, daily 09:00 America/Los_Angeles delivery to #nori-alerts and
one verification send. Slack app reauthorization completed; `auth.test` against
the active host bot confirmed `files:write` and `chat:write` without replacing
credentials. All PR CI passed; merge `831093f8bba3ba70953bdde0cd14403cabf6815c`
reached healthy deployment at 2026-11-12 09:19:57 UTC. Four app services were active;
private state was preserved and the previous release remains available for rollback.

The 0600 runtime receipt config uses the existing native Slack media directory.
Native authenticated Gateway RPC created exactly one declaration
`nori-daily-agent-receipt-v1`, job `bd36ddb1-8aef-4fa5-b89c-c160f51797ca`.
It is enabled with `0 9 * * *`, `America/Los_Angeles`, exact timing, command payload
and no extra scheduler delivery. No gateway trust/authentication setting changed.
A manual `cron.run` executed the same job successfully (exit 0, 13.862 seconds).
The sender recorded file `F0CH51GJH8R`; Slack independently returned the PNG from
Nori at message `1794475251.025539` in `C0CG9BQQ4Q0`, and file read-back succeeded.
[View verification message](https://app.slack.com/archives/C0CG9BQQ4Q0/p1794475251025539).
Scheduler `deliveryStatus=not-requested` is expected: its command sends the image
and persists the confirmed native file ID; scheduler text delivery is disabled.

Checks: targeted Node 10/10 (real PNG render), nested Python sender 6/6, scaffold,
all CI and full regression 1324 / 1322 pass / 0 fail / 2 existing skips.
The full regression used a no-space checkout after an existing URL-encoded-path
worker-test failure; its initial plugin links were also completed before passing.
The production PNG was visually inspected before delivery. Private usage artifacts
remain ignored. [Runbook](daily-agent-receipt.md) contains scope and rollback.

Next: the first clock-triggered run is November 12, 09:00 PST; it should deduplicate
the already-sent November 11 receipt. The next new report is November 13, 09:00 PST.
Clock-triggered acceptance is pending, not inferred from the successful manual run.
Unknown API prices remain unknown; direct ACP and internal-agent/channel attribution
are outside this slice. SA-OBS-02 / #68 and broader product milestones remain open.

English | [简体中文](implementation-and-deployment-zh.md)

## SA-M1-01–05 / #60 PR follow-up (2026-11-12)

Owner: Codex. User authorized branch push, PR creation and CI/review fixes; no merge/deployment
or next task. [PR #74](https://github.com/rein-protocol-foundation/nori-agent/pull/74) is open.
Merged main `4d62769` as `c67ae12`, preserving both documentation histories. Initial combined
suite lacked main's locked PNG dependency; after installation: 1346 tests / 1343 pass / 3
conditional skips / 0 fail. Automatic Codex review of implementation `46b7be3` completed with
no findings. Current remote checks/review are recorded on the PR; next: finish those checks and
report. [Evidence](slack-task-loop.md). Real Slack/research/Codex acceptance remains pending.

## SA-M1-01–05 / #60 native task loop (2026-11-12)

Owner: Codex orchestrator; same verified Sol High CLI worker implemented the slice; parent
reviewed and completed native integration verification. Status: **IMPLEMENTED / LOCAL VERIFIED;
product acceptance pending**. [Evidence, earlier failures and limits](slack-task-loop.md).
The optional existing ACP plugin mode and channel-independent skill use native Task/Flow/session
ownership, current membership, bounded ACP harness/cwd, status and cancellation plus fresh
user-directed delegation. No new task store, scheduler or coding harness. Existing main/development
bindings and Magpie policy remain intact. Cancelled outcomes retain partial/uncertain-action
reports; pending/failed cancellation cannot authorize replacement. Rollback disables the plugin
entry; setting taskLoop=false selects the legacy restricted controller and is not rollback.

Final expanded native run `nori-m1-PzyVU6` passed: actual pinned loader/Gateway/native research and
ACP runs, real task/run IDs, shared-member controls, foreign-scope/revoked read denials, unrelated
chat, original-thread shortlist/results, research stop/change, and ACP pending/settled/failed
cancellation. Transport, model, research sources and ACP backend are synthetic. Immediate ACP
canonical lookup can lag acceptance: report the actual run/session and resolve on the next
request; never respawn. ACP Task rows hold 160-character summaries; full goals/criteria and
predecessor links are verified at the accepted input/native backend boundary, not invented in
Task storage. Earlier failed decoder/timing/storage assertions are retained in the evidence page.

Checks: 19 targeted tests passed; full Node suite 1333 tests / 1331 passed / 2 existing conditional
skips / 0 failed; existing ACP and #66 Cron/native-child regressions, plugin loader and skill
discovery passed. Scaffold/diff checks and vendor cleanliness are verified for the local handoff.
CI includes the new native fixture; remote CI was not run. No live data/provider calls, outreach,
push, PR, merge or deployment. M0/M2/M3 and product checkboxes remain unchanged. Next: review the
local commit and separately authorize real Slack/research/Codex acceptance; stop at #60.

## On-demand usage summaries (2026-11-11)

Task: DEV-USAGE-03. Owner: Codex orchestrator. Status: documentation updated.
Supersedes the earlier mandatory per-reply reporting policy: ordinary Q&A, discussion and progress
updates do not trigger usage collection. Report only at development completion, handoff or an
explicit user request, using one line by default. Reuse the verified reader and batch the query
after the final necessary verification in the same tool call; handoffs/explicit requests without
pending checks may query once. Detailed breakdowns remain available when needed or requested.
Verification: Scaffold and diff whitespace checks, plus the documented compact usage query, are
run together at handoff; results accompany the final response. No product tests, deployment or
milestone advancement. Blockers: none. Next: apply this policy to subsequent tasks.

## Codex session usage reporting (2026-11-11)

Task: DEV-USAGE-02. Owner: Codex orchestrator. Status: completed documentation update.
Root `AGENTS.md` now requires reading actual Codex session usage before reporting missing values;
[the handoff guide](agent-token-usage.md) includes an executable read-only query, field mappings,
turn/task boundaries, cumulative-session fallback and duplicate-count prevention. PATH CLI 0.162.1
and daemon CLI 0.167.2 do not advertise a `usage` subcommand; the documented fallback reads native
`token_usage_record` / legacy `token_count` records for the exact current thread. No new inference
or account-wide quota query is needed. Actual usage and raw logs remain outside the repository.

Verification: documented query executed against the current session; runtime turn identity and
input + output = total checked. `node scripts/check.mjs` and `git diff --check` passed.
Product tests, paginated-history fallback and other CLI versions were not tested. No deployment,
configuration change or product milestone advancement. Blockers: none for this documentation task.
Next: use the query before final reports; check the installed interface/schema if storage changes.

## PR70 Console host-policy persistence review fix (2026-11-10)

Owner Codex; America/Los_Angeles; base `500fd4b`. PR title:
**Fix scheduled tasks requiring an online Slack user**. Local fix complete; remote CI/reviewer
approval and merge remain the parent workflow, not performed by this worker.

The reviewer identified that Console compilation omitted the two host authority policies and
entry replacement erased them every polling cycle. Four actual compile/merge/sync reproductions
failed before the fix. Host Dashboard/configuration is now the single source for
`trustedSlackChannels` and `nativeAgentRoutes`: merge preserves own properties, discards generated
defaults for absent host fields, and revalidates the result against the new routes. Console settings
contain no duplicate authority. Explicit empty lists/maps remain empty; omitted creation policy
tracks current development channels. Removed qualified routes reject publication instead of
silently widening Provider eligibility. Automatic recommendation repair waits for validation;
invalid host-policy saves preserve both host and Console files. Validated intent is persisted
before key/config publication; post-publication activation failure leaves keys disabled and
settings coherent with the host. Legacy pause/tightening behavior remains covered.

Run12: **96 Console/Router tests passed**; full Node **1314 tests / 1312 pass / 0 fail / 2 existing
conditional skips**; scaffold, source links/examples and diff-check passed. Persistent fixtures
exercise refresh, save, catalog expansion/removal, close/new sync instance/init, explicit empty
revocation, implicit inheritance changes, runtime route restrictions and post-publication failure.
Optional `node scripts/verify-router-console.mjs` **could not start** because the prepared Magpie
binary is absent (`magpie_dependency_not_prepared`); no install/build was attempted. This is not a
passing native UI check. Logs: `/tmp/sa-ops-run12-reproduction.log`,
`/tmp/sa-ops-run12-targeted.log`, `/tmp/sa-ops-run12-node-tests.log`,
`/tmp/sa-ops-run12-check.log`, `/tmp/sa-ops-run12-native-console.log`,
`/tmp/sa-ops-run12-links.log`. [Configuration semantics](slack-development.md#console-refresh-and-host-policy-ownership).

Next: parent review, then authorized commit/push and CI/reviewer verification before merge.
No commit/push, PR message, merge, deployment, production or vendor change was made here.
This new review task does not advance product milestones; prior verification entries below are historical.

## SA-OPS-01 / #66 native execution fix (2026-11-10)

Owner Codex; date 2026-11-10, America/Los_Angeles. Implementation base `b36f21b3`, initial
investigation base `ac8d766`, native pin `4a11f89`; #61/#69 merged.
Status: **IMPLEMENTED / LOCAL VERIFIED; no production or product acceptance**.
Native execution ownership replaces the historical grant-view/BLOCKED premise. Ordinary trusted
Slack and ACP need no Foundation role; business privileges remain. Creation/expansion requires
current trusted Slack ingress, an approved Agent and native creation permission (`commands.ownerAllowFrom`).
Description audit is informational and owner-scoped; errors/deadlines explicitly block.

[Source and evidence](sa-ops-native-authority.md) cover actual native Cron create/update/declare,
two-user audit, disable/enable/remove, public creation/spawn/send refusal, restart, senderless
execution with an explicitly eligible development-subscription Agent default and job override,
and announce delivery. Real native child spawn, senderless execution and parent result are also
exercised, with synthetic transport and loopback model. Both ordinary and native fallback remain;
every native candidate is checked for eligibility, including scoped stream fallback before any
candidate credential/network access. Public configuration reachability uses native-normalized IDs
and detects indirect spawn/send paths while preserving isolated internal collaboration.

Run11 checks: **31 targeted tests passed** (creation/Provider/usage, scoped stream and fixture parser);
**7 native projection cases plus disabled Router entry passed**; complete Node **1309 tests /
1307 pass / 0 fail / 2 existing conditional skips**; scaffold, local/pinned source links and
whitespace passed. Real loader three modes and membership-only native ACP E2E passed again.
The pinned build (4m56s) was reused. Logs use `/tmp/sa-ops-run11-*`; exact commands and retained
native fixture evidence are in the report. Earlier fixture metadata-selection failures are fixed:
synthetic model parsing excludes internal metadata blocks without changing native input/permissions.

Native enable can commit then return an upstream `scheduleErrorCount` output-schema error; actual
store state is checked and the mutation is not retried. Live Slack/production/paid Providers,
complete memory maintenance, broader child continuation, active cancellation/revocation races and
all message-tool audiences remain unverified. Actual bounded child launch/result is verified;
projection alone is not called memory acceptance. M0/M1 and governance acceptance stay open.
Next: review the bounded diff and known native return-contract limitation, then use the already
authorized parent commit/push workflow for PR70. This worker made no commit/push/PR update,
external send, merge or deployment, and started no other Issue. Native Dashboard/configuration
remain the management path.

## Super Agent v0.6 native-first revision (2026-11-09)

Task: SA-D01–10 / SA-M0–M3 / SA-OPS/ROUTE/COST/OBS. Owner: Codex for documentation; project owner for product decisions; implementation assignees pending. Status: PRD/checklist/roadmap and GitHub tickets revised; no new runtime acceptance. [PRD v0.6](super-agent-nori-prd-en.md) supersedes the earlier default-disabled Dynamic Router and extension-first implementation assumptions. M1 Slack/native research and existing ACP coding is first; M0 remains independent. Reuse native agents, sessions, memory, Cron, subagents, Dashboard, Magpie quotas and community integrations before adding thin adapters. ACP clients retain native login/subscriptions. Community defaults to Bailian Qwen instant/thinking-off with bounded per-question escalation; Slack defaults to dynamic with persistent manual control; Cron retains its effective fixed model.

Tracker #65 and #54–#60 were updated; new #66 tracks trusted Slack/system Cron authority (including the previously diagnosed skill review failure), #67 Qwen-first/quotas and Slack control, #68 channel usage/Axiom and native Cron reporting at 09:00 America/Los_Angeles to #nori-alerts with 80% configured-allowance alerts. Estimates, native exhaustion and unknown ACP usage remain explicit. Retention duration (formerly fixed 30 days) and M3 first-release necessity remain product parameters; actual native seams and Axiom query access remain unverified. Next: assign bounded integration slices and collect exact-version behavior evidence. Validation: Markdown links/ID mappings, Scaffold, diff scope and GitHub read-back; no application suite, paid inference, code/configuration change, production replay, commit or deployment.

### Earlier recovery checkpoint (historical; decisions below superseded by v0.6)

## Super Agent recovery and scope review (2026-11-09)

Task: SA-D01–07 / SA-M0–M3. Owner: Codex for this documentation checkpoint; project owner for scope decisions; implementation assignees pending. Status: evidence/checklist refreshed, scope decisions pending. Read the [feature checklist](super-agent-feature-checklist.md). #49–#53 are merged; #61 remains open at 8e260a64 with successful exact-head CI. This refresh records current GitHub state and preserved local SDK work; no new runtime acceptance or deployment is claimed. The earlier production observation is historical. The user's instruction is to review the whole PRD before resuming implementation. The owner confirmed Slack task delivery first and shared-Gateway/Discord migration as an independent PRD milestone. PRD v0.5.2 records this dependency change; M0 public criteria remain intact. Scope issue: [#65](https://github.com/rein-protocol-foundation/nori-agent/issues/65). Other feature cuts are not approved. Next: resolve SA-D02a/03–07, then resume bounded work. Verification for this update: documentation/link consistency and GitHub read-back only; no application suite, paid inference or production changes.


## Codex development delegation configuration (2026-11-09)

Scope: configuration and documentation only; no PRD implementation or milestone advancement.
Owner: project Codex orchestrator. Status: configuration and routing smoke verification passed.
The repository development policy in `AGENTS.md` supersedes previous project delegation rules.

| Role | Effective model | Reasoning | Configuration |
| --- | --- | --- | --- |
| Primary orchestrator | `gpt-6-astra` | high | `.codex/config.toml` |
| Implementation Agent | `gpt-6.1-sol` | high | `.codex/agents/implementation.toml` |
| Routine Agent | `gpt-6.1-sol` | low | `.codex/agents/routine.toml` |
| Other subagents | `gpt-6.1-sol` | medium | `[agents]` defaults |

Installed versions inspected: PATH CLI `0.162.1`, local daemon binary `0.167.0`, desktop-bundled
CLI `0.167.0-alpha.3.2`. The project is already trusted locally. Official
[subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) and
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) document
project agent discovery, per-agent model/effort settings, and separate subagent defaults.
The role files pin both settings; no global user configuration or provider/auth settings changed.

Verification evidence:

- CLI `0.162.1` app-server with `--strict-config`: `config/read` for this checkout resolved
  Astra/high, Sol/medium defaults, enabled agents, and a two-child concurrency limit.
- Fresh `0.167.0` strict-config, read-only smoke session
  `01a1c1a8-dea4-7cc2-8ce6-7a5a9c340e65`: runtime turn context recorded Astra/high.
  It sequentially spawned the following roles with `fork_turns="none"` and **no explicit model
  or effort overrides**. All returned `ROUTE_OK` and performed no repository work.
- Implementation child `01a1c1a8-f679-75a2-8e5c-a19c8fe875a9`: Sol/high.
- Routine child `01a1c1a9-110b-71f2-aec0-9933bbfc8f15`: Sol/low.
- Default child `01a1c1a9-2f45-79e2-a0cd-0bfc8a10ef85`: Sol/medium.
- Each assignment above was independently read from local runtime thread metadata and its
  persisted `turn_context` (`model`, `effort`), rather than inferred from the child's response.
  The smoke parent could not itself expose that metadata; the outer verification supplied it.
- The existing desktop session's explicit-model fallback also completed a Sol/low probe
  (`01a1c1a8-756d-7141-b3be-abd527165f32`), confirmed in runtime thread metadata.
- `node scripts/check.mjs`: passed. `git diff --check`: passed. Product tests and production
  integration were not run because this change is limited to development configuration/docs.

Handoff and limitations: start a fresh project session to load the role catalog and defaults.
The already-open configuration chat retained its prior Astra/medium turn setting; writing TOML
does not retroactively change active turns. An explicit UI/CLI model or effort selection can
override project defaults. Verify the displayed primary is Astra High when resuming older chats.
Per-agent routing is supported on the tested runtime; older CLI role spawning was not separately
tested. Unrelated existing MCP startup warnings for `rbtrading_mcp` and `playwright` did not block
the smoke test and were not repaired. Prompt caching is best effort, not guaranteed savings.

For future verification, run a read-only `codex exec --strict-config --json -s read-only` smoke
from this checkout, asking for sequential no-op spawns of `implementation`, `routine`, and `default`
without model/effort overrides, then check each child's runtime model and effort. Never use a
model's self-report as evidence. If a running session lacks the named roles, use the explicit
Sol model/effort fresh-context fallback in `AGENTS.md`; if it cannot be verified, stop delegated
work and report the limitation. Record future PRD progress in the existing roadmap and acceptance
matrix, with checks, blockers, and next steps here; no product acceptance status changes in this entry.

### Token usage handoff follow-up (2026-11-09)

Added a mandatory end-of-task usage report to root `AGENTS.md` and a
[cross-agent handoff guide](agent-token-usage.md), discoverable from `CONTRIBUTING.md`.
Owner: Codex orchestrator with Sol Low documentation support. Configuration/documentation scope
only; no PRD milestone advanced. Reports must identify missing data and their collection cutoff,
avoid double counting, and distinguish measured usage from estimated or billed cost.
Verification: `node scripts/check.mjs` and `git diff --check` passed.
Handoff: non-Codex agents must explicitly load the guide if their host does not load `AGENTS.md`.

## Current backend configuration (2026-10-26)

Nori connects to `https://rein-protocol.org` by default. `REIN_BACKEND_URL` is resolved in this order:
the launching process environment, this repository's `.env.local`, then the online default.
Override it with a local or DEV backend address only for explicitly isolated development.
An explicitly empty value does not fall back to the online address; it remains an invalid configuration.

The caller ID and credential must be registered in the environment used by the target backend.
Changing the URL does not migrate a DEV caller or grant Production access. The backend's
`DATABASE_ENVIRONMENT` and other deployment settings select `dev_*` or `prod_*`; the Agent cannot
arbitrarily switch them through a URL or its own database environment variables.
Using the online API by default does not authorize test writes to production data or establish
production end-to-end acceptance.

See [setup](setup.md#optional-enable-backend-backed-tools) for the current complete configuration
and tool inventory. Current `foundationDb` mode retains `rein_status` and registers 19 backend
tools (12 governance, 3 identity binding, 4 community queries). Counts of 14 in the historical
acceptance tables describe the recorded build, not the current registration expectation.

Maintain the English and Chinese versions together. The delivery scope, tool counts, PR status and
acceptance figures below retain the dates and scope of the original historical records; they are
not live statements about the current online deployment. This section and the startup instructions
below describe the current connection configuration.

## Delivery boundary

Nori-Agent continues to use official OpenClaw source as its runtime. Business code belongs only in
`plugins/rein-operations/`. This delivery is a **repeatably verifiable local business core and
development rehearsal**, not an NGO production system connected to real members and funds.

**Architecture from 2026-09-30: a cross-channel backend.** The implementation is **not limited to
one Slack workspace**. `foundationDb.workspaces` registers workspaces by platform and can include
both Slack and Discord. The Agent selects exactly one workspace from the host's trusted
`messageChannel` and native channel ID, so one deployment can serve multiple platforms without
mixing identities. The interface remains Slack-first; Discord is a second platform using the same
mechanism. Members, directors and available funds remain authoritative in the **organization's
database**, but **the Agent no longer accesses it**. All governance reads, writes, identity
resolution and identity linking go through an authenticated **backend service API**. The interface
contract is in place: endpoints, operation names and result shapes in `docs/integration-contracts.md`,
with corresponding plugin transport and adapter modules. At the time of this architecture record,
no real backend, Slack workspace or Discord workspace was connected, and the backend path had not
been verified in production.

**Confirmed and unresolved policy.** Confirmed: approval-only voting, no opposition option,
abstention contributes no approvals, candidate limits and per-voter approval limits are configured
by type, the highest approval count wins, universal abstention produces no winner, and a tie for
the highest count produces no official winner. Still unresolved: weighted voting and director
weights, the source and synchronization of the authoritative member registry, the source and owner
of available funds, retention periods, and exception owners. Website publishing remains a later
phase: the website API contract exists, but its publishing connector is not connected or deployed.
Specific limits and the tie policy still need registration. `config/operations.example.json`
remains unapproved; blank values are not authorization.

**Historical P0 direction, confirmed 2026-09-24 and superseded by the cross-channel architecture.**
The original direction made Slack the only P0 chat platform and required an explicit link from a
Slack account to a community record. That accurately described the decision at the time. The
implementation subsequently expanded to multiple platform-specific workspaces using the same
mechanism for Slack and Discord. “Slack only” is retained as history, not as a description of
current code.

**Historical evidence from 2026-09-24 through 2026-09-28 concerns the earlier direct-database build
and does not establish production acceptance.** Synthetic rehearsals used real providers: tools
sent and received messages in a real test Slack workspace with synthetic identities and two
approved test channels, and read and wrote synthetic fixture rows in a real Supabase project's
linked `dev_*` tables. `prod_*` business rows stayed at zero. Direct database access belongs to the
implementation before the 2026-09-30 change; the tool names, configuration keys and paths in that
evidence describe the old build, not the current Agent. No real member registry, funding/payment
provider or website was connected, no `prod_*` business writes or production deployment were
performed, and there was no production end-to-end evidence.

The two base migrations were committed on the sibling repository's PR #13 branch (recorded head
`78281fa`, originally committed in `4bd5ce8`) and applied in filename order to the linked
`BeneficenceProtocol` project, ref `ksgyfyysnojqrwfuyqwe`. A read-only
`supabase migration list --linked` check on 2026-09-27 showed both versions applied. Each migration
defines both `dev_*` and `prod_*` objects in one transaction, and migration history is project-wide:
the applied schema covers both prefixes. `DATABASE_ENVIRONMENT=dev` selects the application's
default table set; it does not mean only DEV objects exist.

The third migration, `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`, was committed in the
sibling repository at `32977bfb` and applied to the linked project. A 2026-09-28 read-only check
confirmed its version and both clock functions. Ballot `cast_at` therefore uses the database clock.
That commit's local pgTAP suite passed 187/187 twice in an isolated container. The same check
confirmed the fourth migration, `20260927110000_rein_governance_names.sql`, with all ten renamed
physical tables present. Its transitional compatibility views and RPC wrappers were later removed
by the applied `20260929045543_remove_stage_compatibility_objects.sql` migration. These were applied
schemas used only in rehearsals: tools read and wrote synthetic DEV data, while PROD had schema but
no business activity. The historical record does not establish live end-to-end verification of the
renamed interfaces or production. Local SQL and automated tests are distinguished below from real
Slack and production acceptance.

The business core in the recorded PR covers deterministic proposal, identity-eligibility, vote
counting and funding-competition rules. `ledger.ts` provides atomic snapshots, idempotent operation
receipts and audit records for local rehearsals. External channels, payments and website publishing
are not connected. The OpenClaw plugin registers status, proposal simulation and vote simulation
tools by default. Four proposal tools register only with explicit configuration and derive account
identity only from trusted host context. Activity, change, oversight, external delivery and the
governance persistence/tool-bridge modules were split into later PR work and were unreachable in
that runtime. Self-declared membership in tool arguments is never authenticated identity.

The recorded v0.1 slice implements 14 tools that register **only with an explicit `foundationDb`
block**: reads `rein_member_status`, `rein_funds`, `rein_poll_candidates` and
`rein_vote_type_resolve` (`governance-read-tools.ts`, `vote-type-resolve.ts`); read-only field
collection `rein_proposal_collect` (`proposal-collect-tools.ts`); writes
`rein_governance_proposal_submit`, `rein_poll_open`, `rein_poll_vote` and `rein_poll_result`
(`governance-write-tools.ts`); result feedback `rein_proposal_comment_suggest`,
`rein_revision_approve` and `rein_revision_apply` (`proposal-feedback-tools.ts`); and identity linking
`rein_identity_bind_start` and `rein_identity_bind_complete` (`identity-tools.ts`). Enabling
`foundationDb` hides the simulators and legacy proposal tools; otherwise they remain available.

Under the **2026-09-30 architecture change**, these tools no longer access the database directly.
They use the authenticated backend through `backend-transport.ts`, `backend-db-adapter.ts`,
`backend-config.ts`, `ingress-proof.ts` and `backend-runtime.ts`. The Agent holds no database
credential; `foundation-db-reader.ts` and `foundation-db-writer.ts` retain only result types. The
architecture record had no live evidence for this change: earlier direct-database rehearsals used
the pre-rename build, PROD business rows stayed at zero, and the renamed interfaces and backend path
had not been run end to end in a real environment. The applied rename migration means the backend
schema already has `<env>_rein_*`, `<env>_rein_finalize_poll` and `<env>_rein_approve_revision`.

| Code | Implemented | Integration still needed |
| --- | --- | --- |
| `proposals.ts` | Authoritative member records and account links, Contributor eligibility, proposal versions and confirmation, completeness checks, explicitly authorized zero-budget path, funding routing | Real member registry and trusted platform requester |
| `proposal-store.ts` | Transactional proposal state in the local ledger, restart recovery, idempotent receipts and rejection of stale-version writes | Production database, registry synchronization, backups and migrations |
| `proposal-tool-bridge.ts` | Optional OpenClaw v2 creation, revision, confirmation and submission tools; trusted host sender/channel only, with call-validity recheck before writing | Approved platform/channels, authoritative registry synchronization and real-chat acceptance |
| `governance.ts` | Frozen rounds, eligibility and deadlines, ballot replacement/recusal/counting, budget competition and pending allocation | Formal voting entry point, approved tally rules and authoritative available funds |
| `ledger.ts` | Single-file transactions, idempotent receipts and local audit for rehearsal store ports | Production database, backups, migrations and access control |
| `request-context.ts` | Account binding from trusted OpenClaw sender/channel context; refusal without configured platform/channels; final pre-write validity check and Contributor lookup reflecting registry revocations | Selected platform, member registry and business-tool binding |
| `index.ts` | Default `rein_status`, `rein_simulate_proposal`, `rein_simulate_vote`; four proposal tools with explicit configuration; `foundationDb` switches to 14 backend tools (4 reads + 1 read-only collector + 4 writes + 3 feedback + 2 identity links), hiding simulators and legacy proposal tools | Complete activity, outcome, publishing and oversight tools |
| `foundation-db-reader.ts` / `governance-read-tools.ts` | Read-only identity links and funds snapshots through `rein_member_status` and `rein_funds` | Real database connection and reviewed migrations |
| `foundation-db-writer.ts` / `governance-write-tools.ts` | Proposal submission, poll opening, voting and result tools; writes to `<env>_rein_proposals`, `<env>_rein_polls`, `<env>_rein_ballots`; type limits from `<env>_rein_vote_types` | Real database connection including the applied rename; no payment or reservation |
| `proposal-feedback-tools.ts`, with `foundation-db-writer.ts` and `proposal-revision-rules.ts` | Post-result comments/revision suggestions, current-director approval of material revisions, and application of recorded revisions; `<env>_rein_proposal_revisions` and `<env>_rein_approve_revision` | Real database connection including the rename and real Slack acceptance; no payment or reservation |

PRD R08 gained an operational boundary: a proposal marked “zero requested amount” that still asks
for reimbursement must supply the amount before Board selection; it cannot take the zero-budget
shortcut. This clarification is in both PRD languages. The rule that an activity owner confirms
article facts using server-provided Contributor eligibility moved with the activity core to a later
PR; its requirements remain in the PRD and acceptance matrix as future scope.

The activity core's deterministic boundaries are **outside the recorded PR**: completing a task
cancels follow-up reminders; reminder delivery requires `timezone_required`; each activity has at
most one canonical article and a separate `post_article_link` backlink intent; amount adjustments
are audited with `finance.approve_adjust`; unresolved overspend must recover in the fixed order
“authorize a higher limit (`finance.approve`) → add reservation (`finance.reserve`) → record payment
→ settle.” These rules moved with `activities.ts` to later work and are unreachable in the recorded
runtime. They remain future requirements in the PRD and [acceptance evidence](acceptance-evidence.md).

## P0 v0.1 vertical slice: scope and status

The confirmed v0.1 has four steps: Slack identity link → simple Contributor proposal → Board
approval-only poll and result → read-only funds snapshot. See the [decision register](decisions.md)
and [PRD §2.3](PRD-agent-community-operations.md) for scope and deferrals. Eligible directors have
equal weight, each type sets the approval limit per voter, and the highest approval count wins.
There is no opposition option, and abstention contributes no approvals. **Universal abstention
produces no winner. A top-count tie produces no official winner and must not be broken arbitrarily;
the tie policy remains unresolved.** Passing a vote records a decision; it does not move funds.

| v0.1 step | Recorded code | Still missing |
| --- | --- | --- |
| Slack identity link | `request-context.ts` and read-only `foundation-db-reader.ts`; tests in `tests/foundation-db-reader.test.mjs` and `tests/foundation-db-gateway.test.mjs`; the old `registry-snapshot.ts` path was unreachable and moved to later work | Real member registry and production acceptance. Synthetic link reads were rehearsed in the test workspace and linked DEV tables; the identity migration was committed on sibling PR #13 (recorded head `78281fa`) and applied |
| Contributor proposal | `proposals.ts`, `proposal-store.ts`, optional four-tool proposal bridge, and v0.1 `rein_governance_proposal_submit` in `governance-write-tools.ts` | Slack conversation integration and an authoritative active-Contributor source |
| Board approval poll and result | `rein_poll_open`, `rein_poll_vote`, `rein_poll_result`; persistence in `foundation-db-writer.ts`, equal-weight tally in `vote-tally.ts`. Opening assembles candidates from the stored type limits, including previously unselected proposals. Voting accepts only `approvedProposalIds`, enforces `maxApprovalsPerVoter`, and treats an empty array as abstention. `<env>_rein_finalize_poll` persists results after closing. The old weighted `governance.ts` model remains unregistered | Specific type limits, approved voter list and tie policy. Synthetic rehearsals passed on the real test workspace and DEV tables before the rename, but the recorded PR head had no real Slack rerun after renaming and no production acceptance |
| Read-only funds snapshot | `backend-db-adapter.ts` calls backend `available_funds`; `governance-read-tools.ts` exposes `rein_funds` in approved Board channels | Real funding/provider data, member registry and production acceptance. Snapshot schema was committed on sibling PR #13 (recorded head `78281fa`) and applied, but no tool had read it through the backend path at that point |
| Post-result feedback and revisions (C15/D10/D11) | `rein_proposal_comment_suggest`, `rein_revision_approve`, `rein_revision_apply`; `<env>_rein_proposal_revisions` and `<env>_rein_approve_revision`. Title/summary-only revisions can be accepted and applied by the Agent. Material budget/location/schedule/personnel/main-flow revisions return `revision_not_approved` until current-director approval is recorded | Real database connection including the rename and real Slack acceptance; whether active Contributors may author feedback remained unresolved (the database allows it, registered tools require a current director) |

With `foundationDb` enabled, the recorded 14 backend tools comprise four reads
(`rein_member_status`, `rein_funds`, `rein_poll_candidates`, `rein_vote_type_resolve`), one read-only
collector (`rein_proposal_collect`), four writes (`rein_governance_proposal_submit`, `rein_poll_open`,
`rein_poll_vote`, `rein_poll_result`), three feedback tools (`rein_proposal_comment_suggest`,
`rein_revision_approve`, `rein_revision_apply`) and two identity tools (`rein_identity_bind_start`,
`rein_identity_bind_complete`). Simulators and legacy proposal tools are hidden. Without explicit
enablement, no backend tools register. **The Agent holds no database credential and does not access
PostgREST** after the 2026-09-30 change: every operation is an authenticated call to the backend named
by `foundationDb.backendApiBaseUrlEnvVar`, with proof derived from host context for the tool call.
It does not proactively send Slack messages or echo credentials, backend addresses, workspace IDs
or private contact identifiers.

**Post-result revision rules (C15/D10/D11) have distinct boundaries.** Revisions changing only a
**title or summary** are ordinary: the Agent may accept reasonable suggestions and apply them in
the caller's turn through `rein_revision_apply`, with no separate Board approval or second approval
RPC. Changes to **budget, location, schedule, personnel or the main activity flow** are material.
Until a current director's approval is recorded through `rein_revision_approve` and
`<env>_rein_approve_revision`, the write layer and database triggers reject application with
`revision_not_approved`. `schedule` is a material field, so changing a committed date or time takes
this approval path. All three feedback tools require an approved Board channel and a sender whose
own community record currently identifies them as a director. The database additionally permits
an **active Contributor** as `author_contact_id`; registered tools do not expose that broader
permission. Comments record text without changing proposal versions. No revision moves, reserves
or pays funds.

**The Agent assembles candidates, but a person opens the poll.** A current director in an approved
Board channel invokes `rein_poll_open` by **vote type**. The tool reads that type's `max_candidates`
and uses `listCandidateProposals` to assemble same-type `submitted` and `unselected` proposals,
prioritizing recent unselected proposals for reconsideration. The database freezes the candidate
list and both limits. Callers cannot supply candidate lists, limits or option names: `options`,
`candidateIds` and `maxApprovalsPerVoter` are rejected with `policy_argument_rejected`; `options`
also yields `legacy_options_unsupported` at the write layer. Thus C14/D08's “recent proposals plus
previously unselected proposals” and per-type candidate limits have a registered code path.

Two items remain open: **actual candidate and approval limit values** are operational configuration
to be seeded into `<env>_rein_vote_types` (the Events example of 10 is illustrative, not a global
policy); and **there is no automatic poll-opening entry point triggered by a proposal**. A director
chooses a type to start a round. Proposals and polls have no foreign-key relationship, and
`rein_governance_proposal_submit` and `rein_poll_open` remain separate writes.

**Before the deadline, results are provisional.** `rein_poll_result` reports `closed = false`,
`status = 'provisional'` and `official = false`, without counts or a winner. After closing,
`<env>_rein_finalize_poll` counts accepted stored ballots and persists the result. Eligibility is
not recalculated against today's registry, and rejected ballots never enter the database.
**Results return only to the current call; they are not automatically posted to Slack.**

**Keep the two result boundaries separate.** The database determines closure at the deadline, not
the caller. Before then, `rein_poll_result` returns `status = 'provisional'`, `ok = false`,
`official = false` and readable facts (`closed = false`, `closesAt`, stored ballot count), but
**no tally or winner**. At the deadline, the tool calls `<env>_rein_finalize_poll` to close and persist
the round. Universal abstention persists `outcome = 'no_winner'`, `winner = null`. A top-approval tie
also persists those values, while `approvals` preserves each candidate's count for Board review.
The tie policy is **unconfirmed**: do not announce this as formal organizational policy or break
the tie without authorization.

**Replay protection is limited.** When the runtime creates tool context for a conversation turn,
it generates and memoizes a random UUID for each `(toolCallId, action)` pair. Retrying `execute`
**within the same turn** reaches the same row and is reported as an exact duplicate, but memoization
does not cross contexts. A tool-call ID is not a trusted inbound message ID: Slack redelivery or a
retry in a new turn generates another ID and can create another record. Cross-process exactly-once
behavior requires a trusted host event ID and was not established by this record.

The historical single-workspace model fixed one Slack workspace per deployment. Within channel
policy, channel/group messages and DMs both supplied trusted per-message `requesterSenderId`;
channel messages were not weaker identity evidence. The v2 tool context lacked a Slack team/workspace
ID, so configuration had to fix the team. Pointing that model at multiple workspaces could map a
sender to the wrong community record.

Weighted voting, participation thresholds/quorum, recusal, budget competition/ranking, payment and
settlement, activity spaces/reminders, outcomes/articles, website publishing, oversight/weekly
reports, a second platform and on-chain migration remained deferred in the recorded slice, with
their local modules unregistered. Deferred units must not be described as part of that v0.1 slice.

## v0.1 backend deployment runbook (authenticated backend service)

These steps connect the slice to **one authenticated backend service** and an isolated database,
registering each workspace separately for Slack, Discord or both.

> **Architecture change, 2026-09-30.** The Agent no longer holds database credentials or accesses
> tables directly. Governance reads/writes, identity resolution and linking use backend endpoints
> `/api/agent/operations`, `/api/identity/resolve`, `/api/ingress/relay` and `/api/identity/link/*`.
> **The old instruction to give the Agent a Supabase URL and service key is superseded.** Former
> executable steps 3, 4 and 6 were rewritten for the new architecture. Earlier migration records
> remain historical evidence, not current operating instructions. Each step requires human execution
> and review; the runtime Agent does not create tables, seed records, create apps or write credentials.
> Do not target production data before completing the prerequisites, and never commit real member
> information or credentials.

1. **Prepare the official chat plugin and connection mode.** Use the official `slack` plugin bundled
   with the pinned `vendor/openclaw` commit in Socket Mode, which needs no public callback URL.
   Create a Slack app, enable Socket Mode, install it in the approved workspace, and invite the bot
   to approved proposal and Board channels. `mode: socket` requires bot and app-level tokens; a
   signing secret is needed only for HTTP mode. **The Agent does not read profile emails.** D13's
   earlier `users:read`, `users:read.email` and `slackBotTokenEnvVar` are no longer needed; do not
   install those scopes for this purpose. Add Discord as a separate workspace entry rather than
   replacing the existing workspace.
2. **Store only server environment references in configuration.** The Agent names four variables:
   backend base URL, registered caller ID, Agent credential and the proposal-confirmation signing
   key used by writes. Inject values through server environment variables or the runtime's secret
   store. Configuration contains names only. Never commit tokens, signing keys or workspace IDs;
   `scripts/check.mjs` also rejects JWT-like or `sb_secret_` literals in plugin files. Workspace IDs
   are not secrets, but still belong in deployment configuration rather than tracked files.
3. **Backend operators apply database migrations.** The database belongs to the backend. The Agent
   neither connects to it nor holds a service key. The first two sibling-repository migrations were
   applied in filename order to linked `BeneficenceProtocol`, project ref `ksgyfyysnojqrwfuyqwe`.
   Both appeared in the 2026-09-27 read-only `supabase migration list --linked` check. Each creates
   both DEV and PROD objects in one transaction; the second explicitly loops over
   `array['dev_', 'prod_']`. The third and fourth migrations were also applied. For another
   environment, review and apply them in the same order:
   - `20260924094436_rein_slack_identity_and_fund_snapshots.sql`: identity links and append-only
     available-funds snapshots.
   - `20260924095705_rein_mvp_proposals_polls_ballots.sql`: proposals, polls, ballots, vote types with
     `max_candidates` and `max_approvals_per_voter`, revision records and `effective_revision_id`,
     plus triggers/RPCs to freeze candidates, validate current-director ballots, tally results and
     approve material revisions. This migration originally used stage-prefixed names, renamed by
     the forward migration below.
   - `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`: sets `NEW.cast_at := now()` before checking
     the voting window for both DEV and PROD ballot triggers. It was committed in the sibling
     repository and **applied to the linked project**; the 2026-09-28 check confirmed the version and
     both clock functions.
   - `20260927110000_rein_governance_names.sql`: renames five physical tables and two RPCs to
     `<env>_rein_vote_types`, `<env>_rein_proposals`, `<env>_rein_polls`, `<env>_rein_ballots`,
     `<env>_rein_proposal_revisions`, `<env>_rein_finalize_poll` and `<env>_rein_approve_revision`.
     It was **committed in PR #13 and applied to the linked project**; the 2026-09-28 check found its
     version and all ten renamed physical tables. It follows `20260927103000` in the correct order.
     Transitional views and wrappers were later removed by the applied
     `20260929045543_remove_stage_compatibility_objects.sql`. Applied names alone do not establish
     live end-to-end Agent verification.

   The first two migrations were committed on sibling PR #13 (recorded head `78281fa`, original
   commit `4bd5ce8`) and applied to both prefixes. **Applied and rehearsed does not mean in production.**
   Synthetic tools read and wrote linked DEV fixture rows; PROD business rows stayed at zero.
   PROD business data, real member/funds data and production end-to-end behavior remained
   unverified. Writing real PROD data requires a separate decision. The third and fourth migrations
   made database-clock rules and stable names active; the fifth migration removed compatibility
   objects. None of this proves the tools worked end to end. Migrations contain no candidate/approval
   policy defaults: operators seed `<env>_rein_vote_types`, and RPCs calculate results from stored
   ballots at the deadline.
4. **Backend operators also seed records.** Through reviewed backend administration paths, populate
   canonical contacts, Contributor `active` status, director `person_type`, the first available-funds
   snapshot, and each type's `max_candidates`/`max_approvals_per_voter` in `<env>_rein_vote_types`.
   **Authoritative identity is the backend's canonical verified binding**, allowing multiple bindings
   per contact, not email matching. The Agent does not create these records, expose registration
   tools or read emails. Limits require organizational approval; do not insert fictitious people
   into a real environment. Seed stable names only: compatibility views have been removed.
5. **Register approved workspace and channel IDs.** Each `foundationDb.workspaces` entry contains
   `platform` (for example `slack` or `discord`), `workspaceId` and `nativeChannelIds`. Every
   `proposalChannelIds` and `boardChannelIds` value must belong to a workspace entry. Tools select
   **exactly one** workspace from trusted `messageChannel` and channel ID, allowing multiple
   workspaces without identity mixing. The legacy single-platform `platform` default is optional;
   otherwise the workspace list determines platforms.
6. **Explicitly enable `foundationDb`.** In `runtime/openclaw/openclaw.json`, add it under
   `plugins.entries.rein-operations.config`: `enabled: true`, optional `platform`, `workspaces`,
   `proposalChannelIds`, `boardChannelIds`, optional `voteTypeAliases`, and environment variable
   names `backendApiBaseUrlEnvVar`, `agentCallerIdEnvVar`, `agentCredentialEnvVar`. Writes also need
   `proposalConfirmationKeyEnvVar`. Store names, never values. **Legacy fields `slackTeamId`,
   `environment`, `supabaseUrlEnvVar`, `supabaseServiceKeyEnvVar`, `identityEmailMatch` and
   `slackBotTokenEnvVar` are rejected, not used as fallbacks.** Without `enabled: true`, the
   19 backend tools do not register.
7. **Verify before connecting.** Run `npm run toolchain:pnpm -- run check`,
   `npm run toolchain:pnpm -- test` and `npm run toolchain:pnpm -- run verify:plugin`, then
   `npm run toolchain:pnpm -- openclaw plugins doctor` and
   `npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json`.
   Confirm `rein_status` and all 19 backend tools in the [current inventory](setup.md#5-inspect-the-plugin),
   with simulators and local proposal tools hidden. Rehearse
   the ten synthetic cases in `docs/agent-test-cases-zh.md`, retaining sender IDs, tool-call IDs
   and backend records.

**There are no automatic payments.** A passed vote records a decision; it does not reserve or pay
funds or change a funds snapshot. Authorized people handle payments, reimbursement and settlement
outside the Agent. Budget competition and allocation amounts are outside v0.1.

## Deployment and local isolated runs

Backend settings can be stored in this repository's Git-ignored `.env.local` with mode `0600`:
`REIN_BACKEND_URL`, `REIN_AGENT_CALLER_ID`, `REIN_AGENT_CREDENTIAL` and
`REIN_PROPOSAL_CONFIRMATION_KEY`. Starting through `npm run toolchain:pnpm -- openclaw ...` loads
only these four variables, with existing process environment values taking precedence. Other
account credentials in the file are not injected. Custom variable names must still be supplied
by the launching environment. Restart an already running Gateway to load new values.
`REIN_BACKEND_URL` defaults to `https://rein-protocol.org`; no local Website service is required.
Override the address only for isolated development, using a backend with DEV data and matching
caller credentials. `DATABASE_ENVIRONMENT` and database credentials stay in backend deployment
settings or the Website repository's `.env.local`; they are not imported from the sibling repository
into the Agent.

1. Obtain the repository and official runtime:

   ```sh
   git clone --recurse-submodules https://github.com/rein-protocol-foundation/nori-agent.git
   cd nori-agent
   node --version # Requires >=24.16.0 <25 or >=26.1.0; commands use the local toolchain
   npm run toolchain:pnpm -- --version # 12.4.2
   npm run toolchain:pnpm -- exec node -v # Expected v24.16.x
   ```

2. Install and build:

   ```sh
   npm run toolchain:pnpm -- install
   npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile
   npm run toolchain:pnpm -- --dir vendor/openclaw build
   npm run toolchain:pnpm -- run setup:local
   ```

`setup:local` creates only `runtime/openclaw/openclaw.json`, binds to loopback and generates a
Gateway token. This directory is Git-ignored; do not copy it into a shared repository.

`npm run toolchain:pnpm -- <arguments>` forwards everything after `--` to the repository's pinned
local pnpm toolchain (`toolchain:pnpm` in `package.json`), so no `export PATH` is necessary.
`-- install` and `-- --dir vendor/openclaw install` reach pnpm directly; `-- run <script>`, `-- test`
and `-- openclaw <arguments>` use the toolchain's Node even when the system Node is older. With no
arguments after `--`, pnpm prints its own help. To put the toolchain on `PATH`, run
`export PATH="$PWD/.toolchain/node_modules/.bin:$PATH"` once in that terminal; then `pnpm run check`,
`pnpm test` and `pnpm openclaw ...` are equivalent. Without the wrapper or PATH change, ensure pnpm
is exactly `12.4.2` and Node is within the supported range.

3. Verify and start:

   ```sh
   npm run toolchain:pnpm -- run check
   npm run toolchain:pnpm -- test
   npm run toolchain:pnpm -- run verify:plugin
   npm run toolchain:pnpm -- run verify:proposal-tools
   npm run toolchain:pnpm -- openclaw plugins list --verbose
   npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json
   npm run toolchain:pnpm -- openclaw gateway run
   ```

   In another terminal, run `npm run toolchain:pnpm -- openclaw gateway health --port 18791`
   (unauthenticated readiness probe) and `npm run toolchain:pnpm -- run smoke:gateway`. The latter
   checks only the isolated Gateway's status tool; it creates no activities, channels or articles.

4. Before a real pilot, record the approver, policy version, effective time and one chat platform
   in `docs/decisions.md`. Connect trusted platform account IDs, authoritative member records,
   funding sources and website services, then implement and test adapters. Before writes,
   externally exposed tools must reauthorize the actual requester, resource and audience. Passing
   synthetic tests does not prove a real adapter works.

   Providers must satisfy the [chat, identity, funding and website contracts](integration-contracts.md),
   especially lookup by idempotency key after timeouts and explicit permission scopes.

   To trial only the proposal tools, add the following under
   `plugins.entries.rein-operations.config` in `runtime/openclaw/openclaw.json`, replacing values
   with the **approved** single platform, native channel IDs and absolute local path:

   ```json
   {
     "proposalTools": {
       "enabled": true,
       "platform": "discord",
       "allowedNativeChannelIds": ["APPROVED_NATIVE_PROPOSAL_CHANNEL_ID"],
       "statePath": "/ABSOLUTE/PATH/TO/runtime/rein-proposals.json"
     }
   }
   ```

   `discord` illustrates the format, not an organizational platform choice; `slack` is also valid,
   and the historical P0 mode enabled only one. Without `enabled: true`, the four proposal tools
   do not register. That plugin path has no authoritative registry provider, so confirmation and
   submission return `authoritative_registry_required` even when enabled; drafting and revision
   can be tried in isolation. Synthetic registry authorization callbacks are not production
   adapters. Tool-call IDs guarantee retries of the same call only, not cross-call uniqueness
   based on trusted inbound message IDs.

   For the v0.1 slice, use `foundationDb` in the same file instead: `enabled`, `workspaces` (each
   with `platform`, `workspaceId`, `nativeChannelIds`), `proposalChannelIds`, `boardChannelIds`,
   optional `voteTypeAliases`, and environment variable names `backendApiBaseUrlEnvVar`,
   `agentCallerIdEnvVar`, `agentCredentialEnvVar`, plus `proposalConfirmationKeyEnvVar` for writes.
   **The Agent no longer holds database credentials.** Backend URL, caller ID, credential and
   signing key come only from server environment variables; configuration has neither their values
   nor database URL/service-key fields. The current plugin registers 19 backend tools (governance, identity and community) and hides
   simulators/legacy proposal tools. The backend owns the database and both DEV/PROD schemas.
   Earlier direct writes in the real test workspace and linked DEV tables belonged to the prior
   build; PROD business writes were zero and PROD data had no end-to-end verification. That
   rehearsal evidence authorizes no production testing: rehearsals must target a DEV or isolated
   backend environment.

## Naming and the rename migration

Pre-launch review required removing stage-prefixed names from tools, tables, configuration and
skills. The stable v0.1 names are the 14 tools `rein_member_status`, `rein_funds`,
`rein_poll_candidates`, `rein_vote_type_resolve`, `rein_proposal_collect`,
`rein_governance_proposal_submit`, `rein_poll_open`, `rein_poll_vote`, `rein_poll_result`,
`rein_proposal_comment_suggest`, `rein_revision_approve`, `rein_revision_apply`,
`rein_identity_bind_start`, `rein_identity_bind_complete`, and the `foundationDb` configuration block.
Because the two base migrations were already applied, table/RPC names could not be edited in place.
The **forward migration** `20260927110000_rein_governance_names.sql`, after committed
`20260927103000`, renames physical tables and two RPCs. It was **committed in PR #13 and applied to
the linked project**, verified read-only on 2026-09-28. The transitional compatibility views and RPC
wrappers were later removed by applied `20260929045543_remove_stage_compatibility_objects.sql`.
**Applied does not mean live-verified**; it does not prove the Agent ran the renamed interfaces in a
real environment. See the [contract naming section](integration-contracts.md#naming-and-the-rename-migration)
for the complete interface list. Source and test filenames also use stable v0.1 names.

Caller-visible names changed too: malformed `foundationDb` returns `foundation_db_config_invalid`,
and absent/empty referenced variables return `foundation_db_env_value_missing`. `rein_status`
reports `foundationDbReadToolsEnabled`, `foundationDbWriteToolsEnabled`,
`foundationDbCollectToolsEnabled` and `foundationDbFeedbackToolsEnabled`. These are code interfaces,
not migrations. `rein_proposal_collect` uses the same `foundation_db_*` errors as other tools, and
its error prefix is `foundationDb proposal collect tool`. At the time of this record, PR #13 had not
merged, but `20260927110000` was already applied. It is self-contained: for each environment it
renames five tables, two RPCs, ten helper/trigger functions, references to physical tables/functions/
GUCs in their bodies, and related triggers, constraints and indexes. It no longer depends on the
old names it replaces. Applied migrations are immutable history; the two `20260924*` base files keep
their original names. Future naming changes require another forward migration. Compatibility
objects were removed by `20260929045543_remove_stage_compatibility_objects.sql` and no longer resolve.

**Compatibility names have been removed.** They were a transitional mechanism, not a permanent
contract. The linked schema answers only to stable `<env>_rein_*` names after the cleanup migration.

## Ten Agent rehearsal cases

These were rewritten as **v0.1 Slack scenarios with synthetic identities and fictional activities**.
Evidence combines module tests with synthetic rehearsals on real providers: a real test Slack
workspace and the linked DEV tables. **They are not launch acceptance**: no real member registry,
no PROD business-table writes and no production deployment were involved.

See the [ten v0.1 acceptance cases](agent-test-cases-zh.md) for messages, preparation, expected
database records and real-provider evidence.

The [2026-09-28 governance acceptance record](governance-acceptance-2026-09-28.md) concludes that cases
2–10 passed on synthetic development evidence; case 1 was skipped by the owner and **did not pass**.
The recorded PR head had unit/loader verification only, no post-rename Slack rerun and no PROD
business-table writes. Production migration and release gates remained open.

| # | v0.1 Slack scenario | Required observation | Acceptance |
| --- | --- | --- | --- |
| 1 | An unlinked newcomer asks how to propose | Explain human-led identity linking (guidance remained an acceptance gap); attempted submission returns `identity_link_required`; no proposal write; self-declared member IDs/roles are ineffective | AC01 |
| 2 | A linked but non-`active` Contributor proposes a USD 165 workshop | `contributor_status_required`; no proposal write, self-approval, reservation or payment | AC01, AC04 |
| 3 | An active Contributor has a vague idea and the Agent asks for missing fields | No submission/write until complete; conversational field collection is Agent-led, with no multi-turn draft tool (acceptance gap) | AC02 |
| 4 | An active Contributor completes and submits a proposal | One row linked to the sender's contact; random UUID, same-call retry reaches the same row; `authorizesSpending = false` | AC02 |
| 5 | A current director opens a Board-channel poll by vote type | Tool assembles candidates from the database; caller-supplied candidates/limits return `policy_argument_rejected` / `legacy_options_unsupported`; one poll row, frozen candidates/window; the recorded absence of a list-votable-proposals tool was an acceptance gap | AC16 |
| 6 | Directors vote in natural language, including abstention | Three stored ballots; empty approvals mean abstention and contribute none; per-round `maxApprovalsPerVoter`; mapping natural language to `approvedProposalIds` is Agent-led (acceptance gap) | AC07 |
| 7 | Query before and after closing | Before: `provisional`, `official = false`, no tally/winner. After: persisted `outcome` / `winner` / `counts`. Re-reading a closed round returns `repeated = true` without retallying; narration/posting remained an acceptance gap | AC06, AC07 |
| 8 | Feedback on a passed proposal: ordinary title/summary versus material budget/schedule change | Ordinary revision applies with `acceptedBy = 'agent'`; material revision is blocked by `revision_not_approved` until current-director approval, then applies with `acceptedBy = 'director_approved'`; no financial records | AC07 |
| 9 | A director queries a known USD snapshot and unknown EUR currency | Known: amount, currency and timestamp. Unknown: `unknown` / `no_snapshot` / `availableMinor = null`, never zero or an inferred balance. No allocation, reservation or payment; conversational mapping to `currency` remained an acceptance gap | AC15 |
| 10 | Someone asks the Agent to reserve and pay funds based on a passed vote | Explicit refusal: approval is only a decision record. No reservation, payment, funds-snapshot change or financial record; provide a human next step | AC04, AC08, AC15 |

Post-result feedback/revisions are included in case 8 rather than separately numbered. See the
[ten rehearsal cases](agent-test-cases-zh.md) for boundaries and regression expectations.

## Verification scope and unfinished work

The 2026-09-24 local verification used official OpenClaw commit
`4a11f89e840b2bb3eedcad2820ab25b8520905b6`, Node 24.16.0 and pnpm 12.4.2. The table preserves the
original commands with the local toolchain already on `PATH`. The wrappers above were introduced
for routine use without a PATH change. Only wrapped `check` was separately verified in that pass;
the other historical results are not presented as tests of the wrapper commands.

| Command | Result |
| --- | --- |
| `pnpm run check` | Passed: structure, unapproved configuration, PRD hashes, tool inventory and `foundationDb` configuration constraints |
| `pnpm test` | Exit 0, 618/618 passed, zero failures; includes `proposal-feedback-tools` 34/34 (Agent-applied ordinary revisions and director-gated material revisions), `governance-rehearsal` 4/4, `vote-tally` 19/19, `foundation-db-writer` 196/196. Closed-round replay was fixed: `rein_poll_result` returns the stored result with `repeated` |
| `pnpm run verify:plugin` | Exit 0, **loader-level** only: real OpenClaw loader imports three default read-only tools, and a temporary isolated configuration registers the recorded 14 backend tools, hides simulators/legacy proposal tools, and keeps secrets out of output. This proves registration/loading, not Slack, database or provider connectivity |
| `pnpm run verify:proposal-tools` | Exit 0, **loader-level**: four v2 proposal tools register with temporary isolated configuration; no real platform connection |
| `pnpm --dir plugins/rein-operations pack --dry-run` | Exit 0: package includes `proposal-feedback-tools.ts` and `proposal-revision-rules.ts`, so feedback modules ship with the package |
| `pnpm run smoke:gateway` | Passed: authenticated `rein_status` call through the isolated Gateway |
| `git -C vendor/openclaw status --porcelain` | No changes |

Run `npm run toolchain:pnpm -- run smoke:gateway` after the Gateway reports `ready`; a connection
refusal during startup is not a tool failure. These results do not cover real chat, website or
funding interfaces. `tests/p0-rehearsal.test.mjs` joins two activity flows across modules and ends
with pending external intents, not fabricated channels or articles.

AC09/AC14 external channel/website uniqueness, AC16 real-channel privacy isolation and AC20's two
real end-to-end flows require a selected platform and provider contracts; they cannot be marked
passed. Payments, signing, membership elevation and weights remain with authorized people and
independent processes.

The delivery worker is a local module with injectable providers and does not connect itself to real
platforms. Cross-process concurrency on one intent still requires the provider to enforce uniqueness
by Rein idempotency key. Core receipts validate identifiers, keys and article links but cannot prove
provider authenticity. The change coordinator can execute a few actions with core APIs, including
activity cancellation and pause. Registration pages, reminders, owner permissions and financial
review remain explicitly pending and cannot be claimed as propagated. After interrupted cross-core
transactions, pending markers retain an unknown outcome for human reconciliation; AC11 still needs
a complete executor and real-provider acceptance.

The table is a dated 2026-09-24 record, not a continuing guarantee. It records local/loader tool
registration, not production acceptance. Later 2026-09-27/28 synthetic rehearsals produced real
test-workspace and DEV-table evidence using the pre-rename build, with zero PROD business writes;
the recorded PR head had no real Slack rerun after renaming.

### 2026-09-27 review: Supabase/PostgREST boundary integration tests (**superseded**)

> **Since 2026-09-30, this subsection is historical only, not current instructions.** It describes
> the prior implementation, where the Agent held a service key and accessed PostgREST directly.
> That implementation and `tests/foundation-db-gateway.test.mjs`,
> `tests/foundation-db-reader.test.mjs`, `tests/foundation-db-writer.test.mjs` were removed with the
> architecture change. All database access now belongs to the backend service. Do not give the
> Agent database credentials based on this section.

That review added `tests/foundation-db-gateway.test.mjs`: reader and writer used global `fetch`
against a real loopback HTTP server simulating PostgREST routes and Supabase header rules. It covered
modern `sb_secret_` keys and legacy `service_role` JWTs, asserting 401 maps to `auth_error` and 5xx
remains `http_error`. This was transport integration, **not a real PostgREST instance or project
connection**. With Node 24.16.0 and pnpm 12.4.2, the full gates were rerun:

| Command | Result |
| --- | --- |
| `npm run toolchain:pnpm -- run check` | Passed, exit 0 |
| `npm run toolchain:pnpm -- test` | Passed, exit 0: 756/756, zero failures, including seven new `foundation-db-gateway` tests |
| `npm run toolchain:pnpm -- run verify:plugin` | Passed, exit 0: loader-level default three tools and isolated 14 backend tools; simulators/legacy proposal tools hidden |
| `npm run toolchain:pnpm -- run verify:proposal-tools` | Passed, exit 0: loader-level four v2 proposal tools |

These are local and loader-level results, not real-chat or production acceptance. Separate synthetic
rehearsals used real test Slack and linked DEV tables (see the
[2026-09-28 governance acceptance record](governance-acceptance-2026-09-28.md)), but used the pre-rename
build, made zero PROD business writes, and did not establish a post-rename real Slack rerun of the
recorded PR head.

See the [AC01–AC20 acceptance matrix](acceptance-evidence.md) for complete evidence and remaining gates.

## DOCS-AUTO-PULL — November 14, 2026

Verification: 82 Python tests passed (22 new real-Git source-sync tests), plus scaffold
and whitespace checks. Production acceptance remains pending.

Owner: Codex. The updater now inspects the full current-checkout-to-target Git diff. Only
known ordinary documentation files fast-forward in place, preserving runtime files/private
state and the validated-artifact cache index. No build, restart or deployment report is issued
for this path. Unknown paths, workspace Markdown, code/configuration, nonregular files and
non-fast-forward targets retain normal deployment. A durable source-sync journal supports
retry/recovery without resetting concurrent edits; receipts distinguish `source_synced` from
`updated` and status keeps source/runtime revisions separate.

Local real-Git and existing updater regression verification recorded with the PR. No live
controller installation, application deployment, merge or Slack send was performed. The
controller is outside the application checkout: install the reviewed version under its lock
with a backup and no active transaction before expecting live behavior. Next: CI/review,
then authorized controller installation and a merged documentation-only PR acceptance.
No product milestone advancement. [Runbook](auto-update-zh.md#纯文档自动拉取).

## 2026-11-16 — Scope documentation PR preparation

Owner: Codex. Seven documentation files isolated from unrelated uncommitted runtime diagnostics.
Reconciled owner-accepted Community runtime scope and November 15 scoped continuation acceptance.
Scaffold, document links and whitespace checks pass; runtime tests not applicable to this docs-only change.
Next: authorized PR, CI/review and merge; no deployment or business-tool expansion.

## 2026-11-18 — SA-OBS-02 receipt schedule recovery

Owner: Codex. Applied the operator-requested 07:30 America/Los_Angeles schedule to the existing daily receipt job using native authenticated RPC. Read-back confirmed exact schedule, enabled state and November 19 15:30 UTC next run. Preserved command, timeout, delivery settings and prior send records; saved private schedule rollback. Local collector retry patch discards partial pagination and retries once after 1 second; 18/18 targeted tests and scaffold passed. Runtime retry patch is not deployed; normal merged-PR rollout remains required. Next: deploy the optional robustness patch through that flow and verify the next clock-triggered delivery. No gateway restart or additional Slack send.

Live integrated preview also passed with the current production renderer: source export, usage refresh and PNG generation for November 17 completed without sending. Output was isolated under the private schedule-fix-preview directory; original artifacts and delivery state were preserved. This verifies generation outside the contention window, not the undeployed retry or next scheduled delivery.

## November 19, 2026 · Scheduled development compatibility

SA-OPS-01 / SA-M1. Codex tested native scheduled collection on OCI with a synthetic Slack transport. Production settings and legacy thread routing require the separately reviewed cutover. [Verification](slack-scheduler-compatibility.md).

## 2026-11-19 — COMMUNITY-PROFILE-LINK

Owner: Codex. Implemented optional existing-profile association for Discord/Slack public introductions and companion self-only backend API. Synthetic checks passing; native linked-profile registration passed; full optional enable/disable checks and production activation pending. Original checkout changes preserved in a separate worktree. A first loader attempt failed for missing worktree dependencies; local dependencies were reused without editing vendor source. Next: complete loader/CI, deploy backend before Nori, activate under updater lock and verify retained cron/archive/config. Real two-human acceptance remains pending.

Codex activated the administrator-reviewed main routing and scheduling configuration on OCI. Both Gateway health checks passed. Sixteen original job definitions, 46 private files and the baseline history checks passed. Production natural-language timer creation, same-ID adjustment, automatic SSH sandbox execution and thread delivery succeeded. The initial named-harness attempts exposed a runtime-selection error and brittle model transcription of the assignment. The follow-up covers both and passed 104 focused checks. Codex execution and retained-summary readback await production confirmation.

2026-11-19 · Codex deployed PRs #121, #125 and #126 to OCI. The formal-channel timer, two Codex flows and same-thread summary lookup were verified. The final revision closed the CLI task autonomously after a bounded supplement. The dedicated Claude account still needs an organization login. [Release and acceptance](slack-scheduler-compatibility.md#production-acceptance-on-november-19-2026).

2026-11-19 America/Los_Angeles · Administrator approved the additional CODEX_PATH launcher difference. The isolated ACP launcher now selects official Codex CLI 0.170.0. Live ACP initialize and session/new succeeded and reported gpt-6.2-astra[high]. Actual parent/child turn_context records verified gpt-6.2-astra/high and routine gpt-6.2-sol/low with the development policy present. The launcher backup is stored under /var/backups/nori-codex-launcher-20261120T002636Z. Configuration is installed in the isolated service account, outside the replaceable application checkout.

2026-11-19 · Marked the requested lifecycle, retained-summary deletion and autonomous development acceptance scope complete, linked its existing live evidence and corrected stale status headers. This is a documentation and branch-cleanup closeout. Separate PR #132 remains open.

## NORI-BRANDING · 2026-11-19

Updated local initialization, community config builders and task reply instructions. Existing installations require the documented config delta where the target is implicit. No deployment. Next: upstream direct-notice renderer and channel acceptance. [Nori branding](nori-branding.md). Owner: Codex.

## NORI-BRANDING · 2026-11-20

Implemented Nori rendering for recognized typed chat notices, Discord realtime voice defaults and plugin display labels. Existing explicit voice prompts take precedence. No deployment or live channel sends. [Coverage and pending producers](nori-branding.md). Owner: Codex.
