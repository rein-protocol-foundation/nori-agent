# Native task continuation: seam evidence and blockers

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
