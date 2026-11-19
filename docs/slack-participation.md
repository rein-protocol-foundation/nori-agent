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

The manual `stage` command preserves a comparison and rollback proposal. Use the verified Slack
workflow below to stage a candidate for the isolated policy store.

## Verified Slack feedback ingestion

The `ingest` command reads one explicit feedback message in the original Slack thread. Use the
configured account and Agent tuple from the decision inspection. Give the process an approved Slack
reader credential only for this invocation through `REIN_PARTICIPATION_FEEDBACK_SLACK_TOKEN`. For
public and private channel threads, use an authorized user token whose scopes can read channel info,
membership, thread replies, and the actor’s Slack identity. Slack may restrict thread reads for bot
tokens. The command uses the fixed Slack Web API origin and the read-only methods `auth.test`,
`conversations.info`, `conversations.replies`, `users.info`, and `conversations.members`.

Create an owner-only config file with the independently verified reader and Nori bot IDs and one
explicitly opted-in tuple. Example with synthetic IDs:

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "scope": { "accountId": "default", "workspaceId": "TFIXTURE1", "channelId": "CFIXTURE1", "agentId": "main" },
  "readerUserId": "UREADER1",
  "noriBotUserId": "UNORIBOT",
  "noriBotId": "BNORIBOT"
}
```

The original author posts one plain-text reply in the thread using
`nori-feedback <label> <source-message-ts>`. Supported labels are `false-wake`, `missed-wake`,
`wrong-answer`, `correct-wake`, and `correct-silence`. For `wrong-answer`, append the exact Nori
reply timestamp after the source timestamp. That label requires a reply to the source thread root,
authored by the configured Nori bot. Slack verifies the reply reference; actual worker model and
candidate answer quality remain unobserved through this path.

Create a separate owner-only request with `schemaVersion: 1`, the inspection’s `decisionId`,
`threadId` (root Slack timestamp), `feedbackMessageId` (feedback reply timestamp), and `split`
(`calibration` or `holdout`). Choose the split before evaluating a candidate.

```sh
node scripts/slack-participation-review.mjs ingest --state-dir /private/runtime/openclaw --policy-file /private/runtime/policy.json --feedback-config /private/runtime/slack-reader.json --feedback-request /private/runtime/feedback-request.json --output /private/runtime/feedback-receipt.json
```

The importer matches the workspace and reader identity, channel ID, source and feedback message
timestamps, thread and original author. It verifies an active human Slack user, plus current
membership for the author, reader, and Nori bot. It declines edited or app-attributed feedback,
external shared channels, ambiguous or incomplete API reads, and mismatched labels. A repeated
verified receipt is idempotent. Conflicting labels or split changes for an existing decision require
operator review. The owner-only `rein-router-participation/review.sqlite` records typed facts and
references. It stores no text, tokens, actor profiles, or raw API responses.

## Compare, apply and roll back in the isolated policy store

Initialize the isolated store from the exact active one-scope participation policy. It keeps its
active policy and transition journal in the private companion SQLite file. Use separate runtime
state directories for distinct policy scopes. The existing gateway continues to read its native
configuration.

```sh
node scripts/slack-participation-review.mjs init-policy --state-dir /private/runtime/openclaw --policy-file /private/runtime/policy.json --output /private/runtime/policy-init.json
node scripts/slack-participation-review.mjs compare-captured --state-dir /private/runtime/openclaw --policy-file /private/runtime/policy.json --candidate-version review-2026-11-19 --output /private/runtime/comparison.json
node scripts/slack-participation-review.mjs stage-policy --state-dir /private/runtime/openclaw --candidate-version review-2026-11-19 --output /private/runtime/staged.json
node scripts/slack-participation-review.mjs apply-policy --state-dir /private/runtime/openclaw --stage-id <stage-id> --output /private/runtime/applied.json
node scripts/slack-participation-review.mjs rollback-policy --state-dir /private/runtime/openclaw --stage-id <stage-id> --output /private/runtime/rolled-back.json
node scripts/slack-participation-review.mjs status-policy --state-dir /private/runtime/openclaw --output /private/runtime/policy-status.json
```

`compare-captured` reads trusted receipts and generates a candidate and held-out comparison without
network or model calls. An authorized scheduler can run this command with a fresh candidate version
and private output path for each run. `stage-policy` persists eligible output with a stage ID,
baseline generation, exact feedback digest, candidate, and rollback policy. `apply-policy` atomically
checks the staged generation, policy fingerprint, and evidence snapshot. A competing apply or new
feedback makes a previous stage stale. `rollback-policy` checks that the selected stage is still
active and atomically restores its earlier policy. Use `status-policy` to recover the authoritative
policy and transition history after an interrupted command or output failure.

Real Slack feedback capture, scheduled operation, and promotion to a live gateway still require
their own acceptance evidence and existing operator authorization.

## Silence after worker admission

The native group silent-reply default can require a visible answer. A live Slack test admitted the request and then produced an empty-response error when the worker tried to stay silent. On the dedicated test gateway, setting `surfaces.slack.silentReply.group` to `allow` permitted a real worker to finish with `NO_REPLY` and no visible Slack message. This setting covers Slack groups on that gateway. Check its scope before enabling it on a shared gateway. Pre-worker participation silence uses the dispatch hook independently.

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
