# SA-OPS-01 / #66: native execution-authority blocker

- Date: **2026-11-10, America/Los_Angeles**. Owner: **Codex**.
- Status: **BLOCKED — no product acceptance**. The bounded evidence/probe work is reviewable;
  the runtime fix is not implemented. Neither M0 nor M1 is complete.
- Repository base: `ac8d7662` (`ac8d766`); native pin:
  `4a11f89e840b2bb3eedcad2820ab25b8520905b6` (`4a11f89`).
- Local ancestry confirms [#61](https://github.com/rein-protocol-foundation/nori-agent/pull/61)
  and [#69](https://github.com/rein-protocol-foundation/nori-agent/pull/69) are merged.
  Earlier documents saying #61 was open describe historical checkpoints.
- Requirement: [PRD v0.6 §2.2.1 / §2.3 / M1](super-agent-nori-prd-en.md),
  [SA-OPS-01](super-agent-feature-checklist.md#可信-slack-与系统-cron),
  [Issue #66](https://github.com/rein-protocol-foundation/nori-agent/issues/66).

## Decision

The pinned host has real, private admission, Cron occurrence, creator-grant and child-parent
mechanisms. Ordinary plugin hooks do not expose a verifiable view binding the current execution
to those mechanisms, its capability ceiling and authorized delivery scope. A stored job, public
query, `jobId`, `trigger=cron/system`, input-provenance label or session-key prefix cannot replace
the missing current-occurrence/parent proof. No label-based runtime bypass is authorized.

The existing failure is the human-only Rein gate, not `owner_agent_id=null`. The historical job
`skill-collection-review-nori-development` already has executor `nori-development`; this round
did not inspect or replay it. See the dated historical diagnosis in the feature checklist.

## Source evidence at the pinned revision

These are implementation reads, not lifecycle test results. Native paths below are relative to
`vendor/openclaw/src/`; links identify the exact source lines inspected.

| Boundary | What the implementation establishes | Remaining limit |
| --- | --- | --- |
| Creation / captured authority | [gateway/cron-creator-authority-grant.ts:134](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/gateway/cron-creator-authority-grant.ts#L134) mints random tokens into a private Map; [:206](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/gateway/cron-creator-authority-grant.ts#L206) checks the same live run, expiry/revocation/currentness. [gateway/server-methods/cron-caller-scope.ts:35](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/gateway/server-methods/cron-caller-scope.ts#L35) requires final executable-surface provenance before consuming runtime capture. | A creator grant proves its admitted capture, not a general future Provider/destination entitlement. It is unavailable to ordinary hooks. |
| Executor / creation / enable | [cron/service/ops-mutations.ts:214](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L214) resolves and checks the creation executor; [:425](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L425) checks explicit agent changes; [:449](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L449) reconciles captured authority. | An enable-only edit does not enter that explicit-agent-change check. Executor validity at enable/run and the intended trusted creation path still need native behavioral verification. |
| Actual execution identity | [cron/isolated-agent/run-admission.ts:60](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/run-admission.ts#L60) prepares host admission with the resolved agent and schedule ingress; [:82](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/run-admission.ts#L82) captures occurrence-bound message authority. [run-executor.ts:458](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/run-executor.ts#L458) passes the prepared admission and native Cron facts to the runner. | Those private objects are not an ordinary plugin execution-authority API. Never impersonate the audit creator as the execution or business principal. |
| Disable / revoke / remove | [cron/service/ops-mutations.ts:150](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L150) updates authority with the durable edit; [:177](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L177) requests cancellation after disable; [:546](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L546) persists removal then retires the active marker. [cron/active-jobs.ts:36](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/active-jobs.ts#L36) binds message authority to the exact admitted operational instance and checks cancellation/removal. | These are the existing lifecycle owners to reuse. Cancellation completion, races and stale-occurrence rejection have not been exercised by this probe. |
| Live receipt / restart | [cron/service/run-receipts.ts:85](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/run-receipts.ts#L85) compares permission snapshots against the current receipt-owned job, including enabled state. [cron/service/ops-lifecycle.ts:188](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-lifecycle.ts#L188) loads persisted jobs and reconciles queued/running recovery proposals. | Source evidence does not establish restart acceptance for this job or configuration. Do not add a parallel schedule or grant ledger. |
| Model / Provider | [cron/isolated-agent/model-selection.ts:249](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/model-selection.ts#L249) considers native agent/subagent configuration; [:298](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/model-selection.ts#L298) rejects disallowed job model overrides; [:324](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/model-selection.ts#L324) can apply a stored session override. [run-executor.ts:424](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/run-executor.ts#L424) checks runtime-authority compatibility per fallback candidate. | A runtime/creator grant is not proof of Rein eligible routes or Magpie quota. Verify effective agent default/job override and inherited session/subagent settings; Slack dynamic selection must not silently replace Cron's fixed effective model. |
| Destination / message authority | [cron/isolated-agent/delivery-target.ts:142](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/delivery-target.ts#L142) resolves delivery configuration. [agents/scheduled-tool-policy.ts:21](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/scheduled-tool-policy.ts#L21) separates caller authority from delivery; [agents/tools/message-tool-turn-authority.ts:50](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/tools/message-tool-turn-authority.ts#L50) redeems current scheduled authority with account/channel scope. | **Announce destination is different from message-tool permission.** A configured output route does not prove an exact destination ceiling for every tool action. Preserve native messaging/cross-context restrictions and verify the requested audience explicitly. |
| Child ceiling / parent | [agents/subagents/spawn/subagent-spawn-session-patch.ts:125](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/spawn/subagent-spawn-session-patch.ts#L125) commits parent lineage and inherited allow/deny. [agents/agent-tools.policy.ts:119](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/agent-tools.policy.ts#L119) rebuilds inherited policy from stored capability state. [subagent-spawn-gateway.ts:109](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/spawn/subagent-spawn-gateway.ts#L109) uses active delegated authority for dispatch. | [execution-identity-spawn-context.ts:3](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/spawn/execution-identity-spawn-context.ts#L3) carries the exact parent token in a private WeakMap. Parent identity and tool inheritance are distinct; neither alone proves Provider or destination authorization to a plugin. |
| Memory maintenance | [auto-reply/reply/agent-runner-memory.ts:1432](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/auto-reply/reply/agent-runner-memory.ts#L1432) prepares maintenance from source admission/session; [:1461](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/auto-reply/reply/agent-runner-memory.ts#L1461) prepares system admission; [:1627](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/auto-reply/reply/agent-runner-memory.ts#L1627) retains source sandbox policy and uses a memory trigger. | No public hook proof of the maintenance/source-admission binding. Preserve automatic memory; do not invent a live sender or disable maintenance. |
| Actual hook projection | [agents/embedded-agent-runner/run/attempt-prompt-build.ts:144](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/embedded-agent-runner/run/attempt-prompt-build.ts#L144) builds the actual context; [attempt-before-agent-run.ts:94](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/embedded-agent-runner/run/attempt-before-agent-run.ts#L94) passes it to the gate. [agents/harness/hook-context.ts:22](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/harness/hook-context.ts#L22) projects sparse runtime facts for native harness hooks. | No occurrence/parent authority handle. [plugins/hooks.ts:1008](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/plugins/hooks.ts#L1008) offers a temporary post-policy tool-authority view only for prompt enrichment; it checks active tool names, not origin/Provider/destination, and expires at :1067. |
| Public storage/query | [cron/public-job.ts:4](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/public-job.ts#L4) removes private creator/tool/runtime proof and receipt fields. [plugin-sdk/cron-store-runtime.ts:4](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/plugin-sdk/cron-store-runtime.ts#L4) exports store access. | Reading persisted provenance does not establish that the hook belongs to that exact active occurrence or that its authority remains current. |
| ACP | [agents/tools/sessions-spawn-tool.ts:525](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/tools/sessions-spawn-tool.ts#L525) rejects inherited restrictions unsupported by ACP. Existing Rein [runtime.mjs:60](../plugins/rein-acp/runtime.mjs#L60) admits report turns while [:76](../plugins/rein-acp/runtime.mjs#L76) gives non-human turns no tools. | Report admission is not a reusable background execution grant. Preserve delegate/status/result and client-native login; new task/change/stop and background-authority compatibility remain unaccepted. |

Rein's concrete mismatch is [slack-development.mjs:6](../plugins/rein-router/slack-development.mjs#L6)
(live sender/user trigger), [:62](../plugins/rein-router/slack-development.mjs#L62) (Foundation role),
[runtime.mjs:331](../plugins/rein-router/runtime.mjs#L331) (model gate) and
[:364](../plugins/rein-router/runtime.mjs#L364) (tool recheck). Scoped routing also assumes direct
users at [scoped-policy.mjs:86](../plugins/rein-router/scoped-policy.mjs#L86), and
[usage-limits.mjs:14](../plugins/rein-router/usage-limits.mjs#L14) requires sender/chat identity.
Ordinary trusted Slack must eventually lose the unrelated Contributor/Director gate; business
privileges and exact-action approvals remain. This evidence change does not alter any gate.

## Minimal proposed upstream contract

Propose a **read-only, host-owned execution-authority view with `assertCurrent()`**, available
before model execution and at affected tool boundaries. This is a proposal, not an existing API:

1. Bind the view to the actual admitted operational instance, executor and native source owner:
   Cron occurrence/job revision, child parent admission, or memory source admission as appropriate.
2. Expose normalized, restrict-only facts sufficient to check the effective capability ceiling,
   configured Provider eligibility and authorized delivery scope. Keep audit creator, executor and
   any business-action principal separate. Missing legacy facts remain unknown and fail closed.
3. Reuse existing admission/receipt/revision/parent owners to make `assertCurrent()` fail on
   retirement, disable, removal/revocation or incompatible mutation. Copied labels, reused run IDs
   and unrelated contexts must not redeem it. Do not expose bearer tokens or credentials.
4. Keep native scheduling, selection/fallback, message capabilities, inherited tool policy and
   Magpie limit enforcement in place. Model/destination configuration remains in the native
   Dashboard; this proposal creates no replacement scheduler, model picker or permission ledger.

The eventual thin Rein adapter can check this contract and its existing route policy without
requiring a live human for ordinary background work. It must not fabricate identity, widen public
input permissions, bypass business authority, or reinterpret an announce route as tool authority.
Next step: user review of this blocker and minimal contract proposal. Continue within #66 only
after explicit user confirmation, through an upstream proposal or proof of a sufficient public
seam. No runtime unblock implementation or other Issue starts now.

## Safe reproduction and verification

Run from the repository root with the prepared local toolchain:

```sh
export PATH="$PWD/.toolchain/node_modules/.bin:$PATH"
node scripts/probe-sa-ops-authority.mjs
node scripts/check.mjs
git diff --check
```

[Probe runner](../scripts/probe-sa-ops-authority.mjs) uses the pinned native tsx loader to execute
the [test-only fixture](../tests/fixtures/sa-ops-authority.ts). Its private-helper imports are
restricted to this fixture; no production plugin imports an internal native API. It executes the
actual embedded/harness context projection and actual Rein model/tool gates, with in-memory
synthetic Slack/Foundation responses, no gateway and no provider/model calls. It reads no runtime
configuration or real credential; the fake bot token is fixture data. The runner inherits only
PATH and creates a private temporary HOME, OPENCLAW_STATE_DIR, nonexistent OPENCLAW_CONFIG_PATH
and TMPDIR, removed in finally. Native imports therefore cannot fall back to the real user state.
All simulated membership, role and routing facts are supplied by the fixture.

Observed on 2026-11-10: **9/9 synthetic cases passed**. The trusted Slack positive control passes
both gates. The same member with only Foundation authorization changed to false is blocked,
confirming that the redundant business-role gate remains. Senderless embedded Cron, harness Cron,
memory and native child-announcement projections are blocked at both gates. Forged system,
internal-system provenance, and user/external-user labels without a sender do not grant access.
This is successful **defect reproduction**, not a fix or acceptance result.

The child case uses the actual queued child-result shape from
[subagent-announce-delivery.ts:218](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/announce/subagent-announce-delivery.ts#L218):
`inter_session`, `sourceChannel=internal`, `sourceTool=subagent_announce`, with the actual
non-heartbeat `trigger=user` from
[agent-runner-embedded-candidate.ts:130](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/auto-reply/reply/agent-runner-embedded-candidate.ts#L130).
It tests the projection/gate boundary of a child-result turn, not a real child launch or inherited
capability acceptance. No invented `trigger=subagent` is used.

| Check with Node 24.16.0 / pnpm 12.4.2 available on explicit PATH | Actual result and scope |
| --- | --- |
| Revised `node scripts/probe-sa-ops-authority.mjs` | 9/9 cases passed; senderless and redundant-role defects reproduced; forged labels blocked; isolated disposable user state. |
| Earlier targeted Router development/scoped/ACP unit suite | 26 passed, 0 failed/skipped; not rerun for this evidence-only revision. Included in the complete suite below, not additive. |
| Pinned native build (existing regression baseline, log checked) | Passed; final phase timings total **4m 56s**. No runtime changes for #66. |
| Complete Node suite (existing regression baseline, log checked) | **1289 tests, 1287 passed, 0 failed, 2 existing conditional skips**: native managed Magpie two-model-call test and native Magpie UI launcher test. Not rerun for this revision. |
| `verify:plugin` (existing regression baseline, logs/result checked) | Real loader passed three modes: simulation tools, configured backend tools, scoped backend profiles; exit 0. |
| `verify:director-acp` (existing regression baseline, logs/result checked) | Native Slack ingress + fresh Director authorization + ACP child admission/running status/progress/final local synthetic end-to-end passed; exit 0. No live Slack/member/external model. |
| Revised `node scripts/check.mjs` | `Scaffold OK`: required files, unapproved example policy, source hashes, plugin tool contracts, AC01–AC20; no production integration tested. |
| Revised Markdown/source-link check | 69 local Markdown targets and 38 immutable upstream source links verified against the local pinned checkout, including line bounds; no HTTP requests or general heading-anchor validation. |
| Revised `git diff --check` | Passed, no whitespace errors. |

Build/suite/loader/ACP results were verified from existing `openclaw-build.log`, `node-tests.log`,
`native-checks.result.json`, `plugin-loader.log` and `acp-native.log`; private log paths and full
contents are not published. These are **regression evidence with unchanged runtime**, including
existing **Director-authorized ACP**, not #66 ordinary trusted Slack without a role requirement,
a new Cron authority contract or M0/M1 product acceptance. Initial missing-SDK Router/scoped
attempts were environment failures, superseded by the passing regression checks.

Still unverified: complete Cron creation/enable/run/recovery and durable grant/receipt lifecycle;
restart/concurrency/cancellation races; actual native child and memory follow-up compatibility;
new #66 background-authority/ordinary-Slack ACP behavior and change/stop acceptance; exact
message-tool destination enforcement and Magpie quota exhaustion for this path; production and
real Slack/user acceptance. The revised probe itself runs no scheduler, model or live transport.
The completed native build and existing Director ACP end-to-end are verified baseline checks,
not pending work.

Required native follow-up fixtures after the contract is available: controlled creation/enable
with explicit executor; senderless scheduled execution; restart retaining executor/ceiling;
disable/remove/revoke and stale-occurrence rejection; forged provenance/parent and public-origin
escalation denial; bounded child/memory source continuity; Provider/fallback/quota limits;
announce versus message-tool destination substitution; and new #66 ACP authority/change/stop compatibility while preserving the already passing
Director delegate/status/result baseline. These #66 follow-up criteria remain pending. SA-OPS-01/#66 stays **BLOCKED / no acceptance**.
