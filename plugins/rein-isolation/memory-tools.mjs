import { Type } from 'typebox';
import { MEMORY_TOOLS, ownerMatchesContext } from './scope.mjs';

const result = details => ({ content: [{ type: /** @type {'text'} */ ('text'), text: JSON.stringify(details) }], details });
export function createMemoryToolFactory(config, getMemory, turns, resolveOwnerFromContext) {
  return ctx => {
    // Reject unrelated tool invocations before opening private storage.
    if (ctx.messageChannel !== config.platform || ctx.agentId !== config.agentId ||
        ctx.agentAccountId !== (config.accountId ?? 'default') || typeof ctx.assertInvocationCurrent !== 'function' ||
        !ctx.sessionKey?.includes(':rein-isolated-v1-')) return null;
    const memory = getMemory();
    const owner = resolveOwnerFromContext(ctx, memory.generation);
    if (!ownerMatchesContext(owner,ctx,memory.generation)) return null;
    const generation = memory.generation(owner);
    const assertCurrent = () => {
      ctx.assertInvocationCurrent();
      if (memory.generation(owner) !== generation) throw new Error('Memory scope has been reset; start a new turn');
    };
    const boundary = 'Only this verified native sender in this conversation and audience. Private conversation notes never cross into public replies. No user ID or audience argument is accepted.';
    return [
      { name: MEMORY_TOOLS[0], label: 'Read member notes', description: `Read current member notes, at most five per page within 16 KiB. Use name for one relevant note, or pass the returned nextCursor as after only if another page is needed. ${boundary}`,
        parameters: Type.Object({ name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })), after: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })) }, { additionalProperties: false }),
        async execute(_id, args = {}) { assertCurrent(); return result({ audience: owner.audience, ...memory.read(owner, args) }); } },
      { name: MEMORY_TOOLS[1], label: 'Remember member note', description: `Save one brief learning preference or note only when the member asks you to remember it. ${boundary} Do not store passwords, credentials or other secrets.`,
        parameters: Type.Object({ name: Type.String({ minLength: 1, maxLength: 80 }), value: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false }),
        async execute(_id, args) { assertCurrent(); memory.remember(owner, args.name, args.value, assertCurrent); return result({ saved: true, audience: owner.audience }); } },
      { name: MEMORY_TOOLS[2], label: 'Forget member notes', description: `Forget a named note, or all current notes when name is omitted. Ends the current model turn immediately; the host sends a fixed acknowledgement and starts fresh context. ${boundary}`,
        parameters: Type.Object({ name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })) }, { additionalProperties: false }),
        async execute(_id, args) {
          assertCurrent();
          const turn = turns?.current(ctx.sessionKey);
          if (!turn) throw new Error('Host-owned active turn is required to forget memory safely');
          turn.assertCurrent();
          try { memory.forget(owner, args.name, () => { assertCurrent(); turn.assertCurrent(); }); }
          catch (error) { turn.afterForgetFailure(); throw error; }
          turn.afterForget();
          return result({ forgotten: true, currentModelTurnEnded: true });
        } },
    ];
  };
}
