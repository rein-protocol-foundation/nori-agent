# P0 acceptance evidence matrix

This matrix preserves the PRD's AC01–AC20 **historical acceptance evidence**. Current configuration
and the 19 backend tools are documented in [setup](setup.md#optional-enable-backend-backed-tools);
older direct-database tool counts and test results below are not current deployment instructions. “Core tested” means synthetic inputs exercised deterministic Nori-Agent-owned modules. It does not mean the real chat, member registry, website or finance provider has passed. A production result requires the provider evidence in the last column. The ten synthetic Slack
rehearsal cases and their final verdicts are in the [v0.1 governance acceptance record](governance-acceptance-2026-09-28.md).

## v0.1 slice versus deferred work

The strict P0 v0.1 slice is the four steps in [PRD §2.3](PRD-agent-community-operations.md): Slack identity
→ Contributor proposal → simple Board vote and result → read-only funds snapshot. In scope:
AC01–AC04, plus the parts of AC05–AC07 and AC16–AC17 those steps exercise. AC08–AC14 and AC18–AC20
belong to the deferred remainder and stay open until their phase starts.

**Historical build state: PR head on 2026-09-28** (the earlier 2026-09-24 build state is superseded; the
date below no longer describes the present tool set). The current PR head carries the long-term
`rein_*` interface names in the plugin and config, with the database-side rename migration applied
to the linked project but no live code run behind it, and has **no live Slack retest after the
rename**. That build had **12 database-backed tools** —
four reads
(`rein_member_status`, `rein_funds`, `rein_poll_candidates`, `rein_vote_type_resolve`), one read-only
field collector (`rein_proposal_collect`), four writes and three post-result feedback tools — and they
register only when an explicit `foundationDb` config block enables them; enabling it hides the
synthetic simulators and the legacy proposal bridge.

| Tool | Kind | Code |
| --- | --- | --- |
| `rein_member_status` | read | `foundation-db-reader.ts`, `governance-read-tools.ts` |
| `rein_funds` | read | `foundation-db-reader.ts`, `governance-read-tools.ts` |
| `rein_poll_candidates` | read | `foundation-db-reader.ts`, `governance-read-tools.ts` |
| `rein_vote_type_resolve` | read | `vote-type-resolve.ts`, `governance-read-tools.ts` |
| `rein_proposal_collect` | read | `proposal-collect-tools.ts` |
| `rein_governance_proposal_submit` | write | `foundation-db-writer.ts`, `governance-write-tools.ts` |
| `rein_poll_open` | write | `foundation-db-writer.ts`, `governance-write-tools.ts` |
| `rein_poll_vote` | write | `foundation-db-writer.ts`, `governance-write-tools.ts` |
| `rein_poll_result` | write | `vote-tally.ts`, `governance-write-tools.ts` |
| `rein_proposal_comment_suggest` | write | `proposal-feedback-tools.ts`, `foundation-db-writer.ts` |
| `rein_revision_approve` | write | `proposal-feedback-tools.ts`, `foundation-db-writer.ts` |
| `rein_revision_apply` | write | `proposal-feedback-tools.ts`, `foundation-db-writer.ts` |

Those tool names, and the `foundationDb` config block, are the current stable interfaces; the source
files that hold them use stable v0.1 filenames.

Post-result feedback is the one place where a confirmed rule has two asymmetric sides. An
**ordinary** revision, moving only the title or the summary, is accepted and made effective by the
Agent itself: `rein_revision_apply` succeeds with no separate approval recorded, in the caller's
turn. A **material** revision — budget, location, schedule, personnel or the major event flow, with
`schedule` material in the current implementation — is refused with `revision_not_approved` until a
current director records an approval through `rein_revision_approve`. All three calls are
limited to the approved Board channel and to a current director, because the voters are the Board;
the stored revision row additionally permits an **active Contributor** as its author, which is a
database-level allowance the registered tools do not currently expose. A comment applies nothing,
and no revision moves money.

Four deliberate v0.1 shapes are worth stating plainly. A poll is defined by a **stored vote type**,
not by a caller: `rein_poll_open` reads that type's own candidate cap, assembles the candidate
pool from stored proposals (offering recently unselected ones too) and lets the database freeze the
list, so no caller supplies candidates, a cap or an option label. There is still **no automatic
proposal-to-poll link** in the sense that no tool opens a poll *from* a proposal: the round is opened
by a director naming a vote type, and the agent then assembles the pool. Ballots are
**approve-only**: `rein_poll_vote` takes `approvedProposalIds`, refuses an entry outside the poll's
frozen candidates or above the poll's own `maxApprovalsPerVoter`, and treats an empty list as the
abstention. A poll's counts are **provisional until the closing time**: before it the tool reports
`provisional`, `official: false` and no count or winner, and only at or after the deadline does the
finalize RPC close the round and store the outcome from the ballots the database already accepted.
A **highest-count tie is not an official outcome**: with the tie rule still unadopted, the stored
outcome is `no_winner` with a null winner, and the run never announces a winner it has no adopted
rule for. An all-abstain round is settled by the confirmed rule and also stores `no_winner`, which is
not the same as the undecided tie.

**Replay safety is limited.** Identifiers derive from the tool call ID, the acting contact and the
action, which makes a repeated call inside one turn an exact duplicate, but a tool call ID is not a
trusted inbound message ID and the derivation is memoized per turn. A re-delivered Slack event or a
retry in a new turn can still insert a second record, so these rows are not evidence of
cross-process exactly-once behaviour.

The Agent's tools have been exercised against real providers in the synthetic rehearsals: synthetic
test identities in a real test Slack workspace, reading and writing the linked `dev_*` Supabase
schema with synthetic rows, while every `prod_*` business table stayed at zero. The rows below remain
synthetic dev and module-level evidence, not a production pass. The old single-workspace and
profile-email setup has been removed. Current configuration admits explicit `workspaces`, and the
Agent obtains backend-signed proofs from trusted host context; the backend resolves verified member
bindings. No profile-email lookup or email scope is required. See [setup](setup.md#optional-enable-backend-backed-tools).
The following migration and PR details are historical. Two
migrations are **tracked in the sibling Foundation repository**
(`rein-protocol-foundation/ReinProtocolFoundation`) on its PR #13 branch (PR #13, open). Its current PR head is
`78281fa` ("Recover Remote-Only Case 7 Same-Day Fixture Migration", 2026-09-28); the rename commit
`08542ad09932a4cefb62f230a9bdcf9fd4d32dfe` ("Complete Rein governance catalog rename through
triggers, constraints, and indexes") and the earlier clock commit
`32977bfb6cd6ae73b81aa4b396f9ae1cb67d2ac8` ("Make the database clock authoritative for ballot
`cast_at`") are its ancestors, and the two schema files were first authored at `4bd5ce8` ("Add the
Rein Agent Slack identity, fund snapshot, and governance schema"). Both base migrations are
**applied to the linked project**:
`supabase/migrations/20260924094436_rein_slack_identity_and_fund_snapshots.sql` (identity links,
append-only funds snapshots) and
`supabase/migrations/20260924095705_rein_mvp_proposals_polls_ballots.sql` (proposals, polls, ballots)
were verified read-only on 2026-09-27 with `supabase migration list --linked` against project ref
`ksgyfyysnojqrwfuyqwe` (project name `BeneficenceProtocol`), applied in filename order. Each
migration creates the `dev_*` and `prod_*` objects in the same transaction, and `migration list` is
project-level, so the applied schema covers both prefixes; the app's `DATABASE_ENVIRONMENT=dev`
default selects which prefix a request reads and is not proof that only the `dev_*` schema exists.
A third sibling migration, `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`, was committed at
`32977bfb` and is present at the current sibling head. A fourth,
`20260927110000_rein_governance_names.sql`, renames the physical tables and the two RPCs to their
long-term names. Both are **applied** to the linked project as of 2026-09-28: read-only inspection
lists both versions and finds the ten new physical tables, so the clock authority is in effect in the
linked schema and the new names resolve. The transition compatibility views and RPC wrappers were
removed by the later applied `20260929045543_remove_stage_compatibility_objects.sql`. Applied schema
is not a live code result; no live ballot or tool call has exercised the new names. The sibling
code's local pgTAP suite stands at 187/187 assertions at that same commit, run twice in an isolated
container.
The phase-two migration carries the vote types, the approve-only ballot shape, the
frozen candidate list, the finalize RPC and the material-revision approval rule this document
describes, with pgTAP coverage in the sibling repository. The rehearsal runs did read and write the
linked `dev_*` tables, but on the **pre-rename build** (the original stage-prefixed interfaces) and
with synthetic rows only; the `prod_*` business tables were never written, and no live Slack retest
has run against the current post-rename head, so no schema claim here should be treated as a live
end-to-end result on the current head.

Current backend boundary coverage lives in `tests/backend-boundary.test.mjs`,
`tests/backend-adapter.test.mjs`, `tests/backend-runtime.test.mjs` and `tests/identity-tools.test.mjs`.
The earlier direct-PostgREST tests describe a retired architecture and are not deployment checks for
the current Agent. Local boundary tests do not establish live provider acceptance.

| AC | Current evidence | Status | Evidence still required for launch |
| --- | --- | --- | --- |
| AC01 | Historical proposal/core checks cover refusal of unidentified senders. Current identity uses authenticated backend operations and canonical verified bindings; relevant local coverage is in `backend-runtime.test.mjs`, `backend-adapter.test.mjs` and `identity-tools.test.mjs`. Profile-email resolution has been removed. | The historical case 1 was skipped, not passed; updating configuration does not change that verdict | Isolated end-to-end evidence for unbound, bound, revoked and expired identities, current role checks and cross-workspace refusal, against the approved backend and transport. |
| AC02 | `proposals.test.mjs` checks fields, versions and reconfirmation; `proposal-tool-bridge.test.mjs` exercises guarded create/revise/confirm/submit calls. | Local tool tested | Real chat conversation that gathers fields across messages and returns the confirmed summary. |
| AC03 | `proposals.test.mjs` checks explicit zero-budget authorization and blockers. | Core tested | Approved policy scope, responsible exception handler and real fast-track rehearsal. |
| AC04 | `proposals.test.mjs` routes complete funding requests to governance, including small amounts. | Core tested | Live Board round presentation and provider-backed proposal records. |
| AC05 | `p0-rehearsal.test.mjs` and `governance.test.mjs` freeze versions, roster, weights and rules; `foundation-db-writer.test.mjs` and `governance-rehearsal.test.mjs` assemble a round's candidate pool from stored proposals of the named vote type, re-offering recently unselected ones, bounded by that type's own cap. The round-persistence test moved to a follow-up PR with `governance-store.ts`. The concrete cap values are still unapproved configuration. | Local modules and governance tools tested; plus a synthetic dev run against the linked `dev_*` schema in the rehearsal workspace (type-scoped `rein_poll_candidates` read and candidate-pool opening). No production provider acceptance | Approved per-type cap values, authoritative finance availability and delivered Board briefing. |
| AC06 | `governance.test.mjs` rejects invalid, ineligible and late ballots; `foundation-db-reader.test.mjs` resolves the member and director role from the database; `governance-write-tools.test.mjs` refuses a late ballot and a choice outside a stored poll's options. The refused-ballot audit, authoritative-registry eligibility and host-bound vote-tool checks moved to a follow-up PR with `governance-store.ts`, `registry-snapshot.ts` and `governance-tool-bridge.ts`. | Local modules tested; database tools registered only under explicit `foundationDb` config | Trusted sender-to-member identity, explicit vote confirmation in Slack, private ballot access, and a real round audit. |
| AC07 | `governance.test.mjs` covers replacement, recusal, abstention, quorum, ties and thresholds; `vote-tally.test.mjs` covers one equal weight per eligible member, an empty approval list casting no approval and a tie or empty poll producing `no_winner`; `governance-write-tools.test.mjs` and `governance-rehearsal.test.mjs` exercise the registered tools' approve-only enforcement, the per-poll `maxApprovalsPerVoter` bound, the frozen candidate list and the deadline that decides a round. `proposal-feedback-tools.test.mjs` covers the post-result rule in both directions: an ordinary title or summary revision is applied by the Agent with no separate approval, a material revision is refused with `revision_not_approved` until a current director's approval is recorded, a comment applies nothing, and every feedback call is Board-scoped. The Board-scoped recusal and retry checks in the host-bound vote bridge moved to a follow-up PR with `governance-tool-bridge.ts`. The per-type maximum approvals and candidate cap are confirmed rules (C08, C14, D08, D09) with concrete values still unapproved configuration. | Local modules and database tools tested, including the post-result feedback tools; database tools registered only under explicit `foundationDb` config | Confirmation of the highest-count tie rule, the approved per-type values, an approved voter list, the feedback author scope and a real round audit. Weighted, quorum and recusal rules are deferred from v0.1. |
| AC08 | `governance.test.mjs` reports shortfall and holds allocation when funds are unknown or insufficient. | Core tested; deferred from v0.1 | Atomic reservation against an authoritative finance source under concurrent rounds. v0.1 does not allocate one budget across competing proposals. |
| AC09 | Local implementation moved to a follow-up PR with `activities.ts` and `outbox-runner.ts`: a unique space intent plus provider receipt lookup and same-key retry against a fake provider. | Moved to follow-up PR | Provider receipt/lookup proving one real event space across timeout and retry. |
| AC10 | Local implementation moved to a follow-up PR with `activities.ts`: task completion cancelling chasing reminders, snooze, quiet hours, reminder suppression and the explicit timezone requirement for dispatch. | Moved to follow-up PR | Scheduled runner and delivered notification evidence under the chosen platform. |
| AC11 | Local implementation moved to a follow-up PR with `changes.ts` and `change-coordinator.ts`: change planning and guards plus a narrow durable handoff into guarded activity actions while retaining unsupported work. | Moved to follow-up PR | Transactional application to activity, registration, reminder and finance owners; actual recipient notifications for time, location, lead or cancellation changes. |
| AC12 | Local implementation moved to a follow-up PR with `activities.ts`: outcome fields and specific missing items. | Moved to follow-up PR | Real event channel intake and permissions for incremental materials. |
| AC13 | Local implementation moved to a follow-up PR with `activities.ts`: alternative materials and channel-specific consent. | Moved to follow-up PR | Website adapter excluding unauthorized media and handling withdrawal. |
| AC14 | Local implementation moved to a follow-up PR with `activities.ts` and `outbox-runner.ts`: lead fact confirmation, a single canonical article per activity, the separate `post_article_link` return intent, and consent/content/receipt checks before `published`. | Moved to follow-up PR | One real article with canonical URL; timeout recovery and correction. |
| AC15 | `foundation-db-reader.test.mjs` and `governance-read-tools.test.mjs` cover the read-only funds snapshot v0.1 exposes. The activity finance rules (`finance.approve_adjust`, the ordered overspend recovery, blocked settlement of unpaid obligations) moved to a follow-up PR with `activities.ts`. | Read-only snapshot reader tested; activity finance moved to follow-up PR; payment paths deferred from v0.1 | Finance-owner reconciliation against actual records, plus real available-funds verification; no payment execution by Agent. v0.1 shows a read-only snapshot only. |
| AC16 | `request-context.test.mjs` rejects unapproved channels and missing trusted senders. | Core tested | Platform permission test showing Board and private event data never appear in public or another event scope. |
| AC17 | `ledger.test.mjs` and `proposal-store.test.mjs` cover local idempotency and stale-process conflicts; `p0-rehearsal.test.mjs` exercises the ledger-backed proposal store across a restart. The refused-ballot audit and fake-provider uncertain receipt lookup moved to a follow-up PR with `governance-store.ts` and `outbox-runner.ts`. | Core tested | Kill/restart drill around live provider calls, uncertain receipt lookup and voting fairness decision. |
| AC18 | Local implementation moved to a follow-up PR with `oversight.ts`: routine progress separated from outstanding exceptions in a weekly summary. | Moved to follow-up PR | Real-source weekly summary delivered to authorized oversight recipients. |
| AC19 | Local implementation moved to a follow-up PR with `oversight.ts`: scoped pause/resume and retained work. | Moved to follow-up PR | Operator controls in real deployment and proof that no paused effect is sent. |
| AC20 | `p0-rehearsal.test.mjs` chains a synthetic zero-budget proposal and a synthetic funded proposal from identity link through the proposal core (US02, US04, US05, US15) and a frozen weighted governance round with deterministic allocation (US06, US07), using the ledger-backed proposal store across a restart. Activity execution, outcome and publication segments moved to a follow-up PR with `activities.ts` and are no longer asserted here. | Synthetic rehearsal passed for the proposal and governance chain | Two sandbox runs with real selected-platform and website adapters plus finance reconciliation. |

The integration requirements are in [provider contracts](integration-contracts.md), and the deployment/test instructions are in [the Chinese delivery record](implementation-and-deployment-zh.md). None of the rows is marked as a production pass until its provider evidence exists.

## Naming and the rename migration

A pre-launch review asked for the stage-based naming to be removed from tools, tables, config and
skills. The plugin and configuration now use the stable v0.1 names in the table above: the twelve
tools and the `foundationDb` config block. The database reaches matching names through the forward
migration `20260927110000_rein_governance_names.sql`, tracked in
[provider contracts](integration-contracts.md#naming-and-the-rename-migration). It is committed in PR
#13 and **applied** to the linked project as of 2026-09-28; it renames the physical tables and the two
RPCs. The transition compatibility views and wrappers it created were removed by the later applied
`20260929045543_remove_stage_compatibility_objects.sql`, so the stable names are the only interface.
The schema gate is closed; the live code path remains unverified. Source file and test filenames now
use the stable v0.1 stems as well.

The caller-facing names move with the plugin, so a caller that hits a malformed `foundationDb` block
or an unset named variable now reads `foundation_db_config_invalid` or
`foundation_db_env_value_missing`, and `rein_status` reports `foundationDbReadToolsEnabled`,
`foundationDbWriteToolsEnabled`, `foundationDbCollectToolsEnabled` and `foundationDbFeedbackToolsEnabled`.
These are code interfaces, not
schema, so they need no migration. The earlier stage-prefixed compatibility views and RPC wrappers
have been removed, so the stable `<env>_rein_*` names are the only interface in the linked schema.
