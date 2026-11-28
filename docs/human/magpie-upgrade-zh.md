# Review a Magpie upgrade / 审查 Magpie 升级

Stop the service and back up the binary and private configuration. Review the candidate upstream commit and update the revision in the lock file. / 停服并备份程序和私有配置。审查候选上游提交后，更新锁文件中的版本。

### ▶ Run / 操作

```sh
npm run toolchain:pnpm -- run magpie:setup
npm run toolchain:pnpm -- run magpie:setup --check
```

### 🔎 Check / 核对

Before resuming traffic, run the subscription and router console checks listed in the runbook. Keep the previous pin and backup for rollback. / 恢复流量前运行详细手册中的订阅及路由控制台检查；保留原版本指针和备份以便回退。

📋 [Full procedure and configuration / 完整操作与配置](../agent/runbooks/magpie-upgrade-zh.md) · [Human handbook / 阅读导航](README.md)
