# Shared chat isolation core

Discord and Slack share `@rein-protocol/isolation-core`, a Nori-Agent-owned library under
`plugins/rein-isolation`. It contains no channel SDK or Foundation client. Channels authenticate native
transport events, validate their identifiers and audience, then hand a trusted normalized event to
one shared receiver. The library owns scope hashing, per-owner queues, model dispatch boundaries,
SQLite notes and pagination, generation changes, live tool checks and forget cancellation.

## Scope and compatibility

A scope includes the agent, canonical platform, bot account, verified bot, native workspace/guild,
conversation, audience and sender. Threads are separate conversations. Private channel scopes are
explicitly distinguished from DMs, even if a future provider reuses a conversation identifier.
Hashing uses structured tuples, so opaque provider IDs cannot collide through string concatenation.
Session keys and SQLite owner keys contain hashes rather than member names or email addresses.

Existing Discord v1 public-channel and DM ownership hashes and session keys remain unchanged. Its
bounded notes, generation counters, explicit reset/forget behavior and live capability checks are
reused rather than migrated or duplicated. Pre-isolation channel-shared history is never imported.
A community identity link does not merge native-platform sessions or private notes.

Public references can be shared. Member transcripts and notes stay with their verified owner,
conversation and audience. Private-channel messages retain their channel classification; a private
channel is never disguised as a DM to change routing. Slack Board/proposal tools keep their existing
backend authentication and role/channel checks. The shared library does not determine membership.

## Adapter contract

An adapter must:

1. Authenticate the connection and verify its bot/account/workspace identity before admitting events.
2. Validate native sender, channel, event and thread IDs. Never derive them from text, display names,
   email addresses, quoted authors, model arguments or a community-link claim.
3. Resolve current channel visibility from authoritative provider metadata. Normalize only the
   current sender's text; omit history, thread roots, parent sessions, quoted bodies and attachments.
4. Produce a frozen scoped owner with `createScopedOwner`, provide an event-ID validator and an
   explicit tool policy, then call the shared `createIsolatedReceiver`.
5. Bind memory tools to trusted version-2 host context and the live host-owned turn. Check platform,
   agent, account, native sender/channel, session key and memory generation at execution. The model
   receives no owner, audience, workspace or database-path selector.
6. Deliver only finalized text to the original immutable channel/thread. The shared receiver aborts
   a model-driven forget and suppresses old-context output; the transport sends only its host-owned
   acknowledgement. Deletion and generation advancement remain one SQLite transaction.
7. Apply the shared startup guard and channel-specific enrollment checks. Run native provider-input
   probes as well as unit tests before claiming the adapter works.

The first adapters each use one default bot account and the main embedded agent in a dedicated
profile. Several profiles may reuse the library and even one scoped store; platform/account/bot/
workspace namespaces remain separate. Simultaneous transports in a single Gateway are deliberately
rejected until tool ownership and all enabled profiles have a coordinated registration policy.
This does not require copying the isolation implementation for each channel.

## Adding Lark / Feishu

Implement a transport and adapter policy that verify the app/tenant and authenticated native user
and chat IDs. Map the canonical provider identifier (for example `feishu`), tenant, chat/thread,
visibility and sender to the existing normalized contract. Native `open_id`/`union_id`/`user_id`
selection must be explicit and consistent with that provider's trusted identity context; never guess
or silently join them. The shared library accepts opaque IDs and has no Slack/Discord ID regex.

Keep Feishu event-signature or connection verification, native ID validation, visibility lookup and
reply mechanics in that adapter. Reuse the existing session, memory, queue, reset/forget and tool
capability code. Tests already exercise a synthetic Feishu namespace against identical Slack and
Discord IDs; there is no Feishu transport or live Feishu acceptance in this change.
