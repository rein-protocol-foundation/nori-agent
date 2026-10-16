import { createHash } from 'node:crypto';
export const MEMORY_TOOLS = ['rein_memory_read', 'rein_memory_remember', 'rein_memory_forget'];

// Adapters validate native IDs and authenticated transport metadata first. This
// protocol deliberately accepts opaque IDs so another platform needs no changes
// to hashing, storage or the model/tool boundary.
export function createScopedOwner({agentId,platform,accountId='default',botUserId}, event) {
  const {spaceId=null,channelId,senderId,audience,kind,threadId} = event;
  if (![agentId,platform,accountId,botUserId,channelId,senderId].every(value=>typeof value==='string' && value.length>0 && value.length<=200) ||
      !/^[a-z][a-z0-9_-]{0,31}$/.test(platform) || !/^[a-z][a-z0-9-]{0,50}$/.test(agentId) ||
      (kind==='direct' && audience!=='private') || !['public','private'].includes(audience) || !['channel','direct'].includes(kind) ||
      (spaceId!==null && (typeof spaceId!=='string' || !spaceId)) ||
      (threadId!==undefined && (typeof threadId!=='string' || !threadId))) throw new Error('Invalid trusted isolation scope');
  const conversationId = threadId ? `${channelId}:thread:${threadId}` : channelId;
  // Preserve v1 Discord hashes: unchanged isolated notes need no migration.
  const tuple=[1,agentId,platform,accountId,botUserId,spaceId,threadId?['thread',channelId,threadId]:channelId,audience,senderId,
    ...(kind==='channel' && audience==='private'?['private-channel']:[])];
  return Object.freeze({key:createHash('sha256').update(JSON.stringify(tuple)).digest('hex'),
    agentId,platform,accountId,botUserId,spaceId,channelId,conversationId,senderId,audience,kind,threadId});
}
export function sessionKey(owner,generation=0) {
  if (!Number.isSafeInteger(generation) || generation<0) throw new Error('Invalid session generation');
  return `agent:${owner.agentId}:${owner.platform}:${owner.kind}:rein-isolated-v1-${owner.key}-${generation}`;
}
export function ownerMatchesContext(owner,ctx,generation) {
  return Boolean(owner && typeof ctx.assertInvocationCurrent==='function' && ctx.messageChannel===owner.platform &&
    ctx.agentId===owner.agentId && ctx.agentAccountId===owner.accountId && ctx.requesterSenderId===owner.senderId &&
    ctx.nativeChannelId===owner.channelId && ctx.sessionKey===sessionKey(owner,generation(owner)));
}

export function createOwnerQueue() {
  const pending = new Map();
  const counts = new Map();
  let total = 0;
  return async (ownerKey, task) => {
    if ((counts.get(ownerKey) ?? 0) >= 16 || total >= 256) throw new Error('Isolated turn queue is full');
    counts.set(ownerKey, (counts.get(ownerKey) ?? 0) + 1);
    total++;
    const previous = pending.get(ownerKey) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    pending.set(ownerKey, next);
    try { return await next; }
    finally {
      total--;
      const count = counts.get(ownerKey) - 1;
      if (count) counts.set(ownerKey,count); else counts.delete(ownerKey);
      if (pending.get(ownerKey) === next) pending.delete(ownerKey);
    }
  };
}
