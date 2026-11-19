# Daily Discord onboarding

COMMUNITY-ONBOARDING-01; owner Codex. Local implementation and synthetic verification,
not yet production activation or real-member acceptance. The user chose **08:00 fixed PST
(UTC−8), throughout the year**: native schedule `0 16 * * *`, timezone `UTC`, no staggering.
During daylight saving this is 09:00 Los Angeles time. The window is the preceding
24 hours ending at the scheduled cutoff, not the previous calendar day.

## Behavior and boundaries

`scripts/discord-onboarding.mjs` runs as a deterministic native OpenClaw command job;
it does not require an LLM turn, Community shell access, a replacement Discord channel,
or edits to vendored OpenClaw. It paginates guild members, uses `joined_at` rather than
account creation time, ignores bots, rechecks membership, and invites newcomers in
batches of at most 20 explicit mentions. No new eligible members means no message.
Welcome messages go to `#welcome` and invite members to `#introductions`. Members already
welcomed or already speaking in the introduction channel are skipped by default.
Introductions are optional. The same daily job also checks Sunday at the fixed PST
08:00 cutoff: existing human members without an introduction receive at most one
optional reminder per seven days. Anyone joined or pinged less than seven days ago
is excluded. The daily and Sunday branches share one durable notification ledger,
so they cannot double-ping someone on Sunday. No DMs are sent.

The first weekly classification requires a complete historical backfill of the
introduction channel. Any prior human contribution conservatively suppresses a reminder;
that is not a claim that every reply is a biography. Explicit short opt-outs (for example
“no reminders” or “不要提醒我”) in either channel suppress future reminders.
`--collect-only` performs initial historical collection without sending messages.

The collector reads every page in the designated introduction channel for the window,
including messages without an @mention. It stores human-authored original text and
attachment metadata under `(guild_id, user_id, message_id)`, with username snapshot,
source channel, URL, creation and edit time. Ordinary replies are not promoted to
biography facts. It ignores bot/webhook/system/empty messages. No attachment is opened
or downloaded, and no external URL from message text is fetched.

Private SQLite storage is outside Git (directory 0700, file 0600). Separate archive
cutoffs recover missed collection intervals after downtime. Welcome eligibility remains
the latest 24 hours. Archive commits precede welcome delivery, so an uncertain send
does not stop subsequent introduction collection. A renewable writer lease prevents
concurrent mutation. Saved send intents and receipts survive restart. An ambiguous send
is reconciled from bot-authored Discord history; absent proof, sending stops for operator
review rather than repeating a ping. Discord nonce deduplication alone is not a durable
exactly-once guarantee. Failures exit nonzero for native job failure alerting.

The optional `rein-member-introductions` plugin registers `rein_my_introduction` using
the public v2 tool interface and native Discord account resolver. Only the current
host-authenticated sender can query their records. Agent, account, guild, current guild
membership, source channel public visibility, and invocation lifetime are checked.
The model cannot supply a user ID, email or source channel. Readback refreshes each
message from Discord, omitting deleted messages and using edits rather than stale text.
Results are untrusted self-reports, never proof of roles or instructions to execute.
This reader supports different **guild channels in the same community**, not DMs,
other guilds, Slack or arbitrary audience expansion.

Records retain the stable Discord identity needed for later community-email linking.
The existing backend binding remains the authoritative link. No email guessing,
nickname matching, backend identity writes, canonical-person merge, or cross-platform
profile retrieval is implemented here. Automatic reuse through a verified canonical
contact on another platform requires a separately authorized backend retrieval contract;
this change must not be represented as completing that integration.

## Configuration and activation

Example private collector config (replace all synthetic values; never commit live records):

```json
{
  "guildId": "100000000000000001",
  "introductionsChannelId": "100000000000000002",
  "welcomeChannelId": "100000000000000003",
  "statePath": "/srv/nori-private/onboarding/members.sqlite",
  "tokenEnv": "DISCORD_BOT_TOKEN",
  "skipAlreadyIntroduced": true
}
```

`welcomeChannelId` defaults to `introductionsChannelId`. Config mode must be 0600.
The collector uses the existing bot credential through an environment variable, never
a token argument. `--dry-run` reads Discord and optionally existing state but creates
no database, writes no records, and sends nothing. Output contains counts only.

```sh
node --env-file=/absolute/private/.env scripts/discord-onboarding.mjs \
  --config /absolute/private/onboarding.json --dry-run
```

`configureDiscordOnboarding` in `scripts/configure-discord-onboarding.mjs` builds an
additive Gateway candidate: optional plugin load path/config, current Community tool
allowlist, sandbox tool allowlist, and existing guild/channel tool allowlists. It does
not modify bindings, shell access, sandbox configuration, memory sources, roles or
backend credentials. `dailyOnboardingJob` builds the native command-payload definition;
it does **not** create a job. Apply through the supported operator Gateway config and
automation interfaces, not direct edits of the live scheduler database.

Activation sequence:

1. The user selected welcomes in `welcome`, with invitations and collection in
   `introductions`. Verify Nori has Send Messages in `welcome`; initial preflight
   found that permission missing and the bot has no Manage Roles/Channels permission.
   The user has been asked to allow only Nori to send there.
2. Coordinate the shared Gateway deployment window. Inspect the active updater
   transaction and acquire its lock; preserve private configuration and existing tasks.
3. Deploy reviewed source through the established release process. Build and validate
   the additive config; include the collector/store scripts with the plugin because
   its reader imports the shared store implementation.
4. Verify bot `GUILD_MEMBERS` and message-content access, public introduction-channel
   visibility and Read Message History, plus Send Messages in the welcome channel.
5. Run dry-run and inspect aggregate counts. Add one native named daily command job,
   exact UTC16, `delivery.mode=none` (collector owns the sole welcome send). Inspect
   its saved job ID and next run. Retain native failure monitoring.
6. Observe an actual scheduled run and its welcome receipt, plus an introduction
   without @Nori retrieved by the same member in another guild channel. Test another
   sender, revoked membership, edited/deleted source, restart and disable/re-enable.

Rollback: disable the named native job and the optional plugin, removing only the
added tool entries if desired. Preserve archive and receipts to prevent duplicate
welcomes after re-enabling. No full configuration/database restore or history deletion.
For member erasure, operator maintenance must remove only that member's selected
source records from the private store; no self-service erasure tool ships in this slice.

## Verification — 2026-11-18 America/Los_Angeles

- 25 focused synthetic tests passed: calendar boundaries, pagination over 1,000 members
  and 100 messages, bot/DM/foreign-guild rejection, explicit mention chunking, already
  introduced/departed members, dry run, restart/reconciliation, partial failures, leases,
  separate channels, missed-day recovery, current sender and source audience checks,
  edits/deletions, expired invocation, and additive configuration.
- 34 existing identity/routing/withdrawal regression tests passed; scaffold passed.
- Actual pinned OpenClaw runtime loader imported the new plugin, registered the optional
  tool and reported zero errors. No vendor source was changed.
- Read-only production checks found the shared Gateway and both candidate channels,
  enabled member/message-content intent configuration, and a successful member-list API
  read. This does not establish full-history collection, send permission or recall.
- The first loader invocation through `pnpm` failed because its temporary package-manager
  install directory was disallowed by the sandbox; a direct installed repository
  Node/OpenClaw invocation completed successfully. The live launcher `cron list` probe
  failed (exit 1); no job listing or scheduler mutation was inferred from that failure.
- Not run: full repository suite, live sends, live archival, native scheduled execution,
  actual model/tool selection, two-human acceptance, or cross-platform identity joining.
  The initial implementation was not deployed, enabled or sent. The daily/weekly
   extension and its activation will have a separate dated record below.

API references: [Discord guild member pagination](https://github.com/discord/discord-api-docs/blob/main/developers/resources/guild.mdx)
and [message history, allowed mentions and nonce semantics](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx).

## Daily and Sunday reminder refinement — 2026-11-18

The user approved separate welcome/introductions channels and a low-frequency Sunday
follow-up. The implementation uses one exact daily native command task; its Sunday
branch has the same fixed PST 08:00 cutoff. Daily invites only cover the preceding
24-hour joining window; Sunday reminders exclude members who joined or were pinged
within seven days, anyone with prior introduction-channel participation, and opt-outs.
Old state upgrades are additive, uncertain weekly sends reconcile as weekly receipts,
and `--collect-only` seeds evidence without delivering any message.

Production preflight confirmed public view/history access to both channels and Send
Messages in introductions. Nori lacks Send Messages in welcome and lacks Manage Roles
and Manage Channels, so it cannot repair that permission itself. No attempt was made
to grant a broader role or use another account. User action on the single channel
permission is pending; activation must not claim public delivery before this is fixed.

Local daily/weekly/reader tests: 36/36 passed. The collector/store syntax checks
and scoped whitespace checks passed. Earlier 34 identity/routing compatibility checks
also passed. Native plugin loading passed with the pinned runtime; the release adds
enable/disable loading to the standard CI verifier. The final CI/deployment/job receipts are recorded separately after execution.
