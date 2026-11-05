# Discord isolation withdrawal and replacement design

[中文](discord-isolation-redesign-zh.md)

Decision recorded 2026-11-04 (America/Los_Angeles). Related requirements: R01, R03, R25,
US01, US02; backend identity remains governed by D13. This document separates the completed
production rollback, the source withdrawal proposed by this change, and an unimplemented replacement.

## Production disposition

The owner rejected the transport-replacement approach after reviewing its compatibility and memory
tradeoffs. Production Discord was restored to its pre-migration native adapter configuration and
launcher. Verification compared both restored files with the protected originals, checked HTTP
readiness and the running channel's native `Discord` label and connected status, and confirmed the
original workspace and per-channel mention settings. Ask Nori again accepts messages without a
mention. DMs retain their previous disabled setting; models, backend connections and original tool
and memory settings were restored. PR #36's administrator-attribution and truthful-handoff policy
remains deployed.

Old native transcripts, newly created isolated sessions and isolated SQLite notes were retained.
A stopped-service snapshot of runtime state, isolated notes and the public workspace was taken
before restoration. No records were merged, reassigned or deleted. Protected backups, rollback
receipts and credential locators stay outside Git. No real-member messages were sent for verification.
**Native guild sessions are still channel-shared. Rollback restores compatibility, not isolation.**

## Source withdrawal and dependency review

| Code or artifact | Disposition and reason |
| --- | --- |
| PR #6 production `rein-discord` transport | Remove bot login/REST transport and the installation example. Retain a diagnostic plugin entry that refuses registration before claiming a channel or exposing tools. No silent native fallback and no runtime override to enable the withdrawn transport. |
| Historical Discord registration | Move to a test fixture requiring an injected transport. Only synthetic probes use it. A passing probe is evidence about the tested boundary, not a supported production adapter. |
| Scope, notes, generation/reset and active-turn controls | Retain regression coverage and reusable primitives. Their successful isolation tests do not validate the old product design. |
| PR #7 shared core and Slack adapter | Do not blindly revert: Slack imports the shared core and has separate transport/backend checks. No Slack production configuration is changed here. Its replacement-adapter design also needs compatibility review before any new rollout. |
| Router probes and model-selection tests | Preserve their historical synthetic ingress dependency so withdrawal does not remove unrelated routing coverage. They are not evidence of native Discord compatibility. |
| PR #36 and Foundation identity/catalog tools | Retain. Correct attribution and backend authorization are independent of transcript/memory isolation. |

Reverting the historical merges wholesale would also remove shared-library consumers and useful
regression coverage. The withdrawal removes the production connection path while preserving those
explicit dependencies. Privacy auditing rejects any profile requesting `rein-discord`, including a
profile that met the old guard. Operators must restore a reviewed native profile explicitly; simply
disabling the replacement while leaving the native adapter disabled will not reconnect Discord.

## Why the previous design is not the target

The replacement retained the `discord` channel ID but not the native outbound/actions, media,
interactive commands or full integration surface. It had a single mention switch and required a
separate public workspace, disabled shared recall/flush, and replaced general memory with explicit
named notes scoped to both sender and conversation. These restrictions were real product changes.
They must not be treated as inherent requirements of user isolation.

## Required replacement behavior

1. **Native channel compatibility.** Keep the native Discord transport, account and channel settings,
   reply/attachment/thread behavior, message actions and existing plugin interfaces. Preserve Ask
   Nori's no-mention setting independently of isolation. DMs may later be enabled under their own
   access policy; this design does not enable them now.
2. **Trusted session ownership before history access.** Resolve ownership from the authenticated
   native sender, bot account, guild and conversation before loading, recording, queuing or summarizing
   history. Apply the same boundary to cached channel context, quotes, thread starters, reset and
   concurrent turns. Do not disguise public rooms as DMs. Public quoted content may be supplied when
   appropriate, with source attribution; it cannot become the asker's identity or personal memory.
3. **Keep useful personal memory.** Preserve in-session continuity and compaction, automatic capture,
   and searchable long-term memory. Enforce owner and audience constraints in storage/query code,
   before retrieval results reach the model; filtering an already mixed result in the prompt is not
   sufficient. Reuse native search/indexing where its access contract can be proven. SQLite is a
   possible storage implementation, not a reason to restrict the product to fifty named notes.
4. **Separate conversation and memory scopes.** Conversation isolation need not prevent the same
   user's permitted preferences from following them across conversations. Visibility and purpose
   determine reuse. Private/DM content must not flow into another user's context or into public
   replies merely because the same user asks there. Cross-platform identity links alone do not merge
   memory or permissions. The policy for selectively sharing personal facts remains to be specified.
5. **Automatic capture with provenance.** Host-supplied owner, source message/event, conversation,
   audience, timestamps and retention metadata accompany each record. Distinguish personal
   preferences, attributed user claims, derived summaries and independently verified organizational
   facts. Summaries retain provenance. Repetition, confidence or an earlier Nori response cannot
   promote a user's claim into a verified fact. Role/permission checks always use current backend
   authority, never memory. Support corrections, conflicts, expiry and deletion from indexes/caches.
6. **Explicit tool and resource policy.** Preserve useful native message actions with checks on the
   operation, recipient/channel and caller authority. Public file resources can use reviewed read-only
   roots; authorized backend catalogs and web resources need not be copied into a workspace. Inventory
   existing skill references and resource locations before changing roots. Private memory must never
   be exposed through a general file tool. A single shared USER/MEMORY file is not per-user storage.
7. **Opt-in behavior with a defined off state.** Keep this an optional plugin/policy extension.
   Disabled behavior matches the native baseline. Enabling/disabling must not overwrite channel
   settings, move workspaces, delete sessions or merge owner-scoped records into a shared store.
   Existing mixed transcripts remain archived unless reliable event ownership supports a reviewed
   migration; never infer ownership from text, display names or a model's guesses.

## General workspace skills

Nori skills belong in `workspace/skills/<name>/SKILL.md`, with their references and scripts in
that skill directory. They are reusable workspace capabilities, not Discord/Slack adapter assets.
Adding a skill must not require editing `rein-discord`, `rein-slack`, or `rein-isolation` name
allowlists, copying it into a channel-specific workspace, or changing session routing. Preserve
native discovery and normal dependency/enablement checks. Skill availability does not grant tools,
credentials or backend authority; those remain checked per invocation and audience. Personal inputs,
outputs and memory are not shared skill resources.

The existing `rein-community-discovery`, `nori-browser`, and `agent-browser` already live there.
PR #38's current job-matching skill also targets this directory without adapter changes. This PR
restores ordinary native Discord workspace loading but retains the old Slack guard and historical
Discord fixture guard, which still allow only `rein-community-discovery`. Those guards are a legacy
compatibility limitation, not the policy for new general skills. Do not claim Slack-wide compatibility
or relax its file guard without a replacement boundary for private files and tool execution.

Before another isolation rollout, verify all workspace skills and a newly added skill (including
references/scripts) through native discovery with isolation on and off, without adapter edits.
Verify authorized use separately from discovery, and prove private state stays inaccessible.
`node scripts/verify-workspace-skills.mjs` verifies the ordinary native discovery baseline only;
it neither starts a channel nor proves isolation or tool execution.

## Extension-point feasibility gate — not yet passed

The pinned native Discord route resolves the conversation peer through
[`resolveAgentRoute`](../vendor/openclaw/extensions/discord/src/monitor/route-resolution.ts).
Its group route does not use the sender as the session peer. Setting `dmScope` does not repair this.
The [`inbound_claim` result](../vendor/openclaw/src/plugins/hook-types.ts) offers `handled` and an
optional reply, not a sender-scoped route override. Taking over dispatch there is not automatically
transparent to history handling or outbound behavior. Late prompt/tool hooks cannot prove an earlier
history read was isolated.

The native [memory capability registration](../vendor/openclaw/extensions/memory-core/index.ts)
provides tools, recall integration and a flush-plan resolver. The pinned
[cross-conversation recall policy](../vendor/openclaw/packages/memory-host-sdk/src/host/config-utils.ts)
is agent/private-shaped rather than a general per-sender ACL. Its existence is not proof that a new
plugin can transparently scope every index, automatic write, recall and file read.

Before implementation, produce a local trace showing where trusted ownership can be attached and
enforced on all of those paths while the native transport remains active. If the public SDK lacks an
early enough seam, propose a narrow upstream extension and review its compatibility before adopting
it. Do not monkey-patch runtime internals, edit the read-only vendored source, replace the native
channel again, or announce a complete plugin solution based on hook names alone.

## Acceptance gates before another rollout

| Gate | Required evidence |
| --- | --- |
| Native compatibility and off state | Baseline-versus-enabled/disabled tests for channel mentions, Ask Nori, replies/quotes, attachments, threads, allowed message actions, identity/catalog tools, router behavior and actual installed plugin hooks; config/workspace unchanged by toggling. |
| Same-room users and concurrency | Two senders alternate and overlap turns. Inspect actual session keys, model inputs, summaries, retrieval queries/results and writes. A's canaries never enter B's context. Claimed names/roles/IDs cannot select another owner. |
| Public/private and permitted continuity | A's permitted personal preferences survive restart/reset and approved cross-conversation use; A's private canary reaches neither B nor A's public reply. Future DM enablement gets a separate live gate. |
| Automatic capture and resistance to false claims | Automatic notes remain usable without requiring a “remember this” request every time. False administrator/maintainer statements remain attributed, unverified claims through recall and compaction, and never change authorization or routing. |
| Resources and tools | Every supported skill/resource route still works through approved roots or authorized tools; unauthorized roots, recipient changes and cross-owner reads/writes are refused. |
| Data lifecycle and rollback | Indexes, summaries, corrections, deletions and active turns obey ownership; test concurrent forget/reset. Preserve both stores and show no silent import of mixed historical sessions during toggles or rollback. |
| Live acceptance | Two authorized real accounts in an existing test channel, with inspected provider inputs and tool evidence as well as visible replies. Synthetic probes and “connected” status alone are insufficient. |

The current PR withdraws the old production path and records these gates. It does not implement the
replacement or claim that the feasibility or live-acceptance gates have passed.
