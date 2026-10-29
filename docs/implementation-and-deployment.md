# Rein Agent development, verification and deployment record

English | [简体中文](implementation-and-deployment-zh.md)

## Current backend configuration (2026-10-26)

Nori connects to `https://rein-protocol.org` by default. `REIN_BACKEND_URL` is resolved in this order:
the launching process environment, this repository's `.env.local`, then the online default.
Override it with a local or DEV backend address only for explicitly isolated development.
An explicitly empty value does not fall back to the online address; it remains an invalid configuration.

The caller ID and credential must be registered in the environment used by the target backend.
Changing the URL does not migrate a DEV caller or grant Production access. The backend's
`DATABASE_ENVIRONMENT` and other deployment settings select `dev_*` or `prod_*`; the Agent cannot
arbitrarily switch them through a URL or its own database environment variables.
Using the online API by default does not authorize test writes to production data or establish
production end-to-end acceptance.

See [setup](setup.md#optional-enable-backend-backed-tools) for the current complete configuration
and tool inventory. Current `foundationDb` mode retains `rein_status` and registers 19 backend
tools (12 governance, 3 identity binding, 4 community queries). Counts of 14 in the historical
acceptance tables describe the recorded build, not the current registration expectation.

Maintain the English and Chinese versions together. The delivery scope, tool counts, PR status and
acceptance figures below retain the dates and scope of the original historical records; they are
not live statements about the current online deployment. This section and the startup instructions
below describe the current connection configuration.

## Delivery boundary

Rein Agent continues to use official OpenClaw source as its runtime. Business code belongs only in
`plugins/rein-operations/`. This delivery is a **repeatably verifiable local business core and
development rehearsal**, not an NGO production system connected to real members and funds.

**Architecture from 2026-09-30: a cross-channel backend.** The implementation is **not limited to
one Slack workspace**. `foundationDb.workspaces` registers workspaces by platform and can include
both Slack and Discord. The Agent selects exactly one workspace from the host's trusted
`messageChannel` and native channel ID, so one deployment can serve multiple platforms without
mixing identities. The interface remains Slack-first; Discord is a second platform using the same
mechanism. Members, directors and available funds remain authoritative in the **organization's
database**, but **the Agent no longer accesses it**. All governance reads, writes, identity
resolution and identity linking go through an authenticated **backend service API**. The interface
contract is in place: endpoints, operation names and result shapes in `docs/integration-contracts.md`,
with corresponding plugin transport and adapter modules. At the time of this architecture record,
no real backend, Slack workspace or Discord workspace was connected, and the backend path had not
been verified in production.

**Confirmed and unresolved policy.** Confirmed: approval-only voting, no opposition option,
abstention contributes no approvals, candidate limits and per-voter approval limits are configured
by type, the highest approval count wins, universal abstention produces no winner, and a tie for
the highest count produces no official winner. Still unresolved: weighted voting and director
weights, the source and synchronization of the authoritative member registry, the source and owner
of available funds, retention periods, and exception owners. Website publishing remains a later
phase: the website API contract exists, but its publishing connector is not connected or deployed.
Specific limits and the tie policy still need registration. `config/operations.example.json`
remains unapproved; blank values are not authorization.

**Historical P0 direction, confirmed 2026-09-24 and superseded by the cross-channel architecture.**
The original direction made Slack the only P0 chat platform and required an explicit link from a
Slack account to a community record. That accurately described the decision at the time. The
implementation subsequently expanded to multiple platform-specific workspaces using the same
mechanism for Slack and Discord. “Slack only” is retained as history, not as a description of
current code.

**Historical evidence from 2026-09-24 through 2026-09-28 concerns the earlier direct-database build
and does not establish production acceptance.** Synthetic rehearsals used real providers: tools
sent and received messages in a real test Slack workspace with synthetic identities and two
approved test channels, and read and wrote synthetic fixture rows in a real Supabase project's
linked `dev_*` tables. `prod_*` business rows stayed at zero. Direct database access belongs to the
implementation before the 2026-09-30 change; the tool names, configuration keys and paths in that
evidence describe the old build, not the current Agent. No real member registry, funding/payment
provider or website was connected, no `prod_*` business writes or production deployment were
performed, and there was no production end-to-end evidence.

The two base migrations were committed on the sibling repository's PR #13 branch (recorded head
`78281fa`, originally committed in `4bd5ce8`) and applied in filename order to the linked
`BeneficenceProtocol` project, ref `ksgyfyysnojqrwfuyqwe`. A read-only
`supabase migration list --linked` check on 2026-09-27 showed both versions applied. Each migration
defines both `dev_*` and `prod_*` objects in one transaction, and migration history is project-wide:
the applied schema covers both prefixes. `DATABASE_ENVIRONMENT=dev` selects the application's
default table set; it does not mean only DEV objects exist.

The third migration, `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`, was committed in the
sibling repository at `32977bfb` and applied to the linked project. A 2026-09-28 read-only check
confirmed its version and both clock functions. Ballot `cast_at` therefore uses the database clock.
That commit's local pgTAP suite passed 187/187 twice in an isolated container. The same check
confirmed the fourth migration, `20260927110000_rein_governance_names.sql`, with all ten renamed
physical tables present. Its transitional compatibility views and RPC wrappers were later removed
by the applied `20260929045543_remove_stage_compatibility_objects.sql` migration. These were applied
schemas used only in rehearsals: tools read and wrote synthetic DEV data, while PROD had schema but
no business activity. The historical record does not establish live end-to-end verification of the
renamed interfaces or production. Local SQL and automated tests are distinguished below from real
Slack and production acceptance.

The business core in the recorded PR covers deterministic proposal, identity-eligibility, vote
counting and funding-competition rules. `ledger.ts` provides atomic snapshots, idempotent operation
receipts and audit records for local rehearsals. External channels, payments and website publishing
are not connected. The OpenClaw plugin registers status, proposal simulation and vote simulation
tools by default. Four proposal tools register only with explicit configuration and derive account
identity only from trusted host context. Activity, change, oversight, external delivery and the
governance persistence/tool-bridge modules were split into later PR work and were unreachable in
that runtime. Self-declared membership in tool arguments is never authenticated identity.

The recorded v0.1 slice implements 14 tools that register **only with an explicit `foundationDb`
block**: reads `rein_member_status`, `rein_funds`, `rein_poll_candidates` and
`rein_vote_type_resolve` (`governance-read-tools.ts`, `vote-type-resolve.ts`); read-only field
collection `rein_proposal_collect` (`proposal-collect-tools.ts`); writes
`rein_governance_proposal_submit`, `rein_poll_open`, `rein_poll_vote` and `rein_poll_result`
(`governance-write-tools.ts`); result feedback `rein_proposal_comment_suggest`,
`rein_revision_approve` and `rein_revision_apply` (`proposal-feedback-tools.ts`); and identity linking
`rein_identity_bind_start` and `rein_identity_bind_complete` (`identity-tools.ts`). Enabling
`foundationDb` hides the simulators and legacy proposal tools; otherwise they remain available.

Under the **2026-09-30 architecture change**, these tools no longer access the database directly.
They use the authenticated backend through `backend-transport.ts`, `backend-db-adapter.ts`,
`backend-config.ts`, `ingress-proof.ts` and `backend-runtime.ts`. The Agent holds no database
credential; `foundation-db-reader.ts` and `foundation-db-writer.ts` retain only result types. The
architecture record had no live evidence for this change: earlier direct-database rehearsals used
the pre-rename build, PROD business rows stayed at zero, and the renamed interfaces and backend path
had not been run end to end in a real environment. The applied rename migration means the backend
schema already has `<env>_rein_*`, `<env>_rein_finalize_poll` and `<env>_rein_approve_revision`.

| Code | Implemented | Integration still needed |
| --- | --- | --- |
| `proposals.ts` | Authoritative member records and account links, Contributor eligibility, proposal versions and confirmation, completeness checks, explicitly authorized zero-budget path, funding routing | Real member registry and trusted platform requester |
| `proposal-store.ts` | Transactional proposal state in the local ledger, restart recovery, idempotent receipts and rejection of stale-version writes | Production database, registry synchronization, backups and migrations |
| `proposal-tool-bridge.ts` | Optional OpenClaw v2 creation, revision, confirmation and submission tools; trusted host sender/channel only, with call-validity recheck before writing | Approved platform/channels, authoritative registry synchronization and real-chat acceptance |
| `governance.ts` | Frozen rounds, eligibility and deadlines, ballot replacement/recusal/counting, budget competition and pending allocation | Formal voting entry point, approved tally rules and authoritative available funds |
| `ledger.ts` | Single-file transactions, idempotent receipts and local audit for rehearsal store ports | Production database, backups, migrations and access control |
| `request-context.ts` | Account binding from trusted OpenClaw sender/channel context; refusal without configured platform/channels; final pre-write validity check and Contributor lookup reflecting registry revocations | Selected platform, member registry and business-tool binding |
| `index.ts` | Default `rein_status`, `rein_simulate_proposal`, `rein_simulate_vote`; four proposal tools with explicit configuration; `foundationDb` switches to 14 backend tools (4 reads + 1 read-only collector + 4 writes + 3 feedback + 2 identity links), hiding simulators and legacy proposal tools | Complete activity, outcome, publishing and oversight tools |
| `foundation-db-reader.ts` / `governance-read-tools.ts` | Read-only identity links and funds snapshots through `rein_member_status` and `rein_funds` | Real database connection and reviewed migrations |
| `foundation-db-writer.ts` / `governance-write-tools.ts` | Proposal submission, poll opening, voting and result tools; writes to `<env>_rein_proposals`, `<env>_rein_polls`, `<env>_rein_ballots`; type limits from `<env>_rein_vote_types` | Real database connection including the applied rename; no payment or reservation |
| `proposal-feedback-tools.ts`, with `foundation-db-writer.ts` and `proposal-revision-rules.ts` | Post-result comments/revision suggestions, current-director approval of material revisions, and application of recorded revisions; `<env>_rein_proposal_revisions` and `<env>_rein_approve_revision` | Real database connection including the rename and real Slack acceptance; no payment or reservation |

PRD R08 gained an operational boundary: a proposal marked “zero requested amount” that still asks
for reimbursement must supply the amount before Board selection; it cannot take the zero-budget
shortcut. This clarification is in both PRD languages. The rule that an activity owner confirms
article facts using server-provided Contributor eligibility moved with the activity core to a later
PR; its requirements remain in the PRD and acceptance matrix as future scope.

The activity core's deterministic boundaries are **outside the recorded PR**: completing a task
cancels follow-up reminders; reminder delivery requires `timezone_required`; each activity has at
most one canonical article and a separate `post_article_link` backlink intent; amount adjustments
are audited with `finance.approve_adjust`; unresolved overspend must recover in the fixed order
“authorize a higher limit (`finance.approve`) → add reservation (`finance.reserve`) → record payment
→ settle.” These rules moved with `activities.ts` to later work and are unreachable in the recorded
runtime. They remain future requirements in the PRD and [P0 acceptance matrix](p0-acceptance-matrix.md).

## P0 v0.1 vertical slice: scope and status

The confirmed v0.1 has four steps: Slack identity link → simple Contributor proposal → Board
approval-only poll and result → read-only funds snapshot. See the [decision register](decisions.md)
and [PRD §2.3](PRD-agent-community-operations.md) for scope and deferrals. Eligible directors have
equal weight, each type sets the approval limit per voter, and the highest approval count wins.
There is no opposition option, and abstention contributes no approvals. **Universal abstention
produces no winner. A top-count tie produces no official winner and must not be broken arbitrarily;
the tie policy remains unresolved.** Passing a vote records a decision; it does not move funds.

| v0.1 step | Recorded code | Still missing |
| --- | --- | --- |
| Slack identity link | `request-context.ts` and read-only `foundation-db-reader.ts`; tests in `tests/foundation-db-reader.test.mjs` and `tests/foundation-db-gateway.test.mjs`; the old `registry-snapshot.ts` path was unreachable and moved to later work | Real member registry and production acceptance. Synthetic link reads were rehearsed in the test workspace and linked DEV tables; the identity migration was committed on sibling PR #13 (recorded head `78281fa`) and applied |
| Contributor proposal | `proposals.ts`, `proposal-store.ts`, optional four-tool proposal bridge, and v0.1 `rein_governance_proposal_submit` in `governance-write-tools.ts` | Slack conversation integration and an authoritative active-Contributor source |
| Board approval poll and result | `rein_poll_open`, `rein_poll_vote`, `rein_poll_result`; persistence in `foundation-db-writer.ts`, equal-weight tally in `vote-tally.ts`. Opening assembles candidates from the stored type limits, including previously unselected proposals. Voting accepts only `approvedProposalIds`, enforces `maxApprovalsPerVoter`, and treats an empty array as abstention. `<env>_rein_finalize_poll` persists results after closing. The old weighted `governance.ts` model remains unregistered | Specific type limits, approved voter list and tie policy. Synthetic rehearsals passed on the real test workspace and DEV tables before the rename, but the recorded PR head had no real Slack rerun after renaming and no production acceptance |
| Read-only funds snapshot | `backend-db-adapter.ts` calls backend `available_funds`; `governance-read-tools.ts` exposes `rein_funds` in approved Board channels | Real funding/provider data, member registry and production acceptance. Snapshot schema was committed on sibling PR #13 (recorded head `78281fa`) and applied, but no tool had read it through the backend path at that point |
| Post-result feedback and revisions (C15/D10/D11) | `rein_proposal_comment_suggest`, `rein_revision_approve`, `rein_revision_apply`; `<env>_rein_proposal_revisions` and `<env>_rein_approve_revision`. Title/summary-only revisions can be accepted and applied by the Agent. Material budget/location/schedule/personnel/main-flow revisions return `revision_not_approved` until current-director approval is recorded | Real database connection including the rename and real Slack acceptance; whether active Contributors may author feedback remained unresolved (the database allows it, registered tools require a current director) |

With `foundationDb` enabled, the recorded 14 backend tools comprise four reads
(`rein_member_status`, `rein_funds`, `rein_poll_candidates`, `rein_vote_type_resolve`), one read-only
collector (`rein_proposal_collect`), four writes (`rein_governance_proposal_submit`, `rein_poll_open`,
`rein_poll_vote`, `rein_poll_result`), three feedback tools (`rein_proposal_comment_suggest`,
`rein_revision_approve`, `rein_revision_apply`) and two identity tools (`rein_identity_bind_start`,
`rein_identity_bind_complete`). Simulators and legacy proposal tools are hidden. Without explicit
enablement, no backend tools register. **The Agent holds no database credential and does not access
PostgREST** after the 2026-09-30 change: every operation is an authenticated call to the backend named
by `foundationDb.backendApiBaseUrlEnvVar`, with proof derived from host context for the tool call.
It does not proactively send Slack messages or echo credentials, backend addresses, workspace IDs
or private contact identifiers.

**Post-result revision rules (C15/D10/D11) have distinct boundaries.** Revisions changing only a
**title or summary** are ordinary: the Agent may accept reasonable suggestions and apply them in
the caller's turn through `rein_revision_apply`, with no separate Board approval or second approval
RPC. Changes to **budget, location, schedule, personnel or the main activity flow** are material.
Until a current director's approval is recorded through `rein_revision_approve` and
`<env>_rein_approve_revision`, the write layer and database triggers reject application with
`revision_not_approved`. `schedule` is a material field, so changing a committed date or time takes
this approval path. All three feedback tools require an approved Board channel and a sender whose
own community record currently identifies them as a director. The database additionally permits
an **active Contributor** as `author_contact_id`; registered tools do not expose that broader
permission. Comments record text without changing proposal versions. No revision moves, reserves
or pays funds.

**The Agent assembles candidates, but a person opens the poll.** A current director in an approved
Board channel invokes `rein_poll_open` by **vote type**. The tool reads that type's `max_candidates`
and uses `listCandidateProposals` to assemble same-type `submitted` and `unselected` proposals,
prioritizing recent unselected proposals for reconsideration. The database freezes the candidate
list and both limits. Callers cannot supply candidate lists, limits or option names: `options`,
`candidateIds` and `maxApprovalsPerVoter` are rejected with `policy_argument_rejected`; `options`
also yields `legacy_options_unsupported` at the write layer. Thus C14/D08's “recent proposals plus
previously unselected proposals” and per-type candidate limits have a registered code path.

Two items remain open: **actual candidate and approval limit values** are operational configuration
to be seeded into `<env>_rein_vote_types` (the Events example of 10 is illustrative, not a global
policy); and **there is no automatic poll-opening entry point triggered by a proposal**. A director
chooses a type to start a round. Proposals and polls have no foreign-key relationship, and
`rein_governance_proposal_submit` and `rein_poll_open` remain separate writes.

**Before the deadline, results are provisional.** `rein_poll_result` reports `closed = false`,
`status = 'provisional'` and `official = false`, without counts or a winner. After closing,
`<env>_rein_finalize_poll` counts accepted stored ballots and persists the result. Eligibility is
not recalculated against today's registry, and rejected ballots never enter the database.
**Results return only to the current call; they are not automatically posted to Slack.**

**Keep the two result boundaries separate.** The database determines closure at the deadline, not
the caller. Before then, `rein_poll_result` returns `status = 'provisional'`, `ok = false`,
`official = false` and readable facts (`closed = false`, `closesAt`, stored ballot count), but
**no tally or winner**. At the deadline, the tool calls `<env>_rein_finalize_poll` to close and persist
the round. Universal abstention persists `outcome = 'no_winner'`, `winner = null`. A top-approval tie
also persists those values, while `approvals` preserves each candidate's count for Board review.
The tie policy is **unconfirmed**: do not announce this as formal organizational policy or break
the tie without authorization.

**Replay protection is limited.** When the runtime creates tool context for a conversation turn,
it generates and memoizes a random UUID for each `(toolCallId, action)` pair. Retrying `execute`
**within the same turn** reaches the same row and is reported as an exact duplicate, but memoization
does not cross contexts. A tool-call ID is not a trusted inbound message ID: Slack redelivery or a
retry in a new turn generates another ID and can create another record. Cross-process exactly-once
behavior requires a trusted host event ID and was not established by this record.

The historical single-workspace model fixed one Slack workspace per deployment. Within channel
policy, channel/group messages and DMs both supplied trusted per-message `requesterSenderId`;
channel messages were not weaker identity evidence. The v2 tool context lacked a Slack team/workspace
ID, so configuration had to fix the team. Pointing that model at multiple workspaces could map a
sender to the wrong community record.

Weighted voting, participation thresholds/quorum, recusal, budget competition/ranking, payment and
settlement, activity spaces/reminders, outcomes/articles, website publishing, oversight/weekly
reports, a second platform and on-chain migration remained deferred in the recorded slice, with
their local modules unregistered. Deferred units must not be described as part of that v0.1 slice.

## v0.1 backend deployment runbook (authenticated backend service)

These steps connect the slice to **one authenticated backend service** and an isolated database,
registering each workspace separately for Slack, Discord or both.

> **Architecture change, 2026-09-30.** The Agent no longer holds database credentials or accesses
> tables directly. Governance reads/writes, identity resolution and linking use backend endpoints
> `/api/agent/operations`, `/api/identity/resolve`, `/api/ingress/relay` and `/api/identity/link/*`.
> **The old instruction to give the Agent a Supabase URL and service key is superseded.** Former
> executable steps 3, 4 and 6 were rewritten for the new architecture. Earlier migration records
> remain historical evidence, not current operating instructions. Each step requires human execution
> and review; the runtime Agent does not create tables, seed records, create apps or write credentials.
> Do not target production data before completing the prerequisites, and never commit real member
> information or credentials.

1. **Prepare the official chat plugin and connection mode.** Use the official `slack` plugin bundled
   with the pinned `vendor/openclaw` commit in Socket Mode, which needs no public callback URL.
   Create a Slack app, enable Socket Mode, install it in the approved workspace, and invite the bot
   to approved proposal and Board channels. `mode: socket` requires bot and app-level tokens; a
   signing secret is needed only for HTTP mode. **The Agent does not read profile emails.** D13's
   earlier `users:read`, `users:read.email` and `slackBotTokenEnvVar` are no longer needed; do not
   install those scopes for this purpose. Add Discord as a separate workspace entry rather than
   replacing the existing workspace.
2. **Store only server environment references in configuration.** The Agent names four variables:
   backend base URL, registered caller ID, Agent credential and the proposal-confirmation signing
   key used by writes. Inject values through server environment variables or the runtime's secret
   store. Configuration contains names only. Never commit tokens, signing keys or workspace IDs;
   `scripts/check.mjs` also rejects JWT-like or `sb_secret_` literals in plugin files. Workspace IDs
   are not secrets, but still belong in deployment configuration rather than tracked files.
3. **Backend operators apply database migrations.** The database belongs to the backend. The Agent
   neither connects to it nor holds a service key. The first two sibling-repository migrations were
   applied in filename order to linked `BeneficenceProtocol`, project ref `ksgyfyysnojqrwfuyqwe`.
   Both appeared in the 2026-09-27 read-only `supabase migration list --linked` check. Each creates
   both DEV and PROD objects in one transaction; the second explicitly loops over
   `array['dev_', 'prod_']`. The third and fourth migrations were also applied. For another
   environment, review and apply them in the same order:
   - `20260924094436_rein_slack_identity_and_fund_snapshots.sql`: identity links and append-only
     available-funds snapshots.
   - `20260924095705_rein_mvp_proposals_polls_ballots.sql`: proposals, polls, ballots, vote types with
     `max_candidates` and `max_approvals_per_voter`, revision records and `effective_revision_id`,
     plus triggers/RPCs to freeze candidates, validate current-director ballots, tally results and
     approve material revisions. This migration originally used stage-prefixed names, renamed by
     the forward migration below.
   - `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`: sets `NEW.cast_at := now()` before checking
     the voting window for both DEV and PROD ballot triggers. It was committed in the sibling
     repository and **applied to the linked project**; the 2026-09-28 check confirmed the version and
     both clock functions.
   - `20260927110000_rein_governance_names.sql`: renames five physical tables and two RPCs to
     `<env>_rein_vote_types`, `<env>_rein_proposals`, `<env>_rein_polls`, `<env>_rein_ballots`,
     `<env>_rein_proposal_revisions`, `<env>_rein_finalize_poll` and `<env>_rein_approve_revision`.
     It was **committed in PR #13 and applied to the linked project**; the 2026-09-28 check found its
     version and all ten renamed physical tables. It follows `20260927103000` in the correct order.
     Transitional views and wrappers were later removed by the applied
     `20260929045543_remove_stage_compatibility_objects.sql`. Applied names alone do not establish
     live end-to-end Agent verification.

   The first two migrations were committed on sibling PR #13 (recorded head `78281fa`, original
   commit `4bd5ce8`) and applied to both prefixes. **Applied and rehearsed does not mean in production.**
   Synthetic tools read and wrote linked DEV fixture rows; PROD business rows stayed at zero.
   PROD business data, real member/funds data and production end-to-end behavior remained
   unverified. Writing real PROD data requires a separate decision. The third and fourth migrations
   made database-clock rules and stable names active; the fifth migration removed compatibility
   objects. None of this proves the tools worked end to end. Migrations contain no candidate/approval
   policy defaults: operators seed `<env>_rein_vote_types`, and RPCs calculate results from stored
   ballots at the deadline.
4. **Backend operators also seed records.** Through reviewed backend administration paths, populate
   canonical contacts, Contributor `active` status, director `person_type`, the first available-funds
   snapshot, and each type's `max_candidates`/`max_approvals_per_voter` in `<env>_rein_vote_types`.
   **Authoritative identity is the backend's canonical verified binding**, allowing multiple bindings
   per contact, not email matching. The Agent does not create these records, expose registration
   tools or read emails. Limits require organizational approval; do not insert fictitious people
   into a real environment. Seed stable names only: compatibility views have been removed.
5. **Register approved workspace and channel IDs.** Each `foundationDb.workspaces` entry contains
   `platform` (for example `slack` or `discord`), `workspaceId` and `nativeChannelIds`. Every
   `proposalChannelIds` and `boardChannelIds` value must belong to a workspace entry. Tools select
   **exactly one** workspace from trusted `messageChannel` and channel ID, allowing multiple
   workspaces without identity mixing. The legacy single-platform `platform` default is optional;
   otherwise the workspace list determines platforms.
6. **Explicitly enable `foundationDb`.** In `runtime/openclaw/openclaw.json`, add it under
   `plugins.entries.rein-operations.config`: `enabled: true`, optional `platform`, `workspaces`,
   `proposalChannelIds`, `boardChannelIds`, optional `voteTypeAliases`, and environment variable
   names `backendApiBaseUrlEnvVar`, `agentCallerIdEnvVar`, `agentCredentialEnvVar`. Writes also need
   `proposalConfirmationKeyEnvVar`. Store names, never values. **Legacy fields `slackTeamId`,
   `environment`, `supabaseUrlEnvVar`, `supabaseServiceKeyEnvVar`, `identityEmailMatch` and
   `slackBotTokenEnvVar` are rejected, not used as fallbacks.** Without `enabled: true`, the
   19 backend tools do not register.
7. **Verify before connecting.** Run `npm run toolchain:pnpm -- run check`,
   `npm run toolchain:pnpm -- test` and `npm run toolchain:pnpm -- run verify:plugin`, then
   `npm run toolchain:pnpm -- openclaw plugins doctor` and
   `npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json`.
   Confirm `rein_status` and all 19 backend tools in the [current inventory](setup.md#5-inspect-the-plugin),
   with simulators and local proposal tools hidden. Rehearse
   the ten synthetic cases in `docs/agent-test-cases-zh.md`, retaining sender IDs, tool-call IDs
   and backend records.

**There are no automatic payments.** A passed vote records a decision; it does not reserve or pay
funds or change a funds snapshot. Authorized people handle payments, reimbursement and settlement
outside the Agent. Budget competition and allocation amounts are outside v0.1.

## Deployment and local isolated runs

Backend settings can be stored in this repository's Git-ignored `.env.local` with mode `0600`:
`REIN_BACKEND_URL`, `REIN_AGENT_CALLER_ID`, `REIN_AGENT_CREDENTIAL` and
`REIN_PROPOSAL_CONFIRMATION_KEY`. Starting through `npm run toolchain:pnpm -- openclaw ...` loads
only these four variables, with existing process environment values taking precedence. Other
account credentials in the file are not injected. Custom variable names must still be supplied
by the launching environment. Restart an already running Gateway to load new values.
`REIN_BACKEND_URL` defaults to `https://rein-protocol.org`; no local Website service is required.
Override the address only for isolated development, using a backend with DEV data and matching
caller credentials. `DATABASE_ENVIRONMENT` and database credentials stay in backend deployment
settings or the Website repository's `.env.local`; they are not imported from the sibling repository
into the Agent.

1. Obtain the repository and official runtime:

   ```sh
   git clone --recurse-submodules https://github.com/rein-protocol-foundation/nori-agent.git rein-agent
   cd rein-agent
   node --version # Requires >=24.16.0 <25 or >=26.1.0; commands use the local toolchain
   npm run toolchain:pnpm -- --version # 12.4.2
   npm run toolchain:pnpm -- exec node -v # Expected v24.16.x
   ```

2. Install and build:

   ```sh
   npm run toolchain:pnpm -- install
   npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile
   npm run toolchain:pnpm -- --dir vendor/openclaw build
   npm run toolchain:pnpm -- run setup:local
   ```

`setup:local` creates only `runtime/openclaw/openclaw.json`, binds to loopback and generates a
Gateway token. This directory is Git-ignored; do not copy it into a shared repository.

`npm run toolchain:pnpm -- <arguments>` forwards everything after `--` to the repository's pinned
local pnpm toolchain (`toolchain:pnpm` in `package.json`), so no `export PATH` is necessary.
`-- install` and `-- --dir vendor/openclaw install` reach pnpm directly; `-- run <script>`, `-- test`
and `-- openclaw <arguments>` use the toolchain's Node even when the system Node is older. With no
arguments after `--`, pnpm prints its own help. To put the toolchain on `PATH`, run
`export PATH="$PWD/.toolchain/node_modules/.bin:$PATH"` once in that terminal; then `pnpm run check`,
`pnpm test` and `pnpm openclaw ...` are equivalent. Without the wrapper or PATH change, ensure pnpm
is exactly `12.4.2` and Node is within the supported range.

3. Verify and start:

   ```sh
   npm run toolchain:pnpm -- run check
   npm run toolchain:pnpm -- test
   npm run toolchain:pnpm -- run verify:plugin
   npm run toolchain:pnpm -- run verify:proposal-tools
   npm run toolchain:pnpm -- openclaw plugins list --verbose
   npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json
   npm run toolchain:pnpm -- openclaw gateway run
   ```

   In another terminal, run `npm run toolchain:pnpm -- openclaw gateway health --port 18791`
   (unauthenticated readiness probe) and `npm run toolchain:pnpm -- run smoke:gateway`. The latter
   checks only the isolated Gateway's status tool; it creates no activities, channels or articles.

4. Before a real pilot, record the approver, policy version, effective time and one chat platform
   in `docs/decisions.md`. Connect trusted platform account IDs, authoritative member records,
   funding sources and website services, then implement and test adapters. Before writes,
   externally exposed tools must reauthorize the actual requester, resource and audience. Passing
   synthetic tests does not prove a real adapter works.

   Providers must satisfy the [chat, identity, funding and website contracts](integration-contracts.md),
   especially lookup by idempotency key after timeouts and explicit permission scopes.

   To trial only the proposal tools, add the following under
   `plugins.entries.rein-operations.config` in `runtime/openclaw/openclaw.json`, replacing values
   with the **approved** single platform, native channel IDs and absolute local path:

   ```json
   {
     "proposalTools": {
       "enabled": true,
       "platform": "discord",
       "allowedNativeChannelIds": ["APPROVED_NATIVE_PROPOSAL_CHANNEL_ID"],
       "statePath": "/ABSOLUTE/PATH/TO/runtime/rein-proposals.json"
     }
   }
   ```

   `discord` illustrates the format, not an organizational platform choice; `slack` is also valid,
   and the historical P0 mode enabled only one. Without `enabled: true`, the four proposal tools
   do not register. That plugin path has no authoritative registry provider, so confirmation and
   submission return `authoritative_registry_required` even when enabled; drafting and revision
   can be tried in isolation. Synthetic registry authorization callbacks are not production
   adapters. Tool-call IDs guarantee retries of the same call only, not cross-call uniqueness
   based on trusted inbound message IDs.

   For the v0.1 slice, use `foundationDb` in the same file instead: `enabled`, `workspaces` (each
   with `platform`, `workspaceId`, `nativeChannelIds`), `proposalChannelIds`, `boardChannelIds`,
   optional `voteTypeAliases`, and environment variable names `backendApiBaseUrlEnvVar`,
   `agentCallerIdEnvVar`, `agentCredentialEnvVar`, plus `proposalConfirmationKeyEnvVar` for writes.
   **The Agent no longer holds database credentials.** Backend URL, caller ID, credential and
   signing key come only from server environment variables; configuration has neither their values
   nor database URL/service-key fields. The current plugin registers 19 backend tools (governance, identity and community) and hides
   simulators/legacy proposal tools. The backend owns the database and both DEV/PROD schemas.
   Earlier direct writes in the real test workspace and linked DEV tables belonged to the prior
   build; PROD business writes were zero and PROD data had no end-to-end verification. That
   rehearsal evidence authorizes no production testing: rehearsals must target a DEV or isolated
   backend environment.

## Naming and the rename migration

Pre-launch review required removing stage-prefixed names from tools, tables, configuration and
skills. The stable v0.1 names are the 14 tools `rein_member_status`, `rein_funds`,
`rein_poll_candidates`, `rein_vote_type_resolve`, `rein_proposal_collect`,
`rein_governance_proposal_submit`, `rein_poll_open`, `rein_poll_vote`, `rein_poll_result`,
`rein_proposal_comment_suggest`, `rein_revision_approve`, `rein_revision_apply`,
`rein_identity_bind_start`, `rein_identity_bind_complete`, and the `foundationDb` configuration block.
Because the two base migrations were already applied, table/RPC names could not be edited in place.
The **forward migration** `20260927110000_rein_governance_names.sql`, after committed
`20260927103000`, renames physical tables and two RPCs. It was **committed in PR #13 and applied to
the linked project**, verified read-only on 2026-09-28. The transitional compatibility views and RPC
wrappers were later removed by applied `20260929045543_remove_stage_compatibility_objects.sql`.
**Applied does not mean live-verified**; it does not prove the Agent ran the renamed interfaces in a
real environment. See the [contract naming section](integration-contracts.md#naming-and-the-rename-migration)
for the complete interface list. Source and test filenames also use stable v0.1 names.

Caller-visible names changed too: malformed `foundationDb` returns `foundation_db_config_invalid`,
and absent/empty referenced variables return `foundation_db_env_value_missing`. `rein_status`
reports `foundationDbReadToolsEnabled`, `foundationDbWriteToolsEnabled`,
`foundationDbCollectToolsEnabled` and `foundationDbFeedbackToolsEnabled`. These are code interfaces,
not migrations. `rein_proposal_collect` uses the same `foundation_db_*` errors as other tools, and
its error prefix is `foundationDb proposal collect tool`. At the time of this record, PR #13 had not
merged, but `20260927110000` was already applied. It is self-contained: for each environment it
renames five tables, two RPCs, ten helper/trigger functions, references to physical tables/functions/
GUCs in their bodies, and related triggers, constraints and indexes. It no longer depends on the
old names it replaces. Applied migrations are immutable history; the two `20260924*` base files keep
their original names. Future naming changes require another forward migration. Compatibility
objects were removed by `20260929045543_remove_stage_compatibility_objects.sql` and no longer resolve.

**Compatibility names have been removed.** They were a transitional mechanism, not a permanent
contract. The linked schema answers only to stable `<env>_rein_*` names after the cleanup migration.

## Ten Agent rehearsal cases

These were rewritten as **v0.1 Slack scenarios with synthetic identities and fictional activities**.
Evidence combines module tests with synthetic rehearsals on real providers: a real test Slack
workspace and the linked DEV tables. **They are not launch acceptance**: no real member registry,
no PROD business-table writes and no production deployment were involved.

See the [ten v0.1 acceptance cases](agent-test-cases-zh.md) for messages, preparation, expected
database records and real-provider evidence.

The [2026-09-28 governance acceptance record](governance-acceptance-2026-09-28.md) concludes that cases
2–10 passed on synthetic development evidence; case 1 was skipped by the owner and **did not pass**.
The recorded PR head had unit/loader verification only, no post-rename Slack rerun and no PROD
business-table writes. Production migration and release gates remained open.

| # | v0.1 Slack scenario | Required observation | Acceptance |
| --- | --- | --- | --- |
| 1 | An unlinked newcomer asks how to propose | Explain human-led identity linking (guidance remained an acceptance gap); attempted submission returns `identity_link_required`; no proposal write; self-declared member IDs/roles are ineffective | AC01 |
| 2 | A linked but non-`active` Contributor proposes a USD 165 workshop | `contributor_status_required`; no proposal write, self-approval, reservation or payment | AC01, AC04 |
| 3 | An active Contributor has a vague idea and the Agent asks for missing fields | No submission/write until complete; conversational field collection is Agent-led, with no multi-turn draft tool (acceptance gap) | AC02 |
| 4 | An active Contributor completes and submits a proposal | One row linked to the sender's contact; random UUID, same-call retry reaches the same row; `authorizesSpending = false` | AC02 |
| 5 | A current director opens a Board-channel poll by vote type | Tool assembles candidates from the database; caller-supplied candidates/limits return `policy_argument_rejected` / `legacy_options_unsupported`; one poll row, frozen candidates/window; the recorded absence of a list-votable-proposals tool was an acceptance gap | AC16 |
| 6 | Directors vote in natural language, including abstention | Three stored ballots; empty approvals mean abstention and contribute none; per-round `maxApprovalsPerVoter`; mapping natural language to `approvedProposalIds` is Agent-led (acceptance gap) | AC07 |
| 7 | Query before and after closing | Before: `provisional`, `official = false`, no tally/winner. After: persisted `outcome` / `winner` / `counts`. Re-reading a closed round returns `repeated = true` without retallying; narration/posting remained an acceptance gap | AC06, AC07 |
| 8 | Feedback on a passed proposal: ordinary title/summary versus material budget/schedule change | Ordinary revision applies with `acceptedBy = 'agent'`; material revision is blocked by `revision_not_approved` until current-director approval, then applies with `acceptedBy = 'director_approved'`; no financial records | AC07 |
| 9 | A director queries a known USD snapshot and unknown EUR currency | Known: amount, currency and timestamp. Unknown: `unknown` / `no_snapshot` / `availableMinor = null`, never zero or an inferred balance. No allocation, reservation or payment; conversational mapping to `currency` remained an acceptance gap | AC15 |
| 10 | Someone asks the Agent to reserve and pay funds based on a passed vote | Explicit refusal: approval is only a decision record. No reservation, payment, funds-snapshot change or financial record; provide a human next step | AC04, AC08, AC15 |

Post-result feedback/revisions are included in case 8 rather than separately numbered. See the
[ten rehearsal cases](agent-test-cases-zh.md) for boundaries and regression expectations.

## Verification scope and unfinished work

The 2026-09-24 local verification used official OpenClaw commit
`4a11f89e840b2bb3eedcad2820ab25b8520905b6`, Node 24.16.0 and pnpm 12.4.2. The table preserves the
original commands with the local toolchain already on `PATH`. The wrappers above were introduced
for routine use without a PATH change. Only wrapped `check` was separately verified in that pass;
the other historical results are not presented as tests of the wrapper commands.

| Command | Result |
| --- | --- |
| `pnpm run check` | Passed: structure, unapproved configuration, PRD hashes, tool inventory and `foundationDb` configuration constraints |
| `pnpm test` | Exit 0, 618/618 passed, zero failures; includes `proposal-feedback-tools` 34/34 (Agent-applied ordinary revisions and director-gated material revisions), `governance-rehearsal` 4/4, `vote-tally` 19/19, `foundation-db-writer` 196/196. Closed-round replay was fixed: `rein_poll_result` returns the stored result with `repeated` |
| `pnpm run verify:plugin` | Exit 0, **loader-level** only: real OpenClaw loader imports three default read-only tools, and a temporary isolated configuration registers the recorded 14 backend tools, hides simulators/legacy proposal tools, and keeps secrets out of output. This proves registration/loading, not Slack, database or provider connectivity |
| `pnpm run verify:proposal-tools` | Exit 0, **loader-level**: four v2 proposal tools register with temporary isolated configuration; no real platform connection |
| `pnpm --dir plugins/rein-operations pack --dry-run` | Exit 0: package includes `proposal-feedback-tools.ts` and `proposal-revision-rules.ts`, so feedback modules ship with the package |
| `pnpm run smoke:gateway` | Passed: authenticated `rein_status` call through the isolated Gateway |
| `git -C vendor/openclaw status --porcelain` | No changes |

Run `npm run toolchain:pnpm -- run smoke:gateway` after the Gateway reports `ready`; a connection
refusal during startup is not a tool failure. These results do not cover real chat, website or
funding interfaces. `tests/p0-rehearsal.test.mjs` joins two activity flows across modules and ends
with pending external intents, not fabricated channels or articles.

AC09/AC14 external channel/website uniqueness, AC16 real-channel privacy isolation and AC20's two
real end-to-end flows require a selected platform and provider contracts; they cannot be marked
passed. Payments, signing, membership elevation and weights remain with authorized people and
independent processes.

The delivery worker is a local module with injectable providers and does not connect itself to real
platforms. Cross-process concurrency on one intent still requires the provider to enforce uniqueness
by Rein idempotency key. Core receipts validate identifiers, keys and article links but cannot prove
provider authenticity. The change coordinator can execute a few actions with core APIs, including
activity cancellation and pause. Registration pages, reminders, owner permissions and financial
review remain explicitly pending and cannot be claimed as propagated. After interrupted cross-core
transactions, pending markers retain an unknown outcome for human reconciliation; AC11 still needs
a complete executor and real-provider acceptance.

The table is a dated 2026-09-24 record, not a continuing guarantee. It records local/loader tool
registration, not production acceptance. Later 2026-09-27/28 synthetic rehearsals produced real
test-workspace and DEV-table evidence using the pre-rename build, with zero PROD business writes;
the recorded PR head had no real Slack rerun after renaming.

### 2026-09-27 review: Supabase/PostgREST boundary integration tests (**superseded**)

> **Since 2026-09-30, this subsection is historical only, not current instructions.** It describes
> the prior implementation, where the Agent held a service key and accessed PostgREST directly.
> That implementation and `tests/foundation-db-gateway.test.mjs`,
> `tests/foundation-db-reader.test.mjs`, `tests/foundation-db-writer.test.mjs` were removed with the
> architecture change. All database access now belongs to the backend service. Do not give the
> Agent database credentials based on this section.

That review added `tests/foundation-db-gateway.test.mjs`: reader and writer used global `fetch`
against a real loopback HTTP server simulating PostgREST routes and Supabase header rules. It covered
modern `sb_secret_` keys and legacy `service_role` JWTs, asserting 401 maps to `auth_error` and 5xx
remains `http_error`. This was transport integration, **not a real PostgREST instance or project
connection**. With Node 24.16.0 and pnpm 12.4.2, the full gates were rerun:

| Command | Result |
| --- | --- |
| `npm run toolchain:pnpm -- run check` | Passed, exit 0 |
| `npm run toolchain:pnpm -- test` | Passed, exit 0: 756/756, zero failures, including seven new `foundation-db-gateway` tests |
| `npm run toolchain:pnpm -- run verify:plugin` | Passed, exit 0: loader-level default three tools and isolated 14 backend tools; simulators/legacy proposal tools hidden |
| `npm run toolchain:pnpm -- run verify:proposal-tools` | Passed, exit 0: loader-level four v2 proposal tools |

These are local and loader-level results, not real-chat or production acceptance. Separate synthetic
rehearsals used real test Slack and linked DEV tables (see the
[2026-09-28 governance acceptance record](governance-acceptance-2026-09-28.md)), but used the pre-rename
build, made zero PROD business writes, and did not establish a post-rename real Slack rerun of the
recorded PR head.

See the [AC01–AC20 acceptance matrix](p0-acceptance-matrix.md) for complete evidence and remaining gates.
