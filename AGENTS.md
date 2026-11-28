# 🛠 Repository development rules / 仓库开发规则

**Agents must read and follow the full repository policy before beginning work.** It covers model routing, delegation, verification, usage reporting and organizational boundaries. / **Agent 开工前须阅读并遵循完整仓库规则。** 其中包含模型路由、委派、验证、用量报告及组织权限边界。[Full policy / 完整规则](docs/agent/reference/repository-development.md)

| When / 场景 | Apply this rule / 执行规则 |
| --- | --- |
| 🔧 Changing behavior / 修改行为 | Read the setup and plugin contracts, preserve native capabilities and test the affected callers. / 先阅读环境与插件契约，保留原生能力并验证调用方。 |
| 🔐 Handling data / 处理数据 | Keep secrets, real member records and runtime memory out of Git. Develop against synthetic fixtures. / 凭证、真实成员记录与运行记忆不得提交到 Git，开发使用合成样例。 |
| 🧩 Extending OpenClaw / 扩展运行时 | Use public SDK interfaces. Keep the upstream submodule read-only. / 使用公共 SDK 接口，上游子模块只读。 |
| ✅ Handing off / 交接 | Record checks, failures and remaining acceptance work. Follow the full policy for dated records and token reporting. / 记录验证、失败项及待验收事项，依完整规则维护交接与用量记录。 |

Runtime policy lives in the agent workspace. Live account operations, external sends and deployment require explicit authorization. / 运行策略位于 Agent 工作区。操作真实账号、对外发送与部署均须明确授权。
