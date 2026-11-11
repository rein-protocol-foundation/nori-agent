// Synthetic loopback model protocol only; never a runtime authority or native-input rewrite.
const INTERNAL = '<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>';
const TAG = /^\s*(?:\[cron:[^\n]+?\]\s*)?(SA_(?:CREATE_A|CREATE_B|UPDATE_A|DECLARE_A|DISABLE_A|ENABLE_A|CREATE_DISABLED|CREATE_REMOVED|REMOVE|PUBLIC_CREATE|PUBLIC_SPAWN|PUBLIC_SEND|NATIVE_CHILD|CHILD_RESULT|UNAUTHORIZED_CREATE|CRON_A|CRON_B|CRON_DISABLED|CRON_REMOVED))\s*$/m;
const textOf = content => (typeof content === 'string' ? [content] : Array.isArray(content)
  ? content.filter(block=>block?.type==='text').map(block=>block.text) : [])
  .filter(text=>typeof text==='string' && !text.trimStart().startsWith(INTERNAL)).join('\n');
export function selectSaOpsFixtureInput(messages) {
  for(let at=messages.length-1;at>=0;at--){
    const message=messages[at];if(message.role!=='user')continue;
    const text=textOf(message.content),tag=text.match(TAG)?.[1];
    if(tag)return {at,tag};
    if(/^source:\s*subagent\s*$/m.test(text) && /^ACK SA_CHILD_RESULT\s*$/m.test(text))
      return {at,tag:'SA_CHILD_RESULT'};
  }
  return {at:-1,tag:undefined};
}
