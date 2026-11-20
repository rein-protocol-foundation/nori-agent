import { resolveAckReaction } from 'openclaw/plugin-sdk/channel-feedback';
import type { OpenClawConfig } from 'openclaw/plugin-sdk/config-contracts';

type Receipt = {
  scope: { accountId: string; workspaceId: string; channelId: string; agentId: string };
  messageId: string;
  cfg: OpenClawConfig;
  signal?: AbortSignal;
  isActive: () => boolean;
};
type Logger = { info: (text: string) => void; warn: (text: string) => void };

// Start the native Slack write independently of the worker. Slack owns token resolution,
// workspace targeting, emoji normalization and idempotent already_reacted handling.
export async function acknowledgeSlackParticipation({ scope, messageId, cfg, signal, isActive }: Receipt, logger: Logger) {
  const messages = cfg.messages;
  if ((messages?.ackReactionScope ?? 'group-mentions') !== 'group-mentions' ||
      messages?.removeAckAfterReply || messages?.statusReactions?.enabled ||
      !/^\d{1,12}\.\d{1,6}$/.test(messageId)) return;
  const target = `channel=${scope.channelId} message=${messageId}`;
  try {
    const emoji = resolveAckReaction(cfg, scope.agentId, { channel: 'slack', accountId: scope.accountId });
    if (!emoji) return;
    const { mergeSlackAccountConfig, reactSlackMessage } = await import('@openclaw/slack/api.js');
    if (mergeSlackAccountConfig(cfg, scope.accountId).actions?.reactions === false) return;
    const deadline = AbortSignal.timeout(3000);
    const assertCurrent = () => {
      deadline.throwIfAborted();
      signal?.throwIfAborted();
      if (!isActive()) throw new Error('participation_closed');
    };
    assertCurrent();
    await reactSlackMessage(scope.channelId, messageId, emoji, {
      cfg, accountId: scope.accountId, teamId: scope.workspaceId, assertDirectAdapterHandoff: assertCurrent,
    });
    logger.info(`rein_router_participation_ack sent ${target}`);
  } catch (error) {
    const slackError = (error as { data?: { error?: string } } | null)?.data?.error;
    const reason = ['missing_scope', 'not_in_channel', 'invalid_auth', 'invalid_name', 'message_not_found'].includes(slackError ?? '')
      ? slackError : 'unavailable';
    logger.warn(`rein_router_participation_ack failed ${target} reason=${reason}`);
  }
}
