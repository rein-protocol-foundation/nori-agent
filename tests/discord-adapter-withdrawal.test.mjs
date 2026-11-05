import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/rein-discord/index.ts';
import { inspectDiscordPrivacy } from '../scripts/discord-privacy.mjs';

test('withdrawn entry refuses registration before taking over Discord or opening member tools', () => {
  const calls = [];
  assert.throws(() => plugin.register({
    registerChannel(value) { calls.push(['channel', value]); },
    registerTool(value) { calls.push(['tool', value]); },
  }), /rein-discord has been withdrawn/);
  assert.deepEqual(calls, []);
});

test('withdrawn profiles cannot pass the privacy audit or silently select native routing', () => {
  const result = inspectDiscordPrivacy({
    channels: { discord: { enabled: true } },
    plugins: { entries: { discord: { enabled: false }, 'rein-discord': { enabled: true } } },
  });
  assert.equal(result.routingImplementation, 'withdrawn-adapter');
  assert.equal(result.isolatedAdapterConfigured, false);
  assert.equal(result.groupSessionIncludesSender, false);
  assert.ok(result.findings.some(f => f.code === 'isolation_adapter_withdrawn' && f.severity === 'critical'));
});
