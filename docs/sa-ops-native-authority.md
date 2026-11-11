# SA-OPS-01 / #66: trusted Slack creation and native execution

Date: **2026-11-10, America/Los_Angeles**. Owner: **Codex**. Task:
[SA-OPS-01 / #66](https://github.com/rein-protocol-foundation/nori-agent/issues/66),
[PRD v0.6 §2.2.1 / §2.3 / M1](super-agent-nori-prd-en.md).
Implementation base: `b36f21b3`; initial investigation base: `ac8d766`.
Pinned OpenClaw: `4a11f89e840b2bb3eedcad2820ab25b8520905b6` (`4a11f89`).
[#61](https://github.com/rein-protocol-foundation/nori-agent/pull/61) and
[#69](https://github.com/rein-protocol-foundation/nori-agent/pull/69) are merged.

**Status: IMPLEMENTED / LOCAL VERIFIED. No production/product acceptance.**
This task does not complete M0/M1 or the governance acceptance matrix. No other Issue was started;
no commit, push, PR update, merge, deployment or external message was performed by this worker.

## Responsibility and implemented behavior

OpenClaw owns execution admission, scheduled authority, capability inheritance, scheduling,
agent/job model selection, lifecycle recovery and native management. Router no longer requires an
online Slack sender or Foundation role for every development-agent run/tool call. Trigger labels,
provenance and session-key strings are not Rein authorization credentials: execution admission
belongs to the native host, independently of Router. No fake user, grant ledger, scheduler,
private production API or vendor patch was added.

Ordinary trusted Slack work and ACP need no Contributor/Director role. The configured private
workspace/channel's current membership is checked where Rein grants creation or restricted
interactive development-model access. Business tools retain their backend authority and role
checks; legacy administrator-only Provider access is unchanged.

Only configured agents in a current trusted Slack turn may create or expand automations. The hook
covers native `automations`, the `cron` alias and compact `tool_call`, including native-trimmed
actions. It binds agent/run/session/requester/account and accepts only the exact native chat ID
or `channel:<that ID>`, checks current Slack membership, and refuses executor retargeting.
Native creation permission is also required: the fixture uses formal
`commands.ownerAllowFrom: ["slack:UALICE01", "slack:UBOB0001"]`. A third current channel member
without that native permission is refused by the native tool catalog. No `isOwner` flag or grant
is fabricated. Native read/control, exact disable, self-removal and administrator Dashboard remain
native. Configure approved real creators, agents, tools and channels in native Dashboard/config.

The searchable description line `[Nori creation v1 workspace=… account=… channel=… user=…]` records
host-observed creator/channel separately for two users in the same session. It is display/filter
metadata, not a credential. Native inventory `query` searches name, description and agent ID
([ops-read.ts:381](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-read.ts#L381)); use the native inventory/Dashboard for management rather than a Rein store or UI. Native owner fields are retained. Description edits load current jobs
through public `cron-store-runtime` and return only the same owner agent/account/session; the hook
also checks that scope before merging the existing line. Declaration convergence preserves the
original description. Manually authored/old stamps are audit claims, not signed provenance.
Ownerless/mismatched records may be managed without changing description under native scope;
description edits explain that audit cannot be verified and direct administrators to Dashboard.
Storage/auth errors and a combined 8.5s deadline return an explicit generic block before the outer
9s hook deadline; timers are cleared. Errors never include another job's audit or storage content.

Background inference keeps the effective native agent default/job override and bypasses Jev.
Each actual non-scoped fallback candidate is checked for Agent eligibility and configured order;
the initial native primary remains fixed. Scoped native stream candidates are also checked before
reading their credential or making any network call. Direct-user scoped fallback and interactive
manual-model pinning are unchanged.
`nativeAgentRoutes` only restricts existing subscription eligibility; it does not select Cron
models. Coding Plan and administrator-only routes remain excluded. Full-subscription development-tag
routes are usable only through explicit Agent `nativeAgentRoutes` eligibility, without a live user,
role or Jev check; omitted eligibility does not expand restricted access. Provider billing,
paid-use opt-in, readiness, route caps/fallbacks and the durable scoped usage ledger remain active.
Native usage has an agent/session subject, never a fabricated Slack user. Unknown routes fail.

Public Community Discord routing (including native default resolution), inherited native spawn
allowlists and native agent-to-agent patterns are checked for access to trusted executors, including
indirect mixed spawn/send paths through configured intermediate Agents. IDs use the public SDK
`normalizeAgentId`; wildcard targets intersect the native configured Agent registry. Allowed
internal native collaboration remains available; `agentToAgent.enabled` is not globally prohibited.
Other channels are not automatically treated as public; their native ingress/tool/agent policies
remain operator responsibilities. A foreign channel or delegated/background turn cannot acquire
Rein automation-creation authority from model labels. See [configuration](slack-development.md).

ACP retains its fixed harness/cwd, one-shot delegation, native ownership, status/wait/cancel,
progress and terminal-result paths. Runtime child reports remain report-only in the bounded ACP
controller. [ACP configuration](director-acp.md) explains the optional slice; harness credentials
and model configuration remain native.

## Source evidence

Native links below identify the immutable pin, not mutated current Rein code. Rein links describe
the current implementation. They are implementation evidence, distinct from behavioral checks.

| Boundary | Exact implementation evidence | Validation scope |
| --- | --- | --- |
| Native creator permission | [session-portal-target.ts:20](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/tools/session-portal-target.ts#L20), [command-auth.ts:471](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/auto-reply/command-auth.ts#L471) | Real fixture owner allowlist admits Alice/Bob; native denies the unowned member. |
| Rein creation / audit / timeout | [cron-ingress.mjs:17](../plugins/rein-router/cron-ingress.mjs#L17), [deadline:33](../plugins/rein-router/cron-ingress.mjs#L33), [owner-scoped merge:73](../plugins/rein-router/cron-ingress.mjs#L73) | Exact native prefix, foreign owner/privacy, malformed/forged/compact inputs and auth/store timeout/error tests. |
| Native owner / declaration convergence | [jobs.ts:223](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/jobs.ts#L223), [jobs.ts:478](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/jobs.ts#L478), [public SDK:4](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/plugin-sdk/cron-store-runtime.ts#L4) | Actual store snapshots prove separate creators, same native owner session and original creator after update/declare. No sidecar. |
| Create / executor / enable | [ops-mutations.ts:214](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L214), [executor changes:425](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L425) | Actual native create/disable/enable; Rein refuses creator retargeting. |
| Disable / remove / restart | [disable cancellation:177](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L177), [remove:546](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-mutations.ts#L546), [recovery:188](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/service/ops-lifecycle.ts#L188) | Persisted scheduled jobs survive a real Gateway restart; disabled/removed jobs do not execute. Active cancellation races are not exhaustively tested. |
| Native senderless execution | [run-admission.ts:60](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/run-admission.ts#L60), [Router:339](../plugins/rein-router/runtime.mjs#L339) | Two actual scheduled runs with no sender after restart. No Router execution-level Slack grant check. |
| Agent default / override / Provider | [model-selection.ts:249](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/model-selection.ts#L249), [job override:298](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/model-selection.ts#L298), [Router:215](../plugins/rein-router/runtime.mjs#L215), [native usage:24](../plugins/rein-router/usage-limits.mjs#L24) | Actual loopback Provider receives the explicit development-subscription Agent default and job override; tests cover per-candidate fallback, no forbidden scoped credential/network access, Console unavailable, scoped/no-resolution eligibility and persistent usage caps. Live Provider quota not tested. |
| Announce / message-tool audience | [delivery-target.ts:142](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/isolated-agent/delivery-target.ts#L142), [scheduled-tool-policy.ts:21](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/scheduled-tool-policy.ts#L21) | Actual announce reaches the synthetic original Slack destination. **Announce destination is not message-tool permission**; arbitrary message-tool destinations are not accepted by this test. |
| Public / internal collaboration | [effective boundary check:92](../plugins/rein-router/cron-ingress.mjs#L92), [native child inheritance:125](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/spawn/subagent-spawn-session-patch.ts#L125) | Native public spawn/send refusal plus effective defaults/pattern tests; internal collaboration remains configured. Run11 verifies real native child spawn, senderless execution and result through the parent, followed by the complete bounded Cron lifecycle. Broader child continuation remains unverified. |
| Memory / projected context | [agent-runner-memory.ts:1461](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/auto-reply/reply/agent-runner-memory.ts#L1461), [hook-context.ts:22](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/harness/hook-context.ts#L22) | Real pinned context-projection helpers with Rein gates; full native memory maintenance remains unverified. |
| ACP | [bounded controller:57](../plugins/rein-acp/runtime.mjs#L57), [tool boundary:83](../plugins/rein-acp/runtime.mjs#L83) | Real native Slack ingress/ACP lifecycle with synthetic transport/model/harness; no Foundation role. |

The narrow configuration reachability check is necessary because native child policy stores
inherited **tool names**, separately from its model patch:
[subagent-spawn-session-patch.ts:125](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/spawn/subagent-spawn-session-patch.ts#L125).
Target Agent model resolution is separate:
[subagent-spawn-plan.ts:71](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/spawn/subagent-spawn-plan.ts#L71).
Inherited tool names alone therefore do not prove Provider/target isolation for every configured
spawn/send chain. The check walks only known configured Agents from the public Community entry,
using native normalization/target semantics
[subagent-target-policy.ts:25](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/subagents/spawn/subagent-target-policy.ts#L25)
and the public native agent-to-agent predicate. It creates no execution grant or new permission store.

## Local checks and evidence

Use `export PATH="$PWD/.toolchain/node_modules/.bin:$PATH"` before commands.
The parent-completed pinned native build (4m56s) was reused without rebuild/vendor modification.
All inference was a local scripted SSE response; no live Slack or paid Provider was called.

- `node --test tests/sa-ops-cron-ingress.test.mjs tests/scoped-router.test.mjs tests/sa-ops-model-input.test.mjs`:
  **31 passed**, including 16 creation/Provider/usage tests, scoped native/direct-user fallback,
  and fixture parsing. Forbidden scoped native candidates are rejected before credential lookup
  or network; valid native and ordinary direct-user candidates remain available.
- `node --test tests/*.test.mjs`: **1309 tests / 1307 pass / 0 fail / 2 existing conditional skips**
  (native managed Magpie two-model-call and native Magpie UI launcher checks).
- `node scripts/probe-sa-ops-authority.mjs`: **7 context/creation cases + disabled-entry check passed**.
  Uses the real pinned context projection, actual Rein gates and disposable empty
  HOME/state/nonexistent config/TMPDIR; private projection imports are test-only.
- `node scripts/verify-sa-ops-cron.mjs`: **passed run11** with actual native automations,
  scheduler/store, Gateway restart and subagent runtime. Two current native-owner Slack users
  create separate audit records in one session; update/declare preserves the creator; native
  disable/enable/remove and public creation/spawn/send refusal are exercised. A real child is
  accepted, executes with no sender and returns its result through the parent. After restart,
  two actual senderless Cron runs use the explicitly eligible development-subscription Agent
  default and job override and announce to the synthetic original Slack destination. A current
  channel member without native owner permission is refused. Internal collaboration stays enabled.
- `node scripts/verify-director-acp.mjs`: **passed run11**, native Slack ingress, membership-only
  ACP admission, running/status/progress/final and non-member refusal. Harness/model/transport
  are synthetic; this is separate from the actual native subagent model execution above.
- `node scripts/verify-plugin.mjs`: **passed run11**, actual loader in three registration modes.
- `node scripts/check.mjs`, local/pinned source-link mapping and `git diff --check`: **passed**.
  Link targets/line bounds are mapped locally, without HTTP; two JSON examples parse.

Final logs: `/tmp/sa-ops-run11-targeted.log`, `/tmp/sa-ops-run11-node-tests.log`,
`/tmp/sa-ops-run11-projection.log`, `/tmp/sa-ops-run11-cron-native.log`,
`/tmp/sa-ops-run11-acp-native.log`, `/tmp/sa-ops-run11-plugin-loader.log`,
`/tmp/sa-ops-run11-check.log`, `/tmp/sa-ops-run11-links.log`.
Retained native synthetic evidence:
`/var/folders/wg/2v96p0b11nvd57tglhqxrjbw0000gp/T/sa-ops-cron-T2gUIC/`
(`before-restart.json`, `evidence.json`, `gateway.log`, `model-requests.json`).
HOME/state/config/TMPDIR are private temporary paths; shared evidence uses
`process[Symbol.for(...)]` across plugin instances and atomic file replacement.

The earlier run10 combined fixture failed because its scripted model chose historical child tags
from native internal metadata. The test-only model decoder now excludes internal-context blocks,
recognizes complete-line fixture commands plus native Cron/child announcement formats, and never
changes native messages or permissions. A minimal regression proves stale metadata cannot replace
the current user request. Those failed attempts are superseded by run11, not counted as passing.

## Limits and recovery notes

Pinned native enable may commit successfully and then return an output-schema error mentioning
`scheduleErrorCount`: [native Cron state:367](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/cron/types.ts#L367),
[tool output schema:1](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/src/agents/tools/cron-tool-output-schema.ts#L1).
The run11 fixture checks persisted state before continuing and never retries that mutation. This is an
observed upstream return-contract limitation, not a claimed clean native tool response. No vendor
fix is included. Synthetic startup also records optional memory dreaming-owner reconciliation and
occasional SQLite maintenance diagnostics; the intended scheduled jobs and ACP results are checked
independently. These checks do not establish general memory readiness.

Not verified: live Slack/production, live subscription availability or cost, active-task cancellation
races, every schedule type, native creator-grant revocation races, general native child/memory
continuation and all message-tool audiences. Deleting a queued task is tested; it is not proof of
all authority-revocation behavior. No historical production job was replayed. Existing data,
channel capabilities and native Dashboard administration were not migrated or replaced.

Next: final review of this bounded diff and the known native output-schema limitation, followed
by the parent’s already authorized commit/push workflow for PR70. This worker does not commit/push. Deployment and real-user acceptance
remain separate actions, and no other Issue is started here.

## Historical premise, superseded

The initial `ac8d766` investigation correctly identified the human-only Router defect and private
host occurrence/parent objects, but incorrectly treated a public grant view plus `assertCurrent()`
as a prerequisite for Rein to admit every native execution. The authorized native-ownership design
supersedes that proposed SDK extension and its **BLOCKED** conclusion. It is not an implementation
requirement. Earlier 9-case defect probes and 1289-test baseline were unchanged-runtime historical
evidence, not the current result. Historical source claims must be read at that base, not at today's
mutated Rein line numbers. `owner_agent_id=null` alone was never the diagnosed cause; the known
skill-review task already selected `nori-development`.
