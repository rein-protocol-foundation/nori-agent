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
