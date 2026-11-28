# Check gateway telemetry / 核对网关遥测

Start with one gateway profile. Configure its OTLP destination, credentials and separate trace, log and metric datasets. / 从一个网关配置开始，设置 OTLP 目标、凭据及独立的追踪、日志和指标数据集。

### 🔎 Check / 核对

Generate a test event and look for it in the intended dataset. Verify notification delivery separately. Use the configuration and rollback procedure for the same profile. / 产生测试事件并在目标数据集中查找记录。通知投递需单独验证，回退时使用同一网关的配置。

📋 [Full procedure and configuration / 完整操作与配置](../agent/runbooks/observability.md) · [Human handbook / 阅读导航](README.md)
