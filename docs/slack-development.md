# Private Slack development and native automation

Ordinary work from a configured trusted private Slack channel requires current Slack membership,
not a Foundation Contributor or Director role. Business tools keep their own backend role checks.
The optional [trusted Slack ACP controller](director-acp.md) keeps bounded harness delegation,
status, cancellation, progress and results.

Router no longer blocks every development-agent run or tool call when no live Slack sender is
present. OpenClaw owns native Cron, child and memory execution admission and capability inheritance.
Rein continues to enforce Provider eligibility, billing, quota and scoped usage limits. Background
runs use the effective native agent default or job override; Jev does not reselect their model.
Each non-scoped fallback candidate must be eligible and follow the configured fallback order.
Scoped native candidates are checked before credential lookup/network; ordinary user fallback is retained.
`nativeAgentRoutes` is an optional eligibility list, not a Cron model selector. Coding Plan and administrator-only routes remain excluded. A full-subscription development-tag
route requires explicit `nativeAgentRoutes` eligibility for the Agent; omission does not widen access.

## Configuration

In Magpie → Dynamic Router, the development access policy applies to complex-development model
selection from current Slack members. Advanced settings list channels as
`accountId/workspaceId/channelId/agentId`. Legacy `admin-complex-coding` alone retains its Foundation
administrator check. Native channel, tools, agent collaboration and Cron settings remain in the
OpenClaw Dashboard/configuration.

Example Router plugin fragment (synthetic identifiers):

```json
{
  "developmentChannels": [{
    "accountId": "default", "workspaceId": "TWORK001", "channelId": "CDEVEL01",
    "agentId": "nori-development", "botTokenEnvVar": "SLACK_BOT_TOKEN"
  }],
  "trustedSlackChannels": [{
    "accountId": "default", "workspaceId": "TWORK001", "channelId": "CDEVEL01",
    "agentId": "nori-development", "botTokenEnvVar": "SLACK_BOT_TOKEN"
  }],
  "nativeAgentRoutes": { "nori-development": ["openai-general"] }
}
```

`trustedSlackChannels` defaults to `developmentChannels` when omitted. An explicit empty list
permits no Rein automation creation. It can name an approved ordinary agent, including `main`,
without enabling the sandboxed-development model policy. The approved agent must not also own
public Community Discord ingress. Native public-to-internal spawn/send policy must stay closed;
allowed internal collaboration remains available. Indirect public-to-worker-to-internal paths
and native-normalized target IDs are checked too. Other channels retain their native admission and
routing: they do not acquire this Slack creation permission.

### Console refresh and host policy ownership

Keep `trustedSlackChannels` and `nativeAgentRoutes` in the host's
`plugins.entries.rein-router.config`, managed through native Dashboard/configuration. Console
settings do not duplicate either policy. Polling, other UI saves and a fresh Console init preserve
explicit host values and validate them against the new compiled routes before publication.

Omitting `trustedSlackChannels` continues to inherit the current `developmentChannels`; saving a
changed/empty development list updates that inheritance. Explicit `trustedSlackChannels: []`
revokes creation and cannot be repopulated from compiler defaults. Explicit `nativeAgentRoutes: {}`
removes explicit route grants, including development-subscription qualification; it does not mean
a blanket denial of otherwise unrestricted default routes. An Agent entry `"main": []` denies that
Agent every native route. Empty containers remain explicit; omission remains omitted.

If a catalog/funding change invalidates a host route qualification, publication returns
`router_host_policy_invalid`, preserves the host/Console configuration and disables the owned
keys. Restore the route or deliberately update the host policy, then retry. Console does not
silently remove the restriction or repair it into another Provider. Automatic UI recommendation
repairs are saved only after successful policy validation/publication. Once validation succeeds,
Console intent is persisted before key/config publication so later activation failures keep the
same intended settings and leave keys disabled. Concurrent host edits retain the existing
compare-before-replace guard.

Automation creation/expansion needs **both** current trusted Slack ingress and native creation
permission. Configure native `commands.ownerAllowFrom`, for example
`["slack:UALICE01", "slack:UBOB0001"]`, only for actual approved creators, plus the native Slack
channel allowlist and exact agent binding. A channel member missing native creation permission is
still refused by OpenClaw. Do not infer ownership from model arguments or set synthetic owner flags.
No Foundation workspace, account binding or role lookup is needed for ordinary development or Cron.
Business tools still require their separately configured backend authority.

The hook covers `automations`, `cron` and compact `tool_call` envelopes, including trimmed actions.
It checks the current host requester for add/update, refuses executor retargeting, and writes a
searchable `[Nori creation v1 workspace=… account=… channel=… user=…]` description line. Native owner
fields are retained. The line supports Dashboard display/search and management; it is not a signed
credential. Description edits preserve an existing line only from the same native owner
agent/account/session. Old ownerless or mismatched records cannot be description-edited through
this adapter; manage them without changing description, or use the native administrator Dashboard.
Declaration convergence retains the original description. Native read/control, exact disable and
self-removal retain native scope. Announce destination and message-tool permission remain distinct.

A development agent still explicitly requires `sandbox.mode: "all"`, a supported sandbox backend,
and `tools.elevated.enabled: false`. Keep production resources outside that environment. See the
[pinned native SSH sandbox documentation](https://github.com/openclaw/openclaw/blob/4a11f89e840b2bb3eedcad2820ab25b8520905b6/docs/gateway/sandboxing/ssh-backend.md).

## Validation

With the repository toolchain on PATH, run:

```sh
node --test tests/router-development.test.mjs tests/sa-ops-cron-ingress.test.mjs
node scripts/probe-sa-ops-authority.mjs
node scripts/verify-sa-ops-cron.mjs
node scripts/verify-director-acp.mjs
node scripts/check.mjs
```

See [#66 evidence and limits](sa-ops-native-authority.md). Local Cron uses the actual pinned
scheduler/store/tools with synthetic transport and loopback inference. It is not real-user Slack,
production, paid Provider or complete memory or broad child-continuation acceptance. The bounded native child spawn,
senderless execution and parent-result path is verified separately in run11. Enabling/disabling the plugin
changes only its extension hooks/provider; native admission and management stay native.
