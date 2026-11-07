# Slack 主机开发权限与防误删护栏

[English / 配置 JSON](trusted-slack-host-access.md)

本次变更来自操作者明确提出的 Slack 开发及 RSI 需求，不改变 PRD 中的成员、投票或财务授权。
**2026-11-06（洛杉矶时间）已先修改服务器，随后补交本 PR。** PR 是对已生效变更的代码及文档纳管，
不是“合并后才首次上线”。未修改 OpenClaw 上游源码，服务器应用 checkout 保持干净。

## 配置变更

Slack 网关的 main 和 director-control 使用完整工具 profile、关闭 sandbox、
exec 在 gateway 以 full 模式运行，文件和补丁操作设置 workspaceOnly 为 false。
完整 JSON 见英文文档。移除 controller 的空 skills 列表，并用
[操作策略](../templates/trusted-slack-operations.md) 替换强制 ACP 委派指令。

停用旧 rein-acp 插件，因为它要求固定的协调器工具列表，并执行额外的 Director 身份检查。
保留 acpx 和 ACP 后端；ACP 可以委派，但不再是开发任务必经路径。旧 nori-development
沙箱 agent 不变。ubuntu 服务账号原已有免密 sudo，本次没有修改 sudoers。

## 自建插件及实际边界

rein-host-guard 是本仓库新增的自定义插件，不是社区插件，也不是 OpenClaw 核心补丁。

- before_tool_call 在调用前检查 exec 中的常见删除命令及 apply_patch 的 Delete File。
- 将候选路径规范化，检查是否指向受保护目录、内部文件或其祖先目录；命中返回阻止结果。
- before_prompt_build 仅向 Slack 注入允许开发、禁止删除核心和绕过护栏的指令。
- 普通项目读写、修改、安装软件允许；核心文件可以编辑，不允许直接删除。

线上保护 /etc、/usr、/bin、/sbin、/lib、/lib64、/boot、/dev、/proc、
/sys、部署中的 vendor/openclaw、整个 plugins 目录以及护栏自身目录。
这不是覆盖全盘的系统文件识别器。

**这是防误操作的简易检查，不是完整 shell 解析器或操作系统安全隔离。**
变量展开、任意脚本、间接调用和 ACP 子进程等存在绕过路径；复杂命令也可能误拦。
它不能防止通过覆盖内容破坏核心。允许任意 shell、sudo 和核心修改，就不能保证绝对防删除。
操作指令要求先备份、检查目标、验证变更，并禁止规避护栏。14 项单元测试只覆盖已列明案例。

## Slack 与 Discord 的区分

| 层级 | Slack | Discord |
| --- | --- | --- |
| 网关 | nori-slack，18791 | nori-discord，18793 |
| 私有配置 | runtime/openclaw/openclaw.json | runtime/discord-catalog-prod/openclaw.json |
| 渠道 | 启用 Slack、禁用 Discord | 启用 Discord、禁用 Slack |
| 路由 | 开发频道使用 controller，其余已准入 Slack 使用 main | 自己配置中的默认 agent |
| 开发工具 | main/controller 完整工具权限 | guild 工具 allowlist 不含 shell、文件和子任务派发 |
| 新护栏 | 已加载 | 未加载 |

Slack 私信仍关闭；频道 allowlist、@触发及既有用户限制保留。
开发频道用户列表含通配符，其他多个频道没有单独用户列表。因此信任范围是
**通过既有 Slack 准入的请求，不是仅限后端验证为 Director 的账号**。
组织治理工具仍有独立后端检查。

Discord 私信和原生命令关闭；允许一个服务器、两个频道，其中一个要求 @，另一个不要求。
工具只允许网页搜索/读取、消息、四个资源活动查询工具、三个身份绑定工具、
rein_status 与 rein_member_status。查询每次校验 Community Member 关联。
不开放 shell、文件读写、会话委派及治理操作。

首次主机权限调整时，Discord 使用固定 Qwen 模型，未启用 rein-router。
随后另一次独立配置变更已启用 rein-router 和 rein-magpie/auto；本 PR 跟进核对确认了该状态，
不会将它恢复为旧模型配置。
实际权限边界是渠道准入、工具 allowlist 和后端身份检查；不能把 dynamic router 或 AGENTS
文字描述成安全隔离。两个网关仍共享服务器和工作区路径，并非容器或 OS 账号级隔离。

## 部署、验证与回滚

线上插件安装在 runtime/host-guard/，由 Slack 私有配置的 plugins.load.paths 加载，
同时加入 plugins.allow 和启用 entry。配置包含绝对路径的 protectedPaths 与 defaultCwd；
hook 需要 allowConversationAccess 和 allowPromptInjection。不要覆盖私有配置为示例配置。

原 Slack 配置及 controller AGENTS 存于私有 runtime/host-permission-backups/。
runtime 会被自动更新器保留，**合并插件源码不会自动更新这份运行副本**。
后续升级须先备份运行副本，复制审核过的插件文件，验证配置，重启 Slack 并检查健康。
不得提交私有配置、运行日志、对话或凭据。

回滚前持有部署锁、确认无切换事务；同时恢复匹配的 Slack 配置与 controller AGENTS，
校验后重启 Slack。旧工具策略与旧 rein-acp 必须配套恢复。保留未使用插件文件即可，
无需删除；Discord 不需要回滚。锁和保留规则见[自动更新文档](auto-update-zh.md)。

已验证：14 项护栏测试通过；一次不投递消息的 controller agent 执行中，
shell 标记输出、sudo -n true、临时文件写入和读回成功；两个网关健康检查通过。
没有为测试安装软件，没有发送 Slack 消息，真实 Slack 对话端到端验收仍待完成。

Loader verification: npm run toolchain:pnpm -- exec node scripts/verify-host-guard.mjs (isolated temporary configuration; no live accounts).
