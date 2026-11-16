# 任务闭环、摘要保留与自主开发验收（2026-11-16）

负责人：Codex（运行时 GPT-6 Astra High）。状态：进行中；以下准备不代表真实任务验收通过。
本次用户授权必要实现/部署/配置/重启、既有测试频道最少量消息、现有 ACP 调用及专用测试摘要删除。
并行社区迁移对话已明确将 Slack/部署窗口交给本任务；未提交共享 checkout 修改保留。

## 产品决定与边界

用户本次明确选择：任务摘要服务器上无期限保留，默认不删除；Slack 原始聊天不删除。
该决定取代此前待选择期限和建议的 30 天，不改变原生执行记录清理策略。
显式删除验收只对本次专用摘要副本；原生 Flow/Task、会话、Slack 原文、外部产物和备份必须单独说明。

固定 OpenClaw 为 `4a11f89e840b2bb3eedcad2820ab25b8520905b6`。
终态 Flow 七天清理、managed Flow 无公开 retention/delete 仍成立；不是所有 Task 都七天。
公开 `openclaw/plugin-sdk/sqlite-runtime` 提供 feature 自有 store，实际 worker 合成探针验证了
写入、关闭重开、owner 限定及测试副本删除。此探针不证明产品实现或真实 native cleanup 后保留。
原生 source 维护测试首次被 loopback EPERM 阻止，重跑因缺 `@openclaw/normalization-core`
及超时导致 12 failed / 4 passed；owner-access 未被所选项目纳入，不计通过。未修改 vendor。

## 部署准备

- 初始线上 `06891fe5117ef7899e27c24845f9d2e4f06a901e`，工作树干净。
- PR #94 原头 `71ad61c` 已有 7 项 CI 成功、无未解决 review。与最新 main 的冲突只在四份跟踪文档。
- 独立 managed worktree `task-live-acceptance` 保留双方文档，产生 merge head `c7a2dca`。
  56 项任务定向测试、scaffold、diff 检查通过；任务控制 runtime 与已审阅头相同。
- 新头 7 项 CI 全通过后，#94 于 18:59:24 UTC 合并为 `66700d062db7208827a8763fa95575fd434003a0`。
- 配置备份：服务器 root-only `task-acceptance-20261116T184955Z`；完整代码/私有状态回滚由现有 updater 旧 release 保留。
- 另一维护于 18:53:36 UTC 重启 Slack/Discord/web，只观察到 Slack `gateway.controlUi.allowedOrigins` 变化。
  本任务不会用旧候选覆盖该变更。部署前原生 active task 计数为 0。
- 测试配置候选经原生 `config validate` 通过；准备开启既有 rein-acp taskLoop/continuation、
  main 两个工具和专用频道 `replyToMode=all`，不改变开发沙箱或 ACP 账号权限。

## 独立测试条件

真实用户 Rein Admin 建立[专用 Slack 线程](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794855343600839)。
读回确认 sender 为实际用户 `U0C4PSL1S1F`，不是 Nori Bot 自发消息；建立线程未触发任务。

现有 ACP 由 `nori-acp-pilot` 系统账号运行，保留既有客户端登录、workspace-write 沙箱及配置模型。
本次在其工作区新建 `lifecycle-acceptance-20261116` 仓库，只有 Python 标准库的 JSON 数组统计脚本、
两个基线测试、README 和限定工作范围。初始两测试通过。未提前实现所请求的 JSONL 功能。
Nori 必须自己调查、制定方案、经 ACP 修改、观察失败并修正、检查标准和交付 diff/测试/限制。
传输产生的 macOS `._` 元数据仅从本次专用仓库清理并记录提交，其他既有内容未删除。

## 尚待证据

真实研究来源核对、后台聊天/进度、控制改向/取消、Nori 自主编码及摘要公开接口接入/验收均待执行。
历史 11 月 15 日双任务重启/主动补充/合并交付证据继续有效，本次不将其重复记为新验收。
