import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoundationAdminAuthorizer } from '../plugins/rein-router/foundation-admin.ts';

const config = { enabled: true, workspaces: [{ platform: 'slack', workspaceId: 'T_FIXTURE', nativeChannelIds: ['C_FIXTURE'] }],
  proposalChannelIds: ['C_FIXTURE'], boardChannelIds: ['C_FIXTURE'], backendApiBaseUrlEnvVar: 'TEST_BACKEND_URL',
  agentCallerIdEnvVar: 'TEST_CALLER_ID', agentCredentialEnvVar: 'TEST_CALLER_CREDENTIAL' };
const env = { TEST_BACKEND_URL: 'http://127.0.0.1:9999', TEST_CALLER_ID: 'fixture', TEST_CALLER_CREDENTIAL: 'PRIVATE_CREDENTIAL_CANARY' };
const context = { runId: 'run-one', agentId: 'main', sessionKey: 'agent:main:slack:isolated-alice', accountId: 'default',
  channel: 'slack', messageProvider: 'slack', senderId: 'U_ALICE', chatId: 'C_FIXTURE', channelId: 'isolated-alice',
  trigger: 'user', inputProvenance: { kind: 'external_user' } };
const success = body => ({ ok: true, httpStatus: 200, body });
const member = extra => ({ ok: true, status: 'resolved', contact_id: 'PRIVATE_CONTACT_CANARY', is_administrator: true, ...extra });

test('Foundation admin proof is derived from trusted native ingress and checked anew for each request', async () => {
  const calls = [];
  const check = createFoundationAdminAuthorizer({ config, env, transport: {
    relayIngress: async tuple => { calls.push(tuple); return success({ ok: true, assertion: 'PRIVATE_ASSERTION_CANARY' }); },
    resolveIdentity: async proof => { assert.deepEqual(proof, { kind: 'assertion', assertion: 'PRIVATE_ASSERTION_CANARY' }); return success(member()); },
  } });
  assert.equal(await check(context), true);
  assert.equal(await check({ ...context, runId: 'run-two' }), true);
  assert.equal(await check({ ...context, runId: 'run-three', inputProvenance: undefined }), true);
  assert.equal(await check(context), true);
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map(call => call.event_id)).size, 4, 'Repeated tool checks in one run must not replay an assertion event');
  assert.notEqual(calls[0].event_id, calls[1].event_id);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['channel_id','event_id','event_ts','platform','platform_user_id','workspace_id']);
  assert.equal(calls[0].platform_user_id, 'U_ALICE');
  assert.equal(calls[0].workspace_id, 'T_FIXTURE');
  assert.equal(calls[0].channel_id, 'C_FIXTURE');
  assert.ok(!JSON.stringify(calls).includes('PRIVATE_'));
});

test('missing, conflicting, unenrolled and non-human contexts cannot query backend authority', async () => {
  let calls = 0;
  const transport = { relayIngress: async () => { calls++; throw new Error('must not query'); } };
  for (const delta of [{ senderId: undefined }, { runId: undefined }, { sessionKey: undefined }, { accountId: undefined },
    { chatId: undefined }, { chatId: 'C_OTHER' }, { channel: 'discord' }, { messageProvider: 'discord' },
    { trigger: undefined }, { inputProvenance: { kind: 'internal_system' } },
    { inputProvenance: { kind: 'inter_session' } }, { trigger: 'cron' },
    { channelContext: { sender: { id: 'U_BOB' } } }, { channelContext: { chat: { id: 'C_OTHER' } } }]) {
    assert.equal(await createFoundationAdminAuthorizer({ config, env, transport })({ ...context, ...delta }), false);
  }
  const ambiguous = { ...config, workspaces: [...config.workspaces, { ...config.workspaces[0], workspaceId: 'T_OTHER' }] };
  for (const c of [undefined, { enabled: false }, ambiguous])
    assert.equal(await createFoundationAdminAuthorizer({ config: c, env, transport })(context), false);
  assert.equal(calls, 0);
});

test('only explicit current backend administrator authority is accepted', async () => {
  for (const body of [member({ is_administrator: false }), member({ is_administrator: 'true' }),
    member({ is_administrator: undefined, is_director: true, roles: ['admin'] }), member({ status: 'identity_revoked' }),
    member({ status: 'identity_not_linked' }), member({ contact_id: null }), member({ ok: false }), null]) {
    const check = createFoundationAdminAuthorizer({ config, env, transport: {
      relayIngress: async () => success({ ok: true, assertion: 'fixture' }), resolveIdentity: async () => success(body),
    } });
    assert.equal(await check(context), false);
  }
  for (const stage of ['relayIngress', 'resolveIdentity']) {
    for (const outcome of [async () => ({ ok: false, reason: 'auth_error' }), async () => { throw new Error('PRIVATE_CANARY'); }]) {
      const transport = { relayIngress: async () => success({ ok: true, assertion: 'fixture' }), resolveIdentity: async () => success(member()), [stage]: outcome };
      assert.equal(await createFoundationAdminAuthorizer({ config, env, transport })(context), false);
    }
  }
});

test('development authority accepts only resolved current Contributor, Director or administrator roles', async () => {
  const { createFoundationDeveloperAuthorizer } = await import('../plugins/rein-router/foundation-admin.ts');
  let body;
  const check=createFoundationDeveloperAuthorizer({config,env,transport:{relayIngress:async()=>success({ok:true,assertion:'fixture'}),resolveIdentity:async()=>success(body)}});
  for(const role of ['is_active_contributor','is_director','is_administrator']){
    body=member({is_administrator:false,[role]:true});assert.equal(await check(context),true);
    body[role]=false;assert.equal(await check(context),false);
    body[role]='true';assert.equal(await check(context),false);
    body[role]=true;body.status='identity_revoked';assert.equal(await check(context),false);
  }
});
