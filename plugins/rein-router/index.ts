import { readParticipationRelease } from './slack-participation-review-store.mjs';
import { communityReplyGuidance } from './community-reply-guidance.mjs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { createRouter, assertRuntimeConfig, bindRouterLifecycle, PROVIDER_ID } from './runtime.mjs';
import { createUsageLedger } from './usage-limits.mjs';
import { validateRouterConfig } from './policy.mjs';
import { createManagedGateway } from './managed-gateway.mjs';
import { bindManagedService, managedServiceScope, managedServiceRegistry } from './service-bridge.mjs';
import { createProfileAdminAuthorizer, FOUNDATION_ADMIN_TIMEOUT_MS } from './foundation-admin.ts';
import { createCronIngress, assertTrustedSlackBoundaries } from './cron-ingress.mjs';
import { loadCronStore, resolveCronStorePath } from 'openclaw/plugin-sdk/cron-store-runtime';
import { createSlackDevelopmentAuthorizer, createSlackScheduleAuthorizer, DEVELOPMENT_AUTH_TIMEOUT_MS } from './slack-development.mjs';
import { acknowledgeSlackParticipation } from './slack-participation-ack.ts';
import { createSlackParticipation } from './slack-participation.mjs';
import { openParticipationEvidence, participationPolicyDigest } from './slack-participation-evidence.mjs';
import { hasControlCommand } from 'openclaw/plugin-sdk/command-detection';
import { larkDevelopmentSource } from './lark-development.mjs';
import { isAbortRequestText } from 'openclaw/plugin-sdk/command-primitives-runtime';

export default definePluginEntry({
  id: 'rein-router', name: 'Nori Router',
  description: 'Opt-in Magpie subscription routes and bounded Jev decisions.',
  register(api) {
    const config = validateRouterConfig(api.pluginConfig);
    const gateway = config.enabled && config.gateway.managed && config.gateway.managed.mode !== 'console' ? bindManagedService({
      registry: managedServiceRegistry(),
      scope: managedServiceScope({ source: api.runtimeSource ?? api.source,
        stateDir: api.runtime.state.resolveStateDir(), config }),
      manager: createManagedGateway({ gateway: config.gateway, routes: config.routes,
        allowPaidUsage: config.allowPaidUsage }),
    }) : undefined;
    const operations = api.config.plugins?.entries?.['rein-operations'];
    const authorizeAdmin = createProfileAdminAuthorizer({
      operationsConfig: operations?.enabled === true ? operations.config : undefined,
    });
    const authorizeDevelopment = createSlackDevelopmentAuthorizer({ config });
    const authorizeCreator = createSlackScheduleAuthorizer({ config: { developmentChannels: config.trustedSlackChannels, scheduleInPublicChannels: config.scheduleInPublicChannels } });
    if (config.enabled) { assertRuntimeConfig(config, api.config); assertTrustedSlackBoundaries(config.trustedSlackChannels, api.config); }
    const usage = config.enabled && Object.values(config.scopedPolicies ?? {}).some(policy => policy.usageLimits)
      ? createUsageLedger({ stateDir: api.runtime.state.resolveStateDir() }) : undefined;
    const router = createRouter({ config, observeCommunityReference: () => api.logger.info('Discord community public reference attached'), decisions: api.runtime.decisions, gatewayReady: gateway?.isReady,
      authorizeAdmin, authorizeDevelopment, usage, hostConfig: () => api.runtime.config.current() });
    if (!router.config.enabled) return;
    if (config.scopedPolicies?.['nori-community']?.origins.some(origin => origin.platform === 'discord')) {
      api.on('before_prompt_build', (_event, ctx) => communityReplyGuidance(ctx));
    }
    const configuredParticipation = config.participation;
    if (configuredParticipation?.enabled) {
      let release: ReturnType<typeof readParticipationRelease> | undefined;
      if (config.participationPolicySource === 'review-store') {
        try {
          release = readParticipationRelease({ stateDir: api.runtime.state.resolveStateDir(), baseline: configuredParticipation });
        } catch {
          api.logger.warn('rein_router_participation_review_store_unavailable Using configured baseline. Check status-policy, store ownership and permissions, and the configured baseline digest.');
        }
      }
      const participationPolicy = release?.policy ?? configuredParticipation;
      let reportedEvidenceFailure = false;
      const evidenceUnavailable = () => {
        if (reportedEvidenceFailure) return;
        reportedEvidenceFailure = true;
        api.logger.warn('rein_router_participation_evidence_unavailable');
      };
      let evidence: ReturnType<typeof openParticipationEvidence> | undefined;
      if (participationPolicy.recordEvidence) {
        try {
          evidence = openParticipationEvidence({ stateDir: api.runtime.state.resolveStateDir() });
        } catch { evidenceUnavailable(); }
      }
      if (evidence) {
        const policyHash = participationPolicyDigest(participationPolicy);
        api.on('reply_payload_sending', (event, ctx) => {
          try { evidence?.observeFinalPayload(event, ctx, participationPolicy, policyHash); } catch { evidenceUnavailable(); }
        });
        api.on('llm_output', (event, ctx) => {
          try { evidence?.observeWorker(event, ctx, policyHash); } catch { evidenceUnavailable(); }
        });
        api.on('message_sent', (event, ctx) => {
          try { evidence?.observeSent(event, ctx, policyHash); } catch { evidenceUnavailable(); }
        });
      }
      const participation = createSlackParticipation({ policy: participationPolicy,
        decisions: api.runtime.decisions, allowPaidJev: config.decision.allowPaidJev,
        acknowledge: receipt => acknowledgeSlackParticipation(receipt, api.logger),
        isNativeCommand: (text, cfg) => isAbortRequestText(text) || hasControlCommand(text ?? '', cfg),
        observe: observation => api.logger.info(`rein_router_participation ${JSON.stringify(observation)}`),
        writeEvidence: record => evidence?.record(record, participationPolicy), evidenceUnavailable });
      api.on('reply_dispatch', participation.replyDispatch,
        { priority: 200, timeoutMs: participationPolicy.timeoutMs + 1000, eligibleDispatchKinds: ['agent', 'acp'] });
      if (config.participationPolicySource === 'review-store') {
        api.logger.info(`rein_router_participation_policy ${JSON.stringify({ source: release ? 'review-store' : 'config',
          generation: release?.generation ?? null, version: participationPolicy.version, digest: participationPolicyDigest(participationPolicy) })}`);
      }
      const dispose = () => { participation.close(); evidence?.close(); };
      if (api.lifecycle.onDispose) api.lifecycle.onDispose(dispose);
      else api.lifecycle.registerRuntimeLifecycle({ id: 'rein-router-participation', dispose });
    }
    bindRouterLifecycle(router, { events: api.runtime.events, lifecycle: api.lifecycle });
    if (usage) {
      if (api.lifecycle.onDispose) api.lifecycle.onDispose(() => usage.close());
      else api.lifecycle.registerRuntimeLifecycle({ id: 'rein-router-usage', dispose: () => usage.close() });
    }
    if (gateway) {
      api.registerService({ id: 'rein-magpie', start: gateway.start, stop: gateway.stop });
      if (api.lifecycle.onDispose) api.lifecycle.onDispose(gateway.stop);
      else api.lifecycle.registerRuntimeLifecycle({ id: 'rein-magpie-owner', dispose: gateway.stop });
    }
    api.registerProvider({ id: PROVIDER_ID, label: 'Magpie subscriptions', auth: [],
      envVars: [router.config.gateway.apiKeyEnvVar], wrapStreamFn: router.wrapStreamFn,
      wrapSimpleCompletionStreamFn: ctx => router.wrapStreamFn({ ...ctx, simpleCompletion: true }) });
    api.on('before_model_resolve', router.beforeModelResolve,
      { priority: 100, timeoutMs: router.config.decision.timeoutMs + FOUNDATION_ADMIN_TIMEOUT_MS + DEVELOPMENT_AUTH_TIMEOUT_MS + (config.gateway.managed?.mode === 'console' ? 2000 : 1000) });
    if (config.larkDevelopmentGroup) api.on('before_prompt_build', (_event, ctx) => {
      if (!larkDevelopmentSource(config.larkDevelopmentGroup, api.runtime.config.current(), ctx)) return;
      return { prependContext: 'Delegate repository work to the nori-development sandbox with sessions_spawn, runtime="subagent", agentId="nori-development", mode="run" and sandbox="require". Give the worker the complete authorized scope, requested workspace skill, checks and any publication permission. Report the actual worker result in this conversation.' };
    });
    const cronIngress = createCronIngress({ channels: config.trustedSlackChannels, developmentChannels: config.developmentChannels, authorize: authorizeCreator,
      hasExistingNativeControls: source => Object.hasOwn(api.config.channels?.slack?.channels ?? {}, source.chatId),
      readJobs: async source => (await loadCronStore(resolveCronStorePath(api.config.cron?.store))).jobs.filter(job =>
        job.owner?.agentId === source.agentId && job.owner?.accountId === source.accountId &&
        job.owner?.sessionKey === source.sessionKey) });
    // An explicit channel keeps its existing native admission. For a new channel
    // selected by the Slack wildcard, verify workspace membership before inference.
    api.on('before_agent_run', async (event, ctx) => {
      const channelId = ctx.channelContext?.chat?.id ?? ctx.chatId;
      const slack = api.config.channels?.slack;
      if (ctx.channel === 'slack' && ctx.trigger === 'user' && /^[CG][A-Z0-9]+$/.test(channelId) &&
          slack?.channels?.['*'] && !Object.hasOwn(slack.channels, channelId) &&
          config.trustedSlackChannels.some(entry => entry.channelId === '*' && entry.accountId === ctx.accountId)) {
        if (!await authorizeCreator(ctx)) return { outcome: 'block', reason: 'rein_scheduler_membership_required',
          message: 'Nori could not verify current membership in this Slack workspace channel.' };
      }
      return cronIngress.observe(event, ctx);
    }, { priority: 110, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('agent_end', cronIngress.end);
    api.on('before_tool_call', cronIngress.beforeToolCall, { priority: 110, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('before_agent_run', router.beforeAgentRun, { priority: 100 });
    api.on('before_tool_call', router.beforeToolCall, { priority: 100, timeoutMs: DEVELOPMENT_AUTH_TIMEOUT_MS + 1000 });
    api.on('llm_output', router.llmOutput);
    api.registerTool({ contextVersion: 2, create(ctx) {
      return { name: 'rein_route_status', label: 'Subscription route status',
        description: 'Read this session’s declared route and observed provider, model and effort. Billing labels require gateway/provider evidence.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        async execute() {
          ctx.assertInvocationCurrent();
          const details = router.status(ctx, { sessionOnly: true });
          return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
        } };
    } }, { names: ['rein_route_status'], optional: true });
  },
});
