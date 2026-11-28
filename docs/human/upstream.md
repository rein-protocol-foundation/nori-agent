# Review an OpenClaw update / 审查 OpenClaw 更新

Record the current submodule revision. Use the repository update helper to select the candidate and review its SDK changes against the affected plugins. / 记录当前子模块提交，使用仓库的更新命令选择候选版本，并逐个核对受 SDK 变更影响的插件。

### ▶ Run / 操作

```sh
git -C vendor/openclaw rev-parse HEAD
git ls-tree HEAD vendor/openclaw
```

### 🔎 Check / 核对

Rebuild the pinned runtime, run plugin inspection and test gateway health before submitting the pin change. Keep the previous SHA for rollback. / 重新构建运行时，检查插件加载与网关健康后再提交指针变更；保留旧 SHA 以便回退。

📋 [Full procedure and configuration / 完整操作与配置](../agent/runbooks/upstream.md) · [Human handbook / 阅读导航](README.md)
