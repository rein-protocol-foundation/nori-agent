# Nori Super Agent Product Requirements Document

- **Version**: v0.6, English edition
- **Updated**: November 9, 2026 (America/Los_Angeles); native-first integration, ACP coding, dynamic routing and usage reporting approved
- **Status**: Product direction approved for this documentation revision. Internal Slack M1 is first; shared-Gateway/Discord M0 remains independent. Retention duration and M3 first-release necessity remain open product parameters. This update does not implement features or authorize production changes.
- **Repository baseline**: [nori-agent `3a0dbb4`](https://github.com/rein-protocol-foundation/nori-agent/tree/3a0dbb4ff98dc6b38110febb6272d9973a971b4a)

> **v0.6 decision:** Prefer native configuration, then existing community open-source integration, then a necessary thin adapter backed by a concrete gap. This supersedes v0.5.2's default-disabled Dynamic Router, preselected upstream extensions and fixed 30-day retention requirement. Historical source slices and failed probes remain evidence, not mandatory final designs. See the [feature checklist](super-agent-feature-checklist.md) and [decision tracker #65](https://github.com/rein-protocol-foundation/nori-agent/issues/65). Only documents and tickets change in this task.

## 1 Goals and Implementation Principles

Evolve Nori from one-off question answering into a primary agent that owns work through completion: receive tasks, delegate to subagents, summarize progress, and act on results until the work is complete, a user decision is required, or an execution limit or blocker requires a clear handoff.

**Follow the official documentation for the version in use. Reuse OpenClaw subagents, Lobster, and the native Sandbox. Add only the task coordination and integration Nori needs; do not rebuild existing capabilities.**

Internal users interact with the primary Nori through Slack to understand tasks, change direction, and receive results. Public Discord users interact with Nori Community, a restricted community agent. Retain existing Rein identity and permissions, Magpie provider management, Slack/Discord integrations, and the deployment pipeline. Preserve the existing authorization, provider-use and data boundaries for the internal pilot. Deliver the new shared-Gateway Community boundaries and scoped preferences through the independent M0 milestone.

## 2 Responsibilities

| Component | Responsibility |
|---|---|
| Primary Nori (Slack) | Own authorized internal work: understand goals, delegate, summarize progress, continue unfinished work, and validate completion. Slack is the trusted internal entry point; restricted business actions retain their own authorization without an unrelated role gate on ordinary work. |
| Nori Community (Discord) | Persistent community-specialist subordinate agent for public-facing support, onboarding, community maintenance, and permitted organizational information/resource/event retrieval. It has a restricted tool surface and backend identity, without general host/development powers. |
| OpenClaw | Own agents, sessions, Cron, subagents, memory compaction/maintenance, ACP, lifecycle and native management UI. Configure main and Community separately. |
| Native subagents | Execute bounded research and checks; return results through native lifecycle and concurrency management. |
| Magpie | Manage all Nori inference Providers, accounts, model catalog, gateway calls and existing quota controls. Extend the established integration. |
| Rein components | Community business permissions, trusted ingress/background authority, Router integration and usage attribution. |
| External coding clients | Nori delegates development through ACP to server Codex CLI, Claude Code or OpenCode; clients retain native login/subscriptions. Reuse existing ACP→Codex first and verify other adapters separately. |
| Lobster | Execute workflows with fixed steps, including explicit approval checkpoints and resume. It is not the general-purpose multi-agent scheduler. |
| OpenClaw Sandbox | Retain native execution isolation and the existing Nori configuration. Do not build a separate sandbox system. |
| Thin Nori adapter | Link user entry points and business tasks to native tasks, sessions, and flows. Connect status visibility, result reporting, and any necessary long-term records. |

The primary Nori decides what happens next; subagents perform the concrete work. Use Lobster only for fixed sequences suited to repeated execution. Handle simple requests directly without requiring a workflow.

The independent M0 migration target is one OpenClaw Gateway with distinct agents: Slack routes to primary Nori, and Discord routes directly to Nori Community. Community is a subordinate specialist in the product architecture, implemented as a persistent configured agent with its own channel binding, workspace, and permission policy—not an ephemeral child run spawned for every Discord message. Native task subagents remain available for bounded delegated work where authorized. Primary Nori may coordinate Community work within its approved scope, but public input must not become privileged instructions to the primary agent.

M0 is a first-class independent milestone with its own features, dependencies, rollout and acceptance; its historical number does not prescribe execution order. Internal Slack M1–M3 no longer depend on completing all of M0. Keep the existing topology until an authorized migration passes M0, and do not claim the existing shared workspace is a private boundary. Before accepting any internal task feature, verify its owner/audience authorization, private task storage, reply destination, capability ceiling and affected native/provider behavior. If that path actually touches an unresolved M0 boundary, record the specific dependency and block that feature until resolved. Development workers may remain separate internal execution agents.

### 2.1 Current OpenClaw Deployment Context

The following is an operator-verified snapshot from November 7, 2026 (America/Los_Angeles), at deployed Nori revision `4e99b51ba08bf791285f1432a5381a6f82975cc9`. It describes deployment configuration, not a guarantee that every implemented isolation feature is enabled. The earlier repository baseline and pinned capability references in Section 4 remain historical references and must be reconciled with the deployed revision before implementation.

| Area | Slack deployment | Discord deployment |
|---|---|---|
| Gateway instance | Separate `nori-slack` service, loopback port `18791` | Separate `nori-discord` service, loopback port `18793` |
| Private configuration | `runtime/openclaw/openclaw.json` | `runtime/discord-catalog-prod/openclaw.json` |
| Runtime state | `runtime/openclaw` | `runtime/discord-catalog-prod/state` |
| Primary agent | `main`, displayed as **Nori · Slack 主助手** | Implicit default `main`, displayed as **Nori** |
| Enabled chat transport | Native Slack transport; Discord channel disabled | Native Discord transport; Slack channel disabled |
| Primary workspace | `/home/ubuntu/rein-agent/workspace` | The same physical directory |
| Main model configuration | `rein-magpie/auto` | `rein-magpie/auto` |

Paths beginning with `runtime/` are relative to `/home/ubuntu/rein-agent`. Both instances run on the same host; separate processes do not provide complete host or filesystem isolation. Their identical `main` IDs belong to different instances and do not identify one shared runtime agent.

The Slack instance also retains these configured agents:

| Agent ID / display name | Current purpose and routing | Workspace |
|---|---|---|
| `nori-development` / **Nori · 开发沙箱** | Receives the dedicated Slack development channel; uses an SSH sandbox and restricted development tools. | `/home/ubuntu/nori-development-seed`, with execution workspaces under the dedicated sandbox account |
| `director-control` / **Nori · 开发控制器（备用）** | Retained controller configuration with host tools and `bailian-token-plan/qwen3.8-flash`; no direct channel binding. The former `rein-acp` coordinator plugin is disabled. | `/home/ubuntu/rein-agent/runtime/director-acp-production/controller` |
| `codex` / **Codex · 编程执行器** | Default ACP delegation target through enabled `acpx`; no direct channel binding. Its existence is not evidence that a worker is currently running. | `/var/lib/nori-acp-pilot/workspace` |

The ordinary Slack binding routes to `main`; the dedicated development-channel binding takes precedence and routes to `nori-development`. The four Slack Dashboard cards represent configured agents, not four independent chat bots. The Discord Dashboard displays its own instance's default Nori.

**Shared context, separate runtime state.** Both primary agents read the same physical `workspace/AGENTS.md` and `workspace/SOUL.md`, not synchronized copies. Changes affect subsequent context loading on both sides. Their session stores are separate, so conversations are not automatically merged. However, files written into the shared workspace can be visible to both; shared workspace memory is not a private per-channel memory boundary. Agent-specific configuration, channel tool policies, and plugin-injected instructions can still produce different effective behavior despite shared base files.

**Why the split exists.** The October 26 deployment record introduced a separate production Discord profile with a dedicated backend caller for community catalog and identity operations while Slack retained its development profile. Slack subsequently gained trusted host/development capabilities and optional ACP delegation. Separate profiles made credentials, permissions, and deployment changes independently configurable; OpenClaw does not inherently require a separate Gateway for each platform. The historical development/production distinction must be rechecked before migration rather than assumed permanent.

**Isolation gap to resolve.** The live profiles use the native Slack and Discord plugins, not the opt-in `rein-slack` / `rein-discord` isolation adapters. Neither inspected profile explicitly sets `session.dmScope`; therefore, separate instance state must not be presented as verified per-user DM isolation. Native room/thread separation also differs from per-sender isolation inside a shared room. The repository's stricter adapters have a shared scoped isolation core, but their current startup guard requires a dedicated single-platform profile and rejects simultaneous transports. Removing that guard alone is not a valid consolidation strategy; coordinated tool registration, trusted ingress context, and multi-channel behavior need implementation and acceptance evidence.

Evidence: deployment configuration inspected on the host; repository documents `docs/dashboard-zh.md`, `docs/community-discovery-live-acceptance-2026-10-26.md`, `docs/trusted-slack-host-access.md`, `docs/slack-development.md`, and `docs/channel-user-isolation.md`. Private credentials, member records, and chat transcripts are intentionally excluded.

### 2.2 Agent and Trust Boundaries

- **Slack primary / Discord Community**: Bind authenticated Slack ingress to primary Nori, except explicit internal development routes. Bind Discord ingress to a persistent `nori-community` agent. Treat Slack as the trusted internal surface and Discord as public input that may include attacks or misuse. Trust in Slack preserves business-specific authorization and exact-action approvals where required, without imposing Contributor/Director status on all ordinary work; retrieved documents and forwarded public content remain untrusted data.
- **Community capabilities**: Allow community guidance, onboarding, learning-resource Q/A, and authorized organization/event retrieval. Configure the read/retrieval, file access and native interaction tools needed for these scenarios; routine requests must succeed within scope rather than mostly fail from missing permissions. Organization information is not automatically public: backend eligibility and field/audience filtering still apply. Any community write or moderation action needs an explicit scoped capability; the phrase “community maintenance” grants no blanket administration rights. Exclude general shell execution, arbitrary filesystem writes, code/deployment administration, credential access, internal governance tools, and unrestricted agent/session discovery.
- **Enforced separation**: Give Community a separate workspace with reviewed public references and Community-specific AGENTS instructions. Reuse the common Nori SOUL/personality through reviewed public content, without sharing writable internal memory, transcripts, or private task files. Enforce tool allowlists, backend scopes, filesystem/sandbox limits, and controlled delegation in runtime code/configuration. A different agent ID or a restrictive prompt alone is not a security boundary; a shared Gateway is not an OS-level security boundary.
- **No privilege escalation through delegation**: Community cannot freely spawn Codex/development workers, invoke primary Nori's host tools, or ask primary Nori to execute public instructions with internal authority. Any permitted child inherits the initiating request's capability ceiling. Internal review of a Community escalation is a separate authorized action, with public text treated as data; it is not automatic execution under Slack privileges.
- **Trusted authority and backend callers**: Derive agent, platform, bot account, workspace/guild, conversation/thread, audience, and sender from authenticated ingress, and preserve them through tools, delegation, delayed results, and recovery. Preserve separate Community and internal backend callers. The current profiles reuse environment-variable names in separate processes; the merged process must explicitly select the correct scoped caller without exposing credentials to Community or letting the model select one.
- **Conversation and private memory scopes**: Isolate by agent as well as platform/account, sender, conversation/thread, and audience as appropriate. **Operator decision, November 8: public Discord participants intentionally share public history within the same room or thread. Strict per-speaker separation inside that public conversation is not required for M0.** Different conversations and private audiences remain separate. Explicitly configure private-message isolation; one member's DM/history/private memory must not enter another member's context or any public answer, including their own. Rein identity links alone do not merge histories, notes, or access to internal tasks. Keep private memory outside shared public references; retain current backend identity and role checks. This decision does not authorize disabling automatic memory or merging private histories.
- **Audience-bound coordination**: Preserve task owner, source, audience, and reply destination. Community replies stay in the originating Discord conversation. Internal task summaries are not visible through Discord merely because primary Nori and Community share a Gateway. Cross-agent handoff or cross-channel delivery requires explicit task and destination authorization, with only the permitted data transferred.
- **Migration**: Preserve historical session ownership and source state; do not concatenate histories or expose global transcript search. Rehearse rollback and avoid duplicate consumers for a bot. If required boundaries cannot be enforced in a shared Gateway, record the blocker and retain separate instances until it is resolved rather than weakening Community restrictions.

### 2.2.1 Trusted Slack operations and scheduled execution

**Owner clarification, November 9:** Users admitted through the configured internal Slack workspace/channel are trusted operational users. Normal internal work must not acquire redundant Director-only or per-turn human-attachment gates merely because it uses tools, background delegation or Cron. This does not turn forwarded public content into instructions or remove existing business-specific authorization (for example governance votes or restricted records).

For a Cron job created and enabled through the controlled trusted system path, creation-time authorization must remain usable at scheduled execution. Run with the explicit native system/agent execution identity and the job's configured capabilities and destination; do not require a live Slack sender or invent a human identity. Distinguish the audit creator, execution agent and any business-action principal. A missing executor is a configuration/creation defect to prevent or repair through the supported native interface, not a reason to classify a legitimate scheduled job as an untrusted user request.

Reuse native Cron ownership and lifecycle. Validate the executor when creating/enabling a job, preserve its identity and scope across restart, and apply explicit disable/revocation or capability changes accurately. A string claiming “system-created” is not provenance, and unknown legacy jobs must not silently gain global host/admin access. Where a business API requires a human principal or exact-action approval, report that specific requirement rather than impersonating the creator or blocking unrelated ordinary execution.

Acceptance for this integration: a trusted system-created job runs on schedule without a live human session; restart retains its executor/scope; disabled/revoked jobs do not run; ordinary trusted Slack operations do not require an unrelated Director role; public/untrusted origins cannot create or widen trusted jobs. Verify actual native and router paths before selecting any implementation. The November 9 read-only diagnosis identified `skill-collection-review-nori-development`: rein-router requires a live private-Slack sender and Contributor/Director authorization even for its system Cron path. The native executor is `nori-development`; a null owner field alone is not the cause. See [#66](https://github.com/rein-protocol-foundation/nori-agent/issues/66) and SA-OPS-01 for dated evidence. The fix and native provenance contract remain unverified; no production replay is part of this revision.

### 2.3 Magpie, Dynamic Router and Execution Models

All Nori inference Provider/account/model management uses Magpie and the existing Rein Router integration. Provider eligibility is distinct from task authority. ACP clients are the explicit exception to the inference transport: Codex CLI, Claude Code and OpenCode retain their native authentication/subscriptions and usage is reported separately. Nori orchestrates coding through existing ACP; it does not rebuild a coding harness or make Coding Plan inference routing a major M0 workstream. Existing ACP→Codex delegation/status/result support is reused; Claude Code/OpenCode native or community adapters are validated individually and are not all prerequisites for the first delivery.

**Community — Qwen first.** Use an enrolled Bailian Qwen route with instant / thinking-off semantics. Map effort to the actual model's supported parameters; do not assume an API accepts the literal string `instant`. Remove the legacy blanket medium/high requirement for automatic defaults, while retaining independently configured internal-agent choices. Qwen handles ordinary onboarding, learning-resource, event and organization questions promptly. Only a difficult question triggers the existing Dynamic Router to choose an approved advanced route. Default to at most one escalation per question. Success, failure or cancellation restores Qwen for subsequent questions; shared-channel or concurrent requests must not inherit premium model state. Verify native model switching/delegation before adding a thin adapter; do not implement a new execution loop.

**Slack — dynamic by default, explicit user control.** Enable Dynamic Router by default. A trusted user can disable automatic choice or select Provider/model through existing native model controls; manual choice stays effective until the user restores automatic mode. Selection remains inside configured route and spending limits. Do not add a model-selection UI.

**Cron and background work.** Cron uses its owning agent's OpenClaw default model unless the job has an explicit model override. Use the existing native Dashboard to change it. System Cron, memory maintenance and native children use their own verifiable native execution identity and inherited/configured authority, not an invented live chat user. Dynamic routing in Slack must not silently replace Cron's fixed effective model.

**Shared policy controls.** Retain hard eligible routes per agent, preference order **explicit channel override → platform default → agent default**, exact Provider/model capability settings and ordered fallback. Keys include platform/account/workspace or guild/native channel ID. Missing overrides inherit; explicitly empty fallback lists do not enable a global fallback. Manual choice, Dynamic Router, provider-side fallback and child delegation cannot widen the eligible set or bypass billing restrictions. Show effective configuration through existing controls where possible. Advanced allowance exhaustion leaves Qwen available if its approved route is usable. If Qwen is unavailable too, provide fixed public reference links and a retry explanation, not an unapproved paid route. The selected path must retain necessary provider-use checks without tying all ordinary tasks to a coding classifier.

The former deterministic, Jev-disabled scoped path remains a delivered source slice, not the v0.6 default product policy. Compatibility gaps are tracked in [#56](https://github.com/rein-protocol-foundation/nori-agent/issues/56); Community escalation and Slack manual control in [#67](https://github.com/rein-protocol-foundation/nori-agent/issues/67). Current integration references: [subscription access](unified-subscription-access.md), [router quickstart](model-router-quickstart-zh.md), [existing ACP slice](director-acp.md). Their historical runtime behavior is not proof of v0.6 acceptance.

### 2.4 Cost Limits and Usage Reporting

Reuse the pinned Magpie quota mechanisms, including Gateway-Key daily token/estimated-cost limits where supported. Record the **actual** enforcement scope (Provider, account or Key), reset window and effective limits; several independent Key limits are not a pooled Provider budget. Operator configuration supplies quota values; missing values remain pending configuration, not invented amounts. Keep existing #52 admission work and distinguish request counts from tokens and currency. Do not create a substitute quota/cost ledger. Configure and verify native runtime/concurrency controls first; propose an SDK extension only for a reproduced missing capability (#54).

Extend the existing Axiom usage Dashboard, query and alert integration (#68):

- Attribute usage to platform, native channel (with account/workspace context), agent, Provider/model and trigger type. Explicitly mark system or unknown attribution rather than fabricating a channel.
- Include input/output/cache usage, latency, errors and coverage gaps; collect neither message bodies nor credentials. Correlate native and Magpie records so one inference is counted once; actual retries remain separate calls.
- Report available ACP client-native usage separately; unavailable usage is unknown, not zero or part of Magpie totals. Label costs as estimates, never Provider invoices.
- Use native Cron for Nori's previous-day report to existing `#nori-alerts` at **09:00 America/Los_Angeles**. The reporting day uses that timezone and handles daylight saving; record source cutoff and missing intervals.
- Default warning threshold is **80% of a configured allowance**. Exhaustion follows native Magpie quota state. Deduplicate threshold notifications by scope/window; do not invent quota amounts.
- Verify Axiom read/query permissions: an ingestion-only token does not establish reporting access. Reuse existing Dashboard and alert capabilities rather than building a replacement monitoring platform.

Existing Axiom Slack/Discord service-health data is not channel-level inference usage or evidence that scheduled reports already run. Reporting needs the trusted Cron path (#66); no schedule, send, quota or account is changed by this document.

## 3 User-Facing Task Lifecycle

The lifecycle below describes primary Nori's internal Slack tasks. Community handles ordinary Discord queries directly and may use the same lifecycle only within its restricted capabilities; Discord requests do not automatically become privileged primary-agent tasks.

1. **Receive**: The primary Nori restates the goal and completion criteria and returns a task identifier for background work. Ask a question only when material ambiguity prevents progress; do not require routine reconfirmation of a clear request.
2. **Delegate**: When needed, start native subagents, associate their actual run IDs, and state the expected deliverables.
3. **Summarize**: Users can check progress, adjust tasks, or cancel them. The primary Nori reports meaningful results and blockers rather than forwarding internal logs line by line.
4. **Continue**: If subtask results are incomplete, the primary Nori continues the original session or delegates additional work. Ask the user when new permissions or a user decision are required.
5. **Complete**: Validate results against the user's goal and deliver the outputs. Distinguish a completed proposal, an opened PR, a merged PR, and a production deployment; do not treat them as equivalent completion states.

Reuse native task and flow records first. Nori adds only the goal, source, result summary, and necessary associations. Retain the minimal task summary required below; add further business records only when long-term querying actually requires them. Do not rebuild the runtime state machine, scheduler, or recovery framework.

### Task Execution Agreements

These agreements define Nori integration behavior, not a new runtime state machine or scheduler.

- **Continuation and wakeups**: During normal operation, child completion triggers primary-agent review and further work without another user prompt. Before M2 acceptance, identify and connect the native completion handoff and restart recovery entry point. On restart, reconcile unfinished tasks, cancellation intent, and recorded outcomes before continuing. Persisted waiting fields alone are not a wakeup mechanism. If continuation is blocked, report what is missing, who can resolve it, and the next step through the authorized originating conversation.
- **Bounded execution**: Apply configured runtime and attempt limits to every background task, reusing native controls where available. Record the effective limits; carry attempt accounting across redelegation and restart. A further attempt must address an identified gap. At a limit or repeated lack of progress, stop new work and report partial outputs, remaining gaps, and a proposed next step. Resume only under an explicit user instruction or an already authorized policy; do not silently reset limits.
- **Identity and approval**: Bind task lookup, result delivery, changes, cancellation, and approval to the existing trusted identity and audience permissions. Delegation must not expand the initiating task's authority. Bind each approval to an authorized approver, task, exact action, target, and material version. Material changes invalidate the prior approval. Reject unauthorized, stale, duplicate, or post-cancellation decisions without executing the action again. Existing authorization remains valid within its scope; ordinary read-only work does not acquire an approval requirement merely because it is delegated.
- **Changes and cancellation**: Update the goal and completion criteria when an authorized user changes direction, then stop or reconcile incompatible work. Late results from an earlier scope cannot establish completion of the revised task. Cancellation stops new delegation and requests native cancellation of active work. Report cancellation as pending until active work settles, and surface cancellation failures. Describe external actions already performed or of uncertain outcome separately; cancellation does not imply rollback. Check uncertain outcomes before any retry.
- **Retention and retrieval**: Retain the task identifier, owner/audience association, latest goal and completion criteria, final status, result summary, and deliverable links in existing access-controlled storage for an explicitly configured period. The former 30-day value is a pending product parameter, not a fixed acceptance requirement or a reason to create an independent history platform. Preserve open-task associations while work remains active. Native run records may expire earlier; their cleanup must not erase this minimal summary. Reuse existing storage and do not archive full transcripts by default. After expiry or artifact removal, report unavailability rather than reconstructing an outcome. Explicit deletion and existing privacy requirements take precedence.
- **Completion evidence**: Deliver outputs with enough evidence to check the agreed criteria, identifying unresolved gaps and unavailable artifacts. Report completed, blocked, limited, and cancelled outcomes distinctly using native states and summaries. A successful child run alone does not prove the user's task is complete.

## 4 Version and Capability Boundaries

The Nori baseline in this PRD pins OpenClaw commit `4a11f89e840b2bb3eedcad2820ab25b8520905b6` through the [vendor Git tree][NR-PIN]. Its [package.json][OC-PACKAGE] declares version `2026.9.5`. This version already includes subagents, persistent Task Flow, and Lobster integration. The Lobster plugin manifest declares version `2026.9.5`, bundles runtime `2026.9.13`, and requires plugin API version `>=2026.9.5`. [Lobster package][OC-LOBSTER-PKG]

These facts come from the pinned source and official documentation; they do not establish that the capabilities are installed or enabled on the server. During implementation, address actual integration gaps rather than creating a separate project to validate upstream capabilities. One known gap is that Lobster is optional and does not expose tools in a sandboxed tool context. Use a trusted entry point compatible with Nori's existing isolation; do not enable it by disabling isolation for public-facing workloads. [Lobster documentation][OC-LOBSTER] · [Plugin entry point][OC-LOBSTER-ENTRY]

Describe recovery using native semantics:

- **Record persistence**: Task Flow saves state and associations, not the execution call stack. Writing waiting-state fields alone does not automatically create a wake-up event. [Task Flow][OC-TASKFLOW]
- **Resuming from an approval checkpoint**: Lobster can resume after pausing at an explicit checkpoint. This depends on the saved checkpoint; the token alone is not the complete state. [Lobster][OC-LOBSTER]
- **Continuing after execution is interrupted**: Subtasks interrupted by a Gateway restart do not automatically replay commands. The primary Nori uses native results to inspect completed work, then decides whether to continue or delegate again. Do not promise arbitrary instruction-level resume or automatic takeover across machines. [Subagent operations][OC-SUBOPS]

## 5 Incremental Milestones

Each task milestone delivers one demonstrable end-to-end lifecycle through small PRs; M0 separately delivers the shared-Gateway/public-entry migration. Acceptance focuses on Nori's integration and affected product behavior, without re-proving every native guarantee.

| Milestone | Product deliverable | Dependency / current decision |
| --- | --- | --- |
| M1: internal Slack task loop | Authorized research/native child and coding/existing ACP, progress, change/stop and delivery | First delivery priority; own task/identity/storage/provider boundaries and #66 affected-path compatibility required |
| M2: continuation and recovery | Review results, follow up, handle changes/cancellation/restart, retain minimal summaries | Depends on M1; feature slicing and retention parameter under review |
| M3: fixed Lobster workflow | Exact-action-approved draft and designated test-recipient send | Existing M1/M2 dependencies retained; optionality/scope under review; no real outreach |
| M0: shared Gateway and Discord Community migration | Distinct persistent agents, public workspace, scoped callers/memory/provider limits, preserved-state cutover | Independent milestone; #54/#55/#56/#67/#68 provide applicable behavior gates for #57; not a blanket gate on internal Slack delivery |

Do not read milestone numbers as execution order. M0 retains privacy, memory and capability behavior; v0.6 revises route/limit criteria and adds usage reporting. Separating schedules does not accept M0.

### M0 Shared-Gateway and Discord Community Migration — Independent Milestone

**Deliverable**: One OpenClaw Gateway routes Slack to primary Nori and Discord to persistent Nori Community. Community has its own workspace, limited tools and backend caller, scoped sessions/memory, and explicit provider preferences. Magpie owns inference Provider management and quota controls; Community is Qwen-first with bounded difficult-question escalation, Slack dynamic by default, and usage is attributed and reported. This is an independently tracked and accepted milestone, not a prerequisite for all internal M1–M3 acceptance. It retains the already delivered #49/#50/#52/#53/#51 slices. Native memory/session compatibility (#55), configured runtime bounds (#54), Router/background/media compatibility (#56), Qwen-first/quotas (#67), usage/reporting (#68), and preserved-state/live cutover (#57) apply to this target. These require behavior evidence, not preselected new engines or upstream extensions. Public cutover waits for these gates; the internal pilot must independently prove the boundaries it actually uses.

**Acceptance criteria**:

- Verify both actual platform entry points: Slack reaches primary Nori and Discord reaches `nori-community` in the shared Gateway. The Dashboard clearly labels both agents and internal workers. Preserve or explicitly migrate the dedicated Slack development binding.
- Community completes real authorized onboarding, learning-resource Q/A and organization/event retrieval using the correct restricted backend caller and sufficient scoped read/retrieval/native interaction tools; primary Nori retains authorized internal capabilities. Restricted organization information remains inaccessible to an ineligible Discord requester.
- Adversarial Discord inputs cannot execute host commands, alter production code, obtain credentials/private workspace files, invoke internal governance operations, or delegate those actions to primary Nori/Codex. Verify runtime tool denials and backend authorization, not only model refusals. Retrieved/forwarded public content cannot become a privileged instruction through an agent handoff.
- Use at least two accounts to verify DM, room/thread, audience, private-memory, and cross-agent boundaries, including a user linked on both platforms. Public history is shared within its original room/thread; private canaries must remain isolated across senders, public/private audiences and agents. Task lookup and cross-channel delivery do not reveal internal or another user's private results. Confirm the effective DM policy explicitly.
- Demonstrate different provider/model preferences for primary Nori and Community, a platform default, and a specific channel override. Show effective settings and actual route selection. Simulated provider failures follow the configured order; empty fallbacks, exhausted routes, and forbidden paid/provider fallbacks fail as configured. Manual selection, provider-side fallback, and child delegation cannot bypass the same limits.
- Demonstrate Community Qwen-first instant/thinking-off service, at most one approved escalation per question and restoration to Qwen, including concurrent questions and failure. Verify native runtime/rate/concurrency bounds and Magpie quota configuration under repeated public requests; advanced exhaustion retains Qwen or fixed-resource fallback without unauthorized routes. Slack Dynamic Router is on by default with persistent manual disable/Provider/model choice; Cron honors its agent default or explicit job override.
- Resolve the current dedicated-profile restriction in custom isolation adapters or validate an equivalent native integration. Establish coordinated tool registration, per-agent callers, restricted workspace access, and trusted context propagation; do not simply disable the guard.
- Rehearse cutover and rollback with preserved histories, pending task ownership, and destinations. No duplicate bot consumers, external actions, or silent history merging. Record the effective deployed policies and limitations before accepting M0.
- Verify Axiom channel/agent/Provider/model/trigger usage without duplicate accounting, separately marked ACP/unknown usage, and native Cron reporting at 09:00 America/Los_Angeles to #nori-alerts for the previous day. Verify the 80% configured-allowance warning and native exhaustion with deduplicated notifications and estimated-cost labels.

### M1 Task Intake and Initial Delegation

**Priority and boundary**: First delivery priority confirmed November 9. The existing authorized Slack topology may be used without M0 migration, provided task results remain in access-controlled storage outside public shared references, existing main/development bindings and Magpie policies are preserved, and unauthorized task access is rejected. Reuse native configuration and existing integrations; identify concrete authority/storage/reply seams before the relevant implementation slice.

**Deliverable**: Trusted Slack users initiate tasks, inspect progress, change or stop work, and receive results in the original conversation. Research uses native subagents; coding reuses ACP and the server coding clients. Nori links actual native task/run IDs and existing records, without a parallel scheduling state machine. #66 removes interactive-only authorization assumptions for affected paths.

**Pilot scenario**: Research potential funding and institutional partners for Rein. The intake specifies the desired shortlist size and scope; each entry includes sources, mission fit, eligibility constraints or explicitly identified unknowns, and a suggested contact priority. Research does not authorize outreach.

**Acceptance criteria**:

- A clear Slack request receives a task identifier and restated completion criteria without an unnecessary confirmation turn; the task links to an actual native child run.
- While research runs, the user can continue an unrelated conversation and query meaningful task progress without losing either context.
- The primary Nori delivers a source-backed shortlist through the originating authorized conversation and checks it against the agreed criteria. Unverified claims and gaps are marked rather than reported as established facts.
- An unauthorized user cannot retrieve the task's restricted results or change its scope through the new task entry points; ordinary trusted Slack work has no unrelated Contributor/Director gate.
- Reuse ACP→Codex to delegate a bounded coding task and receive actual status/results. Use native change/stop controls and accurately report pending/failed cancellation. Keep client-native login; Claude Code/OpenCode adapters are separately tracked and not all required for initial acceptance. Verify system/background identity compatibility on the actual affected path (#66).

### M2 Primary Agent Continuation and Acceptance

**Deliverable**: Based on subtask results, the primary Nori adds work, waits for input, or completes delivery. Later conversations can find the original task and its results. Use native capabilities for status queries and cancellation.

**Acceptance criteria**:

- In the M1 scenario, deliberately omit eligibility information from the first child result. The primary Nori detects the gap and initiates follow-up without a user reminder, then delivers a complete result or a specific unresolved-source limitation.
- Change the research scope while a child is running. Nori applies the revised criteria, reconciles in-flight work, and does not accept a late old-scope result as completion.
- Restart during unfinished work. The selected recovery entry point rechecks the persisted goal, limits, cancellation intent, and child outcomes without requiring the user to recreate the task. It resumes eligible work or reports a concrete blocker. A controlled uncertain-action fixture confirms that an unknown external outcome is not blindly retried; no real outreach is needed for this check.
- Cancel active work and deliver a late child result. No new delegation occurs; pending or failed cancellation is reported accurately, and the late result does not reopen the task.
- Force the configured attempt/runtime limit or repeated no-progress condition. Nori stops new work and returns partial outputs and the remaining gap; redelegation or restart does not reset the task's limit accounting.
- In a later authorized conversation, retrieve the original task summary and deliverable links after simulated native run cleanup. Verify the explicitly selected retention period without a calendar-length test (duration, formerly 30 days, remains a product decision); missing artifacts are explicitly identified.

### M3 One Fixed Lobster Workflow

**Deliverable**: Use one selected shortlist entry to prepare a partnership email draft, pause for approval, and send the approved version to an operator-designated test recipient. Reuse existing Lobster and mail integration with one `.lobster` template, identity-bound approval, and reporting through the primary Nori; no general workflow platform. Whether M3 is needed for the first release remains open. Real partner outreach is outside milestone acceptance and requires separate authorization.

**Acceptance criteria**:

- Through the actual Slack entry point, complete preparation → approval pause → authorized decision → resume or cancel → result report. Before approval, show the exact draft, test recipient, and proposed action; no send occurs while approval is pending.
- Bind the Slack decision to the saved checkpoint and current task/material version. An unauthorized reply, approval of a superseded draft, duplicate approval, or approval after cancellation cannot cause a send or an additional send.
- On approval, send the approved version to the designated test recipient and record the provider receipt; distinguish provider acceptance from verified delivery. On denial, report cancellation without sending.
- After a restart at the approval pause, recover the same checkpoint and decision association. If checkpoint data is missing, report the blocker rather than rerunning preparation or execution blindly. For a send with an uncertain outcome, reconcile provider evidence or require resolution before retrying.
- Verify the actual installation/profile, trusted execution entry point, approval listener, and acknowledgment integration. Preserve public-facing isolation. If the runtime environment is incompatible, document the blocker and leave M3 incomplete without holding up M1–M2 delivery.

### Further Expansion as Needed

Once these end-to-end task lifecycles work, separately plan automatic Discord deployment management, PR/CI event follow-up, and additional fixed workflows. Continue reusing existing deployment and automation capabilities rather than building a general-purpose platform in advance.

## 6 Mapping to DeepSeek Concepts

The DeepSeek article informs the product direction. Implementation choices belong to Nori; this PRD does not call for reproducing every part of the research prototype.

| Design in this PRD | Corresponding DeepSeek concept |
|---|---|
| The primary Nori retains ownership of tasks while subagents execute concrete work. | §1 Super-agent; §2 Router / Worker Layer |
| Long-running tasks execute in the background while users continue conversations and check progress. | §4.1 Full-Duplex |
| Slack primary Nori and Discord Nori Community use separate authority and context, with authorized coordination and audience-bound results. | §4.2 Multi-Channel |
| Task records are separate from execution, with clear responsibility for continuing after interruption. | §5 Separating Compute, State and Environments |

Sources: [Original post](https://x.com/deepseekharness/status/2116857257245987236) and [readable mirror](https://threadnavigator.com/thread/2116857257245987236/). Access to the original X page was restricted during the earlier review, so section references are based on the mirror. The mirror labels its English text as machine-translated; this document paraphrases concepts only. The [public prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) is a non-production research reference, not evidence of capabilities already implemented in Nori.

## Official Implementation References

- [Native subagents][OC-SUBAGENTS]: Background subtasks and responsibility boundaries.
- [Subagent operations and recovery][OC-SUBOPS]: Concurrency, stopping, and continuation after restarts.
- [Task Flow][OC-TASKFLOW]: Persistent run records and explicit progression.
- [Lobster][OC-LOBSTER]: Fixed workflows, approvals, and resume.

All OpenClaw links above are pinned to the source version used by this PRD. This update changes documentation only; no plugins have been installed, code modified, or deployments changed.

[NR-PIN]: https://api.github.com/repos/rein-protocol-foundation/nori-agent/git/trees/8f17b7f1dcbff30f987ebffca7c215c4e0462313
[OC-PACKAGE]: https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/package.json
[OC-SUBAGENTS]: https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/docs/tools/subagents.md
[OC-SUBOPS]: https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/docs/tools/subagents/operations.md
[OC-TASKFLOW]: https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/docs/automation/taskflow.md
[OC-LOBSTER]: https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/docs/tools/lobster.md
[OC-LOBSTER-PKG]: https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/extensions/lobster/package.json
[OC-LOBSTER-ENTRY]: https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/extensions/lobster/index.ts
