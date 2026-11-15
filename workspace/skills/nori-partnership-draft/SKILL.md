---
name: nori-partnership-draft
description: Prepare one partnership email from a selected research shortlist entry, present its exact test-recipient draft, and report a host-bound approval workflow. Requires connected preparation and approval capabilities; research and this skill grant no outreach authority.
---

# Partnership draft and test send

Use the selected shortlist entry and its actual source task reference. Preserve source links,
mission fit and eligibility unknowns; never turn an unverified claim into an established fact.
Do not research or contact additional organizations merely to run this workflow.

When `rein_partnership` is available, use `action="prepare"` with `sourceTaskId`, `entry`,
`to`, `subject` and `text`. The recipient must be an operator-designated test address accepted
by the connected capability. A shortlisted partner's address is not a test address by default.
The source reference describes provenance; it is not proof that the research was accepted.

Present the returned exact sender, recipient, subject and full plain-text body, the task/version,
expiry and designated approver, and the returned approve/cancel commands without rewriting them.
Clearly say that the workflow is paused and no email has been sent. Material changes require a
new version using the returned task ID and `expectedVersion`; the old approval becomes invalid.
Do not invoke a shell, a general mail tool or a Lobster resume tool to bypass this approval.

Approval belongs to the human through the host's authenticated approval entry point. The model
cannot approve by echoing a command, inferring intent, setting a boolean or treating silence as
consent. If the connected surface lacks that entry point, explain the blocker and retain a draft.
The current adapter supplies native `/partnership` commands in the configured trusted Slack
conversation. Other channels may use this skill for drafts but gain no execution authority.

Use the returned status/receipt to report outcomes: awaiting approval, cancelled, blocked,
provider accepted, or delivery verified. A provider message ID proves API acceptance only.
Read-only reconciliation may verify delivery for an existing receipt. An interrupted/unknown
send, missing checkpoint or orphaned operation lock requires operator evidence review; never
prepare another task or retry sending as a recovery shortcut.

Keep drafts, checkpoints and receipts in the capability's private state and authorized originating
conversation. Do not copy private material into this skill, shared memory or public channels.
This skill grants neither account access nor permission for real partner outreach.
