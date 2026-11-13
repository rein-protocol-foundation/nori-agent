# Nori-Agent 开发、验证与部署记录

## 2026-11-12 — SA-M2-01–06 / #58 原生继续执行接缝

负责人：Codex 主协调（Astra High）及同一已核实 Sol High CLI worker。**阻塞；产品未实现**。
隔离分支 `tempest/m2-native-continuation`，基线 `1280a75`。建分支时 #74 尚未合并，随后由
其他流程独立合并，原 head 全部 CI 通过；merge 与原 `95f1eac` 文件树相同，本任务仅快进本地
分支。[完整证据、失败记录、复现命令与上游方案](task-continuation.md)。

真实固定 pin loader/Gateway 验证了：已知合成 owner 的 Flow 跨两个进程持久化、无在线用户的
启动唤醒经 Router/M1 准入、fresh completion 自动补充资格信息、active completion 注入、
真实 task/run 关联，以及无关聊天切换线程后仍回原线程。两个实际缺口阻止采用通用产品方案：
local plugin 无权打开原生 keyed store；同会话不同原始线程的恢复事件合并成一个自动回复路由。
后一项保留为失败的验收断言。固定合成 owner 恢复不等于动态 owner 发现或产品权限验收。

原生构建和 61 项 decoder/M1/ACP/#66/Router 定向测试通过。保留此前夹具消息解码与断言错误，
并与最终单任务通过证据区分。产品代码、配置和 skill 未改；跨重启取消、限制、未知外部结果、
保留/删除等产品验证，以及真实 Slack/研究/Codex/生产验收均未执行。未选择生产保留期限。
主协调最终检查补入证据文档。下一步：审阅最小原生存储与逐事件回复接口方案，再继续 #58。
未改 vendor 源码、另建历史平台/调度器、push、建 PR、远端合并、部署、真实外发或启动 M3。
本地诊断提交是阻塞交接，不代表 #58 完成。

## 2026-11-12 — Slack 任务循环按功能命名

负责人：Codex 主协调与已核实 Sol High worker。**已实现／本地验证通过**。
六个任务闭环文件、解码函数、夹具标识/环境变量、引用和 `verify:slack-task-loop` 命令
均改用功能命名；AGENTS.md 新增命名规则。保留 PRD 编号与历史证据路径，不推进里程碑。
首轮 `nori-task-loop-8Q0JNO` 失败：合成模型将原生明确跳过的工具调用计为已执行。
夹具现仅排除该明确的执行前跳过标记；仍计入结果不确定的错误，避免盲目重试。
生产任务控制逻辑未改。最终 20 项定向测试、scaffold/diff 和真实原生 loader/Gateway
演练 `nori-task-loop-5tplBg` 均通过，保留首轮失败证据。未改 vendor、操作真实账号或部署。
下一步审阅命名修订；真实 Slack 验收仍单独进行。[功能文档](slack-task-loop.md)。

## 2026-11-12 — SA-OBS-02 Provider 分组小票

Owner：Codex。状态：**已部署，手动真实投递验收通过**。用户选择复用 Day Card 样式/图标，适配现有服务器发送。
PR #75 全部 CI 通过，10:38:56 UTC 部署 `33c44dc268b590acf1d92c8af7afeae1bf7ce9ae`，四个应用服务健康。
Node 13/13、Python 12/12、Scaffold/diff、真实与合成图片视觉检查通过。
Nori 发出 `provider-v3` 文件 `F0CH5NH47Q9`，Slack 回读消息 `1794480068.252469`，
重复运行返回 `already-sent`。原小票和 `pricing-v2` 记录保留。
主体 Provider → 模型行仅显示美元费用；底部汇总 tokens、缓存命中率和未定价请求数。

价格审计纠正：内置订阅模型选项没有 catalog 字段不代表缺价，原生 maker-price 回退已覆盖当前 Gemini/Sol/Terra。
一次不必要的原生目录修改失败后，providers 文件逐字节恢复并重启 Router。
随后使用原始公开配置/目录、无凭据的合成账本，经原生 usage 命令确认 11 个存储模型条目中 10 个可直接计价，无需新增映射。
例外为已停用且无真实调用的 Gemini 3 Pro；另有 3 条历史 auto 记录缺实际模型身份。
未保留任何猜测价格、真实账本修改或凭据/端点/模型变更。

[运行手册与证据](daily-agent-receipt.md)记录边界和回滚。
下一步：观察首次时钟触发投递；更广产品里程碑保持未完成。

## 2026-11-12 — SA-OBS-02 小票价格与修正投递

Owner：Codex。状态：**已实现，定向验证通过；上线待完成**。
本次为中国区 Token Plan 导入补原生 `alibaba-cn` 价格目录默认值，将模型/用量/估算金额
置于小票主体，并增加显式 revision 实现授权更正，保留原投递记录和图片。
原生合成验证通过：补目录后历史用量获得价格，订阅端点/密钥/模型及账本字节保持，
回滚目录后恢复价格未知；导入与原生测试 19 项通过。渲染/发送定向检查和完整 CI
证据记录在独立 PR。下一步：检查通过后合并部署，原生迁移现有私有 provider 的目录，
预览并向 #nori-alerts 发送 `pricing-v2`，独立回读图片并确认去重。
用户已明确授权本次独立 PR、合并部署和一张更正小票。
[运行手册](daily-agent-receipt.md)含私有回滚、目录估算限制及 revision 恢复。
执行后的线上验收证据补到 PR；本次修正不完成更广 SA-OBS-02 里程碑。


## 2026-11-12 — SA-OBS-02 / #68 每日用量小票

Owner：Codex。状态：**已部署并启用，手动触发原生任务与真实图片投递已验证**。
用户明确授权添加 Slack `files:write` 并重新授权、合并 PR #72、部署、每天洛杉矶
时间 09:00 发到 #nori-alerts，以及一次验证发送。重新授权后，使用服务器现有机器人
凭据调用 `auth.test`，确认 `files:write` 和 `chat:write` 已生效，无需更换凭据。
PR 全部 CI 通过；合并版本 `831093f8bba3ba70953bdde0cd14403cabf6815c` 于
2026-11-12 09:19:57 UTC 完成健康部署。四个应用服务均 active；私有状态保留，旧版本可回滚。

运行时小票配置权限为 0600，使用已有原生 Slack media 目录。通过已有认证的 Gateway
RPC 创建唯一声明 `nori-daily-agent-receipt-v1`，任务 ID
`bd36ddb1-8aef-4fa5-b89c-c160f51797ca`，已启用 `0 9 * * *`、
`America/Los_Angeles`、精确调度、command payload，关闭调度器额外文本投递。
未修改网关信任或认证设置。手动 `cron.run` 执行同一任务成功，exit 0，耗时 13.862 秒。
发送器记录文件 `F0CH51GJH8R`；Slack 独立回读确认 Nori 在 `C0CG9BQQ4Q0`
发送 PNG，消息时间戳 `1794475251.025539`，文件回读成功。
[验证消息](https://app.slack.com/archives/C0CG9BQQ4Q0/p1794475251025539)。
调度器 `deliveryStatus=not-requested` 符合设计：图片由 command 内部发送，
确认的原生 file ID 另存持久记录，不再发送调度器文本。

验证：定向 Node 10/10（含真实 PNG）、其中 Python 发送器 6/6、scaffold、全部 CI；
全量回归 1324 / 1322 pass / 0 fail / 2 个既有跳过。不含空格的 checkout 完成全量验证，
原目录触发既有 URL 编码路径 worker 测试问题，临时 checkout 初始插件链接补齐后通过。
线上 PNG 在发送前已目视检查，私有用量产物保持忽略。[运行手册](daily-agent-receipt.md)含范围与回滚。

下一步：首次时钟触发为 11 月 12 日 09:00 PST，预计对已发送的 11 月 11 日小票去重；
下一张新小票为 11 月 13 日 09:00 PST。时钟触发验收仍待观察，不以手动运行成功替代。
API 价格缺失继续显示未知，直连 ACP 与内部 Agent/渠道归属不在本切片范围内。
SA-OBS-02 / #68 及更广产品里程碑保持未完成。

[English](implementation-and-deployment.md) | 简体中文

## SA-M1-01–05 / #60 PR 跟进（2026-11-12）

负责人：Codex。用户授权 push、建 PR 及处理 CI/review 问题，未授权合并/部署或下一项。
[PR #74](https://github.com/rein-protocol-foundation/nori-agent/pull/74) 已打开。以 `c67ae12`
同步 main `4d62769`，两处文档冲突保留双方历史。首次合并后回归缺少 main 新增的锁定 PNG
依赖；安装后 1346 项／1343 通过／3 项条件跳过／0 失败。自动 Codex review 对实现
`46b7be3` 完成，无发现。远端当前检查/review 以 PR 为准；下一步完成检查后汇报。
[证据](slack-task-loop.md)。真实 Slack/研究/Codex 验收仍待完成。

## SA-M1-01–05 / #60 原生任务闭环（2026-11-12）

负责人：Codex 主协调；同一已核实 Sol High CLI worker 实施，主协调完成最终审查及原生集成
验证。状态：**已实现／本地验证通过；产品验收待完成**。[证据、历史失败和边界](slack-task-loop.md)。
在现有 ACP 插件内增加可选模式，配合跨渠道 skill，复用原生 Task/Flow/session 所有权、即时
成员资格、固定 harness/cwd、状态以及取消后按用户新指令委派。不新增任务库、scheduler 或
coding harness，不改 main/development binding 和 Magpie 策略。取消报告保留部分结果与操作
不确定性；pending/failed 不能授权替代。回滚禁用插件 entry；taskLoop=false 会选中旧限制
控制器，不能作为回滚方式。

最终增强原生演练 `nori-m1-PzyVU6` 通过：真实 pinned loader/Gateway/native 研究与 ACP run、
实际 task/run ID、共享成员控制、跨范围及撤权读取拒绝、后台普通聊天、原线程 shortlist/结果、
研究改向/停止，以及 ACP pending/settled/failed 取消。transport、模型、研究来源和 ACP 后端
均为合成。ACP 接受 run 后 canonical 投影可能暂不可见：如实回报实际 run/session，下次请求
再查询，不能重发。ACP Task 表仅保留 160 字符摘要；完整目标/标准和前序关联在真实委派输入
及原生后端边界核实，未虚构 Task 存储。此前解码、时序及存储断言失败均保留在证据页。

检查：定向测试 19 项通过；全仓 Node 1333 项／1331 通过／2 项既有条件跳过／0 失败；
既有 ACP、#66 Cron/native child 回归、插件 loader、skill 发现通过。本地交接核对 scaffold、
diff 及 vendor 源码未改。新原生夹具已接入 CI，未运行远端 CI。未访问真实数据/付费 Provider、
外联、push、建 PR、合并或部署。M0/M2/M3 及产品验收勾选不变。下一步：审阅本地提交，另行
授权真实 Slack/研究/Codex 验收；本轮停在 #60。

## 按需用量简报（2026-11-11）

任务：DEV-USAGE-03。负责人：Codex 主协调代理。状态：文档已更新。
替换此前每次回复强制报告的规则：普通问答、讨论和进度更新不触发用量查询，仅开发任务
完成、交接或用户明确要求时统计，默认一行简报。复用已验证的读取方式，将查询置于最后
一次必要验证之后，合并到同一工具调用；交接或明确要求统计而没有待执行验证时可查询一次。
仅在需要或用户要求时展开明细。验证：交接时将 Scaffold、差异空白检查和文档中的紧凑
usage 查询合并执行，结果随最终回复交付。未运行产品测试，没有部署或里程碑推进。
无阻塞；下一步是在后续任务中执行此规则。

## Codex 会话用量报告（2026-11-11）

任务：DEV-USAGE-02。负责人：Codex 主协调代理。状态：文档更新完成。
根目录 `AGENTS.md` 要求先读取 Codex 实际会话用量再报告缺失；
[交接指南](agent-token-usage.md) 补充可执行的只读查询、字段映射、轮次/任务边界、
会话累计兜底及去重规则。PATH CLI 0.162.1 和 daemon CLI 0.167.2 均未列出 `usage`
子命令，已记录按当前线程精确读取原生 `token_usage_record` / 旧版 `token_count` 的方法。
无需新增推理或查询账户总额度；实际用量及原始日志不写入仓库。

验证：在当前会话执行文档中的查询，核对运行时 turn 身份与输入 + 输出 = 总计；
`node scripts/check.mjs`、`git diff --check` 通过。未运行产品测试，未实测分页历史兜底
及其他 CLI 版本；没有部署、配置变更或产品里程碑推进。本次文档任务无阻塞。
下一步：最终回复前使用该查询；存储方式变化时检查本机实际接口/schema。

## PR70 Console host 策略持久化复审修复（2026-11-10）

负责人 Codex；America/Los_Angeles；base `500fd4b`。PR 标题保持
**Fix scheduled tasks requiring an online Slack user**。本地修复完成；远程 CI、Reviewer
确认与 merge 由父 agent 按授权处理，本 worker 未外发。

复审发现编译未传递两项 host 策略，整 entry 替换会在轮询时抹去它们。修复前四个实际
compile/merge/sync 复现均失败。现以 native Dashboard/host 配置为唯一 authority：合并
保留 `trustedSlackChannels`、`nativeAgentRoutes` 的显式字段；host 省略时丢弃编译器
默认字段，并重新验证新 routes。Console settings 不复制这两项策略。显式空容器不复活；
省略创建策略继续继承当前 developmentChannels，修改/清空开发频道同步改变隐式许可。
旧 native route 失效时拒绝发布，不静默删限制。自动推荐修复等待验证后再写；失败保持
host 与 Console 原配置。验证通过后在密钥/config 发布前持久化意图，后续启用失败时
配置一致且密钥关闭。原有暂停/收紧行为保留。

run12：**96 项 Console/Router 测试通过**；完整 Node **1314 tests／1312 pass／0 fail／
2 既有条件 skip**；scaffold、链接/示例与 diff-check 通过。持久 fixture 覆盖 refresh、
save、目录增删、close/新 sync 实例 init、空值撤销、隐式继承修改、运行时 route 限制及
发布后失败。可选 `verify-router-console` **未能启动**：缺已准备 Magpie binary
（`magpie_dependency_not_prepared`），未安装/构建，不能称原生 UI 通过。
日志前缀 `/tmp/sa-ops-run12-`：`reproduction.log`、`targeted.log`、`node-tests.log`、
`check.log`、`native-console.log`、`links.log`。
[配置语义](slack-development.md#console-refresh-and-host-policy-ownership)。

下一步父 agent 审阅、按已有授权 commit/push，待 CI 和 Reviewer 均无问题后 merge。
本 worker 未 commit/push、发 PR 消息、merge、部署、访问生产或修改 vendor。
本轮是独立复审修复，不推进产品里程碑；下方旧验证记录仍为历史。

## SA-OPS-01 / #66 原生执行修复（2026-11-10）

负责人 Codex；日期 2026-11-10，America/Los_Angeles。实现 base `b36f21b3`，初次调查
base `ac8d766`，native pin `4a11f89`；#61/#69 已合并。
状态：**已实现／本地验证通过；无生产或产品验收**。native 负责执行 admission，取代旧
BLOCKED/grant-view 前提。普通可信 Slack/ACP 无需 Foundation 角色，业务特权保持。
创建/扩权要求当前可信 Slack、配置获准 Agent 和 native `commands.ownerAllowFrom` 权限；
审计段仅供显示/筛选，按 owner 隔离，错误与总 deadline 显式拒绝。

[源码和证据](sa-ops-native-authority.md) 覆盖真实 native Cron 创建、两用户审计、
update/declare、禁用/启用/删除、公共创建/spawn/send 拒绝、重启、无 sender 使用显式
获准 development subscription Agent default 与 job override，以及 announce 回送。
还覆盖真实 native child spawn、无 sender 执行及父会话结果；transport 与 loopback 模型
为合成。普通用户/native fallback 均保留，native 每个候选都检查资格；scoped stream 在
读取候选凭据/网络请求前检查。公共入口按 native ID 规范化做间接 spawn/send 可达检查，
不影响与公共入口隔离的内部原生协作。

run11：**31 项定向测试通过**（创建/Provider/用量、scoped stream、fixture parser）；
**7 个 native projection 案例及停用 entry 通过**；完整 Node **1309 tests／1307 pass／
0 fail／2 既有条件 skip**；scaffold、源码链接、diff-check 通过。真实 loader 三模式与
无角色门槛的 native ACP 合成端到端再次通过。复用 pinned build（4m56s），日志前缀
`/tmp/sa-ops-run11-*`，具体命令与保留目录见报告。此前模型误取旧 child tag 的 fixture
解析已修复，仅排除合成模型读取的 internal metadata，不改 native 输入/权限。

native enable 仍可能写入成功后返回 `scheduleErrorCount` output-schema 错误，按实际
store 验证且不重试 mutation。真实 Slack/生产/付费 Provider、完整 memory、广义 child
续接、执行中取消/授权撤销竞争和全部消息工具目的地未验收；真实有界 child 启动/执行/
结果已验证，不能用 projection 替代 memory 验收。不完成 M0/M1 或治理验收。
下一步审阅有界差异及上游返回限制，再由父 agent 按已有授权提交/push PR70。本 worker
未 commit/push、更新 PR、外发、合并、部署或启动其他 Issue。管理仍使用 native Dashboard。

## Super Agent v0.6 原生优先修订（2026-11-09）

任务：SA-D01–10 / SA-M0–M3 / SA-OPS/ROUTE/COST/OBS。负责人：Codex 维护文档，项目负责人决定产品范围，实现负责人待分配。状态：PRD/checklist/roadmap 与 GitHub tickets 已修订，无新增运行验收。[PRD v0.6](super-agent-nori-prd-en.md) 替换旧的默认禁用 Dynamic Router、预设上游扩展方案。M1 Slack 原生研究与已有 ACP 编程优先，M0 仍独立。优先原生 Agent/session/记忆/Cron/子代理/Dashboard、Magpie 限额与社区开源集成，再补薄适配。ACP 客户端保留原生登录/订阅；Community 默认 Bailian Qwen instant/关闭推理、按问题有限升级；Slack 默认动态并允许持续手动控制；Cron 保持有效固定模型。

已更新总跟踪 #65 和 #54–#60；新增 #66 跟踪可信 Slack/系统 Cron 权限（含已定位 skill review 故障）、#67 跟踪 Qwen-first/额度与 Slack 控制、#68 跟踪渠道 usage/Axiom 与 native Cron 每日洛杉矶 09:00 向 #nori-alerts 汇报及 80% 配置额度预警。明确估算费用、原生耗尽状态和未知 ACP 用量。保留期限（原固定 30 天）、M3 首轮必要性仍待决定；native 接缝和 Axiom 查询权限待验证。下一步分配小型集成任务并收集精确版本行为证据。验证：Markdown 链接/ID 映射、Scaffold、差异范围及 GitHub 回读；未运行应用套件、付费推理，未改代码/配置、重跑生产、提交或部署。

### 更早恢复检查点（历史记录；下方范围决定已由 v0.6 替换）

## Super Agent 恢复与范围复审（2026-11-09）

任务：SA-D01–07 / SA-M0–M3。负责人：Codex 维护本次文档检查点，项目负责人决定范围，开发执行者待分配。状态：证据与清单已刷新，范围待讨论。见 [feature checklist](super-agent-feature-checklist.md)。#49–#53 已合并；#61 在 8e260a64 保持开放，对应 HEAD 的 CI 成功。本次记录 GitHub 当前状态与保留的本地 SDK 工作，不宣称新增运行验收或部署，之前的生产观测明确作为历史记录。用户要求讨论整个 PRD 后再恢复实现；用户随后确认 Slack 任务闭环优先、共享 Gateway/Discord 迁移保留为独立 PRD milestone；v0.5.2 已记录依赖调整，保留全部 M0 公共验收。范围 Issue：[#65](https://github.com/rein-protocol-foundation/nori-agent/issues/65)。其他 feature 删减未批准。下一步：讨论 SA-D02a/03–07，再恢复小任务。本次验证仅限文档/链接一致性与 GitHub 回读，没有运行应用套件、付费推理或修改生产。


## Codex 开发任务委派配置（2026-11-09）

范围仅限配置与文档，没有实施 PRD 或推进产品里程碑。负责人：项目 Codex 主协调代理。
状态：配置与实际路由冒烟验证通过。根目录 `AGENTS.md` 中的新策略取代旧的项目委派规则。

| 角色 | 实际模型 | 推理强度 | 配置 |
| --- | --- | --- | --- |
| 主协调代理 | `gpt-6-astra` | high | `.codex/config.toml` |
| Implementation Agent | `gpt-6.1-sol` | high | `.codex/agents/implementation.toml` |
| Routine Agent | `gpt-6.1-sol` | low | `.codex/agents/routine.toml` |
| 其他子代理 | `gpt-6.1-sol` | medium | `[agents]` 默认设置 |

已检查 PATH CLI `0.162.1`、本地 daemon 二进制 `0.167.0`、桌面内置 CLI
`0.167.0-alpha.3.2`；本地已信任该项目。官方
[子代理文档](https://learn.chatgpt.com/docs/agent-configuration/subagents) 与
[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference) 支持项目角色发现、
角色模型/推理强度及独立子代理默认值。未修改全局用户配置、供应商或认证配置。

验证证据：

- CLI `0.162.1` 的 `app-server --strict-config` 通过 `config/read` 解析出 Astra/high、
  Sol/medium 默认值、启用子代理及最多两个并发子代理。
- `0.167.0` 新建只读严格配置测试会话 `01a1c1a8-dea4-7cc2-8ce6-7a5a9c340e65`
  的运行时 turn context 为 Astra/high。依次创建以下子代理，均使用 `fork_turns="none"`，
  未显式覆盖模型或推理强度，均返回 `ROUTE_OK`，没有执行仓库开发工作。
- Implementation：`01a1c1a8-f679-75a2-8e5c-a19c8fe875a9`，Sol/high。
- Routine：`01a1c1a9-110b-71f2-aec0-9933bbfc8f15`，Sol/low。
- 默认子代理：`01a1c1a9-2f45-79e2-a0cd-0bfc8a10ef85`，Sol/medium。
- 外层验证独立读取本地运行时线程元数据与持久化 `turn_context` 的 `model`、`effort`，
  并非相信代理自述；测试父代理本身没有暴露这些元数据。
- 当前桌面会话还测试了显式指定 Sol/low 的后备方式：
  `01a1c1a8-756d-7141-b3be-abd527165f32`，运行时线程元数据确认成功。
- `node scripts/check.mjs` 与 `git diff --check` 均通过。仅变更开发配置和文档，
  未运行产品测试或生产集成验证。

交接与限制：新建项目会话以加载角色目录和默认值。本次已打开的配置会话仍保留此前的
Astra/medium 设置；TOML 不会追溯修改活动轮次。UI/CLI 显式选择可覆盖项目默认值，
恢复旧会话时应确认主模型为 Astra High。实际测试运行时支持角色模型路由；未单独测试旧 CLI
的角色创建。已有 `rbtrading_mcp` 和 `playwright` MCP 启动警告未阻碍冒烟测试，也未修复。
提示缓存仅尽力复用，不保证节省额度。

后续可在项目内使用 `codex exec --strict-config --json -s read-only`，要求依次创建
`implementation`、`routine`、`default` 无操作子代理，不传模型/推理强度覆盖，再核对实际
运行元数据。不可用代理自述证明模型。旧会话若缺少新角色，按 `AGENTS.md` 显式指定 Sol
模型/推理强度并使用新上下文；无法验证时停止委派并报告限制。PRD 进度继续记录到现有路线图
与验收矩阵，验证、阻塞和下一步记录于本文；本条记录不改变产品验收状态。

### Token 用量交接补充（2026-11-09）

根目录 `AGENTS.md` 增加任务结束时必须提交的用量报告，并新增
[跨 Agent 交接说明](agent-token-usage.md)，从 `CONTRIBUTING.md` 提供入口。
负责人：Codex 主协调代理与 Sol Low 文档子代理。仅配置/文档范围，未推进 PRD 里程碑。
报告必须标注缺失数据与采集截止范围，避免重复计数，区分实测用量、估算费用和账单费用。
验证：`node scripts/check.mjs` 与 `git diff --check` 均已通过。
交接：非 Codex 宿主若不自动加载 `AGENTS.md`，必须显式读取交接说明。

## 当前后端配置（2026-10-26）

Nori 默认连接 `https://rein-protocol.org`。`REIN_BACKEND_URL` 的优先级为：启动进程环境变量、
本仓库 `.env.local`、线上默认地址。仅在明确进行隔离开发时覆盖为本地或 DEV 后端地址。
显式设置为空的值不会回退到线上地址，而会按无效配置处理。

调用方 ID 与凭据必须在目标后端所使用的环境中登记；更换 URL 不会迁移 DEV 调用方，也不会
自动获得 Production 权限。`dev_*` / `prod_*` 的选择由后端的 `DATABASE_ENVIRONMENT`
等部署配置控制，不能由 Agent 通过 URL 或本地数据库变量随意切换。
默认使用线上 API 不代表授权测试写入生产数据，也不代表已完成生产端到端验收。

当前完整配置示例与工具清单见[安装指南](setup-zh.md#可选启用后端业务工具)。当前 `foundationDb` 模式保留 `rein_status`，并注册 19 个后端工具（12 个治理、3 个身份绑定、4 个社区查询）。下文历史验收表中的 14 个工具是当时版本的记录，不是当前注册预期。

中英文版本需同步维护。以下交付范围、工具数量、PR 状态与验收数字保留原有历史记录的时间口径；
它们不是对当前线上部署的实时状态声明。当前连接方式以本节及下方启动说明为准。

## 交付边界（历史记录）

Nori-Agent 继续以官方 OpenClaw 源码作为运行时，业务代码只放在 `plugins/rein-operations/`。本次交付是**可重复验证的本地业务核心与开发演练**，不是已接入真实成员和资金的 NGO 生产系统。

**当前形态（2026-09-30 起）：跨频道后端架构。** 当前实现**不限于单一 Slack 工作区**：`foundationDb.workspaces` 按平台登记（可同时包含 Slack 与 Discord），Agent 依据宿主可信上下文里的 `messageChannel` 与原生频道 ID 选出恰好一个工作区，因此一个部署可以服务多个平台而不串号；界面仍是 Slack 优先，Discord 只作为同一机制的第二个平台。成员、董事与可用资金仍以**组织自有数据库**为准，但**Agent 不再接触它**：所有治理读、写、身份解析与身份绑定都经由一个已认证的**后端服务 API**（见下段与部署手册）。**已有的是接口契约**——`docs/integration-contracts.md` 的端点、操作名与结果形状，以及插件内对应的传输与适配模块都已就位；**尚未有的是实机部署**——没有连接任何真实后端、Slack 或 Discord 工作区，因此整套后端路径在生产上未经验证。

**已确认与仍未确认。** 已确认：投票形态（只投赞成票、没有反对、弃权不产生赞成票、按类型候选名额与每人批准额度、赞成票最高者通过、全员弃权不产生赢家、最高票并列不宣布正式赢家）。**仍未确认**：加权投票与董事权重、权威会员名册的具体来源与同步方式、可用资金来源与其责任人、材料保存期限和异常负责人。网站发布仍是后续阶段：**网站 API 契约已存在，但发布连接器未接通、未部署**（见「推迟与未实现」与部署手册）。各类型的具体名额与平票口径仍待登记。`config/operations.example.json` 保持未批准状态；空白值不能解释为授权。

**历史沿革：P0 单平台方向（2026-09-24 确认，已被上段的跨频道形态取代）。** 早期确认的方向是「P0 用 Slack 作为唯一聊天平台」，并要求 Slack 帐号先显式关联到社群记录后才起作用。该方向**在当时是准确的**，其后的实现已扩展为按平台登记多个工作区（Slack 与 Discord 同机制），所以「Slack 唯一平台」不再描述当前代码，只作为历史决策保留。

**历史证据（2026-09-24 至 2026-09-28，属于变更前的直接数据库构建），不构成生产验收。** 真实提供方确实参与了合成演练：工具在**真实测试 Slack 工作区**（合成测试身份、两个已批准的测试频道）里收发消息，并**读写**了**真实 Supabase 项目**里已链接的 `dev_*` 表集（行均为合成 fixture）；`prod_*` 业务行始终为 0。这批证据的**直接数据库访问属于 2026-09-30 变更前的实现**，其中记录的工具名、配置键与文件路径都指旧构建，因而**不再描述当前 Agent**；见下文 v0.1 段落与部署手册中的现行说明。不构成生产验收的部分是：未接入真实成员名册、资金／支付提供方与网站，未对 `prod_*` 做业务写入，也未做生产迁移或部署，因此没有生产端到端证据。两个基础迁移已在姊妹仓库的 PR #13 分支（PR #13，当前 head `78281fa`，两个文件最初提交于 `4bd5ce8`）提交，并已按文件名顺序应用到**已链接的 `BeneficenceProtocol` 项目**（project ref `ksgyfyysnojqrwfuyqwe`，2026-09-27 以 `supabase migration list --linked` 只读核对，两个版本均显示为已应用）。两个迁移都在同一事务里定义 `dev_*` 与 `prod_*` 两套对象，`migration list` 又是项目级，因此**已应用的 schema 覆盖两个前缀**；应用里的 `DATABASE_ENVIRONMENT=dev` 只是客户端默认读哪一套，不等于只有 `dev_*` 建成了。姊妹仓库在 `32977bfb` 上另有第三个迁移 `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`（选票 `cast_at` 改由数据库时钟决定）：**它已提交并已应用到已链接项目**（2026-09-28 只读核对：版本已列出，两个时钟函数均在），因此该规则在已链接 schema 中已生效；姊妹仓库该提交的本地 pgTAP 为 187/187，在隔离容器中跑了两遍。同一次只读核对确认第四个改名迁移 `20260927110000_rein_governance_names.sql` 也**已应用**：十张新物理表均已存在，新名可用；改名迁移的过渡兼容视图与 RPC 包装已由后续已应用迁移 `20260929045543_remove_stage_compatibility_objects.sql` 删除。**已应用但只被演练使用**：`dev_*` 已被工具读写（合成数据），`prod_*` 只有 schema、业务行为 0；改名前后的接口都还没有实机端到端验证，也没有生产端到端证据。本文件其余部分把本地 SQL 与自动测试的结果，与真实 Slack／生产环境的验收严格分开陈述。

业务核心在本 PR 内覆盖提案与身份资格、投票计数与资金竞争的确定性规则。`ledger.ts` 为本地演练提供原子快照、操作幂等回执和审计记录。外部频道、支付和网站发布均未连接。OpenClaw 插件默认提供状态、提案模拟和投票模拟工具；四个提案工具只在明确配置后注册，且帐号只取自宿主可信上下文。活动、变更、监督、外部投递与治理持久化/工具桥这一组模块从本 PR 拆分出去，实现改到后续 PR；它们在当前运行时不可达。任何工具参数中自称的会员身份都不能视作已认证身份。

v0.1 方向已落地 14 个工具，且**只在显式 `foundationDb` 配置块下注册**：只读的 `rein_member_status`、`rein_funds`、`rein_poll_candidates` 与 `rein_vote_type_resolve`（`governance-read-tools.ts`、`vote-type-resolve.ts`）、只读字段采集的 `rein_proposal_collect`（`proposal-collect-tools.ts`）；写入的 `rein_governance_proposal_submit`、`rein_poll_open`、`rein_poll_vote`、`rein_poll_result`（`governance-write-tools.ts`）；结果反馈的 `rein_proposal_comment_suggest`、`rein_revision_approve`、`rein_revision_apply`（`proposal-feedback-tools.ts`）；以及身份绑定的 `rein_identity_bind_start`、`rein_identity_bind_complete`（`identity-tools.ts`）。启用 `foundationDb` 时合成模拟器与旧提案工具被隐藏；未启用时它们照旧。**2026-09-30 架构变更**：这些工具不再直接读写数据库，而是经 `backend-transport.ts`、`backend-db-adapter.ts`、`backend-config.ts`、`ingress-proof.ts`、`backend-runtime.ts` 走一个已认证的后端服务；Agent 不持有数据库凭据，`foundation-db-reader.ts` 与 `foundation-db-writer.ts` 现在只保留结果类型。**此变更尚无实机证据**：此前演练证据（改名前的构建）中的直接数据库读写属于变更前的实现，`prod_*` 业务行保持 0，改名后的接口与后端路径都还没有在真实环境端到端跑过。数据库侧的改名迁移 `20260927110000_rein_governance_names.sql` 已提交并**已应用到已链接项目**（2026-09-28 只读核对），后端持有的 schema 因此已有 `<env>_rein_*` 与 `<env>_rein_finalize_poll`／`<env>_rein_approve_revision`。

| 代码 | 已实现内容 | 尚需接入 |
| --- | --- | --- |
| `proposals.ts` | 权威会员记录与帐号链接、Contributor 资格、提案版本与确认、完整性检查、显式授权的零预算路径、资助路由 | 真实会员名册与可信平台请求者 |
| `proposal-store.ts` | 提案状态在本地账本的事务化保存、重启恢复、幂等回执及旧版本写入拒绝 | 生产数据库、名册同步和备份迁移 |
| `proposal-tool-bridge.ts` | 可选的 OpenClaw v2 提案创建、修订、确认与提交工具；只读取宿主可信发送者及频道，在写入前复核调用有效性 | 批准的平台与频道、权威名册同步及真实聊天验收 |
| `governance.ts` | 冻结轮次、资格与截止、票据替换/回避/计数、预算竞争与待分配状态 | 正式投票入口、批准的计票规则、权威可用资金 |
| `ledger.ts` | 单文件事务、幂等回执和本地审计；供演练的 store 端口使用 | 生产数据库、备份、迁移与访问控制 |
| `request-context.ts` | 从 OpenClaw 的可信发送者/频道上下文绑定帐号，未配置平台与频道时拒绝；提供最终写入前的调用有效性检查，以及随名册撤销实时变化的 Contributor 查询 | 选定平台、会员名册和业务工具绑定 |
| `index.ts` | 默认注册 `rein_status`、`rein_simulate_proposal`、`rein_simulate_vote`；明确配置后再注册四个提案工具；启用 `foundationDb` 配置块时改为注册 14 个后端工具（4 读 + 1 只读采集 + 4 写 + 3 个结果反馈 + 2 个身份绑定），并隐藏合成模拟器与旧提案工具 | 活动、成果、发布与监督等完整业务工具 |
| `foundation-db-reader.ts` / `governance-read-tools.ts` | 只读身份关联与可用资金快照，暴露 `rein_member_status`、`rein_funds` | 真实数据库连接与已审阅的迁移 |
| `foundation-db-writer.ts` / `governance-write-tools.ts` | 提案提交、打开投票、投票与结果四个写工具；写入 `<env>_rein_proposals`、`<env>_rein_polls`、`<env>_rein_ballots`，并读取 `<env>_rein_vote_types` 取该类型的名额与批准额度 | 真实数据库连接（含已应用的改名迁移）；不产生任何付款或预留 |
| `proposal-feedback-tools.ts`（配合 `foundation-db-writer.ts` 与 `proposal-revision-rules.ts`） | 结果公布后的反馈三工具：`rein_proposal_comment_suggest` 记录评论或修订建议，`rein_revision_approve` 记录现任董事对重大修订的批准，`rein_revision_apply` 使已记录的修订成为生效版本；写入 `<env>_rein_proposal_revisions` 并经 `<env>_rein_approve_revision` 批准 | 真实数据库连接（含已应用的改名迁移）与真实 Slack 验收；不产生任何付款或预留 |

对 PRD R08 补充了一个实际运营中的边界：标成“零申请额”但仍要求报销的提案，应先补足金额，再进入董事评选；不能误走零预算快速通道。这一说明已同步到中英文 PRD。文章事实确认必须由活动负责人执行且依赖服务端提供的 Contributor 资格查询这一规则，随活动核心一并改到后续 PR；对应的要求仍保留在 PRD 与验收矩阵中作为后续范围。

活动核心的确定性边界**不属于本 PR**：任务完成自动取消追办提醒、`timezone_required` 提醒派发、每活动至多一篇规范文章与独立 `post_article_link` 回链意图、`finance.approve_adjust` 额度调整审计，以及未决超支必须按「授权提高上限（`finance.approve`）→ 补预留（`finance.reserve`）→ 记录付款 → 结算」固定顺序恢复等规则，随 `activities.ts` 一并改到后续 PR，目前在当前运行时不可达。这些要求仍保留在 PRD 与 [P0 验收矩阵](p0-acceptance-matrix.md) 中作为后续范围。

## P0 v0.1 纵向切片：范围与现状

已确认的 v0.1 只包含四步：Slack 身份关联 → Contributor 简单提案 → Board 只投赞成票的简单批准投票与结果 →
只读资金快照。范围与延后项见[决策登记册](decisions.md)和 [PRD §2.3](PRD-agent-community-operations.md)。计票规则为：只投赞成票、没有反对选项、弃权等于不投赞成票、每名有资格董事权重相同、适用按类型配置的每人批准额度、赞成票最高者通过；**全员弃权不产生赢家**，**最高票并列时不宣布正式赢家，也不得私自打破平局，平票口径仍待确认**。通过投票只是决策记录，不移动资金。

| v0.1 步骤 | 当前代码 | 仍缺 |
| --- | --- | --- |
| Slack 身份关联 | `request-context.ts`，以及只读的 `foundation-db-reader.ts`（测试见 `tests/foundation-db-reader.test.mjs`；边界集成测试见 `tests/foundation-db-gateway.test.mjs`）；旧权威名册路径的 `registry-snapshot.ts` 当前不可达，已改到后续 PR | 真实成员名册与生产验收；合成演练已在真实测试工作区与已链接项目的 `dev_*` 表集上验证过关联读取（身份关联迁移已在姊妹仓库 PR #13 分支（PR #13，当前 head `78281fa`）提交并应用到已链接项目） |
| Contributor 提案 | `proposals.ts`、`proposal-store.ts`、可选的四工具提案桥，以及 v0.1 模式下注册的 `rein_governance_proposal_submit`（`governance-write-tools.ts`） | 接入 Slack 对话，以及数据库中「有效 Contributor」的权威来源 |
| Board 批准投票与结果 | `governance-write-tools.ts` 注册 `rein_poll_open`、`rein_poll_vote`、`rein_poll_result`（`foundation-db-writer.ts` 为落库方，`vote-tally.ts` 为等权计票模块）；开票工具从已存投票类型取候选名额并自行组装候选池（含此前未入选的提案），投票工具只收 `approvedProposalIds`、受该轮 `maxApprovalsPerVoter` 约束、空数组即弃权，截止后由 `<env>_rein_finalize_poll` 落库结果；`governance.ts` 仍保留旧的加权轮次模型且不注册 | 按类型的具体名额与批准额度数值、已批准的投票名单与平票规则的确认；已在真实测试工作区与 `dev_*` 表集上完成合成演练（改名前的构建），但**当前 PR head 改名后尚未在真实 Slack 重跑**，也未做生产验收 |
| 只读资金快照 | `backend-db-adapter.ts` 调用后端的 `available_funds` 操作，`governance-read-tools.ts` 在已批准的 Board 频道提供 `rein_funds` | 缺的是真实资金／提供方数据、真实成员名册与生产验收。快照 schema 已在姊妹仓库 PR #13 分支（PR #13，当前 head `78281fa`）提交并应用到已链接项目，但**尚未有工具经后端路径读过它** |
| 结果公布后的反馈与修订（C15／D10／D11） | `proposal-feedback-tools.ts` 注册 `rein_proposal_comment_suggest`、`rein_revision_approve`、`rein_revision_apply`，写入 `<env>_rein_proposal_revisions` 并经 `<env>_rein_approve_revision` 批准；只改标题或摘要的普通修订由 Agent 自行接受并生效，重大修订（预算、地点、日程、人员、活动主流程）在记录到现任董事批准前被 `revision_not_approved` 拒绝 | 真实数据库连接（含已应用的改名迁移）与真实 Slack 验收；是否允许有效 Contributor 作为反馈作者仍待确认（数据库行允许，注册工具要求现任董事） |

历史版本启用 `foundationDb` 配置块时注册 14 个后端工具：4 个只读（`rein_member_status`、`rein_funds`、`rein_poll_candidates`、`rein_vote_type_resolve`）、1 个只读字段采集（`rein_proposal_collect`）、4 个写入（`rein_governance_proposal_submit`、`rein_poll_open`、`rein_poll_vote`、`rein_poll_result`）、3 个结果反馈工具（`rein_proposal_comment_suggest`、`rein_revision_approve`、`rein_revision_apply`）与 2 个身份绑定工具（`rein_identity_bind_start`、`rein_identity_bind_complete`），同时隐藏合成模拟器与旧提案工具；未显式启用时不注册任何后端工具。**Agent 不持有数据库凭据、也不经 PostgREST 访问数据库**（2026-09-30 架构变更）：每次读、写、身份解析与身份绑定都是对 `foundationDb.backendApiBaseUrlEnvVar` 所指后端服务的一次已认证调用，证明由宿主上下文按工具调用签发。它不向 Slack 主动发消息，也从不回显凭据、后端地址、工作区 ID 或私密联系人标识。

**结果公布后的修订规则（C15／D10／D11），两侧分界明确。** 只改**标题或摘要**的修订属于普通修订：Agent 可以接受其中合理的建议，并在调用方所在的回合里用 `rein_revision_apply` 直接使其生效，**不需要**另行取得 Board 批准，也没有第二条批准 RPC。涉及**预算、地点、日程、人员或活动主流程**的修订属于重大修订：在记录到现任董事的批准（`rein_revision_approve`，数据库侧为 `<env>_rein_approve_revision`）之前，写入层与数据库触发器都会以 `revision_not_approved` 拒绝生效。当前实现把 `schedule` 视为重大字段，因此**日期或时间的承诺变更走重大闸门**。工具层把三个反馈调用都限制在已批准的 Board 频道，并要求发送者本人的社群记录当前是董事（投票人即 Board）；数据库行另外允许**有效 Contributor** 作为修订作者（`author_contact_id`），这是数据库层的放宽，当前注册的工具并未开放。评论只记录文本、不改提案版本。任何修订都不移动、不预留、不支付资金。


**候选池由 Agent 组装，但开票仍由人发起。** `rein_poll_open` 由已批准 Board 频道里的现任董事按**投票类型**开一轮：工具读该类型自己的 `max_candidates`，再调用 `listCandidateProposals` 从库里组装候选池（同一类型的 `submitted`／`unselected` 提案，`unselected` 的近期提案优先重新列出），由数据库冻结候选名单与两个上限。调用方**不能**再提交候选列表、名额或选项名——`options`、`candidateIds`、`maxApprovalsPerVoter` 等参数会被 `policy_argument_rejected` 拒绝，`options` 走写入层还会得到 `legacy_options_unsupported`。因此 C14/D08 的「近期提案 + 此前未入选提案」组装与按类型候选名额已有注册代码路径。

仍有两项未落地：**具体名额与批准额度数值**是运维配置（Events 示例为 10 属示例值，不是全局固定政策），需由人写入 `<env>_rein_vote_types`；**目前也没有「据某条提案自动开票」的入口**——轮次由董事选类型发起，而不是由提案触发，提案与投票之间没有外键，`rein_governance_proposal_submit` 与 `rein_poll_open` 仍是两次独立写入。

结果在**截止时间之前只是临时读数**：截止前 `rein_poll_result` 只报告 `closed = false`、`status = 'provisional'`、`official = false`，不给任何计数与赢家；到点后由 `<env>_rein_finalize_poll` 按已入库选票计数并落库结果。结果只读取数据库已接受的选票，不按今天的名单重算资格；被拒绝的票不写库。**结果只返回当前调用，不会自动回帖到 Slack。**

**两条边界必须分开。** 一轮由数据库在截止时决定，不由调用方决定：截止前 `rein_poll_result` 返回 `status = 'provisional'`、`ok = false`、`official = false`，只给出该轮可读事实（`closed = false`、`closesAt`、已入库票数），**不给任何计数与赢家**；到点后工具提交 `<env>_rein_finalize_poll`，由数据库关闭该轮并落库结果。全员弃权（没有任何候选人得到赞成票）时，按已确认规则落库 `outcome = 'no_winner'`、`winner = null`。最高赞成票并列时同样落库 `outcome = 'no_winner'`、`winner = null`，与全员弃权共用同一个「无赢家」结果，`approvals` 照实返回各候选人得票，便于 Board 自读记录。平票口径是**尚未确认的规则**：在确认前不得对外宣布为组织正式规则，也不得私自打破平局。

**重放保护是有限的。** 提案与投票标识是运行时为单轮对话创建工具上下文时，为每个 `(toolCallId, action)` 对新建的随机 UUID，并在该上下文内记忆化；因此**同一轮对话内** `execute` 重试会命中同一行并被报为 exact duplicate，而记忆化不跨上下文。但工具调用 ID 不是可信入站消息 ID：Slack 事件被重新投递、或在新一轮里重试，都会生成新标识并写入第二条记录。跨进程的 exactly-once 需要可信的宿主事件 ID，目前不能声称已经具备。

一个部署只服务一个 Slack 工作区：在频道策略允许的前提下，频道／群组消息与私聊一样会带来可信的逐消息发送者（`requesterSenderId`），因此频道消息并不比私聊更弱；但 v2 工具上下文不携带 Slack 团队／工作区 ID，团队必须由配置固定，把同一部署指向多个工作区会让发送者对应到错误的社群记录。

加权投票、参与门槛与法定人数、回避、预算竞争与排序、付款与结算、活动空间与提醒、成果与文章、官网发布、监督与周报、第二平台与链上迁移都保持延后；相关本地模块继续不注册。已延后的单元不应被描述成 v0.1 的一部分。

## v0.1 后端接入部署手册（已认证后端服务）

以下步骤把 v0.1 切片接到**一个已认证的后端服务**与一个隔离数据库，并按工作区（Slack、Discord 或两者）分别登记。

> **架构变更（2026-09-30）。** Agent 不再持有数据库凭据，也不再直接读写任何表；所有治理读、写、身份解析与身份绑定都经由后端服务的 `/api/agent/operations`、`/api/identity/resolve`、`/api/ingress/relay` 与 `/api/identity/link/*` 端点。**旧文「把 Supabase 地址与 service key 交给 Agent」的做法已被取代**，本节原先的可执行步骤（旧第 3、4、6 步）已按新架构改写；上文的迁移记录仍作为历史出处保留，但不构成现行操作指引。每一步都需要人执行并复核；Agent 不参与建表、播种、建应用或写入凭据。全部完成前不要指向生产数据，也不要把任何真实成员资料或凭据写入仓库。

1. **准备官方聊天插件与其连接模式。** 使用 `vendor/openclaw` 里随固定提交一起发布的官方 `slack` 插件，走 Socket Mode，不需要公网回调地址。在 Slack 侧创建应用、启用 Socket Mode、安装到已批准的工作区，并把 Bot 邀请进已批准的提案频道与 Board 频道。官方插件按 `mode: socket` 解析凭据：Socket Mode 需要 bot token 与 app-level token；签名密钥只在 HTTP 模式下才需要。**Agent 不读取任何 profile 邮箱**：D13 当时设想的 `users:read` / `users:read.email` 两个 scope 与 `slackBotTokenEnvVar` 都不再需要，不要再安装它们。若还要接入 Discord，为它单独登记一个工作区条目，而不是更换现有工作区。
2. **只放服务端环境变量引用。** Agent 侧只有四个变量名：后端基址、注册的调用方 ID、Agent 凭据，以及写入切片需要的提案确认签名密钥。这些凭据只通过服务端环境变量或运行时自带的密钥存储注入，配置里只写变量名。仓库中不得出现任何令牌、签名密钥或工作区 ID；`scripts/check.mjs` 也会拒绝在插件文件里出现形如 JWT 或 `sb_secret_` 的字面量。工作区 ID 不是密钥，但同样不进仓库：它写进部署侧配置。
3. **数据库迁移由后端侧的人执行。** 数据库属于**后端服务**，Agent 不再连接它、也不再持有任何 service key。姊妹仓库的前两个迁移已按文件名顺序应用到已链接的 `BeneficenceProtocol` 项目（project ref `ksgyfyysnojqrwfuyqwe`）：2026-09-27 以 `supabase migration list --linked` 只读核对，两个版本都显示为已应用。两个迁移各自在同一事务里定义 `dev_*` 与 `prod_*` 对象（第二个迁移显式循环 `array['dev_', 'prod_']`），因此两套 schema 都已建好；第三、第四个迁移也已应用。新增环境仍需按同一顺序复核应用：
   - `20260924094436_rein_slack_identity_and_fund_snapshots.sql`：身份关联表与只追加的可用资金快照表。
   - `20260924095705_rein_mvp_proposals_polls_ballots.sql`：提案、投票、选票三张表，投票类型表（含 `max_candidates` 与 `max_approvals_per_voter`）、修订记录表与 `effective_revision_id` 列，以及冻结候选名单、按当前董事校验选票、计票与重大修订批准的触发器与 RPC。（该迁移建立时用的是带阶段前缀的旧名，改名由下面的向前迁移完成。）
   - `20260927103000_rein_mvp_ballot_cast_at_db_clock.sql`：选票 `cast_at` 改由数据库时钟决定（写入前先 `NEW.cast_at := now()`，再做投票窗口检查），`dev_*` 与 `prod_*` 的触发器都改。该迁移已在姊妹仓库提交并**已应用到已链接项目**（2026-09-28 只读核对：版本已列出，两个时钟函数均在）。
   - `20260927110000_rein_governance_names.sql`：把五张物理表与两个 RPC 改名为稳定名称 `<env>_rein_vote_types`、`<env>_rein_proposals`、`<env>_rein_polls`、`<env>_rein_ballots`、`<env>_rein_proposal_revisions` 与 `<env>_rein_finalize_poll`、`<env>_rein_approve_revision`。**该迁移已在 PR #13 提交并已应用到已链接项目**（2026-09-28 只读核对：版本已列出，十张新物理表均在）；它排在 `20260927103000` 之后，应用顺序正确。它当时建立的旧名兼容视图与 RPC 包装已由后续已应用迁移 `20260929045543_remove_stage_compatibility_objects.sql` 删除；但 Agent 代码是否在真实环境跑通新名称，仍无端到端证据。
   前两个都已在姊妹仓库的 PR #13 分支（PR #13，当前 head `78281fa`，原提交 `4bd5ce8`）提交并应用到上述已链接项目，且同时覆盖 `dev_*` 与 `prod_*` 两套对象。**已应用且已演练，但未投产**：合成演练的工具确实对已链接项目的 `dev_*` 表集做过读写（行为合成 fixture），`prod_*` 业务行始终为 0；**仍未核对与仍未验证的是 `prod_*` 业务数据、真实成员／资金数据与生产端到端**。向 `prod_*` 写入真实数据要另做一次独立决定。第三个迁移与第四个（改名）迁移均已**应用**：时钟规则与稳定名称在已链接 schema 中都已生效，改名迁移的过渡兼容视图与包装已由第五个已应用迁移 `20260929045543_remove_stage_compatibility_objects.sql` 删除。但**已应用不等于已实机验证**，不得据此声称工具已端到端跑通。迁移不含具体的名额／批准额度数值：`<env>_rein_vote_types` 的行由人播种，结果由 RPC 在截止时按已存选票计算，不含政策默认值。
4. **播种也由后端侧的人做。** 规范化联系人、Contributor 的 `active` 状态、董事的 `person_type`、第一条可用资金快照，以及每个提案类型在 `<env>_rein_vote_types` 中的 `max_candidates` 与 `max_approvals_per_voter` 都由人通过后端已复核的管理路径写入；**官方身份来源是后端持有的规范化已验证绑定**（一张联系人可以有多个绑定），不再使用邮箱到联系人表的匹配。Agent 不创建这些记录，也不提供注册工具，更不读取任何邮箱。具体名额与批准额度属运维配置，须组织批准后再写入；不要往真实环境灌入虚构人员。改名迁移已应用，播种时请写到当前名 `<env>_rein_vote_types`；旧名兼容视图已被删除，播种只能写稳定名称。
5. **登记已批准的工作区与频道 ID。** `foundationDb.workspaces` 是一个列表，每个条目写 `platform`（如 `slack`、`discord`）、该平台的 `workspaceId` 与它的 `nativeChannelIds`；`proposalChannelIds` 与 `boardChannelIds` 里的每个频道都必须出现在某个工作区条目里。工具按宿主可信上下文里的 `messageChannel` 与该频道 ID 选出**恰好一个**工作区，因此一个部署可以服务多个工作区，互不串号。`platform` 只是单平台部署的旧默认值，可省略；省略时以工作区列表为准。
6. **显式启用 `foundationDb` 配置块。** 在隔离网关的 `runtime/openclaw/openclaw.json` 中，为 `plugins.entries.rein-operations.config` 增加 `foundationDb` 对象，字段为 `enabled`（必须为 `true`）、可选 `platform`、`workspaces`（上述列表）、`proposalChannelIds`、`boardChannelIds`、可选的 `voteTypeAliases`，以及三个服务端环境变量名 `backendApiBaseUrlEnvVar`、`agentCallerIdEnvVar`、`agentCredentialEnvVar`；写入切片另外需要 `proposalConfirmationKeyEnvVar`。配置里只写变量名，绝不写任何值。**旧的数据库字段（`slackTeamId`、`environment`、`supabaseUrlEnvVar`、`supabaseServiceKeyEnvVar`、`identityEmailMatch`、`slackBotTokenEnvVar`）会被明确拒绝，不再作为回退。** 未设置 `enabled: true` 时，19 个后端工具都不注册。
7. **先验后接。** 依次运行 `npm run toolchain:pnpm -- run check`、`npm run toolchain:pnpm -- test`、`npm run toolchain:pnpm -- run verify:plugin`，再用 `npm run toolchain:pnpm -- openclaw plugins doctor`，以及 `npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json` 确认 `rein_status` 与[当前安装指南](setup-zh.md#5-检查插件)列出的 19 个后端工具均已注册，且合成模拟器与旧提案工具已隐藏。用 `docs/agent-test-cases-zh.md` 的十个合成案例逐条演练，并保留发送者 ID、工具调用 ID 与后端记录。

**没有任何自动付款。** 通过投票只是决策记录：不预留、不付款、不改动资金快照。付款、报销与结算始终由有权限的人在 Agent 之外完成；预算竞争与分配金额不在 v0.1 内。

## 部署与本地隔离运行

后端连接配置可保存在本仓库被 Git 忽略的 `.env.local`（权限 `0600`）中：
`REIN_BACKEND_URL`、`REIN_AGENT_CALLER_ID`、`REIN_AGENT_CREDENTIAL` 和
`REIN_PROPOSAL_CONFIRMATION_KEY`。通过 `npm run toolchain:pnpm -- openclaw ...`
启动时，仅这四项会被加载，已有进程环境变量优先；其他账户凭据不会随该文件一起注入。
自定义变量名仍需由启动环境提供。已运行的 Gateway 需要重新启动才能读取新值。
`REIN_BACKEND_URL` 默认是 `https://rein-protocol.org`，无需启动本地 Website 服务。
需要隔离开发时才显式覆盖地址，并确保该后端使用 DEV 数据及对应的调用凭据。
`DATABASE_ENVIRONMENT` 以及数据库凭据留在后端部署配置或 Website 仓库的 `.env.local`，
不会自动从兄弟仓库传给 Agent。

1. 获取仓库和官方运行时：

   ```sh
   git clone --recurse-submodules https://github.com/rein-protocol-foundation/nori-agent.git
   cd nori-agent
   node --version # 环境需要 >=24.16.0 <25 或 >=26.1.0；命令本身交由本地工具链执行
   npm run toolchain:pnpm -- --version # 12.4.2
   npm run toolchain:pnpm -- exec node -v # 期望 v24.16.x
   ```

2. 安装与构建：

   ```sh
   npm run toolchain:pnpm -- install
   npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile
   npm run toolchain:pnpm -- --dir vendor/openclaw build
   npm run toolchain:pnpm -- run setup:local
   ```

`setup:local` 只创建 `runtime/openclaw/openclaw.json`，绑定本机回环地址并生成网关令牌。该目录被 Git 忽略；不要复制到共享仓库。

`npm run toolchain:pnpm -- <参数>` 会把 `--` 之后的所有参数转交给仓库内固定的本地工具链 pnpm（`package.json` 中的 `toolchain:pnpm`），因此无需 `export PATH`。`-- install`、`-- --dir vendor/openclaw install` 直接抵达 pnpm；`-- run <脚本>`、`-- test`、`-- openclaw <参数>` 则通过工具链自带的 Node 执行，即使系统里的 `node` 版本偏旧也可用。`--` 后不写参数时打印 pnpm 自身的帮助。若确实要把工具链放进 `PATH`，可在该终端执行一次 `export PATH="$PWD/.toolchain/node_modules/.bin:$PATH"`，之后 `pnpm run check`、`pnpm test`、`pnpm openclaw ...` 与上面的包装形式等价。未使用包装也不导出 `PATH` 时，请确认环境里的 pnpm 恰好是 `12.4.2` 且 Node 在受支持范围内。

3. 验证和启动：

   ```sh
   npm run toolchain:pnpm -- run check
   npm run toolchain:pnpm -- test
   npm run toolchain:pnpm -- run verify:plugin
   npm run toolchain:pnpm -- run verify:proposal-tools
   npm run toolchain:pnpm -- openclaw plugins list --verbose
   npm run toolchain:pnpm -- openclaw plugins inspect rein-operations --runtime --json
   npm run toolchain:pnpm -- openclaw gateway run
   ```

   另开终端执行 `npm run toolchain:pnpm -- openclaw gateway health --port 18791`（未鉴权就绪探测）与 `npm run toolchain:pnpm -- run smoke:gateway`。该调用只检查隔离网关的状态工具，不会创建活动、频道或文章。

4. 真正试点前，需在 `docs/decisions.md` 记录批准人、政策版本、生效时间及一个聊天平台。接入该平台的可信帐号 ID 与权威会员记录、资金来源和网站服务后，再实现并测试相应适配器。对外工具必须在写入前按真实请求者、资源和受众重新鉴权。合成测试通过不等于真实适配器可用。

   提供方须满足[聊天、身份、资金与网站接口契约](integration-contracts.md)，尤其要支持超时后的按幂等键查询和明确的权限范围。

   若仅试运行提案工具，在隔离网关的 `runtime/openclaw/openclaw.json` 中，对 `plugins.entries.rein-operations.config` 添加下列对象，并把值替换为**已批准**的唯一平台、原生频道 ID 和本地绝对路径：

   ```json
   {
     "proposalTools": {
       "enabled": true,
       "platform": "discord",
       "allowedNativeChannelIds": ["APPROVED_NATIVE_PROPOSAL_CHANNEL_ID"],
       "statePath": "/ABSOLUTE/PATH/TO/runtime/rein-proposals.json"
     }
   }
   ```

   `discord` 仅示意配置格式，并非组织已选择的平台；也可填 `slack`，P0 只能启用一个。未明确设置 `enabled: true` 时四个提案业务工具不注册。当前插件尚未连接权威名册提供方，因此即使启用这四个工具，正式确认与提交也会返回 `authoritative_registry_required`；草稿与修订可用于隔离试运行。测试中的合成名册授权回调不能用于生产。当前工具调用 ID 只保证同一次调用重试的幂等，无法代替可信入站消息 ID 的跨调用唯一性验收。

   若要试运行 v0.1 切片，请改用同一个配置文件里的 `foundationDb` 块（完整步骤见上面的部署手册）：`enabled`、`workspaces`（每个条目含 `platform`、`workspaceId`、`nativeChannelIds`）、`proposalChannelIds`、`boardChannelIds`、可选的 `voteTypeAliases`，以及环境变量名 `backendApiBaseUrlEnvVar`、`agentCallerIdEnvVar`、`agentCredentialEnvVar`（写入切片再加 `proposalConfirmationKeyEnvVar`）。**Agent 不再持有数据库凭据**：后端基址、调用方 ID、Agent 凭据与签名密钥都只从服务端环境变量读取，绝不写入配置，配置里也没有任何数据库地址或 service key 字段。启用 `foundationDb` 后注册 19 个后端工具（含只读采集、写入、结果反馈、身份绑定与社区查询），并隐藏合成模拟器与旧提案工具。数据库与两套 `dev_*` / `prod_*` schema 属于后端服务；旧文在**真实测试工作区 + 已链接的 `dev_*` 表集**上直接读写的是变更前的构建，`prod_*` 业务写入为 0，`prod_*` 数据未经端到端核对。因此新环境目前只能对着后端服务的 `dev_*` 或隔离环境演练，不要指向生产数据。

## 命名与改名迁移

预上线审查要求移除工具、表、配置与 skill 里带阶段前缀的命名。插件与配置现已改用 v0.1 稳定名称：14 个工具 `rein_member_status`、`rein_funds`、`rein_poll_candidates`、`rein_vote_type_resolve`、`rein_proposal_collect`、`rein_governance_proposal_submit`、`rein_poll_open`、`rein_poll_vote`、`rein_poll_result`、`rein_proposal_comment_suggest`、`rein_revision_approve`、`rein_revision_apply`、`rein_identity_bind_start`、`rein_identity_bind_complete`，以及 `foundationDb` 配置块。数据库侧因为两个基础迁移已应用到已链接项目，表名与 RPC 名不能就地修改：改名由一份**向前迁移** `20260927110000_rein_governance_names.sql` 完成，它排在已提交的 `20260927103000` 之后，重命名物理表与两个 RPC。该迁移**已在 PR #13 提交并已应用到已链接项目**（2026-09-28 只读核对）：新名称在已链接 schema 中已可用。它当时建立的旧名兼容视图与包装已由后续已应用迁移 `20260929045543_remove_stage_compatibility_objects.sql` 删除。**已应用不等于实机验证**，仍不得声称 Agent 已在真实环境跑通新名称。接口完整清单见[服务方接口契约的命名小节](integration-contracts.md#naming-and-the-rename-migration)。源文件与测试文件也已改用稳定的 v0.1 文件名。

调用方可见的名称随插件一起改：`foundationDb` 配置块格式错误时返回 `foundation_db_config_invalid`，被引用的服务端环境变量未设置或为空时返回 `foundation_db_env_value_missing`；`rein_status` 改为报告 `foundationDbReadToolsEnabled`、`foundationDbWriteToolsEnabled`、`foundationDbCollectToolsEnabled`、`foundationDbFeedbackToolsEnabled`。这些是代码接口，不涉及迁移；只读字段采集工具 `rein_proposal_collect` 与其余只读、写入、反馈工具一样，配置错误与缺少环境变量时使用同一组 `foundation_db_*` 拒绝码，错误消息前缀也已从阶段名改为 `foundationDb proposal collect tool`。改名迁移在 PR #13 中处理：该 PR 未合并，但 `20260927110000` **已应用到已链接项目**。它**已包含**独立成立所需的改名工作——在每个环境里除五张物理表与两个 RPC 外，还改十个辅助函数与触发器函数的名称，把函数体改写到新的物理表名、辅助函数名与 GUC 名，并一并改名相关的触发器、约束与索引，因此不再依赖它要替换的旧名。因为现已应用，它已进入已应用历史、不再可改；两个基础 `20260924*` 迁移保持已应用状态并保留其历史文件名不变。此后对命名层的任何修改都必须是一份新的向前迁移。它当时建立的旧名兼容视图与包装已由后续已应用迁移 `20260929045543_remove_stage_compatibility_objects.sql` 删除，旧名不再可用。

**兼容名已移除。** 改名迁移当时建立的旧名兼容视图与 RPC 包装只是过渡手段，不是长期契约，现已被后续已应用迁移 `20260929045543_remove_stage_compatibility_objects.sql` 删除，旧名不再解析。已链接 schema 只以稳定 `<env>_rein_*` 名称应答。

## 十个 Agent 演练案例

这些案例已改写为 **v0.1 Slack 场景**，使用**合成测试身份与虚构活动**。它们是当前可执行的证据形式：模块级自动测试加上**真实提供方上的合成演练**（真实测试 Slack 工作区 + 已链接的 `dev_*` 表集、行为合成数据）。**它们仍只算合成演练，不能当作上线验收**：未接入真实成员名册，未写入 `prod_*` 业务表，未做生产部署。

逐步消息、准备数据、预期数据库记录与真实提供方证据见 [十个 v0.1 验收案例](agent-test-cases-zh.md)。

本轮十案例的最终结论见 [v0.1 治理验收记录（2026-09-28）](governance-acceptance-2026-09-28.md)：案例 2–10 按合成开发证据通过，案例 1 由负责人决定跳过、**未通过**；当前 PR head 只有单元与加载器级验证，改名后尚未在真实 Slack 重跑，`prod_*` 业务表未被写入，生产迁移与发布门槛仍在。

| # | v0.1 Slack 场景 | 必须观察的结果 | 对应验收 |
| --- | --- | --- | --- |
| 1 | 未关联的新人问「怎么才能提案」 | 说明先由人完成身份关联（引导话术属验收缺口）；若尝试提交返回 `identity_link_required`；不写提案表；参数里自称的会员 ID 与角色一律无效 | AC01 |
| 2 | 已关联但 Contributor 非 `active` 的人想提交 165 美元工作坊提案 | 返回 `contributor_status_required`；不写提案表；Agent 不自批、不预留、不付款 | AC01、AC04 |
| 3 | 有效 Contributor 想法模糊，Agent 追问缺的字段 | 字段齐全前不提交、不写提案表；追问由 Agent 引导完成（无多轮草稿工具，属验收缺口） | AC02 |
| 4 | 有效 Contributor 补齐字段并提交提案 | 提案表新增一行且关联本人联系人；返回随机 UUID 标识，同一次调用重试指向同一行；`authorizesSpending = false` | AC02 |
| 5 | 现任董事在 Board 频道按投票类型开票 | 候选池由工具从库组装，调用方不能传候选或名额（`policy_argument_rejected`／`legacy_options_unsupported`）；投票表新增一行、候选与窗口冻结；无「列出可投票提案」工具（属验收缺口） | AC16 |
| 6 | 董事用自然语言投票，含弃权 | 三张票落库；空批准数组即弃权、不贡献赞成票；每人受该轮 `maxApprovalsPerVoter` 约束；自然语言到 `approvedProposalIds` 的映射靠 Agent 引导（属验收缺口） | AC07 |
| 7 | 截止前与截止后分别查询状态和结果 | 截止前返回 `provisional`、`official = false`，不给计数与赢家；截止后由库落库结果并给出 `outcome`／`winner`／`counts`；再次读取已关闭轮次回放 `repeated = true`，不重新计票；结果叙述与回帖属验收缺口 | AC06、AC07 |
| 8 | 已通过提案的反馈：普通标题/摘要 vs 重大预算/日程 | 普通修订由 Agent 直接生效（`acceptedBy = 'agent'`）；重大修订在记录到现任董事批准前以 `revision_not_approved` 拒绝，批准后以 `acceptedBy = 'director_approved'` 生效；不写任何财务记录 | AC07 |
| 9 | 董事查询已知 USD 快照与未知 EUR 币种 | 已知给出金额、币种与记录时间；未知返回 `unknown`／`no_snapshot`／`availableMinor = null`，不显示 0、不推断余额；读取方不占用、不预留、不付款；口语到 `currency` 的映射属验收缺口 | AC15 |
| 10 | 有人要求 Agent 依据已通过的投票直接付款并预留资金 | 明确拒绝：通过只是决策记录；不预留、不付款、不改动资金快照、不产生财务记录，并给出人工下一步 | AC04、AC08、AC15 |

结果公布后的反馈与修订并入上面第 8 条案例，边界与回归口径见 [十个 v0.1 演练案例](agent-test-cases-zh.md)，不再单独编号。

## 验证口径与未完成项

2026-09-24 本地验证基于官方 OpenClaw 固定提交 `4a11f89e840b2bb3eedcad2820ab25b8520905b6`、Node 24.16.0 和 pnpm 12.4.2。下表记录当时使用已配置本地工具链 `PATH` 的原始命令；上方无须导出 `PATH` 的封装命令是后续日常运行方式。封装形式本轮单独验证了 `check`，其余历史结果不冒充封装命令的实测结果：

| 命令 | 结果 |
| --- | --- |
| `pnpm run check` | 通过，检查结构、未批准配置、PRD 哈希、插件工具清单与 `foundationDb` 配置模式约束 |
| `pnpm test` | 通过，退出码 0：完整套件 618 项全部通过、失败 0。其中结果反馈 `proposal-feedback-tools` 34/34（普通修订由 Agent 接受生效、重大修订在记录到现任董事批准前以 `revision_not_approved` 拒绝）、`governance-rehearsal` 4/4、`vote-tally` 19/19、`foundation-db-writer` 196/196。已关闭轮次的回放缺陷修复已落地，`rein_poll_result` 对已关闭轮次返回该轮已落库的结果并标记 `repeated` |
| `pnpm run verify:plugin` | 通过，退出码 0。这是**加载器级**验证，不是真实平台验收：真实 OpenClaw loader 在默认未启用配置下导入三个只读工具；并在临时隔离配置下确认 14 个后端工具（只读、采集、读写、结果反馈与身份绑定）注册、合成模拟器与旧提案工具已隐藏，且密钥不出现在加载器输出中。它只证明工具注册与插件加载正确，不证明任何 Slack 工作区、数据库或提供方连通 |
| `pnpm run verify:proposal-tools` | 通过，退出码 0。同为**加载器级**验证：真实 OpenClaw loader 在临时隔离配置下注册四个 v2 提案工具；未连接真实平台 |
| `pnpm --dir plugins/rein-operations pack --dry-run` | 通过，退出码 0：打包清单包含 `proposal-feedback-tools.ts` 与 `proposal-revision-rules.ts`，即结果反馈模块确实随包发布，而非只存在于工作区 |
| `pnpm run smoke:gateway` | 通过，隔离网关经认证调用 `rein_status` |
| `git -C vendor/openclaw status --porcelain` | 无修改 |

`npm run toolchain:pnpm -- run smoke:gateway` 需要等待网关输出 `ready` 后执行；启动期间连接被拒绝不代表工具失败。上述结果未覆盖真实聊天、网站或资金接口。`tests/p0-rehearsal.test.mjs` 将两个活动流程跨模块串联；它以待处理外部意图而非假造的频道或文章收尾。


AC09、AC14 的外部频道/网站唯一性、AC16 的真实频道私密隔离，以及 AC20 的两条端到端真实流程，需要选定平台和提供方契约后验证；目前不能标为通过。支付、签名、提升会员身份和权重始终由有权限的人与独立流程处理。

投递器是可注入提供方的本地模块，不会自行连上真实平台。跨进程同时处理同一意图时，仍须由提供方按 Rein 幂等键保证唯一性；核心回执接口校验标识、键和文章链接，但无法自行验证提供方真实性。变更协调器能执行活动取消、暂停等少量有核心 API 的动作；报名页、提醒、负责人权限及财务复核仍被明确保留，无法声称已传播。跨核心事务被中断时，待执行标记维持“结果不明”供人工核对，因此 AC11 仍需完整执行器和真实提供方验收。

上表是一次 2026-09-24 的记录，不是持续保证；它记录的是当时本地与加载器级的工具注册状态，不是生产验收。此后 2026-09-27/28 的合成演练已在真实测试工作区与已链接的 `dev_*` 表集上留下读写证据（改名前的构建；`prod_*` 业务写入 0），但当前 PR head 改名后尚未在真实 Slack 重跑。

### 2026-09-27 复查：Supabase/PostgREST 边界集成测试（**已被取代**）

> **2026-09-30 起本小节只作历史记录，不构成现行指引。** 它记录的是**变更前**实现：Agent 自己拿 service key 经 PostgREST 访问数据库。该实现与其边界测试（`tests/foundation-db-gateway.test.mjs`、`tests/foundation-db-reader.test.mjs`、`tests/foundation-db-writer.test.mjs`）已随架构变更移除，数据库访问现在全部属于后端服务。不要据此把任何数据库凭据交给 Agent。

本次复查新增 `tests/foundation-db-gateway.test.mjs`：reader 与 writer 通过真实 HTTP 回环服务器（模拟 PostgREST 路由与 Supabase 网关的头部规则）使用全局 `fetch` 往返，覆盖现代 `sb_secret_` 密钥与旧版 `service_role` JWT，并断言 401 映射为 `auth_error`、5xx 仍是 `http_error`。这是传输层集成测试，**不是**真实 PostgREST 实例，也没有连接任何项目。使用本地工具链（Node 24.16.0、pnpm 12.4.2）重新运行完整门禁：

| 命令 | 结果 |
| --- | --- |
| `npm run toolchain:pnpm -- run check` | 通过，退出码 0 |
| `npm run toolchain:pnpm -- test` | 通过，退出码 0：完整套件 756 项全部通过、失败 0（含新增 `foundation-db-gateway` 7 项） |
| `npm run toolchain:pnpm -- run verify:plugin` | 通过，退出码 0，加载器级验证：默认三工具，以及隔离配置下的 14 个后端工具，模拟器与旧提案工具已隐藏 |
| `npm run toolchain:pnpm -- run verify:proposal-tools` | 通过，退出码 0，加载器级验证：四个 v2 提案工具 |

这些结果仍然只是本地与加载器级证据，不含真实聊天或生产验收。合成演练另在真实测试 Slack 工作区与已链接的 `dev_*` 表集上留下过提供方证据（见 [v0.1 治理验收记录（2026-09-28）](governance-acceptance-2026-09-28.md)），但那是改名前的构建、`prod_*` 业务写入为 0，且当前 PR head 改名后尚未在真实 Slack 重跑。

完整的逐项证据与尚缺验收见 [AC01–AC20 验收矩阵](p0-acceptance-matrix.md)。
