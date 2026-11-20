import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendRuntime } from '../plugins/rein-operations/backend-runtime.ts';
import { createMemberStatusToolRegistration } from '../plugins/rein-operations/member-status-tools.ts';

// Synthetic endpoint envelopes and host contexts; no network or organization account is used.
const linked = { ok: true, status: 'resolved', contact_id: 'private-fixture-contact',
  is_active_contributor: true, is_director: true,
  profile: { name: 'Fixture Member', email: 'private-fixture@example.invalid', joinedAt: '2026-10-01T00:00:00Z' } };
function fixture({ response = { ok: true, httpStatus: 200, body: linked }, context = {}, onResolve } = {}) {
  const calls = [];
  const runtime = createBackendRuntime({ communityOnly: true,
    config: { enabled: true, platform: 'discord',
      workspaces: [{ platform: 'discord', workspaceId: 'fixture-guild', nativeChannelIds: ['fixture-room'] }],
      proposalChannelIds: [], boardChannelIds: [],
      backendApiBaseUrlEnvVar: 'FIXTURE_URL', agentCallerIdEnvVar: 'FIXTURE_CALLER', agentCredentialEnvVar: 'FIXTURE_KEY' },
    env: { FIXTURE_URL: 'https://foundation.invalid', FIXTURE_CALLER: 'fixture-community', FIXTURE_KEY: 'fixture-key' },
    transport: {
      async relayIngress(tuple) {
        calls.push({ operation: 'relay', tuple });
        return { ok: true, httpStatus: 200, body: { assertion: `fixture-proof-${calls.length}` } };
      },
      async resolveIdentity(proof) {
        calls.push({ operation: 'identity', proof });
        onResolve?.();
        return response;
      },
      async operations() { throw new Error('Community self-check must not call governance operations'); },
    },
  });
  const ctx = { messageChannel: 'discord', nativeChannelId: 'fixture-room', requesterSenderId: 'fixture-sender',
    sessionId: 'fixture-session', assertInvocationCurrent() {}, ...context };
  return { calls, ctx, tool: createMemberStatusToolRegistration({ runtime }).create(ctx)[0] };
}

test('Community linked self-check uses current trusted proof and omits private email/contact', async () => {
  const { tool, calls } = fixture();
  for (const callId of ['first', 'second']) {
    const result = await tool.execute(callId, {});
    assert.equal(result.details.linked, true);
    assert.deepEqual(result.details.roles, ['community_member', 'contributor', 'director']);
    assert.equal(result.details.authorizesSpending, false);
    assert.deepEqual(result.details.profile, { name: 'Fixture Member', joinedAt: '2026-10-01T00:00:00Z' });
    assert.doesNotMatch(JSON.stringify(result), /email|contact|private-fixture|assertion|fixture-proof/);
  }
  assert.deepEqual(calls.map(call => call.operation), ['relay', 'identity', 'relay', 'identity']);
  assert.equal(calls[0].tuple.platform_user_id, 'fixture-sender');
  assert.equal(calls[0].tuple.workspace_id, 'fixture-guild');
  assert.notEqual(calls[0].tuple.event_id, calls[2].tuple.event_id);
  assert.notEqual(calls[1].proof.assertion, calls[3].proof.assertion);
});

test('Community unlinked, revoked and expired senders reveal no stale profile or roles', async () => {
  for (const status of ['identity_not_linked', 'identity_revoked', 'identity_expired']) {
    const { tool } = fixture({ response: { ok: true, httpStatus: 200, body: { ...linked, status } } });
    const result = await tool.execute('fixture-call', {});
    assert.equal(result.details.ok, true);
    assert.equal(result.details.status, status);
    assert.equal(result.details.linked, false);
    assert.equal(result.details.profile, null);
    assert.deepEqual(result.details.roles, []);
    assert.equal(result.details.isDirector, false);
    assert.equal(result.details.isActiveContributor, false);
    assert.doesNotMatch(JSON.stringify(result), /Fixture Member|private-fixture/);
  }
});

test('Community rejects every claimed identity and unknown argument before resolving identity', async () => {
  for (const args of [{ senderId: 'other' }, { requesterSenderId: 'other' }, { email: 'other@example.invalid' },
    { contactId: 'other' }, { role: 'director' }, { platform: 'slack' }, { agentId: 'main' }, { proof: 'forged' },
    { unexpected: true }, null, []]) {
    const { tool, calls } = fixture();
    const result = await tool.execute('fixture-call', args);
    assert.equal(result.details.ok, false);
    assert.equal(result.details.error, 'invalid_request');
    assert.equal(calls.some(call => call.operation === 'identity'), false);
  }
});

test('Community identity outages and malformed responses fail without claiming unlinked status', async () => {
  for (const response of [{ ok: false, reason: 'transport_error', httpStatus: null },
    { ok: false, reason: 'auth_error', httpStatus: 403 },
    { ok: true, httpStatus: 200, body: { ...linked, ok: false } },
    { ok: true, httpStatus: 200, body: { ...linked, status: 'unknown' } }]) {
    const { tool } = fixture({ response });
    const result = await tool.execute('fixture-call', {});
    assert.equal(result.isError, true);
    assert.equal(result.details.error, 'identity_check_unavailable');
    assert.equal(result.details.linked, undefined);
    assert.doesNotMatch(JSON.stringify(result), /private-fixture|Fixture Member/);
  }
});

test('Community self-check rejects missing trusted identity or unenrolled channel before backend access', async () => {
  for (const context of [{ requesterSenderId: '' }, { nativeChannelId: 'other-room' },
    { messageChannel: 'slack' }, { assertInvocationCurrent: undefined }]) {
    const { tool, calls } = fixture({ context });
    await assert.rejects(tool.execute('fixture-call', {}));
    assert.equal(calls.length, 0);
  }
});

test('Community self-check rechecks invocation after identity read', async () => {
  let active = true;
  const { tool } = fixture({ context: { assertInvocationCurrent() { if (!active) throw new Error('retired'); } },
    onResolve: () => { active = false; } });
  await assert.rejects(tool.execute('fixture-call', {}), /retired/);
});

test('website administrator standing comes from its own backend field', async () => {
  for (const value of [true, false, undefined]) {
    const body = { ...linked, is_administrator: value };
    const { tool } = fixture({ response: { ok: true, httpStatus: 200, body } });
    const result = await tool.execute('website-role', {});
    assert.equal(result.details.isDirector, true);
    assert.equal(result.details.isAdministrator, value ?? null);
  }
});
