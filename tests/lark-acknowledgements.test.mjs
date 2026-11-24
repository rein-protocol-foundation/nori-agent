import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAcknowledgements } from '../plugins/rein-lark-acknowledgements/index.mjs';

const roles = { internal: 'main', community: 'nori-community' };
function mention(role, overrides = {}) {
  return { sendPolicy: 'allow', ctx: {
    Provider: 'feishu', Surface: 'feishu', ChatType: 'group', InboundEventKind: 'user_request',
    InboundAccessAuthorized: true, WasMentioned: true, AccountId: 'lark-' + role, AgentId: roles[role],
    NativeChannelId: 'oc_' + role, SenderId: 'ou_member', MessageSid: 'om_mention', ReplyToId: 'om_parent',
    ...overrides,
  } };
}
function fixture(request) {
  const warnings = [];
  const callbacks = {};
  const accounts = Object.fromEntries(Object.keys(roles).map(role => ['lark-' + role, {
    enabled: true, appId: role, appSecret: 'fixture', groupAllowFrom: ['oc_' + role],
    ...(role === 'internal' && { groupSenderAllowFrom: ['ou_member'] }),
  }]));
  const cfg = { channels: { feishu: { enabled: true, domain: 'lark', accounts } } };
  registerAcknowledgements({
    logger: { info() {}, warn: text => warnings.push(text) },
    lifecycle: { onDispose(fn) { callbacks.stop = fn; } },
    on(name, fn) { assert.equal(name, 'reply_dispatch'); callbacks.dispatch = fn; },
  }, request);
  return { warnings, accounts, stop: callbacks.stop, dispatch: event => callbacks.dispatch(event, { cfg }) };
}

test('each Lark bot acknowledges the incoming message with OK and continues normal dispatch', async () => {
  const auth = [], reactions = [];
  const f = fixture(async (path, body, signal, token) => {
    signal.throwIfAborted();
    if (token) { reactions.push({ path, body, token }); return { data: { reaction_id: 'fixture' } }; }
    auth.push(body.app_id);
    return { tenant_access_token: body.app_id, expire: 7200 };
  });
  const events = [mention('community'), mention('internal'), mention('community', { MessageSid: 'om_next' })];
  assert.deepEqual(await Promise.all(events.map(f.dispatch)), [undefined, undefined, undefined]);
  assert.deepEqual(auth, ['community', 'internal']);
  assert.equal(reactions.length, events.length);
  assert.deepEqual(new Set(reactions), new Set(events.map(({ ctx }) => ({ path: `im/v1/messages/${ctx.MessageSid}/reactions`,
    body: { reaction_type: { emoji_type: 'OK' } }, token: ctx.AccountId.slice(5) }))));
  assert.deepEqual(f.warnings, []);
});

test('other accounts, groups, senders, DMs and suppressed or synthetic turns produce no reaction', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; });
  for (const change of [{ AgentId: 'nori-community' }, { AccountId: 'unknown' }, { Provider: 'slack' },
    { NativeChannelId: 'oc_community' }, { SenderId: 'ou_other' }, { WasMentioned: false },
    { ChatType: 'direct' }, { SenderIsBot: true }, { SenderIsSelf: true }, { MessageSid: 'om_a/../../' },
    { InboundAccessAuthorized: false }, { InboundEventKind: 'reaction' }, { InputProvenance: { kind: 'inter_session' } }])
    await f.dispatch(mention('internal', change));
  for (const change of [{ sendPolicy: 'deny' }, { suppressUserDelivery: true }, { isTailDispatch: true },
    { shouldRouteToOriginating: true }, { suppressReplyLifecycle: true }])
    await f.dispatch({ ...mention('internal'), ...change });
  f.accounts['lark-internal'].actions = { reactions: false };
  await f.dispatch(mention('internal'));
  f.stop();
  await f.dispatch(mention('community'));
  assert.equal(calls, 0);
});

test('token or reaction failure lets the reply proceed and the next mention can succeed', async () => {
  let attempts = 0;
  const f = fixture(async (_path, _body, _signal, token) => {
    if (++attempts === 1) throw new Error('fixture auth failure');
    if (!token) return { tenant_access_token: 'fixture', expire: 7200 };
    return attempts === 3 ? { data: {} } : { data: { reaction_id: 'fixture' } };
  });
  for (const MessageSid of ['om_first', 'om_second', 'om_third'])
    assert.equal(await f.dispatch(mention('internal', { MessageSid })), undefined);
  assert.equal(attempts, 4);
  assert.equal(f.warnings.length, 2);
});
