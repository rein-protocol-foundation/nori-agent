# Native task continuation

Tracking: SA-M2-01–06 / [#58](https://github.com/rein-protocol-foundation/nori-agent/issues/58).
Updated 2026-11-13, America/Los_Angeles. Owner: Codex orchestrator / runtime-verified
GPT-6.1 Sol High implementation worker. **CORE IMPLEMENTED / STATIC CHECKS ONLY**.
Product acceptance remains open; SA-M2-06 selected retention/deletion remains unsupported.

## Opt-in native implementation

`plugins/rein-acp/continuation.mjs` adds a thin controller alongside M1. Enable
`taskLoop: true` and `continuation.enabled: true`; add `rein_continuation` to the parent's
existing tool policy. The [example](../config/slack-task-loop.example.json) leaves continuation
disabled. Turning it off preserves the existing M1 task-loop implementation; it does not cancel
accepted native work or delete native state. Re-enable to discover retained flows. Do not disable
it while relying on automatic continuation or stop-intent reconciliation.

No native channel, owner session, tool policy, memory or execution engine is replaced. State lives
only in public `tasks.async.managedFlows.stateJson`; native Task/Flow storage, session inventory,
system events/targeted `background-task` wakes and `sessions_spawn` remain authoritative. The
upstream keyed-store trust gate is neither used nor bypassed. No vendor changes, DBOS, scheduler,
separate history store, synthetic owner inventory or replacement sessions are introduced.

`rein_continuation` provides:

- `begin`: current trusted human intake records full goal/criteria, source session UUID and native
  audience, runtime, scope revision and immutable attempt/deadline/no-progress limits. Defaults are
  four attempts, two reviews without progress, one hour, and sixteen concurrent flows per owner;
  operators can configure bounded values for new flows. Existing flow limits never reset.
- `delegate`: prepares an exact scope-labelled assignment. The canonical native spawn hook records
  launch custody before admission; accepted receipts retain actual run/session IDs. Native `runTask`
  associates available canonical backing without replacing its identity. A missing receipt/backing
  blocks retries; it never fabricates a run or infers a failed launch from an observation gap.
- `status`: reads native evidence and reconciles runs, stop/change intent and deadlines. Native
  cancellation plus terminal `waitForRun` evidence is required before replacement readiness.
- `review`: compares current-scope criteria with actual settled terminal evidence. A semantic model
  review records result/gaps/effect certainty. Complete requires succeeded native backing, no gaps
  and known effects; continue permits a bounded supplement for concrete gaps. Uncertain effects or
  exhausted limits produce a partial handoff rather than another launch. No-progress evidence uses
  native summary fingerprints as well as the reviewer's explicit progress assessment.
- `stop` / `change`: persist stop intent before cancellation. Change advances scope immediately,
  retires unlaunched old assignments and preserves all counters/deadline. Old attempt evidence stays
  associated with its old revision; a previous report cannot become success for the revised goal.

The existing M1 ACP gate still enforces the fixed harness/cwd and one-shot arguments. Managed
run controls cannot bypass durable intent through raw stop/steer; controls for identifiable unmanaged
M1 runs remain available. Native children retain their inherited tool surface.

## Recovery, audience and delivery

Production discovery uses `agent.session.listSessionEntries({agentId, readOnly:true})`, whose
public rows contain `{sessionKey, entry}`. Only this controller's native managed flows with the
configured account/channel audience and matching saved source session UUID are visible. Current
human controls recheck the current member; senderless background work rechecks the saved source's
current trusted membership without adding a fictional sender to the native wake. Changed session
UUIDs, missing native backing and unavailable authority fail closed. Business-tool authority is
still checked by its own backend boundary.

Startup shares source-authority lookups only inside that hook, groups one native hint/wake per
owner and reads no transcript/history. Admission similarly prepares the complete authorized flow
inventory with parallel per-source checks; it does not wait for cancellation inside the admission
hook. The model must call current `status` to reconcile before review/work. Durable flow inventory
is the source of pending task results when host events coalesce or hints disappear. There is no
per-flow serialized wake queue.

The user accepts a combined reply within the same native owner/audience. Every pending flow must
remain represented with its identity, scope, result and gaps; thread is a preferred reply route,
not a separate owner boundary. The adapter does not claim each original thread received the
combined answer. It never marks a report delivered from `agent_end`. Completed, stopped and limited
reports remain `pending_or_uncertain` and are included in restart recovery while native retention
keeps them. This offers at-least-once replay and can repeat reports; exactly-once parent delivery
is not established by the public evidence available here.

## Remaining native limitations

- **SA-M2-06 is unsupported:** public managed Flows expose no selected retention or explicit delete
  API, and terminal cleanup is fixed at seven days. No duration was selected and no extended
  retention is simulated by keeping completed flows active. Retrieval after native cleanup is
  unavailable. This requirement is still open; a supported upstream retention/deletion contract is
  needed. Retained summaries/links and user deletion acceptance are not claimed.
- Native launch and flow revision are not one atomic transaction. The canonical pre-launch hook
  rechecks scope/stop after reservation; a stop racing native admission can still admit work before
  the accepted receipt is reconciled and cancelled. A crash before receipt persistence leaves an
  unknown outcome and blocks retry. This is not proof of zero post-stop execution or zero effects.
- Research native `runTimeoutSeconds` is capped by the remaining deadline. ACP's M1 public launch
  surface has no equivalent timeout argument in this adapter; its deadline is enforced when
  native events/status/restart reconciliation occurs, not by a hard wall-clock shutdown timer.
  Native cancellation/settlement uncertainty remains visible. No scheduler was added to hide this.
- Semantic criteria/progress review is model-dependent. Static checks cannot establish successful
  real-model supplementation, cancellation races, restart recovery or real-user delivery. All
  product boxes stay open. Prior synthetic seam evidence below is historical evidence only.

## Verification and handoff — 2026-11-13

Only necessary static checks are authorized for this increment. Node syntax checks for the three
runtime `.mjs` files, repository scaffold checks and `git diff --check` passed. JSON parsing and
TypeScript syntax checking are recorded in the dated handoff indexes when finalized. No tests,
probes, Gateway/model runs, acceptance, production access, publishing, deployment or real sends
were performed for this increment. No tests were added. Existing historical probe/test results
below do not validate the new implementation.

Next: parent static review of this core and explicit review of the unresolved native retention,
launch-atomicity, ACP deadline and delivery-receipt limitations. M3 remains out of scope.

---

# Historical native seam evidence — 2026-11-12

Tracking: SA-M2-01–06 / [#58](https://github.com/rein-protocol-foundation/nori-agent/issues/58).
Date: 2026-11-12, America/Los_Angeles. Owner: Codex orchestrator (runtime-verified Astra
High), with the same runtime-verified Sol High CLI worker for investigation and probes.
**BLOCKED / PRODUCT NOT IMPLEMENTED.** This is a reproducible native integration investigation,
not M2 product acceptance. No task-loop plugin, runtime configuration or workspace skill changed.

## Baseline and scope

The isolated branch is `tempest/m2-native-continuation`. It initially branched from PR #74's
verified head `95f1eac25b328244486108e1971116f9796a6819` while that PR was open. PR #74
subsequently merged independently with all head checks successful. This branch was
fast-forwarded to `1280a7539fca40293fa7c4b1859ac83b26764761`; both commits have identical
file trees. Review this increment against `1280a75`. The M1 runbook is
[slack-task-loop.md](slack-task-loop.md).

OpenClaw stays pinned to `4a11f89e840b2bb3eedcad2820ab25b8520905b6`. Its tracked source is
unchanged. The user authorized local #58 implementation, verification and a reviewable local
commit. No publishing, PR creation, remote merge, deployment, real Slack sends, outreach,
production Cron replay or paid model acceptance occurred. M3 and other tasks were not started.

## What the actual native probe establishes

The [probe](../scripts/probe-task-continuation.mjs) loads the real pinned Gateway, Router,
M1 plugin and native Task/Flow store. Transport, membership responses, model answers and
research are synthetic, with isolated private state and loopback inference.

The single-flow case passed in `nori-continuation-qvD9hI`:

1. Genuine synthetic native Slack ingress creates a managed waiting flow, including the
   captured native owner/reply route and goal, criteria and scope metadata. An unrelated
   conversation moves the session's latest reply route from thread `1000.001` to `1000.999`.
2. The first Gateway stops. A different Gateway process reads the persisted managed flow
   in `gateway_start`, queues a native system event with the saved route, and requests a
   targeted `background-task` / `immediate` wake. Recurring heartbeat remains disabled.
3. The host supplies `trigger=heartbeat`, `inputProvenance.kind=internal_system` and
   `sourceTool=background-task`, without a human sender. Router/M1 admission allows the
   native parent to launch the first child.
4. The first synthetic child omits eligibility. A fresh native `subagent_announce` parent
   turn delegates the supplement without another user request. Its result reaches that
   still-active parent turn. Final output returns to the original thread `1000.001`.
5. `managedFlows.runTask` associates each accepted run with the managed flow. It creates
   an additional native task projection, not a new execution or replacement canonical ID.
   Original task ownership/run identity remains available. Two child launches occur.

This fixture uses an explicitly configured **synthetic owner inventory**. It does not prove
production discovery of arbitrary owner sessions, current user authorization after restart,
M2 cancellation races, durable execution budgets, or correct semantic review by a real model.
The public `api.runtime.agent.session.listSessionEntries({agentId, readOnly:true})` is a
source-confirmed inventory candidate; it still needs origin/controller/audience filtering and
runtime validation. A list of sessions is not permission to disclose their contents.

## Observed blockers

### Local-plugin retained state

The first actual Gateway attempt, `nori-continuation-EMiYB2`, refused fixture registration:
`PluginTrustRefusalError`, code `PLUGIN_TRUST_REFUSED`, method `openKeyedStore`,
`origin=config`, `reason=record-missing`. M1 `rein-acp` passed loader inspection, but the
fixture was excluded before ingress or inference. Later probes catch only that exact refusal
as a negative assertion and use independent public managed-flow APIs; they never open a
replacement keyed store.

The pin allows the native keyed store only for bundled or verified official installations.
Local paths, `--link` and `--force` do not establish official provenance. The selected bounded
active-index/retained-summary design therefore cannot run in the real local Rein plugin.
The public managed-flow API has no delete operation, and its fixed seven-day terminal cleanup
cannot stand in for an explicitly selected product retention policy. No retention duration,
including the formerly proposed 30 days, was chosen. No cleanup timestamp was fabricated.

### Same-session recovery loses per-flow reply routes

The separate coalescence probe, `nori-continuation-VpHq2J`, created two real managed flows
through separate ingresses sharing one native owner session, with captured threads
`1000.001` and `1000.002`. Both persisted recovery events reached one actual native model
input. The scripted combined result was automatically delivered only to `1000.001`; the
second flow had no delivery to its captured `1000.002` thread. The per-flow destination
assertion failed (exit 1), and the complete result is retained in the local evidence.

Native wake targets are grouped by agent/session, and queued event routes reduce to one
turn delivery context. This demonstrates a limitation of the proposed automatic wake/reply
path, not a cross-audience leak in this shared-channel fixture or proof that every conceivable
integration is impossible. It prevents adopting that path as general M2 recovery. No Nori
scheduler, serial wake queue, alternate owner session or custom message-routing workaround
was added. `scheduleSessionTurn` also remains restricted to bundled plugins at this pin.

## Minimal upstream contracts to resolve

- Provide a supported, explicit and revocable operator grant for a reviewed local plugin's
  native keyed state, bound to its installed source and registry generation. Retain plugin
  namespaces, quotas, TTL, reject-new capacity and invocation checks. An equivalent native
  task-summary API with owner-scoped retention/deletion would also satisfy the requirement.
  A plugin's own configuration or text claim must not manufacture official provenance.
- Preserve event correlation and captured reply route through native wake admission:
  partition incompatible route groups into native serialized requester turns without
  consuming another group's events, or expose a host-bound per-event reply capability.
  Keep existing owner/session identities, inherited authority and native queue ownership.

These are proposals, not vendor patches or permission expansion. They need a supported
upstream implementation and a reviewed pin before the selected product design proceeds.
Launch/link atomicity also remains a required implementation test: `runTask` links an
already-admitted run and does not provide a guarded launch transaction. A cancellation
projection alone cannot prove that execution settled or an external action did not occur.

## Feature status and next step

| ID | Current evidence | Still required |
| --- | --- | --- |
| SA-M2-01 | Fresh/active native completion and scripted eligibility supplement proven | Product criteria review, bounded continuation and real-model acceptance |
| SA-M2-02 | Existing M1 change/stop unchanged | Durable scope revisions; old-scope success/cancellation races |
| SA-M2-03 | Single known-owner process restart/wake proven; multi-route recovery blocked | Supported per-flow routing, production owner discovery, authority/outcome reconciliation, unknown-effect fixture with zero blind retries |
| SA-M2-04 | Existing native cancellation/settlement seam retained | Sticky stop intent across restart; pending/failed cancellation and late-result races |
| SA-M2-05 | Native flow state and actual run association proven | Durable attempt/deadline/no-progress limits; partial-results handoff without budget resets |
| SA-M2-06 | Local-plugin store refusal reproduced | Supported retained summary/links, explicit duration, authorization, deletion, expiry and missing-artifact tests |

All product checkboxes remain open. The product parameters are not the reason work stopped;
the actual native storage and delivery contracts failed before a safe general implementation
could be selected. Do not enable an incomplete continuation loop or label probe scaffolding
as implemented task behavior. Next: review these bounded upstream contracts, then resume #58
on a supported native seam. Do not advance M3 or close the milestone from this investigation.

## Reproduction and validation

Prepare the pinned toolchain/source/build as in [setup](setup.md), then run:

```sh
npm run toolchain:pnpm -- run probe:task-continuation -- --case=single
npm run toolchain:pnpm -- run probe:task-continuation -- --case=coalesced
```

The single case is expected to pass its **seam** assertions while explicitly observing the
keyed-store refusal. The coalesced case intentionally retains the unsatisfied destination
acceptance assertion and currently exits 1. It is a diagnostic command, not a passing CI
acceptance gate. Both save `result.json`, loader/Gateway logs, model inputs, native evidence
and two process IDs under the printed disposable directory. Those logs/state are not committed.

Historical attempts remain distinct: `EMiYB2` exposed the trust gate; `4AXLLV` failed due to
synthetic child-input decoding; `6Y0afr` ran the intended sequence but an assertion looked for
system-event text in the pre-run hook instead of actual model input. The corrected decoder
and host-provenance/model-input assertions passed in `qvD9hI`. Two decoder regression tests
cover the observed failure. `VpHq2J` is the genuine coalesced-route failure described above.

The fixed-pin build passed with the existing advisory Mermaid bundle-size warning. Syntax
checks and the decoder tests passed. Final parent verification is recorded in the dated
implementation/acceptance indexes. Full product cancellation/budget/retention tests and real
Slack/research/Codex/production acceptance were not run because product code was not implemented.

### Final parent verification — 2026-11-12

The functionally named `probe:task-continuation` command was rerun after final review:
`nori-continuation-qbahZN` passed single-flow assertions, including different Gateway PIDs
and exactly two observed native child executions with the accepted run IDs. The separate
`nori-continuation-nogxb5` again failed the same coalesced destination assertion (exit 1,
one mismatched flow), now checking account as well as target/thread. The expected failure
is recorded as a blocker, not converted to a successful feature check.

61 targeted tests passed with zero failures/skips: the new decoder, existing Slack task loop,
Director ACP, #66 Cron ingress/model-input, Router development and Foundation admin tests.
Scaffold and diff checks passed. The unchanged full repository suite and standalone ACP/Cron
native probes were not repeated; the new native probe itself exercised the actual loader,
Router/M1 admission and subagent/Flow lifecycle. Synthetic research is not real research.
No M2 product race/budget/retention acceptance was claimed from these regressions.

Native source references (relative to `vendor/openclaw`):
`src/plugins/registry-runtime.ts`, `src/plugins/plugin-trust.ts`,
`src/plugins/official-external-install-trust.ts`, `src/plugins/host-hook-scheduled-turns.ts`,
`src/plugins/runtime/runtime-taskflow.types.ts`, `src/plugins/runtime/runtime-tasks.types.ts`,
`src/plugin-sdk/session-store-runtime.ts`, `src/infra/session-event-wake.ts`,
`src/infra/system-events.ts`, `src/infra/heartbeat-runner-prompt.ts`,
`src/infra/heartbeat-runner-execution.ts`, `src/tasks/task-flow-maintenance-policy.ts`,
`docs/plugins/sdk-runtime/state-and-system.md` and `docs/plugins/sdk-runtime/background-work.md`.
