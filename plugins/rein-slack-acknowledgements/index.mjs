import { nowUs, openLedger } from './ledger.mjs';
import { observeReceipts } from './receipts.mjs';

export default {
  id: 'rein-slack-acknowledgements',
  name: 'Slack acknowledgement telemetry',
  register(api) {
    const workspace = api.pluginConfig?.workspaceId;
    if (!workspace) return;
    const slack = api.config.channels?.slack;
    let ledger;
    let stopObserving;
    let nextWarning = 0;
    function warn() {
      if (Date.now() < nextWarning) return;
      nextWarning = Date.now() + 60000;
      api.logger.warn('Slack acknowledgement observation unavailable');
    }
    function required(channel, ts) {
      try { ledger?.record(workspace, channel, ts, 'required', nowUs()); } catch { warn(); }
    }
    // In mention-gated rooms the channel has already approved the request when
    // this hook runs. Record it even when a command handles it before inference.
    api.on('message_received', (event, context) => {
      if (context.channelId !== 'slack' || context.accountId !== 'default' ||
          event.metadata?.guildId !== workspace || !/^[UW][A-Z0-9]+$/.test(event.senderId)) return;
      const channel = /(?:^|:)channel:([CG][A-Z0-9]+)$/.exec(event.metadata?.to || context.conversationId)?.[1];
      if (!channel) return;
      const room = slack?.channels?.[channel] ?? slack?.channels?.['*'];
      if (room?.requireMention === true) required(channel, event.messageId);
    });
    // Also cover DMs and accepted user requests in rooms with a participation
    // policy. Run after participation hooks that consume passive room traffic.
    api.on('reply_dispatch', ({ ctx }) => {
      if (ctx.Provider !== 'slack' || ctx.Surface !== 'slack' || ctx.AccountId !== 'default' ||
          ctx.GroupSpace !== workspace || ctx.InboundEventKind !== 'user_request' ||
          ctx.SenderIsBot || ctx.SenderIsSelf || !/^[UW][A-Z0-9]+$/.test(ctx.SenderId)) return;
      required(ctx.NativeChannelId, ctx.MessageSidFull ?? ctx.MessageSid);
    }, { priority: -1000, eligibleDispatchKinds: ['agent', 'acp'] });
    api.registerService({
      id: 'rein-slack-acknowledgements',
      start() {
        if (ledger) return;
        if (!process.env.SLACK_BOT_TOKEN) throw new Error('Slack acknowledgement bot identity unavailable');
        ledger = openLedger(api.pluginConfig.stateDirectory);
        stopObserving = observeReceipts(() => process.env.SLACK_BOT_TOKEN,
          (channel, ts, at) => ledger.record(workspace, channel, ts, 'confirmed', at), warn);
        api.logger.info('Slack acknowledgement observation started');
      },
      stop() {
        stopObserving?.();
        ledger?.db.close();
        ledger = undefined;
      },
    });
  },
};
