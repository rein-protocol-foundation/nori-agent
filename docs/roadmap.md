# Nori-Agent implementation roadmap

## SA-OPS-01 / #66 authority checkpoint — November 10, 2026

Owner: Codex. Date: 2026-11-10, America/Los_Angeles. Base `ac8d766`; native pin `4a11f89`.
Status: **BLOCKED / no acceptance**. #61/#69 are merged in local ancestry. The
[native authority investigation and safe reproduction](sa-ops-native-authority.md) establish
the human-only gate defect and the missing public occurrence/parent authority view; nine
synthetic projection/gate cases reproduce senderless and redundant-role defects without external
calls. Pinned build (4m56s), complete Node suite (1289 tests / 1287 pass / 0 fail / 2 existing
conditional skips), real loader three modes and existing Director-authorized native ACP synthetic
end-to-end are passing unchanged-runtime regression baselines, not #66 or M0/M1 acceptance.
No runtime bypass is implemented. Next: user review of the blocker and minimal read-only host-owned
view with `assertCurrent()`; continue only within #66 after explicit user confirmation. Complete
Cron lifecycle, actual native child/memory follow-up compatibility, new #66 ACP authority behavior,
real Slack and production remain unverified. Historical governance milestones are unchanged.

## Super Agent roadmap — separate scope, November 9, 2026

Super Agent M0–M3 are distinct from the historical governance milestones below. [PRD v0.6](super-agent-nori-prd-en.md) and the [feature checklist](super-agent-feature-checklist.md) record the approved native-first direction: configuration → existing community integration → necessary thin adapter. M1 Slack/native research and existing ACP coding is first (#60/#66); M2 reuses native continuation/recovery (#58); M3 reuses Lobster/mail (#59), with first-release necessity pending. M0 remains an independent shared-Gateway/Discord milestone (#57), including useful Community Q/A, Qwen-first escalation/Magpie limits (#67), native memory/runtime compatibility (#54–#56) and Axiom usage/09:00 Slack reporting (#68). It is not a blanket prerequisite for internal tasks. M0 is unaccepted; source/CI evidence is distinct from product acceptance. Scope owner: project owner; implementation assignees pending. Tracker: [#65](https://github.com/rein-protocol-foundation/nori-agent/issues/65). This revision changes documents and tickets only; retention duration and M3 optionality remain open, not a reason to rebuild native platforms.

The product targets NGO/NPO and public-benefit operations across routine decisions, financial resource coordination, people management and community maintenance. The milestones below are the initial Foundation implementation, not the full product scope. Broader people workflows, policy-bound daily decisions and resource coordination require subsequent requirements and acceptance work.

Further product directions for discussion are fundraising and donor relations, program/service delivery, mission and impact evaluation, governance/compliance coordination, participation and protection of people served, and communications/partnerships. These are not scheduled milestones. Select an initial organization segment and an end-to-end workflow before expanding the delivery plan; define evidence of success and action authority for each. See the [PRD discussion](PRD-agent-community-operations.md#proposed-product-extensions-for-discussion).

The local deterministic cores for proposals, governance and a rehearsal ledger are implemented and tested. The activity, change, oversight and outbox cores are unreachable from the plugin entry and their implementation moved to a follow-up PR. The milestones below remain open as **production acceptance**: trusted identity, chat and website adapters, approved policy, provider receipts and end-to-end pilot evidence are still required. See [implementation and deployment](implementation-and-deployment-zh.md).

Final acceptance state: cases 2-10 of the ten synthetic Slack rehearsals are accepted on
synthetic development evidence, and case 1 was skipped by the owner and is not passed. The current
PR head carries the renamed interfaces with unit and loader-level validation only and has no live
Slack retest; `prod_*` tables are untouched and the production migration and release gates remain.
See the [v0.1 governance acceptance record](governance-acceptance-2026-09-28.md).

For a requirement-by-requirement status, see the [P0 acceptance matrix](p0-acceptance-matrix.md).

Discord onboarding conversation content now ships in the workspace, separately from the v0.1
governance slice: optional introductions, peer discussion, free learning resources, public in-person
events and resource contributions. A server-scoped public directory starts unconfigured, with a
synthetic example and pending conversation checks in the [onboarding guide](discord-onboarding.md).
Discord connectivity, real resource entries, search/registration/submission/reminder integrations,
persistent progress and live member acceptance remain open; these templates do not pass those gates.

The strict P0 v0.1 slice is the shorter slice in [PRD §2.3](PRD-agent-community-operations.md): Slack
identity, a simple Contributor proposal, a simple Board vote and result, and a read-only funds
snapshot. M0 is decided for the v0.1 slice (Slack, the organization's own database, simple one-person-one-vote).
M1/M2 as written below carry the deferred remainder, including zero-budget fast track, budget
allocation, competing proposals and the weighted round model; they do not block the v0.1 slice.

| Milestone | Deliverable | Acceptance |
| --- | --- | --- |
| M0: decisions and contracts | Policy decisions, runtime version, one chat platform, storage and tool contracts | v0.1 items decided (Slack, own database, one-person-one-vote); remaining §16 decisions assigned before their phase |
| M1: member to proposal | Identity linking, draft/version confirmation, evaluation and configured zero-budget path | AC01–AC04 |
| M2: facilitated evaluation | Snapshots, deterministic ballots/tally, cutoff, budget allocation and audit | AC05–AC08 |
| M3: execution | Unique spaces, scheduling, changes, cancellation and handover | AC09–AC11 |
| M4: outcomes | Evidence and consent, separate finance state, confirmed publication and corrections | AC12–AC15 |
| M5: reliable pilot | Audience permissions, durable recovery, exceptions and pause/resume | AC16–AC20 |

## P0 release evidence

- [ ] AC01–AC04: ineligible submission rejected; valid owner confirmation; policy-scoped zero-budget approval; every funded request routed to Board.
- [ ] AC05–AC08: frozen inputs; no proxy/late/ambiguous votes; configured abstention/recusal/quorum/ties; no overspend under concurrency.
- [ ] AC09–AC11: exactly one space after retries; reminders reflect actual status; cancellation/handover updates all effects.
- [ ] AC12–AC15: incremental evidence; alternatives to photos; final-version and rights confirmation; unique publication; finance statuses independent.
- [ ] AC16–AC19: private information isolation; outage recovery; accountable exception summaries; scoped pause and controlled recovery.
- [ ] AC20: end-to-end zero-budget and funded event rehearsals, including outcomes and settlement records.

P1 adds recurring communities, contributor growth, matching, feedback analysis and authorized social image/text publishing. P2 adds the second chat platform, cross-platform identity, multi-region coordination and governance evolution. No video, autonomous payments, signing, token issuance or on-chain voting in P0.
