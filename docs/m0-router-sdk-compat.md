# M0 Magpie SDK compatibility checkpoint

Requirement: Super Agent PRD §2.3 / M0; part of [compatibility task #56](https://github.com/rein-protocol-foundation/nori-agent/issues/56).
Date: November 8, 2026 (America/Los_Angeles).

## Observed failure and fix

The official OpenClaw candidate `9fb5cdc3039aa23bb4a8bba828ad0820d6bbab5e` passes an opaque
SecretRef sentinel through provider stream options. Comparing it with plaintext Magpie key bytes
caused `rein_router_gateway_credential_mismatch`; the actual gateway fixture made zero upstream
inference requests. The host's secret-sentinel egress contract is documented in
`docs/gateway/secrets/runtime-model.md` at that upstream revision.

The router already owns its credentials through validated configuration. It now ignores the caller's
`apiKey` hint and always uses its configured key, replacing Authorization and removing alternate
accepted credential headers before transport. It neither resolves nor forwards the supplied hint.
This also applies to a forged plaintext hint. A hint cannot fill a missing configured key, select a
route, change the endpoint, or grant a run admission. The former equality check was not an admission
boundary: callers could already omit that hint and use the configured key.

The following enforcement stays at its authoritative boundary:

- Exact host provider/endpoint and configured credential-source validation at registration.
- Trusted agent/channel/sender/run admission and hard eligible route limits.
- Configured managed-key format, per-route singleton catalog verification and budget reservation.
- Exact outbound model/effort, explicit ordered fallback and output/request limits.
- Every accepted authentication header bound to the selected configured credential.

Secret sentinels remain enabled. No private upstream resolver or compatibility bypass is used.
Generated standalone router fragments also declare `modelPolicy.allow` explicitly, preserving the
same exact route set when newer hosts treat `models` as settings rather than an implicit allowlist.
Console merging continues to preserve separately authored host policies.

## Native proof improvements

The synthetic channel fixtures use native route resolution and explicit bindings rather than
inventing per-turn session suffixes. The separate budget agent has its own bound test channel.
They wait for actual final delivery when dispatch queues a turn, and recognize the actual user
request even when native per-turn metadata follows it. The Slack catalog assertions decode the
new named tool envelope and still assert exact tool identity and business status.

## Oracle evidence

Both the delivered upstream pin `4a11f89e840b2bb3eedcad2820ab25b8520905b6` and candidate
`9fb5cdc3039aa23bb4a8bba828ad0820d6bbab5e` were tested in independent OCI checkouts:

- Full Node suite: **1,282 passed, 2 existing conditional skips, zero failures**, on each pin.
- Actual OpenClaw + pinned Magpie: agent/platform/channel selection, ordered 503 fallback, explicit
  empty fallback, forbidden paid route, output caps, daily-budget exhaustion and native settlement pass.
- All six native workspace/shared-skill CLI cases pass on each pin.
- Native Slack synthetic ingress, two users, DM/channel/thread memory, forget, backend actor/Board
  checks and all four catalog tools pass on each pin.
- Unit boundary checks demonstrate that opaque/forged hints and headers never reach transport,
  while a missing configured singleton credential still refuses inference.

Candidate checkout: `/home/ubuntu/nori-m0-sdk-20261101`.
Current-pin checkout: `/home/ubuntu/nori-m0-router-compat-validation`.
These checks use synthetic accounts/providers and are not live two-account M0 acceptance.

## Runtime impact and rollback

Purpose: keep Magpie routing compatible with native SecretRef handling while preserving configured
credential ownership. Deployment changes router source and preparation/test code. No upstream pin,
provider account, permission, workspace, session or runtime config migration is included. Existing
valid requests keep their configured route/key. A supplied stream-option key is ignored rather than
compared or used; a missing configured key still fails. Rollback is the previous source release;
no state conversion is introduced. Shared-Gateway activation, auxiliary/media compatibility and full
M0 acceptance remain pending in #54–#57.
