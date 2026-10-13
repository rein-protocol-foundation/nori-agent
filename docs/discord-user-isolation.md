# Isolated Discord sessions and member memory

This opt-in Rein-owned adapter replaces the bundled Discord transport in a **dedicated local
profile**. It implements the gap found in the [original audit](discord-session-privacy-audit-2026-10-13.md).
The upstream submodule is unchanged. The existing onboarding test profile is not automatically
migrated, deployed or expanded to other accounts.

## Boundary

An authenticated Discord bot Gateway event supplies the native guild, channel and sender IDs.
Before session recording or model dispatch, Rein hashes the version, agent, bot account, guild,
channel, public/private audience and sender into a scope. A persisted scope generation adds clean
reset semantics. Public sessions retain the `discord:channel` classification; DMs retain `direct`.
Public messages are never disguised as DMs. Community linking is independent: even unlinked native
senders receive distinct scopes.

| Input | Session and saved notes |
| --- | --- |
| Alice and Bob in one room | Separate |
| Alice public room and Alice DM | Separate in both directions |
| Alice in different rooms/threads/guilds | Separate |
| Same user, same conversation, later message | Same session until reset; own saved notes persist |
| Shared public course directory | Available as public reference data |

The adapter deliberately supplies no channel history, referenced message body, thread starter,
parent session, media attachment or cross-session transcript search to the model. A member may
explicitly type information into a public message; session isolation cannot make that message
private to the member. Discord itself still displays public messages to the channel's audience.

## Member memory

`rein_memory_read`, `rein_memory_remember` and `rein_memory_forget` use a private host-side SQLite
store outside the model-readable workspace. Every query includes the verified owner/conversation/
audience scope. No tool accepts another member's ID, an audience selector or a database path.
Tool factories require host context version 2 and recheck current invocation authority and session
generation at execution. A retained tool from a revoked or reset invocation cannot read or write.

Notes are saved only on an explicit member request. Read relevant notes through the tool; no shared
memory file or cross-conversation recall is used. This is a local Rein memory service, not a new
Foundation database table or a change to community identity permissions. The trusted host/operator
can access its storage; the model and other members cannot select another scope.

- `/reset` or `/new`: starts a clean session for this sender in this conversation; saved notes remain.
- `/forget`: deletes this scope's notes and starts a fresh session. Other users and this member's other
  conversations are unaffected. The forget tool can also remove one named note. Deletion and session
  generation advancement commit in one SQLite transaction; a failed write rolls both back and neither
  the command nor the tool reports success.
- Historical host transcripts and messages already sent to Discord are not erased by these commands.
  They are never imported into the new session; shared transcript recall is disabled.
- Each scope permits at most 50 notes of 2,000 characters. The directory must be private (0700), the
  SQLite file is 0600, and symlink databases are rejected. The store is not encrypted at rest.

## Configure a dedicated profile

1. Install workspace dependencies using `npm run toolchain:pnpm -- install` and build the pinned
   upstream as described in [setup](setup.md). This adapter pins discord.js 14.27.0 for bot Gateway
   lifecycle/reconnect and REST rate limiting; it does not automate user accounts.
2. Create a dedicated **public reference** workspace. Copy reviewed AGENTS.md, SOUL.md, IDENTITY.md,
   DISCORD_ONBOARDING.md and community-directory.json from this repository. Use
   [the shared USER template](../templates/community-user.example.md) as USER.md; never copy a personal
   USER.md or runtime state. Only the explicitly permitted public reference filenames may exist;
   no memory directories, symlinks or runtime/transcript files. Contents must also be reviewed as public.
3. Adapt [the isolated example](../config/discord-isolated.example.json) into an ignored local config.
   Replace all placeholder paths/IDs, supply a model/provider and local gateway authentication, and
   provide the bot token through the named environment variable and its native `botUserId` separately.
   The connected bot must match that ID before any message is admitted. The example is not a runnable
   production config and contains no credentials. Never store the token in the workspace.
   Allow the selected model-provider plugin if OpenClaw requires it; configure the Foundation backend
   separately for identity tools using its existing approved channel/caller setup.
4. Disable the bundled `discord` plugin explicitly; enable `rein-discord`, which owns the native
   `discord` channel ID. `channels.discord` contains only `enabled` in this adapter. Move guild/channel
   and optional user allowlists into the Rein plugin config; do not run both transports.
5. Keep the example's explicit tool allowlist, filesystem confinement, native memory/flush disabling,
   `skipBootstrap: true` and absence of alternate agent/account/binding overrides. This first adapter
   supports one default bot account and the main embedded OpenClaw agent in a dedicated profile.
   Unsupported configurations fail startup rather than falling back to shared native routing.
6. List exact guild/channel IDs. `userIds` restricts testing to named native users; when omitted, all
   native members sending in that configured guild/channel may use Nori with separate scopes.
   `dmAllowFrom: []` disables DMs. Add only approved native users to enable DM testing. Backend identity
   tools remain public-channel-only; this adapter does not relax backend enrollment or link checks.
7. `requireMention` defaults to true for public rooms. Mention the bot before messages or commands;
   private DMs do not need a mention. Set false only for an approved dedicated bot channel.

The startup guard rejects shared native memory, unsafe filesystem/session tool settings, expanded
tool allowlists, additional chat platforms, agent/account/binding overrides, alternate model runtimes,
extra skill directories and context-engine overrides. Review/restart the dedicated profile after
configuration changes. Group DMs, implicit thread discovery, slash interactions, administrative
commands, voice, reactions, automatic reminders and attachment handling are outside this adapter.
Configure a specific thread ID explicitly if it should be an isolated conversation.

## Verify

```sh
npm run toolchain:pnpm -- test
npm run toolchain:pnpm -- run verify:discord-isolation
npm run toolchain:pnpm -- run audit:discord-privacy -- <local-config.json>
```

The native integration probe requires a built upstream. It loads the production registration using
a test-only transport wrapper, executes the host-owned ingress and session/model pipeline, and sends
requests to a deterministic localhost OpenAI-compatible test provider. Real memory tool calls run
through OpenClaw's Tool Search dispatcher. It checks actual provider inputs, not a model's verbal
claim that it forgot something. Two synthetic senders, one room, a separate DM, reset and forget are
covered. No real Discord connection or Foundation backend call is made by this probe.

The config auditor recognizes a guarded Rein profile but retains `adapter_runtime_unverified`:
configuration inspection cannot establish that a transport loaded or two real accounts passed.
Native bundled Discord profiles still receive `guild_session_shared`. The old hardening fragment
alone does not provide this adapter's isolation.

## Real-account acceptance still pending

The owner deferred the second real Discord account to prioritize code. Do not describe the automated
two-sender probe as real two-account acceptance. Reuse one authorized QA channel; do not create a
channel per question or register additional accounts. With two working existing accounts, verify:

1. Alice shares a harmless test canary in the public QA channel; Bob asks about himself in that same
   channel. Inspect native session keys and actual model inputs: Bob must not receive Alice's context.
2. Alice explicitly saves a different canary in DM. Neither Bob's public replies nor Alice's own public
   replies may receive that DM transcript or note. Check tool results and model inputs as well as text.
3. Alice can retrieve her own public note after reset/restart; Bob cannot. Forgetting Alice's current
   notes starts clean context and leaves Bob's scope intact. Check concurrent turns and revoked tools.
4. Confirm backend link/status still uses the real current sender in the public QA channel, with no
   model-supplied actor or synthetic proof. Record redacted results and clean up test messages/state.

This feature is a stacked change based on onboarding PR #5. Production deployment and real-account
acceptance are separate from the code and synthetic native-pipeline verification delivered here.
