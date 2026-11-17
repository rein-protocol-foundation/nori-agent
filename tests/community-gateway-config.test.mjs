import test from 'node:test';
import assert from 'node:assert/strict';
import { configureCommunityGateway, COMMUNITY_REQUEST_LIMITS } from '../scripts/configure-community-gateway.mjs';
import { configureExistingCommunity } from '../scripts/configure-existing-community.mjs';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';
import { compileCatalog, mergeRouterFragment } from '../plugins/rein-router/catalog-sync.mjs';

const model = 'bailian-token-plan/deepseek-v4.1-flash';
const backend = platform => ({ enabled: true, workspaces: [{ platform, workspaceId: 'FIXTURE', nativeChannelIds: ['ROOM'] }],
  proposalChannelIds: ['ROOM'], boardChannelIds: ['ROOM'], backendApiBaseUrlEnvVar: 'REIN_URL',
  agentCallerIdEnvVar: 'REIN_CALLER', agentCredentialEnvVar: 'REIN_CREDENTIAL' });
const fixture = () => {
  const route = { id: 'general', provider: 'fixture', gatewayModel: model, billingSource: 'fixture subscription',
    billingMode: 'subscription', billingVerified: true, purpose: 'General', effort: 'high', contextWindow: 32768, maxTokens: 8192 };
  const internal = buildOpenClawFragment({ enabled: true,
    gateway: { baseUrl: 'http://127.0.0.1:3425/v1', apiKeyEnvVar: 'REIN_MAGPIE_GATEWAY_KEY' },
    routes: [route], defaultRoute: 'general', fallbackRoutes: [] }, '/fixture/plugin');
  internal.agents.defaults.workspace = '/internal/main';
  internal.agents.entries = { main: { tools: { profile: 'full' }, sandbox: { mode: 'off' } },
    development: { workspace: '/internal/dev', tools: { allow: ['exec', 'read', 'write'] } } };
  internal.bindings = [{ agentId: 'development', match: { channel: 'slack', peer: { kind: 'channel', id: 'DEV' } } },
    { agentId: 'main', match: { channel: 'slack' } }];
  internal.channels = { slack: { enabled: true, dmPolicy: 'disabled' } };
  internal.plugins.entries['rein-operations'] = { enabled: true, config: { foundationDb: backend('slack') } };
  internal.plugins.entries['rein-acp'] = { enabled: true, config: { taskLoop: { enabled: true }, continuation: { enabled: true } } };
  const discord = { channels: { discord: { enabled: true, token: 'SYNTHETIC_TOKEN', dmPolicy: 'disabled',
    guilds: { FIXTURE: { tools: { allow: ['message', 'rein_resources_search'] }, channels: { ROOM: { requireMention: false } } } } } },
    plugins: { entries: { 'rein-operations': { enabled: true, config: { foundationDb: backend('discord') } } } } };
  return { internal, discord, consoleSettings: { enabled: true,
    funding: { 'bailian-token-plan': { mode: 'subscription', confirmed: true } },
    policy: Object.fromEntries(['general', 'quick', 'research', 'code'].map(role => [role, { model, effort: 'high' }])) },
    workspace: '/public/community', sandbox: { mode: 'all', scope: 'session', workspaceAccess: 'none', backend: 'ssh' },
    dmUserIds: ['100000000000000003'] };
};

test('shared candidate preserves internal capability settings and isolates credentials, memory and requests', () => {
  const input = fixture(), before = structuredClone(input);
  const result = configureCommunityGateway(input), cfg = result.config;
  assert.deepEqual(input, before);
  assert.deepEqual(cfg.channels.slack, input.internal.channels.slack);
  assert.deepEqual(cfg.bindings.slice(0, 2), input.internal.bindings);
  for (const id of ['main', 'development']) assert.deepEqual(cfg.agents.entries[id].tools, input.internal.agents.entries[id].tools);
  assert.deepEqual(cfg.plugins.entries['rein-acp'], input.internal.plugins.entries['rein-acp']);
  const profiles = cfg.plugins.entries['rein-operations'].config.agentProfiles;
  assert.deepEqual(profiles.main.foundationDb, input.internal.plugins.entries['rein-operations'].config.foundationDb);
  assert.equal(profiles['nori-community'].foundationDb.agentCredentialEnvVar, 'NORI_COMMUNITY_REIN_CREDENTIAL');
  assert.equal(result.environmentMapping.NORI_COMMUNITY_REIN_CREDENTIAL, 'REIN_CREDENTIAL');
  assert.equal(cfg.channels.discord.token, 'SYNTHETIC_TOKEN');
  assert.equal(cfg.channels.discord.dmPolicy, 'allowlist');
  assert.deepEqual(cfg.channels.discord.allowFrom, input.dmUserIds);
  assert.equal(cfg.channels.discord.guilds.FIXTURE.channels.ROOM.requireMention, false);
  const policy = cfg.plugins.entries['rein-router'].config.scopedPolicies['nori-community'];
  assert.deepEqual(policy.usageLimits, COMMUNITY_REQUEST_LIMITS);
  assert.deepEqual(policy.default, { primary: 'general', fallbacks: [] });
  assert.equal(cfg.agents.entries.main.memory.search.rememberAcrossConversations, true);
  assert.deepEqual(cfg.agents.entries['nori-community'].memory.search.sources, ['sessions']);
  assert.equal(result.activationReady, false);
});

test('native console recompilation retains the scoped policy and singleton key without changing main tools', () => {
  const input = fixture(), result = configureCommunityGateway(input);
  const catalog = [{ id: model, providerId: 'bailian-token-plan', provider: 'fixture', name: 'Flash',
    contextWindow: 32768, maxTokens: 8192, efforts: ['off', 'medium', 'high'], hasFallback: false }];
  const fragment = compileCatalog({ catalog, settings: result.consoleSettings,
    gateway: result.config.plugins.entries['rein-router'].config.gateway, pluginPath: '/fixture/plugin' }).fragment;
  const next = mergeRouterFragment(result.config, fragment, { pluginPath: '/fixture/plugin' });
  assert.deepEqual(next.plugins.entries['rein-router'].config.scopedPolicies['nori-community'].usageLimits, COMMUNITY_REQUEST_LIMITS);
  assert.equal(next.plugins.entries['rein-router'].config.routes.find(r => r.id === 'general').gatewayKeyEnvVar, result.singletonKeyEnvironment);
  assert.deepEqual(next.agents.entries, result.config.agents.entries);
  assert.deepEqual(next.plugins.entries['rein-acp'], result.config.plugins.entries['rein-acp']);
});

test('ambiguous baselines and invalid private-message scope fail before producing a candidate', () => {
  for (const edit of [f => { f.dmUserIds = ['*']; }, f => { f.sandbox.workspaceAccess = 'rw'; },
    f => { f.workspace = '/internal'; }, f => { f.internal.plugins.entries['rein-operations'].config.proposalTools = {}; },
    f => { f.consoleSettings.policy.general.model = 'other/model'; }]) {
    const input = fixture(); edit(input);
    assert.throws(() => configureCommunityGateway(input), /community_/);
  }
});

test('transitional Discord configuration retains original database owner, gateway and public routes', () => {
  const f = fixture();
  const original = { ...f.internal, agents: { defaults: f.internal.agents.defaults }, bindings: [],
    channels: { slack: { enabled: false }, ...f.discord.channels },
    gateway: { port: 18793, controlUi: { allowedOrigins: ['https://example.invalid'] } },
    plugins: { ...f.internal.plugins, entries: { ...f.internal.plugins.entries, ...f.discord.plugins.entries } } };
  const before = structuredClone(original);
  const result = configureExistingCommunity({ original, workspace: f.workspace, sandbox: f.sandbox,
    dmUserIds: f.dmUserIds, dmChannelIds: ['100000000000000007'] });
  assert.deepEqual(original, before);
  assert.equal(result.databaseOwnerUnchanged, 'main');
  assert.equal(result.config.agents.defaults.skipBootstrap, true);
  assert.equal(result.config.models.providers['rein-magpie'].apiKey.id, 'NORI_COMMUNITY_FLASH_KEY');
  assert.equal(result.config.plugins.entries['rein-router'].config.gateway.apiKeyEnvVar, 'NORI_COMMUNITY_FLASH_KEY');
  assert.deepEqual(Object.keys(result.config.agents.entries), ['main']);
  assert.deepEqual(result.config.gateway, before.gateway);
  assert.deepEqual(result.config.plugins.entries['rein-operations'], before.plugins.entries['rein-operations']);
  assert.deepEqual(result.config.channels.discord.guilds.FIXTURE.channels, before.channels.discord.guilds.FIXTURE.channels);
  assert.deepEqual(result.config.plugins.entries['rein-router'].config.scopedPolicies.main.origins[0].channelIds,
    ['ROOM', '100000000000000007']);
  assert.deepEqual(result.config.plugins.entries['rein-router'].config.scopedPolicies.main.usageLimits, COMMUNITY_REQUEST_LIMITS);
  assert.equal(result.config.bindings[0].agentId, 'main');
  assert.equal(result.config.bindings[0].session.dmScope, 'per-account-channel-peer');
  assert.equal(result.config.memory?.search?.extraPaths, undefined);
});


test('shared Dashboard candidate uses the existing main route and preserves auth and agent identity', () => {
  const input = fixture();
  input.internal.gateway = { port: 18791, controlUi: { basePath: '/slack' } };
  input.internal.agents.entries.main.name = 'Nori · Slack 主助手';
  input.internal.agents.entries.main.identity = { name: 'Nori · Slack 主助手', avatar: 'avatars/nori.png' };
  input.dashboardConfig = { hostname: 'example.test', keyHash: 'a'.repeat(64), user: 'owner',
    port: 3440, routerPort: 3431, instances: [
      { id: 'discord', label: 'Discord', basePath: '/discord', port: 18793 },
      { id: 'slack', label: 'Slack', basePath: '/slack', port: 18791 },
    ] };
  const before = structuredClone(input);
  const result = configureCommunityGateway(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.dashboardConfig, { ...before.dashboardConfig,
    instances: [{ ...before.dashboardConfig.instances[1], label: 'Nori' }] });
  assert.equal(result.config.agents.entries.main.name, 'Nori · 主助手');
  assert.deepEqual(result.config.agents.entries.main.identity,
    { name: 'Nori · 主助手', avatar: 'avatars/nori.png' });
  assert.deepEqual(result.config.gateway, before.internal.gateway);
  assert.deepEqual(result.config.agents.entries.development.tools, before.internal.agents.entries.development.tools);
  assert.equal(result.activationReady, false);
  input.internal.gateway.controlUi.basePath = '/wrong';
  assert.throws(() => configureCommunityGateway(input), /dashboard_target_mismatch/);
});
