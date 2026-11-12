// Synthetic model decoder only. No native message, execution identity or record is changed.
export function selectM1ModelInput(messages) {
  const lastAssistant = messages.findLastIndex(message => message.role === 'assistant');
  const continuingTools = Boolean(messages[lastAssistant]?.tool_calls?.length);
  const lastFinalReply = messages.findLastIndex(message => message.role === 'assistant' && !message.tool_calls?.length);
  // A completion can also arrive before the FIRST inference of a new human turn.
  // Prefer its explicit fixture request over the coalesced native notification.
  for (let at = messages.length - 1; at > lastFinalReply; at--) {
    const message = messages[at]; if (message.role !== 'user') continue;
    const parts = typeof message.content === 'string' ? [message.content] : (message.content ?? []).filter(p => p.type === 'text').map(p => p.text);
    const text = parts.filter(p => !p.includes('[Internal task completion event]') && !p.trimStart().startsWith('<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>')).join('\n');
    const tag = text.match(/^(?:\s*|Goal: )(M1_[A-Z_]+)\s*$/m)?.[1];
    if (tag) return { at, tag };
  }
  for (let at = messages.length - 1; at >= 0; at--) {
    const message = messages[at]; if (message.role !== 'user') continue;
    const parts = typeof message.content === 'string' ? [message.content] : (message.content ?? []).filter(p => p.type === 'text').map(p => p.text);
    // Native completed-task content is inside an internal block; historical inventory there is not an instruction.
    const completion = parts.find(p => p.includes('[Internal task completion event]') &&
      (p.startsWith('<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>') || p.includes('[[OPENCLAW_INTERNAL_CONTEXT_BEGIN]]')));
    const notification = completion || parts.some(p => p.startsWith('Native progress notification:'));
    // Native completion/progress can be injected after a tool result in the SAME turn.
    // A final assistant reply, rather than the last message's role, ends that tool chain.
    if (notification && continuingTools && at > lastFinalReply) continue;
    if (completion) {
      const event = completion.slice(completion.indexOf('[Internal task completion event]')).split(/Stats:|Conversation data/)[0].replaceAll('\\n', '\n');
      return { at, tag: event.includes('M1_SHORTLIST_DATA') || /task:\s*m1-research/.test(event) ? 'M1_RESEARCH_COMPLETION' : 'M1_ACP_COMPLETION',
        sourceSessionKey: event.match(/session_key:\s*(agent:[A-Za-z0-9:_-]+)/)?.[1] };
    }
    const text = parts.filter(p => !p.trimStart().startsWith('<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>')).join('\n');
    const tag = text.match(/^(?:\s*|Goal: )(M1_[A-Z_]+)\s*$/m)?.[1];
    if (tag) return { at, tag };
    // Never replay a historic human command for an untagged current native/background turn.
    if (text.trim() && messages.at(-1)?.role !== 'tool') return { at, tag: 'M1_OTHER' };
  }
  return { at: -1, tag: 'M1_OTHER' };
}
