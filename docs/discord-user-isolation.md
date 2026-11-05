# Withdrawn Discord isolation adapter

**The production `rein-discord` channel replacement is withdrawn. Do not enable it.**
The previous installation guide and example configuration have been removed. See the
[withdrawal, dependency review and replacement design](discord-isolation-redesign.md)
([中文](discord-isolation-redesign-zh.md)).

Production was rolled back to the reviewed native Discord profile on 2026-11-04
(America/Los_Angeles). Ask Nori's no-mention setting and the original workspace, tools and memory
settings were restored. PR #36 remains deployed. Old and isolated session/notes stores were retained,
not merged or deleted. Native guild sessions remain channel-shared; rollback is not an isolation fix.

## Retained regression material

PR #6 implemented sender/conversation/audience hashes, scoped SQLite notes and reset/forget controls.
PR #7 extracted shared primitives used by Slack. Those boundaries and synthetic router fixtures
remain testable, but their production transport-replacement design did not preserve native Discord
capabilities or the intended memory experience. Matching the `discord` channel ID was insufficient.

`plugins/rein-discord/index.ts` now refuses registration with a withdrawal diagnostic, before claiming
a channel or registering tools. It has no bot login or REST transport. Historical registration exists
only in `tests/fixtures/register-legacy-discord.mjs`, with a required injected synthetic transport.
`verify:discord-isolation` remains a historical Gateway/provider regression probe. It does not load a
supported production adapter or establish real-account acceptance.

The old profile used one mention switch, a restricted public workspace and explicit owner-scoped
named notes. It disabled native recall/automatic memory flush and excluded channel history, quoted
bodies and media. Those restrictions are historical implementation choices, not replacement requirements.
The new design must preserve useful native behavior and automatic personal memory while enforcing
ownership and provenance throughout the history and memory pipelines.
