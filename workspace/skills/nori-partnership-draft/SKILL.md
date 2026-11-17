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

The workflow presents the exact sender, recipient, subject and full plain-text body, task/version,
expiry and designated approver, followed by native Slack buttons in the same thread.
Clearly say that the workflow is paused and no email has been sent. Material changes require a
new version using the returned task ID and `expectedVersion`; the old approval becomes invalid.
Do not invoke a shell, a general mail tool or a Lobster resume tool to bypass this approval.

Approval belongs to the human through the host's authenticated approval entry point. The model
cannot approve by echoing a command, inferring intent, setting a boolean or treating silence as
consent. If the connected surface lacks that entry point, explain the blocker and retain a draft.
Direct the approver to “批准并发送测试邮件” or “取消” on the latest card after reviewing the full
draft above it. After sending, “刷新送达状态” retrieves delivery evidence without resending.
Do not ask the user to copy `/partnership` commands, hashes, or leading spaces. Legacy text
commands remain an operator compatibility path; they are not registered Slack slash commands.
Other channels may use this skill for drafts but gain no execution authority.

Use the returned status/receipt to report outcomes: awaiting approval, cancelled, blocked,
provider accepted, or delivery verified. A provider message ID proves API acceptance only.
Read-only reconciliation may verify delivery for an existing receipt. An interrupted/unknown
send, missing checkpoint or orphaned operation lock requires operator evidence review; never
prepare another task or retry sending as a recovery shortcut.

Keep drafts, checkpoints and receipts in the capability's private state and authorized originating
conversation. Do not copy private material into this skill, shared memory or public channels.
This skill grants neither account access nor permission for real partner outreach.
