import { isAbsolute } from 'node:path';
import { createScopedOwner, sessionKey, ownerMatchesContext, MEMORY_TOOLS } from '@rein-protocol/isolation-core/scope';
import { assertIsolatedRuntime } from '@rein-protocol/isolation-core/runtime-guard';
export { sessionKey, MEMORY_TOOLS } from '@rein-protocol/isolation-core/scope';
const nativeId = (value, prefixes) => typeof value==='string' && new RegExp(`^[${prefixes}][A-Z0-9]{8,31}$`).test(value);
export const slackUserId = value=>nativeId(value,'UW');
export const slackChannelId = value=>nativeId(value,'CG');
export const slackMessageId = value=>typeof value==='string' && /^[0-9]{10,16}\.[0-9]{6}$/.test(value);
export const PRIVATE_TOOLS = ['read','web_search','web_fetch','rein_status',...MEMORY_TOOLS];
export const CHANNEL_TOOLS = [...PRIVATE_TOOLS,'rein_member_status','rein_identity_bind_start','rein_identity_bind_status',
  'rein_resources_search','rein_resource_get','rein_events_search','rein_event_get',
  'rein_identity_bind_complete','rein_funds','rein_poll_candidates','rein_vote_type_resolve','rein_proposal_collect',
  'rein_governance_proposal_submit','rein_poll_open','rein_poll_vote','rein_poll_result','rein_proposal_comment_suggest',
  'rein_revision_approve','rein_revision_apply'];
export function validateIsolationConfig(c) {
  if (!c || c.agentId!=='main' || !nativeId(c.teamId,'T') || !nativeId(c.appId,'A') || !slackUserId(c.botUserId) ||
      !isAbsolute(c.memoryPath??'') || ![c.botTokenEnv,c.appTokenEnv].every(name=>/^[A-Z][A-Z0-9_]+$/.test(name??'')) ||
      !Array.isArray(c.channels) || !c.channels.length || !Array.isArray(c.dmAllowFrom) || c.dmAllowFrom.some(id=>!slackUserId(id))) {
    throw new Error('Invalid rein-slack isolation configuration');
  }
  const ids=new Set();
  for(const channel of c.channels) {
    if (!slackChannelId(channel.id) || ids.has(channel.id) || !['public','private'].includes(channel.audience) ||
        (channel.userIds!==undefined && (!Array.isArray(channel.userIds) || !channel.userIds.length || channel.userIds.some(id=>!slackUserId(id)))))
      throw new Error('Invalid or ambiguous Slack channel policy');
    ids.add(channel.id);
  }
  return c;
}
export function assertSlackRuntime(cfg,c,workspaceDir) {
  validateIsolationConfig(c);
  assertIsolatedRuntime(cfg,c,workspaceDir,{platform:'slack',publicTools:CHANNEL_TOOLS,publicSkills:['rein-community-discovery']});
  // Business permissions stay in the existing backend. Ensure its native channel
  // enrollment cannot name another workspace under this authenticated bot.
  const backend=cfg.plugins?.entries?.['rein-operations']?.config?.foundationDb;
  if(backend?.enabled===true && backend.workspaces?.some(w=>w.platform!=='slack' || w.workspaceId!==c.teamId ||
      w.nativeChannelIds?.some(id=>!c.channels.some(channel=>channel.id===id))))
    throw new Error('Foundation enrollment must match this isolated Slack workspace and approved channels');
}
// Transport admission has already authenticated app/team and verified channel
// visibility with conversations.info. Native metadata, never text, supplies scope.
export function resolveOwner(c,event) {
  if(event.teamId!==c.teamId || !slackUserId(event.senderId) || event.senderId===c.botUserId || event.bot || event.webhook ||
    (event.threadId!==undefined && !slackMessageId(event.threadId))) return null;
  let audience;
  if(event.kind==='direct') {
    if(!nativeId(event.channelId,'D') || !c.dmAllowFrom.includes(event.senderId))return null;
    audience='private';
  } else if(event.kind==='channel') {
    const policy=c.channels.find(channel=>channel.id===event.channelId);
    if(!policy || event.audience!==policy.audience || (policy.userIds && !policy.userIds.includes(event.senderId)))return null;
    audience=policy.audience;
  } else return null;
  return createScopedOwner({...c,platform:'slack'},{spaceId:c.teamId,channelId:event.channelId,senderId:event.senderId,
    kind:event.kind,audience,threadId:event.threadId});
}
export function ownerFromToolContext(c,ctx,generation,turns) {
  const owner=turns.current(ctx.sessionKey)?.owner;
  if(!ownerMatchesContext(owner,ctx,generation))return null;
  const expected=resolveOwner(c,{teamId:owner.spaceId,channelId:owner.channelId,senderId:owner.senderId,
    kind:owner.kind,audience:owner.audience,threadId:owner.threadId});
  return expected?.key===owner.key ? owner : null;
}
