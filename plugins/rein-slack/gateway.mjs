import { createIsolatedReceiver } from './inbound.mjs';
import { slackUserId, slackMessageId } from './isolation.mjs';
import { splitReply } from '@rein-protocol/isolation-core/reply-chunks';
import { createOwnerQueue } from '@rein-protocol/isolation-core/scope';

// Pure admission runs synchronously at receipt, before acknowledgement/metadata
// awaits. Freeze only authenticated native fields and current user text.
export function admitSlackEvent(config,body) {
  const event=body?.event;
  if(body?.type!=='event_callback' || body.team_id!==config.teamId || body.api_app_id!==config.appId ||
    body.is_ext_shared_channel===true || !Array.isArray(body.authorizations) ||
    !body.authorizations.some(a=>a?.team_id===config.teamId && a.user_id===config.botUserId && a.is_bot===true) ||
    !event || (event.team!==undefined && event.team!==config.teamId) || !['message','app_mention'].includes(event.type) ||
    event.subtype || event.bot_id || event.hidden || !slackUserId(event.user) || event.user===config.botUserId ||
    !slackMessageId(event.ts) || typeof event.channel!=='string' || typeof event.text!=='string' || !event.text.trim() || event.text.length>4000 ||
    (event.thread_ts!==undefined && !slackMessageId(event.thread_ts))) return null;
  const direct=/^D[A-Z0-9]{8,31}$/.test(event.channel??'');
  const policy=config.channels.find(channel=>channel.id===event.channel);
  if(direct ? !config.dmAllowFrom.includes(event.user) : !policy || (policy.userIds && !policy.userIds.includes(event.user))) return null;
  const mention=`<@${config.botUserId}>`,mentioned=event.text.includes(mention);
  if(!direct && config.requireMention!==false && !mentioned)return null;
  const text=event.text.split(mention).join('').trim();
  const controls={'!new':'/new','!reset':'/reset','!forget':'/forget'};
  return Object.freeze({teamId:config.teamId,channelId:event.channel,senderId:event.user,kind:direct?'direct':'channel',
    audience:direct?'private':policy.audience,id:event.ts,threadId:event.thread_ts,
    text:Object.hasOwn(controls,text)?controls[text]:text,mentioned,timestamp:Number(event.ts)*1000});
}

// Visibility is always fresh: cached public metadata must not survive a change.
async function verifyConversation(event,web) {
  const response=await web.conversations.info({channel:event.channelId});
  const channel=response.channel,direct=event.kind==='direct';
  if(response.ok!==true || !channel || channel.id!==event.channelId || channel.is_mpim || channel.is_ext_shared ||
     (direct ? channel.is_im!==true || channel.user!==event.senderId : channel.is_im===true ||
       typeof channel.is_private!=='boolean' || (channel.is_private?'private':'public')!==event.audience)) return null;
  // Lookup only the authenticated sender. Missing scopes/rate limits must not block chat.
  try {
    const result = await web.users.info({ user: event.senderId });
    const user = result?.user;
    if (result?.ok === true && user?.id === event.senderId && user?.team_id === event.teamId) {
      return Object.freeze({ ...event, senderUsername: user.name,
        senderName: user.profile?.display_name || user.real_name || user.name });
    }
  } catch { /* Profile is optional; do not log private provider payloads. */ }
  return event;
}
export async function normalizeSlackEvent(config,body,web) {
  const event=admitSlackEvent(config,body);
  return event ? await verifyConversation(event,web) : null;
}
export async function createSlackClients(botToken,appToken,log) {
  const [{WebClient},{SocketModeClient}]=await Promise.all([import('@slack/web-api'),import('@slack/socket-mode')]);
  const logger={debug(){},info(){},warn(){log?.warn?.('rein-slack SDK warning; details omitted');},error(){log?.warn?.('rein-slack SDK error; details omitted');},setLevel(){},getLevel(){return 'error';},setName(){}};
  return {web:new WebClient(botToken,{logger,rejectRateLimitedCalls:true,maxRequestConcurrency:8}),
    socket:new SocketModeClient({appToken,logger})};
}
export async function startIsolatedSlack({config,cfg,runtime,memory,turns,signal,status,log,trace = () => {}}, injectedClients) {
  const botToken=process.env[config.botTokenEnv],appToken=process.env[config.appTokenEnv];
  if(!botToken || !appToken)throw new Error('Configured Slack token environment variables are empty');
  const {web,socket}=injectedClients ?? await createSlackClients(botToken,appToken,log);
  let auth;
  try {auth=await web.auth.test();} catch {throw new Error('Slack bot identity verification failed; details omitted');}
  if(auth?.ok!==true || auth.team_id!==config.teamId || auth.user_id!==config.botUserId || !auth.bot_id)
    throw new Error('Slack bot identity does not match the isolated profile');
  const send=async(channelId,text,_messageId,owner)=>{
    for(const content of splitReply(text,3000)) {
      if(signal.aborted)throw new Error('Receiver stopped');
      await web.chat.postMessage({channel:channelId,text:content,thread_ts:owner.threadId,
        mrkdwn:false,parse:'none',unfurl_links:false,unfurl_media:false});
    }
  };
  const receive=createIsolatedReceiver({config,cfg,runtime,memory,turns,send,signal,trace});
  const admissionQueue=createOwnerQueue();let pending=0;
  socket.on('slack_event',async({body,ack})=>{
    // Acknowledge immediately even while this sender has an earlier model turn.
    // Attach rejection handling now, but do not await before reserving its lane.
    const ackFailed=()=>{log?.warn?.('rein-slack acknowledgement failed; details omitted');return false;};
    let acknowledged;
    try {acknowledged=Promise.resolve(ack()).then(()=>true,ackFailed);} catch {ackFailed();return;}
    const event=admitSlackEvent(config,body);
    if(!event || signal.aborted || pending>=64)return;
    const lane=JSON.stringify([config.appId,config.teamId,config.botUserId,event.channelId,event.threadId,event.senderId]);
    pending++;
    try {
      await admissionQueue(lane,async()=>{
        if(!await acknowledged || signal.aborted)return;
        const verified=await verifyConversation(event,web);
        if(verified && !signal.aborted)await receive(verified);
      });
    } catch {log?.warn?.('rein-slack event failed; private input and error details omitted');}
    finally {pending--;}
  });
  socket.on('error',()=>log?.warn?.('rein-slack connection error; details omitted'));
  socket.on('disconnected',()=>{if(!signal.aborted)status({accountId:'default',running:true,connected:false});});
  socket.on('connected',()=>{if(!signal.aborted)status({accountId:'default',running:true,connected:true,lastError:null});});
  const stop=()=>{void socket.disconnect().catch(()=>log?.warn?.('rein-slack shutdown failed; details omitted'));};
  signal.addEventListener('abort',stop,{once:true});
  try {
    if(signal.aborted)return;
    try {await socket.start();} catch {throw new Error('Slack Socket Mode startup failed; details omitted');}
    await new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});
  } finally {
    signal.removeEventListener('abort',stop);
    try {await socket.disconnect();} catch {log?.warn?.('rein-slack shutdown failed; details omitted');}
    status({accountId:'default',running:false,connected:false});
  }
}
