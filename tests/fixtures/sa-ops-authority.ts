// Test-only imports of the pinned host's actual context projection. Never import these in plugins.
import assert from 'node:assert/strict';
import { buildEmbeddedAgentHookContext } from '../../vendor/openclaw/src/agents/embedded-agent-runner/run/agent-hook-context.js';
import { buildAgentHookContext } from '../../vendor/openclaw/src/agents/harness/hook-context.js';
import { createRouter } from '../../plugins/rein-router/runtime.mjs';
import { createSlackDevelopmentAuthorizer } from '../../plugins/rein-router/slack-development.mjs';

const channel = { agentId: 'nori-development', accountId: 'default', workspaceId: 'TFIXTURE1',
  channelId: 'CFIXTURE1', botTokenEnvVar: 'SA_OPS_SYNTHETIC_TOKEN' };
const config = { enabled: true,
  gateway: { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'SA_OPS_UNUSED_KEY' },
  routes: [{ id: 'standard', provider: 'fixture', gatewayModel: 'fixture/standard', effort: 'high',
    billingSource: 'synthetic', billingMode: 'subscription', billingVerified: true,
    purpose: 'Synthetic authority reproduction', contextWindow: 32768, maxTokens: 1024 }],
  defaultRoute: 'standard', fallbackRoutes: [], developmentChannels: [channel] };
const model = { modelProviderId: 'rein-magpie', modelId: 'standard' };
const base = { runId: 'sa-ops-synthetic-run', agentId: channel.agentId,
  sessionId: 'sa-ops-synthetic-session', sessionKey: 'agent:nori-development:cron:synthetic:run:fixture',
  workspaceDir: '/synthetic/never-opened', trigger: 'cron', jobId: 'sa-ops-synthetic-job' };
const embedded = (changes = {}) => ({
  ...buildEmbeddedAgentHookContext({ ...base, messageChannel: 'slack', agentAccountId: 'default', ...changes }, channel.agentId, undefined),
  ...model,
});
const human = { ...base, ...model, trigger: 'user', channel: 'slack', messageProvider: 'slack',
  accountId: 'default', senderId: 'UMEMBER1', chatId: channel.channelId,
  sessionKey: 'agent:nori-development:slack:channel:cfixture1' };
let slackCalls = 0, foundationCalls = 0, foundationAllowed = true;
const authorizeDevelopment = createSlackDevelopmentAuthorizer({ config,
  env: { SA_OPS_SYNTHETIC_TOKEN: 'xoxb-synthetic-local-only' },
  authorizeFoundation: async () => { foundationCalls++; return foundationAllowed; },
  fetchImpl: async (url: string) => {
    slackCalls++;
    const replies = {
      'https://slack.com/api/auth.test': { team_id: channel.workspaceId, user_id: 'UBOT0001', bot_id: 'BBOT0001' },
      'https://slack.com/api/conversations.info': { channel: { id: channel.channelId,
        context_team_id: channel.workspaceId, is_private: true, is_member: true,
        is_archived: false, is_im: false, is_mpim: false } },
      'https://slack.com/api/conversations.members': { members: ['UMEMBER1'] },
    };
    assert.ok(Object.hasOwn(replies, url), 'unexpected synthetic authorization request');
    return Response.json({ ok: true, ...replies[url] });
  },
});
const cases = [
  ['trusted Slack positive control', human, 'pass', true],
  ['same trusted Slack member denied only by Foundation role gate', human, 'block', false],
  ['native embedded Cron projection without live sender', embedded(), 'block', true],
  ['native harness Cron projection without live sender', { ...buildAgentHookContext({ ...base, ...model, channel: 'slack', accountId: 'default' }) }, 'block', true],
  ['forged system trigger', embedded({ trigger: 'system' }), 'block', true],
  ['forged internal_system provenance', { ...embedded(), inputProvenance: { kind: 'internal_system' } }, 'block', true],
  ['forged user/external_user labels without sender', { ...embedded({ trigger: 'user' }), inputProvenance: { kind: 'external_user' } }, 'block', true],
  ['memory projection without live sender', embedded({ trigger: 'memory' }), 'block', true],
  // Actual producer: subagent-announce-delivery.ts:218-230 queues inter_session /
  // internal / subagent_announce; agent-runner-embedded-candidate.ts:130 uses user
  // for non-heartbeat queued turns. This is a child-result turn, not a child launch.
  ['native child announcement projection without live sender', {
    ...embedded({ trigger: 'user', sessionKey: human.sessionKey }),
    inputProvenance: { kind: 'inter_session', sourceChannel: 'internal', sourceTool: 'subagent_announce',
      sourceSessionKey: 'agent:nori-development:subagent:sa-ops-synthetic-child' },
  }, 'block', true],
] as const;
for (const [name, ctx, outcome, allowed] of cases) {
  foundationAllowed = allowed;
  const previousSlackCalls = slackCalls, previousFoundationCalls = foundationCalls;
  const router = createRouter({ config, authorizeDevelopment, environment: {},
    fetchImpl: async () => assert.fail('probe must not contact a gateway or provider') });
  await router.beforeModelResolve({ prompt: 'Synthetic ordinary maintenance; no execution requested.' }, ctx);
  const decision = router.beforeAgentRun({}, ctx);
  assert.equal(decision.outcome, outcome, name);
  const toolDecision = await router.beforeToolCall({}, { runId: ctx.runId, agentId: ctx.agentId,
    sessionKey: ctx.sessionKey, requester: { channel: ctx.channel, accountId: ctx.accountId, senderId: ctx.senderId } });
  if (outcome === 'block') {
    assert.equal(decision.reason, 'rein_router_development_authorization_required', name);
    assert.equal(toolDecision.block, true, name);
    if (!allowed) {
      assert.equal(ctx.senderId, human.senderId, 'the same trusted member is present');
      assert.equal(slackCalls - previousSlackCalls, 3, 'membership checks succeeded before role denial');
      assert.equal(foundationCalls - previousFoundationCalls, 1, 'only Foundation authorization changed');
    } else {
      assert.equal(ctx.senderId, undefined, name);
      assert.equal(slackCalls, previousSlackCalls, 'no live identity lookup for a senderless case');
      assert.equal(foundationCalls, previousFoundationCalls, 'no invented business principal');
    }
  } else assert.equal(toolDecision, undefined, name);
  console.log(`PASS: ${name}: model gate=${outcome}; tool gate=${toolDecision?.block ? 'block' : 'pass'}`);
}
assert.equal(foundationCalls, 3, 'two positive-control checks plus one role denial');
assert.equal(slackCalls, 9, 'only the two same-member controls use in-memory Slack responses');
console.log('SA-OPS-01: 9 synthetic cases passed; defects reproduced, no fix or product acceptance. No scheduler, network, model, real account/credential or production access.');
