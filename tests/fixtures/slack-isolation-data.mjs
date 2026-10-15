// Synthetic native IDs only; never install these in a live app.
export const config = path=>({agentId:'main',teamId:'TSYNTH001',appId:'ASYNTH001',botUserId:'USYNTHBOT',botTokenEnv:'REIN_TEST_SLACK_BOT',appTokenEnv:'REIN_TEST_SLACK_APP',memoryPath:path,requireMention:false,
  channels:[{id:'CSYNTHPUB',audience:'public'},{id:'GSYNTHPRI',audience:'private'}],dmAllowFrom:['USYNTHA01','USYNTHB02']});
export const event = (overrides={})=>({teamId:'TSYNTH001',channelId:'CSYNTHPUB',senderId:'USYNTHA01',audience:'public',kind:'channel',id:'1800000000.000001',text:'hello',...overrides});

export const body = (eventOverrides={},bodyOverrides={})=>({type:'event_callback',team_id:'TSYNTH001',api_app_id:'ASYNTH001',
  authorizations:[{team_id:'TSYNTH001',user_id:'USYNTHBOT',is_bot:true}],
  event:{type:'message',user:'USYNTHA01',channel:'CSYNTHPUB',text:'<@USYNTHBOT> hello',ts:'1800000000.000001',...eventOverrides},...bodyOverrides});
