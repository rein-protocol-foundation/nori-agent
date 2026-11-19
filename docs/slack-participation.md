# Optional Slack participation and policy replay

The Router’s optional `participation` policy filters unmentioned traffic before model routing in
explicitly configured Slack channels. Omission or `enabled: false` preserves the native behavior.
Native Slack configuration owns `requireMention`. The Router scopes each decision to the admitted
account, workspace, channel and agent IDs. Participation creates no organizational role, tool grant,
billing grant or private-memory access.

## Dispatch behavior

The classifier receives only bounded current message text and operator-configured duties. It uses
Slack’s native `CommandBody` projection, which strips Slack mentions from the original message text.
It excludes retrieved history, attachments, resolved sender profiles, tool definitions and runtime
credentials. Jev judges duty relevance and whether an unsolicited reply adds useful value separately.
Useful out-of-duty clarification may proceed. Uncertain helpfulness, invalid results, outages, timeouts
and Jev billing opt-out yield normal silent completion before worker dispatch.

Explicit mentions, direct replies to the bot, DMs and native controls retain their native behavior.
The adapter uses OpenClaw’s own control-command and abort detectors as well as native intent facts.
The existing router still checks manual model choice, attachments, current authority, restricted routes
and billing. A positive decision adds one Jev request ahead of any separate Jev model-routing decision.
The participation gate leaves positive decisions to native delivery, including native silence.
Actual worker handling of `NO_REPLY` remains an end-to-end acceptance check. A passive attachment without current text skips
classification. An eligible turn carries its thread and attachments to the native dispatch unchanged.

The gate allows up to four pending classifier calls and twelve starts per scoped channel per rolling
minute in a process. A timed-out call retains its slot until the provider settles. The gate reserves a
message ID before awaiting a decision and keeps up to 1,024 recent passive event identities for five
minutes. Native ingress owns restart delivery deduplication.

## Native coverage and activation gate

On pinned OpenClaw, public `reply_dispatch` handles both agent and ACP dispatch. Synthetic tests use
the native registry, context builder and dispatcher to prove silence before worker execution.
`before_agent_run` would instead emit an error for a blocked run. The Slack preparation path furnishes
the account, workspace, channel, agent, bot, mention and sender facts through its public context builder.
The synthetic fixture does not exercise a network Slack event or hosted Jev.

A plugin-owned conversation binding can claim the turn before `reply_dispatch`. The pinned native
fixture reproduces the claim and bypass. Restricted Gateway runtime settings may also suppress takeover
hooks, and heartbeat dispatch skips inbound hooks. The native Slack producer supplies no restricted
Gateway runtime settings. These native paths remain available.

Production activation in **#nori-deployment** remains blocked for a full-channel guarantee. The narrow
upstream extension would be a public pre-binding disposition hook at authenticated channel ingress. It
would expose host-owned scope and explicit-intent facts, permit only continuation or silent completion,
recheck the route after awaits, and leave native commands, attachments, memory and binding intact.

For an authorized test on the existing gateway in **#rein-agent-test**, independently verify the account,
workspace, channel and agent tuple, existing native access checks, and absence of a plugin owner claim.
Keep the existing Slack socket consumer. Load the plugin policy with the room’s mention gate still in
place, verify that the plugin registered its hook, then change only the verified test channel’s native
`requireMention` to `false`. Ensure the intended native unmentioned group policy allows replies
(`user_request`); `room_event` may intentionally suppress automatic delivery. Restore the original mention
gate before turning off the participation policy. The test must establish visible behavior, commands,
model selection, actual Slack delivery, and any native reactions or other status indicators.

Use `plugins.entries.rein-router.hooks.allowConversationAccess: true` as in the Console-generated
configuration. Jev needs the existing separately authorized `decision.allowPaidJev: true` and TypeSafe
provider setup. The host owns participation settings and the Console preserves explicit settings and
omission. Example with synthetic channel IDs and activation disabled:

```json
{
  "enabled": false,
  "version": "slack-participation-v1",
  "duties": "Help with organization deployment and operational reliability.",
  "channels": [
    { "accountId": "default", "workspaceId": "TFIXTURE1", "channelId": "CFIXTURE1", "agentId": "main" }
  ],
  "timeoutMs": 3000,
  "minProbability": 0.8,
  "maxMessageChars": 4000,
  "recordEvidence": false
}
```

## Private evidence and operator-reviewed replay

With `recordEvidence: true`, the runtime writes typed decision facts to
`<openclaw-state-dir>/rein-router-participation/evidence.sqlite` under the gateway’s OS account.
The directory is mode `0700` and the database is `0600`. Reports and reviews belong in private
runtime storage. The database binds each decision to its policy fingerprint, scope, Slack source
message and authenticated author. It records the rubric version, passive trigger, duty and helpfulness,
numeric scores, classifier attempts, elapsed time, decision failure, and gate outcome. It keeps the
first observation for a scope, policy and message combination across restarts. At 10,000 decisions it
stops recording new entries and emits a warning. Preserve existing evidence when rotating the ledger.

Normal logs contain only fixed decision fields without identity, message references or scores. The
private ledger stores no conversation text. For admitted turns it records delivery and actual worker
model as unobserved. The pinned Slack `reply_dispatch` event lacks a native run ID, and the Slack
`message_sent` producer lacks a matching run identity. Session-level status cannot resolve concurrent
turns. A reviewer can independently verify a specific reply, author and actual model from native
evidence and record the verified reference in their private review file.

Run the review script as the OS owner of the private runtime files. Use owner-only JSON files for
the active **participation policy alone**, scope and review. The inspect output supplies the scoped
decision IDs and exact policy fingerprint.

```sh
node scripts/slack-participation-review.mjs inspect --state-dir /private/runtime/openclaw --policy-file /private/runtime/policy.json --scope-file /private/runtime/scope.json --output /private/runtime/inspection.json
node scripts/slack-participation-review.mjs compare --state-dir /private/runtime/openclaw --policy-file /private/runtime/policy.json --review-file /private/runtime/review.json --output /private/runtime/comparison.json
node scripts/slack-participation-review.mjs stage --state-dir /private/runtime/openclaw --policy-file /private/runtime/policy.json --review-file /private/runtime/review.json --output /private/runtime/staging.json
```

The scope file holds one configured scope object. The review file includes `schemaVersion: 1`,
`scope`, the inspection’s `policyDigest`, a fresh `candidateVersion` and a `reviews` array.
Each item contains `decisionId`, `messageId`, `actorId`, `signal`, `sourceMessageId` and `split`.
The operator attests from native Slack records that the feedback source belongs to the same audience
and the original message author, and that its actor still has access. The CLI compares the author and
source decision to the private ledger. `sourceMessageId` points to the reviewed Slack feedback note.
Signals are `false-wake`, `missed-wake`, `wrong-answer`, `correct-wake` and `correct-silence`.
A `wrong-answer` item requires a `reply` object with the independently verified `messageId` and
fully qualified `actualModel`. Answer correctness remains a different observation from wake accuracy.

The script tunes a threshold on items marked `calibration`, then compares the candidate against
fixed synthetic cases and independent items marked `holdout`. A candidate must reduce a calibration
error without increasing either error count, and any newly wrong holdout case blocks staging. It
reports projected worker admissions, observed wrong answers and actual recorded classifier attempts.
Replay calls no providers. Candidate answer quality and billed cost require independent evaluation.

The review workflow stages proposals for one configured scope at a time because the threshold applies
to every scope in a policy. `stage` writes an exclusive private record with the active policy
fingerprint, candidate and rollback configuration. The operator checks that the current policy still
matches that fingerprint before any separately authorized application. Rollback restores the recorded
prior policy if the current policy matches the candidate fingerprint. This script writes no host configuration. Real
Slack feedback ingestion, live candidate quality evaluation and production promotion remain separate
acceptance work.

## Shadow evaluation of a verified test message

An authorized operator can assemble a private, owner-only input JSON from the Slack Web API with the
existing Nori Slack account. Put the official `auth.test` response in `authTest`, the official
`conversations.info` response in `conversationInfo`, and the exact test message readback from
`conversations.history` or `conversations.replies` in `messageRead` (up to 16 messages). Include
`schemaVersion: 1`, `expectedSenderId`, `expectedMessageId`, the enabled one-scope `policy`, and
`decisionModel` such as `"typesafe/jev-latest"`. Set `scopeReviewed: true` after verifying the actual
gateway account and Agent binding. The driver matches the workspace, conversation, sender and exact
message ID, and accepts only the configured #rein-agent-test scope.

```sh
cd vendor/openclaw
../../.toolchain/node_modules/node/bin/node --import ./scripts/tsx.mjs ../../scripts/slack-participation-shadow.ts --input /private/runtime/slack-readback.json --output /private/runtime/shadow.json
```

To make at most one hosted Jev call, pass `--allow-paid-jev` with the separately authorized API
key in `REIN_PARTICIPATION_TEST_JEV_KEY`. The driver uses the pinned Slack text projection, native
context builder, participation implementation and TypeSafe provider transport. It saves typed gate
outcome, hosted call count, classifier model and usage when observed, and latency. It opens no Slack
connection and performs no model-worker or Slack delivery operation. Context fields derived from
binding state, native live ingress, commands and visible Slack outcomes require separate gateway
verification. A no-credential run yields no hosted classification.

## Local verification

```sh
.toolchain/node_modules/node/bin/node --test tests/slack-participation*.test.mjs tests/router-console.test.mjs tests/subscription-router.test.mjs
.toolchain/node_modules/node/bin/node scripts/check.mjs
git diff --check
```
