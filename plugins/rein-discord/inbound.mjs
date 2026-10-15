import { createIsolatedReceiver as sharedReceiver } from '@rein-protocol/isolation-core/inbound';
import { resolveOwner, PUBLIC_TOOLS, PRIVATE_TOOLS } from './isolation.mjs';
export function createIsolatedReceiver(options) {
  return sharedReceiver({...options,send:(channel,text,id)=>options.send(channel,text,id),policy:{resolveOwner:event=>resolveOwner(options.config,event),
    validEventId:id=>/^[0-9]{17,20}$/.test(id ?? ''),
    toolsFor:owner=>owner.audience==='public'?PUBLIC_TOOLS:PRIVATE_TOOLS}});
}
