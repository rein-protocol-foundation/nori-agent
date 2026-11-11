# Trusted Slack ACP coding slice

**Production status (2026-11-06):** the operator has replaced this restricted controller
policy in the production Slack profile with [trusted host access](trusted-slack-host-access.md).
The rein-acp policy plugin is disabled there; acpx remains configured. The instructions below
describe the opt-in restricted slice and its pilot configuration, not current production
Slack authorization. Re-enabling it requires restoring its matching controller tool policy.

Requirement **R-ACP-01 / AC-ACP-01**, updated by SA-OPS-01/#66: current members of the configured trusted private Slack channel can delegate ordinary coding work without a Foundation Director or Contributor role. The `rein-acp` compatibility package and `director-control` example agent name remain unchanged. True business-role requirements in `rein-operations` are unaffected.

The opt-in plugin uses current private Slack workspace/channel membership. Each human turn and spawn/list/wait/cancel call rechecks membership and its host requester; missing identity, membership revocation, timeout and Slack errors deny new control. It does not use a Foundation identity relay.

## Flow

1. A current channel member sends a task in the configured private Slack conversation.
2. Nori verifies the current host requester and private Slack workspace/channel membership.
3. The dedicated controller invokes native `sessions_spawn` with the configured harness and working directory, `runtime: "acp"`, `mode: "run"`, `thread: false`, and `streamTo: "parent"`.
4. The requester receives the accepted task identifier. Native OpenClaw ACP progress is relayed to the parent; Nori reports progress in the originating conversation/thread.
5. A status request uses native `subagents` with `action: "list"`; waiting and cancellation use `wait` and `cancel`. Native task ownership restricts these actions to the controller's session tree.
6. Native task completion returns the result to the parent. Nori reports success, failure, timeout or cancellation, plus changes and validation. Runtime completion turns are report-only and cannot spawn another task from child output.

Queued/accepted does not mean running or completed. Only actual task/runtime evidence establishes status. A restarted gateway uses OpenClaw's persisted task and completion-delivery state; this plugin retains only in-flight human tool authorization, which must be re-established by a new user request after restart. Revocation blocks subsequent control calls; it does not retroactively undo already admitted external work.

## Configuration and execution boundary

Use a dedicated pilot Gateway profile with its own private Slack channel. ACP runs in an external host harness: the OpenClaw sandbox does not wrap it, and sandboxed parents cannot spawn ACP. Keep the existing `nori-development` agent sandboxed. Create a separate `director-control` agent with sandbox explicitly off, elevated tools disabled, and the explicit ACP capability surface shown below. OpenClaw requires coding capabilities in the inherited tool surface before it admits an external harness; the plugin blocks every local file/shell tool call by this controller and permits only delegation and task control. Configure the external harness with its own workspace/OS permissions; `cwd` chooses a directory, not a filesystem security boundary.

Example fragment (synthetic identifiers and paths; merge into a configured pilot profile):

```json
{
  "agents": {
    "entries": {
      "director-control": {
        "sandbox": { "mode": "off" },
        "tools": {
          "elevated": { "enabled": false },
          "allow": ["sessions_spawn", "subagents", "apply_patch", "edit", "exec", "process", "read", "write"]
        }
      },
      "codex": { "workspace": "/srv/rein-acp/pilot" }
    },
    "defaults": { "subagents": { "runTimeoutSeconds": 300 } }
  },
  "acp": {
    "enabled": true,
    "backend": "acpx",
    "allowedAgents": ["codex"]
  },
  "commands": { "allowFrom": { "slack": [] } },
  "tools": { "sessions": { "visibility": "tree" } },
  "bindings": [{
    "agentId": "director-control",
    "match": { "channel": "slack", "accountId": "default", "peer": { "kind": "channel", "id": "CFIXTURE1" } }
  }],
  "plugins": {
    "allow": ["rein-acp", "acpx", "slack"],
    "load": { "paths": ["/path/to/rein-agent/plugins/rein-acp"] },
    "entries": {
      "acpx": { "enabled": true },
      "rein-acp": {
        "enabled": true,
        "hooks": { "allowConversationAccess": true },
        "config": {
          "enabled": true,
          "channel": {
            "accountId": "default",
            "workspaceId": "TFIXTURE1",
            "channelId": "CFIXTURE1",
            "agentId": "director-control",
            "botTokenEnvVar": "SLACK_BOT_TOKEN"
          },
          "harnessAgentId": "codex",
          "cwd": "/srv/rein-acp/pilot"
        }
      }
    }
  }
}
```

Also configure the ordinary parent model/provider, native Slack admission and progress presentation as in [setup](setup.md). Foundation configuration is not required for ordinary ACP. The local plugin reuses the sibling `rein-router` membership helper; load from this repository checkout. It is not a standalone published package.

This small slice deliberately has no direct ACP channel bindings or Slack `/acp` command entry: those bypass the model/tool authorization path. Startup rejects ACP bindings or enabled Slack command admission. `commands.allowFrom.slack: []` disables Slack commands throughout this pilot profile, so do not merge that setting into an existing shared deployment without accounting for its command users. Native `sessions_spawn` ACP calls outside the configured controller are blocked while this plugin is enabled. Gateway operators retain their normal administrative authority.

The installed ACP backend must be healthy and the chosen external harness authenticated. Persistent/thread-bound ACP sessions, resume IDs, caller-selected harness/model/cwd, additional tools and recursive delegation are outside this slice. Configure native concurrency and run-time limits for the pilot. Ordinary Slack development and Router premium-model policy are unchanged; the ACP harness has its own model/auth configuration.

## Verification and acceptance

```sh
node --test tests/director-acp.test.mjs tests/router-development.test.mjs tests/router-foundation-admin.test.mjs
node scripts/verify-director-acp.mjs
node scripts/check.mjs
```

Use the repository's supported Node/toolchain. The native verification script starts an isolated loopback Gateway, loads the real plugin, supplies synthetic Slack membership responses, exercises native Slack ingress and ACP task admission, then checks task status, progress and parent completion. Slack transport, model responses and the ACP harness are fixtures; this is not live provider or live Slack acceptance.

Current local verification is recorded in [SA-OPS-01/#66 evidence](sa-ops-native-authority.md). The real pinned native ingress and ACP task runtime admit a trusted member without a Foundation role, reject a non-member, and report running status, progress and final result to the original Slack thread. Transport, inference and harness execution are synthetic. The earlier 2026-11-04 Director-only result is historical and does not define the current role policy.

Live pilot acceptance remains a separate operator action: verify the deployed revision/backend, send a tiny task from an approved current member, inspect running/final delivery, then verify membership-revocation denial. No real account setup, Slack message, deployment, paid harness request or production member-data change is performed by these local checks.

中文摘要：指定 Slack 私有频道的当前成员可委派普通 ACP 工作，无需 Foundation Contributor/Director 角色。保留固定 harness/cwd、单次任务、状态/等待/取消与原线程进度和结果；业务工具自己的角色检查不变。测试使用真实 native ACP 流程及本地合成后端，不代表真实 Slack 或生产验收。
