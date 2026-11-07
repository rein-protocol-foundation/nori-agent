# Nori OCI CLI 与 Instance Principal 只读接入

执行日期：2026-11-07 UTC。用户明确授权在服务器安装 OCI CLI，配置实例身份，开放实例、磁盘、备份、监控和费用只读查询。本文最初为本地运维记录；按用户于 2026-11-07 UTC 的明确要求纳入公开仓库，发布范围见[运维记录索引](operations/README.md)。

## 安装

- 服务器：现有 San Jose Nori 生产实例，VM.Standard.E5.Flex，6 OCPU / 48 GB。
- OCI CLI **3.96.0**，OCI Python SDK **2.190.0**；通过官方文档支持的 pip 方法安装到 root-owned 独立虚拟环境 `/opt/nori-oci-cli`。
- 为虚拟环境新增 Ubuntu `python3-venv` 及其依赖；未进行系统整体升级，安装器确认无需重启服务。
- `/usr/local/bin/oci` 是 root-owned 启动脚本，默认 `OCI_CLI_AUTH=instance_principal`、`OCI_CLI_REGION=us-sanjose-1`，然后执行真实 CLI。两个渠道网关的现有 PATH 均包含 `/usr/local/bin`，无需重启即可使用。
- 依赖快照：服务器 `/opt/nori-oci-cli/requirements-installed.txt`。
- 服务器使用说明：`/opt/nori-oci-cli/README.md`。
- 没有创建个人 API key、持久用户登录或浏览器 cookie；没有修改 Nori 应用依赖、现有模型权限、渠道工具权限或部署配置。

## IAM 对象与授权范围

动态组：Default 域的 `nori-oci-readonly`。

```text
ocid1.dynamicgroup.oc1..aaaaaaaahehormhytfboepdvzpalgcwxwvh6hvy7gnsycyrpi7iddi5hfguq
```

唯一匹配规则：

```text
instance.id = 'ocid1.instance.oc1.us-sanjose-1.anzwuljrmjmu7yichcph7hbgiklpguodt5lpu5ntfaqsubyjtpcbxwaoef6a'
```

策略：`nori-oci-readonly`，状态 Active，位于根 compartment。

```text
ocid1.policy.oc1..aaaaaaaarn5fgqnur22jbcepxxowe4jbi7p7nlspf4uywfzrcpnj6xukljqq
```

| verb | resource-type | 作用域 | 能力 |
|---|---|---|---|
| read | instances | 仅根 compartment | 实例列表、规格和状态 |
| inspect | volume-family | 仅根 compartment | 启动卷/数据卷、附件、备份及备份策略的列表/元数据 |
| read | metrics | 仅根 compartment | 指标列表和时序数据 |
| read | alarms | 仅根 compartment | 监控告警和历史 |
| read | usage-report | tenancy | 用量与费用分析 |

前四条策略均使用 `where target.compartment.id = 'ocid1.tenancy.oc1..aaaaaaaayjpmbcwh62ljknw7zfoxwsu4lssybrgkgqt7khniwyk6xpleximq'` 限定根 compartment。费用 API 的权限在租户级授予。未使用 `manage all-resources`、`use` 或 `manage`。`inspect volume-family` 已覆盖卷和备份的 get/list 查询，不包含附件 CHAP secret 读取、卷挂载或备份恢复。

现有根策略原先仅有管理员用户组的 `manage all-resources`，未修改；创建动态组前 Default 域动态组列表为空。

Instance Principal 是主机身份，不区分 Nori 会话或用户；能使用该主机实例身份的进程共享这些权限。对聊天用户返回费用、资源等内部信息时仍需遵循现有身份与受众校验。OCI 自带的实例身份 `compartment_inspect` 权限也存在。未通过临时添加写权限来测试只读查询。

## 查询验收

以下命令均以 Nori 服务运行用户 `ubuntu` 执行，使用 Instance Principal，而非管理员 API key：

| 查询 | 实际结果 |
|---|---|
| `oci --version` | 3.96.0 |
| `compute instance get` | RUNNING，6 OCPU，12 vCPU，48 GB |
| `bv boot-volume list` | 200 GB 卷，AVAILABLE |
| `bv volume list` | 调用成功，无数据卷 |
| `bv boot-volume-backup list` | `nori-pre-resize-20261107`，AVAILABLE，源卷 80 GB |
| `bv backup list` | 调用成功，无数据卷备份 |
| `monitoring metric list` | `oci_computeagent` 下 10 项指标 |
| `monitoring metric-data summarize-metrics-data` | CPU 指标 1 个序列、29 个点；04:00 UTC 点为约 1.0465% |
| `monitoring alarm list` | 调用成功，列表为空 |
| `usage-api usage-summary request-summarized-usages` | 2026-11-06 UTC 的 COST 为 **$4.032 USD** |

费用按已入账数据返回，不能当作实时余额。空列表代表当前没有相应资源，不能当作权限失败。IAM 权限生效前的实例查询返回 NotAuthorizedOrNotFound；策略保存后同一查询成功。

Nori 模型调用验收也已通过：使用原生 `openclaw agent exec`、现有生产配置与运行环境、独立测试状态目录，以及已配置的普通 `rein-magpie/general` 路由。实际服务模型为 `bailian-token-plan/deepseek-v4.1-flash:high`。测试返回 CLI 3.96.0 / RUNNING / 6 OCPU / 48 GB，原生执行记录确认确实调用了 `exec` 工具，命令退出成功且工具结果与回答一致。

测试 session ID：`2274c588-f659-4f49-b4ae-b31d0c8cb01c`。仅测试记录保存在服务器用户私有目录 `/home/ubuntu/.local/state/nori-oci-verification/`，无对外回复投递。没有把测试写入既有用户会话。无渠道的 headless `auto` 路由不适合该验收：首次未继承服务环境的测试失败，继承环境后 `auto` 仍被路由约束拦截；随后使用现有普通 `general` 路由成功，没有停用或放宽路由保护。

额外边界检查：同一实例身份读取 IAM policy 列表返回 `NotAuthorizedOrNotFound`（404），表明未获得该 IAM 管理对象的读取权。没有对生产资源执行写操作来“测试拒绝”；只读边界由已核对的策略规则提供。四项应用服务均保持 active。

本轮验证了服务运行用户的各类云查询及一次真实 Nori 工具调用；这不等于 Slack/Discord 中任何用户都获准读取云账户资料，也没有执行真实渠道消息发送验收。

## 使用例子

```bash
oci compute instance get \
  --instance-id <实例OCID> \
  --query 'data.{state:"lifecycle-state",ocpus:"shape-config".ocpus,memoryGB:"shape-config"."memory-in-gbs"}'

oci bv boot-volume-backup list --compartment-id <根compartment的OCID> --all

oci usage-api usage-summary request-summarized-usages \
  --tenant-id <tenancy的OCID> \
  --time-usage-started 2026-11-06T00:00:00Z \
  --time-usage-ended 2026-11-07T00:00:00Z \
  --granularity DAILY --query-type COST
```

时间范围为 UTC、左闭右开。默认认证由启动脚本提供，也可显式指定 `--auth instance_principal`。不需要运行 `oci setup config`。实例 id、compartmentId、tenantId、availabilityDomain 可从 IMDSv2 获取；不要将完整 metadata 或 debug 日志发送到聊天。

## 回退

由获授权的管理员撤销 `nori-oci-readonly` 策略的五条 allow 规则，等待 IAM 传播并复测，即可撤销新增云资源访问能力；之后按明确授权清理动态组和 CLI 安装。仅删除 CLI 不能撤销实例身份的 API 权限。应用发布不会替换 `/opt/nori-oci-cli` 和 `/usr/local/bin/oci`。

## 官方参考

- [OCI CLI 手动安装](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/climanualinst.htm)
- [Instance Principals](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/callingservicesfrominstances.htm)
- [核心资源 IAM 权限](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/corepolicyreference.htm)
- [Monitoring 权限](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/monitoringpolicyreference.htm)
- [费用分析权限](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/costanalysisoverview.htm)
