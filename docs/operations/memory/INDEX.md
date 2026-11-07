# Nori OCI 运维记忆

[OCI 运维记忆文件](oci-upgrade-and-migration-2026-11-07.md) 保存本次服务器升级、备份、费用观测及到期前迁移计划。该文件已按用户明确要求公开提交 GitHub，并作为一个独立来源接入 OpenClaw 原生记忆检索。

在两个现有网关的配置中，将下列相对路径追加到 `memory.search.extraPaths`，保留原有配置。路径相对于 `agents.defaults.workspace`（本仓库的 `workspace/`），不是相对于配置文件：

```json
{
  "memory": {
    "search": {
      "extraPaths": [
        "../docs/operations/memory/oci-upgrade-and-migration-2026-11-07.md"
      ]
    }
  }
}
```

此配置将这一个 Markdown 文件交给原生 `memory_search` / `memory_get`，不索引整个仓库或其他运维目录。`INDEX.md` 本身只是导航文档；文件被识别的依据是原生配置，不是目录或文件名。它不会变成每轮全量注入的 bootstrap `MEMORY.md`。

Git 管理这个专用运维记忆文件；已发布的更新由原生记忆索引刷新。日常运行记忆、会话和凭据仍保存在原有位置，`runtime/`、`workspace/MEMORY.md`、`workspace/memory/` 的忽略和部署保留规则不变。后续同步只限获授权的运维记录，不导出其他运行记忆。

旧的 `runtime/operations/memory/` 副本保留作为历史恢复材料，不再作为本文件的权威检索入口。记忆中的历史事实需按需重新核验；迁移计划不授予执行权限。

[配置片段](../oci-memory.example.json) · [运维文档索引](../README.md)
