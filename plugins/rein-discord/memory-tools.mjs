import { createMemoryToolFactory as sharedFactory } from '@rein-protocol/isolation-core/memory-tools';
import { ownerFromToolContext } from './isolation.mjs';
export function createMemoryToolFactory(config,getMemory,turns) {
  return sharedFactory({...config,platform:'discord'},getMemory,turns,(ctx,generation)=>ownerFromToolContext(config,ctx,generation));
}
