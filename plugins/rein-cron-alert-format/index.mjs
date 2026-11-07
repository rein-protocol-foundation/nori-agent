// Presentation only: retain native failure/recovery delivery and incident state.
export function formatCronAlert(event, context, channelId) {
  if (context.channelId !== 'slack' || ![channelId, `channel:${channelId}`].includes(event.to)) return;
  const match = /^Automation "([^\n]+)" (failed (\d+) times|recovered)\n([\s\S]*)$/.exec(event.content);
  if (!match) return;
  const [, name, status, count, detail] = match;
  const recovered = status === 'recovered';
  const escape = s => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]))
    .replace(/[*_`~\\]/g, '');
  const title = name.startsWith('TEST-')
    ? `🧪 测试通知 · ${recovered ? '已恢复' : '执行失败'}`
    : recovered ? '🟢 定时任务已恢复' : '🔴 定时任务失败';
  const lines = detail.split('\n').filter(Boolean).flatMap(line => {
    if (line === 'The latest run completed successfully.') return ['最新一次执行已成功，故障已解除。'];
    if (line.startsWith('Run started: ')) {
      const value = line.slice(13);
      const date = new Date(value);
      const time = Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('zh-CN', {timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short'}).format(date)
        : value;
      return [`开始时间：${escape(time)}`];
    }
    if (line.startsWith('Inspect: ')) return []; // Stable dashboard link below.
    if (line.startsWith('Cause: ')) return [`**失败原因**\n${escape(line.slice(7))}`];
    return [escape(line)];
  });
  return {content: [`**${title}**`, `**${escape(name)}**`,
    ...(!recovered ? [`连续失败 ${count} 次`] : []), '', ...lines, '',
    '[查看运行记录 ↗](https://nori.rein-protocol.org/slack/automations)',
    '来源：Cron 调度器'].join('\n')};
}

export default {
  id: 'rein-cron-alert-format',
  name: 'Nori Cron alert formatting',
  register(api) {
    api.on('message_sending', (event, context) =>
      formatCronAlert(event, context, api.pluginConfig.channelId));
  },
};
