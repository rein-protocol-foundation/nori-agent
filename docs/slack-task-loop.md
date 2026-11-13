# Native Slack task loop

Tracking: SA-M1-01–05 / #60.

Date: 2026-11-12, America/Los_Angeles. Owner: Codex orchestrator; implementation by the
same verified Sol High CLI worker, with parent final review. Native pin:
`4a11f89e840b2bb3eedcad2820ab25b8520905b6`. Status: **IMPLEMENTED / LOCAL VERIFIED;
real Slack, research and production Codex acceptance pending**.
M0, M2, M3 and historical governance acceptance are unchanged. This task used isolated
HOME/state, synthetic transport/model/backend data and local dependency preparation only.
The initial local-only handoff made no live account access, external sends, outreach, vendor source
edits or deployment. The user subsequently authorized publishing this branch and opening PR #74.

## Functional naming follow-up — 2026-11-12

Owner: same verified Sol High worker; parent owns final review/commit. Renamed the example,
runbook, verification script and test fixtures by function; the public verification command is
`verify:slack-task-loop`. Decoder export is `selectTaskLoopModelInput`; synthetic markers/env
use `TASK_LOOP_`, fixture IDs use `task-loop-`. Both tag recognizers match the full prefix.
Root AGENTS.md records the function-based naming rule. PRD IDs and dated `nori-m1-*`
evidence paths remain unchanged. This is a naming/reference change, with no milestone advancement.

Owner: Codex orchestrator and verified Sol High worker. **IMPLEMENTED / LOCAL VERIFIED**.
Six task-loop files, decoder symbols, fixture IDs/markers/env, imports, links and the
`verify:slack-task-loop` command now use functional names. AGENTS.md records the naming rule.
PRD SA-M1-01–05 and historical evidence paths remain for traceability; no milestone advancement.
The first renamed native run (`nori-task-loop-8Q0JNO`) failed because an explicitly skipped
pre-execution tool call counted as completed in the synthetic model. The fixture now excludes
only that exact skip marker, while counting errors with uncertain effects to prevent blind retry.
Production task-control logic is unchanged. Final checks: 20 targeted tests, scaffold/diff checks,
and actual renamed native loader/Gateway run `nori-task-loop-5tplBg` passed. Earlier failed
evidence remains retained. No vendor edits, live operations or deployment. Next: review this
naming follow-up; real Slack acceptance remains separate. 


## Minimal integration and scope

Configuration and a channel-independent [task skill](../workspace/skills/nori-task-loop/SKILL.md)
supply the native intake/research/coding workflow. The remaining control-boundary gaps require a small additive
mode in the existing `rein-acp` package: current private-channel membership on task/session reads
and controls, fixed bounded ACP arguments, and a machine check that cancelled execution has actually settled before user-directed
replacement. No new plugin, task engine, scheduler, persistence layer or history store is added.

The optional `taskLoop: true` branch registers `rein_task` status/stop/change. Native
`sessions_spawn`, Task/Flow records, session ownership, task cancellation and Gateway run
observations remain authoritative. The actual native spawn prompt carries the goal/criteria and native records retain the origin.
ACP Task/Flow records expose a 160-character task summary, not the full prompt. Spawn returns
`runId`/`childSessionKey`; `rein_task status` resolves the canonical native `taskId`.
Accepted/queued is not completed. Status includes native goal, progress or an explicit lack
of further detail, terminal summary, errors and delivery status.

The tool's in-memory maps retain only current human-turn/tool-invocation authorization and
one replacement admission attempt. They are not task history or a runtime state machine.
Native records are never manufactured by the model or fixture. A successful replacement's
actual native spawn input links the predecessor task/run/session IDs and the new goal/criteria;
the native ACP backend receives that full input, and the conversation reports the fresh IDs.
The summary-only Task row cannot independently reconstruct all criteria or the predecessor link;
use the authorized original conversation/input evidence. M2 restart reconstruction is not claimed. There is no M2 automatic follow-up or restart recovery.

## Authority and audience

This pilot explicitly uses the **native shared private channel/thread audience**. Current
authorized members may collaboratively read/change/stop its tasks. It does not impose
sender-only control on a shared session. Current nonmembers and revoked members are denied;
different native sessions, channels, accounts and private conversations remain
outside the task's native owner scope. A shared channel session can span multiple threads:
`threadId` is a captured reply destination, not automatically an ownership boundary. Only a
separately keyed thread session creates a separate native owner scope. The tool binds only host context, never user-provided
owner/session keys. It rechecks membership and contextVersion-2 invocation authority before
reads/effects and after asynchronous work. Compact `tool_call` and canonical native calls
receive the same membership gate. Raw `sessions_history`, `sessions_list`, `sessions_search`,
`session_status` and `sessions` reads are included so revocation after turn admission cannot bypass
the control tool. Missing current task-loop context fails closed; known host-admitted native
children/background work retain their admission rather than acquiring a fictional online sender.

Native children/background execution keep native admission and capability inheritance,
reusing #66. Public SDK session classifiers distinguish native children; classification does
not grant human control-tool authority. Ordinary chat and existing file/shell/message tools
are not removed. Native session visibility must explicitly be `tree` in this opt-in pilot.
Foundation Contributor/Director roles are not required; business tools retain their checks.

Sender-private requests belong in an authorized private native session, with explicit DM
isolation. They must never be imported into the shared channel transcript, shared task prompt,
workspace references or answers. A private Slack channel is shared with its members, not
private to the initiating speaker. Task state stays in private `OPENCLAW_STATE_DIR`, outside
public workspace references; no production state is migrated or read.

## Cancellation and user-directed changes

The pilot deliberately implements **native cancellation plus fresh delegation**, not
in-place ACP steer. `subagents` supports list/wait/cancel; `sessions_send(mode="steer")`
targets an active embedded run. ACP's native command route creates a private admitted
execution context, which this integration neither imports nor fabricates.

Native `cancelled:true` and a cancelled task projection alone are insufficient: active ACP
cancellation can await backend cancellation without joining the accepted turn's final cleanup.
`rein_task` additionally observes `api.runtime.subagent.waitForRun` for the exact canonical run,
requiring a terminal `ok/error` result with `endedAt`, no yield and no nonterminal liveness.
An unavailable/pending/observation-timeout result is cancellation pending, even if the native
task projection already says cancelled. Failed cancellation or a competing native completion
does not authorize replacement. Membership/invocation revocation also prevents replacement.

Only a confirmed cancelled and settled run returns `replacementAllowed:true`, with exact
replacement instructions. The same human turn may admit one matching native spawn on the
original runtime; compact dispatch does not consume that admission twice. An uncertain spawn
response requires native inspection, not a blind retry. Cancelled native completions are no longer
blocked before inference. A provenance-matched cancelled completion receives a report-only prompt
and no tool effects: label its old scope, preserve partial evidence, disclose performed/uncertain
actions, and use the captured destination. This ends delivery normally rather than asking native
announcement to retry. Stop/status/change return available native partial evidence and explicitly
state that cancellation is not rollback. Native cancellation itself may suppress the usual
announcement; this slice does not promise a later report or synthesize another delivery job.
The expanded native run observed cancellation evidence in stop/status, not a cancelled announcement.
The provenance-matched report path and no-block behavior are unit-tested.

## Reply and research contract

Research omits `completionTarget` and uses native completion announcement through the parent and captured original reply
route. Parent-only silent completion is not selected for this pilot. The parent reviews the
shortlist against requested size/scope and includes sources, mission fit, eligibility constraints
or explicit unknowns, and contact priority per entry. It labels synthetic/unverified material.
An unrelated conversation may continue while the child runs; it does not retarget completion.
Research never authorizes outreach.

Coding retains existing ACP/Codex backend configuration, client-native login, status/progress
and terminal-result delivery. No credentials are copied or routed through Magpie. The legacy
restricted ACP controller remains available unchanged by default; **do not re-enable it in the
production trusted-host profile**. Main/development bindings and Magpie policies are retained.

## Opt-in local configuration

[Example fragment](../config/slack-task-loop.example.json) is synthetic and local-only.
Merge it deliberately into a disposable profile with its existing native Slack admission,
main/development bindings, model/Magpie routes, acpx backend, coding-client authentication and
runtime/attempt limits. Startup requires native ACP enabled, dispatch not disabled, an explicit
backend, the configured harness in `acp.allowedAgents`, the existing parent in native host mode
(`sandbox.mode=off`), conversation/prompt hooks and `tools.sessions.visibility=tree`. It does not
force legacy tool allowlists, command bans or binding changes. Both compact and canonical ACP
calls fill omitted `agentId/cwd/mode/thread/streamTo`, reject overrides and retain one-shot parent
progress, including replacements. The configured cwd bounds the requested working directory;
it is **not an OS security boundary**. Preserve existing arrays/agents/plugin paths; the fragment is not a
replacement deployment configuration. Add `rein_task` to the existing tools, and install the
skill through ordinary workspace discovery. Put native state outside any public workspace.
There is no installation, migration or account setup in this slice.

For rollback, set `plugins.entries.rein-acp.enabled=false` and remove only its additive tool
configuration. **Do not set `taskLoop=false`: that selects the legacy restricted controller.** Do not delete/move native task/session records or change
existing bindings. Production enablement remains a separate operator action.

## Source evidence at the pin

- `src/agents/subagents/spawn/subagent-spawn.ts:682`: accepted real run/session identities.
- `src/plugins/runtime/runtime-tasks.types.ts:17`: public owner-bound reads and cancellation;
  async reads use `tasks.async.runs`, native cancellation remains on `tasks.runs`.
- `src/tasks/task-registry.types.ts:162`: native session owner, actual run and result fields.
- `src/tasks/task-registry-cancel.ts:265`: exact ACP run/instance cancellation and terminal races.
- `src/acp/control-plane/manager.cancel-session.ts:169`: accepted-turn cancellation/cleanup distinction.
- `src/gateway/server-plugin-subagent-runtime.ts:430`: public `waitForRun` preserves Gateway evidence.
- `src/gateway/agent-turn/agent-job.execution-settlement.test.ts:82`: native execution-settlement evidence.
- `src/agents/subagents/announce/subagent-announce-direct-delivery.ts:102`: parent-only versus
  captured external reply delivery, with primary-agent review.
- `src/plugins/tool-types.ts:83`: public contextVersion-2 final invocation checks.

## Verification and pending work

Run with the supported local toolchain; parent owns dependency installation and native build:

```sh
.toolchain/node_modules/.bin/node --test tests/slack-task-loop.test.mjs
.toolchain/node_modules/.bin/node scripts/verify-slack-task-loop.mjs
```

Current targeted unit result: **19 passed / 0 failed**. This includes fixed ACP defaults and
forbidden overrides at both hooks, startup validation without main/development mutation,
revoked raw session reads, missing-context refusal, cancelled report/partial evidence, and two
concurrent turns on the **same** runtime. A membership-await race admits only one canonical
replacement; the compact outer hook does not consume it, and the other active task survives.
The scripted-model decoder covers native progress/completion inside an active tool turn,
a fresh background turn, and a completion coalesced before the first inference of a new human request. Stubs do not prove native behavior.

The parent verified the pinned native build, existing `verify-director-acp` and
`verify-sa-ops-cron` regressions, plugin loader and native workspace skill discovery in isolated
HOME/state. Repository tests passed: **1333 tests / 1331 pass / 2 existing conditional skips /
0 fail**. The final decoder edit also passed all 19 targeted tests. Scaffold/diff checks and
vendor source cleanliness passed the local handoff. Remote CI and review are now tracked in
[PR #74](https://github.com/rein-protocol-foundation/nori-agent/pull/74).

The Gateway script loads the real plugin with the actual pinned loader, uses native synthetic
Slack ingress and scripted loopback inference through Rein Router/Magpie, starts actual native
research and ACP tasks, and checks native read/change/stop refusals across channel/account/
private-session/thread boundaries. The synthetic ACP backend deliberately acknowledges
cancellation while retaining run cleanup, then releases cleanup under fixture control. The
script must prove no replacement before settlement and one fresh actual run afterward; it also
exercises backend cancellation failure. Sources and coding data are explicitly synthetic;
no actual research, file edits, paid provider or real Slack call occurs.

Native runs so far:

- First run failed: missing native `contracts.tools` declaration prevented registration;
  the declaration and fail-fast loader assertions are now present. It also exposed that native
  children must bypass interactive human admission, now handled with public SDK classifiers.
- Second run passed actual loader, canonical task resolution, shared-member status, native
  cross-scope refusals and original-thread routing, but failed the synthetic model decoder's
  completion selection. Its historical status response is not a successful shortlist delivery.
  A focused regression now recognizes only the actual native completed-task event block.
- Third run passed research delivery after the decoder fix, then failed before ACP execution
  because the synthetic backend omitted required configuration controls. It now exposes the
  same set_config_option/set_mode controls as the existing ACP fixture; no runtime policy changed.
- Fourth run passed the complete native cancellation-pending/settled/failure sequence and
  admitted exactly one fresh native ACP replacement after actual backend cleanup.
- Fifth run passed expanded checks: all six nonmember/revoked read/change/stop requests
  rejected before inference; a second current member controls the first member's ACP task;
  native ACP progress and final result reach the original thread. The canonical research task,
  four foreign-scope read/change/stop sets and original-thread shortlist also passed.
- Sixth run passed the same complete checks on the final explicit-success result envelope.
  Successful status/cancellation observations are not misclassified as tool failures merely
  because the underlying task is cancelled; a task's diagnostic is returned as `taskError`.

Retained **superseded pre-review** sixth-run passing synthetic evidence:
`/var/folders/wg/2v96p0b11nvd57tglhqxrjbw0000gp/T/nori-m1-m2zFC8/`
(`loader.log`, `evidence.json`, `gateway.log`, `model-requests.json`). A subsequent strengthened
pre-review run at `.../nori-m1-Hn3DIp/` was interrupted before Gateway evidence; it is neither a
pass nor a product failure.

Earlier expanded review runs (retained failed evidence):

- `.../nori-m1-cUQNlX/`: actual research change/stop reached cancelled + settled and research
  replacement obtained a distinct native task/run. ACP replacement was accepted, but its immediate
  public canonical lookup returned unavailable while the eventual native record exists. Fast ACP
  completion was delivered into an active requester turn; the expected separately reviewed final
  report did not arrive before the fixture deadline. This run failed that deadline.
- `.../nori-m1-YdEtnM/`: replacement ACP was held until the parent turn finished; its final report
  reached `channel:CFIXTURE1`, thread `1000.001`. The fixture completed, but final assertion failed
  because canonical replacement ID was absent from tool evidence. Request-log inspection shows
  the synthetic decoder selected `M1_OTHER` after a native progress context, so it **did not make
  the replacement status call**; this is not a second SDK lookup failure. The decoder has since
  been corrected and its added unit regression passes. Subsequent parent checks are recorded below.

The expanded retained evidence additionally observes native research cancellation/settlement,
new actual research run, explicit stop without replacement, real post-admission history/list
revocation refusals, and ACP pending/settled/failed cancellation. Initial and unrelated messages
use the **same** native session key but threads `1000.001` and `1000.999`; the original shortlist
and replacement ACP final use `1000.001`. A separately keyed thread is tested as a foreign scope.
Research original/replacement use the same effective default `rein-magpie/standard` and sampled
native read/exec/spawn capability surface. This does not claim arbitrary child option transfer.
Sources, transport, model and ACP backend are synthetic; no live research acceptance is implied.

Evidence directories share the prefix
`/var/folders/wg/2v96p0b11nvd57tglhqxrjbw0000gp/T/`; each expanded run retains `loader.log`,
`evidence.json`, `gateway.log`, `model-requests.json` and isolated native state. Nothing from
these directories is committed. The first expanded run's eventual native canonical record is
only diagnostic evidence, not a successful public tool response or user receipt.

Final parent review preserved these additional failures before the successful replay:

- Immediate canonical ACP lookup can be unavailable after a real accepted spawn. The skill and
  prompt now report the actual accepted run/session, avoid retries, and resolve canonical ID on
  the next authorized request. The final native fixture exercises that later status request.
- `nori-m1-R51qbo`: a coalesced completion made the synthetic decoder omit a new stop request.
  Fixed the decoder's current-human-turn precedence and added regression coverage.
- `nori-m1-hzn15O`: all behavioral checks up to the storage assertion passed; the assertion
  incorrectly expected the full predecessor link in ACP's 160-character Task summary. Source
  inspection confirmed `summarizeBackgroundTaskText`; the fixture now checks real native row
  identity/owner/goal summary and unchanged full input at the actual native backend boundary.
- **Final passing expanded run: `nori-m1-PzyVU6`**, containing the real loader/Gateway/native
  state and synthetic evidence files described above. It verifies research change/stop/new run,
  ACP pending/settled/failed cancellation, accepted run then canonical status, original-thread
  final delivery, backend predecessor/criteria input and all authorization assertions.

**PR follow-up (2026-11-12):** user authorized push, PR creation and CI/review fixes only.
[PR #74](https://github.com/rein-protocol-foundation/nori-agent/pull/74) contains the #60 slice.
Merged main `4d62769` into this branch as `c67ae12`, retaining both sets of acceptance records
when resolving two documentation conflicts. No #72/#73 source changes were rewritten.
After installing the already locked `@resvg/resvg-js` dependency newly required by main, the
combined local suite passed **1346 tests / 1343 pass / 3 conditional skips / 0 fail**. The first
combined run failed solely because that dependency was not yet installed; no source fix was needed.
Codex automatic code review completed for implementation `46b7be3` with no findings. Current
head CI/review status is authoritative on the PR; the merge changed no #60 implementation.
Owner: Codex. Next: finish PR CI/review checks and report, without merge or another Issue.

**Handoff:** review PR #74, then separately authorize live Slack/research/Codex acceptance and
any merge/deployment. Product checkboxes remain unchecked; M0/M2/M3 are
unchanged. No sidecar store, polling service or upstream patch was added.

Native acknowledgement plus a cancelled Task can precede ACP cleanup; actual synthetic native
evidence proves the extra Gateway wait prevents replacement in that interval. Native delivery can
be queued into an active requester turn, so a scripted model must handle that context truthfully.
General memory readiness, arbitrary harness shutdown guarantees and restart recovery are not
established. Live Slack/research/Codex acceptance remains pending.
