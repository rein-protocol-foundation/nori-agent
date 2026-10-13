import { Type } from 'typebox';
import { ownerFromToolContext, MEMORY_TOOLS } from './isolation.mjs';

const result = details => ({ content: [{ type: /** @type {'text'} */ ('text'), text: JSON.stringify(details) }], details });
export function createMemoryToolFactory(config, getMemory) {
  return ctx => {
    // Reject unrelated tool invocations before opening private storage.
    if (ctx.messageChannel !== 'discord' || ctx.agentId !== config.agentId ||
        ctx.agentAccountId !== 'default' || typeof ctx.assertInvocationCurrent !== 'function' ||
        !ctx.sessionKey?.includes(':rein-isolated-v1-')) return null;
    const memory = getMemory();
    const owner = ownerFromToolContext(config, ctx, memory.generation);
    if (!owner) return null;
    const generation = memory.generation(owner);
    const assertCurrent = () => {
      ctx.assertInvocationCurrent();
      if (memory.generation(owner) !== generation) throw new Error('Memory scope has been reset; start a new turn');
    };
    const boundary = 'Only this verified Discord sender in this conversation and audience. Private DM memory is never readable in a public channel. No user ID or audience argument is accepted.';
    return [
      { name: MEMORY_TOOLS[0], label: 'Read member notes', description: `Read your current member memory notes. ${boundary}`,
        parameters: Type.Object({}, { additionalProperties: false }),
        async execute() { assertCurrent(); return result({ audience: owner.audience, notes: memory.read(owner) }); } },
      { name: MEMORY_TOOLS[1], label: 'Remember member note', description: `Save one brief learning preference or note only when the member asks you to remember it. ${boundary} Do not store passwords, credentials or other secrets.`,
        parameters: Type.Object({ name: Type.String({ minLength: 1, maxLength: 80 }), value: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false }),
        async execute(_id, args) { assertCurrent(); memory.remember(owner, args.name, args.value, assertCurrent); return result({ saved: true, audience: owner.audience }); } },
      { name: MEMORY_TOOLS[2], label: 'Forget member notes', description: `Forget a named note, or all current notes when name is omitted. Starts a fresh conversation so old context cannot reintroduce forgotten notes. ${boundary}`,
        parameters: Type.Object({ name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })) }, { additionalProperties: false }),
        async execute(_id, args) { assertCurrent(); memory.forget(owner, args.name, assertCurrent); return result({ forgotten: true, freshConversationOnNextMessage: true }); } },
    ];
  };
}
