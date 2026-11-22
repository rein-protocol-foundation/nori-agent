// Exercise policy selection through the real Router registration and its public dispatch hook.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildChannelInboundEventContext } from '../../vendor/openclaw/src/plugin-sdk/channel-inbound.js';
import { createOpenClawTestState } from '../../vendor/openclaw/src/test-utils/openclaw-test-state.js';
import { finalizeInboundContext } from '../../vendor/openclaw/src/auto-reply/reply/inbound-context.js';
import { createReplyDispatcher } from '../../vendor/openclaw/src/auto-reply/reply/reply-dispatcher.js';
import type { PluginHookHandlerMap } from '../../vendor/openclaw/src/plugins/hook-types.js';
import entry from '../../plugins/rein-router/index.ts';
import { buildOpenClawFragment } from '../../plugins/rein-router/policy.mjs';
import { openParticipationEvidence, participationPolicyDigest } from '../../plugins/rein-router/slack-participation-evidence.mjs';
import { openParticipationReviewStore } from '../../plugins/rein-router/slack-participation-review-store.mjs';
import { runParticipationReview, writePrivateJson } from '../../scripts/slack-participation-review.mjs';

const state = await createOpenClawTestState({ label: 'slack-participation-rollout', env: { OPENCLAW_TEST_FAST: '0' } });
const pluginRoot = fileURLToPath(new URL('../../plugins/rein-router/', import.meta.url));
type RouterApi = Parameters<typeof entry.register>[0];
type ReplyDispatch = PluginHookHandlerMap['reply_dispatch'];
const scope = { accountId: 'default', workspaceId: 'TFIXTURE1', channelId: 'CFIXTURE1', agentId: 'main' };
const baseline = { enabled: true, version: 'fixture-baseline', minProbability: 0.8,
  duties: 'Help with deployments.', recordEvidence: true, channels: [scope] };
const routerConfig = { enabled: true, gateway: { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'FIXTURE_MAGPIE_KEY' },
  routes: [{ id: 'general', provider: 'fixture', gatewayModel: 'fixture/model', billingSource: 'fixture',
    billingMode: 'subscription', billingVerified: true, purpose: 'General assistance', effort: 'low',
    contextWindow: 16000, maxTokens: 4000 }], defaultRoute: 'general', decision: { allowPaidJev: true },
  participation: baseline, participationPolicySource: 'review-store' };
const readLog = 'rein_router_participation_policy ';
let nextMessage = 0;

try {
  const register = (options = routerConfig) => {
    const fragment = buildOpenClawFragment(options, pluginRoot);
    const cfg = { ...fragment, messages: { ackReactionScope: 'off' } } as RouterApi['config'];
    const info: string[] = [], warnings: string[] = [];
    const dispose: Array<() => void | Promise<void>> = [];
    let classifierCalls = 0;
    let replyDispatch: ReplyDispatch | undefined;
    const decisions: RouterApi['runtime']['decisions'] = {
      async evaluate({ state }, options) {
        classifierCalls++;
        assert.equal(options.purpose, 'rein-router.participation');
        assert.ok(state && typeof state === 'object' && 'currentMessage' in state);
        const helpful = state.currentMessage === 'help with a deployment' ? 0.76 : 0.1;
        return { status: 'ok', provenance: { providerId: 'fixture', rubricVersion: options.rubricVersion,
          runtimeGeneration: 'fixture' }, result: { model: 'fixture-participation', answers: {
          dutyRelevant: { type: 'boolean', probabilityTrue: 0.99 }, helpful: { type: 'boolean', probabilityTrue: helpful },
        } } };
      },
    };
    const on: RouterApi['on'] = (name, handler) => {
      if (name !== 'reply_dispatch') return;
      assert.equal(replyDispatch, undefined);
      replyDispatch = handler as ReplyDispatch;
    };
    entry.register({ config: cfg, pluginConfig: cfg.plugins?.entries?.['rein-router']?.config,
      runtime: { state: { resolveStateDir: () => state.stateDir }, decisions, events: { onAgentEvent: () => () => {} } },
      logger: { info: (message: string) => info.push(message), warn: (message: string) => warnings.push(message) },
      lifecycle: { onDispose: (cleanup: () => void | Promise<void>) => dispose.push(cleanup) },
      on, registerProvider() {}, registerTool() {},
    } as RouterApi);
    return {
      effective() {
        const line = info.find(message => message.startsWith(readLog));
        return line ? JSON.parse(line.slice(readLog.length)) : undefined;
      },
      warnings,
      async evaluate({ text = 'help with a deployment', channelId = scope.channelId, mentioned = false } = {}) {
        const messageId = `1000.${String(++nextMessage).padStart(6, '0')}`;
        const before = classifierCalls;
        const ctx = finalizeInboundContext(buildChannelInboundEventContext({ channel: 'slack', accountId: scope.accountId, messageId,
          from: `slack:channel:${channelId}`, sender: { id: 'UALICE01' },
          conversation: { kind: 'channel', id: channelId, nativeChannelId: channelId, spaceId: scope.workspaceId },
          route: { agentId: scope.agentId, accountId: scope.accountId, routeSessionKey: `agent:main:slack:channel:${channelId.toLowerCase()}` },
          reply: { to: `channel:${channelId}`, nativeChannelId: channelId }, message: { rawBody: text },
          access: { mentions: { canDetectMention: true, wasMentioned: mentioned, requireMention: false } } }));
        const dispatcher = createReplyDispatcher({ deliver: async () => assert.fail('fixture must never deliver') });
        const result = await replyDispatch?.({ ctx, inboundAudio: false, shouldRouteToOriginating: false,
          shouldSendToolSummaries: false, shouldSendFullToolDetails: false, sendPolicy: 'deny' },
        { cfg, dispatchKind: 'agent', dispatcher, abortSignal: new AbortController().signal,
          recordProcessed() {}, markIdle() {} });
        assert.equal(result?.queuedFinal ?? false, false);
        const disposition = result?.handled ? 'silence' : 'continue';
        return { messageId, classifierCalls: classifierCalls - before, disposition };
      },
      async close() {
        for (const cleanup of dispose) await cleanup();
      },
    };
  };

  let gateway: ReturnType<typeof register> | undefined;
  const restart = async (options?: typeof routerConfig) => {
    await gateway?.close();
    gateway = register(options);
    return gateway;
  };
  const transact = (command: string, file: string, ...flags: string[]) => {
    const output = state.path(`${file}.json`);
    runParticipationReview([command, '--state-dir', state.stateDir, '--output', output, ...flags]);
    return JSON.parse(readFileSync(output, 'utf8'));
  };
  const verifyPolicy = (runtime: ReturnType<typeof register>, source: string, generation: number | null, policy: typeof baseline) =>
    assert.deepEqual(runtime.effective(), { source, generation, version: policy.version, digest: participationPolicyDigest(policy) });

  try {
    let active = await restart();
    verifyPolicy(active, 'config', null, baseline);
    assert.match(active.warnings.join('\n'), /review_store_unavailable.*Check status-policy/);
    assert.equal((await active.evaluate()).disposition, 'silence');

    const policyFile = state.path('baseline.json');
    writePrivateJson(policyFile, baseline);
    transact('init-policy', 'initial', '--policy-file', policyFile);
    active = await restart();
    verifyPolicy(active, 'review-store', 0, baseline);
    const missed = await active.evaluate();
    assert.deepEqual([missed.classifierCalls, missed.disposition], [1, 'silence']);

    const evidence = openParticipationEvidence({ stateDir: state.stateDir, readOnly: true });
    const reviewStore = openParticipationReviewStore({ stateDir: state.stateDir });
    try {
      const decision = evidence.read({ policy: baseline, scope }).find(row => row.messageId === missed.messageId);
      assert.equal(decision?.reason, 'passive');
      reviewStore.recordFeedback(baseline, { schemaVersion: 1, source: 'slack-web-api', scope,
        policyDigest: participationPolicyDigest(baseline), decisionId: decision.id, messageId: decision.messageId,
        actorId: decision.senderId, signal: 'missed-wake', sourceMessageId: '1001.000001', split: 'calibration' });
    } finally { evidence.close(); reviewStore.close(); }
    const staged = transact('stage-policy', 'staged', '--candidate-version', 'fixture-candidate');
    const candidate = staged.report.candidatePolicy;
    assert.equal(candidate.minProbability, 0.76);
    assert.equal((await active.evaluate()).disposition, 'silence');
    transact('apply-policy', 'applied', '--stage-id', staged.id);
    assert.equal((await active.evaluate()).disposition, 'silence', 'running registration keeps its loaded policy');

    active = await restart();
    verifyPolicy(active, 'review-store', 1, candidate);
    const admitted = await active.evaluate();
    assert.deepEqual([admitted.classifierCalls, admitted.disposition], [1, 'continue']);
    assert.equal((await active.evaluate({ text: 'chatter' })).disposition, 'silence');
    for (const controls of [{ channelId: 'CFIXTURE2' }, { mentioned: true }]) {
      const bypass = await active.evaluate(controls);
      assert.deepEqual([bypass.classifierCalls, bypass.disposition], [0, 'continue']);
    }

    active = await restart({ ...routerConfig, participationPolicySource: undefined });
    assert.equal(active.effective(), undefined);
    assert.equal((await active.evaluate()).disposition, 'silence', 'source omitted uses the configured baseline');
    active = await restart({ ...routerConfig, participation: { ...baseline, enabled: false } });
    const disabled = await active.evaluate();
    assert.deepEqual([disabled.classifierCalls, disabled.disposition], [0, 'continue']);
    const mismatched = { ...baseline, duties: 'Help with a different task.' };
    active = await restart({ ...routerConfig, participation: mismatched });
    verifyPolicy(active, 'config', null, mismatched);
    assert.match(active.warnings.join('\n'), /review_store_unavailable/);
    assert.equal((await active.evaluate()).disposition, 'silence');

    transact('rollback-policy', 'rolled-back', '--stage-id', staged.id);
    active = await restart();
    verifyPolicy(active, 'review-store', 2, baseline);
    const restored = await active.evaluate();
    assert.deepEqual([restored.classifierCalls, restored.disposition], [1, 'silence']);
    const status = transact('status-policy', 'status');
    assert.deepEqual(status.transitions.map(row => row.operation), ['apply', 'rollback']);
    const read = openParticipationEvidence({ stateDir: state.stateDir, readOnly: true });
    try {
      assert.ok(read.read({ policy: baseline, scope }).some(row => row.messageId === missed.messageId));
      assert.ok(read.read({ policy: baseline, scope }).some(row => row.messageId === restored.messageId && row.reason === 'passive'));
      assert.ok(read.read({ policy: candidate, scope }).some(row => row.messageId === admitted.messageId && row.reason === 'participate'));
    } finally { read.close(); }
    assert.deepEqual(JSON.parse(readFileSync(policyFile, 'utf8')), baseline);
    console.log('PASS: registered Router changes Slack reply hook disposition on apply and restores it after rollback.');
  } finally { await gateway?.close(); }
} finally {
  await state.cleanup();
}
