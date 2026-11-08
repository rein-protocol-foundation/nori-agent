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
