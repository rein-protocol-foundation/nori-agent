# M0 native ownership boundary: feasibility and proposed extension

Status: **proposal, not an implemented isolation boundary**. Applies to pinned OpenClaw
`4a11f89e840b2bb3eedcad2820ab25b8520905b6`. Source and runtime probes were inspected on
November 7, 2026 (Pacific). No vendored source was modified, no withdrawn adapter was enabled,
and no live history, memory or channel configuration was changed by this investigation.

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
| Explicit DM scope and default cross-conversation private recall | Recall disabled by native heuristic; no per-sender automatic-memory guarantee |
| Community `memory.search.extraPaths: []` over a global internal extraPath | Global internal path remains inherited |

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

Three related host contracts are needed. Names below are proposals, not available API names.

### 1. Native owner resolution before any history operation

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

### 2. Owner/audience-aware native memory access

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

### 3. Host-enforced per-run execution deadline

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
