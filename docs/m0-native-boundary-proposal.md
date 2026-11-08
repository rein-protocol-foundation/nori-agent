# M0 native ownership boundary: feasibility and proposed extension

Status: **proposal, not an implemented isolation boundary**. Applies to pinned OpenClaw
`4a11f89e840b2bb3eedcad2820ab25b8520905b6`. Source and runtime probes were inspected on
November 7–8, 2026 (Pacific). No vendored source was modified, no withdrawn adapter was enabled,
and no live history, memory or channel configuration was changed by this investigation.

## Confirmed public-room decision — November 8

The operator explicitly permits shared public history within the same public Discord room/thread.
DMs and private memory must remain strictly isolated. This supersedes the earlier strict-per-speaker
assumption: an early per-speaker public history resolver is **not an M0 prerequisite**. Native public
room/thread routing satisfies the chosen public-history semantics. It does not grant access to other
rooms, DMs, restricted organization records, internal agents or private memory, including private
memory belonging to the same member. Automatic memory and authorized continuity remain required.

中文决策：同一公开频道/线程允许共享公开历史；DM、私有记忆、不同受众与主 Nori 的内部数据继续隔离。
不再因公开房间未按发言人分键而阻塞 M0，也不能用关闭记忆或复制个人 workspace 来绕过私有数据边界。

## Reproduced boundary

Run `node scripts/probe-native-owner-scope.mjs` after building the pinned upstream. It uses a
synthetic configuration and temporary HOME/state, starts no bots, and makes no inference calls.
The probe ran on the separate OCI validation checkout. Its successful assertions mean the
limitations were reproduced; they do **not** mean M0 passed.

| Native behavior | Observed result |
| --- | --- |
| Discord account binding to `nori-community` | Supported |
| `per-account-channel-peer` DM scope with two senders | Different session keys |
| Two senders in one public room | Same session key |
| Two senders in one native thread | Same session key |
| Different room/thread IDs | Different session keys |
| DM vs public room and same sender across two enrolled bot accounts | Different session keys |
| Explicit DM scope and default cross-conversation private recall | Recall disabled by native heuristic; no per-sender automatic-memory guarantee |
| Community `memory.search.extraPaths: []` over a global internal extraPath | Global internal path remains inherited |
| Internal extraPaths moved to `main` with no global roots | Internal root retained by main, absent from Community |
| Native search-hit authorization for workspace memory, DM A / DM B / public | Same synthetic private workspace-memory hit accepted for all three, even with session visibility `self` |

The probe calls the native Discord route helper and the exact deployed memory build. It reads an
internal memory export solely for diagnostics because deployment artifacts omit source-only workspace
package links. Production Rein plugins must continue to use supported public SDK exports.

Concrete source seams:

- `extensions/discord/src/monitor/route-resolution.ts`: `buildDiscordRoutePeer` uses native
  conversation ID for guild/group peers and sender ID only for a direct peer.
- `extensions/discord/src/monitor/message-handler.preflight.ts`: pending history is recorded with
  `historyKey: messageChannelId`, including before normal turn dispatch. A late model hook cannot
  undo those writes or prove that previous context was never loaded.
- `extensions/discord/src/monitor/message-handler.context.ts`: recovery, session lookup, quotes and
  thread context are assembled before the model. All need the same ownership contract.
- `src/plugins/hook-types.ts`: `inbound_claim` / `before_dispatch` can claim handling and provide a
  reply. Their results do not provide a transparent native owner/session/history-key override.
- `packages/memory-host-sdk/src/host/config-utils.ts`: recall is explicitly described as
  agent/private-shaped, not per-sender; global and agent extraPaths are concatenated. An empty
  Community list does not subtract an internal global root.

These observations agree with [the adapter withdrawal design](discord-isolation-redesign.md).
Do not replace native Discord, monkey-patch internals, disguise rooms as DMs, or treat prompt
instructions / disabled memory / a new workspace as a substitute for owner-aware storage.

## Proposed narrow upstream contract

Memory, execution deadlines and origin-preserving auxiliary model calls remain unresolved contracts.
Names below are proposals, not available API names. The first historical proposal is retained as
optional future work; public-room sharing does not require it.

### Optional future work: strict public-speaker ownership

Add an optional policy resolver after platform authentication and channel admission, before pending
history writes, cached history lookup, session selection/creation, debounce aggregation or queueing.
Inputs are immutable host evidence: agent, platform, bot account, workspace/guild, native conversation,
thread and parent IDs, sender, message/event ID, audience/visibility, and authenticated command source.
The resolver may return a stricter opaque owner-scope ID or deny. It may not select a different agent,
provider, recipient or capability set. A native helper composes the session/history keys; plugins do
not receive a way to rewrite arbitrary session keys.

The host carries this scope through inbound context, session lifecycle, tool invocation, model and
memory hooks, child runs, delayed replies, reset/forget, recovery and delivery. Channel settings and
transport behavior stay native. Same-owner debounce is permitted; cross-owner coalescing is refused.
Quotes and public thread starters remain attributed source data with their own provenance; they
cannot become the asker's identity, private memory or permission evidence. Room caches, pending
history and history recovery apply the scope before returning content.

Disabled resolver behavior must match the current native baseline. Existing channel-scoped transcripts
remain preserved under their original keys and are never silently imported into new owner scopes.
A versioned migration map may expose history only when reliable event ownership and audience evidence
supports that specific transition; inferred identity from display names or content is insufficient.

### Required: owner/audience-aware native memory access

Pass host-issued ownership/audience provenance to native indexing, automatic capture/flush, retrieval,
compaction summaries, citations, corrections, retention and deletion. Filtering occurs inside storage
or retrieval before results enter model context. Direct file/session tools cannot bypass it. A memory
record has separate owner, audience and purpose fields: the same person's DM data is not automatically
valid for a public answer, while permitted public preferences can persist across conversations.
Cross-platform Rein identity links are evidence for backend identity only, not implicit history access.

Keep native memory/search capabilities and automatic capture. The extension must expose an ACL-capable
storage/query boundary or a supported owner-scoped collection API, with tests covering all index/cache
paths. A plugin that merely supplies a replacement `memory_search` tool is insufficient if automatic
recall or flush still uses a shared store.

The current public `MemoryFlushPlanResolver` (`src/plugins/registry-contribution-types.ts`) receives
only configuration, time and context-window size: no trusted sender/session/audience. The native
`extensions/memory-core/src/flush-plan.ts` targets `memory/YYYY-MM-DD.md` inside the agent workspace.
`getMemorySearchManager` is also agent-scoped. `authorizeSearchHits` is a selected-memory-plugin
interface, not an extra ACL layered onto memory-core; the native implementation's session visibility
filter passes non-session workspace-memory hits unchanged. The updated diagnostic invokes that
actual deployed filter with DM A, DM B and a public requester and reproduces this limitation. It
does not claim that a real private record was leaked or that it tested every retrieval path.

`registerMemoryCorpusSupplement` adds a source; it cannot constrain existing native sources or flush.
Replacing only tools, disabling recall, or enabling `rememberAcrossConversations: true` cannot repair
this contract. Relocating global internal paths is a necessary, independently verified configuration
change, but it does not create per-member ownership inside Community's own workspace.

### Required: host-enforced per-run execution deadline

The public `api.runtime.gateway.request` surface is limited to bundled or trusted official plugins.
An actual OCI Gateway test attempted exact run/agent/session cancellation from `rein-router` at one
second while a synthetic cancellable tool waited 15 seconds. The RPC was rejected; the tool ran its
full wait and observed no abort. Relevant pinned source: `src/gateway/server-plugins.ts`,
`dispatchTrustedPluginGatewayMethod`; `src/plugins/hook-types.ts`, `PluginHookBeforeAgentRunResult`
currently provides pass/block only. The attempted timer/RPC implementation was removed from PR #52.

Allow an admitted `before_agent_run` result to tighten a host-owned execution deadline. The host,
not the plugin, owns the timer and propagates cancellation through model requests, tool signals,
fallback and run lifecycle. The result cannot expand permissions, extend an existing deadline,
change a run ID, cancel a successor, or clear another run's queue. Runtime replacement and plugin
retirement must preserve the stricter deadline. Uncooperative tools retain concurrency until actual
settlement, even after the host requests cancellation. Test deadline/settlement races and reload.

Do not grant generic operator RPC access, pretend to be an official plugin, patch vendored internals,
or reduce all agents' global timeout as a substitute for this scoped contract. Per-model transport
timeouts and request budgets alone do not meet the PRD's whole-run runtime bound.

### Required compatibility: trusted origin for auxiliary inference

PR #50 currently denies scoped auxiliary completions and attachment requests. This is an explicit
activation gap, not acceptable production behavior for native compaction, memory and media features.
The public provider stream wrapper supplies agent/model context; auxiliary completions do not carry
the authenticated initiating channel, sender, audience and admission lease required to resolve a
channel override and charge the originating public budget. Picking the only active run would be
unsafe with concurrent runs or delayed completion. Choosing the main agent/global key would widen
eligibility and bypass explicit fallback policy.

Provide a host-issued immutable origin/admission reference through compaction, memory flush, media
processing and provider fallback. It must refer to the original admitted work, preserve the agent's
route ceiling and budget, and expire on settlement/revocation. Autonomous memory maintenance needs
an explicit agent-scoped policy and budget rather than pretending to be an external user. Attachment
capability metadata and the selected provider/model must be checked end to end; public content cannot
mint origin references. Verify overlapping users, late/replayed references, empty fallbacks, budget
exhaustion, normal attachment/tool continuation and a disabled-policy baseline before activation.

## Runtime plan after feasibility passes

1. Preserve Slack `main`, development agents, private roots, tools and existing authorized workflows.
   Bind Discord to persistent `nori-community` using native bindings in one candidate Gateway.
2. Give Community a separate writable workspace/state root. Reuse reviewed public Nori personality
   content and channel-independent skills via native skill discovery; never copy personal memories,
   credentials, internal operations records or runtime state into shared resources. Inventory skill
   reference/script paths and test new skill discovery without adapter edits.
3. Move internal memory extraPaths out of global defaults and into the authorized internal agents.
   An agent-level empty list is inadequate. Keep personal memory in owner-aware storage, outside
   shared public references. Use filesystem/sandbox restrictions as an additional boundary.
4. Enable per-agent backend callers from PR #49, verified against live backend enrollment. Community
   keeps identity/catalog tools; governance and host/development operations remain unavailable.
   Native messaging actions require source/destination checks, not a blanket loss of native transport.
5. Configure explicit DM isolation even if DMs remain disabled. Cross-agent session enumeration,
   history reads, delegation and result delivery retain originating owner/audience authorization.
   Inspect the native recall heuristic before changing `dmScope`: it changes default recall behavior,
   so setting it alone in production would silently remove useful continuity. Configure it together
   with the verified owner-aware memory implementation, not as an isolated migration shortcut.
6. Enable scoped provider policies from PR #50 only after auxiliary completion and attachment paths
   carry sufficient origin/capability evidence. Their current fail-closed restrictions must not be
   mistaken for fully compatible runtime migration. Keep Jev-independent coding-plan exclusion until
   equivalent verified plan eligibility exists.
7. Rehearse stopped-service backups, non-destructive candidate state, one consumer per bot and rollback.
   Verify that in-flight tasks and results retain source destinations. Activate only after the native
   compatibility and two-account acceptance gates pass.

## Reuse existing spending controls; fill only missing admission scope

Pinned Magpie already provides caller-key `limit`/`moreLimits` with token/cost windows, and provider
`maxRPM` / `maxConcurrency`. Sources: `internal/access/limit.go`, `internal/gateway/key_limit.go`,
`internal/gateway/rpm.go`, and `internal/gateway/concurrency.go` at Magpie
`95e7c6bcc07629897f6703c31eaef477fcee4a13`. These are useful primitives, but provider/account-level
rate limits are not per-Discord-sender or conversation limits. Cost counters are estimates, not bills.

PR #52 adds durable sender/conversation rates, concurrency and per-agent daily gateway-request budgets,
with actual OpenClaw/Magpie and six-process SQLite acceptance. Its `before_agent_run` admission gate
does not precede native history loading, debounce or queueing, so it also does not bound all ingress
processing costs. It does not implement a token/currency budget or whole-run deadline. Production activation remains pending. Retain native Magpie accounting
and key limits, and allocate separate
agent/route credential scopes when independent aggregate token/currency ceilings are needed. Budget exhaustion must end the authorized
chain rather than start another key/provider. Concurrency and in-flight budget reservations, repeated
failure attempts, process restart, config reload and clock/window rollover need explicit acceptance
coverage. Choose actual numeric limits from operator policy and available subscriptions before live
activation; this proposal invents neither paid authorization nor account capacity.

## Acceptance required before cutover

- Two real authorized test accounts alternate and overlap in the same room and thread. Inspect actual
  session/history keys, provider inputs, summaries, indexes and tool evidence, beyond visible replies.
  They intentionally see the public history of that room/thread; strict per-speaker public keys are
  not an acceptance criterion. Distinct rooms/threads and DMs retain their own context boundaries.
- Private canaries never enter another sender's context or the same sender's public reply. Permitted
  cross-conversation preferences survive restart/reset; delete/forget removes indexed and cached data.
- Mention/no-mention settings, attachments, quotes, threads, native actions, identity/catalog tools,
  reusable skills and permitted memory work with isolation enabled and disabled.
- Unknown/forged origins, role claims, manual provider escape, unauthorized delegation and destination
  changes are refused. Coding and paid-use policy remains enforced without Jev on ordinary requests.
- Per-user/conversation rate and concurrency, output/runtime, aggregate budgets, fallback exhaustion,
  cancellation, restart and revocation are tested with no hidden paid/model fallback.
- Histories and pending tasks remain recoverable; rollback restores a verified previous topology with
  exactly one consumer for each bot. No global M0 acceptance tag until these gates pass.
