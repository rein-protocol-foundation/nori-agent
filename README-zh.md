# Nori-Agent

**面向 NGO、非营利组织与公益组织的 AI 运营 Agent。**

[![文档与脚手架检查](https://github.com/rein-protocol-foundation/nori-agent/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/rein-protocol-foundation/nori-agent/actions/workflows/check.yml)
[![阶段：开发中](https://img.shields.io/badge/status-in_development-d97706?style=flat)](#当前状态)
[![基于 OpenClaw](https://img.shields.io/badge/built_on-OpenClaw-2563eb?style=flat)](https://github.com/openclaw/openclaw)
[![本地 Node.js 工具链：24.16.0](https://img.shields.io/badge/Node.js-24.16.0-5fa04e?style=flat&logo=nodedotjs&logoColor=white)](#快速开始)
[![pnpm 12.4.2](https://img.shields.io/badge/pnpm-12.4.2-f69220?style=flat&logo=pnpm&logoColor=white)](package.json)
[![Dashboard：仅组织管理成员](https://img.shields.io/badge/dashboard-admins_only-475569?style=flat)](https://nori.rein-protocol.org/)

[English](README.md) · [GitHub 仓库](https://github.com/rein-protocol-foundation/nori-agent) · [Nori Dashboard](https://nori.rein-protocol.org/)

<img src="workspace/avatars/rein-agent.png" alt="Nori，Nori-Agent 的正式形象" width="160" height="160">

Nori 围绕组织使命，协同处理人员、资源、决策与社区事务。目标是依据各组织的制度承担大部分日常运营，让人有更多时间投入公益工作，以及需要人工判断的决策。

项目由 **Rein Protocol Foundation** 基于 **OpenClaw** 开发，对话中称为 **Nori**。基金会是首个实现背景；其他组织应配置自己的使命、角色、制度和服务集成。

> **Nori Dashboard 仅组织管理成员可访问。** 登录需要组织授权的管理凭据。

[能力方向](#能力方向) · [当前状态](#当前状态) · [快速开始](#快速开始) · [文档导航](#文档导航) · [参与贡献](#参与贡献)

## 能力方向

Nori-Agent 围绕四类组织事务设计：

| 方向 | 产品目标 |
| --- | --- |
| 日常运营与决策 | 分流请求、准备会议、跟进任务，并按授权制度处理常规事项。 |
| 财务资源调度 | 评估资源需求、辅助预算决策、跟进资源分配和承诺。 |
| 人员协作 | 支持成员、员工和志愿者的加入、职责协调与贡献记录。 |
| 社区维护 | 引导新成员、发现资源和活动、促进参与并收集反馈。 |

更广泛的产品方向还包括筹款与捐赠关系、公益项目交付、成效评估、治理与合规、服务对象的保护与参与，以及对外传播和伙伴协作。这些仍是**待讨论的产品建议**，尚未纳入首版交付承诺。详见[产品需求](docs/PRD-agent-community-operations-zh.md)。

## 当前状态

**项目已有本地业务核心、开发演练与有限实机验收证据，完整产品范围仍在开发中。**

| 模块 | 已有实现 | 当前边界 |
| --- | --- | --- |
| 提案与治理 | 通过已认证后端进行身份绑定、提案采集与提交、Board 投票、结果记录和资金快照查询。 | 需要显式配置后端、工作区和频道；投票结果不会执行付款。 |
| 社区支持 | Discord 入群引导，以及经过身份验证的资源和活动查询。 | 依赖已配置的服务与可信社区身份；有限实机验收不代表普遍可用。 |
| 会话与记忆隔离 | 可选的 Discord、Slack 接入，支持逐用户及受众范围隔离。 | 已有合成链路验证；真实双账号验收仍待完成。 |
| 模型路由 | 可选的 Magpie 网关、手动选模和 Jev 动态路由。 | 供应商访问权限与计费兼容性需要操作者核验。 |
| 浏览器任务 | 固定版本的 agent-browser 集成，支持加密凭证库与会话复用。 | 在操作者授权和现有频道权限范围内运行。 |

首批治理流程为：

**可信身份 → 提案 → Board 投票 → 记录结果**，有权董事可查询资金快照。

真实支付、资金预留、自动授予角色，以及完整的活动至发布流程尚未启用。Agent 通过后端 API 访问组织数据，不持有数据库凭据。

具体验收时间、证据及未完成事项见[开发与部署记录](docs/implementation-and-deployment-zh.md)。

## 快速开始

### 1. 准备仓库与工具链

需要支持 submodule 的 Git 和 npm。以下命令安装项目内 Node.js `24.16.0` 与 pnpm `12.4.2`；支持的 Node 版本范围为 `>=24.16.0 <25` 或 `>=26.1.0`。

```sh
git clone --recurse-submodules https://github.com/rein-protocol-foundation/nori-agent.git
cd nori-agent
npm install --prefix .toolchain --no-save --package-lock=false node@24.16.0 pnpm@12.4.2
```

已有仓库若未初始化 submodule，先执行 `git submodule update --init --recursive`。本地工具链被 Git 忽略，无需全局安装 pnpm 或修改 `PATH`。

### 2. 安装、构建与初始化

```sh
npm run toolchain:pnpm -- install
npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile
npm run toolchain:pnpm -- --dir vendor/openclaw build
npm run toolchain:pnpm -- run setup:local
```

初始化会在 `runtime/openclaw/openclaw.json` 创建私有配置，启用 `rein-operations`，并让网关监听回环地址的 `18791` 端口。**聊天频道和模型仍未配置。** 按[安装指南](docs/setup-zh.md)连接服务并显式启用后端工具。

### 3. 检查与运行

```sh
npm run toolchain:pnpm -- run check
npm run toolchain:pnpm -- test
npm run toolchain:pnpm -- run verify:plugin
npm run toolchain:pnpm -- openclaw gateway run
```

网关就绪后，在第二个终端检查：

```sh
npm run toolchain:pnpm -- openclaw gateway health --port 18791
npm run toolchain:pnpm -- run smoke:gateway
```

### 可选：模型路由

初始化 Magpie 还需要 Go。准备固定版本的网关后，启动集成控制台：

```sh
npm run toolchain:pnpm -- run magpie:setup
npm run toolchain:pnpm -- run router:ui
```

让控制台与 OpenClaw 同时运行。在 Magpie 中配置供应商和模型，控制台会同步 OpenClaw 配置。完整步骤见[模型路由快速上手](docs/model-router-quickstart-zh.md)。

## 文档导航

| 想了解什么 | 从这里开始 |
| --- | --- |
| 产品范围与需求 | [产品需求文档](docs/PRD-agent-community-operations-zh.md) |
| 安装与配置 | [安装指南](docs/setup-zh.md) · [模型路由](docs/model-router-quickstart-zh.md) |
| 管理入口 | [Dashboard 与多实例配置](docs/dashboard-zh.md) |
| 社区流程 | [Discord 入群引导](docs/discord-onboarding-zh.md) · [对话用例](docs/discord-onboarding-use-cases-zh.md) |
| 开发与验收 | [开发与部署记录](docs/implementation-and-deployment-zh.md) · [Agent 演练案例](docs/agent-test-cases-zh.md) |
| 自动部署 | [合并事件触发更新与回滚](docs/auto-update-zh.md) |
| 网关维护 | [Magpie 升级指南](docs/magpie-upgrade-zh.md) |

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `plugins/rein-operations/` | 提案、治理、身份与社区工具。 |
| `plugins/rein-router/` | Magpie 网关集成与模型路由。 |
| `plugins/rein-discord/`、`plugins/rein-slack/`、`plugins/rein-isolation/` | 聊天平台接入与共享隔离逻辑。 |
| `workspace/` | Agent 身份、运营策略、技能与头像。 |
| `config/`、`templates/` | 示例配置与工作流模板。 |
| `scripts/`、`tests/` | 初始化、验证、运行辅助脚本与测试。 |
| `docs/` | 需求、指南、决策与验收记录。 |
| `vendor/openclaw/` | 官方运行时，以只读 Git submodule 固定版本。 |

产品名称为 **Nori-Agent**。包名保留 Rein / ReinProtocol 前缀，包括根包 `rein-agent` 和 `@rein-protocol/*` 命名空间。现有插件路径、`rein_*` 工具、环境变量、`foundationDb` 配置及头像路径保留兼容性。

## 参与贡献

通过插件与官方 OpenClaw SDK 实现 Nori 功能，保持 `vendor/openclaw` 不变。每项实现应关联 PRD 的需求、用户故事或验收标准，并区分产品建议与已实现行为。

开发流程见仓库根目录的 `CONTRIBUTING.md`。不要提交凭证或真实组织记录；示例政策不构成真实业务授权。

**许可：** 尚未选定许可证，当前未授予开源许可。
