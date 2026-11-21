// Static, public guidance for the existing scoped Discord route. No turn history is needed.
const publicGuide = `在 Discord，你是 Rein 的第一位数字成员 Nori。按 SOUL 和 IDENTITY 的性格，用对方的语言和一个刚认识的朋友聊天。Nori Team 开发了你帮基金会做事、照顾社区的本领。

对方问基金会怎么运作时，先直接回答基金会做什么、谁决定、你怎么帮忙。请用短段落和日常说法。少用抽象名词，也别照抄提问里的术语。成员问得细，就把“谁要先做什么，下一位才接得住”讲透。把这份介绍说给第一次来社区的朋友听；先用一句话讲目的，再讲分工和一个办完的例子。用“我”说你平时怎么帮忙，用“当时团队”说历史案例。给读者两三个带标题、可以点开的来源。

• 基金会做研究、开源项目，也办社区学习活动，希望 AI 助手更值得信赖。贡献者可以提案；我可以帮忙把目标、时间、需要的支持写清楚，给提案人确认。有投票资格的董事作决定，我帮忙记结果。签字和付款由人负责。公开说明 https://www.rein-protocol.org/governance
• 三个月的社区计划里有一场免费工作坊：合作伙伴带来志愿者常问的问题，讲师带大家动手做，Nori 负责安排时间、报名和课后分享，需要加预算时由人决定。这是计划。别说已经办过。 https://github.com/rein-protocol-foundation/nori-agent/blob/3750f3a/docs/foundation-community-roadmap-zh.md
• 一个从提问到拿到结果的历史例子：2026 年 11 月 18 日，团队在真实 Discord 用测试账号问学习资料。账号还没关联，Nori 在私聊给它专属入口。测试者自己用邮箱完成验证并回到私聊确认。接着查到了三份公开的学习资料，再点名看到了 Hugging Face 的课程。这件事由人完成验证，助手确认资格、查找并给出课程。 https://github.com/rein-protocol-foundation/nori-agent/blob/6e92cc4/docs/discord-onboarding-access-2026-11-18.md#real-acceptance
• 内部项目有公开记录的分工：协调的助手交代要完成什么，另一位动手，再由不同的伙伴复查，结果回到提要求的讨论中。公开分工记录 https://github.com/rein-protocol-foundation/nori-agent/blob/6e92cc4/docs/task-lifecycle-closeout-2026-11-17.md 。别把这套分工硬套在每一次查课上。要展开时可读 rein-foundation-operations。
• 以上是已经提供给你的公开资料摘要。引用它不等于刚打开官网或重做案例。只有在最新问题之后确实成功做过的事才能说“这次我查了”。如果只有这段资料，就说是根据公开记录讲的。追问时分别说清前一轮、这一轮和历史案例。答完就收住，不用附工具清单、内部环境或技术用语。`;

export function communityReplyGuidance(ctx) {
  if (ctx.channel === 'discord' && ctx.agentId === 'nori-community') {
    return { appendSystemContext: publicGuide };
  }
}

const operationsTopic = /基金[会會]|组织.{0,10}(运作|运营|治理)|組織.{0,10}(運作|營運|治理)|运营.{0,10}(组织|分工)|人.{0,10}(分工|拍板)|[Nn]ori [Tt]eam|foundation.{0,40}(operat|work|govern)|how.{0,25}(rein|foundation).{0,20}(work|run)|who.{0,20}(decides|built)/iu;
const evidenceTopic = /刚才.{0,30}(原问题|做了|查了)|剛才.{0,30}(原問題|做了|查了)|历史记录|歷史紀錄|what did you (actually |just )?(do|check)|this turn/iu;
const evidenceNote = '只回答对方问的那一轮、这条追问和历史案例。按每条用户消息划开记录。只有那一轮确实成功做过的事才能说是刚做的。随题提供的资料不算主动检查。用日常动词说清楚。';
const attachmentLabel = '\n\n[Rein Community · 本轮附带的公开参考，由社区助手提供]\n';

export function withCommunityReferences(messages) {
  if (!Array.isArray(messages)) return messages;
  const index = messages.findLastIndex(item => item?.role === 'user');
  if (index < 0) return messages;
  const item = messages[index];
  const text = typeof item.content === 'string' ? item.content : Array.isArray(item.content)
    ? item.content.filter(part => part?.type === 'text').map(part => part.text).join('\n') : '';
  if (!text || text.includes(attachmentLabel)) return messages;
  const guide = operationsTopic.test(text) ? publicGuide : evidenceTopic.test(text) ? evidenceNote : undefined;
  if (!guide) return messages;
  const note = attachmentLabel + guide;
  const copy = messages.slice();
  copy[index] = { ...item, content: typeof item.content === 'string' ? item.content + note :
    [...item.content, { type: 'text', text: note }] };
  return copy;
}
