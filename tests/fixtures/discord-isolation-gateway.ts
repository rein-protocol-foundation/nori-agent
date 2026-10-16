// Test-only transport. Production registration, active-turn control and the
// host-bound runtime run unchanged; no Discord or Foundation call is made.
import { writeFileSync } from 'node:fs';
import production, { registerReinDiscord } from '../../plugins/rein-discord/index.ts';
import { createIsolatedReceiver } from '../../plugins/rein-discord/inbound.mjs';
import { resolveOwner } from '../../plugins/rein-discord/isolation.mjs';

export default {
  ...production,
  register(api) {
    const testApi = new Proxy(api, {
      get(target, property) {
        if (property !== 'registerChannel') return Reflect.get(target, property);
        return channel => target.registerChannel({ ...channel, config: { ...channel.config, isConfigured: () => true } });
      },
    });
    registerReinDiscord(testApi, async ({config,cfg,runtime,memory,turns,signal}) => {
      const trace = [];
      const sent = [];
      const receive = createIsolatedReceiver({ config, cfg, runtime, memory, turns, signal,
        send: async (...args) => { sent.push(args); }, trace: entry => trace.push(entry) });
      const base = { guildId: '100000000000000001', channelId: '100000000000000002', kind: 'channel' };
      const cases = [
        { ...base, senderId:'100000000000000003', text:'CASE_A1 ALICE_PUBLIC_CANARY_7406' },
        { ...base, senderId:'100000000000000004', text:'CASE_B1 Tell me what you know about me.' },
        { guildId:null, channelId:'100000000000000005', kind:'direct', senderId:'100000000000000003', text:'CASE_DM ALICE_PRIVATE_CANARY_3281' },
        { ...base, senderId:'100000000000000003', text:'CASE_A2 Tell me what you know about me.' },
        { ...base, senderId:'100000000000000004', text:'CASE_B2 Tell me what you know about me.' },
        { ...base, senderId:'100000000000000003', text:'/reset' },
        { ...base, senderId:'100000000000000003', text:'CASE_A3 Start fresh.' },
        { ...base, senderId:'100000000000000003', text:'CASE_TOOL_FORGET Please forget my saved note.' },
        { ...base, senderId:'100000000000000003', text:'CASE_AFTER_TOOL_FORGET Check my notes.' },
        { ...base, senderId:'100000000000000003', text:'/forget' },
        { ...base, senderId:'100000000000000003', text:'CASE_A4 Check forgotten notes.' },
      ];
      try {
        for (const [index,event] of cases.entries()) await receive({ ...event, id:String(100000000000000010n+BigInt(index)) });
        const privateMemorySaved = memory.read(resolveOwner(config,cases[2])).notes.some(note => note.value === 'ALICE_PRIVATE_MEMORY_9921');
        writeFileSync(process.env.REIN_ISOLATION_EVIDENCE_PATH, JSON.stringify({trace,sent,privateMemorySaved}));
      } catch (error) {
        writeFileSync(process.env.REIN_ISOLATION_EVIDENCE_PATH, JSON.stringify({error:String(error),trace,sent}));
      } finally { memory.close(); }
      await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, {once:true}); });
    });
  },
};
