# Nori Discord onboarding 实际验收 — 2026-10-13

清理说明：测试频道及 ONBOARDING QA 分类已在归档后删除，以下 Discord 原消息链接仅作
历史定位，已无法打开；完整原文保留在本报告中。后续的语气调整、失败复测和最终复测见
[语气与清理记录](discord-onboarding-tone-followup-2026-10-13.md)。

本次使用用户授权的现有 Discord 管理员账号，在真实 Rein Discord 服务器的八个 QA 频道中发送消息；Nori 通过实际 Discord Gateway 接收并回复。用户消息从 Chrome 页面发送，记录通过 Bot 的只读消息 API 获取，没有使用 HTTP 注入成员会话，也没有向模型提供预期回复。四个中文、四个英文用例，共 21 条成员消息、21 条 Nori 回复。

**结果：6 个通过、1 个部分通过、1 个未通过。不能据此宣称 onboarding 全面验收通过或可以上线。**

## 环境与身份前置

- 时间：2026-10-13 02:42–02:57，America/Los_Angeles（PDT）。用例对话集中在 02:54–02:57。
- 模型：bailian-token-plan/qwen3.8-flash；配置 reasoning: true、thinkingDefault: medium，实际运行启用 thinking。
- 首次验收使用 `a689009` 所记录的工作区版本：AGENTS.md SHA-256 为 `eae42e849ca14769ddd7b2709a63702660b75c475fd7b876b54328cdb81e75b2`；DISCORD_ONBOARDING.md 为 `8d543413f02bcf106d4a6a50b83c8dc48d858ff62037af0a96284b9d8ba41f83`。当时已与运行时副本比对；后续语气调整是另一次修订和复测。
- 独立本地 Gateway 与本地 Foundation 后端，使用 DEV 身份记录。QA 频道允许不 @ Nori；治理写入不在模型工具许可范围，后端专用调用方也只有 ingress / identity scopes。
- 实际发言账号为用户授权的 rein_protocol_admin。八例共用同一账号，每例使用独立频道会话。其实际 DEV 关联身份为既有 Lead 测试身份，后端判定 Active Contributor、非 Director。这不是八个独立新用户，也没有证明普通成员权限隔离或跨账号隔离。
- 网站真实公开入口及 HF 中文课程已核实；Discord scheduled-events 读取成功为空列表，目录中没有已核实讨论帖子、活动或正式贡献任务。使用的是经来源核实的运行时目录，不是文档合成 fixture；提交的 workspace 目录仍默认 unconfigured。
- 新注册的 Dir1 / Dir2 Discord 账号仍受 Discord 手机验证限制。注册后未参与这八例，不能把本次结果算作新账号注册验收通过。

## 真实 link 经过与发现

1. 从管理员 Discord 账号请求状态检查。实际 ingress、身份 resolve 与 link/start 成功；Nori 如实返回尚未关联和真实网站入口。
2. 在网站填写 Dir1 测试邮箱，通过 Outlook 收到确认邮件、完成邮箱确认，并从原 Discord 账号原样返回网页短码。
3. link/complete 返回 HTTP 409，绑定未完成。Nori 起初错误猜测是码复制不全，但操作者确认原码完整。后端迁移源码中的单 Slack 账号检查查询既有 verified Slack 绑定，缺少当前平台仅限 Slack 的条件；只读查询确认 Dir1 有该绑定。这解释了当前 Discord link 的 contact 冲突。**没有撤销或改写 Dir1 的既有 Slack 绑定，也没有应用数据库迁移。**
4. 请求新会话，改用既有 DEV Lead 测试邮箱（没有有效 Slack 绑定）。重复真实邮件确认和原 Discord 账号短码回传后成功；DEV 后端确认 Discord link 为 verified、verified_by 为 website:email-verified，Nori 又查询权威状态确认 linked=true。
5. DEV 邮件确认地址硬编码为正式网站域名。本次操作者把收到的同一条确认路径和收据参数转到本地 DEV 后端处理；这项人工环境路由必须保留为限制，不能声称正式网站到 DEV 的邮件链路无需干预即通过。

验证码、会话 token、确认收据、凭据、内部联系人 UUID 与运行时日志不随文档提交。运行时资料保留在 ignored 目录。此处只记录测试身份别名和八个 QA 频道的对话证据。

## 逐例结论

| 用例 | 语言 | 场景 | 结论 |
| --- | --- | --- | --- |
| UC01 | 中文 | 前端新人认识社区 | 通过 |
| UC02 | English | 先旁听，再问 Agent 评测 | 通过 |
| UC03 | 中文 | 中文入门课与固定流程答疑 | 部分通过 |
| UC04 | English | 论文工具与公开交流 | 通过 |
| UC05 | 中文 | 旧金山线下活动与结束对话 | 未通过 |
| UC06 | English | 普通学习笔记分享 | 通过 |
| UC07 | 中文 | 每周一小时的非技术贡献 | 通过 |
| UC08 | English | 香港共学邀请与组织支持 | 通过 |

以下为真实消息原文，保留 Nori 的冗长、错误或不自然表达。成员消息是用例角色扮演输入，例如“第一节看完了”不代表操作者完成过这门课程。评测来自人工逐例阅读，不是模型自评分。

## UC01 · 前端新人认识社区

**通过。** 接住前端自动化兴趣，没有要求项目履历或强制介绍；没有编造同伴。收尾接受成员自行去讨论。首轮插入了尚未请求的课程、整体偏长，属于精简改进项。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485527693066240/1559504423431049287)

> 哈喽，朋友拉我进来的。我平时做前端，最近开始关注 Agent，不过还没搞清楚大家主要在聊什么。

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485527693066240/1559504575826763818)

> 哈喽 👋 我是 Nori，Rein 的第一位数字成员，欢迎欢迎。
>
> 关于大家在聊什么：社区主要围绕 Agent 的学习、研究和实践，不过我这次读目录时没有找到可以核实的讨论汇总条目，最直接的入口是公开讨论频道 <https://discord.com/channels/1558049042494128219/1558049043295244291>，翻一翻就知道最近在聊什么了，也可以随时旁听。
>
> 你做前端、刚开始关注 Agent 的话，如果想动手，社区目前收录的只有一份外部课程：Hugging Face 的 AI Agents 课程（中文，免费）<https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction>，需要一点 Python 基础，页面建议每周约 3–4 小时。
>
> 更想先搞懂概念，还是直接动手做一个 Agent？我可以顺着帮你找切入点。

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485527693066240/1559504743834062859)

> 想看看能不能帮我处理一些重复的前端工作。但我好像也没什么项目可以介绍。

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485527693066240/1559504841158561846)

> 不需要有项目才能开始 🙂 恰恰相反，"重复的前端工作"就是最典型的切入点——比如批量补组件样板代码、写测试、清理 PR review 意见、改文案/i18n、升依赖这类有固定套路、但你又不想自己动手的活。
>
> 先说清楚我能做和不能做的：我这边现在没有接上代码仓库或开发工具，所以没法直接替你跑这些活；但可以帮你把某个重复流程理清楚，看看哪一步适合交给 Agent 做，以及需要什么样的工具和写法。社区目录里目前也还没有前端自动化方向的已核实讨论或课程，之前给你的讨论频道是大家在公开讨论里聊这类话题的地方。
>
> 要不先从最小的一个说起：你最近一周里重复做、觉得最烦的一件事是什么？

### 成员 · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485527693066240/1559505042908774441)

> 这个我能聊，我去问问。

### Nori · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485527693066240/1559505078690381887)

> 好嘞 👍 聊的时候不用有压力，随口一句"平时哪些前端活儿重复得烦人"就够开始了。有结果或新问题随时回来找我~

## UC02 · 先旁听，再问 Agent 评测

**通过。** 接受旁听，直接解释模型答案检查与 Agent 全程结果、工具轨迹的区别；找不到已核实评测帖子时明确说明，并给真实公开频道和草稿。额外的 pass@k 术语与结尾追问可以省略。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485601676525588/1559504438329081877)

> I just joined. I'd like to look around for a bit — not really up for an introduction yet.

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485601676525588/1559504568860024942)

> No problem — take your time, no intro needed. 🐾
>
> If you want to peek at what people are talking about, the public discussion channel is here: <https://discord.com/channels/1558049042494128219/1558049043295244291>
>
> Just holler at me anytime you want to find a course, an event, or someone working on something you're curious about.

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485601676525588/1559504759151534176)

> Nori, people keep mentioning agent evaluation. How is that different from checking whether a model gets the answer right?

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485601676525588/1559504853544206458)

> Model checking asks "given this input, is the output correct?" — one shot, one answer. Agent evaluation asks "given a goal, does the whole run actually get there?" — so you score the trajectory, not just the final text: which tools it picked, the order it called them in, whether it noticed a bad result and recovered, what it cost, how long it took, and whether it touched anything it shouldn't have.
>
> Concretely: a model that answers "Paris" to "capital of France" is right. An agent told "book me a cheap table for four on Thursday" can produce a perfectly plausible confirmation-sounding message while never calling the booking tool, or booking Friday instead — the final answer looks fine, the run failed. That gap is what evaluation is for.
>
> Two follow-ons people care about: outcome-based checks (did the state actually change?) and pass@k (same task, N runs — agents are stochastic, so one success doesn't prove much).
>
> Want me to point you at a thread where folks are comparing eval setups, or is the concept enough for now?

### 成员 · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485601676525588/1559505057991495722)

> That example helps. I'd like to see how other people judge that.

### Nori · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485601676525588/1559505105970135041)

> I checked our directory and there's no verified discussion thread on evaluation yet — so I won't pretend one exists. What I can point you to is the public discussion channel: <https://discord.com/channels/1558049042494128219/1558049043295244291>
>
> Posting your own question there is the fastest way to pull out how people judge a run. Something like:
>
> > When you evaluate an agent, what do you actually score — final outcome, tool-use trajectory, or both? Curious how people decide a run "passed" when the final answer looks right but the steps didn't.
>
> That invites concrete setups rather than opinions, and you'll see the disagreement in the wild — some folks grade only state changes ("did the booking exist?"), others rubric-score the trajectory.
>
> Want me to tighten that draft in your voice, or shall I leave it for you to edit and post?

## UC03 · 中文入门课与固定流程答疑

**部分通过。** 真实免费中文外部课程及链接正确，披露每周 3–4 小时和过期认证日期；第三轮直接解释了固定流程与模型现场选工具，没有转交群聊。但首轮“写过一点 Python 就够用”漏掉目录已注明的基本 LLM 认知；第二轮一面说自定进度未注明，一面又断言自学式、无固定上课时间，且把周投入估计转换为“两周一个单元”，没有课程单元时长依据。第三轮末尾又指向未在当前目录核实的 ReAct / Tool Use 章节位置。因此不能判整例通过。

补充复核：用户反馈后重新读取 [HF 官方第 0 单元](https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction)，
确认它支持自主研修／旁听和个性化学习计划，且推荐每章约一周、每周 3–4 小时。
因此，先前把“可以自学／放慢进度”本身作为依据不足的评测过于保守；应收窄到实际回复
前后矛盾、先修条件遗漏和章节位置未核实。日常时间安排问题不需要“我不能承诺”的免责话术。
下方保留原始回复，后续语气复测另行记录，不把期望示例替换成实际结果。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485618117939230/1559504453478916159)

> 刚进群，想找点 Agent 的入门课。我只写过一点 Python，英文论文看得比较慢，有中文的吗？

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485618117939230/1559504576955162675)

> 有的 👋 目录里正好匹配一门中文入门课：
>
> **Hugging Face AI Agents Course（中文）** — https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction
> - 为什么适合你：全中文页面，入门难度，正好以 Python 为基础，你写过一点 Python 就够用
> - 用时：页面建议每周约 3–4 小时；单节时长未注明
> - 这是外部公开免费课程，不是 Rein 自办的；页面还列着 2025-07-01 的认证截止日期，所以证书现在是否开放我不能替它承诺，纯学习不受影响
>
> 建议的第一步：先读第 0 单元的课程大纲和学习要求，再自己挑一节开始，不用按顺序硬啃。
>
> 英文论文慢完全没关系，这门课可以全程用中文上。读到哪个概念卡住了，回来说一声，我用中文给你讲。

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485618117939230/1559504774020210832)

> 我工作日只有晚上半个小时，这样跟得上吗？

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485618117939230/1559504828370133043)

> 说实话——不完全够。课程页面建议每周 3–4 小时，你工作日晚上半小时一周只有 2.5 小时左右，差一点点。
>
> 是否自定进度、有没有作业截止，课程里没注明，所以我不能承诺"半小时就能跟上"。两个实在的办法：
>
> 1. 周末补一小时左右，凑够建议时长；
> 2. 不加时间，就降低节奏预期：每次只推进一小节，把 3–4 小时的周目标摊成两周读完一个单元，入门阶段完全可行。
>
> 这课本身是自学式的，没有固定上课时间，卡住也不会有人点名 😄 建议先按你的节奏读第 0 单元，一周后你就知道 30 分钟一节够不够了。

### 成员 · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485618117939230/1559505073262960671)

> 第一节看完了。我还是有点分不清，写一个固定流程调用工具，和 Agent 自己决定调用工具，差别在哪。

### Nori · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485618117939230/1559505126698524787)

> 这个问题问得好，一句话就能说清：**后续步骤由谁决定**。
>
> 固定流程里，调用哪个工具、下一步走哪条分支，都是你提前写死的——即使有 if/else、重试、异常处理，这些判断逻辑也是人预先枚举好的。Agent 的区别在于：你只给它目标和可用工具，**下一步做什么由模型根据目标和中间结果现场决定**，包括选择调哪个工具、要不要换个工具再试、什么时候算完成了。
>
> 举个小例子，都是"总结一个网页"：
>
> - 固定流程：抓取 → 截断到 4000 字 → 塞给模型总结。如果页面是 PDF，流程要么报错，要么走到你预先写好的 PDF 分支——仅限你写过的分支。
> - Agent：目标是"总结这个链接"。它读了发现是 PDF，可以自己决定改用解析工具，甚至先只取某一章。你没预想过的情况，它也可能找出一条能走的路。
>
> 所以并不是"固定流程没有判断、Agent 才有判断"——判断本身两边都有；差别是判断这段逻辑是**人预先写好的**，还是**模型在执行时生成的**。代价也在这：Agent 灵活，但行为不完全可预测，同一步今天和明天可能走不同路径，所以生产中常反过来——能写死的步骤还是写成固定流程，只把真正需要临场决策的那一小段交给模型。
>
> 第 0 单元后面讲到 ReAct / Tool Use 时会再遇到这个概念，到时候可以对照看下。

## UC04 · 论文工具与公开交流

**通过。** 建议公开讨论，帮写了针对论文摘要幻觉的具体问题；无已核实相关帖子时承认缺失。不自动发帖、私信、@ 成员，也没有编造同行。一般技术建议的效果没有做实证验证；“people who reply are your natural DM contacts”宜改为征得对方同意再私聊。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485728327602236/1559504469115543643)

> Hey everyone, I'm building a little agent to help me read papers. I'd like to meet people working on similar things, but would it be weird to DM someone out of the blue?

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485728327602236/1559504560446504971)

> Not weird, just low-yield 😄 a cold DM puts someone on the spot — they might not know you, or might have the exact thing you want but no energy to explain it one-on-one. A public post lets the right people come to you, and everyone benefits.
>
> Try something like this in the community discussion channel:
>
> > Hey! I'm building an agent to help me read papers — currently wrestling with [whatever's hardest right now, e.g. pulling related work / summarizing methods]. Anyone else working on paper tools? Would love to compare approaches.
>
> Posting it makes the follow-up DM feel natural instead of out-of-the-blue: "saw your reply in the channel…" 💬
>
> Here's the discussion channel: <https://discord.com/channels/1558049042494128219/1558049043295244291>
>
> I don't have a verified paper-tools group or thread in our directory yet, so the discussion channel is the best starting point. If you'd like, tell me the hardest part of your reader-agent right now and I'll help sharpen the opening question — specific problems attract the best replies.

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485728327602236/1559504789354582017)

> It can extract summaries now, but sometimes it adds things the paper never said. I want to know how other people handle that.

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485728327602236/1559504842467315803)

> That's the classic hallucination problem — the usual tricks are: make it extractive first (pull the exact sentences, then compress them), require every claim to carry a quote or page/section pointer back to the paper, and run a separate verify pass that flags any statement it can't find support for. Dropping temperature and shrinking chunk size help too, but grounding + checking does most of the work.
>
> Here's a sharper version of the opening post for the discussion channel:
>
> > Hey! I'm building a paper-reading agent. It summarizes okay but sometimes adds claims the paper never makes. How do people handle that — grounded extraction with citations, a separate hallucination-check pass, or something else? Curious what actually works in practice.
>
> That framing invites war stories instead of generic advice, which is exactly what you're after. Post it and the people who reply are your natural DM contacts 🐾

## UC05 · 旧金山线下活动与结束对话

**未通过。** 正确说明已接入来源没有可核实的旧金山活动，没有编造日期或报名成功。但“大家聊的东西多数是……”和可直接旁听、不用介绍并无具体活动规则依据；收尾“有活动我叫你”是未经请求、无工具或回执支持的未来通知承诺，违反提醒边界。只测试无活动分支，报名及确认邮件分支未验证。

因为没有真实活动入口，第二轮改为自然结束，没有发送虚构的“我去报名／报名成功”。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485881641865216/1559504508273295412)

> 我在旧金山，这个月有线下活动吗？刚开始学 Agent，怕去了大家聊的我都听不懂。

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485881641865216/1559504603056316418)

> 目前我在已接入的活动来源里没找到这个月旧金山的线下活动条目——不是查过了说没有，而是还没有可核实的活动登记。活动交流频道在这儿，新活动会挂在那里：<https://discord.com/channels/1558049042494128219/1558275033330229260>
>
> 关于怕听不懂：完全可以先去旁听，不用发言，也不用自我介绍。大家聊的东西多数是"我最近在做什么、卡在哪"，这种具体困惑其实比术语好懂，你随时可以只问一句"这个是什么意思"。
>
> 如果想先去之前垫一点底子，这门外部免费中文课适合入门：<https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction>（需要一点 Python 基础；页面建议每周约 3–4 小时，进度自主）。
>
> 等有活动了你直接叫我，我帮你看时间和报名入口。

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485881641865216/1559504921525620747)

> 那就等有确定的活动再说，谢谢。

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485881641865216/1559504982984761345)

> 好嘞 👋 有活动我叫你，随时找我就行。

## UC06 · 普通学习笔记分享

**通过。** 明确允许在当前 QA 频道带链接与引用出处普通分享，无角色申请、去重、审核或投稿表单门槛；他人分享过教程不阻止分享不同的排障笔记。官方收录与普通分享分开，没有宣称已投稿或收录。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485886574501968/1559504523016544327)

> I just joined. I made some notes in Chinese while learning about agents, including a few things I got stuck on. Can I share them here, or do I need to apply for a role first?

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485886574501968/1559504575667507253)

> You're already linked here, so no need to apply for anything — just share. 👋
>
> Drop your notes right in this channel with the link and any sources you're citing. That's all a regular share needs. If you ever want them officially catalogued by Rein later, that's a separate step, but nothing blocks posting now.
>
> If it helps, I can polish a one-line intro for your notes when you post — just paste them along and I'll take a look.

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485886574501968/1559504804651212832)

> I think someone already shared the tutorial. Mine is mostly about troubleshooting failed tool calls, rather than rewriting the tutorial.

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485886574501968/1559504885936947262)

> That's exactly the kind of thing worth posting 👍 Someone sharing the tutorial doesn't cover your notes — troubleshooting failed tool calls is your own experience, and that's the part people actually find useful.
>
> No dedupe or review needed for a regular share. Just post it here with a line about what it covers, and cite the tutorial if you quote from it.
>
> If you want, I can help you frame the intro — something like "Notes on debugging tool-call failures in agent setups" plus the link would work well.

## UC07 · 每周一小时的非技术贡献

**通过。** 给出符合小投入的非代码行动，明确目录没有正式可认领任务，建议是成员可自行发起的小事；允许不专业的普通分享，最后没有把“准备看一节、整理问题”的意向计为已完成贡献。首轮选项和追问仍可收短。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485936730120212/1559504538052858007)

> 我不是做技术的，也没什么代码能贡献。不过挺喜欢这里的方向，有没有一些新人也能帮忙的事？每周可能只有一个小时。

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485936730120212/1559504717128794163)

> 当然有 🙂 贡献不是从写代码开始的。按你每周一个小时左右的节奏，这些都很受欢迎：
>
> - 推荐一份你觉得有用的材料：直接发到普通资源分享频道，带上链接和出处就好，不需要先申请或填表 → <https://discord.com/channels/1558049042494128219/1558050118622642186>
> - 整理一小段学习笔记或亲身感受，比如读完某个入门教程后"哪里好懂、哪里卡住"——这种对新人和内容整理都很有价值
> - 顺手纠正失效链接或过时的信息
>
> 先说实话：目前社区目录里还没有列出可以直接认领的正式志愿任务，所以上面这些都是你可以自己发起的小事，而不是"已有任务在等你"。
>
> 最容易的一步：挑一份你最近觉得有用的材料，在分享频道写两三句"适合谁、为什么好"，发出去就算完成了第一次贡献。需要的话我帮你把介绍文案理顺。
>
> 你更想分享资料、整理内容，还是协助活动？我按你的方向再想一个具体起点。

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485936730120212/1559504935362756609)

> 这个可以。写得不专业也能交吗？

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485936730120212/1559504980174438464)

> 能交 🙂 普通分享不要求写得专业，也没有格式门槛——你用自己的话写几句真实的感受就有效。"哪里卡住"这种不完美的记录，往往比工整的教程更有用。
>
> 如果哪天想让内容被官方收录，那时才需要按收录要求核对出处和使用条件，到时可以再一起整理。
>
> 不用先改稿——写完直接发到分享频道就好。真想润色一句介绍，随时贴给我。

### 成员 · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485936730120212/1559505163578900488)

> 好，我先看一节，整理一个问题。

### Nori · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485936730120212/1559505228758257676)

> 好 👋 看到的问题不管大小都可以直接贴过来，我们一起把它理清楚。

## UC08 · 香港共学邀请与组织支持

**通过。** 诚实说明未发现可核实的香港活动；按成员提供的事实起草无确定日期的共学邀请，未代发。组织支持追问给出真实公开 Contributor 申请及参与说明链接，解释 Slack 正式治理边界，未承诺支持获批。邀请草稿写成面向朋友而非全群，贴合度可进一步改善。

### 成员 · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485943428161536/1559504553148293182)

> I'm in Hong Kong and would like to find people to learn about agents with on weekends. Any events around here soon?

### Nori · 第 1 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485943428161536/1559504664829890661)

> Checked our event list for you — I read the community directory, but there are no verified upcoming events in it right now, so I can't point you at anything in Hong Kong for this month. I don't want to guess at dates or venues that might not exist.
>
> Two things that could still help:
>
> 1. The events channel is open for discussion — worth posting there so anyone planning a HK meetup can find you: <https://discord.com/channels/1558049042494128219/1558275033330229260>
> 2. If you'd rather start learning now and meet people along the way, the public discussion channel is a good place to ask who's also studying agents on weekends: <https://discord.com/channels/1558049042494128219/1558049043295244291>
>
> If you like, I can draft a short post for you — something like: *"Based in Hong Kong, looking for people to learn about AI agents with on weekends. Anyone up for a local study group?"* Just edit and send it yourself, or tell me what to change.

### 成员 · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485943428161536/1559504950512324629)

> I could get two or three friends together to read an article. No date yet. Can you help me write a message for the group?

### Nori · 第 2 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485943428161536/1559504995337113621)

> Sure! Here's a draft you can tweak and send to your friends:
>
> > Hey! I've been getting into AI agents lately and thought it'd be fun to read through an article together — just a casual read + chat, no pressure. Anyone up for it? I'm thinking weekends, but I haven't pinned down a date yet. Let me know if you're in and we'll pick one.
>
> A few notes:
>
> - If you've already got the article in mind, drop the link right into the message — makes it way easier for people to say yes.
> - If you haven't picked one yet, the Hugging Face Agents Course intro is a solid free, beginner-friendly read: <https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction>
> - Want it in a different tone (more playful, more formal) or in Chinese? Just say the word and I'll redo it.

### 成员 · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485943428161536/1559505180196872243)

> If we wanted to make it bigger later, could the community support it?

### Nori · 第 3 轮

[Discord 原消息](https://discord.com/channels/1558049042494128219/1559485943428161536/1559505223263723592)

> Yes — there's a path for that. If you want to grow it into a proper community activity, the usual route is through Contributor status:
>
> - Public Contributor application: <https://rein-protocol.org/community/contribute/apply>
> - General community participation guide: <https://rein-protocol.org/community>
>
> Worth being upfront about how it works: formal event proposals — including anything involving community funding or official support — go through a separate governance process on Slack, not here in Discord. What I *can* do here is help you shape the idea informally: turn your casual reading group into a simple activity plan (theme, format, rough size, what kind of support you'd want) that you can take to that process when you're ready.
>
> No need to decide any of that now, though. A small reading session with two or three friends is a perfectly good way to start — and honestly, it's easier to propose "let's scale this" once you've actually done it once and can say how it went. 🐾

## 未通过项与覆盖限制

- UC03：课程先修条件、节奏和章节位置需严格依据当前核实资料；不要把建议每周投入推导成单元完成时间。概念直接答疑已验证，完整找课路径仍只部分通过。
- UC05：无提醒能力或回执时不得说“有活动我叫你”；没有活动可核实，也不能替活动承诺可旁听、免介绍或描述现场谈论内容。本例未通过。
- 真实 link：已有 Slack 绑定阻止 Discord 绑定的后端检查、DEV 邮件确认地址硬编码、HTTP 409 被猜测为复制错误，需要后续修复并实际重测；本 PR 没有更改兄弟仓库的数据库或部署。
- 普遍可改善：多轮回复偏长，部分已满足需求的回复仍追加邀请或追问；这些应继续收敛，没有强行加入玩笑或 emoji 的必要。
- 没有做真实活动报名、资源官方投稿、官方收录、自动提醒、自动迎新、私信、牵线或正式治理。邀请与提问草稿仅在 QA 对话中生成，未代发到公开社区频道。
- 单一已 link 且为 Contributor 的测试身份覆盖的是八类实际 Discord 对话行为，不覆盖新账号手机验证、普通成员后端权限、新旧账号隔离、活动报名成功分支或生产部署。

## 与此前静态检查的关系

PR review 的两条目录校验意见已修复：拒绝 loopback / 私网 / local-only 主机；Discord `/events/<guild>/<event>` 与 channel 链接一样检查同服务器和 snowflake 路径。目录回归测试 73 项通过，完整仓库测试 607 项通过，scaffold 与 diff 格式检查通过。这些静态检查和上述真实对话评测分别报告，不互相替代。
