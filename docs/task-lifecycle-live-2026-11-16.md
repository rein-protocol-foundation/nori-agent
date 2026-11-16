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

## 真实研究、聊天和交付

[研究线程](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794856481443499)
由 Rein Admin 发起，只读研究三家非营利计划；子任务先等待 90 秒，再单次抓取明确失败注入域名，
失败后转向官方来源。实际 subagent run `750ef6a7-e37b-41ce-870f-7c7d4ddf0bc8`，
task `9dea231b-deb4-4246-9d10-1f09247692cc`，原生记录 succeeded / 无 error。

- 19:15:40 UTC 原线程确认实际 run 并结束主助手等待。
- 19:16:37 UTC 用户发送普通算术聊天和进度查询；19:16:50 UTC Nori 回答 41，报告实际
  run 仍在等待段、已运行约 73 秒，没有等后台结束。原生结束时间为 19:18:08 UTC。
- 19:18:37 UTC 原线程实际收到三项结果，各有官方来源、权益、资格、用途和核查日期。
  失败注入报告为 DNS ENOTFOUND，未作为事实来源，不把这一自报单独视为底层抓取审计。
- 独立抽查 Google Workspace、Google 美国资格、Microsoft 权益/资格及 GitHub 官方页：
  主要权益相符，但初稿把 Microsoft 三工作日写成硬上限，并漏写 Google group-exempt 例外。
  明确要求 Nori 自行重读后，它在原线程补充两项勘误和来源。记录人工复核，不声称零干预事实验收。

来源：[Google Workspace](https://www.google.com/nonprofits/find-solutions/workspace/)、
[Google 美国资格](https://support.google.com/nonprofits/answer/3215869?hl=en)、
[Microsoft 权益](https://www.microsoft.com/en-us/nonprofits/offers-for-nonprofits)、
[Microsoft 资格](https://learn.microsoft.com/en-us/industry/nonprofit/microsoft-for-nonprofits/eligibility)、
[GitHub for Nonprofits](https://github.com/solutions/industry/nonprofits)。

## Nori 自主开发：有实际成果，完整验收未通过

本任务只搭建了基线测试仓库；JSONL 功能和新增测试由 Nori/其 ACP 子任务完成。
Nori 添加 11 个 CLI 测试方法，加原有 2 项共 13 项；先观察失败，再经实际 ACP 产生实现。
最终代码支持 auto/json/jsonl、空输入、逐物理行错误和失败时无部分 stdout。
独立审阅代码/测试并重跑 `python3 -m unittest -q`：13 passed；`git diff --check` 通过。
当前交付包含修改的 `event_summary.py` 与新建的 `test_cli_formats.py`，后者是未跟踪文件，
不能只用普通 `git diff` 作为完整补丁。工作区和完整文件保留，尚未提交或发布此测试项目。

实际 ACP 证据：

| Run | Native task | 原生状态 | 实际结果 |
| --- | --- | --- | --- |
| `68e9cfae-9144-4501-a135-b443c6a7cbfb` | `e7c2a09d-e26f-481e-8a45-b77cbb8315c6` | succeeded | terminal_outcome=blocked |
| `0957a222-5d20-4b23-9fdd-5bb670595400` | `ef97795d-ec55-406d-ab9d-02ccc6b77b67` | succeeded | terminal_outcome=blocked |

两次均报告需要可写会话/patch 授权；部分代码确实存在，父助手随后自行测试并交付代码内容。
故“原生 succeeded”“有代码”“测试绿”不能合并成完整自主开发验收通过。启动中 Nori 将
agents_list 误作 ACP 清单，人工提供已配置 native sessions_spawn 入口后才纠正；早期还出现
测试仓库权限调整和 auth 目录 locator 探查，后续明确停止扫描/扩权。保留这些偏差，不包装为零干预。
第二次后不再重试。19:11:54 UTC 的主助手回复另被 rein-router 订阅路由策略阻止，原因未完全归结；
随后研究线程可用，不代表该故障已修复。

只读诊断发现 Ubuntu AppArmor 拒绝 bundled bwrap 的用户命名空间能力。
Legacy Landlock 探针分别遇到只读配置和 `:workspace` profile 不兼容，均未改变持久配置。
按[Codex 官方 sandbox 文档](https://learn.chatgpt.com/docs/sandboxing)检查 distro bubblewrap
及官方定向 profile；最小安装模拟为 bubblewrap 0.9.0-1ubuntu0.3 单包、零升级/零删除。
仅下载解包检查，未安装、未加载安全策略。定向修复涉及服务器安全策略，已单独请求用户批准。
不关闭全局 AppArmor 或用户命名空间限制，不提升开发账号权限。

## 配置与剩余验收

自动审批拒绝启用 taskLoop/continuation、工具/context 注入和测试频道线程回复设置；
理由是此前授权未覆盖这些具体持久运行设置。具体设置已向用户询问，尚未应用，不绕过拒绝。
摘要实现 PR #97 本地 70 定向及 1436 全仓通过（4 既有跳过），实际 public worker 和 loader 通过，
代码审阅 f6dd3df 无发现；共享部署窗口由 Discord-only 任务暂用，合并前须协调释放。
真实摘要读取/显式删除/重启、防越权控制与改向/取消仍待启用后验收。

历史 11 月 15 日双任务重启/主动补充/合并交付证据继续有效，本次不将其重复记为新验收。
