# Contributing to Nori-Agent / 参与 Nori-Agent 开发

[Build and verify / 本地开发](docs/human/getting-started.md) · [Documentation rules / 文档编写规则](docs/README.md) · [Plugin map / 插件架构](docs/human/plugin-map.md)

## 🧭 From issue to pull request / 从议题到 PR

1. **Agree on the problem.** Search existing issues and PRs. For a bug, give a synthetic reproduction, expected result and observed result. For a feature, link the PRD requirement, user story or acceptance criterion and distinguish proposed behaviour from what ships. Claim the work in the issue so other contributors can coordinate.

   **明确问题。** 先查已有 issue 和 PR。缺陷请提供合成数据复现步骤、预期与实际结果；功能请关联 PRD 需求、用户故事或验收标准，并区分提议和已有行为。在议题下认领工作，方便协作。
2. **Implement one reviewable change.** Branch from the current main branch in your fork or checkout. Use public OpenClaw SDK interfaces and keep the upstream submodule read-only. Record the integration decision before adding runtime dependencies. Keep skills channel-independent. Label synthetic fixtures and keep credentials and real organization records out of issues, diffs and logs.

   **聚焦一次改动。** 在 fork 或本地仓库从最新 main 创建分支。使用 OpenClaw 公共 SDK，上游子模块保持只读。添加运行时依赖前记录集成决策，通用技能应独立于频道。标注合成测试数据，议题、差异和日志均不得包含凭证或真实组织记录。
3. **Verify and document.** Run the checks below and report failures or skips. Supply English and Chinese for new or revised documentation in the same PR, either side by side or as linked counterparts. Keep commands, scope and limitations equivalent. Update the plugin map when adding, retiring or changing a package's responsibility.

   **验证与记录。** 运行下列检查并说明失败或跳过项。新增或修订文档须在同一 PR 内提供中英双语，可并排编写或双向链接；命令、适用范围和限制应一致。新增、撤回插件或变更职责时更新插件架构表。
4. **Request review.** Fill in the PR template. Compare the changed files with the plugin impact summary in **Actions → OpenClaw integration → Summary**. List direct packages, indirect callers and shared files, and explain why each matters. Request a contributor familiar with the affected area. If ownership is unclear, ask a maintainer to route the PR.

   **发起审查。** 填写 PR 模板，对照变更文件与 **Actions → OpenClaw integration → Summary** 中的插件摘要，列出直接改动的包、间接受影响的调用方及共享文件，并说明影响。邀请熟悉相关模块的贡献者审查；归属不清时由维护者协调。

## ✅ Verification / 验证

| Change / 改动 | Evidence / 验证证据 |
| --- | --- |
| Docs or templates / 文档或模板 | `node scripts/check.mjs` and a review of both languages / 运行命令并核对两种语言。 |
| PR scope logic / PR 范围判断 | `node --test tests/ci-scope.test.mjs` |
| Plugin or runtime / 插件或运行时 | Follow setup, run `pnpm test` and `pnpm verify:plugin`, then exercise the affected entry point. / 按开发环境指南配置后运行两条命令，并验证受影响入口。 |
| Business logic or persistence / 业务逻辑或持久化 | Test relevant authorization, deadlines, concurrent requests, idempotency and recovery. Show enable/disable, restart and data compatibility where affected. / 验证相关授权、截止时间、并发、幂等与恢复；涉及开关、重启或已有数据时覆盖相应场景。 |

## 🔎 Review, merge and handoff / 审查、合并与交接

- **Triage.** A maintainer records scope, acceptance criteria and the person taking the next step in the issue. Anyone may propose a design or review a diff. Keep disagreements on the issue with alternatives, evidence and a recorded maintainer decision.

  **分流。** 维护者在议题记录范围、验收条件和下一步负责人。任何贡献者均可提方案或审查差异；分歧在议题中记录备选方案、依据和维护者决定。
- **Review.** An independent reviewer reads the actual diff, traces shared callers, checks authorization and data boundaries, and compares test evidence with the acceptance criteria. Record blocking findings on the relevant lines. The author addresses each finding and requests another review after substantive changes.

  **审查。** 独立审查者阅读实际差异、追踪共享调用方，检查授权和数据边界，并将测试证据与验收条件比对。阻塞问题标在对应代码行；作者逐项回应，实质变更后重新请求审查。
- **Merge.** A maintainer with merge access confirms an independent approval on the current changes, passing required CI and resolved blocking discussions. For cross-plugin changes, confirm review covers every affected contract. Link the decision and record any remaining acceptance work with an owner. Production deployment and external sends require separate authorization.

  **合并。** 有合并权限的维护者确认当前改动获得独立批准、必需 CI 通过、阻塞讨论已解决。跨插件改动须覆盖各受影响接口。关联决定，为待验收事项记录负责人。生产部署及对外发送须另行获得授权。

Track product milestones in the roadmap, acceptance results in the evidence record and dated implementation handoffs in both deployment logs. For a runtime upgrade, follow the upstream procedure. Agent development handoffs follow the usage guide.

产品里程碑记入路线图，验收结果记入证据记录，注明日期的开发交接记入中英文部署日志。运行时升级依照上游流程，代理开发任务交接依照用量指南。[Roadmap / 路线图](docs/agent/verification/roadmap.md) · [Evidence / 验收](docs/agent/verification/acceptance-evidence.md) · [Handoff](docs/agent/verification/implementation-and-deployment.md) · [交接](docs/agent/verification/implementation-and-deployment-zh.md) · [Upstream / 上游](docs/human/upstream.md) · [Usage / 用量](docs/agent/verification/agent-token-usage.md)
