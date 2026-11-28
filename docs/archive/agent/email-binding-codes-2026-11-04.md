# Direct email binding codes — 2026-11-04

Implements the R02 identity-binding simplification requested after a mobile Discord onboarding test.
The person opens Nori's initial website link, enters their registered email once, receives the
binding code in that email, and returns it to Nori from the same chat account. There is no new
confirmation-page visit or repeated email entry. Nori's tool descriptions and discovery skill
now explain this flow, while continuing to accept legacy website-issued binding codes.

## Website and backend

The implementation lives in the sibling `ReinProtocol` website/backend repository:

- `lib/identity/link-actions.ts` sends the binding code only by email; no secret is returned to the browser.
- `lib/identity/linking.ts` uses the new service-only issuer and the existing random binding-code format.
- `rein_email_binding_codes` migration retains `awaiting_email` until the code is redeemed by
  the authenticated platform/workspace/user tuple. It checks current registration and completes
  the binding atomically; it does not create contacts or grant roles.
- Resends invalidate earlier codes. Code expiry, attempt limits, revoked-link tombstones,
  and the single-Slack-account rule are retained. The Slack rule no longer blocks Discord.
- Old receipt links remain usable for requests already in flight. The request form hides the
  email field after success and supports resending without retyping it.

## Verification boundary

All checks used synthetic data and an isolated local PostgreSQL 17 instance; no production
member records were changed and no live Slack/Discord messages or emails were sent.

- Website: 349 unit/component/route tests passed; TypeScript and production webpack build passed.
- SQL: 244 pgTAP assertions passed (80 existing identity, 42 guarded-write, 122 direct-email cases).
  The new cases exercise Discord and Slack against both environment prefixes.
- Real two-connection races: emailed-code redemption, tuple conflict, single-Slack conflict,
  revocation-before-completion and revocation-versus-write all passed.
- Nori: 1,223 tests passed, 2 skipped, 0 failed (including 29 binding/transport checks).
  Scaffold checks and real OpenClaw plugin-loader verification passed.

Deployment order is database migration, website/backend, then Nori tool/skill updates.
These are local source changes. Production migration, deployment and live mail/platform
acceptance are not covered by the local test results.

## PR branch verification

The PRs were prepared from each repository's latest `origin/main`, excluding unrelated
paper-template, job-matching and GitHub-announcement work. On the isolated PR branches,
all 372 website unit/component/route tests and TypeScript checks passed; Nori's 29 targeted
binding/transport tests and scaffold checks passed. The earlier full Nori and database
results above describe the implementation workspace verification.
