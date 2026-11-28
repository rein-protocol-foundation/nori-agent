# Follow a merged change / 追踪合并后的更新

A signed webhook queues a PR merged into main. The updater compares the deployed checkout with the target commit. / PR 合并到 main 后，已签名的 Webhook 将事件入队。更新器比较已部署版本与目标提交。

### ▶ Run / 操作

```sh
systemctl status nori-webhook.service nori-update.path
```

### 🔎 Check / 核对

Read the receipt. A documentation sync reports source_synced. For a runtime release, check the health result and runtime revision. / 查看回执。仅同步文档时状态为 source_synced；运行时发布还要核对健康检查和运行版本。

📋 [Full procedure and configuration / 完整操作与配置](../agent/runbooks/auto-update-zh.md) · [Human handbook / 阅读导航](README.md)
