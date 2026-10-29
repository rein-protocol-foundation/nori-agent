import { createHash, randomUUID } from 'node:crypto';
import { parseBackendConfig, resolveTrustedWorkspace } from '../rein-operations/backend-config.ts';
import { createBackendTransport, type BackendTransport } from '../rein-operations/backend-transport.ts';

export const FOUNDATION_ADMIN_TIMEOUT_MS = 3000;
const nativeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const runField = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1024;

/** Reuse Foundation's enrolled relay and signed identity resolution. No model-supplied actor. */
export function createFoundationAdminAuthorizer({ config, env = process.env, transport, now = Date.now }: {
  config?: unknown;
  env?: Record<string, string | undefined>;
  transport?: BackendTransport;
  now?: () => number;
}, accepts: (member: Record<string, unknown>) => boolean = member => member.is_administrator === true) {
  let resolved: ReturnType<typeof parseBackendConfig>;
  let backend: BackendTransport;
  try {
    resolved = parseBackendConfig({ config, env, error: () => { throw new Error('router_identity_config_invalid'); } });
    if (!resolved) return async () => false;
    backend = transport ?? createBackendTransport({ baseUrl: resolved.baseUrl, callerId: resolved.callerId,
      credential: resolved.credential, timeoutMs: 1250 });
  } catch { return async () => false; }
  return async (ctx: any): Promise<boolean> => {
    const platform = ctx?.channel ?? ctx?.messageProvider;
    const sender = ctx?.senderId;
    // Legacy channelId can be derived from an isolated session key. chatId and
    // channelContext.chat.id carry the native conversation supplied by ingress.
    const channel = ctx?.channelContext?.chat?.id ?? ctx?.chatId;
    if (!['slack', 'discord'].includes(platform) || !nativeId(sender) || !nativeId(channel) ||
        !runField(ctx?.runId) || !runField(ctx?.sessionKey) || !runField(ctx?.agentId) ||
        !runField(ctx?.accountId) || ctx.trigger !== 'user' ||
        // Native Slack currently supplies an explicit user trigger but omits
        // inputProvenance. When supplied, provenance must agree with that trigger.
        (ctx.inputProvenance !== undefined && ctx.inputProvenance.kind !== 'external_user') ||
        (ctx.messageProvider !== undefined && ctx.messageProvider !== platform) ||
        (ctx.channelContext?.sender?.id !== undefined && ctx.channelContext.sender.id !== sender) ||
        (ctx.chatId !== undefined && ctx.chatId !== channel)) return false;
    const identity = resolveTrustedWorkspace(resolved!, { messageChannel: platform, nativeChannelId: channel });
    if (!identity) return false;
    // Each authorization check mints a fresh assertion. The backend rejects replayed event IDs,
    // including a second tool check inside the same run. Never reuse a previous role result.
    const eventId = createHash('sha256').update(JSON.stringify(['router-authority', randomUUID(), ctx.runId, ctx.agentId,
      ctx.sessionKey, ctx.accountId, platform, identity.workspaceId, channel, sender])).digest('hex');
    try {
      const ingress = await backend.relayIngress({ platform, workspace_id: identity.workspaceId,
        platform_user_id: sender, channel_id: channel, event_id: eventId, event_ts: new Date(now()).toISOString() });
      if (!ingress.ok) return false;
      const body = ingress.body as Record<string, unknown>;
      if (body.ok !== true || typeof body.assertion !== 'string' || !body.assertion) return false;
      const result = await backend.resolveIdentity({ kind: 'assertion', assertion: body.assertion });
      if (!result.ok) return false;
      const member = result.body as Record<string, unknown>;
      return member.ok === true && member.status === 'resolved' && typeof member.contact_id === 'string' &&
        Boolean(member.contact_id) && accepts(member);
    } catch { return false; }
  };
}

/** Current Contributor/Director roles qualify only after the independent channel gate passes. */
export function createFoundationDeveloperAuthorizer(options: Parameters<typeof createFoundationAdminAuthorizer>[0]) {
  return createFoundationAdminAuthorizer(options, member => member.is_administrator === true ||
    member.is_active_contributor === true || member.is_director === true);
}
