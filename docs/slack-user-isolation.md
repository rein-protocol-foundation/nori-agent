# Slack per-user sessions and memory

The opt-in `rein-slack` plugin replaces bundled Slack transport in a dedicated profile. It is stacked
on the Discord isolation PR and uses the same [shared isolation core](channel-user-isolation.md).
It supports plain user messages and mentions in approved public/private channels, their threads and
allowlisted one-to-one DMs. Slack still displays channel replies to that channel’s members; session
isolation does not change channel membership. Different users in the same channel/thread have different sessions and
notes. One person's DM or private-channel context is unavailable in their public replies.

## Native trust and delivery

The adapter uses Slack Socket Mode and Web API, pinned to `@slack/socket-mode` 3.0.1 and
`@slack/web-api` 8.1.1. `auth.test` must match the configured workspace and bot user and identify a
bot token before the socket starts. Each event must belong to that app/workspace and include the
matching bot installation authorization. Bot echoes, message edits/deletions, hidden/subtype events,
Slack Connect, multiparty DMs and unknown workspaces/channels are not admitted.

Every admitted event gets fresh `conversations.info` metadata. A changed or unknown channel
visibility fails closed; no cached public classification can turn a private channel into public.
DM metadata must identify the approved native peer. Text claims never select another session.

Channel messages share context only with later messages from the same user in that conversation.
Threads have separate context without automatically loading their root or parent history. Replies
stay in the originating thread when the inbound message has a thread; a root-channel reply remains
in the channel. Only final text is sent, split at Unicode code-point boundaries, with unfurls disabled.
Model-supplied recipients, media and thread targets cannot redirect delivery.

## Member notes and governance

`rein_memory_read`, `rein_memory_remember` and `rein_memory_forget` are the same host-bound tools as
Discord. Notes are saved only on an explicit member request. Reads support one named note or bounded
cursor pages (at most five notes and a JSON result below 16 KiB). No tool accepts an owner/audience
selector. SQLite is outside the public workspace, with a private directory and a single-link 0600
file. Shared references are single-link regular files. Storage is not encrypted at rest; the trusted
operator can access it.

`@Nori !reset` and `@Nori !new`, sent as ordinary messages, start fresh context in the current scope while preserving
its notes. `@Nori !forget` deletes its notes and advances generation atomically. Natural-language forgetting
also aborts the active model turn; only the host sends the success/failure acknowledgement. Other
members, channels, threads and audiences are unaffected. Already-sent Slack messages and historical
host transcripts are not physically erased or copied into the new session.

Approved channels retain the existing Foundation identity, proposal, Board, vote and feedback tools,
including private Board channels. The backend still resolves native identity and current roles using
its authenticated ingress proof. The adapter does not grant a Contributor/Board role or bypass
channel restrictions. Backend workspace/channel enrollment must match this bot's configured team and
approved channels. DMs expose scoped memory and public-reference tools; governance and identity-link
tools remain on the explicitly enrolled organizational channels.

## Setup

1. Install the workspace dependencies and build the pinned upstream as described in [setup](setup.md).
2. Create a dedicated public reference workspace with reviewed AGENTS.md, SOUL.md, IDENTITY.md,
   TOOLS.md, HEARTBEAT.md, public USER.md and/or community-directory.json. Do not copy personal memory,
   runtime records, private ballots/funds or credentials. Disable bootstrap creation and native recall.
3. Adapt [the Slack example](../config/slack-isolated.example.json). All native IDs are synthetic
   placeholders. Set real app/workspace/bot and channel IDs, declare each channel's audience, use a
   private memory path, and supply both tokens only through the named environment variables.
4. In the Slack app, enable [Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/)
   and obtain an app-level token with `connections:write`. Install the bot in the approved workspace.
   Subscribe to `app_mention`, `message.channels`, `message.groups` and, when DMs are approved,
   `message.im`. Relevant bot scopes include `app_mentions:read`, `channels:history`, `groups:history`,
   `im:history`, `channels:read`, `groups:read`, `im:read` and `chat:write`. Invite the bot to approved
   channels, reinstall after scope changes, and follow the app's workspace approval requirements.
   [Slack message events](https://docs.slack.dev/reference/events/message/) and
   [auth.test](https://docs.slack.dev/reference/methods/auth.test/) document the native identity fields.
5. Disable bundled `slack` explicitly and enable `rein-slack`. `channels.slack` contains only `enabled`;
   the Rein plugin owns the native channel ID. Retain confined tools, disabled native memory/flush,
   disabled cross-agent access and the dedicated profile's supported settings. Only the host's empty
   `{ main: {} }` agent entry is allowed; alternate agent, runtime, account and binding overrides fail.
6. Keep `requireMention: true` in shared channels. Set false only in approved dedicated bot channels.
   `dmAllowFrom: []` disables DMs; add only approved native users when enabling them.
7. Configure the existing `rein-operations.foundationDb` block separately when using governance:
   backend URL/caller/credential and proposal confirmation key are environment-variable references;
   `workspaces` uses this exact Slack team and approved channel IDs, `proposalChannelIds` names the
   proposal channel and `boardChannelIds` names the Board channel. No backend/schema migration is needed.
   The example does not enable a backend or authorize real governance operations by itself.
8. Supply a model/provider and local Gateway authentication, validate the config, run the synthetic
   probes, then explicitly approve live rollout. This change does not switch a running bot.

Slack API/rate-limit or metadata errors drop that event rather than using unverifiable context.
Socket Mode reconnection is owned by the pinned SDK. Interactive buttons, native slash commands,
files/attachments, Slack Connect, multiparty DMs and live network/permission acceptance remain outside
this adapter's first transport. Those features must not bypass the shared scope boundary when added.

## Verification

```sh
npm run toolchain:pnpm -- test
npm run toolchain:pnpm -- run verify:discord-isolation
npm run toolchain:pnpm -- run verify:slack-isolation
```

The Slack probe uses production registration and transport admission, synthetic Socket Mode/Web API
edges, the real OpenClaw ingress/session/tool pipeline and deterministic localhost model/backend
servers. It checks actual model inputs and actual backend ingress tuples, including rejection of a
non-director's Board funds request. It never logs in to Slack or calls a real Foundation backend.
Live two-account, Slack network/reconnection, real permissions and production rollout are still
unverified. See the [verification record](slack-user-isolation-verification-2026-10-14.md).
