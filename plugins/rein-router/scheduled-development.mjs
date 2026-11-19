// The native cron owner stays on main. Only the fixed program below runs in its
// headless scheduler. User text becomes a string argument to the sandbox child.
const workTools = ['read', 'write', 'edit', 'apply_patch', 'exec', 'process'];
const controlTools = ['sessions_spawn', 'agents_wait'];
const fail = message => { throw new Error(message); };

function spawnRequest(agentId, task) {
  return { runtime: 'subagent', agentId, task, collect: true, mode: 'run', sandbox: 'require',
    context: 'isolated', runTimeoutSeconds: 240 };
}

function scriptFor(agentId, message) {
  const request = spawnRequest(agentId, message);
  return [
    `const child = await sessions_spawn(${JSON.stringify(request)});`,
    'if (child.status !== "accepted" || !child.runId) throw Error("Sandbox worker did not start.");',
    'for (let attempt = 0; attempt < 9; attempt++) {',
    '  const wait = await agents_wait({ids: [child.runId], timeoutSeconds: 30});',
    '  const end = wait.completed.find(item => item.runId === child.runId);',
    '  if (end?.status === "done" && end.result) return {notify: end.result};',
    '  if (end || wait.errors?.length) throw Error("Sandbox worker failed.");',
    '}',
    'throw Error("Sandbox worker completion was not observed.");',
  ].join('\n');
}

export function scheduledWorkerPayload(agentId, message, requested = workTools) {
  if (typeof message !== 'string' || !message.trim() || message.length > 16000) fail('Invalid scheduled task.');
  if (!Array.isArray(requested) || requested.some(tool => !workTools.includes(tool)))
    fail('The scheduled development task requested tools outside its sandbox policy.');
  return { kind: 'script', script: scriptFor(agentId, message), toolsAllow: [...controlTools, ...new Set(requested)],
    timeoutSeconds: 300, toolBudget: 10 };
}

function verifiedPayload(payload, agentId) {
  if (payload?.kind !== 'script' || typeof payload.script !== 'string' ||
      Object.keys(payload).some(key => !['kind','script','timeoutSeconds','toolBudget','toolsAllow'].includes(key))) return;
  const match = /^const child = await sessions_spawn\(([^\n]*)\);\n/.exec(payload.script);
  if (!match) return;
  try {
    const request = JSON.parse(match[1]);
    if (payload.script === scriptFor(agentId, request.task) && typeof request.task === 'string' &&
        request.task.trim() && request.task.length <= 16000 &&
        Array.isArray(payload.toolsAllow) && controlTools.every(tool => payload.toolsAllow.includes(tool)) &&
        payload.toolsAllow.every(tool => controlTools.includes(tool) || workTools.includes(tool)) &&
        payload.timeoutSeconds === 300 && payload.toolBudget === 10) return request;
  } catch { /* Unrecognized programs retain native admin management. */ }
}

export function ownerThread(source) {
  const prefix = `agent:${source.agentId}:slack:channel:${source.chatId.toLowerCase()}:thread:`;
  const thread = source.sessionKey?.startsWith(prefix) && source.sessionKey.slice(prefix.length);
  return typeof thread === 'string' && /^\d+\.\d+$/.test(thread) ? thread : undefined;
}

export function scheduleInThread({ job, source, action, current, worker }) {
  const threadId = ownerThread(source);
  if (!threadId) fail('Create or adjust this automation in its Slack thread.');
  const delivery = { mode: 'announce', channel: 'slack', accountId: source.accountId,
    to: `channel:${source.chatId}`, threadId };
  if (action === 'update' && (!current || current.owner?.agentId !== source.agentId ||
      current.owner.accountId !== source.accountId || current.owner.sessionKey !== source.sessionKey))
    fail('This automation belongs to another thread.');
  const supported = ['name','description','displayName','enabled','deleteAfterRun','schedule','sessionTarget','payload','delivery','wakeMode','agentId'];
  if (Object.keys(job).some(key => !supported.includes(key)) ||
      (Object.hasOwn(job, 'sessionTarget') && job.sessionTarget !== 'isolated') ||
      (Object.hasOwn(job, 'schedule') && !['at','every','cron'].includes(job.schedule?.kind)) ||
      (job.agentId && job.agentId !== source.agentId)) fail('Use a time-based isolated automation in this thread.');
  if (Object.hasOwn(job, 'delivery') && (!job.delivery || typeof job.delivery !== 'object' || Array.isArray(job.delivery)))
    fail('The automation must deliver to its originating thread.');
  if (job.delivery && Object.entries(job.delivery).some(([key, value]) =>
    key === 'to' ? ![source.chatId, delivery.to].includes(value) : value !== delivery[key]))
    fail('The requested delivery differs from the originating thread.');
  if (action === 'update' && worker && !verifiedPayload(current.payload, worker))
    fail('The existing job uses a different execution policy.');
  let payload = job.payload;
  if (action === 'add' || payload !== undefined) {
    // Compact and canonical tool hooks both run. Accept only our exact program on replay.
    if (!(worker && verifiedPayload(payload, worker))) {
      if (payload?.kind !== 'agentTurn' || typeof payload.message !== 'string' ||
          Object.keys(payload).some(key => !['kind','message','toolsAllow'].includes(key))) fail('Supply an agentTurn task and its requested tools.');
      if (worker) payload = scheduledWorkerPayload(worker, payload.message, payload.toolsAllow);
      else {
        const allowed = payload.toolsAllow ?? [];
        if (!Array.isArray(allowed) || allowed.some(tool => !['web_fetch','web_search'].includes(tool)))
          fail('This channel supports reminders and public web lookups. Schedule development work in the development channel.');
        payload = { ...payload, toolsAllow: allowed };
      }
    }
  }
  return { ...job, ...(payload ? { payload } : {}), ...(action === 'add' ? { sessionTarget: 'isolated', delivery } : job.delivery ? { delivery } : {}) };
}

// Recognize the native headless invocation using the durable job, caller/turn,
// immutable source program and original thread. A model-selected session key is insufficient.
export async function scheduledSpawnAllowed(ctx, args, channels, readJob) {
  const match = /^cron-trigger:([0-9a-f-]{36}):[0-9a-f-]{36}$/.exec(ctx.runId ?? '');
  if (!match || ctx.sessionKey !== `agent:${ctx.agentId}:cron:${match[1]}:trigger`) return false;
  let job;
  try { job = await readJob(match[1]); } catch { return false; }
  if (ctx.abortSignal?.aborted || !args) return false;
  if (!job || job.agentId !== ctx.agentId || job.owner?.agentId !== ctx.agentId || job.sessionTarget !== 'isolated') return false;
  const channel = channels.find(entry => entry.accountId === job.owner.accountId &&
    job.delivery?.to === `channel:${entry.channelId}` && entry.agentId === args.agentId);
  if (!channel || job.delivery.mode !== 'announce' || job.delivery.channel !== 'slack' ||
      job.delivery.accountId !== channel.accountId || job.scheduledToolPolicy?.mode !== 'account' ||
      job.scheduledToolPolicy.ownerSessionKey !== job.owner.sessionKey || job.scheduledToolPolicy.ownerAccountId !== channel.accountId ||
      !job.delivery.threadId || job.delivery.threadId !== ownerThread({ ...job.owner, chatId: channel.channelId })) return false;
  const req = verifiedPayload(job.payload, channel.agentId);
  return Boolean(req && Object.keys(args).length === Object.keys(req).length && Object.entries(req).every(([key,value]) => args[key] === value));
}
