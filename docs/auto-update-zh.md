# Nori 远程自动更新

GitHub Webhook 主动推送事件，服务器常驻 `nori-webhook.service` 接收。
只有指定仓库的 `pull_request` 事件满足 `action=closed`、`merged=true`、目标分支 `main`
才会触发部署。直接 push、未合并关闭的 PR 和其他分支都不触发。
没有定时查询 GitHub 的任务；旧的 `nori-update.timer` 应禁用。

服务器只安装依赖、构建、切换并检查启动健康状态。Scaffold、测试套件、插件加载测试均留在 PR/CI，
不会在部署服务器再次执行。应通过仓库的合并规则确保 CI 通过后才合并。

## 事件和部署流程

1. GitHub 向现有 HTTPS 域名的 `/hooks/github` 发送 JSON。Caddy 转给仅监听回环的 3450 端口。
   接收进程以独立的 `nori-webhook` 用户运行，校验原始请求体的 HMAC-SHA256 签名，
   再检查仓库、PR 合并状态和目标分支。最大请求体 2 MiB。
2. 合格事件以 GitHub Delivery UUID 命名，先 fsync 到 `pending/` 再返回 202。
   不保存完整 payload、PR 正文或发送者资料。重复投递通过 pending/received 去重。
3. `nori-update.path` 由文件系统事件唤醒更新服务；没有事件时不访问 GitHub。
   控制器以 root 管理服务和目录，构建命令以普通服务用户运行。
   队列串行处理；同一批事件合并为一次更新。构建期间若 main 前进，丢弃过时构建，立即处理最新 main。
   控制器始终使用管理员配置的仓库和分支，不执行 Webhook 中的命令或任意提交路径。
4. 检查工作树干净、服务正常运行、磁盘满足动态构建预算（至少 12 GiB），并在构建前验证当前实例的健康探针及认证配置。
   在独立候选目录克隆 main 的精确提交及锁定 OpenClaw 子模块，校验并复用相同 OpenClaw 提交和工具链的构建；首次或校验不匹配时安装依赖并编译。
   Magpie 锁文件不变时复制并校验现有二进制，变化时重新构建；准备锁定 agent-browser。
5. 构建成功后重新确认 main 版本、工作树和当前实例健康状态，确认私有状态复制量加运行余量仍有空间，再停止渠道网关、网页和 Router，确认端口释放，复制私有状态。
   将旧部署移动到备份，再将候选部署移动到原固定路径，依次重启服务。
   不使用 `current` 符号链接，因为现有私有存储拒绝符号链接路径。
6. 检查 systemd 服务、Router 同步，以及两个网关的只读 `rein_status`。
   每个健康探针显式指定 `gateways[].agentId`（默认 `main`），因此新增开发 Agent 不会造成会话归属歧义。
   默认 150 秒内未就绪，自动恢复旧代码及停服时的私有状态并重启。
7. 若配置 `reporting`，健康检查成功后将部署 UUID、时间及新旧 SHA 写入持久报告队列。
   独立的 `nori-report.service` 查询 GitHub 变更和关联 PR，先写 Foundation 后端，
   再发 Slack，并将消息时间戳回写同一条部署记录。失败或回滚不会生成成功报告。

**编译失败时旧版本一直在线，不发生切换；切换后的启动失败才需要恢复旧目录。**
失败提交阻止重复部署，直到有新提交或管理员显式重试。失败事件也有结果回执，避免反复编译失败版本。
已部署的版本收到新事件时不会重启。事务日志和进程锁支持中断恢复，主机重启时先恢复事务，再处理积压事件。

已持久化事件遇到网络或部署前置条件失败时，保留队列，由 systemd 每 60 秒重试该任务；
队列为空时没有这些重试，也没有 GitHub 轮询。
构建成功后的版本查询若暂时失败，同样保留事件重试，不会将该提交标记为失败或要求 `--retry`。
候选源码的 clone、精确版本 fetch 和子模块获取失败（包括超时）也记录为 `deferred`，
保留事件重试；源码可用后的实际编译失败仍按失败版本处理。远端权限或配置错误同样需修复后才会成功。
GitHub 在请求到达服务器前发生投递失败时[不会自动重投](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)；服务器恢复后，管理员应在仓库的 Webhook
Recent Deliveries 中重投失败事件。此方案不另加定时补偿轮询。
健康检查不调用模型或发送聊天消息，不能替代真实渠道、模型或浏览器 UI 验收。

运行时生成的 `workspace/state/`（包括 sessions）应加入 `preserve`，同时由 `.gitignore` 排除。
已有主机需更新 `/etc/nori-updater.json`；应用部署不会自动更新该配置。不得提交或删除其中的运行记录。

## 安装与迁移

先按 [setup](setup.md) 准备正常运行的实例。依赖 Linux/systemd、Python 3、Git、npm、Go、`runuser`。
应用根目录和 releases 必须位于同一文件系统，路径不能包含符号链接。
main 是获准以服务用户身份运行的受信任代码；构建环境不是不可信代码沙箱。

```sh
# 已安装旧版时先停止定时检查；若正在更新，等本次完成后再更换控制器。
sudo systemctl disable --now nori-update.timer
id -u nori-webhook >/dev/null 2>&1 || sudo useradd --system --home-dir /var/lib/nori-webhook --shell /usr/sbin/nologin nori-webhook
sudo install -d -m 755 /opt/nori-updater
sudo install -m 755 deploy/nori-update.py deploy/nori-webhook.py /opt/nori-updater/
sudo install -m 644 deploy/nori_storage.py /opt/nori-updater/
# 父目录和回执必须由 root 持有，接收进程只能写 pending 中的事件。
sudo install -d -o root -g nori-webhook -m 750 /var/lib/nori-webhook /var/lib/nori-webhook/received
sudo install -d -o root -g nori-webhook -m 770 /var/lib/nori-webhook/pending
# 首次安装复制示例；升级时合并 eventDirectory 等新字段，保留已有主机配置。
sudo install -m 600 deploy/nori-updater.example.json /etc/nori-updater.json
sudo install -o root -g nori-webhook -m 640 deploy/nori-webhook.example.json /etc/nori-webhook.json
sudoedit /etc/nori-updater.json /etc/nori-webhook.json
sudo install -m 644 deploy/nori-update.service deploy/nori-update.path deploy/nori-webhook.service /etc/systemd/system/
```

为 `/etc/nori-webhook.secret` 生成至少 32 字节的随机密钥，文件所有者 `root:nori-webhook`、权限 0640。
密钥及主机私有配置不得提交仓库。接收器和 GitHub Webhook 必须使用同一个密钥。
在 Caddy 中加入精确的 `/hooks/github` 路由；[完整示例](../deploy/nori-webhook.Caddyfile.example)
保留管理页面的身份头处理。先 `caddy validate`，再 reload Caddy。
无需新增公网端口，3450 只监听 `127.0.0.1`。Webhook 使用签名认证，不使用管理页面登录 Cookie。

```sh
sudo systemd-analyze verify /etc/systemd/system/nori-update.service /etc/systemd/system/nori-update.path /etc/systemd/system/nori-webhook.service
sudo systemctl daemon-reload
sudo systemctl enable --now nori-webhook.service nori-update.path nori-update.service
```

在 GitHub 仓库 Settings → Webhooks 新增订阅：

- Payload URL：`https://你的域名/hooks/github`，Content type：`application/json`。
- Secret：上述随机密钥，SSL verification 启用。
- 只订阅 `Pull requests`，Active 开启。初始 `ping` 应返回 200。

默认部署仍是四个服务：`nori-router`、`nori-web`、`nori-slack`、`nori-discord`。
修改部署路径、服务名、Router 会话路径、网关端口/配置以匹配主机。
`auxiliaryPorts` 列出停服时必须释放的 Magpie 和网页端口。
如修改 `eventDirectory`，同步调整接收器配置、`.path` 单元和接收器 `ReadWritePaths`。
网关探针遵循 `gateway.auth.mode`：password/token 模式只读取对应凭据；trusted-proxy 模式
使用更新器各 gateway 的 `trustedProxyHeaders`，不要求密码/token。header 名称与身份必须匹配
原生 `userHeader`、`requiredHeaders`、`allowUsers`；示例中的 user/hostname 要改成管理入口的实际配置。
必须配置 `x-forwarded-for`、`x-forwarded-host`、`x-forwarded-proto`，并允许回环代理来源。
`192.0.2.1` 是本机探针专用的文档示例客户端地址，不向该地址发起连接；上游拒绝回环 forwarded client IP。
探针始终连接 `127.0.0.1`，网关仍须明确配置回环 `trustedProxies`、`allowLoopback` 和对应身份的 scope。
不会修改网关信任规则，也不输出凭据。配置不兼容时在停服前延后部署。
控制器固定安装在 `/opt/nori-updater`，不会随应用版本自动替换；更新部署控制器需重新安装。
服务文件、Caddy、DNS 和密钥轮换也不随应用部署自动变更。

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

`status.json` 状态包括 `building`、`updated`、`up_to_date`、`superseded`、`deferred`、
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
