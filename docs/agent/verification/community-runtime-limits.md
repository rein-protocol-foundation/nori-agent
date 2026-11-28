# Community runtime limits: conclusions and acceptance record

Status (2026-11-15): **COMPLETED under the owner-confirmed current scope; #54 closed**.
The owner accepts existing runtime controls and admission/concurrency budgets.
Concurrent Community subagent calls are not required. Strict whole-chain enforcement
below remains unimplemented/unverified and is deferred, not a ticket blocker.
The November 14 investigation and its former blocking recommendation below are
historical; closure does not claim those stronger guarantees or production acceptance.
Owner: Codex. Tracking: #54 / #65, SA-M0-06. Verified locally on November 14, 2026
(America/Los_Angeles), against OpenClaw `4a11f89e840b2bb3eedcad2820ab25b8520905b6`.
Repository base: `87416cc` (includes merged #83 and #84). No production inspection,
provider inference, external send, deployment or upstream modification occurred.

## Supported configuration and its actual scope

| Native surface | Effective scope / limitation |
| --- | --- |
| `agents.defaults.timeoutSeconds` | Ordinary run timeout resolver; default 172800 seconds (48 hours); zero uses the timer-safe unlimited sentinel. No agent-entry counterpart. Reducing it changes internal main too. Explicit per-run overrides exist but native Community ingress does not expose a policy hook to tighten them. |
| `agents.defaults.maxConcurrent` | Global top-level concurrency resolver, not a Community-only cap. Unset default is max(8, available CPU parallelism × 4). Existing Rein admission remains the Community-specific constraint. |
| `agents.defaults.subagents.runTimeoutSeconds` | Child default, zero when unset; `sessions_spawn.runTimeoutSeconds` overrides it. Neither is a deadline for its parent or an immutable upper ceiling on the complete fallback/child chain. |
| `agents.defaults.subagents.maxConcurrent` | Per immediate spawning/controller session, default 8; independent sessions have independent budgets. `maxChildrenPerAgent` defaults to 5; `maxSpawnDepth` defaults to 5. No equivalent agent-entry concurrency/timeout override. |
| `tools.exec.timeoutSeconds` / per-agent `tools.exec.timeoutSeconds` | Exec-specific, default resolver 1800 seconds. Tool arguments and host-specific semantics apply; it does not bound all tools or a whole run. Web/media and provider request timeouts are likewise narrower scopes. |
| `before_agent_run` | Pass/block decision only. No supported deadline reduction or current-run cancellation handle. A custom result property would not create enforcement. |
| `runtime.subagent.complete` | Fresh tool-free background inference with `timeoutMs` and `signal`; not control over the admitted parent and its tools. |
| `runtime.subagent.run` / `waitForRun` | Run params have no timeout field; wait timeout bounds observation, not execution. Replacing native ingress with new child runs would change behavior and is not an acceptable adapter here. |
| `runtime.gateway.request` | Pinned dispatcher checks bundled/trusted official plugin identity. Rein cannot use this as an operator cancellation escape hatch. The historical real Gateway refusal remains evidence; it was not replayed in this task. |

Source references within `vendor/openclaw`: `src/config/zod-schema.agents.ts`,
`zod-schema.agent-entry-base.ts`, `zod-schema.agent-defaults-base.ts`, `agent-limits.ts`;
`src/agents/timeout.ts`, `exec-tool-timeout.ts`,
`subagents/spawn/subagent-spawn-plan.ts`; `src/plugins/hook-types.ts`,
`runtime/types.ts`; `src/gateway/server-plugins.ts`, `server-plugin-subagent-runtime.ts`.

The attempt execution timer in
`src/agents/embedded-agent-runner/run/attempt-timeout-prepare.ts` pauses for approval
and can extend once for compaction. It is not an unconditional wall-clock bound.
The fallback path (`src/auto-reply/reply/agent-runner-run-params.ts`) carries the
configured duration into candidate execution. This review does **not** establish
one shared deadline across every fallback, retry, compaction and child; that remains
an explicit integration acceptance requirement, not an inferred guarantee.

## Historical local verification

The November 14 investigation used temporary local diagnostics against the pinned
native implementations. PR #92 retains their findings as historical evidence;
the diagnostic scripts and their run instructions were removed on November 16
at the owner's request. This documentation does not ship an executable diagnostic
or a new production control.

The investigation observed:

1. Global configuration is accepted, but Community-only `timeoutSeconds`,
   `maxConcurrent`, and subagent timeout/concurrency keys are rejected specifically
   as unrecognized Community keys by the real schema.
2. The real native attempt timer aborts two synthetic cooperative signal consumers,
   and both promises actually settle. These consumers stand in for model/tool work;
   this is **not** a real provider or registered-tool cancellation test.
3. Cancelling before deadline, starting already cancelled, and disposing a completed
   timer leave its successor unaffected. This is timer ownership evidence only,
   not Gateway reload/restart acceptance.
4. With native lane concurrency 1 and `taskTimeoutMs: 40`, a held, uncooperative
   task remains unresolved while its successor begins. Only an explicit fixture
   release lets the first task finish. Observed order: first start → successor
   start → caller timeout → first actual settlement. Assertions depend on the held
   promise, not an assumed delay. Thus a native lane timeout cannot stand in for
   physical execution settlement or the required Community concurrency guarantee.
5. Without a lane timeout, the native baseline retains its slot until actual settlement.

The historical queue experiment isolated `src/process/command-queue.ts`; it does not claim
that a deployed Community admission lease was released. The embedded runner wires
queue deadlines and abort/release signals through `run/lane-controller.ts`, with a
30-second abort grace in `run/lane-runtime.ts`. This identifies a boundary requiring
end-to-end verification, rather than proving all native cancellation paths unsafe.

Existing Rein tests separately verify durable sender/conversation/agent admission,
reopening/reload, proven-dead-process recovery, foreign settlement refusal,
six-process contention, fallback daily request charging and cancellation handling.
They pass synthetic lifecycle evidence; they do not independently prove that the
host emits `executionSettled` only after every uncooperative tool has ended.
No existing request admission or daily budget code was changed.

## Deferred host extension proposal (not required for current scope)

Extend the existing admitted-run policy result with an optional **tightening-only**
execution budget, keyed by the host's immutable logical run identity and generation.
The name is proposed, not an existing API. The host computes the earliest deadline
at admission; a plugin cannot extend it, pick another run, change capabilities, or
obtain generic operator RPC rights. Agent-specific native configuration exposing the
same contract would also be sufficient if it covers these semantics.

The host must carry that one deadline and cancellation signal through provider
requests, approved fallback/retries, cooperative tools and attributable child work.
It must define approval/compaction behavior explicitly rather than silently granting
a new budget. Admission and actual execution leases must be distinct from a client
wait timeout: cancellation requests may return pending, but uncooperative work holds
its Community slot until actual settlement. Arbitrary in-process code cannot be
forcibly stopped by AbortSignal; do not report success until it settles. Host-managed
process isolation would be required for a stronger forced-termination guarantee.

Reload preserves admitted deadlines and owner identities even when a plugin registry
is replaced. Restart recovery reconciles surviving external work before releasing its
lease; dead-process detection alone does not establish that remote work stopped.
Old timers cannot abort successors or clear unrelated queues. Policy-disabled and
internal main runs retain their current capabilities and timeout behavior.

This narrows the earlier [boundary proposal](../requirements/m0-native-boundary-proposal.md): no new
scheduler, channel replacement, official-plugin impersonation, vendor patch, or
privilege expansion. No public SDK adapter currently identified can provide the
missing parent-run control for the stronger guarantees investigated here. The owner
subsequently deferred those guarantees and closed #54; this proposal is not a
current Community cutover prerequisite. No upstream issue was filed.

## Verification and remaining acceptance

Historical local diagnostic: passed. Existing admission/routing regressions: 20 passed,
0 failed, 0 skipped. Initial diagnostic attempts failed because source workspace
aliases were missing from the isolated process, then because the synthetic multi-agent
roster omitted `ownership: explicit`; those fixture setup errors and a missing
brace in the added timer-cleanup case were corrected. The final diagnostic and
scaffold checks passed; full repository/production suites were not run for this
original local investigation. The documentation-only revision does not rerun
those experiments or claim new runtime acceptance.

Pending: real model stream and registered cooperative-tool settlement at one scoped
deadline, fallback and child propagation, uncooperative-tool lease retention through
actual host lifecycle, simultaneous cancellation/deadline races, full Gateway reload
and restart recovery, main enabled/disabled compatibility and authorized production
acceptance. No real cancellation success or product milestone completion is claimed.
Current next step: configure the persistent Community agent using existing controls
and verify its effective configuration during the separately authorized rollout.
No new runtime implementation is needed
for the accepted scope. A separate agent in a shared Gateway does not create an
agent-specific ordinary timeout setting: global defaults remain shared. Revisit
the proposed host extension only if stronger guarantees become a requirement.
