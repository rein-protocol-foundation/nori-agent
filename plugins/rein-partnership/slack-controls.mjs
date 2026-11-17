export const partnershipNamespace = 'rein-partnership';

/** Only fixed workflow actions are exposed; no command or model-generated payload is executed. */
export function partnershipControls(details, nonce) {
  const labels = { awaiting_approval: '等待审批', accepted: '邮件服务已接受', cancelled: '已取消', expired: '审批已过期',
    blocked: '已阻止发送', unknown: '发送结果待核实', dispatching: '正在发送', resuming: '正在处理审批',
    pending_preview: '草稿展示中', superseded: '草稿已更新' };
  const status = details.receipt?.deliveryVerified ? '已确认送达（邮件服务回执）' : labels[details.status] ?? details.status;
  const text = `合作邮件测试 · ${status}\n草稿 ${details.taskId} · 版本 ${details.version}\n测试收件人：${details.material.to}\n主题：${details.material.subject}`;
  const blocks = [{ type: 'section', text: { type: 'plain_text', text } }];
  const button = (action, label, style) => ({ type: 'button', text: { type: 'plain_text', text: label },
    action_id: `openclaw:callback_button:${action}`, value: `${partnershipNamespace}:${action}:${details.taskId}:${nonce}`,
    ...(style ? { style } : {}) });
  if (details.status === 'awaiting_approval') {
    blocks.push({ type: 'section', text: { type: 'plain_text', text: '请先核对本线程上方完整草稿。点击批准后，将向上述测试邮箱发送一次。仅指定审批人可以操作。' } },
      { type: 'actions', elements: [button('approve', '批准并发送测试邮件', 'primary'), button('cancel', '取消')] });
  } else if (details.receipt) {
    blocks.push({ type: 'section', text: { type: 'plain_text', text: `发送回执：${details.receipt.id}\n${details.receipt.deliveryVerified ? '邮件服务已确认送达；不代表收件人已阅读。' : '服务已接受，尚未确认送达。'}${details.providerEvidence?.lastEvent ? `\n最近事件：${details.providerEvidence.lastEvent}` : ''}` } },
      { type: 'actions', elements: [button('reconcile', '刷新送达状态')] });
  }
  if (details.blocker) blocks.push({ type: 'section', text: { type: 'plain_text', text: details.blocker } });
  return { text, blocks };
}

/** Public native channel adapter preserves the existing Slack account and thread. */
export function createSlackControlPublisher(api) {
  return async ({ details, nonce, source, current, assertInvocationCurrent, signal }) => {
    const adapter = await api.runtime.channel.outbound.loadAdapter('slack');
    if (typeof adapter?.sendPayload !== 'function') throw Error('partnership_interactive_delivery_unavailable');
    await current();
    const card = partnershipControls(details, nonce);
    const sent = await adapter.sendPayload({ cfg: api.config, accountId: source.accountId,
      to: `channel:${source.chatId}`, threadId: source.threadId, text: card.text, signal,
      assertDirectAdapterHandoff: assertInvocationCurrent, onPlatformSendDispatch: current,
      payload: { text: card.text, channelData: { slack: { blocks: card.blocks, authoredTextPlacement: 'none' } } } });
    if (sent?.channel !== 'slack' || !/^\d+\.\d+$/.test(sent.messageId ?? '')) throw Error('partnership_interactive_receipt_unavailable');
    return sent.messageId;
  };
}
