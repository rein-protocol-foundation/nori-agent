// Scripted loopback model decoding only; this never supplies execution authority.
export function selectContinuationChildInput(messages) {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const parts = typeof message.content === 'string' ? [message.content]
      : (message.content ?? []).filter(part => part.type === 'text').map(part => part.text);
    for (const part of parts) {
      if (part.includes('[Internal task completion event]') || part.trimStart().startsWith('<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>')) continue;
      const match = part.match(/\[Subagent Task\]\s*CONTINUATION_(GAP|SUPPLEMENT)_CHILD:/);
      if (match) return match[1].toLowerCase();
    }
  }
  return undefined;
}
