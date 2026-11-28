# 更新器恢复与回执 / Updater recovery and receipts

📦 [事件流程与安装 / Event handling and installation](auto-update-zh.md)

## 私有状态与磁盘

`preserve` 显式保留 `runtime/`、`.env.local`、`.env`、`secrets/`、`SECRETs.md`
及 workspace 的 USER、MEMORY、memory、.openclaw。
`runtime/` 中的账号、渠道配置、登录会话、聊天记录和隔离工作区整体保留。
列表以外的私有文件须先加入配置；保留路径若变成仓库跟踪文件，拒绝切换。
仓库跟踪的 workspace 策略随 main 更新，工具链和依赖重新准备。

### 当前 main Agent 工作区的兼容处理

服务器主配置增加开发 Agent 后，未显式指定 workspace 的 `main` 会解析到
`workspace/main/`。本次将该目录已有的 `AGENTS.md`、`SOUL.md`、`IDENTITY.md`
三份公共 OpenClaw 模板纳入版本控制，保持现有行为；它们不是根目录中 Nori 定制
策略的副本。统一多 Agent 工作区和核心策略权限由后续功能处理。

`workspace/main/USER.md`、`MEMORY.md`、`memory/`、`.openclaw/`、`BOOTSTRAP.md`
和嵌套 `.git/` 属于运行状态，忽略并加入更新器 `preserve`，不上传 GitHub。
现有服务器需同步更新私有 `/etc/nori-updater.json` 的保留清单，示例配置不会自动覆盖它。
首次纳管前先私有备份整个目录，并核对三份公共文件与拟部署版本逐字一致。
旧 checkout 可在 `.git/info/exclude` 临时排除 `/workspace/main/` 以通过干净检查；
此排除只用于首次迁移。新 checkout 会正常跟踪三份模板，仍会拒绝其未提交修改。

`/home/ubuntu/nori-releases/previous-*` 保留旧部署和停服时状态。
`failed-*` 保留启动失败版本及其运行期间状态，不自动合并新旧记录。
如失败版本在健康检查期间收到消息，需要人工核对。
自动清理只处理更新器命名的 `previous-candidate-<12位提交号>-<8位随机值>` 目录。
默认保留最多 3 份完整回滚；在空间压力或回滚占用超过 16 GiB 时，可减少至至少 2 份。
最新成功记录指定的回滚优先保留。计量按 inode 去重，不能把多个硬链接目录的 `du` 数值简单相加。
删除旧代码前，先把 `preserve` 全量归档到 root 私有的 `state/private-archives/`，逐文件校验内容、权限及链接。
归档失败则保留原目录；归档不自动过期，需单独监测容量并制定备份保留周期。

构建前需要的空间为以下两者较大值：`minimumFreeGiB`（默认 12），以及当前非 Git 部署内容复制量、
私有状态复制量、`minimumRuntimeFreeGiB`（默认 3）和 `buildCacheGrowthGiB`（默认 2）之和。
构建后、停服前再次检查私有状态复制量加运行余量，不足时延后并保持当前服务运行。
新上游版本的构建峰值仍可能更高；这些是保护预算，不是任意未来版本绝不会耗尽磁盘的保证。
自动清理在构建预检及成功部署后为下一次构建预留空间；无法满足预算时延后，不突破最少回滚数。

OpenClaw 仅从官方仓库获取锁定 SHA 的 depth=1 内容，不再从生产副本继承全历史对象。
生产上游仓库不配置默认 remote，父仓库禁用递归 fetch，避免后台工具再次拉取全部分支/标签。
构建复用要求上游提交、锁文件、Node/pnpm、操作系统/架构/libc 和产物 SHA-256 均匹配。
包含工具链、workspace node_modules、dist/dist-runtime 和 CI 同样纳管的生成资源；独立复制，
不以可写硬链接连接运行版和候选版。每次仍安装当前 Nori 依赖、准备 Magpie/browser 并执行启动检查。
首次安装没有可信产物清单时完整构建；不要把未验证的旧产物直接标记为可信。

仅已登记且尚未复制私有状态的候选允许自动回收（失败、被新版本取代、构建中断）。
含私有状态、未登记、`failed-*`、`build-home`、未知名称和符号链接保留；挂载点不自动删除。
进程始终持有 `update.lock`；存在未完成事务时先恢复，不能清除事务日志绕过保护。

清理结果写入 `state/cleanup.json`，最近空间采样写入 `state/space.json`。
权限、归档或文件系统错误不回滚健康版本，可能暂时保留超过预算的快照。
控制器及 `nori_storage.py` 必须一同在锁内安装到 `/opt/nori-updater`，保留旧文件以便回退；
只合并应用 PR 不会替换独立控制器。升级配置时合并新增预算字段，不覆盖私有配置。

可在维护窗口运行 `sudo python3 /opt/nori-updater/nori-update.py --verify-build`：
构建并校验当前运行 SHA 的独立候选，记录 `state/build-verification.json` 后回收候选。
此模式不切换、不重启、不发送部署报告，仍消耗构建时间和临时空间，且不替代真实切换验证。

事件回执只保留 Delivery ID、处理时间、结果和提交号。

## 运维

```sh
systemctl status nori-webhook.service nori-update.path
sudo cat /var/lib/nori-updater/status.json
sudo journalctl -u nori-webhook.service -u nori-update.service -n 40 --no-pager
sudo ls /var/lib/nori-webhook/pending /var/lib/nori-webhook/received
# 构建日志仅 root 可读，不要公开完整内容。
sudo less /var/lib/nori-updater/logs/$(date -u +%Y%m%d).log

# 暂停部署并保留接收器；事件继续入队。运行中的构建可能被中断并恢复旧版本。
sudo systemctl stop nori-update.path nori-update.service
# 恢复积压事件处理。
sudo systemctl start nori-update.path nori-update.service
# 修复失败版本后显式重试。重复投递同一 Delivery 不会绕过去重或失败保护。
sudo python3 /opt/nori-updater/nori-update.py --config /etc/nori-updater.json --retry
```

`status.json` 状态包括 `source_synced`、`building`、`updated`、`up_to_date`、`superseded`、`deferred`、
`failed`、`rolling_back`、`rolled_back`、`blocked`。网络请求失败见 systemd 日志，状态文件可能保留上次状态。
手工修复过的活动部署/备份与事务不一致时，停止自动恢复，保留事务日志供人工处理。

开发机和 CI 的合成测试覆盖签名、事件筛选、重复投递、持久队列、合并并发、空闲零查询、
网络失败保留事件、构建失败不停服、状态保留、启动回滚和中断恢复。
本功能来自操作者提出的事件驱动部署需求，不增加业务工具或渠道权限。

## 部署记录与 Slack 通知

Foundation 后端需部署 `POST /api/agent/deployments` 和 `rein_deployments` 迁移。
后端按环境使用 `dev_rein_deployments` / `prod_rein_deployments`，表启用 RLS，
不向匿名用户和普通登录用户授权。单独注册只有 `deployment.write` 的服务调用者，
allowlist 限制为部署频道所属 Slack workspace 和 channel；不要复用 Agent 的治理凭据。

在 `/etc/nori-updater.json` 增加（所有 ID 均替换为实际值）：

```json
{
  "reporting": {
    "backendUrl": "https://rein-protocol.org",
    "callerId": "nori-deployment-oci",
    "workspaceId": "T_REPLACE",
    "channelId": "C_REPLACE",
    "credentialsFile": "/etc/nori-report.credentials.json"
  }
}
```

`credentialsFile` 必须由 root 持有、权限 0600，JSON 包含 `backendCredential`、
`slackBotToken`，可选 `githubToken` 用于私有仓库或提高 API 配额。
机器人需要 `chat:write` 并加入部署频道。服务器仅持有后端服务凭据，不持有 Supabase 密钥。
凭据不得提交或写入日志；轮换 Slack token 时同步更新此文件。

```sh
sudo install -d -m 700 /var/lib/nori-updater/reports /var/lib/nori-updater/reported
sudo install -m 755 deploy/nori-report.py /opt/nori-updater/
sudo install -m 644 deploy/nori-report.service deploy/nori-report.path /etc/systemd/system/
# 同时安装本版本 nori-update.py；正在部署时先等待其完成。
sudo systemctl daemon-reload
sudo systemctl enable --now nori-report.path nori-report.service
```

后端记录部署时间、主机、提交范围、PR 编号/标题/正文摘要、提交摘要和 Slack 回执。
GitHub PR 关联来自 API，支持 squash、merge 和 rebase；直接提交也保留在 commits 中。
一次部署最多支持 1,000 个提交和 100 个 PR，超限保留队列并要求人工处理。
Slack 展示 PR 标题与链接及完整 diff 链接；正文摘要保存于后端。

上报使用独立锁，不会重新构建、重启或回滚应用。网络错误保留队列，systemd 每 60 秒重试；
GitHub 查询进度也持久化，避免 API 限流后从头重查。空队列不会查询 GitHub。
重复后端请求按部署 UUID 去重，冲突内容返回 409；成功后将本地文件移至 `reported/`。
Slack 回执已落盘时重试不会重复发送；使用稳定的 `client_msg_id` 降低发送结果不明时的重复风险，
但 Slack 接收后、响应/本地落盘前发生中断仍可能产生重复消息，不能保证跨系统严格 exactly-once。
通过部署 UUID 可识别这种重复；数据库部署记录仍唯一。

```sh
sudo journalctl -u nori-report.service -n 30 --no-pager
sudo ls /var/lib/nori-updater/reports /var/lib/nori-updater/reported
sudo systemctl restart nori-report.service
```

## Slack 主机开发权限 / Trusted Slack host access

[权限与部署记录](trusted-slack-host-access-zh.md)说明 Slack 开发权限、自建防误删插件与 Discord 边界。插件运行副本保存在 runtime 中，合并源码不会自动刷新，必须显式更新。
