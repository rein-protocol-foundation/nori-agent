# 🔐 审查 Slack 主机工具权限

1. **确认调用范围。** 核对 Slack 账号、频道准入以及受信开发配置对应的 Agent。
2. **检查受保护路径。** 核对主机工具权限和防误操作插件的配置。该插件只能拦截部分误操作。
3. **验证与回退。** 运行本地测试，变更前确认私有配置备份可用。

```sh
node --test tests/host-guard.test.mjs
```

[English](trusted-slack-host-access.md) · [中文](trusted-slack-host-access-zh.md) · [Configuration and scope / 配置与适用范围](../agent/runbooks/trusted-slack-host-access-zh.md)
