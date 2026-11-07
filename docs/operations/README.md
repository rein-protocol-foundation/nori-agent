# OCI 运维与授权发布记录

本目录及下列三份 OCI 记录按用户于 2026-11-07 UTC 的明确要求提交到公开 GitHub 仓库，包括本次运维 Memory、内部费用和迁移计划。授权范围仅为本次指定记录，不构成导出其他运行 Memory、凭据、成员资料或财务记录的一般许可。`.gitignore` 对 `runtime/` 的规则保留。

## 查询能力

- [nori-oci-ops skill](../../workspace/skills/nori-oci-ops/SKILL.md)：通用只读查询方法；主机、实例、卷、备份、监控与费用脚本。使用 Instance Principal，不存储 API key。
- [OCI CLI 接入与权限验收](../oci-cli-readonly-access-2026-11-07.md)：安装、IAM 作用域、查询和实际 Nori 工具调用证据。

## 历史记录与 Memory

- [运维 Memory 索引](memory/INDEX.md)：一个 Git 管理的 OCI 记忆文件，通过原生 `memory.search.extraPaths` 接入检索，与共享 skill 和私有运行记忆分离。
- [最终升级结果、费用与迁移计划](../oci-server-upgrade-and-migration-2026-11-07.md)：已完成 6 OCPU / 48 GB、200 GB 升级及尚待执行的迁移安排。
- [前期预算与执行过程](../oci-trial-performance-budget-2026-11-06.md)：保留先前测量、预算假设及接续结果；最终状态以更新报告为准。

所有数字均为各文档所记时点的观测或估算；查询当前状态时重新取证。迁移日期是计划，既不代表已完成，也不创建自动任务。

## Skill 安装与验证记录

2026-11-07 UTC：源码位于 `workspace/skills/nori-oci-ops/`；当时主机的原生 managed skill 安装分别位于 `runtime/openclaw/skills/nori-oci-ops/` 和 `runtime/discord-catalog-prod/state/skills/nori-oci-ops/`。两个网关的 `skills info nori-oci-ops --agent main --json` 均返回 eligible/modelVisible=true。生产配置、渠道权限及上游源码没有为此改动。

已完成 skill 格式校验、脚本全部查询节的主机实测、费用分页/精确小数/币种分离/缺失金额/空结果检查，以及非法日期与非 OCI 主机元数据失败检查。隔离的原生 Nori agent 验收实际读取 skill、调用备份和单日费用查询、读取 Memory，并将迁移识别为待执行计划；共 6 次工具调用、0 次工具失败。认证服务健康探针通过。这不是实时 Slack/Discord 用户会话验收、备份恢复演练或 8 路并发负载测试。

上述早期验收使用直接文件读取，证明文件可读，未证明原生记忆检索。原始测试状态与运行配置保留在服务器私有目录，不提交。

## 原生记忆接入

使用[配置片段](oci-memory.example.json)中的 `memory.search.extraPaths` 注册唯一的 OCI 运维记忆文件。该相对路径以实际 `workspace/` 为基准。保留其他记忆来源、搜索提供商、渠道和权限设置；不添加插件，不复制 workspace，不修改部署器。

原生格式是 Markdown，`extraPaths` 是 OpenClaw 支持的索引入口。日常运行记忆仍由更新器保留；Git 只管理这一获授权的运维记忆来源。更新通过 Git 发布进入现有 checkout 后，由原生文件监听/检索同步刷新索引。不能仅以 `read` 文件成功作为原生接入验收，应确认 `memory status` 的 extraPaths 与扫描结果，并验证 `memory_search` / `memory_get` 能返回该文件的升级、备份和迁移记录。

不将 `workspace/memory/` 改为 Git 跟踪：现有部署器会保护该目录，并拒绝 `preserved_path_became_tracked`。这个单文件配置与现有数据保留机制兼容。

### 2026-11-07 接入验收

07:44 UTC，在部署维护锁下为两个网关分别追加上述单文件 `extraPaths`。候选配置均通过固定版本 OpenClaw 2026.9.5 的原生校验；只改变这一字段，保留其他记忆设置。原配置保存于服务器 root-only `/var/lib/nori-updater/config-backups/oci-memory-20261107T074402Z/`，回退应仅恢复该字段并保留后续其他配置变化。

原生 `memory index --agent main` 完成后，两边的 `memory search` 均返回该 OCI 文件的备份、升级规格与迁移日期，且不再报告索引范围陈旧。隔离的 Nori 验收实际调用 `memory_search` 和 `memory_get`，回答 6 OCPU / 48 GB、200 GiB、80/33 GiB 备份及 11 月 17 日下一计划节点，确认迁移尚未完成；未使用 `read`、`exec` 或云查询。验收中有两次工具参数错误后重试成功，不能表述为零错误调用。当前提供商未能产生向量嵌入，实际验证的是原生关键词检索与定向读取，不是语义向量召回；没有为此禁用或替换搜索提供商。

该版本修改 `memory.search` 会请求网关重启。Discord 排空后正常退出；现有 systemd `Restart=on-failure` 不会拉起正常退出的进程，因此由本次维护恢复启动。Slack 等待 300 秒后仍有 2 项操作、1 项回复和 1 项嵌入运行，原生重载按超时策略强制重启，随后同样恢复启动；这项在途运行可能受中断，未声称其业务任务完成或自动重放。后续此类改动应先安排空闲窗口，再应用配置并检查 supervisor 启动结果。没有修改 systemd 重启策略、上游代码或渠道权限。

恢复后四项应用服务均 active，Router 与两个网关的认证健康探针通过，生产 checkout 保持干净。此验收没有发送真实 Slack/Discord 消息。
