# Discord Community access acceptance — 2026-11-18

Task: SA-M0 / #57; owner: Codex. User authorized open Discord DMs, necessary Community tools,
public web search, a scoped test-account unlink/rebind, deployment/restart and real-channel tests.
PR #113 passed all seven CI checks and deployed `cbb76c9`; the prior ACP fixes from #111/#114
were retained. Configuration was applied only after the other deployment released its window.

## Changes and boundaries

- Native Discord DMs use `open` / `allowFrom: ["*"]`. Public channel admission remains configured.
- A Community-only explicit `directMessages` workspace mapping checks the registered agent/account,
  host sender and exact native sender-scoped DM session key. It does not claim guild membership.
- The dedicated Community caller retains its six identity/catalog scopes and exact Discord workspace.
  Its channel admission now accepts dynamic DM IDs; the trusted host ingress enforces public-channel
  enrollment and DM classification. No database credentials or governance tools reach the model.
- `rein_member_status` checks the current host-authenticated sender, returning no email or contact ID.
  Every protected catalog query rechecks backend identity. Linking does not expand tool permissions.
- Native public `web_search`/`web_fetch` are enabled; the existing unset search provider was configured
  to native `parallel-free`. No explicit provider, model vendor or main-agent model configuration changed.
- Reusable skills are discovered from the shared source library. Both community discovery and job
  matching were absent before this change and now load inside the existing session sandbox.
- Main/Slack settings, Community model restrictions, private memory, sandbox and request limits remain.
  Limits: user/conversation 6/30 requests per minute, concurrency 2/4/8, 2,000 gateway requests daily.
- Official public website/community URLs were added to the root-owned public seed after an actual
  search omitted the Foundation site. Search omission is not evidence that the official site is absent.

## Real acceptance

The designated test account's original production link was privately backed up, then removed under
explicit authorization. Development bindings and other members were untouched. A revoked tombstone
would block the intended new-link flow, so this test used scoped removal with an audit record.

1. Before the DM mapping fix, real `rein_identity_bind_start` failed with workspace resolution errors.
2. After deployment, real DM member status returned `identity_not_linked`; resource search returned
   `community_member_required`, and the binding tool generated the requesting account's real URL.
3. The website accepted the existing test email. Resend recorded delivery, the configured forwarding
   route matched the authenticated Outlook inbox, and the actual received email was opened there.
4. The email's one-time binding code was returned in the original Discord DM. Backend completion at
   06:14:02 UTC recorded `website:email-verified`. Exactly one verified production link points to the
   original member and the correct DM. No manual database insertion was used to claim completion.
5. Real member status then resolved; resource search returned three AI resources, and resource detail
   returned the published Hugging Face course. The shared discovery skill was actually read.
6. Real event search for published 2026 sessions returned `empty`. Event detail for an explicitly
   nonexistent test UUID returned `not_found`. Positive event-detail acceptance is unavailable because
   this queried catalog has no event fixture; no fabricated production event was created.
7. Public #ask-nori invoked native web search and fetch. It correctly rejected a similarly named site;
   a follow-up fetched the actual Foundation homepage/community page and returned public source links.
8. The job-matching skill was actually read in the SSH session sandbox. Native search started with
   80,000 Hours and fetched the employer posting for Staff+ Software Engineer, Safeguards Evals
   (Anthropic/Greenhouse), with a distinct unverified-lead group. No application, registration or
   personal-profile submission occurred. This verifies tool execution, not every generated statement
   or job availability beyond the source snapshot; one rendered bare URL included trailing punctuation.

A live status reply wrongly inferred "email not submitted/sent" from `awaiting_email` despite the
email having been sent. PR #115 clarifies the tool description and output: verification is incomplete;
this status alone establishes neither delivery nor registration. Its local regression passed 41 tests;
PR #115 passed required CI (plugin/integration/check; unrelated channel/router jobs skipped by path rules)
and deployed `0e7a0f2` at 06:22:48 UTC. Real DM status then returned the new explanation, and Nori
explicitly said the state does not disclose email delivery/registration. The existing verified link
remained intact; a separate unused test binding session expires automatically. Initial invalid arguments in status/completion
were rejected and the agent retried successfully; errors are not counted as successful calls.

## Preservation and evidence handling

The configuration operation held the updater lock, refused an active transaction/queue, validated its
candidate, and backed up five Agent databases plus original configuration before restart. The first
post-cutover comparison found zero missing transcript rows/session keys/windows, including 6,896 main
transcript rows. Main agent entries, defaults, Slack channel config and scoped router policy matched.
Both native agent health probes passed; unauthenticated Gateway requests remained rejected.

Private backups and receipts remain outside Git under `/var/backups/nori-community-access-20261118`
and the task's private staging directory. Do not commit account identifiers, email codes, binding URLs,
raw transcripts, credentials or private database copies. No vendor files changed. Health checks are
separate from the real Discord/email evidence above. Final restart acceptance passed: Discord member status remained resolved, public resource search and
web search returned actual results again, and the original Slack task thread performed two successful
`rein_continuation` reads (status/read_summary), retaining complete/succeeded, one attempt, its original
native lifecycle receipt, and a summary with no expiry. Native transcripts show DeepSeek v4.1 Flash
for these final turns. Post-restart historical-row comparison again found zero missing records.
The scoped test account is verified against the original member; it was not left unlinked.

Slack acceptance: https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1795069393902539

The requested access/onboarding restoration is accepted with the event-data limitation above; it does
not establish universal onboarding wording quality, positive event fixtures, or completion of the full roadmap.
