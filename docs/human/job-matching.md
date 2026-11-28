# Verify public job discovery / 验证公开职位检索

Use a synthetic candidate and compare location, eligibility and deadline against the employer’s listing. / 使用合成候选人资料，对照雇主页面核实工作地点、资格和截止时间。

### ▶ Run / 操作

```sh
npm run toolchain:pnpm -- exec node scripts/verify-job-matching.mjs
```

### 🔎 Check / 核对

This command checks skill discovery in a temporary workspace. Use the three fixtures for matching decisions. Keep candidate data private and obtain separate authorization for applications. / 此命令检查临时工作区的技能发现。用三个样例核对匹配决定，妥善保管候选人资料，投递需独立授权。[Cases / 样例](../../tests/fixtures/job-matching-cases.md)

📋 [Full procedure and configuration / 完整操作与配置](../agent/runbooks/job-matching.md) · [Human handbook / 阅读导航](README.md)
