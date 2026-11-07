# Nori 可观测性接入状态与运维说明

最后核对：2026-11-05 23:12（America/Los_Angeles，PST）。

## 当前结论

**遥测采集、Axiom 数据入库、仪表盘、三条监控及 Slack 通知已接通；通知器测试的告警与恢复消息均已送达。三条生产规则尚未进行受控故障触发验收。**

本次在 Axiom 页面核对到：三条监控均显示 `Normal`，执行频率均为 5 分钟，通知器列均显示 `Slack`。已保存并启用 `Nori · Slack #nori-alerts` 通知器，三条规则均绑定它。Slack 已收到由 **Nori - Rein Secretary** 发出的测试告警和恢复通知。

| 环节 | 状态 | 已验证的事实 |
| --- | --- | --- |
| Diagnostics OTEL 插件 | 已接入 | 初次接入时，兼容当前 OpenClaw 的内置 `diagnostics-otel 2026.9.5` 加载、配置校验及插件检查通过 |
| 日志、追踪、指标导出 | 已启用并曾验证真实入库 | Axiom 中确认收到生产 `nori-slack`、`nori-discord` 数据，而非仅验证接口返回 200 |
| Nori Observability Dashboard | 已创建 | 六个图表，分别展示消息处理与网关 RPC 的请求量、错误率和延迟 |
| 三条异常监控 | 已创建并启用 | 本次页面状态均为 `Normal`，均已绑定 Slack 通知器 |
| Slack `#nori-alerts` | 已创建 | 频道 ID 为 `C0CG9BQQ4Q0`；已收到测试告警和恢复通知 |
| Nori Webhook → Axiom 通知器 | 已完成 | 频道专用 Webhook 已授权，通知器已保存、启用并绑定全部三条监控 |
| 通知器告警与恢复投递 | 已验证 | Axiom Send test 生成的两条通知均实际抵达 Slack |
| 三条生产规则触发与恢复验收 | 待完成 | 未制造生产故障或改变生产阈值验证规则；通知器测试不等于规则验收 |

`Normal` 仅表示监控当前未处于触发状态，不代表 Slack 通知可用，也不能单独证明服务健康。低请求量会触发样本量保护；无数据告警当前关闭。

## 使用入口

- [Nori Observability Dashboard](https://app.axiom.co/rein-protocol-foundation-qzel/dashboards/uid/nori-observability)
- [Dashboard：最近 24 小时视图](https://app.axiom.co/rein-protocol-foundation-qzel/dashboards/uid/nori-observability?t_qr=1d)
- [Axiom Monitors](https://app.axiom.co/rein-protocol-foundation-qzel/monitors)
- [Axiom Notifiers](https://app.axiom.co/rein-protocol-foundation-qzel/notifiers)
- [Slack #nori-alerts](https://app.slack.com/client/T0C4GRL55HB/C0CG9BQQ4Q0)

## 数据链路与配置

生产 Slack / Discord 网关通过 OpenClaw Diagnostics OTEL，将遥测以 OTLP/HTTP protobuf 导出至 Axiom US East 1。三个数据集通过 `Nori Observability` correlation group（`nori`）关联。

| 数据集 | 类型 | 内容 |
| --- | --- | --- |
| `nori-traces` | Events | 请求和操作的追踪 Span；当前 Dashboard 和三条监控的数据来源 |
| `nori-logs` | Events | 网关诊断日志 |
| `nori-metrics` | Metrics | OpenTelemetry 指标，包括 RPC 请求等指标序列 |

生产服务标签为 `nori-slack`、`nori-discord`，环境为 `production`。本地开发及 `nori-setup-check` 验证流量被 Dashboard 和监控过滤掉。

配置要点：

- 指标导出间隔为 60 秒，追踪采样率为 1。
- `captureContent: false`，关闭对话内容、工具输入输出及日志正文采集；诊断元数据和脱敏错误信息仍可导出。
- 复用现有 Axiom Token 的数据写入权限。Token 不能查询遥测，数据查询和监控核对通过已登录的 Axiom Console 完成。
- 凭据仅保存在私有环境文件，文件权限为 `0600`；文档及受版本控制的示例不保存 Token 或 Webhook URL。

具体安装、配置路径及回滚方法见 [接入与维护指南](observability.md)，配置片段见 [JSON 示例](../config/axiom-otel.example.json) 与 [环境变量示例](../config/axiom-otel.env.example)。

## Dashboard 指标口径

六个图表按两行组织，每个图表按 `service.name` 区分 Slack 与 Discord，仅使用生产数据。

| 类别 | 请求量 | 错误率 | 延迟 |
| --- | --- | --- | --- |
| Messages | `openclaw.message.processed` 完成 Span 数 | 错误消息处理数 / 完成消息处理数 | 消息处理 P50、P95，包含 Agent / 模型处理时间 |
| Gateway RPC | `openclaw.gateway.rpc.response` 首次响应 Span 数 | 错误 RPC 响应数 / RPC 响应数 | RPC 首次响应 P50、P95 |

请求量是图表当前时间桶内的计数，不是每秒请求数。延迟由 Axiom 的 `duration` 时间间隔字段除以 `1ms`，统一显示为毫秒。

错误判断同时检查标准 `error` 标志和 OpenClaw 的错误 outcome。OpenClaw 自定义属性位于动态字段 `['attributes.custom']`，例如 `tostring(['attributes.custom']['openclaw.outcome'])`。

RPC 包含 Dashboard、健康检查及控制请求，不能等同于用户消息量，也不能与 Messages 计数直接相加。缺少某个服务的曲线，表示该时段未查到相应完成事件，不应直接解释为零错误或服务健康。

## 异常监控规则

三条规则均按“服务 + 操作类型”分别判断，避免 Slack、Discord 或消息处理、RPC 互相稀释异常。

| 监控 | 触发条件 | 恢复条件 |
| --- | --- | --- |
| [Nori · High error rate](https://app.axiom.co/rein-protocol-foundation-qzel/monitors/view/qMrqLHeEcF5qNJz5zl) | 15 分钟内至少 20 次完成请求，错误率 ≥ 5% | 错误率 < 3% |
| [Nori · Repeated failures](https://app.axiom.co/rein-protocol-foundation-qzel/monitors/view/QlYPNmL3uvRzMaPD3B) | 15 分钟内错误数 ≥ 3 | 窗口内错误数归零 |
| [Nori · High p95 latency](https://app.axiom.co/rein-protocol-foundation-qzel/monitors/view/eWp4aVfHFuP1lqLpYg) | 15 分钟内至少 5 次完成请求；消息处理 P95 ≥ 120 秒，或 RPC 首次响应 P95 ≥ 5 秒 | P95 低于对应阈值的 80% |

公共配置：每 5 分钟运行一次，查询 15 分钟窗口，延迟 120 秒评估以等待遥测入库；按组通知；开启恢复通知；关闭每轮重复通知及无数据告警。

延迟规则输出“P95 / 对应延迟阈值”，触发值为 1，恢复值为 0.8。错误率及延迟规则在样本不足时返回 0，因此应结合请求量判断恢复是否来自真实改善。重复失败规则补充低流量场景，但它统计的是窗口累计失败，**不要求失败连续发生**。

当前采用固定阈值。这些数值是初始运维阈值，尚不是约定的 SLO；也尚未启用依赖历史基线的统计异常检测。

## Slack 告警配置与验证

现有 Slack App **Nori - Rein Secretary** 通过频道专用 Incoming Webhook 向 `#nori-alerts` 发送 Axiom 告警。通知器 [Nori · Slack #nori-alerts](https://app.axiom.co/rein-protocol-foundation-qzel/notifiers?notifierId=9tFCLIVLRSPAfjj44u) 已启用，绑定高错误率、重复失败和高 P95 延迟三条监控；列表已不再显示 `No notifiers`。

2026-11-05（PST）验证记录：

- 23:10 完成频道 Webhook 授权，并保存 Axiom Slack 通知器。
- 23:10:48 收到 `Alert Test: Just Checking In!` 测试告警。
- 23:10:58 收到 `Alert Test: All Clear!` 测试恢复通知。
- 23:12 核对三条监控均绑定 Slack；Slack 页面确认两条消息的发送应用为 Nori。

两条消息均由 Axiom 通知器的 **Send test** 功能生成，明确标注无需处理。验证过程中未向业务频道发送消息，未改变生产阈值、制造业务错误或重启网关。Webhook URL 仅保存在 Slack / Axiom 私有配置中，不进入仓库或 PR。

这证明通知器告警和恢复消息可实际投递，**不证明三条生产规则的查询、评估和状态转换已经完整验收**。后续应以隔离的合成数据和临时测试规则进行受控触发/恢复演练，完成后记录结果并停用测试规则。日常仍需结合 Axiom 的数据时间和请求量判断服务健康。

## 覆盖范围与维护

当前监控针对 OpenClaw 网关的完成事件，不覆盖 Router、Dashboard、部署控制器、数据库、磁盘容量或独立后端的专用指标。未完成或卡住的请求、网关离线、遥测停止上报，需要另设存活性和数据新鲜度监控；当前三条规则不承担这些职责。

日常核查：先看请求量和数据时间，再看错误率与延迟；有异常时按服务、操作和时间范围进入追踪或日志排查。调整阈值前观察真实流量与正常延迟，保留最低样本量和恢复阈值。

部署后应确认两个生产服务的新数据继续进入 Axiom，并重新检查网关就绪状态。初次接入时已验证两网关真实遥测、`/readyz` 及带认证的 `rein_status`；**本次复核范围是 Axiom 监控配置和 Slack 通知状态，没有重新执行最新 OCI 部署后的网关或遥测验收**。

需要停止通知时可禁用相应监控；需要停止遥测导出时按 [维护指南](observability.md#verify-and-roll-back) 修改对应私有配置并协调维护窗口。避免为测试告警向真实业务频道发送消息或触发业务写操作。
