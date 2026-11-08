import { createAssistantMessageEventStream } from 'openclaw/plugin-sdk/llm';

const statusOf = message => {
  if (Number.isInteger(message?.status)) return message.status;
  if (/^\d{3}$/.test(message?.errorCode ?? '')) return Number(message.errorCode);
  const match = /^\s*(?:error[:\s-]+)?(?:http\s*)?(\d{3})\b/i.exec(message?.errorMessage ?? '');
  return match ? Number(match[1]) : undefined;
};
export const canFallback = message => message?.stopReason === 'error' &&
  [408, 429, 500, 502, 503, 504].includes(statusOf(message));

/** The SDK exposes no per-turn fallback override. Retry only before any output is released. */
export function createScopedFallbackStream({ routes, invoke, signal, assertCurrent, onAttempt = () => {} }) {
  const output = createAssistantMessageEventStream();
  void (async () => {
    try {
      for (let index = 0; index < routes.length; index++) {
        signal?.throwIfAborted(); assertCurrent();
        const route = routes[index];
        onAttempt(route);
        const source = await invoke(route);
        let started; let released = false; let terminal; let retry = false;
        for await (const event of source) {
          signal?.throwIfAborted(); assertCurrent();
          if (event.type === 'start' && !released) { started = event; continue; }
          if (event.type === 'error') {
            terminal = event.error;
            retry = !released && event.reason !== 'aborted' && canFallback(terminal) && index + 1 < routes.length;
            if (retry) break;
          }
          if (started) { output.push(started); started = undefined; }
          released = true;
          output.push(event);
          if (event.type === 'done') terminal = event.message;
        }
        if (retry) { await source.result(); continue; }
        if (!terminal) {
          terminal = await source.result();
          signal?.throwIfAborted(); assertCurrent();
          if (!released && canFallback(terminal) && index + 1 < routes.length) continue;
        }
        output.end(terminal);
        return;
      }
      throw new Error('rein_router_routes_exhausted');
    } catch {
      // Never expose provider exceptions (which may echo keys/prompts). A failed or cancelled
      // request has no implicit emergency route. No retry after unknown/partial outcomes.
      output.end();
    }
  })();
  return output;
}
