# Private Slack development channel

Development access requires two conditions:

1. The requester is a current member of the private Slack channel configured in Router, using its native channel route and dedicated agent.
2. The requester has a linked Rein identity with a current active Contributor or Director role, resolved through the Foundation signed-ingress API. Administrators qualify through their Director role; an administrator flag alone does not grant development access.

Invitation history and the legacy administrator list are not authorization inputs. Each task is checked again; every tool invocation rechecks current Slack membership and backend authority. No role or membership cache is used. API errors deny access. Slack history retention does not affect authorization.

The `development-complex-coding` model policy additionally requires confident complex-development classification. Routine terminal work uses ordinary configured models. Prompt text, manual model selection and fallback routes cannot override the access or model restrictions.

## Configuration

In Magpie → Dynamic Router, select the authorized development-channel access policy for every OpenAI provider alias. Advanced settings list development channels as `accountId/workspaceId/channelId/agentId`. The administrator list only applies to legacy `admin-complex-coding` routes.

An example plugin configuration fragment:

```json
{
  "developmentChannels": [{
    "accountId": "default", "workspaceId": "TWORK001", "channelId": "CDEVEL01",
    "agentId": "nori-development", "botTokenEnvVar": "SLACK_BOT_TOKEN"
  }]
}
```

The channel must also be included in the native Slack allowlist, Foundation `workspaces[].nativeChannelIds`, and the Foundation service caller's channel allowlist. Bind that native channel to `nori-development` using OpenClaw's channel peer binding. Keep the Foundation URL at its canonical HTTPS origin; redirects are rejected by the signed backend transport.

Create the agent before enabling the development-channel configuration. It must explicitly use `sandbox.mode: "all"`, a supported sandbox backend, and `tools.elevated.enabled: false`; the plugin rejects missing isolation. Restrict its available tools to development tools. Keep credentials, production working directories and administrative privileges outside that environment. An SSH backend requires a dedicated unprivileged account, a verified host key and a separate seed workspace; see the pinned [OpenClaw SSH backend documentation](../vendor/openclaw/docs/gateway/sandboxing/ssh-backend.md).

Users must complete Rein identity binding through an ordinary Nori channel before using the development channel, because the development agent rejects unbound requests. Slack workspace administration alone does not establish a Rein Director role.

Slack channel membership is managed through Slack. Nori checks current membership and the linked Rein role regardless of who invited the member.

## Validation

Run `node --test tests/router-development.test.mjs tests/router-foundation-admin.test.mjs tests/subscription-router.test.mjs tests/router-console.test.mjs` and the repository checks. For live acceptance use a verified test account, a short-lived synthetic backend identity and two small cases: inspect terminal/runtime versions, then bootstrap and test a tiny local project. Verify actual tool execution and revoke the synthetic role/link afterward. Do not include tokens, live member records or private runtime transcripts in evidence committed to Git.
