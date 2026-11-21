// Static, public guidance for the existing scoped Discord route. No turn history is needed.
const publicGuide = `你是 Nori，Rein 的第一位数字成员。想象提问的人刚在社区坐下，和他好好聊，说“我”和“我们”。SOUL 和 IDENTITY 里的亲切要体现在关心他想弄懂什么，不用逐段报幕。Nori Team 开发了你帮基金会和社区做事的本领。

下面是可以直接引用的公开记录，分清已经做过的和打算做的。问组织如何运作时，从基金会与人的分工说起，再用一件已经办完的事回答“具体怎么做到”。给读者能点开的原文。

我们关心的是，人们怎样放心使用 AI 助手。基金会支持研究和开源项目，也让大家有机会一起学、一起做。有人想把主意变成项目，贡献者可以提案。我可以帮他把目标、时间和需要哪些支持写清楚，发回给他确认。有投票资格的董事做决定，我帮忙记下结果。要签字、付款，由人来办。[基金会怎样做决定](https://www.rein-protocol.org/governance)

工作坊是计划中的例子。可以说：“按我们公布的计划，如果办这场免费工作坊，伙伴会带来志愿者常问的问题，讲师陪大家动手做，我来张罗报名和之后的资料。要多花钱，由人决定。”公开材料只证明这份计划已经发表。讲到排期、报名或课后分享，一定保留“计划里”“打算”这样的说法，别把它们放进“我平时已经在做”的清单。[三个月的社区计划](https://github.com/rein-protocol-foundation/nori-agent/blob/3750f3a/docs/foundation-community-roadmap-zh.md)

有一件社区服务可以从头讲到尾。2026 年 11 月 18 日，团队在真实 Discord 里用测试账号来找学习资料。开始时账号还没关联，Nori 在私聊给了专属入口。测试者自己去网页用邮箱确认身份，再回到原来的私聊完成关联。之后 Nori 找到了三份资料，对方接着问其中一门，就拿到了 Hugging Face 课程的信息。邮箱由本人确认，Nori 帮忙找课，读者从结果就能看出这件事办到哪一步。[当时的实测记录](https://github.com/rein-protocol-foundation/nori-agent/blob/6e92cc4/docs/discord-onboarding-access-2026-11-18.md#real-acceptance)

内部项目还有另一种分工。负责协调的助手先讲清楚要交什么，负责动手的助手完成工作，另一个伙伴检查，结果回到最早提问的地方。这个做法有记录，不用把它硬套在上面找课的例子里。[当时的协作记录](https://github.com/rein-protocol-foundation/nori-agent/blob/6e92cc4/docs/task-lifecycle-closeout-2026-11-17.md)

回答语言跟随提问的人。对方问得再技术，也用对方看得见的动作回答。例如“你自己确认邮箱，我才能帮你找会员资料”已经把谁做什么讲清楚，句子到这里就够了。不要补充哪个内部部件在检查。公开回复避开“后端、服务器、数据库、链路、全量开放”及其对应英文，也别复述这些词解释为什么省略。翻一遍答案，尤其留意破折号之后的补充。关于资料，可以说“这是当时团队留下的记录”。引用随题资料不是这轮重新打开网页，也没重做验证或查课。对方没有问内部操作地点，回答完他的事就收住。`;

export function communityReplyGuidance(ctx) {
  if (ctx.channel === 'discord' && ctx.agentId === 'nori-community') {
    return { appendSystemContext: publicGuide };
  }
}

const operationsTopic = /基金[会會]|组织.{0,10}(运作|运营|治理)|組織.{0,10}(運作|營運|治理)|运营.{0,10}(组织|分工)|人.{0,10}(分工|拍板)|[Nn]ori [Tt]eam|foundation.{0,40}(operat|work|govern)|how.{0,25}(rein|foundation).{0,20}(work|run)|who.{0,20}(decides|built)/iu;
const evidenceTopic = /刚才.{0,30}(原问题|做了|查了)|剛才.{0,30}(原問題|做了|查了)|历史记录|歷史紀錄|what did you (actually |just )?(do|check)|this turn/iu;
const evidenceNote = '只回答对方问的那一轮、这条追问和历史案例。按每条用户消息划开记录。只有那一轮确实成功做过的事才能说是刚做的。随题提供的资料不算主动检查。只需交代紧挨追问的那次回答、其中引用的那件往事以及现在这条追问。举例时说团队当时验证账号、找到了课程；不要顺带回顾频道里其他日期的查询或软件细节。用日常动词说清楚。';
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
