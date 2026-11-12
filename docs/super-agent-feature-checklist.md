# Nori Super Agent — Feature Checklist 与范围复审

更新：2026-11-09（America/Los_Angeles）。负责人：产品范围由项目负责人决定；本次记录维护者为 Codex。开发执行者待分配。

**状态：v0.6 产品方向已确认，本轮仅落实文档与 tickets。** [PRD v0.6](super-agent-nori-prd-en.md) 采用“原生配置 → 已有社区开源集成 → 必要薄适配”。内部 Slack M1 优先；共享 Gateway/Discord 为独立 M0，不整体阻塞 M1–M3。动态路由、ACP 客户端原生登录、Magpie 限额、Axiom 与 09:00 日报已确认；保留期限与 M3 首轮必要性仍待决定。没有新增产品验收通过。总入口：[#65](https://github.com/rein-protocol-foundation/nori-agent/issues/65)。SA-M* 与旧治理 roadmap 的 M0–M5 不同。

## 维护方式

- 每个 feature 保持稳定 SA-* ID；更新状态、owner、依赖、PR/commit、验证环境/日期、结果和下一步。
- 状态仅用：VERIFIED COMPLETE（所列范围已验证）、IMPLEMENTED BUT UNVERIFIED、PARTIALLY IMPLEMENTED、BLOCKED、NOT STARTED。范围决策另用“待决定／已确认”。
- `[x]` 只代表该行明确限定的交付范围完成；源码、CI、部署、产品验收分别记录，不能互相替代。
- 新证据追加日期与精确版本；保留历史失败和限制。未明确批准的删减不删除旧验收项、不关闭旧 Issue。
- 已确认方向同步 PRD、此清单、roadmap、GitHub Issues；实现负责人待分配。此轮无代码、依赖、运行配置或生产变更。

## 已核实的源码切片

| 完成 | ID | 交付范围／状态 | 证据与限制 |
| --- | --- | --- | --- |
| [x] | SA-S01 | 后端 Agent caller/tool 分派：VERIFIED COMPLETE（源码切片） | [#49](https://github.com/rein-protocol-foundation/nori-agent/pull/49)，9fa48abb；合成及真实 loader 验证；真实公共入口验收未完成 |
| [x] | SA-S02 | Magpie 偏好与显式回退：VERIFIED COMPLETE（源码切片） | [#50](https://github.com/rein-protocol-foundation/nori-agent/pull/50)，2073016d；原生 runtime + 合成 provider；生产 scoped policy 未验收 |
| [x] | SA-S03 | 请求准入／并发／每日请求预算：VERIFIED COMPLETE（源码切片） | [#52](https://github.com/rein-protocol-foundation/nori-agent/pull/52)，c8af4b5b；不等于 token/货币预算或整次运行 deadline |
| [x] | SA-S04 | 公共 workspace staging 与文件边界探针：VERIFIED COMPLETE（源码切片） | [#53](https://github.com/rein-protocol-foundation/nori-agent/pull/53)，f2e5f355；六种 native 场景；夹具禁用记忆，不是生产策略 |
| [x] | SA-S05 | 公共房间历史共享决策与缺口诊断：VERIFIED COMPLETE（文档／诊断） | [#51](https://github.com/rein-protocol-foundation/nori-agent/pull/51)，412f88c9；成功复现记忆限制，不是隔离成功 |
| [ ] | SA-S06 | Magpie SDK 凭据兼容性：PARTIALLY IMPLEMENTED（交付尚未合并） | [#61](https://github.com/rein-protocol-foundation/nori-agent/pull/61)，8e260a64；[CI 成功](https://github.com/rein-protocol-foundation/nori-agent/actions/runs/42479729006)，开放；保留旧 pin，不完成 #56 |
| [ ] | SA-S07 | 候选 SDK / Knowledge 探针：IMPLEMENTED BUT UNVERIFIED（当前未提交版本） | 候选 9fb5cdc3；旧记录有合成读写、restart/reset 结果；最新自动 flush 版本无已确认通过记录，reset 连续性须断言 |

此前恢复审计刷新 main 为 `7bbd3cd52acc9bf9c99807e2a57de61f933e3561`。#62 是开发代理配置，不推进 Super Agent 功能。此前恢复审计观察到生产 `412f88c9`、OpenClaw `4a11f89e`，四项服务运行且队列为空；该次刷新没有再次检查生产，不能把历史观测当作当前部署版本。

## M0：独立共享 Gateway / Discord Community（v0.6 验收）

所有条目尚未完整验收；实现 owner 待分配。下列状态保留已交付切片与未完成产品验收的区别。

| 完成 | ID | Feature／验收 | 状态 | 证据、依赖与下一步 |
| --- | --- | --- | --- | --- |
| [ ] | SA-M0-01 | 真实 Slack→main、Discord→community，共享 Gateway、Dashboard 标签、保留开发绑定 | BLOCKED | #57；现行双实例；独立里程碑已确认；继续细化公共迁移排期，不阻塞整个内部试点 |
| [ ] | SA-M0-02 | 真实 onboarding、学习资源/组织/活动问答检索、受限 caller、内部能力保持 | PARTIALLY IMPLEMENTED | #49 合成边界通过；目标拓扑真实 eligible/ineligible 请求者待验收 |
| [ ] | SA-M0-03 | 攻击输入不得取得 host/files/credentials/governance/delegation 权限 | PARTIALLY IMPLEMENTED | #49/#53；可写记忆、媒体、消息目的地与 handoff 仍待完整验证 |
| [ ] | SA-M0-04 | 双账号、跨平台关联用户、DM/公共房间/私有记忆/Agent/任务结果隔离 | BLOCKED | #55；旧 memory-core 缺口重现；候选接口不等于自动捕获/删除/迁移已验证 |
| [ ] | SA-M0-05 | Agent/platform/channel 偏好、真实路由、ordered/empty fallback、manual/child 不越界 | PARTIALLY IMPLEMENTED | #50/#52/#61；#56 辅助调用来源与预算传播、真实入口仍未验收 |
| [ ] | SA-M0-06 | Qwen-first、单问题升级并恢复、Magpie 限额、native runtime 上限、Slack 手动控制、Cron 固定模型 | PARTIALLY IMPLEMENTED | #52 请求预算通过；#54 先配置验证 native 上限；#56/#67 新行为待验收，不要求默认关闭 Dynamic Router |
| [ ] | SA-M0-07 | 等效原生集成、协调注册、受限 workspace、可信上下文贯穿 | PARTIALLY IMPLEMENTED | #49/#51/#53；#54–#56 缺口，不能仅删除旧 guard |
| [ ] | SA-M0-08 | 保留历史/任务所有权/回复目的地的 cutover 与 rollback，无重复 bot consumer | NOT STARTED | #57 有计划，无完成演练；依赖实际 #54–#56/#67/#68 行为验收 |
| [ ] | SA-M0-09 | 渠道 usage、Axiom Dashboard、09:00 Slack 日报与额度告警 | PARTIALLY IMPLEMENTED | #68；既有健康 telemetry 可复用，渠道用量/日报未实现 |

## M1–M3：现行 feature 清单

v0.6 保留原有用户行为，新增已有 ACP 复用与最小 change/stop 的明确映射。旧 Director ACP 有实现证据，但新授权与 Super Agent 场景尚未验收。

| 完成 | ID | 最小可观察验收行为 | 状态／Issue |
| --- | --- | --- | --- |
| [ ] | SA-M1-01 | Slack 清晰请求得到任务 ID、目标/标准并关联真实 native child | NOT STARTED / #60 |
| [ ] | SA-M1-02 | child 运行时可继续无关聊天并查询有意义的任务状态 | NOT STARTED / #60 |
| [ ] | SA-M1-03 | 原授权会话收到来源支撑的筹资/合作研究 shortlist，逐条核对标准，未知项明确 | NOT STARTED / #60 |
| [ ] | SA-M1-04 | 无权限用户不能读结果或改范围；普通可信 Slack 操作无冗余角色门槛 | NOT STARTED / #60、#66 |
| [ ] | SA-M1-05 | 复用 ACP→Codex，原生 change/stop、真实状态与结果回传，背景执行身份兼容 | PARTIALLY IMPLEMENTED / #60、#66；既有 ACP 已有，新场景未验收 |
| [ ] | SA-M2-01 | child 缺少资格信息时主代理主动复核并补充，无需用户提醒 | NOT STARTED / #58 |
| [ ] | SA-M2-02 | 用户改方向时旧 scope 的迟到结果不能被当作完成 | NOT STARTED / #58 |
| [ ] | SA-M2-03 | 重启后通过真实 native 入口协调 goal/limits/cancellation/outcomes；不盲重试未知外部结果 | NOT STARTED / #58 |
| [ ] | SA-M2-04 | 取消后不再委派；原生取消未完成/失败如实报告，迟到结果不重开任务 | NOT STARTED / #58 |
| [ ] | SA-M2-05 | 次数/runtime/无进展上限跨重启与再次委派保持，输出部分结果与缺口 | NOT STARTED / #58 |
| [ ] | SA-M2-06 | native run 清理后，授权用户可按选定期限检索最小摘要/链接；期限（原 30 天）待定，显式删除优先 | NOT STARTED / #58 |
| [ ] | SA-M3-01 | 真实 Slack：准备→展示精确草稿/测试收件人→审批暂停→继续或取消→报告 | NOT STARTED / #59 |
| [ ] | SA-M3-02 | 决定绑定 approver/task/checkpoint/material；未授权、过期、重复、取消后批准不发送 | NOT STARTED / #59 |
| [ ] | SA-M3-03 | 仅向指定测试收件人发送获批版本并记录回执，区分 API 接受与已送达 | NOT STARTED / #59 |
| [ ] | SA-M3-04 | 审批暂停后重启仍关联同一 checkpoint；缺失或发送结果未知时阻塞而非盲重放 | NOT STARTED / #59 |
| [ ] | SA-M3-05 | 验证实际 Lobster 安装、可信执行入口、审批监听与 acknowledgment，不削弱公共隔离 | NOT STARTED / #59 |

依赖基线（v0.6）：M0 独立；M2 依赖 M1；M3 保留 M1/M2 依赖且首轮必要性待定。内部试点验证自己的 owner/audience、私有存储、回复、执行与 Provider 边界；仅记录实际触及的 M0 依赖。本轮不执行功能开发。

## 实现方式与任务映射

每项优先原生配置，再复用既有实现或社区开源集成；只有证实缺口才采用必要薄适配。下表覆盖全部 feature ID，包含证据、缺口和下一步；负责人均待分配。

| Feature IDs | 方式 | 已有证据／待补缺口／下一步 |
| --- | --- | --- |
| SA-M0-01/02/03/07 | 原生配置 + 已有实现复用 + 必要薄适配 | #49/#53 caller/workspace 切片；#57 实际双平台和完整业务场景待验收；配齐检索、文件读取、原生交互工具，不能靠大量拒绝过关 |
| SA-M0-04 | 原生配置 + 必要薄适配 | #51 旧限制已重现，候选 seam 未完整验证；#55 验证 capture/recall/compaction/deletion/cache/reset，不预设新记忆引擎或 provider 切换 |
| SA-M0-05/06 | 已有实现复用 + 原生配置 + 必要薄适配 | #50/#52 基础已交付；#54/#56/#67 先验证 native 限制与 Magpie，不重建额度账本或执行循环 |
| SA-M0-08 | 原生配置 + 已有实现复用 | #57 保留历史/任务归属的迁移和回滚尚无完成证据 |
| SA-M0-09 | 已有实现复用 + 原生配置 + 必要薄适配 | #68 既有 Axiom 健康数据不是渠道用量；补归属与日报 |
| SA-M1-01/02/03/04/05 | 原生配置 + 已有实现复用 + 社区集成 + 必要薄适配 | #60/#66 native child/ACP 和身份路径；Codex 已有，Claude Code/OpenCode 逐项验证，不全作为首交付门槛 |
| SA-M2-01/02/03/04/05/06 | 已有实现复用 + 社区集成 + 必要薄适配 | #58 native lifecycle/持久记录/恢复入口；只补目标、标准、关联，不建调度器或独立历史平台 |
| SA-M3-01/02/03/04/05 | 社区集成 + 已有实现复用 + 必要薄适配 | #59 Lobster/邮件/审批/回执；运行兼容性待验收，不建通用工作流平台 |

## 路由、成本与观测切片

| 完成 | ID | 功能与验收 | 状态／方式／证据与下一步 |
| --- | --- | --- | --- |
| [ ] | SA-ROUTE-01 | Community 默认 Bailian Qwen instant/关闭推理；困难问题默认至多一次升级，结束/失败/取消后恢复；高级额度耗尽保留 Qwen，全部不可用给公共资料入口 | NOT STARTED；已有实现复用 + 必要薄适配；#67 验证原生切换/委派、并发与模型参数，去掉自动默认强制 medium/high |
| [ ] | SA-ROUTE-02 | Slack 默认 Dynamic Router；原生入口手动关闭/指定 Provider/model 后持续生效；Cron 使用所属 Agent 默认或 job override | NOT STARTED（新行为验收）；原生配置 + 必要薄适配；#67/#66；不新增选模 UI |
| [ ] | SA-COST-01 | Magpie 每日额度明确实际 Provider/account/Key 层级、窗口与配置；独立 Key 不冒充共享总预算 | PARTIALLY IMPLEMENTED（已有机制）；原生配置 + 已有实现复用；#67；不虚构额度，不删除 #52 既有准入代码 |
| [ ] | SA-OBS-01 | Axiom 按平台/native channel/Agent/Provider/model/trigger 归属；缓存/延迟/错误/缺失可见；同次 inference 不重复统计，ACP 原生用量单列或未知 | PARTIALLY IMPLEMENTED（健康数据已有）；已有实现复用 + 必要薄适配；#68；不采集正文或凭据，核实 query 权限 |
| [ ] | SA-OBS-02 | native Cron 洛杉矶时间 09:00 向 #nori-alerts 报告前一日用量；80% 配置额度预警、原生耗尽判定、告警去重 | PARTIALLY IMPLEMENTED；[每日小票](daily-agent-receipt.md) PR #72 已部署、files:write 已生效、09:00 原生任务已启用，手动触发及真实 PNG 回读成功；首次时钟触发/额度告警待验收，#68/#66 |

证据入口：现有 [ACP 实现与生产差异](director-acp.md)、[Magpie 固定版本](../plugins/rein-router/magpie.lock.json)（95e7c6bcc076；原生 access/limit.go 已有 Key token/估算费用窗口限制）、[Axiom 接入记录](observability-status-zh.md)。后者证明健康 Dashboard/告警通知器已接通，同时注明当前 ingestion Token 无查询权限；不证明渠道用量或 Nori 日报已完成。Router 的旧 automatic default 限制见 `plugins/rein-router/catalog-sync.mjs` 与 `plugins/rein-router/runtime.mjs`，具体兼容调整归 #67。

## 决策清单

| 决定 | ID | 当前决策／owner：项目负责人 |
| --- | --- | --- |
| [x] | SA-D01 | 内部 Slack M1 优先 |
| [x] | SA-D02 | 共享 Gateway/Community 为独立 M0，不整体阻塞内部任务 |
| [ ] | SA-D02a | 实际 native storage/authority/reply seam 的设计与验证待完成，不是产品方向未定 |
| [x] | SA-D03 | 原生优先；Magpie 管理推理；Community Qwen-first 按问题升级；Slack 默认动态且可手动控制；不再默认禁用 Jev |
| [x] | SA-D04 | M1 复用研究子代理与 ACP 编程，包含查询/change/stop；Codex 先复用，其他客户端逐项验证 |
| [ ] | SA-D05 | M2 切片顺序与摘要保留期限（原 30 天）待确认；不得据此另建平台 |
| [ ] | SA-D06 | M3 是否首轮必要待确认；若发送，精确审批/去重/未知结果核对保留 |
| [x] | SA-D07 | v0.6 文档与 tickets 修订已授权；功能实现/生产不属于本次任务 |
| [x] | SA-D08 | 可信 Slack 普通操作无冗余角色门槛；系统 Cron 无需在线人类；保留业务专有权限 |
| [x] | SA-D09 | ACP 客户端保留原生登录/订阅；Nori 推理走 Magpie，二者用量分开 |
| [x] | SA-D10 | 日报 09:00 America/Los_Angeles → #nori-alerts；80% 配置额度预警与原生耗尽状态 |

## 恢复与下一步

- 源码 checkpoint：`tempest/m0-router-sdk-compat` / `8e260a640d66cb7d6d323180dfa85aac308a8534`，与本地 `tempest/m0-upstream-audience` 同一提交；#61 未合并。恢复前重新核对 main、mergeability 与 CI，不能把旧 CI 当作新 base 的验证。
- 原 SDK worktree `nori-m0-foundation/rein-agent` 保留 candidate gitlink 和三个未跟踪文件：`docs/m0-sdk-upgrade.md`、`scripts/probe-native-knowledge.mjs`、`tests/fixtures/native-knowledge-gateway.ts`。本次未移动或修改；最新 probe 不能直接声称通过。
- SDK notes 中凭据失败已由 #61 后续记录修复；但 memory、deadline、auxiliary/media 并未因此全部解决。
- 此前审计 M1 worktree 为 `412f88c9`，当时没有独有实现；目录存在不等于任务已开始。
- 下一步按 #60/#66 验证内部 native 权限/存储/回复接缝；#54/#55/#56 优先配置与复用，#67/#68 分别跟踪路由和用量。保留期限/M3 首轮必要性仍待决定；此轮停在文档与任务跟踪。
- 成本：Sol Low 维护文档/证据；Sol Medium 执行边界清晰的夹具/适配；Astra High 处理范围、权限契约与架构阻塞。先 targeted checks，避免为了重复确认已有证据运行完整套件或付费推理。

## 可信 Slack 与系统 Cron

- [ ] **SA-OPS-01**：**已实现／本地验证通过，无产品验收**（2026-11-10 America/Los_Angeles；owner Codex；实现 base `b36f21b3`，调查 base `ac8d766`，native `4a11f89`；#61/#69 已合并）。[当前证据](sa-ops-native-authority.md)。native 负责执行；普通可信 Slack/ACP 去角色门槛，业务权限不变；创建仍需可信 ingress、获准 Agent 和 native owner 权限。description 审计不是 credential。[#66](https://github.com/rein-protocol-foundation/nori-agent/issues/66) 独立跟踪，不完成 M0/M1。
- run11 真实 native 创建/审计/update/declare/启停/删除/重启、development subscription default/job override、announce、公共创建/spawn/send 拒绝，以及真实 child spawn/无 sender 执行/父会话结果通过。Provider、显式 native 资格与逐候选 fallback 边界保留，scoped 在凭据/网络前拒绝越界；内部原生协作保持可用，公共间接可达检查采用 native ID 规范化。
- 检查：31 定向、projection 7 案例及停用 entry；完整 Node 1309 tests／1307 pass／0 fail／2 既有 skip；scaffold、链接/diff、真实 loader 三模式和 membership-only ACP 通过。复用 pinned build（4m56s）。旧 BLOCKED/SDK grant-view 前提已由 native 责任归属取代；旧 fixture metadata 解析错误已修复。
- native enable 仍可能写入后返回 output-schema 错误，已按 store 验证且不重试。真实 Slack/生产、完整 memory、广义 child 续接和执行中取消/授权撤销竞争未验收。下一步最终审阅后父 agent 按已有授权 commit/push；不启动其他 Issue 或部署。

### SA-OPS-01 实际故障证据（2026-11-09 只读检查）

任务 `skill-collection-review-nori-development`（`8e838f9e-2215-46e7-8f19-ea44589a0ebb`）已启用，`agent_id=nori-development`。最近两条 receipt 均为 error，最近开始时间 2026-11-08T04:37:24.786000-08:00；错误明确由 rein-router 拒绝，要求当前私有 Slack 频道成员身份与关联的 Contributor/Director。不是 native Cron 缺少可解析 Agent 的错误，不能把数据库 `owner_agent_id=null` 单独当作原因。

生产 checkout 为 `dd09c81a1a1cac79c124cd2204c850ab595b97af`，部署/报告队列为空。已核对生产与本地 `plugins/rein-router/runtime.mjs`、`slack-development.mjs` 哈希一致：`developmentChannelFor` 要求实时 sender 和 `trigger === 'user'`；`beforeAgentRun` 对 development agent 缺少 developer 授权直接 block。该交互式授权路径不接纳系统 Cron，形成后台执行兼容性缺口。此证据不说明应跳过所有 provider 或业务权限。

历史状态（已由上方 2026-11-10 实现记录取代）：当时根因已定位、修复尚未实现，计划设计 native 可验证的系统 Cron 执行路径，保留明确 agent、任务能力与 provider 范围；同时按已确认的 Slack 信任原则去掉普通操作的冗余角色门槛。先检查真实创建/启用契约与 native provenance，不能只按可伪造标签放行。验收需包括该任务类型无在线用户执行、禁用/撤销、公私来源区分及普通 Slack 回归。本次没有重跑任务、发送通知、改配置或部署。
