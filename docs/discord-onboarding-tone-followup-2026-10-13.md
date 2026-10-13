# Nori 语气、简洁度与测试频道清理 — 2026-10-13

按用户反馈调整日常对话：先回答实际问题，通常两到四个短句；给大致判断与一个实用建议，不把学习安排问题说成对 Nori 的保证要求。保持资料核实，但把核实过程、工具清单和无关资格说明留在内部。正式治理、身份验证与实际写入仍遵守原有边界。

## 修改与事实校正

- 在 SOUL.md 和 Discord 默认指引中明确简短、自然的社区同伴语气；概念问题先讲核心区别，再给一个短例子。参考长度用于编辑，复杂问题按需展开，不机械截断。
- 中英文 UC03 示例改为讨论时间安排、周末补时和慢一些读，不再使用“I cannot promise／我不能保证”。证书和考核安排在成员问到时再解释，不抢占学习时间问题。
- 重新读取 [HF 官方课程说明](https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction)：支持自主研修／旁听及个性化学习计划，推荐每章约一周、每周3–4小时。旧运行时目录漏了自主学习的信息，现已补齐；旧报告中对此的过度保守评测附有纠正说明。
- 已提供的链接和先修条件不在普通追问中反复重贴；只在影响当前选择时提及未知信息。

## 真实 Discord 定向复测

复用原 UC03 一个 QA 频道，没有新增频道。成员消息全部从 Chrome 的真实 Discord 账号发送，Nori 通过实际 Gateway 回复；沿用真实 DEV link、Qwen 3.8 Flash 和 thinking=medium。共9个问答回合，完整保留最初未改善及中间仍偏长的回复，不只挑选成功样例。聊天里尝试的 /new 没有收到重置确认，因此操作者改用本地 Gateway 支持的 sessions.reset，并确认返回成功；该控制操作只重置模型会话上下文，没有伪造成员业务消息或改动后台 link。

前6个回合用于定位旧上下文与默认指引问题；最后3个回合使用最终指引。最终三次回复均直接回答，未出现常规免责表述或无能力支持的未来通知承诺。短期少量复测不能证明所有未来回复都会遵循语气或长度。

| 对比 | 首次八例回复 | 最终定向复测 |
| --- | --- | --- |
| 中文课程时间安排 | 230 字符 | 117 字符 |
| 英文 Agent 评测解释 | 178 词 | 81 词 |

字符数去除链接和空白，英文按空白分词；问题措辞相近，未作随机对照。长度数字只用于查看是否收短，不能代替人工评测。自然结束为：“好呀，不急，想看了再来找我就好 🐾”

## 频道清理

已归档原八例42条消息及本轮复测，核对只有授权测试账号与 Nori 发言后，删除 nori-uc01-zh 至 nori-uc08-en 共8个临时频道及 ONBOARDING QA 分类。Discord 只读接口确认这些 ID 已不存在；ask-nori、general、resources 等正常频道保留。已移除本地 Gateway、业务上下文和专用 DEV 调用方中的测试频道许可，保留正常 ask-nori 入口。

旧报告和以下消息 ID 用于历史定位；频道删除后原 Discord 消息链接无法打开，完整原文保留在版本库报告中。后续验收复用单个授权测试频道并按需重置会话，归档后及时清理。

## 完整复测原文

### 1. 旧会话中的首条复测：仍未达到要求

仍出现“我不能说稳过”及“课程安排未注明”的旧表述，保留为失败证据。

**成员** · 2026-10-13T19:09:57.582000+00:00 · 消息 1559644382511108228

> 我工作日只有晚上半个小时，这样跟得上这门 HF 的课吗？

**Nori** · 2026-10-13T19:10:07.600000+00:00 · 消息 1559644424529772656

> 跟得上，但节奏要按你自己来 😄 课程建议每周 3–4 小时，你工作日每晚半小时约有 2.5 小时，差的那点可以周末补一小时，或者干脆把周目标摊成两周完成一个单元——自学课程没人催进度，卡住也不会错过什么。
>
> 是否自定进度、有无作业截止，课程页面没注明，所以我不能说"稳过"。实际建议：先按每晚一小节读两三天，你自己就能感觉到 30 分钟够不够用，再决定要不要调整节奏。


### 2. 首次重置后：中文时间安排

说明推荐节奏与自主学习，没有免责表述；仍重贴链接和建议第0单元，可继续收短。

**成员** · 2026-10-13T19:12:55.220000+00:00 · 消息 1559645127578882099

> 我想学 Hugging Face 的中文 Agent 课程，不过工作日只有晚上半个小时，这样跟得上吗？

**Nori** · 2026-10-13T19:13:14.423000+00:00 · 消息 1559645208122232897

> 跟得上的～这门课支持自主研修，"每章一周、每周 3–4 小时"只是推荐节奏，不是最低要求。你工作日每晚半小时大概攒到 2.5 小时，周末稍微补一点或者读慢一些都行。<https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction> 建议先看看第 0 单元的大纲和学习要求，再按自己的时间安排路径（需要一点 Python 基础）。


### 3. 首次重置后：英文时间安排

直接给周末补时或慢一些读的选择，没有免责声明；已给过的入口仍重复一次。

**成员** · 2026-10-13T19:13:47.130000+00:00 · 消息 1559645345305075775

> I only have half an hour on weekday evenings for the HF agents course. Is that enough, or should I make more time?

**Nori** · 2026-10-13T19:13:55.461000+00:00 · 消息 1559645380247818361

> That's fine — the course supports self-paced study, so "3–4 hours a week" is a suggestion, not a requirement. Your weekday routine gives about 2.5 hours; if you want to stay closer to the recommended pace, add a little on weekends, or just let each chapter take a bit longer. No need to force more time in — start with the Unit 0 outline and see how one lesson actually feels: <https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction>


### 4. 中间版本：中文概念解释仍偏长

虽然篇幅比首次八例短，仍把分支、重试等背景放在核心答案前，未达到理想的简洁程度。

**成员** · 2026-10-13T19:14:35.959000+00:00 · 消息 1559645550108741763

> 固定流程调用工具，和 Agent 自己决定调用工具，到底有什么区别？

**Nori** · 2026-10-13T19:14:43.445000+00:00 · 消息 1559645581507305492

> 区别不在有没有条件判断——固定流程照样可以预设分支、重试和失败处理。关键在于下一步是谁决定的：固定流程里，所有可能的路径都是人提前写死的；Agent 则是由模型看着目标和中间结果，当场决定接下来调哪个工具、要不要换个做法。
>
> 举个例子：天气流程写死"下雨就推荐室内活动"，这是固定流程；而你说"帮我安排周六的户外活动"，它自己查天气、发现下雨后决定改查室内场地——后续动作没被预先枚举，这就是 Agent 在决定。


### 5. 中间版本：英文普通分享已简短直接

两句允许普通分享，说明链接与出处，没有角色申请、投稿或去重门槛。

**成员** · 2026-10-13T19:16:03.045000+00:00 · 消息 1559645915374161941

> I made some learning notes in Chinese. Can I share them here, or do I need a role first?

**Nori** · 2026-10-13T19:16:11.521000+00:00 · 消息 1559645950925086761

> Of course, just post them here — no role or Contributor application needed for sharing. Add the link and your sources if you referenced any, and I'm happy to help polish a one-line intro if you want.


### 6. 中间版本：英文概念解释仍偏长

仍有较长例子及额外展开，促使把简洁要求加入默认 Discord 指引，而非只写在深层流程中。

**成员** · 2026-10-13T19:16:22.838000+00:00 · 消息 1559645998391890064

> How is evaluating an agent different from checking whether a model gives the right answer?

**Nori** · 2026-10-13T19:16:29.119000+00:00 · 消息 1559646024736186459

> Checking a model's answer looks at one input–output pair: given this prompt, is the response correct? Evaluating an agent looks at the whole trajectory — whether it picked sensible tools, handled intermediate results, recovered from errors, and actually reached the goal.
>
> For example, a model can answer "what's 23×47" correctly; an agent asked "book me a table near the venue" might get the right end result via a wrong path (booking the wrong restaurant and cancelling), or fail even with perfect answers at each step because it never checked opening hours. So agent evals score steps, tool calls, and outcomes over multiple turns, not just final text — which is why they're harder and often run on tasks with many possible valid paths.


### 7. 最终指引：中文时间安排

三句说明推荐投入与自主节奏，并给实际时间安排建议；没有把推荐时长说成必须达标，也没有“不能承诺”的免责段。

**成员** · 2026-10-13T19:18:00.416000+00:00 · 消息 1559646407663558691

> 我想学 HF 的中文 Agent 课，工作日每晚只有半小时，这样跟得上吗？

**Nori** · 2026-10-13T19:18:21.968000+00:00 · 消息 1559646498059456623

> 跟得上～这门课推荐每章约一周、每周 3–4 小时，你工作日每晚半小时一周大概 2.5 小时，稍低于推荐值，但课程支持自主研修，不必按推荐节奏赶。要么周末补一点，要么每章多花几天，都完全可以。建议先从第 0 单元的大纲看起，选好自己的节奏再往下读：<https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction>


### 8. 最终指引：英文概念解释

三句先给核心区别，再举一个任务失败的短例子；没有额外术语、列表或结尾追问。

**成员** · 2026-10-13T19:18:52.485000+00:00 · 消息 1559646626057035839

> How is evaluating an agent different from checking whether a model gives the right answer?

**Nori** · 2026-10-13T19:19:10.378000+00:00 · 消息 1559646701105455174

> Checking a model answer is one step: given input A, did it output the right answer B? Evaluating an agent looks at the whole trajectory — whether it planned the right steps, picked and called the right tools, and actually reached the goal. Example: a model can correctly answer "what's tomorrow's date" every time, but an agent asked to "send a reminder for tomorrow" might call the wrong tool or loop, failing the task even though each individual reply looked fine.


### 9. 最终指引：自然结束

一句自然收尾；没有课程推荐、贡献任务、未来通知承诺或自动提醒。

**成员** · 2026-10-13T19:19:36.053000+00:00 · 消息 1559646808794464308

> 那活动我先等等，之后再看看就好，谢谢。

**Nori** · 2026-10-13T19:19:46.473000+00:00 · 消息 1559646852498858047

> 好呀，不急，想看了再来找我就好 🐾

## 被测文件与检查

- AGENTS.md SHA-256：c338376b3fe7eb2c413c6f6bd29d3d7e06f4c9da854fa41ed959b38539adeb77；与最终复测的运行时副本一致。
- SOUL.md SHA-256：c1315624d8e1a923a2f1f1a345b16d180a8779095ea0cbb8f7135aa04565ae1a；与最终复测的运行时副本一致。
- DISCORD_ONBOARDING.md SHA-256：a6248e14f394600785b360e5474f2355ec1070e8cb7350961cb66eae8f38def8；与最终复测的运行时副本一致。

本次修改为工作区对话指引与文档，结构和差异格式检查通过。此前607项仓库测试不作为本次语气通过的证据；原八例初评为6通过、1部分通过、1未通过，后按负责人产品复核修订为八例整体通过。修订来自负责人判断，不是本次少量语气复测建立了额外的隐私、注册或生产验收。
