# Private Slack development channel

The `development-complex-coding` route policy requires all of:

- A native user request in an explicitly configured private, unshared Slack channel, routed to its dedicated agent.
- Current Slack membership and a genuine Slack join event naming an operator-configured invitation administrator. Configured administrators must also be current members.
- A linked Rein identity with a current active Contributor, Director or administrator role, resolved through the Foundation signed-ingress API.
- Confident complex-development classification for premium models. Routine terminal work uses ordinary configured models.

Membership alone never grants access. Prompt text, manual model selection and fallback routes cannot override these checks. Each task is checked again; every tool invocation rechecks current Slack membership and backend authority. No role or membership cache is used. API errors and missing invitation evidence deny access. If Slack history retention removes the join event, an administrator must remove and re-invite that member.

## Configuration

In Magpie → Dynamic Router, select the authorized development-channel access policy for every OpenAI provider alias. Advanced settings list invitation administrators as `slack/accountId/userId` and development channels as `accountId/workspaceId/channelId/agentId`.

An example plugin configuration fragment:

```json
{
  "adminSenders": [{ "channel": "slack", "accountId": "default", "senderId": "UADMIN01" }],
  "developmentChannels": [{
    "accountId": "default", "workspaceId": "TWORK001", "channelId": "CDEVEL01",
    "agentId": "nori-development", "botTokenEnvVar": "SLACK_BOT_TOKEN"
  }]
}
```

The channel must also be included in the native Slack allowlist, Foundation `workspaces[].nativeChannelIds`, and the Foundation service caller's channel allowlist. Bind that native channel to `nori-development` using OpenClaw's channel peer binding. Keep the Foundation URL at its canonical HTTPS origin; redirects are rejected by the signed backend transport.

Create the agent before enabling the development-channel configuration. It must explicitly use `sandbox.mode: "all"`, a supported sandbox backend, and `tools.elevated.enabled: false`; the plugin rejects missing isolation. Restrict its available tools to development tools. Keep credentials, production working directories and administrative privileges outside that environment. An SSH backend requires a dedicated unprivileged account, a verified host key and a separate seed workspace; see the pinned [OpenClaw SSH backend documentation](../vendor/openclaw/docs/gateway/sandboxing/ssh-backend.md).

Users must complete Rein identity binding through an ordinary Nori channel before using the development channel, because the development agent rejects unbound requests. The invitation administrator's Slack account is not automatically a Foundation administrator.

Slack's native restriction on who can invite to private channels requires an eligible Enterprise plan ([Slack documentation](https://slack.com/help/articles/29661601203603-Limit-channel-invitations-in-an-Enterprise-organization)). On other plans members may still invite through Slack's UI; Nori rejects invitations from accounts outside the configured administrator list. The backend role requirement also remains mandatory.

## Validation

Run `node --test tests/router-development.test.mjs tests/router-foundation-admin.test.mjs tests/subscription-router.test.mjs tests/router-console.test.mjs` and the repository checks. For live acceptance use a verified test account, a short-lived synthetic backend identity and two small cases: inspect terminal/runtime versions, then bootstrap and test a tiny local project. Verify actual tool execution and revoke the synthetic role/link afterward. Do not include tokens, live member records or private runtime transcripts in evidence committed to Git.
