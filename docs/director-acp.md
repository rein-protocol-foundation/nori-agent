# Director-only ACP coding slice

Requirement **R-ACP-01 / AC-ACP-01** (user-confirmed): a Director can delegate a small coding task from Slack, using a flow similar to Slack-directed development, and receive the subagent's status and result. Contributor access to ordinary sandboxed development does not grant ACP access.

The opt-in local plugin is `plugins/rein-acp`. It uses the existing private Slack membership check and signed Foundation identity relay, with the stricter predicate `is_director === true`. An administrator flag, Contributor role, prompt claim or prior Director result is insufficient. Each human turn and each spawn/list/wait/cancel call rechecks current authority. Missing identity, revocation, timeout and backend errors deny access.

## Flow

1. A Director sends a task in the configured private Slack conversation. Identity binding must already have been completed through ordinary Nori.
2. Nori verifies current channel membership and current Foundation Director authority.
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
    "allow": ["rein-acp", "rein-operations", "acpx", "slack"],
    "load": { "paths": ["/path/to/rein-agent/plugins/rein-acp", "/path/to/rein-agent/plugins/rein-operations"] },
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

Also configure the ordinary parent model/provider, Slack admission and progress presentation, and `rein-operations.config.foundationDb` as in [setup](setup.md). The channel must appear in the Foundation workspace and caller allowlists. The local plugin reuses sibling `rein-router` and `rein-operations` modules; load from this repository checkout. It is not a standalone published package.

This small slice deliberately has no direct ACP channel bindings or Slack `/acp` command entry: those bypass the model/tool authorization path. Startup rejects ACP bindings or enabled Slack command admission. `commands.allowFrom.slack: []` disables Slack commands throughout this pilot profile, so do not merge that setting into an existing shared deployment without accounting for its command users. Native `sessions_spawn` ACP calls outside the configured controller are blocked while this plugin is enabled. Gateway operators retain their normal administrative authority.

The installed ACP backend must be healthy and the chosen external harness authenticated. Persistent/thread-bound ACP sessions, resume IDs, caller-selected harness/model/cwd, additional tools and recursive delegation are outside this slice. Configure native concurrency and run-time limits for the pilot. Ordinary Slack development and Router premium-model policy are unchanged; the ACP harness has its own model/auth configuration.

## Verification and acceptance

```sh
node --test tests/director-acp.test.mjs tests/router-development.test.mjs tests/router-foundation-admin.test.mjs
node scripts/verify-director-acp.mjs
node scripts/check.mjs
```

Use the repository's supported Node/toolchain. The native verification script starts an isolated loopback Gateway, loads the real plugin, supplies synthetic signed-identity responses, exercises native Slack ingress and ACP task admission, then checks task status, progress and parent completion. Slack transport, model responses and the ACP harness are fixtures; this is not live provider or live Slack acceptance.

Local verification on 2026-11-04: 1,230 repository tests passed, two skipped, zero failures; the native fixture verified a running ACP task, an `ok` terminal event and completion delivery to the original Slack thread. Scaffold and whitespace checks passed. The same native probe is included in the plugin CI job; no remote CI run is claimed here.

Live pilot acceptance remains a separate operator action: confirm the deployed revision and healthy backend, send one tiny coding task from a linked Director, inspect its running state and final result in the same thread, then confirm Contributor denial and role-revocation denial. Record only redacted outcomes. No real account setup, Slack message, deployment, paid harness request or production member-data change is performed by the local checks.

中文摘要：Director 在指定 Slack 私有频道下达任务 → 实时校验频道成员与 Director 身份 → 启动单次 ACP 子任务 → 原会话回报已接收、运行状态及最终结果。查询/等待/取消均重新鉴权；Contributor 和仅管理员身份不能进入。现有沙箱开发入口保持不变，ACP 使用独立试点 profile。自动测试使用本地模拟后端，真实 Slack／外部编程工具验收另行执行。
