# Partnership draft approval and test-send workflow

Tracking: SA-M3-01–05 / [#59](https://github.com/rein-protocol-foundation/nori-agent/issues/59).
Owner: Codex (runtime-verified Astra Medium), with one runtime-verified Sol High implementation
worker. Date: 2026-11-13, America/Los_Angeles. Local development only; product acceptance remains
open. No live Slack messages, email, configuration changes, publication, merge or deployment are
authorized by this record.

## Baseline and dependencies

The clean checkout started at `3942608` and was reused on
`tempest/partnership-test-workflow`. OpenClaw stays pinned to
`4a11f89e840b2bb3eedcad2820ab25b8520905b6` (`2026.9.5`); vendor source is read-only.
[M1 PR #74](https://github.com/rein-protocol-foundation/nori-agent/pull/74) is merged as
`1280a75`; its local synthetic evidence does not establish live Slack/research acceptance.
[M2 #58](https://github.com/rein-protocol-foundation/nori-agent/issues/58) is closed by owner
confirmation of development completion. Its issue explicitly says final delivery evidence is
not independently verified. The separate `tempest/m2-native-continuation` checkout at `48856e8`
has uncommitted continuation changes; its committed `docs/task-continuation.md` records native
recovery/retention blockers. Those changes were neither imported nor modified. M1/M2 product
acceptance and M3 first-release necessity remain distinct from this authorized development task.

## Integration decision

Publication update: [PR #83](https://github.com/rein-protocol-foundation/nori-agent/pull/83)
contains implementation commit `92f5773`. During PR creation, M2 PR #82 merged to main as
`50b1275`; this branch synchronizes it while retaining both sets of records. The initial M2
uncommitted/unverified observation above is historical: its delivery and remaining product
limitations are now documented in [task continuation](task-continuation.md).
The combined suite passes with 1392 passed / 4 conditional skips / 0 failures (1396 total).

The pinned OpenClaw Lobster documentation exposes the public `@clawdbot/lobster/core`
`runToolRequest` and `resumeToolRequest` engine used by its official optional plugin. Version
`2026.9.13` is pinned directly, matching the upstream extension. No OpenClaw private runtime
module is imported by the implementation. The upstream docs warn that embedded
`openclaw.invoke` does not inherit Gateway credentials. The fixed template therefore prepares a
native approval checkpoint and returns the exact approved material on resume; the narrow host
adapter dispatches that material to Resend after native success. It does not add a general
workflow runner or expose arbitrary pipeline, command, recipient or resume-token arguments.

The repository has an existing Resend service/account context but no reusable outbound-mail
implementation. The new adapter uses its standard
[send API](https://resend.com/docs/api-reference/emails/send-email) and
[retrieve API](https://resend.com/docs/api-reference/emails/retrieve-email).
Resend retains [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
for 24 hours. A local durable send intent remains authoritative after that window; the adapter
does not blindly retry uncertain sends even with the same key.

The public OpenClaw `registerCommand` seam supplies host-resolved sender/account/agent/session/
thread identity and dispatches the explicit human command without model inference. A v2 tool
with admitted-turn custody prepares drafts. Existing private Slack membership verification is
reused; no Foundation Contributor/Director role is inferred or newly granted. This is operator
test-mail authority only, not organizational business authority or real partner outreach.

The fixed [template](../plugins/rein-partnership/partnership-test-send.lobster) is copied by
content digest into private profile state before preparation. This is necessary because the
native plugin loader captures package files in a temporary directory and Lobster persists the
workflow file path in its checkpoint. An immutable, verified template version must survive
alongside that checkpoint; copying the checkpoint alone is insufficient. No old checkpoint is
rewritten to point to a new template, and a missing/tampered saved template blocks resume.

## Operator configuration and recovery

Start from the **disabled**, synthetic
[example fragment](../config/partnership-workflow.example.json). Merge into an existing reviewed
profile without replacing channel bindings, tools or plugins. Enable the plugin entry and its
config only for the selected trusted private Slack channel; add `rein-partnership` to an existing
plugin allow list if present and `rein_partnership` to the selected agent's `tools.alsoAllow`.
The selected internal agent must already have an authorized unsandboxed execution context.
Do not turn off a public agent's sandbox to use this workflow. Grant only the conversation hook
needed to inspect trusted host context. Preserve the native text-command policy and authorize
the designated approver there; disabling text commands prevents approval.

Supply the configured Slack bot and Resend credentials through private environment variables,
never through prompts, tool arguments or committed JSON. Replace synthetic workspace/channel
IDs and test addresses with explicit operator selections. The initiator is the default approver;
an operator can configure a fixed approver. Allowing an address in this configuration grants
test-recipient capability only; a real send still needs the exact current human approval.

The preparation result shows the exact sender, recipient, subject, full body, version, expiry and
approval commands. Material changes create a new version and invalidate the old decision.
`/partnership status <task-id>` reads the current record in its original authorized scope.
`/partnership reconcile <task-id>` retrieves provider evidence for an existing receipt; it does
not send. API acceptance is distinct from verified delivery.

Private action bindings and native checkpoints live below the profile state directory, outside
shared workspace skills. Back up that directory together with its `lobster` child before an
authorized upgrade. A missing checkpoint blocks resume. Interrupted `resuming`/`dispatching`
records and orphaned locks require operator evidence review; do not remove a lock or create a
replacement task merely to retry. Unknown sends without a provider ID require external
provider reconciliation by an authorized operator. No automatic replay or fabricated receipt
is available. Disabling the plugin entry is rollback and preserves state; re-enable only with
the same protected state and reviewed configuration. Do not delete/merge histories.

## Verification and remaining acceptance

The [native fixture](../scripts/verify-partnership-workflow.mjs) uses an isolated actual pinned
Gateway, real ingress/command dispatch/plugin loading and the real public Lobster engine.
Slack, model output and Resend responses are synthetic and external requests are refused.
The fixture is wired into CI; a local run does not establish remote CI or production enablement.

Checks: 21/21 focused tests pass; full repository suite 1394 tests / 1390 passed / 4 conditional
skips / 0 failures. The four existing opt-in skips cover native catalog repricing, managed
Magpie integration, native Magpie UI launch and native historical-usage collection. They are
not partnership failures or claimed acceptance. The successful native run
`nori-partnership-qS7WYp` used Gateway PIDs `39177` and `39843`: enabled/disabled loader inspection,
two exact drafts and native pauses, restart with identical checkpoints, other-member and
wrong-thread refusal, one accepted send, duplicate no-op, read-only delivery reconciliation,
cancellation and post-cancellation refusal. Commands made zero model calls. Provider request
deltas were `[0, 0, 1, 0, 0, 0, 0]`. All deliveries and provider data were synthetic. The fixed
template and checkpoint survived the different native plugin captures without rewriting state.

Focused tests additionally cover stale versions, expiry, membership/config revocation,
missing/tampered template and checkpoint, unknown provider outcomes, interrupted dispatch,
failed preview, concurrent instances and a separate process holding the action lock, disabled/
sandboxed/background contexts, fixed recipients and credential-free workflow shells.

Existing `verify:plugin` passes all three real loader checks (default tools, backend tools and
scoped profiles). Native workspace discovery passes all nine entries including the new
`nori-partnership-draft` skill. Scaffold and diff checks pass; tracked vendor source remains
unchanged. A final small status-report correction adds an explicit interrupted-operation blocker
for `pending_preview`; all 21 focused tests pass again after it. No remote CI run was requested.

Live Slack user approval,
operator-designated real test recipient, actual provider receipt/delivery and deployed profile
compatibility remain pending separate authorization. The public migration M0, M1/M2 live
acceptance and historical governance AC01–AC20 are not advanced by this slice.

### Observed failures during development

- `nori-partnership-5DD1QE`: native preparation and exact-preview delivery succeeded, but the
  fixture's independent module instances overwrote its own evidence arrays. The assertion
  incorrectly saw no tool result. Shared process-symbol fixture state fixes evidence collection;
  this run does not count as workflow acceptance.
- `nori-partnership-JeQO6Z`: native command dispatch bypassed the model, rejected the other member
  and wrong thread, but the authorized resume produced no send. Its exact cause was `ENOENT`
  resolving the workflow file in the previous process's `state/tmp/plugin-captures/...` directory.
  The binding became blocked and the native checkpoint remained. A direct synthetic native
  diagnostic confirmed the same missing-file error without calling mail. The durable
  content-addressed template change addresses this captured-file lifetime mismatch.
