# M0 implementation and acceptance ledger

Requirements: [Super Agent PRD v0.5](super-agent-nori-prd-en.md), sections 2.2, 2.3 and M0.
Started November 7, 2026 (America/Los_Angeles). M0 is **not accepted** until all gates below pass.

## Baseline and delivery sequence

The inspected production revision is `bc593ac76f49226dff36427962f66496bbfb1a6d`, newer than
PRD section 2.1's snapshot. OpenClaw remains pinned at `4a11f89e840b2bb3eedcad2820ab25b8520905b6`.
Native Slack and Discord run in separate services, share `workspace/`, and both have DMs disabled.
Neither has an explicit `session.dmScope`. Both inherit an internal operations memory extraPath.
The withdrawn Discord adapter must not be re-enabled. The existing Slack development binding stays.

Small dependent PRs will cover:

1. **Backend caller boundary:** opt-in `rein-operations.agentProfiles`, coordinated tool registration,
   trusted agent/platform/bot-account dispatch, Community-only tool surface and negative tests.
2. **Provider policy:** retain Magpie; hard eligible routes and spending constraints per agent,
   channel > platform > agent preferences, ordered explicit fallbacks, Jev-independent normal operation.
3. **Runtime boundary:** reviewed Community workspace, native ingress bindings, tool/session/memory
   controls, resource ceilings and configuration preflight. Resolve native ownership limitations first.
4. **Migration and acceptance:** isolated OCI rehearsal, actual platform tests, rollback rehearsal,
   merge-triggered rollout, runtime change record and acceptance tag only for proven gates.

Source development takes place locally. OCI tests use a separate validation checkout and synthetic
endpoints; the active checkout is never used for development or repository-suite execution.
Production application source changes use merged PRs and the existing webhook updater. Runtime
configuration changes need private backups and a purpose/impact/expected-behavior record here.
No historical sessions, private memory or pending tasks are merged or deleted.

## Slice 1: caller dispatch

`agentProfiles` and legacy `foundationDb`/`proposalTools` are mutually exclusive. Legacy profiles
retain existing behavior until operators explicitly opt in. Each profile names one agent, one
platform, one bot account, a capability class and a complete backend configuration using environment
variable locators. Callers and credentials must be distinct across profiles. The backend still checks
workspace/channel enrollment, live requester identity and resource eligibility on every call.

Only the host's version-2 tool context selects a profile. Missing or mismatched agent/platform/account
returns no tools. Retained tools recheck invocation authority and the selected profile before execution.
Community gets identity binding, resource/event lookup and a scoped status response. Governance,
simulation and internal workflow tools do not appear in that profile. Backend callers must independently
be enrolled with the proper least-privilege scopes; selecting a profile does not grant backend authority.

Tool names register once for the shared Gateway. Backend runtime/proof closures stay separate;
caller/credential values never become model arguments or status fields. This slice does not alone
confine native filesystem, session, messaging or delegation tools; those require slice 3.

## Acceptance gates

| Gate | Status / evidence |
| --- | --- |
| Distinct actual Slack/Discord agents in one Gateway | Pending |
| Per-agent callers and runtime governance denial | Slice 1 synthetic OCI checks pass; live activation pending |
| Real authorized and ineligible community retrieval | Pending |
| Workspace, host, credential and delegation denials | Pending |
| Two-account DM/room/thread/audience/private-memory behavior | Pending; native room history is shared, DMs remain disabled |
| Scoped effective routes and ordered provider failures | Pending |
| Public request/concurrency/output/runtime/usage limits | Pending |
| Normal tasks with Jev disabled; classifier dependency audit | Pending |
| Native transport compatibility and private ownership feasibility | Pending; see discord-isolation-redesign.md |
| Preserved histories/task destinations, single bot consumers and rollback | Pending |

Do not tag M0 complete or consolidate public ingress merely because a unit test, CLI health probe
or source deployment succeeds. Any native SDK limitation must be documented with concrete evidence;
keep the two-service topology until the required boundary is enforceable.

### Slice 1 validation (OCI, November 7, 2026 Pacific)

Validation checkout: `/home/ubuntu/nori-m0-validation`, separate from the active deployment.
It uses the exact deployed/pinned OpenClaw build and Node 24.16.0 as read-only dependency inputs.
Locally authored files were copied into this checkout; no production credentials or sessions were loaded.

- Targeted profile/backend/community tests: 67 passed.
- Complete Node suite: 1,257 passed, 2 existing conditional skips, zero failures.
- Real OpenClaw loader: legacy simulator mode, legacy backend mode, and new two-profile mode pass;
  scoped tools register exactly once and output contains no synthetic credential values.
- Live Community caller permissions and shared-Gateway isolation remain pending.

No production runtime configuration changes accompany this slice. Deploying the opt-in code keeps
existing services and callers unchanged. Rollback requires the prior application revision; no state
migration is introduced.

## Slice 2: deterministic scoped provider policy

`rein-router.scopedPolicies` is opt-in. Each agent has exact `allowedRoutes`, a paid-use ceiling,
output-token and per-model-request deadlines, enrolled native origins, and defaults. Field-level
preference inheritance is channel override → platform override → agent default. Omitting `fallbacks`
inherits; `fallbacks: []` forbids fallback. A manual selection is pinned to one allowed route.
Only authenticated direct user runs are admitted. Missing origins, cross-agent/delegated triggers,
auxiliary completions and unsupported attachment requests fail closed. This slice does not claim
native attachment/compaction compatibility or public aggregate/rate/concurrency limits; activation
remains gated on slice 3. Existing configurations without scoped policies keep legacy behavior.

The origin enrollment maps platform + bot account + native channel ID to a workspace/guild. Duplicate
or ambiguous mappings are rejected. Channel names and prompt content cannot select this mapping.
The pinned model hook does not supply a general workspace ID; operators must enroll IDs from verified
native channel metadata. Live platform acceptance must check that mapping before activation.

Each approved route requires a Magpie managed key restricted to exactly its provider/model ID.
Before inference, the router checks that key's `/models` catalog is the expected singleton, sends
`Origin: null` to enforce gateway authentication, and binds every accepted authentication header to
that key. Console synchronization creates these keys disabled, scopes them, publishes private env
and host configuration, then enables them; failures revoke managed keys. Removed routes stay revoked.
Provider-side configured fallbacks are rejected by catalog compilation. The stream wrapper follows
only the resolved ordered chain on retryable 408/429/5xx failures before output; partial output,
authentication failures, cancellation and unknown failures do not start another route. Native/global
fallbacks must be empty for scoped agents, preventing an emergency provider escape.

Jev is not called on the scoped path. Coding-plan and role/classifier-restricted routes are excluded
until equivalent verified eligibility exists; no new spending is authorized. The authenticated
administrative console displays allowed routes and resolved agent/platform/channel preferences.
Scoped policy editing currently uses the existing administrator settings API/private configuration;
the console projection is read-only. Existing policy saves preserve it.

### Example configuration shape (synthetic IDs; not a deployable profile)

```json
{
  "scopedPolicies": {
    "nori-community": {
      "allowedRoutes": ["community-primary", "community-backup"],
      "allowPaidUsage": false,
      "default": {"primary": "community-primary", "fallbacks": ["community-backup"]},
      "platforms": {"discord": {"primary": "community-primary"}},
      "origins": [{"platform": "discord", "accountId": "default", "workspaceId": "GUILD_ID", "channelIds": ["CHANNEL_ID"]}],
      "channels": [{"platform": "discord", "accountId": "default", "workspaceId": "GUILD_ID", "channelId": "CHANNEL_ID", "fallbacks": []}],
      "maxOutputTokens": 2048,
      "requestTimeoutMs": 60000,
      "usageLimits": {"perUserPerMinute": 6, "perConversationPerMinute": 12,
        "perUserConcurrent": 1, "perConversationConcurrent": 2, "maxConcurrent": 4,
        "maxGatewayRequestsPerDay": 1000}
    }
  }
}
```

Each referenced route must already be an exact configured, billing-verified route with its own
`gatewayKeyEnvVar`. Never place key values in this record. Console-backed routes use generated env
locators and private `runtime/magpie/gateway.env`. Direct configurations need equivalent singleton
keys provisioned by their authorized operator. Per-agent hard limits do not make shared filesystem,
sessions or memory safe by themselves.

### Runtime change disposition

Neither slice 1 nor slice 2 enables scoped policies in production or migrates sessions. Purpose:
ship compatible opt-in primitives while the native ownership gate is unresolved. Impact: application
code and the authenticated console gain configuration support; existing callers, agents, provider
choices, workspaces and transport topology remain as configured. Expected behavior after webhook
deployment is the previous live behavior. Rollback is the preceding application release, with no
history merge or state conversion. No global M0 acceptance tag is appropriate yet.

### Slice 2 validation (OCI, November 7, 2026 Pacific)

- Targeted scoped/legacy routing checks: 38 passed; console/environment checks: 40 passed.
- Complete Node suite: 1,267 passed, 2 existing conditional skips, zero failures. Scaffold passed.
- `scripts/verify-scoped-routing.mjs <pinned-magpie-source>` passed in the isolated OCI validation
  checkout with actual OpenClaw and Magpie `95e7c6bcc07629897f6703c31eaef477fcee4a13`.
  Synthetic Slack/main and Discord/nori-community ingress exercised authenticated model hooks,
  platform and channel precedence, a 503 fallback in the prescribed order, empty fallback failure,
  no hidden paid upstream calls, maximum output tokens, and operation without Jev.
- The probe uses fake upstream providers and isolated temporary state; it neither logs into Slack/
  Discord nor accesses live backend data. This is not live platform or isolation acceptance.

## Slice 3 feasibility checkpoint

The OCI native ownership probe reproduces distinct DM routing but shared same-room/same-thread keys
for two senders. It also proves that an empty per-agent memory extraPaths list still inherits global
internal paths. See [the concrete upstream contract and migration plan](m0-native-boundary-proposal.md).
No native transport replacement, source patch, memory feature removal or live shared-Gateway cutover
is adopted. The proposal describes the missing early history and owner-aware memory interfaces,
existing Magpie limit primitives, remaining admission scope and exact acceptance gates.

## Delivered source checkpoints

| Slice | Merged PR / revision | Progress tag | OCI automatic deployment |
| --- | --- | --- | --- |
| Backend caller/tool boundary | #49 / `9fa48abb01f7005b250be728dcb9593f781c8089` | `m0-s1-backend-boundary` | Healthy, November 7, 2026 22:28 Pacific |
| Scoped Magpie policy | #50 / `2073016d07c112067fdd00a04d7c77dbdf0b95e1` | `m0-s2-provider-policy` | Healthy, November 7, 2026 23:01 Pacific |

Both source PRs passed GitHub checks and used the existing merge webhook. Router, web, Slack and
Discord services were active after deployment. These tags mark delivered opt-in source slices,
not completed M0 runtime isolation. No live runtime policies, workspaces or historical ownership
were migrated. The native feasibility proposal remains a draft in PR #51, retargeted from the
provider branch to main after #50 merged.

## Slice 3a: durable public request admission

Scoped Discord policies now require all six `usageLimits` fields shown above. Slack policies may
opt in. This tightens the newly introduced scoped configuration only; production still uses the
legacy unscoped path. Values in the example are illustrative, not an approved production budget.

Admission uses trusted ingress agent/platform/bot-account/workspace/sender/conversation identity.
Sender rates span rooms within the same enrolled workspace; conversation rates include every sender.
A private SQLite ledger under `<native-state-dir>/rein-router-usage/admission.sqlite` atomically
reserves rolling 60-second requests and concurrent runs across independently prepared runtimes and
processes using that same state directory. Separate state directories do not share a budget.
The directory is owner-only and the database is mode 0600. Only hashed scope/run identifiers, process
IDs, timestamps and counters are stored; there is no message, credential or personal profile storage.
Hashes are pseudonymous accounting identifiers, not an anonymization guarantee.

`maxGatewayRequestsPerDay` is a per-agent UTC-day aggregate across approved routes. Each outbound
model request, including an explicit fallback and later tool/model iteration, reserves budget before
transport. A failed request is not refunded. Magpie's internal retries are not separate gateway
requests; this limit is neither a token nor a currency budget. Native Magpie token/cost accounting
and provider concurrency/rate settings remain necessary and unchanged.

Native outer `executionSettled` lifecycle events release concurrency. Per-attempt end events and
elapsed wall time do not: a tool may still be running. After a process dies, the next admission can
reclaim its slots without refunding requests. A live or reused PID remains conservatively reserved.
Reopening the database preserves rate/daily counters. A backward wall clock, untrusted file mode or
unavailable database blocks new scoped work. Finished runs and counters age out after two days;
a 100,000-run safety ceiling blocks admission instead of allowing unbounded database growth.

Disabling the plugin restores the existing unscoped behavior and retains its ledger. Re-enabling
within the same process can conservatively retain a slot if settlement happened while disabled;
a full Gateway restart proves the old process dead and permits reclamation. Do not delete the ledger
to clear a limit, and preserve the native state directory in deployment/rollback. This slice does not
change production runtime configuration, migrate workspaces, or accept M0 isolation.

### Runtime deadline remains an upstream gate

An OCI probe on November 7, 2026 Pacific used the actual pinned OpenClaw runtime and a synthetic
15-second cancellable tool. Calling `api.runtime.gateway.request('sessions.abort', ...)` at a
one-second deadline was rejected because `rein-router` is neither a bundled nor trusted official
plugin. The tool completed after 15 seconds with its abort signal unset. A successful method lookup
or timer is therefore insufficient evidence of cancellation. The attempted implementation was removed.

A narrow upstream extension is required: let `before_agent_run` return a shorter host-enforced
run deadline (never a longer one), bound to the exact run/agent/session and inherited through provider
fallback. The host must abort active model and tool signals, preserve native cancellation semantics,
retain concurrency until execution settles, and never stop a successor or clear unrelated queued work.
Test reload, retired plugin instances, concurrent sessions, uncooperative tools and settled-run races.
Do not grant the plugin general operator RPC authority or lower the main agent's global timeout to
simulate a per-agent deadline. The existing per-model request timeout continues to apply; it is not a
whole-run/tool timeout. This gate supplements the history/memory extension proposal in draft PR #51.

### Slice 3a validation (OCI, November 7, 2026 Pacific)

- 18 targeted ledger/router tests pass, including six live processes racing for one sender slot,
  persistence, dead-process recovery, policy validation and budget denial before fallback transport.
- Actual pinned OpenClaw + Magpie probe passes: sequential native settlement frees concurrency;
  a one-request budget admits the first turn and blocks the second before any provider request.
- Full regression initially found one old console fixture without the newly required Discord limits;
  its configuration was updated, including an assertion that the administrative projection retains limits.
  The final full run passed 1,277 tests with two existing skips; scaffold and all 25 console tests pass.
- Cancellation probe failed as described above; no per-run cancellation capability is claimed.
