# Acceptance evidence

## 2026-11-19 · Slack participation context

Two actual unmentioned development requests were admitted to the classifier and suppressed at helpfulness 0.61 and 0.24. A private replay supplied five earlier messages per request to the revised rubric. Hosted Jev admitted both at 0.95 and 0.96. A synthetic two-person exchange about Nori remained silent at 0.13. These are classifier observations. No Slack messages or tasks were replayed.

## 2026-11-20 UTC — SA-M1 / SA-M2 — original-thread follow-up and deletion

Owner Codex. Two real Codex runs produced seven and thirteen passing tests. Both requested a native parent yield and were denied. During each run the owner-bound run lookup changed from the original task ID to the linked Flow projection ID. The host captured a settled lifecycle event for each child. At the subsequent read-only inspection, only stage one had a retained copy and the original thread had no queued inputs. No deletion had succeeded. The local task, review, summary and scheduler regression suites passed 125 tests. Two native Gateway probes passed with synthetic transport, model and harness. OCI deployed PR #139 as `227e8a7` at 03:15:46 UTC.

In the original private Slack thread, an initial request created a fresh text-statistics CLI. A subsequent request added `--stdin` to the same project. Each stage launched Codex once, yielded and completed parent review without a human reminder. The parent read the 1,254-byte and 1,965-byte verification reports. The first review corrected a nonempty gaps field before completion. The authorized human then requested two `read_summary` calls. Both returned `complete` and `expiresAt=null`, with six and ten passing tests respectively. The completed summaries and the child reports were independently observable.

| Post-deletion check | Production evidence |
| --- | --- |
| Four selected test Flows | Three existing copies returned `retainedCopy=deleted`. The original failed follow-up had no copy. All four subsequent reads returned `unavailable_or_deleted`. |
| Tombstones and summary index | Native status on each of the three completed Flows returned `summaryRetention.status=deleted`. The scoped list returned zero rows and a null cursor. All three rereads remained unavailable. |
| Slack thread | All 31 messages observed before the deletion request retained their IDs and text. |
| Test artifacts | SHA-256 matched for all five files in each project, including both `TASK_SUMMARY.md` files. The four assigned review files also matched. |
| Native execution and tests | Four Flow IDs, six Task IDs and their recorded states were preserved. Before and after deletion, read-only, network-isolated unittest runs passed 13/13 for the earlier project and 10/10 for the new project. |

The earlier failed follow-up remains `cancellation_pending` after its deadline. Its historical result is distinct from the two new, reviewed runs. The live harness in this retest was Codex. [Release PR #139](https://github.com/rein-protocol-foundation/nori-agent/pull/139).


## 2026-11-19 — Super Agent v2

An OCI replay exercised five recorded Slack inputs and one duplicate concurrently. Four hosted Jev calls succeeded. The candidate suppressed the fifth input at capacity and rejected the duplicate. A 100 ms deadline returned silence after one call. With paid inference disabled, the same help request returned silence with zero calls. These were isolated replays without outbound Slack delivery.

OCI 用五条已记录的真实 Slack 输入和一个重复事件做并发回放。四次托管 Jev 调用成功，第五条触及并发上限，重复事件被抑制。将截止时间设为 100 毫秒后，一次调用超时并返回静默；关闭付费推理后，同一求助输入零调用并返回静默。这组回放在隔离环境执行，未向 Slack 发信。

A Slack CLI test sender initially received a generic error for `/status`. With its identity explicitly scoped to the test room and native commands, Slack returned the native status table. The sender selected `bailian-token-plan/auto` for that thread, verified the model with a second status read, and restored the default. The temporary grants were removed. A passive app-attributed message produced zero classifier calls and no candidate reply. The OCI executor retained the initial error and successful follow-up in separate private reports for Tempest.

Slack CLI 测试账号最初调用 `/status` 收到通用错误。将该账号明确列入测试频道及原生命令授权后，Slack 返回会话状态表。测试账号把该线程的模型切换到 `bailian-token-plan/auto`，再次查询状态确认生效，随后恢复默认模型并撤销临时授权。另一次带应用标记的普通发言未调用分类器，线程无候选机器人回复。OCI 分别保留了初次错误和后续通过的私有报告，供 Tempest 审阅。

The independent test gateway delivered an unmentioned help reply and a useful out-of-duty clarification. It silenced chatter. An admitted worker emitted NO_REPLY after enabling native optional silence for Slack groups. The default had emitted a visible error. Native threaded send/edit, scoped Linear delegation on #131 and delayed revocation were verified. The staging Foundation administrator flag was true for the verified sender and false in production. The #124 public summary was found in Linear after Markdown normalization.

独立测试网关已在线程投递免 @ 求助回复及职责外澄清，对闲聊保持静默。原生默认设置下，执行模型选择静默时出现可见错误；仅在测试网关允许 Slack 群聊静默后，已放行的真实模型返回 NO_REPLY，线程无回复。已验证原生线程发送和编辑、#131 的 Linear 限定委托和执行中撤权。已核验发信人在隔离 Foundation 后端的管理员标志为真，生产回读为假。规范化 Markdown 后确认 #124 公开摘要已同步至 Linear。

Tempest returned only `github-reopen` for retest and accepted the observed result in chat. After GitHub #123 reopened, Linear REI-17 retained Backlog and the adapter reported synchronized. The adapter wrote only to GitHub. The first-round passes for `linear-close` and `github-recovery` were carried forward without rerunning either check. The private OCI readback records the retest. This closes the three issue-sync checks; the formal reviewer receipt and overall v2 acceptance remain open.

Tempest 在聊天中只退回 `github-reopen`，并已确认复验通过。GitHub #123 重开后，Linear REI-17 保留 Backlog，适配器判定已同步，只向 GitHub 写入。`linear-close` 和 `github-recovery` 沿用首轮通过结果，两项均未重跑。复验回读已保存在 OCI 私有目录。三个工单同步检查均已通过；正式审阅回执及 v2 整体验收仍待完成。

SA2, owner Codex. The live provider checks include both directions of issue creation and state propagation, actual Backlog on GitHub reopen, and read-only recovery after deliberately losing a successful PATCH response. The private OCI report distinguishes passed from awaiting review. Slack real events and hosted shadow inference are recorded separately from isolated native dispatch and human decisions. [Independent 16-scenario verification matrix](super-agent-v2-verification.md).

## 2026-11-19 — Discord welcome and reminder copy

COMMUNITY-ONBOARDING-01; owner Codex. All 37 focused tests passed on Node 24.16.0.
Simulated Discord sends verified the daily invitation in separate and shared channels,
the Sunday invitation, and the opt-out wording. Eligibility, mention limits, cooldown,
and restart reconciliation passed their existing checks. Live verification is pending deployment.

## Development ACP text review

2026-11-19, SA-M1 / SA-M2, owner Codex. Read-only OCI inspection found the
reported 8,238-byte GTM report with 14 numbered candidates. The gateway service
user could read it, while the development SSH sandbox user could not. The canonical
ACP Task had succeeded with a blocked terminal outcome. Its owning Flow recorded
launch acceptance and still had no settlement or review at inspection time.

The pinned native Gateway probe passed for ordinary completion and for a normal
harness exit with a blocked deliverable. In the second case the parent read
the fixture file through the public SDK, recorded a blocked review and ran the
child exactly once. Transport, model and harness were synthetic. Run
`node scripts/verify-acp-settlement.mjs` with and without `--blocked-artifact`.
The 92 controller and compatibility tests passed, including file bounds, links,
owner-wake access and membership revocation.

Live Slack acceptance passed on November 20 UTC following deployment of `f19900a`.
A single GTM request in the private development channel launched one ACP child.
The first delivery reported the child's counts. At 01:24:23 UTC the parent tool
returned the full report. Hashing the returned UTF-8 text independently matched
the 13,420-byte file on disk, SHA-256
`fe319e56161bdd14e6ab941fd2e703370a3901127fbf6d57425a29d1c109b33b`.
Nori submitted its review at 01:24:57 UTC and replied in the requesting thread
with 16 skills across seven stages. The Flow recorded `succeeded`, review outcome
`complete` and a retained summary with no expiry. No reminder or second run was
needed. Link availability was not independently rechecked by the parent.
[Release PR](https://github.com/rein-protocol-foundation/nori-agent/pull/132).

## 2026-11-18 — Discord onboarding production archive

COMMUNITY-ONBOARDING-01; owner Codex. PR #117 passed all seven checks: full suite
1,558 tests, 1,554 passed, four existing conditional skips, zero failures; native addon
enable/disable loading passed. Deployed `faaa9d0` with clean updater transaction.
Under the update lock, preserved configuration/task snapshots, applied only the additive
reader settings, and restarted the shared Gateway. Health and actual plugin inspection
passed. Initial collection archived one original contribution with zero sends.
The saved native job is enabled at UTC16 with zero staggering, but is explicitly
**archive-only** pending Nori's welcome-channel Send Messages permission. All 14
previous task definitions remain. Real public reminders and human recall remain pending.
A subsequent regression excludes opt-out/resume control text from introduction-completion
classification, including legacy markers; local focused checks are 37/37.
[Details and recovery](daily-discord-onboarding.md).

## 2026-11-18 — Daily Discord onboarding

COMMUNITY-ONBOARDING-01; owner Codex. **LOCAL VERIFIED; NOT ACTIVATED.** Fixed PST
08:00 collection/welcome, original introduction evidence, and current-sender guild
recall are implemented as an optional addon. 25 focused synthetic tests, 34 existing
identity/routing/withdrawal tests, scaffold, and actual native plugin loading passed.
Read-only production member-list access succeeded. Channel choice, deployed source,
native job creation, scheduled delivery and real-member recall remain pending;
automatic cross-platform canonical identity retrieval is not implemented.
[Evidence and activation checklist](daily-discord-onboarding.md). No product milestone
or live acceptance is claimed; no messages were sent.


## 2026-11-18 — Discord member onboarding access

SA-M0 / #57; owner Codex; **requested restoration passed real acceptance**. PR #113 deployed
`cbb76c9`; #115 clarified pending email status and deployed `0e7a0f2`. Open DMs, current-member
self-check, email binding, resource queries, public web search/fetch and shared job-matching skill
were exercised in real Discord. The test account was unlinked, rebound through its actual received
email, and verified against the original member. Final restart preserved all compared histories and
main/Slack settings; real Slack task/summary reads passed. Event search was empty and detail tested
not_found, so positive event-detail acceptance remains unproven. No vendor changes or broader
roadmap completion claimed. [Evidence, boundaries and recovery](discord-onboarding-access-2026-11-18.md).

## 2026-11-18：ACP 结算证据修复（首轮真实验收通过）

SA-M1/SA-M2；Owner Codex。PR #111 七项 CI 通过（1496 插件测试通过、4 既有跳过），
已部署 b944c4c。真实 ACP 仅执行一次，父助手尚未 review 时 native_acp_lifecycle 凭据已落盘；
05:38 UTC 重启共享 Gateway 后凭据保留，父助手独立 23 测试通过并完成 review complete。
维护侧沙箱内另行 23 测试通过；摘要实际持久化且 expiresAt=null；原历史与45个私有文件保留。
另补父 status/review 与凭据保存并发时的限定一次重算，发布验收待完成。
旧 run 无可信记录不能追补，强杀前未持久化的原子窗口仍需上游 durable receipt；不宣称完整 PRD 完成。
[根因、边界及验收证据](acp-settlement-recovery-2026-11-18.md)。


## 2026-11-17：正式任务发布与自主开发闭环

SA-M1/SA-M2/SA-M2-06；Owner Codex。PR #98最终候选a56081a七项CI通过（插件1486通过/4既有跳过），
合并2aed6422并健康部署。rein-acp已从私有副本切回正式源码路径，共享Gateway与双Agent权限保持；
5个Agent原历史行、82个私有文件保留。Nori新单次ACP完成--min-count开发，先失败、实现、父助手审阅，
父助手和维护侧各23测试通过；native_wait/complete、无期限摘要真实回读、跨owner拒绝与缺失产物边界通过。
旧ACP缺失结算的历史问题仍保留，不宣称完整PRD验收；[完整证据、调用失败及重启记录](task-lifecycle-closeout-2026-11-17.md)。


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


## 2026-11-16：限定范围最终真实结果

SA-M1/SA-M2/SA-M2-06；Owner Codex。真实Slack验收确认3 retained/1空payload tombstone：旧摘要1147/6无到期、删除后status不复活、新ACP只读复验完整结算/父助手review/摘要跨重启回读。Nori自行开发stdin及父助手18测试通过。两个现场缺陷已修复，75定向通过；此前失败与旧flow run_not_settled仍如实保留。 [完整证据与限制](task-lifecycle-activation-2026-11-16.md)。

## 2026-11-16：获批配置、真实摘要控制与ACP修复

SA-M1/SA-M2/SA-M2-06；Owner Codex。实际配置/隔离探针及真实Slack摘要读取、改向、停止和显式副本删除见[逐项证据](task-lifecycle-activation-2026-11-16.md)。2份retained、1份空payload tombstone；原生Task/Flow和Slack原文保留。新ACP任务实际实现stdin功能，父助手与维护侧独立18测试通过；Flow终态后置关联失败仍保留，修复/重启验证未完成前不推进完整验收。

## 2026-11-16：任务摘要保留本地验证与真实任务验收进行中

SA-M2-06；Owner Codex/Astra High。用户决定无期限服务器保留摘要且保留Slack原文。
[可选摘要实现](task-summary-retention.md) 70定向、1436全仓通过/4既有跳过，实际plugin loader通过。
实际public worker覆盖九天旧摘要重启、分页、跨owner拒绝、会话reset连续性、并发删写和tombstone。
原生Flow cleanup是fixture模拟；真实用户保留/删除未通过前保持待验收。
[真实任务记录](task-lifecycle-live-2026-11-16.md)：#94七项CI通过后合并部署66700d0；
研究原线程交付及后台聊天/实际进度已观察；官方来源抽查后Nori补充两项勘误。
ACP产出代码独立13项测试通过，但两次terminal_outcome=blocked且有人工作业纠正，
不能把native succeeded或accepted算完整自主开发成功。配置启用与定向沙箱修复待明确批准。


发布跟进：#97最终七项CI通过，19:50:59 UTC部署9ed4cb2，四服务健康，69个私有/隔离静态文件内容与权限不变。rein-acp仍关闭；真实摘要验收未开始，未将发布视作产品完成。

## Task stop/change and recovery controls — November 16, 2026

#58 / SA-M2-01–05; owner Codex (runtime-verified Astra Medium). **LOCAL VERIFIED**.
[Evidence and exact limits](task-continuation-controls.md): 53 targeted tests pass, including 10 new
continuation cases; full repository 1418 passed / 4 existing conditional skips / 0 failures on the final version. Native seam `nori-continuation-YSnloe` passes actual
two-process persistence/wake/linkage/original-thread behavior with synthetic transport/model.
Policy-disabled M1 `nori-task-loop-pUfNLP` failed waiting for an independent ACP cancellation
report; unchanged standalone `nori-task-loop-KDVHQy` passes. Failure retained, assertion unchanged.
New controller cancellation races are synthetic, not live provider settlement acceptance. Existing
#91 live recovery scope remains accepted at its recorded version; no broader product check advanced.
Next: separately authorized real stop/change race acceptance; selected retention/delete SDK contract
and product duration remain unresolved. #54 strict whole-chain enhancement is deferred by owner.

Production follow-up (2026-11-16, Codex, SA-M3-01–05/#59): live Slack draft preview verified;
command identity normalization fixed with 22 passing focused tests. PR #95 passed all seven
CI checks/review and deployed as `e2c4083`; the original pending draft survived restart.
**LIVE TEST PASS at 17:21–17:22 America/Los_Angeles:** a leading space lets Slack submit the
exact approval as plain text. The original checkpoint resumed, Resend accepted the designated
test email and reconciliation verified `delivered`; repeated approval retained the same receipt
and original send intent. Runtime `9ed4cb2` includes #95. Connector attribution and bare-slash
client interception are recorded failures, not input-control failures. See the dated
implementation record for [Slack evidence](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794878546727399).
Provider delivery does not establish inbox placement/reading or real-partner sending authority.

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

## Community runtime limit evidence — 2026-11-14

#54 / #65, SA-M0-06; owner Codex. **BLOCKED — not product acceptance**.
[Native diagnostic and scope](community-runtime-limits.md): exact pin `4a11f89e`,
per-agent config rejection and uncooperative queue overlap reproduced; native timer
synthetic consumers settle and stale timer cleanup leaves successor untouched.
Existing admission/routing tests 20 passed / 0 failed / 0 skipped. Full model/tool,
fallback, reload/restart and production acceptance pending; no AC01–AC20 advancement.
Next: supported host deadline/settlement seam, then end-to-end local rehearsal.

## NORI-BRANDING — November 14, 2026

Verification follow-up: native Router browser smoke passed (synthetic providers); live Slack
readiness returned HTTP 200/ready and configuration comparison proved only the requested
channel entry changed.

Owner: Codex. Live inventories agree on 17 active channels; bot membership confirmed
for all. Missing deployment-channel entry added with mention gate; reload and socket
reconnection observed. Real-user reply acceptance pending; no test message sent.
Local Router/host-guard tests: 51 passed, 0 failed/skipped. Native denial branding
is not implemented; see [extension proposal and scope](nori-branding.md).
No AC01–AC20 milestone advancement.



## Current Super Agent acceptance scope — November 15, 2026

Owner: product owner (scope), Codex (documentation). **PLANNING UPDATED; NO NEW ACCEPTANCE.**
[PRD v0.7](super-agent-nori-prd-en.md) and the [concrete task/acceptance matrix](super-agent-delivery-plan.md)
now distinguish general coordination, public rollout/operations, optional delivered mail, and later
Nori-led Rein internal-tool expansion. Existing Community information and social/email linking remain
compatibility subjects, not new business development. Cross-task tool/Skill reuse and an isolated
requirements-to-code-to-acceptance exercise are explicit pending evidence. Historical source/CI/live
records below remain unchanged in scope; no checkbox is advanced. Retention, cancellation races,
ACP deadlines, delivery and public runtime limits remain open where recorded. No live checks ran.
Next: assign bounded work from the plan and record environment-specific results here.


| Task / date / owner | Status and evidence | Pending acceptance / next step |
| --- | --- | --- |
| Slack reaction permission / #77 / C02 support; 2026-11-13; Codex | **LIVE API VERIFIED / CONFIGURATION ONLY**. Reproduced `missing_scope`; added only `reactions:write` and completed operator-confirmed reauthorization. Same deployed credential and bot identity passed add/read-back/remove/cleanup; service PID unchanged. [Evidence](implementation-and-deployment.md). | Automatic acknowledgement timing, model-selected reactions and other conversation types not retested. Observe next normal mention; no C02, AC01–AC20 or product milestone advancement. |
| PR #83 compatibility / SA-M1-01–05; 2026-11-13; Codex | **LOCAL VERIFIED / CI FOLLOW-UP**. Cancelled completion prompt reads native owner-bound state before admission. 21 targeted tests; full suite 1393 pass / 4 skips / 0 fail; native `bQmAto` / `VDTCWA` pass, including standalone cancelled delivery. | Latest-head CI/review pending. No AC01–AC20 or product milestone advancement. [Evidence](implementation-and-deployment.md). |
| SA-M3-01–05 / #59; Slack button interaction; 2026-11-16; Codex | **IMPLEMENTED / LOCAL VERIFIED**. PR #99; 27 focused tests and pinned Gateway restart/interactive-dispatch fixture pass: native button registration, exact draft, wrong-user/thread rejection, duplicate/cancel refusal, one synthetic send, receipt refresh without model calls. | Real Slack card click and provider delivery on the new revision remain pending deployment; previous command-based live evidence is not button acceptance. Next: CI/review and authorized live verification. |
| SA-M3-01–05 / #59; 2026-11-13; Codex Astra Medium / verified Sol High | **IMPLEMENTED / LOCAL VERIFIED; product acceptance pending**. [Evidence](partnership-workflow.md): 21 focused tests; full suite 1390 passed / 4 conditional skips / 0 failed. Native `nori-partnership-qS7WYp` verifies loader enable/disable, exact preview, human command without model inference, distinct-process checkpoint recovery, unauthorized/wrong-thread/duplicate/cancel refusal, one synthetic POST and read-only delivery evidence. Captured-template restart failure fixed with durable versioned template; earlier failures retained. | No real Slack/mail/provider acceptance, deployment or remote CI claimed. M1 #74 merged; M2 #58 owner-closed with delivery evidence still unverified and separate changes preserved. Review local source, then separately authorize deployed-profile and designated-test-recipient acceptance; no M0/M1/M2 or AC01–AC20 advancement. |
| #58 / PRs #87–#90; 2026-11-15; Codex / Sol High | **SCOPED LIVE PASS**: same-owner two-task actual OCI restart, no manual continue, invalid spawn/review correction, both Flows succeeded/complete; real merged Slack reply independently verified. Config restored, no active tasks. [Full evidence](task-continuation-live-2026-11-15.md). | Covers observed scenarios, not exactly-once delivery, all crash/provider races or unsupported retention/delete. Earlier failures retained. |
| #58 / PR #89; 2026-11-15; Codex | Seven CI checks passed; live successful-drain timing reproduced missing wait cache with durable succeeded tasks. Native source authority verified; 43 targeted regressions pass for narrow absent-cache recovery. | Final closure retest pending; no blanket terminal-status or exception fallback. [Evidence](task-continuation-live-2026-11-15.md). |
| #58 / PR #88; 2026-11-15; Codex | Same-owner A/B restart supplements succeeded and actual complete merged Slack output read back. [Evidence](task-continuation-live-2026-11-15.md). | Flow closure failed on contradictory complete/nonempty gaps; 40-test validation fix prepared, final closure test pending. |
| #58 / PR #87; 2026-11-15; Codex | Same-owner A/B admission and automatic restart supplements verified live; both supplements succeeded. [Evidence](task-continuation-live-2026-11-15.md). | Final review blocked by stale native liveness working despite successful terminal receipt; follow-up and fresh test pending. No final-delivery acceptance. |
| #58 / SA-M2; 2026-11-14; Codex | **PARTIAL LIVE OBSERVATION / NOT ACCEPTED**. Authorized Slack tasks + OCI restart; automatic A/B status delivery observed. [Evidence](task-continuation-live-2026-11-14.md). Original config restored; test stop intents saved. | B missing accepted receipt before restart, A interrupted/pending cancellation; review revision/unknown-outcome reporting failures. Different owner sessions prevent same-owner claim. Diagnose then retest; no milestone advance. |
| #82 / SA-M2 compatibility review; 2026-11-13; Codex | Fixed exact confirmed replacement of unmanaged M1 tasks with continuation enabled; native predecessor receipt and existing M1 checks retained. Syntax/transpile/scaffold/diff checks pass. | No tests/probes/acceptance per owner instruction; review and CI next. Product boxes and native limitations unchanged. |
| SA-M2-01–06 / #58; 2026-11-13 America/Los_Angeles; Codex orchestrator / verified Sol High | **CORE IMPLEMENTED / STATIC CHECKS ONLY**. [Native continuation](task-continuation.md): opt-in durable goals/criteria, revisions/stop intent/bounds, accepted runs, native inventory/wakes and review/supplement. Syntax/JSON/scaffold/diff checks pass. | No tests/probes/acceptance this increment. SA-M2-06 retention/delete unsupported; native launch atomicity, hard ACP deadline and exactly-once parent receipt remain limitations. Product boxes open; parent review next; no M3 or live operations. |
| SA-M2-01–06 / #58; 2026-11-12 America/Los_Angeles; Codex orchestrator / Sol High CLI; base `1280a75`, native `4a11f89` | **BLOCKED / PRODUCT NOT IMPLEMENTED**. [Native seam probes and failures](task-continuation.md): real process restart, managed flow, senderless wake, fresh/active child supplement and original-thread return pass for one known synthetic owner. Actual canonical task/run IDs remain after managed projection linkage. 61 targeted decoder/M1/ACP/#66/Router tests pass. | Local keyed-store trust refusal and same-session/different-thread wake coalescence block the selected design. Proposed narrow upstream storage/route contracts; no vendor patch or alternative scheduler/store. Product scope/cancel/budget/unknown-effect/retention tests and real Slack/production acceptance pending; retention undecided. M2 boxes remain open; no M3. |
| SA-OBS-02 coverage correction; 2026-11-12; Codex | **DEPLOYED / LIVE PREVIEW VERIFIED**. Read-only audit found direct Qwen and isolated ACP usage outside the gateway receipt. Operator confirmed the compared OpenAI dashboard spend was local OpenCode, not Nori. | All-profile/agent, archive and owned ACP collection implemented. Node 43/43, Python 17/17, native 1/1, full suite 1368 pass / 4 conditional skips / zero failures. PR #78 CI/deployment passed (`262878681fa6`); live backfill 94 added, repeat 0 added / 94 skipped. Seven daily previews and integrated sender preview passed; unchanged prices/configurations. First expanded-source scheduled delivery pending; no milestone advancement. |
| Slack task-loop functional naming / #60; 2026-11-12; Codex / Sol High | **LOCAL VERIFIED**. Functional filenames, symbols, fixture IDs/env and verification command; PRD/history preserved. 20 targeted tests, scaffold/diff and native `nori-task-loop-5tplBg` passed. Earlier `8Q0JNO` failure retained; fixture explicitly skipped-call accounting corrected, production logic unchanged. [Evidence](slack-task-loop.md). | Review naming follow-up; no milestone advancement or live acceptance claim. |
| SA-M1-01–05 / #60; 2026-11-12 America/Los_Angeles; Codex orchestrator / Sol High implementation; native `4a11f89` | **IMPLEMENTED / LOCAL VERIFIED; no product acceptance**. [Evidence and historical failures](slack-task-loop.md). 19 targeted tests; full suite 1331 pass / 2 existing skips / 0 fail; loader, skill, existing ACP/Cron and final expanded native `nori-m1-PzyVU6` pass. Actual research change/stop/new run, ACP pending/settled/failed cancellation, accepted/canonical IDs, shared-member/foreign-scope/revoked controls and original-thread delivery. All transport/model/research/backend data synthetic. | [PR #74](https://github.com/rein-protocol-foundation/nori-agent/pull/74) tracks current CI/review. Merged-main local suite: 1343 pass / 3 conditional skips / 0 fail; automatic implementation review had no findings. Finish checks and report; separately authorize live Slack/research/Codex acceptance. ACP Task titles are summaries and canonical projection can lag acceptance; no M2 reconstruction claimed. No AC01–AC20 or M0/M2/M3 advancement, production enablement or outreach. |
| SA-OBS-02 / #68; 2026-11-12 America/Los_Angeles; Codex | **DEPLOYED / ENABLED; MANUAL LIVE VERIFIED**. [Daily receipt](daily-agent-receipt.md): PR #72 CI passed and deployed as `831093f8bba3`; active bot `files:write` verified; native command run succeeded and Slack PNG read back. Local full regression 1324 / 1322 pass / 0 fail / 2 existing skips; targeted Node 10/10 and nested Python 6/6 passed. | First clock-triggered run pending November 12, 09:00 PST (expected deduplication of the manually sent November 11 report); next new receipt November 13, 09:00 PST. Existing encoded-path test limitation remains documented. Axiom/channel attribution, allowances and AC01–AC20 remain open. |
| SA-OBS-02 receipt pricing follow-up; 2026-11-12; Codex | **DEPLOYED / MANUAL LIVE VERIFIED**. PR #73 CI passed, deployed `4d627691ac62`. All 44 daily requests priced; `pricing-v2` image read back and deduplicated, original state preserved. | First clock-triggered acceptance pending; [runbook](daily-agent-receipt.md). |
| SA-OBS-02 Provider layout follow-up; 2026-11-12; Codex | **DEPLOYED / MANUAL LIVE VERIFIED**. PR #75 CI passed; deployed `33c44dc268b5`; Node 13/13, Python 12/12 and visual checks passed. Slack `provider-v3` read back and deduplicated; original records retained. Native synthetic ledger proves current subscription model prices work via maker fallback without alias catalog changes; failed catalog mutation fully rolled back. | First clock-triggered acceptance pending. Retired unused Gemini 3 Pro and unresolved historical `auto` identities documented in [runbook](daily-agent-receipt.md); no broader milestone advancement. |
| SA-OPS-01 / #66; 2026-11-10 America/Los_Angeles; Codex; implementation base `b36f21b3`, investigation base `ac8d766`, native `4a11f89`; #61/#69 merged | **IMPLEMENTED / LOCAL VERIFIED; no product acceptance**. [Current evidence](sa-ops-native-authority.md). Native Cron lifecycle/restart, two-user audit, public refusal, explicitly eligible development-subscription default/job override, announce and real native child spawn/senderless execution/parent result. Run11: 31 targeted tests; projection 7 cases plus disabled entry; Node 1309 tests / 1307 pass / 0 fail / 2 existing skips; loader, native ACP, scaffold and links/diff passed. Scoped native candidates are checked before credentials/network; ordinary-user fallback retained. | Review bounded diff and native enable post-commit output-schema limitation; parent completes already authorized commit/push workflow. Live Slack/production, complete memory, broader child continuation, cancellation/revocation races and all message-tool audiences remain unverified. No M0/M1 or AC01–AC20 advancement; no deployment/new Issue. |

Historical November 9 scope used the [feature checklist](super-agent-feature-checklist.md); current acceptance follows the November 15 plan above. Its source/CI evidence does not advance the historical governance AC01–AC20 below. Super Agent PRD v0.6 uses native configuration and existing integrations; M0 remains unaccepted and independent of internal M1–M3. Checklist SA-M0-01–09, SA-M1-01–05, SA-M2-01–06, SA-M3-01–05 and SA-OPS/ROUTE/COST/OBS map to #54–#60 and #66–#68. Routing, trusted Cron, Magpie limits and Axiom reporting require new behavior evidence; this documentation revision advances no product acceptance.

This matrix preserves the PRD's AC01–AC20 **historical acceptance evidence**. Current configuration
and the 19 backend tools are documented in [setup](setup.md#optional-enable-backend-backed-tools);
older direct-database tool counts and test results below are not current deployment instructions. “Core tested” means synthetic inputs exercised deterministic Nori-Agent-owned modules. It does not mean the real chat, member registry, website or finance provider has passed. A production result requires the provider evidence in the last column. The ten synthetic Slack
rehearsal cases and their final verdicts are in the [v0.1 governance acceptance record](governance-acceptance-2026-09-28.md).

## v0.1 slice versus deferred work

The strict P0 v0.1 slice is the four steps in [PRD §2.3](PRD-agent-community-operations.md): Slack identity
→ Contributor proposal → simple Board vote and result → read-only funds snapshot. In scope:
AC01–AC04, plus the parts of AC05–AC07 and AC16–AC17 those steps exercise. AC08–AC14 and AC18–AC20
belong to the deferred remainder and stay open until their phase starts.

**Historical build state: PR head on 2026-09-28** (the earlier 2026-09-24 build state is superseded; the
date below no longer describes the present tool set). The current PR head carries the long-term
`rein_*` interface names in the plugin and config, with the database-side rename migration applied
to the linked project but no live code run behind it, and has **no live Slack retest after the
rename**. That build had **12 database-backed tools** —
four reads
(`rein_member_status`, `rein_funds`, `rein_poll_candidates`, `rein_vote_type_resolve`), one read-only
field collector (`rein_proposal_collect`), four writes and three post-result feedback tools — and they
register only when an explicit `foundationDb` config block enables them; enabling it hides the
synthetic simulators and the legacy proposal bridge.

| Tool | Kind | Code |
| --- | --- | --- |
| `rein_member_status` | read | `foundation-db-reader.ts`, `governance-read-tools.ts` |
| `rein_funds` | read | `foundation-db-reader.ts`, `governance-read-tools.ts` |
| `rein_poll_candidates` | read | `foundation-db-reader.ts`, `governance-read-tools.ts` |
| `rein_vote_type_resolve` | read | `vote-type-resolve.ts`, `governance-read-tools.ts` |
| `rein_proposal_collect` | read | `proposal-collect-tools.ts` |
| `rein_governance_proposal_submit` | write | `foundation-db-writer.ts`, `governance-write-tools.ts` |
| `rein_poll_open` | write | `foundation-db-writer.ts`, `governance-write-tools.ts` |
| `rein_poll_vote` | write | `foundation-db-writer.ts`, `governance-write-tools.ts` |
| `rein_poll_result` | write | `vote-tally.ts`, `governance-write-tools.ts` |
| `rein_proposal_comment_suggest` | write | `proposal-feedback-tools.ts`, `foundation-db-writer.ts` |
| `rein_revision_approve` | write | `proposal-feedback-tools.ts`, `foundation-db-writer.ts` |
| `rein_revision_apply` | write | `proposal-feedback-tools.ts`, `foundation-db-writer.ts` |

Those tool names, and the `foundationDb` config block, are the current stable interfaces; the source
files that hold them use stable v0.1 filenames.

Post-result feedback is the one place where a confirmed rule has two asymmetric sides. An
**ordinary** revision, moving only the title or the summary, is accepted and made effective by the
Agent itself: `rein_revision_apply` succeeds with no separate approval recorded, in the caller's
turn. A **material** revision — budget, location, schedule, personnel or the major event flow, with
`schedule` material in the current implementation — is refused with `revision_not_approved` until a
current director records an approval through `rein_revision_approve`. All three calls are
limited to the approved Board channel and to a current director, because the voters are the Board;
the stored revision row additionally permits an **active Contributor** as its author, which is a
database-level allowance the registered tools do not currently expose. A comment applies nothing,
and no revision moves money.

Four deliberate v0.1 shapes are worth stating plainly. A poll is defined by a **stored vote type**,
not by a caller: `rein_poll_open` reads that type's own candidate cap, assembles the candidate
pool from stored proposals (offering recently unselected ones too) and lets the database freeze the
list, so no caller supplies candidates, a cap or an option label. There is still **no automatic
proposal-to-poll link** in the sense that no tool opens a poll *from* a proposal: the round is opened
by a director naming a vote type, and the agent then assembles the pool. Ballots are
**approve-only**: `rein_poll_vote` takes `approvedProposalIds`, refuses an entry outside the poll's
frozen candidates or above the poll's own `maxApprovalsPerVoter`, and treats an empty list as the
abstention. A poll's counts are **provisional until the closing time**: before it the tool reports
`provisional`, `official: false` and no count or winner, and only at or after the deadline does the
finalize RPC close the round and store the outcome from the ballots the database already accepted.
A **highest-count tie is not an official outcome**: with the tie rule still unadopted, the stored
outcome is `no_winner` with a null winner, and the run never announces a winner it has no adopted
rule for. An all-abstain round is settled by the confirmed rule and also stores `no_winner`, which is
not the same as the undecided tie.

**Replay safety is limited.** Identifiers derive from the tool call ID, the acting contact and the
action, which makes a repeated call inside one turn an exact duplicate, but a tool call ID is not a
trusted inbound message ID and the derivation is memoized per turn. A re-delivered Slack event or a
retry in a new turn can still insert a second record, so these rows are not evidence of
cross-process exactly-once behaviour.

The Agent's tools have been exercised against real providers in the synthetic rehearsals: synthetic
test identities in a real test Slack workspace, reading and writing the linked `dev_*` Supabase
schema with synthetic rows, while every `prod_*` business table stayed at zero. The rows below remain
synthetic dev and module-level evidence, not a production pass. The old single-workspace and
profile-email setup has been removed. Current configuration admits explicit `workspaces`, and the
Agent obtains backend-signed proofs from trusted host context; the backend resolves verified member
bindings. No profile-email lookup or email scope is required. See [setup](setup.md#optional-enable-backend-backed-tools).
The following migration and PR details are historical. Two
migrations are **tracked in the sibling Foundation repository**
(`rein-protocol-foundation/ReinProtocolFoundation`) on its PR #13 branch (PR #13, open). Its current PR head is
`78281fa` ("Recover Remote-Only Case 7 Same-Day Fixture Migration", 2026-09-28); the rename commit
`08542ad09932a4cefb62f230a9bdcf9fd4d32dfe` ("Complete Rein governance catalog rename through
triggers, constraints, and indexes") and the earlier clock commit
`32977bfb6cd6ae73b81aa4b396f9ae1cb67d2ac8` ("Make the database clock authoritative for ballot
`cast_at`") are its ancestors, and the two schema files were first authored at `4bd5ce8` ("Add the
Rein Agent Slack identity, fund snapshot, and governance schema"). Both base migrations are
**applied to the linked project**:
`supabase/migrations/20260924094436_rein_slack_identity_and_fund_snapshots.sql` (identity links,
append-only funds snapshots) and
`supabase/migrations/20260924095705_rein_mvp_proposals_polls_ballots.sql` (proposals, polls, ballots)
were verified read-only on 2026-09-27 with `supabase migration list --linked` against project ref
`ksgyfyysnojqrwfuyqwe` (project name `BeneficenceProtocol`), applied in filename order. Each
migration creates the `dev_*` and `prod_*` objects in the same transaction, and `migration list` is
project-level, so the applied schema covers both prefixes; the app's `DATABASE_ENVIRONMENT=dev`
default selects which prefix a request reads and is not proof that only the `dev_*` schema exists.
A third sibling migration, `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`, was committed at
`32977bfb` and is present at the current sibling head. A fourth,
`20260927110000_rein_governance_names.sql`, renames the physical tables and the two RPCs to their
long-term names. Both are **applied** to the linked project as of 2026-09-28: read-only inspection
lists both versions and finds the ten new physical tables, so the clock authority is in effect in the
linked schema and the new names resolve. The transition compatibility views and RPC wrappers were
removed by the later applied `20260929045543_remove_stage_compatibility_objects.sql`. Applied schema
is not a live code result; no live ballot or tool call has exercised the new names. The sibling
code's local pgTAP suite stands at 187/187 assertions at that same commit, run twice in an isolated
container.
The phase-two migration carries the vote types, the approve-only ballot shape, the
frozen candidate list, the finalize RPC and the material-revision approval rule this document
describes, with pgTAP coverage in the sibling repository. The rehearsal runs did read and write the
linked `dev_*` tables, but on the **pre-rename build** (the original stage-prefixed interfaces) and
with synthetic rows only; the `prod_*` business tables were never written, and no live Slack retest
has run against the current post-rename head, so no schema claim here should be treated as a live
end-to-end result on the current head.

Current backend boundary coverage lives in `tests/backend-boundary.test.mjs`,
`tests/backend-adapter.test.mjs`, `tests/backend-runtime.test.mjs` and `tests/identity-tools.test.mjs`.
The earlier direct-PostgREST tests describe a retired architecture and are not deployment checks for
the current Agent. Local boundary tests do not establish live provider acceptance.

| AC | Current evidence | Status | Evidence still required for launch |
| --- | --- | --- | --- |
| AC01 | Historical proposal/core checks cover refusal of unidentified senders. Current identity uses authenticated backend operations and canonical verified bindings; relevant local coverage is in `backend-runtime.test.mjs`, `backend-adapter.test.mjs` and `identity-tools.test.mjs`. Profile-email resolution has been removed. | The historical case 1 was skipped, not passed; updating configuration does not change that verdict | Isolated end-to-end evidence for unbound, bound, revoked and expired identities, current role checks and cross-workspace refusal, against the approved backend and transport. |
| AC02 | `proposals.test.mjs` checks fields, versions and reconfirmation; `proposal-tool-bridge.test.mjs` exercises guarded create/revise/confirm/submit calls. | Local tool tested | Real chat conversation that gathers fields across messages and returns the confirmed summary. |
| AC03 | `proposals.test.mjs` checks explicit zero-budget authorization and blockers. | Core tested | Approved policy scope, responsible exception handler and real fast-track rehearsal. |
| AC04 | `proposals.test.mjs` routes complete funding requests to governance, including small amounts. | Core tested | Live Board round presentation and provider-backed proposal records. |
| AC05 | `p0-rehearsal.test.mjs` and `governance.test.mjs` freeze versions, roster, weights and rules; `foundation-db-writer.test.mjs` and `governance-rehearsal.test.mjs` assemble a round's candidate pool from stored proposals of the named vote type, re-offering recently unselected ones, bounded by that type's own cap. The round-persistence test moved to a follow-up PR with `governance-store.ts`. The concrete cap values are still unapproved configuration. | Local modules and governance tools tested; plus a synthetic dev run against the linked `dev_*` schema in the rehearsal workspace (type-scoped `rein_poll_candidates` read and candidate-pool opening). No production provider acceptance | Approved per-type cap values, authoritative finance availability and delivered Board briefing. |
| AC06 | `governance.test.mjs` rejects invalid, ineligible and late ballots; `foundation-db-reader.test.mjs` resolves the member and director role from the database; `governance-write-tools.test.mjs` refuses a late ballot and a choice outside a stored poll's options. The refused-ballot audit, authoritative-registry eligibility and host-bound vote-tool checks moved to a follow-up PR with `governance-store.ts`, `registry-snapshot.ts` and `governance-tool-bridge.ts`. | Local modules tested; database tools registered only under explicit `foundationDb` config | Trusted sender-to-member identity, explicit vote confirmation in Slack, private ballot access, and a real round audit. |
| AC07 | `governance.test.mjs` covers replacement, recusal, abstention, quorum, ties and thresholds; `vote-tally.test.mjs` covers one equal weight per eligible member, an empty approval list casting no approval and a tie or empty poll producing `no_winner`; `governance-write-tools.test.mjs` and `governance-rehearsal.test.mjs` exercise the registered tools' approve-only enforcement, the per-poll `maxApprovalsPerVoter` bound, the frozen candidate list and the deadline that decides a round. `proposal-feedback-tools.test.mjs` covers the post-result rule in both directions: an ordinary title or summary revision is applied by the Agent with no separate approval, a material revision is refused with `revision_not_approved` until a current director's approval is recorded, a comment applies nothing, and every feedback call is Board-scoped. The Board-scoped recusal and retry checks in the host-bound vote bridge moved to a follow-up PR with `governance-tool-bridge.ts`. The per-type maximum approvals and candidate cap are confirmed rules (C08, C14, D08, D09) with concrete values still unapproved configuration. | Local modules and database tools tested, including the post-result feedback tools; database tools registered only under explicit `foundationDb` config | Confirmation of the highest-count tie rule, the approved per-type values, an approved voter list, the feedback author scope and a real round audit. Weighted, quorum and recusal rules are deferred from v0.1. |
| AC08 | `governance.test.mjs` reports shortfall and holds allocation when funds are unknown or insufficient. | Core tested; deferred from v0.1 | Atomic reservation against an authoritative finance source under concurrent rounds. v0.1 does not allocate one budget across competing proposals. |
| AC09 | Local implementation moved to a follow-up PR with `activities.ts` and `outbox-runner.ts`: a unique space intent plus provider receipt lookup and same-key retry against a fake provider. | Moved to follow-up PR | Provider receipt/lookup proving one real event space across timeout and retry. |
| AC10 | Local implementation moved to a follow-up PR with `activities.ts`: task completion cancelling chasing reminders, snooze, quiet hours, reminder suppression and the explicit timezone requirement for dispatch. | Moved to follow-up PR | Scheduled runner and delivered notification evidence under the chosen platform. |
| AC11 | Local implementation moved to a follow-up PR with `changes.ts` and `change-coordinator.ts`: change planning and guards plus a narrow durable handoff into guarded activity actions while retaining unsupported work. | Moved to follow-up PR | Transactional application to activity, registration, reminder and finance owners; actual recipient notifications for time, location, lead or cancellation changes. |
| AC12 | Local implementation moved to a follow-up PR with `activities.ts`: outcome fields and specific missing items. | Moved to follow-up PR | Real event channel intake and permissions for incremental materials. |
| AC13 | Local implementation moved to a follow-up PR with `activities.ts`: alternative materials and channel-specific consent. | Moved to follow-up PR | Website adapter excluding unauthorized media and handling withdrawal. |
| AC14 | Local implementation moved to a follow-up PR with `activities.ts` and `outbox-runner.ts`: lead fact confirmation, a single canonical article per activity, the separate `post_article_link` return intent, and consent/content/receipt checks before `published`. | Moved to follow-up PR | One real article with canonical URL; timeout recovery and correction. |
| AC15 | `foundation-db-reader.test.mjs` and `governance-read-tools.test.mjs` cover the read-only funds snapshot v0.1 exposes. The activity finance rules (`finance.approve_adjust`, the ordered overspend recovery, blocked settlement of unpaid obligations) moved to a follow-up PR with `activities.ts`. | Read-only snapshot reader tested; activity finance moved to follow-up PR; payment paths deferred from v0.1 | Finance-owner reconciliation against actual records, plus real available-funds verification; no payment execution by Agent. v0.1 shows a read-only snapshot only. |
| AC16 | `request-context.test.mjs` rejects unapproved channels and missing trusted senders. | Core tested | Platform permission test showing Board and private event data never appear in public or another event scope. |
| AC17 | `ledger.test.mjs` and `proposal-store.test.mjs` cover local idempotency and stale-process conflicts; `p0-rehearsal.test.mjs` exercises the ledger-backed proposal store across a restart. The refused-ballot audit and fake-provider uncertain receipt lookup moved to a follow-up PR with `governance-store.ts` and `outbox-runner.ts`. | Core tested | Kill/restart drill around live provider calls, uncertain receipt lookup and voting fairness decision. |
| AC18 | Local implementation moved to a follow-up PR with `oversight.ts`: routine progress separated from outstanding exceptions in a weekly summary. | Moved to follow-up PR | Real-source weekly summary delivered to authorized oversight recipients. |
| AC19 | Local implementation moved to a follow-up PR with `oversight.ts`: scoped pause/resume and retained work. | Moved to follow-up PR | Operator controls in real deployment and proof that no paused effect is sent. |
| AC20 | `p0-rehearsal.test.mjs` chains a synthetic zero-budget proposal and a synthetic funded proposal from identity link through the proposal core (US02, US04, US05, US15) and a frozen weighted governance round with deterministic allocation (US06, US07), using the ledger-backed proposal store across a restart. Activity execution, outcome and publication segments moved to a follow-up PR with `activities.ts` and are no longer asserted here. | Synthetic rehearsal passed for the proposal and governance chain | Two sandbox runs with real selected-platform and website adapters plus finance reconciliation. |

The integration requirements are in [provider contracts](integration-contracts.md), and the deployment/test instructions are in [the Chinese delivery record](implementation-and-deployment-zh.md). None of the rows is marked as a production pass until its provider evidence exists.

## Naming and the rename migration

A pre-launch review asked for the stage-based naming to be removed from tools, tables, config and
skills. The plugin and configuration now use the stable v0.1 names in the table above: the twelve
tools and the `foundationDb` config block. The database reaches matching names through the forward
migration `20260927110000_rein_governance_names.sql`, tracked in
[provider contracts](integration-contracts.md#naming-and-the-rename-migration). It is committed in PR
#13 and **applied** to the linked project as of 2026-09-28; it renames the physical tables and the two
RPCs. The transition compatibility views and wrappers it created were removed by the later applied
`20260929045543_remove_stage_compatibility_objects.sql`, so the stable names are the only interface.
The schema gate is closed; the live code path remains unverified. Source file and test filenames now
use the stable v0.1 stems as well.

The caller-facing names move with the plugin, so a caller that hits a malformed `foundationDb` block
or an unset named variable now reads `foundation_db_config_invalid` or
`foundation_db_env_value_missing`, and `rein_status` reports `foundationDbReadToolsEnabled`,
`foundationDbWriteToolsEnabled`, `foundationDbCollectToolsEnabled` and `foundationDbFeedbackToolsEnabled`.
These are code interfaces, not
schema, so they need no migration. The earlier stage-prefixed compatibility views and RPC wrappers
have been removed, so the stable `<env>_rein_*` names are the only interface in the linked schema.

SA-OBS-02 zero-usage follow-up (2026-11-13, Codex): DEPLOYED / LIVE PREVIEW VERIFIED, 35/35 receipt/source
tests and scaffold/diff passed. Identified failed zero-usage attempts count as $0;
unknown models/missing counters/nonzero usage remain unknown. PR #80 CI passed;
deployed `400019cf2b01`. November 6 integrated preview: DeepSeek 121 attempts,
1 error, zero unpriced; unchanged $0.3136786682. No manual send.

## DOCS-AUTO-PULL — November 14, 2026

Verification: 82 Python tests passed (22 new real-Git source-sync tests), plus scaffold
and whitespace checks. Production acceptance remains pending.

Owner Codex. Local real-Git fixtures cover shallow checkout, docs add/edit/delete/rename,
unchanged runtime file inode/private state, skipped hooks, no build/restart/report, source/runtime
revision distinction, retries, duplicate/empty queue, interruptions before/after fast-forward,
concurrent edits, accumulated runtime changes and later code deployment. Existing updater,
webhook, storage and rollback regression tests remain required. Live controller installation
and production merged-docs acceptance pending; no AC01–AC20 advancement.

## SA-OBS-02 / #68 — receipt schedule recovery (2026-11-18)

Owner: Codex. Native authenticated schedule update/read-back confirms the existing enabled job now uses `30 7 * * *`, `America/Los_Angeles`, zero stagger, next run 2026-11-19 15:30 UTC. Command and delivery records preserved; private rollback saved. Local retry patch passed 18/18 targeted Node tests (including Python sender regression) and scaffold. Retry deployment and first scheduled delivery remain pending; this is not full SA-OBS-02 acceptance. See [runbook](daily-agent-receipt.md#schedule-recovery--november-18-2026).

Live integrated preview also passed with the current production renderer: source export, usage refresh and PNG generation for November 17 completed without sending. Output was isolated under the private schedule-fix-preview directory; original artifacts and delivery state were preserved. This verifies generation outside the contention window, not the undeployed retry or next scheduled delivery.

## November 19, 2026 · Sandbox schedule ownership

SA-OPS-01 / SA-M1. Codex exercised create and update under the same native job ID. The automatic run executed 113 + 271 as nori-dev and delivered 384 to the simulated original thread. Live Slack and formal-channel Codex acceptance are pending. [Verification](slack-scheduler-compatibility.md).

## COMMUNITY-PROFILE-LINK — linked member recognition

Owner: Codex; 2026-11-19. Targeted synthetic identity/recall and backend-proof regression checks passed (46 before final configuration checks). Native linked-profile registration passed; rollout is pending. Cases include actor spoofing, unlink/rebind, cross-platform source ownership, removed/private/deleted sources and private-field redaction. No live human messages were sent. See [feature boundary](linked-member-profiles.md).

Final focused linked-reader checks: 14 passed. Whole Nori suite: 1,572 tests, 1,567 passed, 4 existing skips, 1 worktree-only missing markdown dependency failure. After supplying the existing dependency tree, the failed native migration test and linked-reader regression set passed (15/15); no vendor source changed.

Native OpenClaw loader completed successfully for linked Discord/Slack registration and legacy optional enable/disable configuration.

SA-OPS-01 / SA-M1 · Production Slack, November 19 UTC. One timer moved from 11:20:31 to 11:16:57 under the same native ID. It fired automatically as nori-dev, returned 4187 for 53 × 79 and received an original-thread delivery receipt. The first coding attempt ran on the development subagent. A separate ACP attempt stopped before launch while the model was copying the prepared task. Neither qualifies as a Codex run. The correction accepts a short, owner-scoped assignment reference and dispatches its complete stored text.

SA-OPS-01 / SA-M1 · 2026-11-19, Codex. Formal-channel live acceptance passed for native timer ownership, sandbox execution and original-thread delivery. Two real Codex development flows produced independently verified artifacts. The final revision closed a two-attempt flow without human intervention. [Production evidence](slack-scheduler-compatibility.md#production-acceptance-on-november-19-2026).

2026-11-19 America/Los_Angeles · OCI Codex delegation, owner Codex. The approved production launcher switch to CLI 0.170.0 passed live ACP handshake and default-model selection. Parent 01a1f659-649c-70b0-98a3-32251f20b891 and its routine child 01a1f659-7fda-7941-8243-ef9d5dcbe230 recorded Astra High and Sol Low respectively. Loaded policy and scope were checked from local runtime records. Implementation Sol High and default-child Sol Medium were installed as configuration; those two paths were not separately exercised. Configuration-only work advances no product milestone.

2026-11-19 · Task lifecycle closeout, owner Codex. Completed the requested lifecycle, indefinite retained summaries with explicit deletion, and autonomous development acceptance. Issues #58/#60 remain closed. Evidence includes restart-preserved deletion tombstones and real formal-channel Codex review, supplement and summary readback. Updated stale document headers and retired merged continuation branches. Follow-up report-access/blocked-verdict work remains open in #132; broader product limits remain in #65.
