# Nori 远程自动更新

已授权持续部署的 Linux/systemd 主机可以使用 `deploy/nori-update.py`。
定时器每两分钟检查 GitHub `main`，附加 0–15 秒随机延迟；发现新提交后构建并部署。
因此合并 PR 和直接推送到 main 都会触发更新；未合并的 PR 不会部署。
实际生效时间还包括依赖安装、OpenClaw 编译、测试和重启时间。

## 更新流程

1. 检查当前工作树无修改、四个服务运行中、至少有 12 GiB 可用空间。
2. 在独立候选目录获取 main 的精确提交及仓库锁定的 OpenClaw 子模块。
   用普通服务用户安装 Node/pnpm、安装锁定依赖并编译 OpenClaw。
   Magpie 锁文件未变时复制并校验现有二进制；锁文件改变时重新构建。
3. 准备锁定的 agent-browser，执行 scaffold 检查、全部 Node 测试和真实插件加载检查。
   此时线上服务继续运行，候选配置不包含线上凭据。
4. 再次确认 main 未前进、线上工作树未改动、服务仍运行。
   停止渠道网关、网页和 Router，确认服务端口已释放，然后复制私有状态。
5. 把旧部署移到备份目录，候选目录移到原来的固定路径，再依次启动服务。
   不使用 `current` 符号链接，因为现有私有存储拒绝符号链接路径。
6. 检查 systemd 服务、Router 同步状态，以及两个网关的只读 `rein_status`。
   默认 150 秒内未就绪则恢复旧代码和停服时的私有状态并重新启动。

构建失败不会停止线上服务；启动失败的提交会被阻止重复部署，直到 main 有新提交或管理员显式重试。
没有新提交时只检查版本，不重启。服务被管理员暂停或工作树有修改时延后更新。
事务日志和进程锁支持切换中断后的恢复，下一次运行优先恢复未完成的事务。
主机重启后 systemd 定时器继续执行。健康检查不调用模型，不发送测试聊天消息；
它不能替代真实渠道消息、模型可用性和浏览器 UI 的人工验收。

## 安装

先按 [setup](setup.md) 建立已正常运行的实例，再安装更新器。
依赖 Linux、systemd、Python 3、Git、npm、Go、`runuser` 和常用 Unix 工具。
构建用户必须是普通用户；控制器以 root 管理服务、私有备份和目录切换。
这不是不可信代码沙箱：main 是获准在服务用户身份下运行的受信任代码。
根目录和 releases 目录必须处于同一文件系统，且路径不能包含符号链接。

```sh
sudo install -d -m 755 /opt/nori-updater
sudo install -m 755 deploy/nori-update.py /opt/nori-updater/nori-update.py
# 首次安装才复制配置；升级控制器时保留已有主机配置。
sudo install -m 600 deploy/nori-updater.example.json /etc/nori-updater.json
sudoedit /etc/nori-updater.json
sudo install -m 644 deploy/nori-update.service deploy/nori-update.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/nori-update.service /etc/systemd/system/nori-update.timer
sudo systemctl daemon-reload
sudo systemctl start nori-update.service
sudo systemctl enable --now nori-update.timer
```

示例配置对应四个现有服务：`nori-router`、`nori-web`、`nori-slack`、`nori-discord`。
修改主机路径、服务列表、Router 端口/内部会话文件及各网关的端口/配置路径，以匹配部署。
`auxiliaryPorts` 列出停服时也必须释放的 Magpie 和管理网页端口。
网关探针从本机私有配置读取 password/token，不将其输出到日志。
控制器固定安装在 `/opt/nori-updater`，不会随应用更新自行替换；变更控制器需重新执行安装步骤。
服务文件、Caddy 配置、DNS 和凭据轮换也不属于自动应用更新。

## 私有状态与磁盘

`preserve` 是显式保留列表：默认包括 `runtime/`、`.env.local`、`.env`、`secrets/`、
`SECRETs.md` 和 workspace 的 USER、MEMORY、memory、.openclaw。
`runtime/` 中的账号、渠道配置、登录会话、聊天记录和隔离工作区整体保留。
新增位于列表以外的本机私有文件时，必须先加入配置；如果保留路径变成仓库跟踪文件，切换会拒绝继续。
仓库跟踪的 workspace 策略随 main 更新，工具链和依赖重新准备。

`/home/ubuntu/nori-releases/previous-*` 保留停服时的完整旧部署。
`failed-*` 保留启动失败的新版本及其运行期间的状态，回滚不会把新旧状态自动合并。
如果失败版本在健康检查期间收到消息，需要人工核对这些记录。
候选目录、旧部署和失败部署目前不自动删除，避免丢失私有恢复材料。
管理员应定期检查磁盘，确认备份需求后清理；不足 12 GiB 会延后更新，不删除数据腾空间。
备份中含敏感数据，应与运行目录采用同等访问保护，不上传仓库。

## 运维

```sh
systemctl list-timers nori-update.timer
sudo cat /var/lib/nori-updater/status.json
sudo journalctl -u nori-update.service -n 30 --no-pager
# 构建详细日志，限 root 读取；不要直接公开完整内容。
sudo less /var/lib/nori-updater/logs/$(date -u +%Y%m%d).log

# 暂停后续检查；已经运行的更新不会因此中断。
sudo systemctl disable --now nori-update.timer
# 修复已失败提交的环境问题后，显式重试；进程锁避免与定时任务并发。
sudo python3 /opt/nori-updater/nori-update.py --config /etc/nori-updater.json --retry
# 恢复定时检查。
sudo systemctl enable --now nori-update.timer
```

`status.json` 的状态包括 `building`、`updated`、`up_to_date`、`superseded`、
`deferred`、`failed`、`rolling_back`、`rolled_back` 和 `blocked`。
网络检查失败可在 systemd 日志中看到；状态文件保留上一次已记录状态。
如果恢复检查发现管理员已替换活动版本或备份，停止自动恢复，保留事务日志以供人工处理。

合成测试覆盖构建失败不重启、状态保留、健康检查回滚、两次目录改名之间/之后中断、
已确认事务不回滚、main 前进、版本未变、脏工作树和管理员修复保护。
本功能满足操作者提出的“合并 main 后自动构建并重启”运维需求，不增加业务工具或渠道权限。
