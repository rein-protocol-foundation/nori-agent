# OCI 运维与授权发布记录

本目录及下列三份 OCI 记录按用户于 2026-11-07 UTC 的明确要求提交到公开 GitHub 仓库，包括本次运维 Memory、内部费用和迁移计划。授权范围仅为本次指定记录，不构成导出其他运行 Memory、凭据、成员资料或财务记录的一般许可。`.gitignore` 对 `runtime/` 的规则保留。

## 查询能力

- [nori-oci-ops skill](../../workspace/skills/nori-oci-ops/SKILL.md)：通用只读查询方法；主机、实例、卷、备份、监控与费用脚本。使用 Instance Principal，不存储 API key。
- [OCI CLI 接入与权限验收](../oci-cli-readonly-access-2026-11-07.md)：安装、IAM 作用域、查询和实际 Nori 工具调用证据。

## 历史记录与 Memory

- [运维 Memory 索引](memory/INDEX.md)：此次运行记忆的发布快照，与共享 skill 分离。
- [最终升级结果、费用与迁移计划](../oci-server-upgrade-and-migration-2026-11-07.md)：已完成 6 OCPU / 48 GB、200 GB 升级及尚待执行的迁移安排。
- [前期预算与执行过程](../oci-trial-performance-budget-2026-11-06.md)：保留先前测量、预算假设及接续结果；最终状态以更新报告为准。

所有数字均为各文档所记时点的观测或估算；查询当前状态时重新取证。迁移日期是计划，既不代表已完成，也不创建自动任务。

## Skill 安装与验证记录

2026-11-07 UTC：源码位于 `workspace/skills/nori-oci-ops/`；当时主机的原生 managed skill 安装分别位于 `runtime/openclaw/skills/nori-oci-ops/` 和 `runtime/discord-catalog-prod/state/skills/nori-oci-ops/`。两个网关的 `skills info nori-oci-ops --agent main --json` 均返回 eligible/modelVisible=true。生产配置、渠道权限及上游源码没有为此改动。

已完成 skill 格式校验、脚本全部查询节的主机实测、费用分页/精确小数/币种分离/缺失金额/空结果检查，以及非法日期与非 OCI 主机元数据失败检查。隔离的原生 Nori agent 验收实际读取 skill、调用备份和单日费用查询、读取 Memory，并将迁移识别为待执行计划；共 6 次工具调用、0 次工具失败。认证服务健康探针通过。这不是实时 Slack/Discord 用户会话验收、备份恢复演练或 8 路并发负载测试。

原始测试状态与运行配置保留在服务器私有目录，本次不提交。仓库 Memory 快照不会自动写入或覆盖运行 Memory。
