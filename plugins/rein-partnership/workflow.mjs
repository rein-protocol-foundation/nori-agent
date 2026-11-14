import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createPartnershipStore, taskIdValid } from './store.mjs';
import { developmentChannelFor } from '../rein-router/slack-development.mjs';

const nativeId = value => typeof value === 'string' && /^[A-Z][A-Z0-9]{5,31}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const email = value => typeof value === 'string' && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value) && value.length <= 254;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const result = details => ({ content: [{ type: 'text', text: JSON.stringify(details) }], details });
const unwrap = event => event.toolName === 'tool_call'
  ? { name: event.params?.id?.replace(/^openclaw:core:/, ''), params: event.params?.args } : { name: event.toolName, params: event.params };
const finalStates = new Set(['cancelled', 'accepted', 'unknown', 'blocked', 'resuming', 'dispatching', 'expired', 'superseded', 'preparing', 'pending_preview']);

export function formatPartnershipReport(details) {
  const lines = [`Partnership test draft — ${details.status}`, `Task: ${details.taskId} · version ${details.version}`];
  if (details.material) lines.push('Proposed action: send this exact plain-text draft once to the designated test recipient.',
    `From: ${details.material.from}`, `Test recipient: ${details.material.to}`, `Subject: ${details.material.subject}`,
    '', details.material.text, '', `Selected entry: ${details.material.entry}`, `Source task: ${details.material.sourceTaskId}`);
  if (details.approverId) lines.push(`Designated approver: ${details.approverId}`);
  if (details.expiresAt) lines.push(`Approval expires: ${new Date(details.expiresAt).toISOString()}`);
  if (details.approveCommand) lines.push('', 'Approve this exact draft:', details.approveCommand, 'Cancel:', details.cancelCommand);
  if (details.receipt) lines.push(`Resend accepted: ${details.receipt.id}. ${details.receipt.deliveryVerified ? 'Provider evidence verified delivery.' : 'Delivery is not verified.'}`);
  if (details.providerEvidence) lines.push(`Latest provider event: ${details.providerEvidence.lastEvent ?? 'unknown'}`);
  if (details.blocker) lines.push(`Blocked: ${details.blocker}`);
  return lines.join('\n');
}

export function validatePartnershipConfig(raw = {}) {
  if (raw.enabled !== true) return { enabled: false };
  const channel = raw.channel;
  if (!channel || !text(channel.accountId, 128) || !nativeId(channel.workspaceId) || !nativeId(channel.channelId) ||
      !/^[a-z0-9][a-z0-9_-]*$/.test(channel.agentId ?? '') || !/^[A-Z][A-Z0-9_]*$/.test(channel.botTokenEnvVar ?? '') ||
      !email(raw.from) || !Array.isArray(raw.testRecipients) || !raw.testRecipients.length || raw.testRecipients.length > 10 ||
      raw.testRecipients.some(value => !email(value)) || (raw.approverId !== undefined && !nativeId(raw.approverId)) ||
      (raw.approvalTtlMs !== undefined && (!Number.isSafeInteger(raw.approvalTtlMs) || raw.approvalTtlMs < 1000 || raw.approvalTtlMs > 86_400_000)) ||
      !/^[A-Z][A-Z0-9_]*$/.test(raw.apiKeyEnvVar ?? 'RESEND_API_KEY')) throw Error('partnership_config_invalid');
  return { enabled: true, channel: { ...channel }, from: raw.from, testRecipients: [...new Set(raw.testRecipients)],
    approverId: raw.approverId, approvalTtlMs: raw.approvalTtlMs ?? 3_600_000, apiKeyEnvVar: raw.apiKeyEnvVar ?? 'RESEND_API_KEY' };
}

export function assertPartnershipRuntimeConfig(config, host) {
  if (!config.enabled) return;
  const entry = host.plugins?.entries?.['rein-partnership'];
  const agent = host.agents?.entries?.[config.channel.agentId] ?? host.agents?.list?.find(value => value.id === config.channel.agentId);
  if (entry?.hooks?.allowConversationAccess !== true || !agent ||
      (agent.sandbox?.mode ?? host.agents?.defaults?.sandbox?.mode) !== 'off')
    throw Error('partnership_runtime_invalid: grant conversation hooks and configure the trusted parent sandbox off');
}

/** A fixed action association and receipt ledger, not a replacement task scheduler. */
export function createPartnershipWorkflow({ config, authorize, stateDir, lobster, mail, clock = Date.now, store = createPartnershipStore(stateDir) }) {
  const turns = new Map(), calls = new Map();
  const scopeOf = source => ({ agentId: source.agentId, accountId: source.accountId, workspaceId: config.channel.workspaceId, channelId: config.channel.channelId,
    sessionKey: source.sessionKey, threadId: source.threadId === undefined ? null : String(source.threadId) });
  const membership = async source => {
    try { return await authorize(source) === true; } catch { return false; }
  };
  const requireScope = (record, source, decision = false) => {
    if (!record || !isDeepStrictEqual(record.scope, scopeOf(source)) ||
        !(decision ? [record.approverId] : [record.initiator, record.approverId]).includes(source.senderId))
      throw Error('partnership_unavailable');
  };
  const publicRecord = record => {
    const value = { status: record.status, taskId: record.taskId, version: record.version, material: record.material,
      approverId: record.approverId, digest: record.digest, checkpointId: record.checkpoint?.approvalId,
      expiresAt: record.expiresAt, receipt: record.receipt, blocker: record.blocker, providerEvidence: record.providerEvidence,
      notice: 'Test recipient only. A provider receipt proves acceptance; delivery requires provider delivery evidence.' };
    if (record.status === 'awaiting_approval') {
      const tail = `${record.taskId} ${record.version} ${record.digest} ${record.checkpoint.approvalId}`;
      value.approveCommand = `/partnership approve ${tail}`; value.cancelCommand = `/partnership cancel ${tail}`;
      value.proposedAction = 'Send the exact displayed plain-text draft once to the designated test recipient.';
    }
    return value;
  };
  const read = async (taskId, source) => { const record = await store.read(taskId); requireScope(record, source); return record; };
  async function prepare(args, source, current, preview) {
    if (!text(args.sourceTaskId, 512) || !text(args.entry, 4000) || !config.testRecipients.includes(args.to) ||
        !text(args.subject, 500) || /[\r\n]/.test(args.subject) || !text(args.text, 32_000) ||
        Object.keys(args).some(key => !['action', 'sourceTaskId', 'entry', 'to', 'subject', 'text', 'taskId', 'expectedVersion'].includes(key)) ||
        (args.taskId !== undefined && (!taskIdValid(args.taskId) || !Number.isSafeInteger(args.expectedVersion))) ||
        (args.taskId === undefined && args.expectedVersion !== undefined)) throw Error('partnership_material_invalid');
    const taskId = args.taskId ?? randomUUID();
    return store.locked(taskId, async () => {
      const old = await store.read(taskId);
      if (args.taskId) {
        requireScope(old, source);
        if (old.initiator !== source.senderId || old.status !== 'awaiting_approval' || old.version !== args.expectedVersion)
          throw Error('partnership_supersession_unavailable');
        old.status = 'superseded'; await current(); await store.write(old);
        try { await lobster.resume({ checkpoint: old.checkpoint, approve: false, actor: source.senderId }); } catch { /* Old association is permanently unsendable. */ }
      } else if (old) throw Error('partnership_task_conflict');
      const material = { sourceTaskId: args.sourceTaskId, entry: args.entry, from: config.from, to: args.to, subject: args.subject, text: args.text };
      const record = { taskId, version: (old?.version ?? 0) + 1, scope: scopeOf(source), initiator: source.senderId,
        approverId: config.approverId ?? source.senderId, material, materialHash: hash(material), status: 'preparing',
        createdAt: clock(), expiresAt: clock() + config.approvalTtlMs };
      await current(); await store.write(record);
      let envelope;
      try { envelope = await lobster.prepare({ material, initiator: record.initiator, approver: record.approverId }); }
      catch { /* Preserve an interrupted prepare as a blocker; never restart implicitly. */ }
      if (!envelope?.ok || envelope.status !== 'needs_approval' || !text(envelope.requiresApproval?.resumeToken, 16_384) ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(envelope.requiresApproval?.approvalId ?? '') ||
          !/^[0-9a-f]{64}$/.test(envelope.requiresApproval?.templateDigest ?? '') ||
          !isDeepStrictEqual(envelope.requiresApproval.items, [material])) {
        record.status = 'blocked'; record.blocker = 'Native approval checkpoint or exact preview unavailable; preparation was not rerun.';
      } else {
        record.checkpoint = { resumeToken: envelope.requiresApproval.resumeToken, approvalId: envelope.requiresApproval.approvalId,
          templateDigest: envelope.requiresApproval.templateDigest };
        record.digest = hash([taskId, record.version, record.materialHash, record.scope, record.approverId, record.expiresAt, record.checkpoint]);
        record.status = 'awaiting_approval';
      }
      await current(); await store.write(record);
      if (record.status === 'awaiting_approval') {
        const details = publicRecord(record);
        record.status = 'pending_preview'; await store.write(record);
        try {
          await current(); await preview(details); await current();
          record.status = 'awaiting_approval';
        } catch {
          record.status = 'blocked'; record.blocker = 'Exact approval preview delivery or current invocation could not be confirmed; no send is authorized.';
        }
        await store.write(record);
      }
      return publicRecord(record);
    });
  }
  function commandSource(ctx) {
    const channel = /^(?:slack:)?(?:channel:)?([A-Z][A-Z0-9]{5,31})$/.exec(ctx.to ?? '')?.[1];
    if (ctx.channel !== 'slack' || ctx.isAuthorizedSender !== true || channel !== config.channel.channelId ||
        ctx.accountId !== config.channel.accountId || ctx.agentId !== config.channel.agentId || !nativeId(ctx.senderId) || !text(ctx.sessionKey, 1024))
      throw Error('partnership_authority_unavailable');
    return { channel: 'slack', accountId: ctx.accountId, agentId: ctx.agentId, sessionKey: ctx.sessionKey,
      senderId: ctx.senderId, chatId: channel, threadId: ctx.messageThreadId,
      runId: `partnership-command:${randomUUID()}`, trigger: 'user', messageProvider: 'slack' };
  }
  async function decide(parts, source) {
    const [action, taskId, version, digest, checkpointId] = parts;
    if (parts.length !== 5 || !taskIdValid(taskId) || !/^[1-9][0-9]{0,8}$/.test(version) || !/^[0-9a-f]{64}$/.test(digest) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(checkpointId)) throw Error('partnership_command_invalid');
    return store.locked(taskId, async () => {
      const record = await read(taskId, source); requireScope(record, source, true);
      if (record.approverId !== (config.approverId ?? record.initiator)) throw Error('partnership_approver_changed');
      if (record.version !== Number(version) || record.digest !== digest || record.checkpoint?.approvalId !== checkpointId)
        throw Error('partnership_decision_stale');
      if (finalStates.has(record.status)) return publicRecord(record);
      if (record.status !== 'awaiting_approval') throw Error('partnership_checkpoint_unavailable');
      if (!await membership(source)) throw Error('partnership_authority_unavailable');
      if (clock() >= record.expiresAt) {
        record.status = 'expired'; record.blocker = 'Approval expired; no send attempted.'; await store.write(record); return publicRecord(record);
      }
      record.decision = { actor: source.senderId, action, at: clock(), digest, checkpointId };
      record.status = action === 'cancel' ? 'cancelled' : 'resuming';
      await store.write(record);
      let resumed;
      try { resumed = await lobster.resume({ checkpoint: record.checkpoint, approve: action === 'approve', actor: source.senderId }); }
      catch { /* Resume uncertainty must never cause a replay. */ }
      if (action === 'cancel') {
        if (!resumed?.ok || resumed.status !== 'cancelled') record.blocker = 'Cancellation is durable; native checkpoint cleanup was not confirmed.';
        await store.write(record); return publicRecord(record);
      }
      if (!resumed?.ok || resumed.status !== 'ok' || !isDeepStrictEqual(resumed.output, [record.material]) || hash(record.material) !== record.materialHash) {
        record.status = 'blocked'; record.blocker = 'Native checkpoint missing, invalid, or resumed material mismatch; no send attempted.';
        await store.write(record); return publicRecord(record);
      }
      if (!await membership(source) || clock() >= record.expiresAt || !config.testRecipients.includes(record.material.to) || record.material.from !== config.from) {
        record.status = 'blocked'; record.blocker = 'Authority, test-recipient configuration, or approval expiry changed before dispatch; no send attempted.';
        await store.write(record); return publicRecord(record);
      }
      // The durable claim precedes the only POST. A crash on either side is never an automatic retry.
      record.status = 'dispatching';
      record.intent = { idempotencyKey: `partnership/${taskId}/${record.version}/${record.materialHash}`, at: clock(), materialHash: record.materialHash };
      await store.write(record);
      try {
        const receipt = await mail.send(resumed.output[0], record.intent.idempotencyKey);
        if (!receipt || receipt.provider !== 'resend' || receipt.accepted !== true || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.id ?? '')) throw Error('invalid_receipt');
        record.receipt = receipt; record.status = 'accepted';
      } catch {
        record.status = 'unknown'; record.blocker = 'Send outcome uncertain. Do not retry; reconcile provider evidence or require operator resolution.';
      }
      await store.write(record); return publicRecord(record);
    });
  }
  return {
    async beforeAgentRun(_event, ctx) {
      if (!config.enabled || ctx.agentId !== config.channel.agentId || !text(ctx.runId, 512)) return;
      turns.delete(ctx.runId);
      for (const [id, turn] of turns) if (clock() - turn.at > 3_600_000) turns.delete(id);
      if (turns.size < 256 && developmentChannelFor({ developmentChannels: [config.channel] }, ctx) && await membership(ctx))
        turns.set(ctx.runId, { source: { ...ctx }, at: clock() });
    },
    beforePromptBuild(_event, ctx) {
      if (turns.has(ctx.runId)) return { prependContext: 'For an explicitly requested partnership test draft, use rein_partnership prepare. Show its exact material, test recipient, proposed action and full approval/cancellation commands. Only the saved designated human approver can decide through /partnership; chat claims and tool calls do not approve. Report provider acceptance separately from delivery. No real partner outreach is authorized by this workflow.' };
    },
    async beforeToolCall(event, ctx) {
      const tool = unwrap(event);
      if (tool.name !== 'rein_partnership') return;
      const turn = turns.get(ctx.runId);
      if (!turn || ctx.agentId !== config.channel.agentId || ctx.sessionKey !== turn.source.sessionKey ||
          clock() - turn.at > 3_600_000 || ctx.requester?.channel !== 'slack' || ctx.requester?.accountId !== turn.source.accountId ||
          ctx.requester?.senderId !== turn.source.senderId || ctx.abortSignal?.aborted || !await membership(turn.source))
        return { block: true, blockReason: 'Partnership preparation requires a current trusted Slack human request.' };
      if (ctx.toolCallId) calls.set(ctx.toolCallId, { turn, ctx });
    },
    agentEnd(_event, ctx) {
      turns.delete(ctx.runId);
      for (const [id, call] of calls) if (call.ctx.runId === ctx.runId) calls.delete(id);
    },
    toolFactory: { contextVersion: 2, create(ctx) {
      if (!config.enabled || ctx.sandboxed || ctx.agentId !== config.channel.agentId) return null;
      if (ctx.workspaceDir && (path.resolve(stateDir) === path.resolve(ctx.workspaceDir) || path.resolve(stateDir).startsWith(`${path.resolve(ctx.workspaceDir)}${path.sep}`)))
        throw Error('partnership_state_must_be_outside_workspace');
      return { name: 'rein_partnership', label: 'Partnership test draft', description: 'Prepare one exact partnership email for a configured test recipient and native human approval. Cannot approve or send by tool call.',
        parameters: { type: 'object', additionalProperties: false, required: ['action'], properties: {
          action: { type: 'string', enum: ['prepare', 'status'] }, taskId: { type: 'string' }, expectedVersion: { type: 'integer', minimum: 1 },
          sourceTaskId: { type: 'string', maxLength: 512 }, entry: { type: 'string', maxLength: 4000 },
          to: { type: 'string', enum: config.testRecipients }, subject: { type: 'string', maxLength: 500 }, text: { type: 'string', maxLength: 32_000 },
        } },
        async execute(toolCallId, args) {
          const call = calls.get(toolCallId); calls.delete(toolCallId);
          const current = async () => {
            ctx.assertInvocationCurrent();
            if (!call || turns.get(call.ctx.runId) !== call.turn || clock() - call.turn.at > 3_600_000 || call.ctx.abortSignal?.aborted ||
                ctx.sessionKey !== call.turn.source.sessionKey || ctx.requesterSenderId !== call.turn.source.senderId ||
                !await membership(call.turn.source)) throw Error('partnership_authority_unavailable');
            ctx.assertInvocationCurrent();
          };
          await current();
          const route = ctx.deliveryContext;
          const routeChannel = /^(?:slack:)?(?:channel:)?([A-Z][A-Z0-9]{5,31})$/.exec(route?.to ?? '')?.[1];
          if (!route || route.channel !== 'slack' || route.accountId !== config.channel.accountId || routeChannel !== config.channel.channelId)
            throw Error('partnership_delivery_scope_unavailable');
          const source = { ...call.turn.source, threadId: route.threadId };
          if (args.action === 'prepare') {
            if (typeof ctx.delivery?.send !== 'function') throw Error('partnership_preview_delivery_unavailable');
            const details = await prepare(args, source, current, details => ctx.delivery.send({ text: formatPartnershipReport(details) }));
            return result(details);
          }
          if (args.action === 'status' && taskIdValid(args.taskId)) return result(publicRecord(await read(args.taskId, source)));
          throw Error('partnership_action_invalid');
        },
      };
    } },
    async command(ctx) {
      try {
        if (!config.enabled) throw Error('partnership_disabled');
        const source = commandSource(ctx);
        if (!await membership(source)) throw Error('partnership_authority_unavailable');
        const parts = (ctx.args ?? '').trim().split(/\s+/);
        let details;
        if (['approve', 'cancel'].includes(parts[0])) details = await decide(parts, source);
        else if (['status', 'reconcile'].includes(parts[0]) && parts.length === 2 && taskIdValid(parts[1])) {
          if (parts[0] === 'status') {
            const record = await read(parts[1], source); details = publicRecord(record);
            if (['preparing', 'pending_preview', 'resuming', 'dispatching'].includes(record.status)) details.blocker = 'Interrupted or in-flight operation; inspect durable evidence and resolve explicitly. No automatic retry.';
          } else details = await store.locked(parts[1], async () => {
            const record = await read(parts[1], source);
            if (!record.receipt?.id) throw Error('partnership_no_receipt: unknown sends require operator evidence; no retry');
            const evidence = await mail.retrieve(record.receipt.id);
            if (!await membership(source)) throw Error('partnership_authority_unavailable');
            if (evidence.id !== record.receipt.id || evidence.from !== record.material.from || !isDeepStrictEqual(evidence.to, [record.material.to]) ||
                evidence.subject !== record.material.subject || evidence.text !== record.material.text) throw Error('partnership_provider_evidence_mismatch');
            record.providerEvidence = { id: evidence.id, lastEvent: evidence.last_event, checkedAt: clock() };
            record.receipt.deliveryVerified = record.receipt.deliveryVerified === true || evidence.last_event === 'delivered';
            await store.write(record); return publicRecord(record);
          });
        } else throw Error('partnership_command_invalid');
        return { text: formatPartnershipReport(details), details };
      } catch (error) {
        const code = /^partnership_[a-z_]+/.exec(error?.message ?? '')?.[0] ?? 'partnership_unavailable';
        return { text: `${code}. Inspect saved status before any further action.`, details: { status: 'unavailable', error: code } };
      }
    },
  };
}
