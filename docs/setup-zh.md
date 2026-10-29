# 安装与本地运行

[English](setup.md)

本文介绍仓库内 OpenClaw 运行时与 `rein-operations` 插件的本地初始化流程。该流程不会配置聊天平台或模型供应商，也不会启用治理政策。提案与投票工具默认使用合成数据进行模拟；下文介绍的后端治理、身份绑定与社区查询工具只有在操作员显式启用后才会注册。

本文与英文 [setup.md](setup.md) 同步维护，配置依据当前插件 schema 与启动脚本。Agent 通过已认证的 Foundation 后端 API 工作，不持有数据库凭据，也不通过个人资料邮箱解析身份。历史验收记录见[实施与部署指南](implementation-and-deployment-zh.md)。

## Discord 多成员隐私

在将本地配置用于多名社区成员之前，请先阅读[会话与记忆审计](discord-session-privacy-audit-2026-10-13.md)。所固定的原生运行时按频道共享服务器内的对话上下文；私信隔离不会改变这一点。该原生配置缺少按成员划分的会话路由和按所有者隔离的持久记忆。可选的 [Rein 隔离适配器](discord-user-isolation.md)在专用配置中实现了这两项能力；其原生处理链路探针使用合成发送者，真实双账号验收仍待完成。

[隐私配置片段](../config/discord-privacy.example.json)限制文件系统与会话工具，并禁用共享记忆的召回与写回。请审阅后将相关字段合并到本地配置；它既不是独立配置，也不是完整的逐用户隔离方案，不会开启私信。公共工作区必须使用[共享 USER 模板](../templates/community-user.example.md)，不能使用操作员私有的 `USER.md`、记忆目录或运行时状态。仅将已批准的公共政策放入受限工作区，不要允许任意读取父目录。

`npm run toolchain:pnpm -- run audit:discord-privacy -- <config-path>` 会输出选定的政策信息，不含凭据。只要服务器会话仍按频道共享，它就会按设计以非零状态退出，即使已经应用上述片段也是如此。完成上游构建后，`npm run toolchain:pnpm -- run probe:discord-routing` 可使用合成标识符复现原生路由行为；这不等于真实用户验收。

## 环境要求

- Node.js `>=24.16.0 <25` 或 `>=26.1.0`，推荐 Node 26。该要求与上游 `engines` 一致；源码运行时不支持 Node 22。
- pnpm `12.4.2`，由 `packageManager` 固定。下文通过 npm 使用项目内的版本，全局安装或启用 Corepack 均为可选项。
- 支持子模块的 git。
- 首次安装依赖时可访问网络。

以下命令均在仓库根目录执行；如果尚未克隆仓库，先完成第 1 步。已有 npm 且 `.toolchain/` 不存在时，执行一次以下命令，准备被 Git 忽略的项目内工具链：

```sh
npm install --prefix .toolchain --no-save --package-lock=false node@24.16.0 pnpm@12.4.2
```

该命令只安装到 `.toolchain`，不会全局安装。Git 克隆不包含此目录。如果下面的版本检查已经通过，可跳过安装。默认流程不需要修改 `PATH`：`toolchain:pnpm` 脚本通过 `npx` 调用固定的本地工具链，因此即使系统默认 `node` 较旧，也能从普通 shell 运行。仓库中必须已有 `.toolchain/`，否则命令会失败。

```sh
npm run toolchain:pnpm -- --version      # 预期为 12.4.2
npm run toolchain:pnpm -- exec node -v   # 预期为支持的版本，例如 v24.16.x
```

`--` 后的所有参数都会传给工具链中的 pnpm，因此其他章节的安装与构建命令也使用 `npm run toolchain:pnpm -- <args>`。下表列出本文脚本的完整调用方式，均不需要导出 `PATH`。

| 命令 | 用途 |
| --- | --- |
| `npm run toolchain:pnpm -- install` | 安装根目录的 Rein 工作区依赖 |
| `npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile` | 安装上游依赖 |
| `npm run toolchain:pnpm -- --dir vendor/openclaw build` | 构建上游，包括 Control UI |
| `npm run toolchain:pnpm -- run setup:local` | 运行 `setup:local`，生成隔离的本地配置 |
| `npm run toolchain:pnpm -- run check` | 运行 `check`，检查项目骨架与政策 |
| `npm run toolchain:pnpm -- test` | 通过 Node 测试运行器执行测试套件 |
| `npm run toolchain:pnpm -- run verify:plugin` | 在真实加载器层面验证插件 |
| `npm run toolchain:pnpm -- run verify:proposal-tools` | 在真实加载器层面验证 v2 提案工具 |
| `npm run toolchain:pnpm -- openclaw plugins list --verbose` | 通过工具链调用上游 CLI，列出插件详情 |
| `npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json` | 查看运行时工具注册情况 |
| `npm run toolchain:pnpm -- openclaw plugins doctor` | 插件诊断 |
| `npm run toolchain:pnpm -- openclaw gateway run` | 在前台运行本地网关 |
| `npm run toolchain:pnpm -- openclaw gateway start` | 后台启动项目网关 |
| `npm run toolchain:pnpm -- openclaw gateway stop` | 优雅停止项目的后台或前台网关 |
| `npm run toolchain:pnpm -- openclaw gateway restart` | 使用新配置与凭据重启项目网关 |
| `npm run toolchain:pnpm -- openclaw gateway status` | 查看项目实例状态 |
| `npm run toolchain:pnpm -- openclaw gateway health --port 18791` | 从第二个终端检查网关健康状态 |
| `npm run toolchain:pnpm -- openclaw doctor` | 运行时诊断 |
| `npm run toolchain:pnpm -- run smoke:gateway` | 经过认证调用 `rein_status`，执行网关级冒烟测试 |
| `npm run toolchain:pnpm -- openclaw gateway auth-token --show` | 显示共享令牌 |

可选的 Model Router、Dynamic Router 和 Magpie 网关也使用同一 npm 入口。[中文快速上手](model-router-quickstart-zh.md)介绍配置与片段合并；[Magpie 升级指南](magpie-upgrade-zh.md)介绍备份、兼容性检查和回滚。初始化 Magpie 还需要 Git 和 Go。以下命令无需全局安装 pnpm：

| 命令 | 用途 |
| --- | --- |
| `npm run toolchain:pnpm -- run magpie:setup` | 构建锁定版本的项目内 Magpie |
| `npm run toolchain:pnpm -- run magpie:setup --check` | 检查已准备的版本和二进制摘要，不执行构建 |
| `npm run toolchain:pnpm -- run magpie -- version` | 显示已准备的 Magpie 版本 |
| `npm run toolchain:pnpm -- run router:ui` | 启动集成的 Magpie Providers 与 OpenClaw Router 界面，自动同步模型 |
| `npm run toolchain:pnpm -- run magpie:ui` | 集成 Router Console 的别名 |
| `npm run toolchain:pnpm -- run magpie:ui:native` | 启动独立原生供应商界面，供手动或旧版配置使用 |
| `npm run toolchain:pnpm -- run magpie -- --allow-subscription-accounts models` | 列出已配置的模型目录 |
| `npm run toolchain:pnpm -- run magpie -- --allow-subscription-accounts accounts` | 列出私有供应商账号 |
| `npm run toolchain:pnpm -- run magpie:import-bailian` | 在网关停止时导入现有的本地百炼配置 |
| `npm run toolchain:pnpm -- run magpie:prepare-key runtime/magpie/router.quickstart.local.json` | 准备仅限已声明模型目录使用的密钥 |
| `npm run toolchain:pnpm -- run magpie:prepare-key --replace runtime/magpie/router.quickstart.local.json` | 在网关停止时，为有意进行的模型目录变更替换密钥 |
| `npm run toolchain:pnpm -- run config:subscriptions runtime/magpie/router.quickstart.local.json --output runtime/magpie/openclaw-router.fragment.json` | 生成私有 JSON 片段，供人工审阅和合并 |
| `npm run toolchain:pnpm -- openclaw secrets store set TYPESAFE_API_KEY --kind secret --allow-host api.typesafe.ai` | 交互式保存 Dynamic Router 使用的 Jev 密钥 |
| `npm run toolchain:pnpm -- openclaw plugins inspect rein-router --runtime --json` | 配置后查看 Router 的注册情况 |
| `npm run toolchain:pnpm -- run verify:subscriptions` | 使用合成数据检查 Discord 路由与工具 |
| `npm run toolchain:pnpm -- run verify:subscriptions:slack` | 使用合成数据检查 Slack 路由与工具 |
| `npm run toolchain:pnpm -- run verify:subscriptions:managed` | 检查已准备的 Magpie 托管生命周期，不调用真实模型 |
| `npm run toolchain:pnpm -- run eval:subscriptions` | 评估离线路由语料，不调用托管 Jev 服务 |

生成配置文件时请使用 `--output`：npm/pnpm 可能向标准输出写入生命周期日志，直接用 `> fragment.json` 重定向普通封装命令会将日志混进 JSON。生成器先验证，再以 0600 权限只写入片段，不会合并或启用配置。请先创建输出文件的父目录。运行内联配置示例时，使用 `npm run toolchain:pnpm -- exec node --input-type=module`，以确保同样使用本地工具链。

`npm run toolchain:pnpm -- run <script>`、`-- test` 和 `-- openclaw <args>` 都使用工具链自身的 Node，因此即使系统默认 `node` 低于本仓库 `engines` 的要求，也能在默认 shell 中运行。`--` 后不加参数会显示 pnpm 帮助。直接使用 `pnpm run <script>` 或 `pnpm openclaw <args>`，只有在执行下方可选的 `PATH` 设置，或另有运行于受支持 Node 上的 pnpm `12.4.2` 时才等效。

如果希望直接使用 pnpm 命令，可在当前 shell 中设置一次：

```sh
export PATH="$PWD/.toolchain/node_modules/.bin:$PATH"   # 可选；让 pnpm 和 node 指向本地工具链
```

## 1. 连同运行时源码克隆仓库

```sh
git clone --recurse-submodules https://github.com/rein-protocol-foundation/nori-agent.git
cd nori-agent
```

如果已经克隆但未初始化子模块，请先运行 `git submodule update --init --recursive`。

## 2. 安装依赖

根目录安装只涵盖 Rein 工作区包：

```sh
npm run toolchain:pnpm -- install                                     # 仅安装 Rein 工作区包
```

上游是独立工作区，有自己的锁文件。请在其目录中安装并构建：

```sh
npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile   # 安装上游依赖
npm run toolchain:pnpm -- --dir vendor/openclaw build                       # 构建上游，包括 Control UI
```

`vendor/openclaw` 是完整源码检出，`openclaw` 启动器会解析 TypeScript 源码，必须先完成上述安装与构建才能运行。当前上游的 `build` 也会生成网关控制面板使用的 Control UI 资源。建议使用 `pnpm --dir vendor/openclaw ...`（或 `pnpm -C`），使上游自身 `packageManager` 固定的 pnpm 版本生效；上述封装形式采用同样的目录方式，并从本地工具链获取 pnpm，而非使用系统安装。

## 3. 创建隔离的本地配置

```sh
npm run toolchain:pnpm -- run setup:local
```

`scripts/init-local.mjs` 会写入 `runtime/openclaw/openclaw.json`，文件权限为 0600，父目录权限为 0700。如果文件已存在，会保留原文件并报告。生成的配置刻意保持最小范围：

| 配置项 | 值 |
| --- | --- |
| `gateway.mode` | `local`；缺少此项时网关拒绝启动 |
| `gateway.bind` / `gateway.port` | `loopback` / `18791`，避开上游默认端口 |
| `gateway.auth` | `token`，使用 32 字节随机数的十六进制表示 |
| `agents.defaults.workspace` | 本仓库的 `workspace/` 目录 |
| `plugins.allow`、`plugins.load.paths`、`plugins.entries` | 从 `plugins/rein-operations` 加载 `rein-operations` |

`plugins.allow` 是全局插件白名单。本地演示仅允许 Rein 插件。配置模型供应商或聊天频道时，需要将对应的准确插件 ID（例如 `openai` 或 `slack`）加入该列表，否则集成仍处于禁用状态。这不会修改上游代码或已有的全局配置。

源码目录需要允许写入被 Git 忽略的依赖、缓存与构建输出；只读要求针对的是已跟踪的上游源文件。

`runtime/` 已被 Git 忽略。此流程不配置频道、模型供应商或凭据，不启用真实业务工具。

## 4. 运行结构检查与测试

```sh
npm run toolchain:pnpm -- run check    # 项目骨架、未批准的示例政策、源码哈希、AC01-AC20
npm run toolchain:pnpm -- test         # 插件边界与上游更新脚本的测试用例
```

`check` 用于确认仓库骨架完整。业务模块测试验证本地规则，不代表真实聊天或网站集成已经通过验证。

Discord 新成员引导内容已包含在 `workspace/` 中：其中的 `AGENTS.md` 将 Discord 对话路由到 `DISCORD_ONBOARDING.md`，`community-directory.json` 初始为未配置状态。如果使用单独复制的工作区，需要同步这些文件及路由指令。按照[新成员引导指南](discord-onboarding-zh.md)准备已核实的公开条目并进行对话演练。示例目录使用合成数据，不应作为真实内容启用或推荐。本次内容更新不会启用 Discord 插件或任何外部操作。

## 5. 检查插件

```sh
npm run toolchain:pnpm -- openclaw plugins list --verbose
npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json
npm run toolchain:pnpm -- run verify:plugin
npm run toolchain:pnpm -- run verify:proposal-tools
npm run toolchain:pnpm -- openclaw plugins doctor
```

`--runtime` 报告网关实际注册的内容。未配置 `foundationDb` 时，默认有 `rein_status`、`rein_simulate_proposal` 和 `rein_simulate_vote` 三个工具。可选的 `proposalTools` 块增加四个本地提案工具。启用 `foundationDb` 后，会隐藏这些模拟器和本地提案工具，保留 `rein_status`，并注册 19 个后端工具：

| 分组 | 工具 |
| --- | --- |
| 治理只读（4） | `rein_member_status`、`rein_funds`、`rein_poll_candidates`、`rein_vote_type_resolve` |
| 只读字段采集（1） | `rein_proposal_collect` |
| 治理写入（4） | `rein_governance_proposal_submit`、`rein_poll_open`、`rein_poll_vote`、`rein_poll_result` |
| 结果反馈（3） | `rein_proposal_comment_suggest`、`rein_revision_approve`、`rein_revision_apply` |
| 身份绑定（3） | `rein_identity_bind_start`、`rein_identity_bind_status`、`rein_identity_bind_complete` |
| 社区查询（4） | `rein_resources_search`、`rein_resource_get`、`rein_events_search`、`rein_event_get` |

注册工具不代表获得后端权限：每次调用仍需验证宿主上下文、当前入站事件的私有凭证、调用方 scope 与成员资格。`verify:plugin` 通过真实加载器验证注册行为；`verify:proposal-tools` 验证四个本地 v2 提案工具。

`rein_status` 通过 `foundationDbReadToolsEnabled`、`foundationDbWriteToolsEnabled`、`foundationDbCollectToolsEnabled`、`foundationDbFeedbackToolsEnabled`、`identityBindToolsEnabled` 和 `communityQueryToolsEnabled` 报告对应工具组是否已注册。格式不合法的 `foundationDb` 配置会以 `foundation_db_config_invalid` 拒绝；所命名的服务端环境变量未设置或为空时，会以 `foundation_db_env_value_missing` 拒绝。两类错误都会指出有问题的配置项或变量名，但不会回显密钥值。

## 6. 在本地运行网关

```sh
npm run toolchain:pnpm -- openclaw gateway run       # 前台运行；完成后用 Ctrl-C 停止
```

本仓库使用 `runtime/openclaw` 作为隔离状态目录，配置文件也位于其中。仓库封装提供项目级 `start`、`stop`、`restart` 和 `status`，与 `gateway run` 使用同一配置及经过验证的上游实例锁，不安装或修改账号级 LaunchAgent、systemd 服务或 Windows 任务。

| 在 `npm run toolchain:pnpm -- openclaw` 后添加的命令 | 行为 |
| --- | --- |
| `gateway run` | 前台运行，日志留在当前终端，Ctrl-C 停止。 |
| `gateway start` | 启动独立后台进程，等待就绪后返回；重复调用报告已有实例。 |
| `gateway stop` | 优雅停止经过验证的本项目实例，包括通过 `run` 启动的实例；可重复调用。 |
| `gateway restart` | 检查配置与凭据加载，停止当前实例，再用新值启动后台实例。 |
| `gateway status --json` | 显示项目实例的 PID、端口、就绪状态及配置／日志路径。 |

后台运行示例：

```sh
npm run toolchain:pnpm -- openclaw gateway start
npm run toolchain:pnpm -- openclaw gateway status
npm run toolchain:pnpm -- openclaw gateway restart
npm run toolchain:pnpm -- openclaw gateway stop
```

后台日志追加到 `runtime/openclaw/logs/project-gateway.log`，权限为 `0600`。关闭终端后进程仍运行，但**不会在登录或重启系统后自动启动**。使用 Magpie 时，仍需单独保持 Router Console 运行。

从本仓库运行这些命令即可选择本项目实例。若其他进程占用配置端口，只报告占用，不会停止该进程。`stop/status` 不需要供应商密钥。`restart` 会将前台实例替换为后台实例；要恢复前台运行，先 `stop` 再 `run`。

如果 `gateway run` 提示已有实例，先检查 `gateway status`。健康的后台实例已经在运行 Nori；日常后台启动使用可重复执行的 `gateway start`，切换到前台则先 `gateway stop` 再 `gateway run`。封装脚本会在前台启动前检查本项目的现有实例；否则，上游的第二个进程可能因争用同一状态锁而报 `StateDatabaseCoordinatorContentionError`，并附带容易误解的维护／迁移提示。仅凭锁冲突不能认定需要迁移。如果已停止经过验证的实例后，启动仍提示需要迁移，再执行 `npm run toolchain:pnpm -- openclaw doctor --fix`，完成后重新启动。

如果 `stop` 成功后，稍后的 `run` 又发现已有实例，请比较两次报告的 PID，并检查其他终端或开发任务是否在此期间调用了 `start`。`stop` 只停止当前实例，不会禁止后续启动。

生命周期命令接受 `--json` 与 `--timeout N`（毫秒）；`start/restart` 接受 `--port N`，否则新实例使用当前项目配置中的端口。默认优雅停止；`restart --safe` 采用相同行为。停止超时会失败，不启动第二个实例；显式 `--force` 允许超时后强制终止仍经验证属于本项目的原进程。上游 `gateway install/uninstall` 仍是系统服务操作，不用于此隔离配置。

在第二个终端执行：

```sh
npm run toolchain:pnpm -- openclaw gateway health --port 18791
npm run toolchain:pnpm -- run smoke:gateway
npm run toolchain:pnpm -- openclaw doctor
```

`npm run toolchain:pnpm -- run smoke:gateway` 通过经过认证的本地 HTTP 端点调用只读的 `rein_status`，不会打印令牌。它不需要模型 API 密钥，但必须等网关输出 `ready` 后再运行；启动期间出现连接拒绝不代表工具故障。`gateway health` 使用已配置的认证调用网关 health RPC；无需认证的 HTTP 就绪探针为网关端口上的 `/readyz`。`openclaw doctor` 报告运行时配置状态。

仅在客户端需要时显示生成的共享令牌，并将输出视为秘密：

```sh
npm run toolchain:pnpm -- openclaw gateway auth-token --show
```

`scripts/openclaw.mjs` 在调用上游 CLI 前设置 `OPENCLAW_STATE_DIR=runtime/openclaw` 和 `OPENCLAW_CONFIG_PATH=runtime/openclaw/openclaw.json`，因此本地操作不会触碰全局 `~/.openclaw` 配置。

## 尚未配置的内容

- 新生成的本地配置没有聊天传输、模型供应商或已启用的后端工具；`setup:local` 会保留已有本地配置。
- `config/operations.example.json` 是未批准的设计输入，不是原生 OpenClaw 配置，也没有组件加载它。
- 聊天凭据、已批准的工作区与频道、后端调用方登记与 scope、已验证的成员绑定及治理政策需要单独配置。
- 初始化不会启用付款、预留或网站发布。数据库迁移与本地测试不等于生产验收，参见[决策登记](decisions.md)和[部署记录](implementation-and-deployment-zh.md)中注明日期的证据。

## 可选：启用后端业务工具

使用已批准的聊天传输与 Foundation 后端。Slack 可使用 Socket Mode，提供 bot token 和 app-level token；多成员部署应参照 [Slack 隔离指南](slack-user-isolation.md)或 [Discord 隔离指南](discord-user-isolation.md)。按所选适配器加入准确的插件 ID 和必要的加载路径；不要为同一账号同时运行内置与隔离适配器。

将下面的对象合并到 `runtime/openclaw/openclaw.json` 的 `plugins.entries.rein-operations.config` 下，保留其他插件配置。启用前，将全部 `APPROVED_*` 占位符替换为已批准的原生 ID：

```json
{
  "foundationDb": {
    "enabled": true,
    "workspaces": [
      {
        "platform": "slack",
        "workspaceId": "APPROVED_SLACK_WORKSPACE_ID",
        "nativeChannelIds": [
          "APPROVED_PROPOSAL_CHANNEL_ID",
          "APPROVED_BOARD_CHANNEL_ID"
        ]
      }
    ],
    "proposalChannelIds": [
      "APPROVED_PROPOSAL_CHANNEL_ID"
    ],
    "boardChannelIds": [
      "APPROVED_BOARD_CHANNEL_ID"
    ],
    "backendApiBaseUrlEnvVar": "REIN_BACKEND_URL",
    "agentCallerIdEnvVar": "REIN_AGENT_CALLER_ID",
    "agentCredentialEnvVar": "REIN_AGENT_CREDENTIAL",
    "proposalConfirmationKeyEnvVar": "REIN_PROPOSAL_CONFIRMATION_KEY"
  }
}
```

每个 `workspaces` 条目必须包含 `platform`、`workspaceId` 和非空的 `nativeChannelIds`。提案与 Board 频道 ID 必须出现在这些列表中。宿主可信的 `messageChannel` 与原生频道 ID 必须恰好选中一个工作区，因此应避免在同一平台下重复分配频道。支持多个 Slack／Discord 工作区。顶层 `platform` 可省略；如填写，必须是 `workspaces` 已登记的平台。可选的 `voteTypeAliases` 将操作员批准的表达映射到后端类型代码，见[部署指南](implementation-and-deployment-zh.md)。

四个 `*EnvVar` 字段均为服务端环境变量名；JSON 中不能填写凭据值：

| 环境变量 | 含义 |
| --- | --- |
| `REIN_BACKEND_URL` | 后端基础 origin，使用 HTTPS，或本地开发的回环 HTTP；不能包含内嵌凭据、路径、查询参数或片段。 |
| `REIN_AGENT_CALLER_ID` | 在目标后端环境登记的调用方 ID。 |
| `REIN_AGENT_CREDENTIAL` | 该 Agent 调用方的凭据，仅授予已批准的 scope。 |
| `REIN_PROPOSAL_CONFIRMATION_KEY` | 用于提案确认令牌的稳定私有密钥；使用强随机值，例如一次性运行 `openssl rand -base64 48` 生成。轮换会使未完成的确认失效。 |

仓库启动器从被 Git 忽略的 `.env.local` 读取以上四个变量，显式设置的进程环境变量优先。该文件应保持私有（权限 `0600`）。如果两处都未设置 `REIN_BACKEND_URL`，启动器使用 `https://rein-protocol.org`；显式空值会校验失败，不会回退。插件支持自定义变量名，但这些变量必须通过进程环境提供；`.env.local` 自动加载只覆盖上述四个名称。修改凭据或配置后，重启项目网关。

合成演练应显式选择隔离后端及在该环境登记的调用方。数据环境由后端部署配置选择；更换 URL 不会迁移 DEV 调用方或授予生产权限。Agent 不接收数据库地址或 service key，线上默认地址也不构成向生产数据写入测试记录的授权。

后端根据已验证绑定解析身份，并使用绑定可信平台／工作区／用户／频道／事件及调用方的私有凭证。成员绑定使用 `rein_identity_bind_start`、`rein_identity_bind_status` 与 `rein_identity_bind_complete`；自称的邮箱或角色不能作为身份依据。身份解析不需要查询 Slack 个人资料邮箱，也不需要为此添加 bot scope。数据库迁移、播种与成员管理由后端操作员负责。

后端调用方需具备相应的入站、身份与业务操作 scope。社区查询还要求 `community.read` 与当前有效的 Community Member link，治理 scope 不能替代该权限，见[社区查询指南](community-discovery.md)。按上文运行 `plugins doctor` 与 `plugins inspect ... --runtime --json` 检查合并后的配置，再在已批准环境中演练。

### 提案作者确认

存储的提案必须是作者确认过的版本（PRD §2.3 第 2 步）。原文说明提案表没有草稿状态或确认列，因此 `rein_governance_proposal_submit` 通过两次调用完成确认，而不是先存入一条草稿：

1. 第一次调用不带 `confirmationToken`，不写入数据，返回 `status: "prepared"`，以及规范化后的提案正文 `prepared`、短期 `confirmationToken` 和 `expiresAt`。
2. Agent 将正文复述给提案人。只有提案人明确同意后，才再次调用工具，原样传回 `confirmationToken`，并设置 `confirmPronouncedByAuthor: true`。

当前令牌使用由 HKDF 派生密钥的 AES-256-GCM 加密并认证准确的提案内容，同时认证提案人与到期时间。因此，预览后修改标题、类型、金额或币种会触发 `proposal_confirmation_mismatch`；令牌过期会触发 `proposal_confirmation_expired`；缺少确认声明或令牌会触发 `proposal_confirmation_required`；不是由服务端签发的令牌会触发 `proposal_confirmation_invalid`。提案标识符由已确认的正文派生，因此重复确认同一版本会返回同一记录，不会插入第二份提案。

准备与确认必须发生在不同的入站轮次；同一轮回传刚生成的令牌会被 `proposal_confirmation_next_turn_required` 拒绝。

真正的要求是对话中的确认：提案人必须确认准备好的正文。令牌与布尔值只是技术门槛，用来防止工具调用代替作者确认。

## 开始任何真实运营之前

1. 运行 `npm run toolchain:pnpm -- run check` 和 `npm run toolchain:pnpm -- test`。这些检查仅验证项目骨架与插件边界。
2. 阅读 PRD，与有权负责的人员一起解决[决策登记](decisions.md)中的上线前置条件。
3. 通过 Rein 自有插件及经过审计的工具契约，落实身份、政策、持久记录、治理与 outbox 服务。`config/operations.example.json` 仅是设计输入，不提供运行时强制约束。
4. 配置一个聊天平台及其频道范围，将凭据保存在 Git 之外。以最小权限服务凭据连接网站适配器。私有运行时记忆应保存在仓库之外，并落实共享会话隔离。
5. 在独立沙箱中用合成数据验证 AC01-AC20，包括故障恢复、预算竞争与撤回同意。记录测试使用的运行时提交和结果。
6. 由指定操作员显式启用已批准的政策和限定范围的工具，开展有限试点。扩大访问范围前，验证暂停、恢复与异常处理责任归属。

仅靠工作区提示词不能建立访问控制。在服务与政策准备就绪前，Agent 仅用于草稿和合成数据演示。

## 更新运行时

可选的固定版本浏览器 CLI、官方 Skill、本地凭据录入和会话恢复流程，见 [Nori 浏览器自动化](agent-browser.md)。

经过审阅的版本更新、更新后检查清单及回滚流程，见[上游更新指南](upstream.md)。

## 已验证基线

2026-09-23，上游提交 `4a11f89e840b2bb3eedcad2820ab25b8520905b6` 使用 Node 24.16.0 与 pnpm 12.4.2，通过了锁文件冻结安装和完整源码构建。仓库检查、当时的两项测试、真实 OpenClaw 插件加载器，以及通过隔离本地网关进行的已认证 `rein_status` 调用均通过验证。临时网关在验证后已停止。此次未测试真实平台集成或模型推理。

上游 UI 构建报告 Mermaid 包体积超出建议预算（gzip 后为 1555.8 KiB，预算为 960 KiB），但构建仍成功退出。这是上游输出，没有为消除提示而修改上游源码。

## 隔离的 Slack 配置

可选的 Socket Mode 传输方式见 [Slack 隔离指南](slack-user-isolation.md)和[示例配置](../config/slack-isolated.example.json)。需要禁用内置 Slack 插件、准备公共参考工作区并配置成员私有状态。

`verify:slack-isolation` 使用本机模型／后端服务和合成原生事件，不代表已获准连接真实 Slack 工作区。共享核心重构也保留了原生 `verify:discord-isolation` 回归探针。
