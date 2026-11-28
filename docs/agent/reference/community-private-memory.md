# Community private memory and retained-history migration

Status on 2026-11-17; owner: Codex; scope: SA-M0 private-memory boundary and #57 Community migration.
**Shared Gateway migration and real-channel acceptance are complete.** The owner lifted the hold;
PR #103 (`496b9d30eaa1`) is deployed. Both channels use the retained main Gateway, the Dashboard has
one entry, and Community has fresh `nori-community` state with isolated private memory. All Slack
state/capabilities and all old Discord local files were retained. The standalone Discord unit is
stopped/disabled. [Current evidence and recovery](../../archive/agent/shared-gateway-acceptance-2026-11-17.md).
No vendor source was changed. The dated standalone activation evidence below remains historical;
its original `main` owner and private plugin artifact paths do not describe the new live Community.

## Boundary and configuration

`configureCommunitySessionMemory` uses native memory-core with session transcripts, provider `none`
(FTS), no shared file roots, and `rememberAcrossConversations: false`. Native `sessions_search`
with the current canonical session key is the continuity path. Each DM uses the authenticated
account/channel/sender binding, and native sandbox session visibility remains `spawned`.
A session sandbox with `workspaceAccess: none` skips shared file memory flushes. Session transcript
persistence and permitted retrieval remain enabled.

Channel exclusions alone are insufficient: unclassified legacy sessions can bypass native dreaming
channel filters. The public Community seed and all ancestors are therefore owned by root and not
writable or replaceable by the Gateway identity. `verifyCommunityWorkspaceReadOnly` checks ownership,
access, symlinks, hardlinks and ancestor permissions before every Community-capable launcher start. Private
SQLite state remains writable in its agent profile. Synthetic native dreaming attempts against
unclassified private history were denied while the same sweep continued for main's writable workspace.
The public seed is not a duplicate private workspace; shared reusable skills remain channel-independent.

`configureExistingCommunity` retains the original Discord `main` database owner and public histories.
It provisions an immutable seed, skips bootstrap creation only in this standalone Community Gateway,
and uses an independent singleton model key throughout the native provider and router. All model
requests remain DeepSeek v4.1 Flash; no Qwen-first, attachment or threaded-reply acceptance is required
by the owner's November 16 scope. Native main-assistant tools/settings are not changed.

Approved limits: 6 admitted requests/user/minute; 30/conversation/minute; concurrency 2/user,
4/conversation, 8/Community; 2,000 model requests/day including retries. These are request limits,
not token or monetary quotas. 71 focused regressions passed, including admission, restart, concurrent processes,
retry reservation and fail-closed stale runs. Live configuration and model requests were verified;
a production saturation/flood test was not performed. Before the final auxiliary-index check,
17 actual model requests were recorded across 5 settled runs with no outstanding leases.

## Historical standalone activation and recovery — November 16

Base runtime revision: `66700d062db7208827a8763fa95575fd434003a0`; OpenClaw pin:
`4a11f89e840b2bb3eedcad2820ab25b8520905b6`. Activation succeeded at 19:30:15 UTC after
stopped-service backups and integrity checks under the updater lock. Only `nori-discord` restarted.
The original owner remains `main`. All 5 original windows and 388 original transcript-event identities
were present after activation and restart. No historical rows were reassigned or deleted.

Private deployment paths, with no credentials or runtime records committed:

- `runtime/discord-catalog-prod/`: preserved config, launcher, dedicated key file and read-only guard.
- `runtime/community-router-20261116/`: Discord-only plugin artifact based on the above runtime SHA;
  the router has only the static-health compatibility patch. The sibling operations source is retained
  for its imports; the live operations plugin still loads from its original path.
- `/var/lib/nori-community/workspace`: root-owned public seed, outside the service-writable home.
- `/home/ubuntu/nori-releases/community-before-20261116-third`: root-only stopped-profile backup.

The private launcher uses the canonical `https://www.rein-protocol.org` backend origin. The previous
bare origin returns 308, rejected by the existing transport's `redirect: error` policy; real directory
lookup recovered after correcting the origin. Authentication and transport policy were not weakened.

Two initial health-check cutovers automatically restored the previous configuration, preserving
state. Scoped quotas had rejected the authenticated updater's model-free `rein_status` call for
lacking a run lease. The narrow fix allows this static report only without a run ID; business tools
and stale model-run status calls still require admission. Focused regressions cover this boundary.

For future shared releases, preserve all runtime paths above and the independent root-owned seed.
The former standalone config loaded the Discord-only router artifact. Replace it with the normal
plugin only after the source fix is deployed and the same health and real-channel checks pass.
Rollback restores config/launcher and restarts Discord under the updater lock; do not restore an old
SQLite snapshot over newly accepted messages. The separate key can be disabled if rolling back its
routing. Coordinate with other deployments before taking the lock or restarting shared services.

## Acceptance evidence

The local native diagnostic passed: automatic current/retained transcript recall, reset/restart,
other-user/public-scope rejection, deleted-history exclusion, and denied shared-file promotion.
It deliberately exposes a limitation: `memory_search` can remain stale for synthetic legacy rotated
windows, while `sessions_search` finds both old windows and new active records. This is not semantic
embedding search acceptance. Planner fixtures passed including native vec0 metadata handling.

Real Discord, using the logged-in test administrator:

- A synthetic private preference was sent, then native text `/reset` acknowledged; the next turn
  called `sessions_search` with `sessionKey: current` and returned the correct test value.
- The public channel searched the same concept and found only its own request, not the DM value.
  A host-side check also found no test value in the public transcript or immutable seed.
- Public catalog lookup initially failed and then succeeded through the existing authorized tool
  after the canonical-origin correction: [directory recovery reply](https://discord.com/channels/1558049042494128219/1558050207734698056/1571972683594203247).
- Service restart followed by another acknowledged text reset and private recall succeeded;
  the response cited the original private input. Private test content/screenshots stay outside
  the repository. The legacy auxiliary keyword index initially reported a configuration mismatch;
  native `memory status --index --agent main` rebuilt it with provider `none`, valid identity,
  6 session sources, 43 chunks and no scan issues. A final real DM called `memory_search`
  and successfully found its own transcript after this rebuild. This does not enable embeddings.

Real Slack main regression: [request](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794857680158629)
and [reply](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794857693136129) show actual
`exec` of a read-only multiplication and result 1147. The reply was in the channel, not a thread.
The Slack/router/Web process IDs were unchanged by this work.

Limitations kept explicit: only one real Discord human account was available. Two distinct-human
DM isolation is covered synthetically, not claimed as live acceptance. Discord's application-command
reset timed out in this run; native text `/reset` succeeded. Initial model prose wrongly equated
absence of a memory-write tool with no persistence; seed guidance now distinguishes automatic
transcript retention, and actual reset recall is the evidence. The UI labels the routed `auto` alias
as a model fallback; observed transport remains the configured singleton Flash model.

## Shared Gateway migration remains blocked

`prepareCommunityState` is a read-only offline planner, never an apply tool. It requires a checkpointed
backup, checks schema/owner/integrity and persisted channel/account/conversation evidence, inventories
raw event storage and preserves unclassified rows in place. It does not rewrite ownership.

At this pin, public session-store upsert imports session entries, not raw events; session-catalog
history import is capped at 200 messages/512 KiB and rewrites assistant usage. `sessions.move` changes
worker placement; actor-owner assignment does not rename an agent database. SQLite ownership checks
reject a copied `main` database as `nori-community`. Thus full raw history, archives and related state
cannot yet be moved losslessly through supported extension interfaces.

For a lossless migration, the missing upstream seam would be versioned raw bundle export and atomic
import with explicit owner/key mapping, archive/event/actor/delivery references, conflict validation
and idempotent receipts. This finding remains valid, but the November 17 owner decision removes
lossless Discord import as a required migration gate.

The completed November 17 migration initialized fresh Discord agent state instead of importing its old history.
Discord history/data may be discarded when needed for consolidation; inventory and preserve its local
files where feasible. All Slack data, including histories, files and existing runtime state, must be
preserved. This exception does not permit resetting shared storage containing Slack data.
The existing retained-history planner remains read-only and activation remains disabled; it does not
implement the fresh-state path or authorize a cutover. The completed cutover prepared the scoped
Discord state/configuration changes, local-file backups and recovery, proved Slack data preservation,
and revalidated isolation and real-channel behavior in the shared topology.

The earlier draft-publication-only hold was subsequently lifted by the owner. The old standalone
profile remains on disk for recovery, but its service is disabled after successful shared acceptance.


## Unified Admin Dashboard acceptance

After the shared cutover, the owner requires one Nori management entry rather than Slack/Discord
entry buttons. The single-instance landing page and optional matched Dashboard configuration output
are implemented; main uses native “Nori · 主助手” display metadata. This is a presentation change,
not an agent-ID rename or history merge. Keep split navigation until the topology actually changes.
See [Dashboard configuration and checks](../../human/dashboard-zh.md). Live shared acceptance passed on November 17;
see the current evidence linked above.
