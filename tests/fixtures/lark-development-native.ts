import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGroupToolPolicy } from '../../vendor/openclaw/src/agents/agent-tools.policy.js';
import { createEmptyPluginRegistry } from '../../vendor/openclaw/src/plugins/registry-empty.js';
import { setActivePluginRegistry } from '../../vendor/openclaw/src/plugins/runtime.js';
import { createPluginRuntimeMock } from '../../vendor/openclaw/src/plugin-sdk/plugin-test-runtime.js';
import { setFeishuRuntime } from '../../vendor/openclaw/extensions/feishu/src/runtime.js';
import { checkBotMentioned } from '../../vendor/openclaw/extensions/feishu/src/bot-content.js';
import { resolveFeishuGroupSenderActivationIngressAccess, resolveFeishuGroupToolPolicy,
  resolveFeishuReplyPolicy } from '../../vendor/openclaw/extensions/feishu/src/policy.js';
import { FeishuConfigSchema } from '../../vendor/openclaw/extensions/feishu/src/config-schema.js';

const [path, development, community, other, sender, outsider] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(path, 'utf8'));
FeishuConfigSchema.parse(cfg.channels.feishu);

const registry = createEmptyPluginRegistry();
registry.channels.push({ pluginId: 'feishu', source: 'native-policy-fixture', plugin: { id: 'feishu',
  groups: { resolveToolPolicy: resolveFeishuGroupToolPolicy },
  config: { listAccountIds: config => Object.keys(config.channels.feishu.accounts) },
} } as typeof registry.channels[number]);
setActivePluginRegistry(registry);
setFeishuRuntime(createPluginRuntimeMock());
const session = (agent: string, group: string, topic: boolean) =>
  `agent:${agent}:feishu:group:${group}:${topic ? 'topic:omt_fixture:' : ''}sender:${sender}`;

for (const topic of [true, false]) {
  const parent = session('main', development, topic);
  const selected = resolveGroupToolPolicy({ config: cfg, sessionKey: parent, accountId: 'lark-internal' });
  assert.ok(selected?.allow?.includes('sessions_spawn'));
  const inherited = resolveGroupToolPolicy({ config: cfg, sessionKey: 'agent:nori-development:subagent:fixture',
    spawnedBy: parent, accountId: 'lark-internal' });
  assert.ok(inherited?.allow?.includes('exec'));
  assert.ok(inherited?.allow?.includes('write'));
  assert.ok(!inherited?.allow?.includes('message'));
  for (const [agent, group, accountId] of [['main', other, 'lark-internal'], ['nori-community', community, 'lark-community']])
    assert.deepEqual(resolveGroupToolPolicy({ config: cfg, sessionKey: session(agent, group, topic), accountId })?.allow,
      ['rein_status', 'rein_route_status']);
}

const requireMention = resolveFeishuReplyPolicy({
  cfg, accountId: 'lark-internal', groupId: development, isDirectMessage: false, groupPolicy: 'allowlist',
}).requireMention;
assert.equal(requireMention, true);
const botOpenId = 'ou_' + 'c'.repeat(32);
const message = { message_type: 'text', content: JSON.stringify({ text: '@Nori' }), root_id: 'om_fixture' };
const mention = (id: string) => ({ key: '@_user_1', name: 'Nori', id: { open_id: id } });
for (const [actor, mentions, expected] of [
  [sender, [mention(botOpenId)], 'dispatch'], [outsider, [mention(botOpenId)], 'drop'],
  [sender, [], 'drop'], [sender, [mention('all')], 'drop'],
  [sender, [mention(outsider)], 'drop'],
] as const) {
  const mentionedBot = checkBotMentioned({ message: { ...message, mentions: [...mentions] } }, botOpenId);
  const admitted = await resolveFeishuGroupSenderActivationIngressAccess({ cfg, accountId: 'lark-internal',
    chatId: development, threadId: 'omt_fixture', allowFrom: [sender], senderOpenId: actor, requireMention, mentionedBot,
    command: { hasControlCommand: true } });
  assert.equal(admitted.ingress.admission === 'dispatch' ? 'dispatch' : 'drop', expected);
}
