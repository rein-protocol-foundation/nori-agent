# Plugin architecture / 插件架构

🧭 [Handbook / 维护手册](README.md)

📍 **Trace a feature / 追踪一个功能**

1. Find the package below and open its entry point. / 在下表找到对应的包并打开入口。
2. Follow `register` to the tool, hook or service. Check its configuration in `openclaw.plugin.json`. / 从 `register` 追踪到工具、钩子或服务，核对清单中的配置。
3. Check callers and tests before changing a contract. The isolation library and withdrawn Discord adapter have distinct review boundaries. / 修改接口前检查调用方和测试，特别留意共享隔离库与已撤回的 Discord 适配器。

| Package / 代码入口 | Responsibility and review boundary | 职责与审查重点 |
| --- | --- | --- |
| [rein-operations](../../plugins/rein-operations/index.ts) | Registers proposal, governance, identity and community tools. Check backend authority, channel scope and simulator configuration. | 注册提案、治理、身份和社区工具。核对后端授权、频道范围和模拟配置。 |
| [rein-router](../../plugins/rein-router/index.ts) | Routes models through Magpie and applies scoped selection and fallback policy. Check channel context and provider billing declarations. | 通过 Magpie 路由模型，按上下文选模与回退。核对频道上下文及供应商计费声明。 |
| [rein-acp](../../plugins/rein-acp/index.ts) | Provides trusted Slack task controls and the legacy bounded ACP controller. Check caller, task ownership and restart recovery. | 提供受信 Slack 任务控制及旧版受限 ACP 控制器。核对调用者、任务归属和重启恢复。 |
| [rein-slack](../../plugins/rein-slack/index.ts) | Slack adapter for workspace, channel and thread ingress. Review sender and audience scoping with the isolation library. | 处理 Slack 工作区、频道与线程的消息入口，结合隔离库检查发送者和受众范围。 |
| [rein-isolation](../../plugins/rein-isolation/) | Shared library for scoped sessions, memory and turn control. Trace consumers when changing scope keys or stored notes. | 会话、记忆与对话轮次控制的共享库。修改隔离键或笔记存储时检查调用方。 |
| [rein-discord](../../plugins/rein-discord/index.ts) | Withdrawn adapter. Registration refuses startup. Historical fixtures exercise its helpers. Native guild conversations still share channel context. | 已撤回的适配器，入口会拒绝启动。历史测试仍使用辅助模块；原生服务器会话仍共享频道上下文。 |
| [rein-host-guard](../../plugins/rein-host-guard/index.ts) | Supplies Slack operations guidance and checks host tool calls before execution. Review allowed actions and guard scope. | 注入 Slack 运维指引，在执行前检查主机工具调用。核对允许的操作及防护范围。 |
| [rein-cron-alert-format](../../plugins/rein-cron-alert-format/index.mjs) | Formats native cron failure and recovery messages for the configured Slack destination. Check destination matching and ordinary message delivery. | 为指定 Slack 目标格式化定时任务失败与恢复通知。核对目标匹配和普通消息投递。 |
| [rein-lark-acknowledgements](../../plugins/rein-lark-acknowledgements/index.mjs) | Adds an OK reaction to an admitted Lark group mention. Check receiving account, message ID and reply continuity on failure. | 给已准入的飞书群提及添加 OK 表情。核对接收账号、消息 ID 及表情失败后的回复流程。 |
| [rein-slack-acknowledgements](../../plugins/rein-slack-acknowledgements/index.mjs) | Records expected Slack acknowledgements and observed receipts. Review workspace filtering and evidence recorded in the ledger. | 记录预期的 Slack 确认及观测到的回执。检查工作区过滤与台账证据。 |
| [rein-member-introductions](../../plugins/rein-member-introductions/index.ts) | Recalls public introductions collected by the daily onboarding job for current members. Check membership and visibility. | 为当前成员检索每日入群任务收集的公开自我介绍。检查成员资格和内容可见性。 |
| [rein-partnership](../../plugins/rein-partnership/index.ts) | Coordinates Lobster approval of an exact draft and mail to a designated test recipient. Review approval binding, retries and receipts. | 协调 Lobster 对指定草稿的人工审批及向指定测试收件人的发信。检查审批绑定、重试与回执。 |

## Shared paths / 共用目录

| Path / 路径 | How to review / 审查方法 |
| --- | --- |
| `vendor/openclaw/` | Pinned read-only runtime. Review a pin update against affected SDK consumers. / 固定版本的只读运行时。更新指针时检查使用相应 SDK 的插件。 |
| `workspace/`, `workspace/skills/` | Runtime guidance and channel-independent skills. Check what enters prompts or memory and which tools can act. / 运行指引及跨频道技能。检查进入提示词或记忆的内容，以及实际可执行的工具。 |
| `config/`, `templates/`, `scripts/`, `deploy/` | Trace example settings through setup and deployment to the package that reads them. / 从示例配置沿初始化和部署流程追踪到读取配置的插件。 |
| `tests/`, `evals/`, `.github/` | Identify exercised packages and inspect skipped checks. / 确认覆盖的插件并检查跳过的验证。 |
| `web/dashboard/` | Trace dashboard actions through their backing service to the relevant runtime or plugin. / 从管理面板操作沿后端服务追踪到相应运行时或插件。 |

For example, a PR changing only `plugins/rein-isolation/scope.mjs` directly modifies one package. Review the Slack adapter's use of the scope and the historical Discord regression cases before approving. A configuration-only PR can affect a plugin even when the direct list is empty.

例如，只修改 `plugins/rein-isolation/scope.mjs` 的 PR 直接改动一个包。审查时还要核对 Slack 适配器使用该作用域的方式，以及历史 Discord 回归用例。仅修改配置的 PR 即使直接改动列表为空，也可能改变插件行为。
