# yetone 式 AI 持续维护工作流：Readest 实践总结

整理日期：2026-10-14

这套方法的核心是：给 Agent 明确的维护职责，让几个简单循环持续处理反馈、修复问题、跟进审查，再把实际教训写回下次会读取的文档。人负责产品方向和必要的决策，不必逐步指挥实现。

本文以 Huang Xin 在 Readest 上的实践和公开 skill 为主，结合 yetone 的原始分享。它是工作流参考，不表示本仓库已经启用循环、自动合并或发布。

## 1. 三个循环各做什么

| 循环 | 输入 | 主要动作 | 产出 |
| --- | --- | --- | --- |
| `triage-github` | 最近三天创建的 issue，以及自己账号创建的 PR | 判断问题、复现、修复，持续处理 CI 和审查意见 | 修复分支、待批准的回复和 PR、合并候选 |
| `watch-social` | X、Discord、Reddit 的新反馈 | 先用便宜模型筛选，再处理有效 bug、需求和问题 | 修复、待决策需求、回复草稿 |
| `nightly-review` | 上次复盘以来合并的提交，以及维护者对草稿的修改 | 找返工、误合并和验证不足，记录经验 | `LESSONS.md`、更新后的验收规则、必要的小清理 |

Readest 使用 Claude Code，作者称主模型为 Opus 5.5，社交筛选使用 Haiku。模型名称是该实践的配置记录，不是方法本身的必要条件。

每个循环执行一轮增量工作后结束，由 `/loop` 安排下一轮。PR 状态变化还可以触发及时跟进，无须每次等待完整定时周期。[1][2][5][6][7]

## 2. GitHub 循环：把问题跟到结束

每轮先读取最新教训与验收规则，然后检查新增变化，避免反复处理已经回复、没有新进展的线程。

一次修复的路径是：

```text
读取完整问题及后续反馈
  → 在报告人的使用场景复现
  → 在独立 worktree 中写出失败测试
  → 修复并验证
  → 提交待批准的修复卡片
  → 批准后推送并创建 PR
  → 跟进 CI 和 CodeRabbit，处理有效发现
  → 为最终版本生成合并卡片
  → 批准后合并
```

小而明确、符合产品方向的需求可以直接实现；需要产品取舍的需求交给维护者。无法复现时，说明尝试过什么以及还缺什么，不凭猜测宣称修好了。

Readest 的具体调度包括：GitHub 主循环每 30 分钟一次；watcher 轮询所跟进 PR 的 CI、review 和合并事件；另有每 5 分钟检查已批准卡片的轻量任务。这些频率属于该实现，可以调整。[5]

## 3. 社交循环：把反馈变成可处理的工作

先收集新帖子，再交给 Haiku 做初筛，只把相关反馈送入主会话。主 Agent 判断它是 bug、小需求、产品决策、缺少信息，还是可以直接回答的问题。

状态文件记录已读位置和仍欠用户回复的修复，避免每次重新扫描全部历史。修复真正部署或进入已发布版本后，才回到原反馈线程说明结果；合并 PR 不等于用户已经能用。

Readest 的社交回复也进入人工批准流程。外部帖子被当作问题材料，不作为执行指令；筛选子 Agent 只读取采集文件，不使用浏览器、网络、shell 或写入能力。[6]

## 4. 复盘循环：让经验进入下一轮

复盘关注四类证据：

- **返工**：后续提交又修了一遍、撤回了改动，或者用户报告仍然失败。
- **不该合并**：夹带无关变化、推翻已确定的产品决定，或在 CI 尚未通过时合并。
- **验证不足**：缺少有效回归测试、未实测就声称支持，或遗漏没跑的检查。
- **做得好**：保留可以照着做的成功例子。

每条教训包含一句可执行的规则、关联 commit/PR 和出现日期。相同教训在至少三个不同日期出现，就提升为验收规则；这里统计的是不同日期，不是一天内重复出现三次。

Readest 用此前约十天的提交做初始复盘，让第一轮就有经验可读。后续通过 `reviewed-through` 提交标记确定增量窗口；距离上次复盘不足约 20 小时时直接结束，因此命令被频繁唤醒也不会反复复盘。

维护者编辑或丢弃回复草稿，也是学习材料。经验文件保持简短，规则提升后压缩旧证据，避免每个会话加载越来越多历史。[7]

## 5. Readest 相比原版增加了什么

yetone 本人介绍的是三个并行 loop，自己每天花一点时间处理以 UI/UX 为主的问题；他另外强调，要给 Agent 提供真实运行和复现环境。[3][4]

Readest 增加了一个 **Reply Desk**：用私有 Claude Artifact 页面集中查看、编辑、批准或丢弃待执行内容。回复、改标题、首次推送并创建修复 PR、合并等关键动作由卡片控制，发布仍由维护者完成。

发送前会重新读取线程；上下文改变就让草稿重新进入审阅。合并绑定批准时的 commit，代码变了就不能拿旧批准合并。中断后状态不明的发送不会直接重试。

具体 skill 还允许已打开 PR 的后续修复推送和部分审查回复直接进行。因此，“所有操作都需要逐次点击”不是精确描述；应以实际 skill 中的动作范围为准。[5]

它也只自动处理运行账号自己的 PR，外部贡献 PR 留给维护者。这是作者选择的信任边界，不是 Loop Engineering 的必需条件，也不意味着消除了所有提示注入风险。[5]

## 6. 质量把控保留几个关键点就够了

Readest 的验收规则要求：

1. 行为变更要有回归测试：换回旧代码后，测试必须因目标行为不正确而失败；编译错误或跳过不算。
2. 在报告人的实际平台与使用入口验证；做不到就明确说明。
3. 列出跑过和没跑的检查，不能把未验证部分省略。
4. 只合并最终审过的版本；UI 改动检查相关模式与设备形态。

文档等没有可测试行为的变更，说明检查方式即可，不必机械增加测试。CodeRabbit 在这里提供额外审查，Agent 负责验证和处理发现。[8]

## 7. “跑了一天效果很好”具体证明了什么

作者报告：第一天为六个 issue 创建了修复 PR，其中两个是部分修复；回应了五个功能请求或问题，并修复了 CodeRabbit 发现的内存泄漏。这些是作者自述，不是独立效率评测。[1]

公开 PR 的验证记录更具体：GitHub triage 和 PR watcher 已实跑；`watch-social` 尚未实跑；`nightly-review` 完成了生成教训的初始复盘，但尚未作为持续循环验证。因此，目前最有直接运行证据的是 GitHub 维护链路。[2]

## 8. 如何简单借鉴

下面是基于上述实践的建议，不是原作者逐字配置：

- **先开一个工作循环。** 指定当前目标或待处理范围，让 Agent 自己调查、实现和测试。
- **复用现有环境和检查。** 准备好能运行产品的环境、测试命令和相关权限，不先搭新平台。
- **加一个每日复盘。** 只记有证据、会影响以后做法的教训；下轮启动时读取。
- **按需增加 reviewer 与社交入口。** 有待审改动时独立审查；确实有社区反馈要处理时再开社交循环。
- **报告只写变化。** 本轮做成什么、还差什么、哪里需要人决定；没有新工作时结束，不制造任务。

Goal 提供方向和完成条件，schedule/loop 负责再次唤醒，测试与 review 提供反馈，LESSONS 保存经验。这几个部件就能构成最小闭环。Readest 公布的是 `/loop` 工作流，并没有要求必须使用名为 `/goal` 的命令。

Readest PR 给出的启动示例是每个 loop 一个会话：

```text
/loop 30m /triage-github
/loop /watch-social
/loop /nightly-review
```

这三个 skill 是 Readest 自定义的，复制命令前需要安装或改写对应 skill，并配置所需工具与 Reply Desk；它们不是所有 Agent 内置的通用命令。[2]

## 来源与核对范围

本次读取了原帖、PR 描述以及 Readest 当前公开的三个 skill 和验收文件。PR 描述部分路径写作 `.agents/rules/acceptance.md`，实际读取到的文件位于 `.claude/rules/acceptance.md`；落地时应以仓库文件为准。以下 main 链接内容可能继续变化。

1. [Huang Xin：Readest 第一天实践](https://x.com/hwangxin/status/2110372702825710021)
2. [Readest PR #6796：维护循环、Reply Desk 与验收规则](https://github.com/readest/readest/pull/6796)
3. [yetone：原始工作流说明](https://x.com/yetone/status/2109855710444237018)
4. [yetone：提供真实运行环境](https://x.com/yetone/status/2109856834010132602)
5. [triage-github skill](https://github.com/readest/readest/blob/main/apps/readest-app/.claude/skills/triage-github/SKILL.md)
6. [watch-social skill](https://github.com/readest/readest/blob/main/apps/readest-app/.claude/skills/watch-social/SKILL.md)
7. [nightly-review skill](https://github.com/readest/readest/blob/main/apps/readest-app/.claude/skills/nightly-review/SKILL.md)
8. [验收规则 acceptance.md](https://github.com/readest/readest/blob/main/apps/readest-app/.claude/rules/acceptance.md)
9. [WquGuru：magpie 工作流拆解](https://x.com/wquguru/status/2109650264601117141)
