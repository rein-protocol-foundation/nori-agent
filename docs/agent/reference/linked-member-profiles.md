# Linked community profiles across Discord and Slack

Task: COMMUNITY-PROFILE-LINK; owner: Codex; date: 2026-11-19.

The optional member-introduction plugin can reuse existing `rein-operations.agentProfiles`
for current-sender recognition. A Discord account and Slack account linked through the
existing community email flow resolve to the same canonical contact. No nickname or
email text matching is performed. No new binding, identity merge, role grant, database
credential, or private-history migration is involved.

## Read boundary

`rein_my_introduction` still takes no arguments. In linked mode, the host selects the
agent, platform, bot account, native channel and sender. The existing per-profile backend
runtime mints its signed ingress proof using its own enrolled caller; Community and internal
credentials remain separate. Only already-enrolled channels (and explicitly configured
sender-scoped Discord DMs) may resolve linked profiles. Unenrolled Discord rooms retain the
original same-account, same-guild public introduction reader.

The companion Foundation endpoint `POST /api/identity/linked-accounts` accepts only a proof,
uses `identity.resolve` scope and returns the freshly resolved self profile and current
organization-managed platform links. The plugin keeps canonical contact IDs, proofs and
account-list metadata out of model results. It exposes only the community name/joined date,
a linked flag and the relevant introduction evidence. The new endpoint does not return email.
Existing restricted tools still perform their own current authorization checks.

Only verified Discord links in the configured source guild can select archived introductions.
The plugin verifies the current guild member, public source-channel visibility, source member
permissions, original message author and current message content. Removed members, deleted
messages and inaccessible sources cannot supply stale archive text. It checks the current
binding again after provider reads, refusing a concurrent revoke/rebind. There is no persistent
canonical-contact cache to survive an unlink or contaminate a later person.

Introduction content and profile labels are data, not instructions or authority. Account
binding verifies the association, not claims in a biography. Discord/Slack private session
history remains isolated. Both accounts must complete the existing binding flow to the same
community record; merely putting the same email in a message does not work. After binding,
the next lookup sees the association without a collector run or historical rewrite. Public
introductions still follow the existing daily collection cadence.

## Enable and rollback

Deploy the companion Foundation endpoint first, then Nori. The existing onboarding archive,
cron schedule and data stay unchanged. Use the pure additive builder:

```js
configureLinkedMemberProfiles(current, { agentIds: ['nori-community', 'main'] })
```

It sets `rein-member-introductions.config.linkedProfiles` and adds the existing optional tool
only to the selected agent/enrolled native-channel policies. It does not enroll workspaces,
change backend caller scopes, alter sandbox modes, enable shell tools or merge memories.
Validate the candidate with the native OpenClaw config validator, back up private configuration
and take the updater lock before replacing it and restarting the shared Gateway. Compare all
existing cron definitions and retained database state after activation.

Rollback removes `linkedProfiles` from the addon configuration and restores only the tool-policy
changes from the saved candidate diff. This restores original same-Discord-account recognition;
do not restore an old SQLite archive over newly collected introductions. Disabling the entire
plugin remains supported. An older/missing backend endpoint fails closed in linked mode.

## Evidence boundary

Synthetic checks cover the native backend proof wrapper, Slack-to-Discord and Discord
cross-channel recognition, actor spoofing, profiles/accounts/workspaces, concurrent identities,
revocation/rebind, deleted/edited sources, public/member-specific visibility, malformed backend
responses and redaction. Existing same-account recall, backend proof and transport tests remain
part of regression coverage. Native plugin loading covers both legacy and linked configuration.
Production activation and real two-human conversations are separate acceptance evidence; unit
tests and service health alone do not prove model tool selection or real-user recognition.
