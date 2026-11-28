# Diagnose an update / 诊断更新

Read the updater status and recent service log before deciding whether to retry. / 重试前先查更新器状态和近期服务日志。

### ▶ Run / 操作

```sh
sudo cat /var/lib/nori-updater/status.json
sudo journalctl -u nori-update.service -n 40 --no-pager
```

### 🔎 Check / 核对

For a deferred event, identify the missing prerequisite. For a failed build, fix the cause before retrying. If rollback is in progress, inspect the transaction and preserved private state. / 延迟事件先查前置条件；构建失败先修原因再重试；正在回滚时核对事务及保留的私有状态。

📋 [Full procedure and configuration / 完整操作与配置](../agent/runbooks/updater-recovery-zh.md) · [Human handbook / 阅读导航](README.md)
