# Nori OCI 试用期性能预算 — 2026-11-06

用户目标：试用期内充分利用剩余 Credit，让 Nori 可并行运行多个子任务；没有新增资金时，试用期结束后维持免费运行。不得把临时 Credit 当作长期付费授权。

本文件是保留历史假设与执行过程的运维记录，已获用户明确授权提交到公开仓库；范围见[运维记录索引](operations/README.md)。

## 当前结果

- 已完成：启动卷 80 → 200 GB，Balanced 10 VPU，控制台标注 Always Free；Ubuntu 根文件系统在线扩展，可用约 162.79 GiB。
- 已完成：一次完整扩容前卷备份，状态 Available；Slack 主网关子任务并发与子任务数 1 → 8，原生配置校验与热加载均确认。
- 验证：分区表完整性检查通过，四个应用服务 active，带身份认证的 Router 与两个网关健康探针通过。没有做 8 路模型负载测试或卷备份恢复演练。
- 2026-11-07 03:50 UTC 接续完成：Compute 前端恢复；12 OCPU / 48 GB 被账户资源上限拒绝，**6 OCPU / 48 GB 扩容与重启成功**。主机 12 vCPU，四项服务及认证健康探针通过，部署 watcher 恢复，根文件系统剩余 162.95 GiB。最终配置、费用及迁移计划见 [更新报告](oci-server-upgrade-and-migration-2026-11-07.md)。
- 最新账单：已入账 $44.54，剩余估算 $255.46；Renewal date 为 2026-11-24 UTC，精确试用到期时间未明示。账户仍是 Free Trial。

后续章节保留调整前测量和预算推导，执行结果以本节和末尾执行记录为准。

## 已核实与尚待核实

- 生产主机：San Jose，VM.Standard.E5.Flex，4 OCPU / 8 vCPU，24 GB 内存，80 GiB 磁盘。2026-11-07 UTC 检查约 46.7 GiB 可用；并发部署构建时约 42 GiB。现有存储根因修复保持生效。
- 上次控制台读数：已用 $41.06 / $300，推算剩余 $258.94；这不是实时余额，计费也可能延迟。实际试用到期日、当前余额、账户类型、主区域、卷总量及配额尚待控制台恢复后核实。
- 2026-11-05 / 06 的 sysstat 十分钟采样：CPU 平均忙碌 1.11% / 0.45%，采样区间最大 21.17% / 16.41%；内存使用最高 7.41 / 6.04 GiB。不是瞬时峰值，也不是并发负载测试。
- Slack 主网关 subagents 配置：maxConcurrent=1、maxChildrenPerAgent=1、maxSpawnDepth=1、runTimeoutSeconds=900。Discord 使用原生默认值，未配置显式覆盖。
- 目前模型走 Magpie / 百炼。过去 24 小时相关服务日志未匹配 429 / rate-limit 字样；这不证明供应商支持 8 路持续请求，订阅限额尚未核实。OCI Credit 不能直接支付这些外部模型服务账单。

## 性能实施顺序

1. 在自动部署完成、维护锁空闲后，备份主网关私有配置，将 Slack 的 maxConcurrent 和 maxChildrenPerAgent 调整为 8。保留 maxSpawnDepth=1 和 runTimeoutSeconds=900；不扩大工具、身份或组织权限。先用生产 OpenClaw schema 验证，再原子写入，确认热加载与服务健康。配置生效不等于 8 路真实任务验收。
2. 控制台恢复后检查实例配额。首选原地 E5 6 OCPU / 48 GB；若实际配额允许并且剩余天数预算覆盖，可提升至 12 OCPU / 48 GB。规格变更需协调当前任务及重启窗口。
3. 将存储目标设为 200 GB。先检查主区域内全部 boot/block volumes 与性能档位；免费容量是账户合计额度。Balanced 标价 $0.0425/GB·月；Higher Performance（20 VPU）标价 $0.0595/GB·月。先检查持续 I/O 等待及当前档位，再决定是否增加性能。
4. 不为了花尽 Credit 添加闲置机器或 GPU。多个 OpenClaw sub-agent 默认运行在现有主机；增加第二台机器不会自动将子任务分布过去。仅在确有隔离构建/浏览器负载时建立 worker，并显式配置任务执行路径。

## 预算计算（美元，税费/外部模型服务不含）

Oracle 官方价格 API 于 2026-11-07 查询，数据更新时间 2026-11-02：B97384 E5 OCPU $0.03/小时，B97385 E5 内存 $0.002/GB·小时；B91961 容量 $0.0255/GB·月，B91962 性能 $0.0017/VPU·GB·月。

| 配置 | 每小时 | 每天 | 假设还剩 20 天 | 持续 30 天 |
|---|---:|---:|---:|---:|
| 现有 E5 4 OCPU / 24 GB | 0.168 | 4.032 | 80.64 | 120.96 |
| 首选 E5 6 OCPU / 48 GB | 0.276 | 6.624 | 132.48 | 198.72 |
| 配额允许时 E5 12 OCPU / 48 GB | 0.456 | 10.944 | 218.88 | 328.32 |

20 天仅为演算，不能据实例名称推定试用结束日期。以上均为总计算费用，不是相对当前规格的增量。200 GB Balanced 不享受免费额度时约 $8.50/月；20 VPU 约 $11.90/月。

按旧余额 $258.94，预留 $30 给延迟入账、备份和迁移，则可用于主机及卷的上限 $228.94。12/48 配置运行 20 天约 $218.88，加 200 GB Balanced 的 20 天保守估算约 $5.67，合计 $224.55，余量很薄；若剩余 21 天或有其他收费资源，应降至 6/48 或缩短冲刺时间。执行前必须重新计算：

`可用日预算 = (实时剩余 Credit − 延迟入账/迁移储备 − 其他资源预计支出) / 剩余天数`

Oracle 当前公开默认 E5 Pay As You Go / Trial 配额为 6 OCPU、72 GB（有作用域和账户差异），因此 12 OCPU 只是有条件目标，不能声称已可创建。

## 免费回退方案

官方当前文档给 Always Free A1 的额度为每月 1,500 OCPU·小时 / 9,000 GB·小时，约 2 OCPU / 12 GB；不能使用旧的 4 OCPU / 24 GB 假设。需核对本账户实际权益、主区域容量。

E5 不会自动变为免费 A1。需提前建立 ARM A1 目标机，重新构建平台相关产物，验证 Magpie、OpenClaw、浏览器、插件及原生依赖；迁移受保护的运行状态、会话和记忆后验证服务和真实任务，再安排切换。恢复或数据保留未确认前，不删除 E5 或其卷。试用到期前应让所有保留收费资源进入明确处理状态，200 GB 免费存储也必须按所有卷合计核算。

建议在到期前 7 天完成 A1 可用性与兼容性检查，前 3 天完成迁移演练。当前到期日未知，尚未创建日期自动化，也未设置自动删除或关机。预算提醒本身不是费用硬上限。未升级付费的标准试用到期后，收费资源可能被回收，并不会保证 Nori 持续运行。

## 参考

- https://www.oracle.com/cloud/price-list/
- https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?partNumber=B97384&currencyCode=USD
- https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?partNumber=B97385&currencyCode=USD
- https://docs.oracle.com/en-us/iaas/Content/General/service-limits/default.htm
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/faq/

## 本轮执行记录

2026-11-07 02:49 UTC：等待并发部署 `af01fba31b8940e932de611bde86d02ada01389d` 完成并释放维护锁后，已将 Slack 主网关 maxConcurrent / maxChildrenPerAgent 从 1 提高至 8，其他 subagent 设置保持原值。用生产 OpenClaw CLI 对候选配置执行 config validate --json，结果 valid=true；随后检查原文件未被并发修改，原子替换。旧配置保存在服务器 root-only 路径 `/var/lib/nori-updater/config-backups/slack-before-concurrency-20261107T024902Z.json`。02:49:10 日志确认热加载生效，四个应用服务均 active。未执行 8 路真实模型负载测试。

用户已重新登录 OCI。控制台 Usage 显示截至当前查询已入账 $44.54，$300 Credit 推算剩余 $255.46，overage=$0。订阅列表 Renewal date 为 Nov 24, 2026 (UTC)，详情 End date 为空，不能把 Renewal date 未经核实写成精确关停时刻。账户横幅明确仍是 Free Trial。资源规格与卷扩容尚未提交，正在核实实际配额。


2026-11-07 02:53–03:00 UTC：控制台刷新后存储模块恢复。根 compartment 的 block volumes 清单为空，boot volumes 清单只有原 80 GB 卷。创建完整启动卷备份 `nori-pre-resize-20261107`，状态 Available，备份大小 / 源卷大小为 33 / 80 GB，无自动删除期限。然后把原启动卷在线扩至 200 GB，保持 10 VPU/GB Balanced；控制台状态 Available、Always Free，标称 12,000 IOPS 和 96 MB/s（此前 4,800 / 38.4）。

服务器上确认启动卷别名对应 `/dev/sda`、根挂载为 `/dev/sda1` 后，在部署维护锁下保存原 GPT 分区表，重扫磁盘；设备容量确认 214,748,364,800 bytes。growpart 干运行确认只增长第一分区末尾，正式执行后验证其起始扇区、UUID 及其他所有分区不变，然后在线 resize2fs。根文件系统现约 193 GiB、已用 30 GiB、可用 162.79 GiB；四个服务均 active。sgdisk 验证 No problems found。分区表保存于服务器 root-only `/var/lib/nori-updater/storage-resize-20261107/partition-table-before.txt`，不能把恢复旧分区表当作已增长文件系统的直接缩容方法，卷备份才是该操作的恢复来源。未执行恢复演练。

计算规格仍为 E5 4 OCPU / 24 GB。Compute 模块持续报 `Failed to load script`，对应官方前端 `compute/1.1.1101/modules/index.js`；重新载入及新标签页仍失败，Cloud Shell 入口未打开终端。本机没有现成 OCI CLI / API 配置。CPU 和内存扩容未提交。账户仍处于未升级的 Free Trial，未进行 Pay As You Go 升级。

接续实施：恢复 Compute 控制台或现成授权 CLI 访问后，先读取实际 E5 配额，再按已授权 Credit 范围选择 6/48 或配额允许的 12/48；先检查活跃任务并协调重启，保留备份和回退能力。以 11 月 24 日 UTC 的 Renewal date 为保守规划边界，提前完成免费迁移准备，精确试用截止时刻仍需账户页面或官方通知明确确认。

最终验证：已调用安装中的受信任部署控制器的只读 `Host.health()`，Router 与两个网关的认证健康探针通过；该调用没有部署、重启或发送消息。


2026-11-07 03:50 UTC 最终结果：上述 Compute 前端阻塞已解除。12/48 请求被 Oracle 账户资源上限拒绝，6/48 成功并通过主机元数据、12 vCPU、四项应用服务与认证健康探针验收。队列为空，无未完成事务，部署 watcher 在重启后 active。此前未完成事项由此更新；续费与免费迁移规划请以 `oci-server-upgrade-and-migration-2026-11-07.md` 为准。
