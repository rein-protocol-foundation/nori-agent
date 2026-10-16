// Synthetic Socket Mode and Web API edges. Production transport admission,
// registration, memory tools and native host pipeline run unchanged.
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import production,{registerReinSlack} from '../../plugins/rein-slack/index.ts';
import { startIsolatedSlack } from '../../plugins/rein-slack/gateway.mjs';
import { resolveOwner } from '../../plugins/rein-slack/isolation.mjs';

export default {...production,register(api) {
  registerReinSlack(api,async params=>{
    const {config,memory}=params;const trace=[],sent=[],acks=[];const socket=new EventEmitter();
    const base={type:'message',user:'USYNTHA01',channel:'CSYNTHPUB'};
    const cases=[
      {...base,text:'CASE_A1 ALICE_PUBLIC_CANARY_7406'},
      {...base,user:'USYNTHB02',text:'CASE_B1 What do you know about me?'},
      {...base,channel:'DSYNTH001',text:'CASE_DM ALICE_PRIVATE_CANARY_3281'},
      {...base,channel:'GSYNTHPRI',text:'CASE_PRIVATE Read the Board funds snapshot.'},
      {...base,channel:'GSYNTHPRI',user:'USYNTHB02',text:'CASE_BOARD_B Read the Board funds snapshot.'},
      {...base,text:'CASE_A2 What do you know about me?'},
      {...base,user:'USYNTHB02',text:'CASE_B2 What do you know about me?'},
      {...base,thread_ts:'1800000001.000001',text:'CASE_THREAD_A THREAD_CONTEXT_CANARY'},
      {...base,thread_ts:'1800000001.000001',user:'USYNTHB02',text:'CASE_THREAD_B What do you know about me?'},
      {...base,thread_ts:'1800000001.000001',text:'CASE_THREAD_A2 What do you know about me?'},
      {...base,thread_ts:'1800000001.000002',text:'CASE_THREAD_NEW What do you know about me?'},
      {...base,text:'!reset'},
      {...base,text:'CASE_A3 Start fresh.'},
      {...base,text:'CASE_TOOL_FORGET Please forget my saved note.'},
      {...base,text:'CASE_AFTER_TOOL_FORGET Check my notes.'},
      {...base,text:'!forget'},
      {...base,text:'CASE_A4 Check forgotten notes.'},
    ];
    socket.start=async()=>{
      socket.emit('connected');
      try {
        for(const [index,event] of cases.entries()) {
          const ts=`1800000000.${String(index+1).padStart(6,'0')}`;
          const body={type:'event_callback',team_id:config.teamId,api_app_id:config.appId,
            authorizations:[{team_id:config.teamId,user_id:config.botUserId,is_bot:true}],event:{...event,ts}};
          await socket.listeners('slack_event')[0]({body,ack:async()=>{acks.push(ts);}});
        }
        const dm=resolveOwner(config,{teamId:config.teamId,senderId:'USYNTHA01',channelId:'DSYNTH001',kind:'direct'});
        const privateMemorySaved=memory.read(dm).notes.some(n=>n.value==='ALICE_PRIVATE_MEMORY_9921');
        writeFileSync(process.env.REIN_ISOLATION_EVIDENCE_PATH,JSON.stringify({trace,sent,acks,privateMemorySaved}));
      } catch(error) {writeFileSync(process.env.REIN_ISOLATION_EVIDENCE_PATH,JSON.stringify({error:String(error),trace,sent,acks}));}
    };
    socket.disconnect=async()=>{};
    const web={auth:{async test(){return {ok:true,team_id:config.teamId,user_id:config.botUserId,bot_id:'BSYNTH001'};}},
      conversations:{async info({channel}){return {ok:true,channel:{id:channel,is_im:channel[0]==='D',user:'USYNTHA01',is_private:channel[0]==='G',is_ext_shared:false,is_mpim:false}};}},
      chat:{async postMessage(payload){sent.push(payload);return {ok:true};}}};
    return await startIsolatedSlack({...params,trace:entry=>trace.push(entry)},{web,socket});
  });
}};
