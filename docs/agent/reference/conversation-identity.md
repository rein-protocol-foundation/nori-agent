# Current conversation identity

`rein_member_status` reads only the host-authenticated Discord/Slack sender. It takes no actor,
email or role arguments. It is available in any explicitly enrolled `foundationDb.workspaces`
native channel, including ordinary community channels. Proposal, Board, funds and write tools
retain their separate channel and current-member checks. Isolated-adapter DMs remain outside
backend enrollment and do not gain organization tools from this change.

The response includes `linked`, `status`, current `isActiveContributor`/`isDirector`, `roles`
(`community_member`, optionally `contributor` and `director`), and nullable `profile` containing
`name`, `email`, `joinedAt`. Roles are advisory evidence, not permission to execute an arbitrary
tool: caller scopes, channel policy, tool availability and current backend authorization still apply.
Unavailable identity reads return an error, not an assertion that the sender is unlinked.
Revoked/expired links disclose no roles or profile. No canonical contact ID or proof is exposed.

Platform names come from the authenticated Discord author/member or Slack `users.info` response
for that exact sender/team. They are user-editable display labels, never organizational evidence.
Slack `users:read` is needed for names; missing scope or provider failure leaves names unavailable
without preventing chat. No platform profile email is fetched into model context. Discord message
author metadata supplies no email. The organizational email comes only from the linked backend
record. Do not repeat it into shared channels. Do not save profile data as durable authority.

## Backend and rollout

The companion Foundation change extends `POST /api/identity/resolve` with `profile`, after the
existing caller-scope and signed-ingress checks. It reads only the freshly resolved contact:
current `people.display_name`, otherwise non-deleted participant name; the one canonical email
identity when unique; and contact creation time. `joinedAt` means contact creation, not Contributor
promotion or Discord join time. Multiple email identities produce null rather than choosing one.
Deleted/missing contacts or failed profile reads produce null. No database migration is needed.
Older backends remain compatible but return no profile.

The identity endpoint also returns `is_administrator`, based on the website's
current administrator policy for the freshly bound canonical email. This field
is consumed privately by the restricted model router, independently of the
community/Contributor/Director roles shown by the tool. `adminSenders` is an
additional account allowlist, not a substitute for this backend check. Unbound
accounts must complete the existing binding flow; model routing never creates
an identity link or grants an administrator role.

Deploy the companion backend source in `rein-foundation-community-discovery`, then reload the
Rein plugin/workspace policy in each relevant gateway. In every native channel tool allowlist,
include `rein_member_status` alongside binding/catalog tools. `rein_status` describes implemented
capabilities and does not prove a tool survived the current channel's allowlist. A missing entry
was found and repaired in the two local main/Discord profile configurations; protected local
backups were retained. No backend deployment or real chat messages are performed by tests.

Acceptance after authorized rollout: ask the linked sender who they are in Discord and Slack;
verify the actual status tool trace, profile and role fields. Repeat with an unlinked sender,
a revoked link and an unenrolled channel; all restricted actions must remain refused. Use two
senders in one room to confirm profile/session separation. Public replies should omit email.

## Production endpoint checks

Use the canonical `https://www.rein-protocol.org` origin for `REIN_BACKEND_URL`.
The apex host now responds to API POST requests with a 308 redirect. The authenticated
transport deliberately uses `redirect: 'error'`, so an apex URL fails before identity
resolution; do not enable automatic credential-bearing redirects. Existing explicit
launcher overrides must be updated separately from the default.

Check server-level and channel-level tool policies, not just plugin registration. A
Discord guild `tools.allow` list must include `rein_member_status` for Nori to inspect
the sender's current verified organizational roles. Reading a catalog is not an identity
check, and a transport failure does not establish that a member needs to rebind.

### Runtime repair and verification — 2026-10-29

The live Discord gateway's guild allowlist omitted `rein_member_status`, and its
private launcher explicitly selected the redirecting apex origin. The repair added
the tool to the existing guild allowlist in both preserved gateway profiles and
changed the Discord launcher to `https://www.rein-protocol.org`. Protected rollback
copies were retained, the updater lock was held during configuration changes, and
only the Discord gateway was restarted. Its readiness probe returned HTTP 200.
These private runtime files are intentionally untracked; this record documents the
repair without copying credentials or member records into source control. The
launcher default in `scripts/backend-env.mjs` now uses the same canonical origin.
Deploying this default does not replace explicit overrides or repair existing tool
allowlists: operators must check both as described above.

Two existing QA Bots then sent real Discord messages mentioning Nori. Server
transcripts confirmed one successful `rein_member_status` call per turn, and the
replies were read back through the Discord API. Both Bots were unlinked; Nori
reported that state and rejected a claimed Contributor/Director standing as
unsupported by the backend. No binding or governance write tool was called.
Temporary `allowBots: "mentions"` admission was restored to its prior setting after
testing, and the four test messages were removed. Redacted results are recorded
here; raw test evidence remains in private, ignored runtime storage.

This verifies the real Bot conversation-to-backend path for unlinked accounts.
It does not establish a positive linked-role Bot conversation, revoked-account
acceptance, or cross-user privacy. A separate successful direct invocation of the
deployed identity tool is not a substitute for those conversation tests.
