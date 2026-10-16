import { createIsolatedReceiver as sharedReceiver } from '@rein-protocol/isolation-core/inbound';
import { resolveOwner, slackMessageId, CHANNEL_TOOLS, PRIVATE_TOOLS } from './isolation.mjs';
export function createIsolatedReceiver(options) {
  return sharedReceiver({...options,policy:{resolveOwner:event=>resolveOwner(options.config,event),
    validEventId:slackMessageId,toolsFor:owner=>owner.kind==='direct'?PRIVATE_TOOLS:CHANNEL_TOOLS}});
}
