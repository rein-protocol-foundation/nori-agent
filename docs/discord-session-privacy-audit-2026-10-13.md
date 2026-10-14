# Discord 课程来源、session 与记忆隔离审计 — 2026-10-13

**结论：当前配置未实现每个用户独立的公共频道 session，也未实现逐用户持久记忆服务。**
已经临时收紧本地 Discord 测试实例，但不能把这些补强当作多用户隔离已完成或已通过隐私验收。
本次没有发现实际泄露事件；代码确认存在共享上下文路径，没有两名真实用户的完整隐私验收。

## UC03、UC05 的验收结论

按负责人产品复核，两例均改为通过，八例整体通过。UC03 给课程、时间安排建议和直接概念
答疑；UC05 给真实活动频道和免费中文课程，满足了新人的参与与学习需求。
“等有活动了你直接叫我，我帮你看时间和报名入口”是合理的后续帮助。另一个收尾里的
“有活动我叫你”可继续改进措辞，不据此否定整个用例。原消息完整保留，没有用期望回复
替换实测。产品场景通过与跨用户隐私验收是两件事。

## 课程实际从哪里来

测试前，操作者联网核实 Hugging Face 中文 Agent 课程，写入 ignored 本地运行工作区的
`community-directory.json`，其 resources 当时只有这门课。提交的默认目录仍为 unconfigured。
该目录不是组织数据库；按负责人说明，测试时组织数据库的资源列表为空。本次没有验证
Nori 从那个数据库发现课程，也没有验证它自主联网寻找新课程。

工具记录可见 `read DISCORD_ONBOARDING.md` 与 `read community-directory.json`；原 UC05
留存的会话工具记录没有课程网页搜索调用。UC03 的会话后来重置过，不把现存工具记录
伪装成首次验收的完整调用日志。测试前准备的目录、来源核实记录及实际回复均支持课程
来自操作者预置公开目录这一说明。

两例推荐同一门课，因为读取同一份公开资料，而不是因为已证明用户记忆共享。公开课程
目录适合共享；个人资料、偏好和私聊历史不应因此共享。
公共频道消息本身面向该频道受众；逐用户 session 也不能把已公开发送的消息变成私密消息。

## 路由代码和当前配置

审计的是仓库所固定的 OpenClaw `4a11f89e84`，没有修改上游文件。

| 范围 | 当前行为 | 对隐私的意义 |
| --- | --- | --- |
| 同一用户、不同公共频道 | 不同频道 key；原 UC03、UC05 属于不同 session | 重复课程不是跨这两个会话共享用户记忆的证据 |
| 不同用户、同一公共频道 | 同一个频道 key，不含发送者 ID | 对话上下文共享，不符合逐用户 session 目标 |
| Discord 私信 | 当前禁用；原配置未显式设置 dmScope | 若以后按默认值启用，多个用户 DM 会共用 main session |
| 公共目录 | 同一工作区公开资源文件 | 可以共享，不是成员记忆 |
| 成员持久记忆 | 没有独立 owner-scoped 读写服务 | 当前不能宣称已为每人维护独立长期记忆 |

代码依据：

- [Discord peer 构建](../vendor/openclaw/extensions/discord/src/monitor/route-resolution.ts)：服务器
  消息的 peer.id 使用 conversation/channel ID；只有 DM 使用 directUserId。
- [核心 session key](../vendor/openclaw/src/routing/session-key.ts)：非 direct 分支产生
  `agent:<agent>:discord:channel:<channel>`；没有 sender ID。`dmScope` 的各个分支只处理 direct。
- [原生配置 schema](../vendor/openclaw/src/config/zod-schema.agents.ts)：groupScope 仅支持
  per-group / main，binding match 没有服务器消息 sender 字段。不能填一个不支持的 per-user
  配置值来声称隔离生效。
- [频道上下文](../vendor/openclaw/extensions/discord/src/monitor/message-handler.process.ts)：还可能
  处理按频道记录的 ambient history。即使以后改 session key，也必须同时检查这一条输入路径。

原活跃测试配置和普通本地配置都没有 session、memory 或文件/session 工具隔离设置。
Rein 的[后端 proof scope](../plugins/rein-operations/ingress-proof.ts)包含平台、空间、频道与
用户 ID，限制业务调用冒用身份；它不是对话上下文隔离，不能替代逐用户 session。

## 长期记忆和文件边界

1. [Bootstrap 过滤](../vendor/openclaw/src/agents/workspace.ts)会从 group/channel 会话中排除
   root MEMORY.md，这是已有保护；不能据此推断所有资料都隔离。
2. USER.md 是共享 bootstrap 文件，旧本地模板还引导记录个人偏好并声明每个 session 加载。
   本次将共享使用规则改为只放组织级、非个人偏好，并提供
   [公开 USER 模板](../templates/community-user.example.md)。不提交 ignored 个人 USER.md。
3. 共享 memory/*.md 和可用 read 工具是另一条入口。原 tools.fs.workspaceOnly 未设置，默认
   不限制工作区；工具 allowlist 虽不含 memory/search 或会话历史工具，但包含 read，仍有文件
   越界读取的配置风险。仅藏起 memory_search 工具不够。
4. [跨会话回忆默认值](../vendor/openclaw/packages/memory-host-sdk/src/host/config-utils.ts)在 main-DM
   模式下默认为开启，设计按 agent/private conversation 而非成员隔离。默认 per-group 会话另有
   私聊回忆输入保护，当前 DM 也禁用；这不是它已经把私聊资料注入公共频道的证据。
5. 本地测试工作区当时没有 root MEMORY.md 或 memory/，USER.md 只有通用模板；只读检查测试
   Agent 的 memory_index_sources / memory_index_chunks 均为 0。没有读取或输出其他成员的私聊
   来证明这点，也不能从这个局部快照推出整个组织从未泄露过资料。

## 已做的临时补强

仅应用于本次独立、本地 Discord 测试实例，不部署生产，不改变原普通/Slack 配置：

- 显式 dmScope=per-account-channel-peer，私信仍禁用；groupScope 保持 per-group，**群聊仍未逐用户隔离**。
- tools.fs.workspaceOnly=true；tools.sessions.visibility=self；禁止跨 agent 工具访问。
- 关闭 memory.search、rememberAcrossConversations 和 compaction memory flush，避免共享持久记忆
  读写；这不是建立逐用户记忆服务。
- Discord historyLimit=0，关闭 thread starter 自动注入；原受限工具 allowlist 保持不变。
- 暂时只允许原验收账号触发本地机器人，避免将未隔离实例当作多人服务继续使用。共享历史
  未被删除、迁移或复制进其他用户会话；未来个人路由必须从干净的用户上下文开始。
- 本地 runtime 的 USER.md 改为共享使用规则，AGENTS.md 明确禁止把成员资料写入共享文件。

[配置片段](../config/discord-privacy.example.json)只有通用配置，不包含凭据、真实账号或频道 ID，
不会自行启用连接。工作区内只应放经审查的公开资料；需要的公共政策参考应由操作者放进
工作区，不能为了读父目录文档而重新开放任意文件读取。普通本地配置仍需部署前单独审查。

## 验证与可复现检查

```sh
npm run toolchain:pnpm -- run probe:discord-routing
npm run toolchain:pnpm -- run audit:discord-privacy -- <openclaw-config.json>
npm run toolchain:pnpm -- exec node --test tests/discord-privacy.test.mjs
```

原生路由探针调用的是当前已编译的上游 SDK，需要先按 setup 文档构建上游。只使用合成
标识符，没有向 Discord 发送伪造用户消息或向业务后端注入假身份：

| dmScope | 同频道不同发送者 session 相同 | 不同 DM 发送者 session 相同 |
| --- | --- | --- |
| main | 是 | 是 |
| per-account-channel-peer | 是 | 否 |

配置片段已合并到本地测试实例，通过当前 OpenClaw config validate，且无 schema 警告。
审计命令在补强后仍报告 guild_session_shared 并返回非零，这是预期的未解决项，不是通过
七项配置检查就宣称隐私隔离已通过。审计器只检查列出的原生配置，不全面解析第三方插件、
所有 account override 或数据存储内容，不是完整的安全认证。

后续评审修复：DM 判定覆盖匹配 route binding 的 session override，按具体 peer、direct
wildcard、account、channel 顺序及同层源顺序求有效 scope；排除只适用于群组、guild、team、
角色或其他平台的绑定。配置账户的 DM 开关也参与判定。26 组原生路由对照验证该有限范围；
审计只输出 scope，不输出成员或账户标识，仍不解析凭据可用性或认证实际运行结果。
本轮评审修复后，PR #5 的仓库测试 648 项通过，包含 100 项目录校验测试、13 项隐私配置
测试与真实验收报告的数据保管回归检查；原生路由对照、结构与差异格式检查通过。

追加评审修复补齐 DNS label 格式与长度检查，保留合法 IDN、连字符及单个末尾根点。
关于回忆默认值，固定上游的 resolveRememberAcrossConversations 明确以任意绑定级 DM scope
作为多用户信号并默认关闭回忆，即使该绑定属于其他平台。因此审计保留真实默认值，另报
private_recall_implicit_policy，提醒不要以非匹配绑定代替显式关闭策略，并输出是否显式关闭。
78 组与原生回忆开关的对照通过；本轮追加后仓库测试 657 项通过。
后续目录评审再加入 webhook 执行链接拦截，覆盖旧域名、子域名、API 版本和末尾根点，
避免将 webhook token 当作公开链接提交。八项回归遍历所有 URL 字段，仓库测试增至 665 项。
合并前追加修复覆盖 canonical agents.entries 的逐 Agent 回忆策略，优先于 legacy list；
只有所有有效策略显式关闭才报告明确关闭。新增五项回归和 108 组逐 Agent 原生对照，
累计仓库测试 670 项、原生回忆对照 186 组通过。审计不输出 Agent 标识符。

仓库完整测试 614 项通过，其中新增配置审计测试 7 项；原固定上游的工作区读取边界与
bootstrap 隐私回归测试 32 项通过。结构与差异格式检查通过。这些检查验证配置诊断和已有
保护行为，不代替双用户真实对话、模型输入与持久记忆的隔离验收。

## 完整目标还需要实现什么

1. **可信发送者路由。** 在读取历史、排队和模型调用前，使用宿主验证的 Discord sender ID。
   公共会话至少按 bot account / guild / channel或thread / sender 划分；私聊与公聊必须分开。
   保留真实的公开受众标记，不能把公共消息伪装成 direct 来取得不同 key，否则会误用私聊记忆边界。
   未 link 的用户也要隔离，不能等绑定完成才分开，更不能用显示名、消息自报邮箱或 ID 路由。
2. **逐用户记忆服务。** 后端绑定当前可信身份，强制 owner 与受众范围；不接受模型任意选择
   他人身份。每次读取仅返回当前用户、当前受众可见的内容。提供本人查看、纠正和删除能力。
   公共课程目录仍可共享，私聊偏好和敏感资料不自动注入公共回复，即使是同一人发问。
3. **清理其他回流路径。** 频道缓存、thread starter、回复引用、共享 USER/MEMORY 文件、
   会话搜索、工具文件读取、摘要与重置后的历史迁移，都要保持相同边界。
4. **至少双用户验收。** 同一频道 A/B 交替发消息，确认 key、模型输入、摘要、长期记忆及
   工具访问隔离；A 的私聊信息不进 B，也不自动出现在 A 的公共回复。还要覆盖并发、重启、
   会话重置、伪造身份、检索和删除。只看模型口头说“我不知道”不是隔离证据。

当前 pin 没有可直接配置的公共频道逐发送者路由。需要 Rein 自有 ingress/routing 适配层，
或经评审引入上游支持；只改提示词、dmScope、session 工具 visibility 或给文件换名称都不能
完成整个目标。本次交付是确认、可复现审计和临时保护，**没有把完整逐用户隔离标为已实现**。
