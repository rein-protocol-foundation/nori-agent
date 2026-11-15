# Nori product branding

Task: NORI-BRANDING; owner: Codex; reviewed November 14, 2026 (America/Los_Angeles).
Status: project-owned Router and host-guard copy implemented locally; native runtime branding blocked on an upstream extension. No product milestone advancement.

## Product naming boundary

Use **Nori** for user-facing product names, notices, navigation, loading states, buttons,
and runtime protection messages. Use **Nori Router** for the model-routing page.
Keep third-party provider names accurate. Preserve OpenClaw source attribution,
SDK imports, package names, executable/configuration paths, environment variables and
protocol identifiers: these are compatibility contracts, not display copy.
Do not replace strings in user messages, model responses, stored history, or upstream bundles.

Project-owned copy updated: `scripts/router-console.mjs`,
`plugins/rein-router/console/router.js`, `plugins/rein-host-guard/guard.mjs`.
Existing UI and lifecycle verification selectors follow the new names.
These source changes have not been published or deployed; the separately installed
host-guard runtime copy also needs its normal controlled installation.

## Native notice blocker and narrow upstream proposal

The pinned runtime's `extensions/slack/src/monitor/message-handler/prepare.ts`
constructs the allowlist denial directly at lines 484–502 and calls
`client.chat.postEphemeral`. This happens before normal dispatch. The configured
bot display name only changes the subject; the body still hardcodes OpenClaw and
an upstream documentation URL. Normal `message_sending` hooks do not cover this call.
A persona prompt or a normal reply rewrite therefore cannot fix this notice.

Propose a public, optional runtime presentation configuration, centrally resolved:
`productName`, `administratorLabel`, and `channelAccessHelpUrl` (proposed names,
not currently supported settings). Defaults preserve upstream behavior. Native
system-notice renderers and the native control UI should consume this configuration;
the first integration must cover the early Slack denial, including identity lookup
failure. Nori sets its product name and administrator label without replacing the
native channel, changing authorization, or mutating vendored code.

Intended English denial:

> Nori can’t reply here because this channel isn’t enabled for Nori. Ask a Nori administrator to enable replies in this channel.

A Nori help link can be added once a published support page exists. Do not invent a
live URL or conceal a native error by dropping the notice. Follow-up scope includes
native pairing, approval, permission/error notices, command/status output and native
control UI titles/help. A repository-wide text replacement is not an implementation.

Acceptance: default upstream behavior unchanged; configured Nori identity survives
lookup failure, reload and restart; names are escaped for Slack/HTML; invalid help
URLs are rejected; allowlist and recipient decisions are unchanged; ephemeral,
streaming, normal messages, attachments and actions retain native behavior. Verify
actual notice delivery in an explicitly authorized test channel before declaring
end-to-end branding complete. No upstream submission is made by this task.

## Current Slack reply coverage

Both authenticated user inventory and Nori's bot inventory returned the same 17
non-archived public/private channels, with no pagination remaining; Nori is a member
of all 17. This does not establish visibility into undisclosed private channels.
The existing reply allowlist had 16 entries. The authorized live change adds only
`nori-deployment`, with `enabled: true`, `requireMention: true`, `allowBots: false`.
Existing per-channel user restrictions and settings are preserved. No wildcard
admission of future channels is introduced. Private backup was made alongside the
runtime configuration; no private configuration or credentials are checked in.
Gateway logs confirmed hot reload and Slack Socket Mode reconnection on November 14
at 21:07 PST. This is configuration/transport verification, not a real-user reply test.

## Why documentation PR #84 deployed

`deploy/nori-webhook.py` accepts every merged PR targeting the configured `main`;
it has no changed-path filter. CI's path-based selection does not filter deployment.
Ordinary README/docs changes generally do not require restarting services, but
runtime-loaded workspace policies and skills may be Markdown and do need delivery.
A future deployment optimization should compare the complete deployed-to-target
revision range and skip only positively classified non-runtime documentation;
unknown paths fail toward deployment. No deployment policy change is made here.
