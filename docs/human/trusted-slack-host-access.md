# 🔐 Review Slack host access

1. **Identify the caller.** Check Slack account and channel admission and the agent using the trusted development profile.
2. **Inspect protected paths.** Review host permissions and the accident guard configuration. The guard catches a limited set of accidental operations.
3. **Verify recovery.** Run the local regression and confirm the private configuration backup is available before changing the profile.

```sh
node --test tests/host-guard.test.mjs
```

[English](trusted-slack-host-access.md) · [中文](trusted-slack-host-access-zh.md) · [Configuration and scope / 配置与适用范围](../agent/runbooks/trusted-slack-host-access.md)
