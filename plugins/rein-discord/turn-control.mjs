// Host-owned active-turn capabilities. Never serialized into model context or
// accepted as tool arguments; one scoped session has at most one active turn.
export function createTurnControl() {
  const active = new Map();
  return {
    current(key) { return active.get(key); },
    open(key, gatewaySignal) {
      if (active.has(key)) throw new Error('Isolated session already has an active turn');
      const controller = new AbortController();
      const entry = {
        forgotten: false,
        forgetOutcome: null,
        signal: AbortSignal.any([gatewaySignal,controller.signal]),
        assertCurrent() {
          if (active.get(key) !== entry || entry.signal.aborted) throw new Error('Isolated turn is no longer current');
        },
        afterForget() {
          // Called synchronously after the memory transaction commits. Mark
          // delivery suppressed before aborting the old-context model loop.
          entry.forgotten = true;
          entry.forgetOutcome = 'committed';
          controller.abort(new Error('Member memory forgotten; end the current model turn'));
        },
        afterForgetFailure() {
          entry.forgetOutcome = 'failed';
          controller.abort(new Error('Memory deletion failed; use host-owned failure acknowledgement'));
        },
        close() { if (active.get(key) === entry) active.delete(key); },
      };
      active.set(key,entry);
      return entry;
    },
  };
}

// Tool Search can register a second executable plugin graph in the same host
// process. Share only host-owned cancellation capabilities across those graphs,
// keyed by the trusted profile's private state path. Tools must still prove the
// current sender/session and live invocation before using a capability.
const hostRegistryKey = Symbol.for('rein.protocol.discord.active-turn-controls.v1');
export function getHostTurnControl(statePath) {
  const registry = globalThis[hostRegistryKey] ??= new Map();
  if (!registry.has(statePath)) registry.set(statePath,createTurnControl());
  return registry.get(statePath);
}
