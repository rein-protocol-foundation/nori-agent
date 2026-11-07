import test from 'node:test';
import assert from 'node:assert/strict';
import plugin, { formatCronAlert } from '../plugins/rein-cron-alert-format/index.mjs';

const channelId = 'C_FIXTURE_ALERTS';
const context = { channelId: 'slack' };
const event = {
  to: channelId,
  content: 'Automation "fixture-review" failed 1 times\nCause: command exited with code 23\nRun started: 2026-11-07 06:48 UTC',
};

test('native failure formatting preserves reason and converts UTC across the local date boundary', () => {
  const { content } = formatCronAlert(event, context, channelId);
  assert.match(content, /定时任务失败/);
  assert.match(content, /连续失败 1 次/);
  assert.match(content, /command exited with code 23/);
  assert.match(content, /11\/06.*22:48/);
  assert.match(content, /https:\/\/nori\.rein-protocol\.org\/slack\/automations/);
});

test('recovery and test notices retain distinct status and labels', () => {
  const { content } = formatCronAlert({ ...event, to: `channel:${channelId}`,
    content: 'Automation "TEST-fixture" recovered\nThe latest run completed successfully.',
  }, context, channelId);
  assert.match(content, /测试通知 · 已恢复/);
  assert.match(content, /故障已解除/);
  assert.doesNotMatch(content, /连续失败/);
});

test('other destinations, transports and ordinary messages pass through unchanged', () => {
  assert.equal(formatCronAlert(event, { channelId: 'discord' }, channelId), undefined);
  assert.equal(formatCronAlert({ ...event, to: 'C_OTHER' }, context, channelId), undefined);
  assert.equal(formatCronAlert({ ...event, content: 'An ordinary message' }, context, channelId), undefined);
});

test('dynamic task and reason text escape Slack mentions and emphasis', () => {
  const { content } = formatCronAlert({ ...event,
    content: 'Automation "<!channel> *fixture*" failed 2 times\nCause: <@U_FIXTURE> `error`\nRun started: invalid-date',
  }, context, channelId);
  assert.doesNotMatch(content, /<!channel>|<@U_FIXTURE>/);
  assert.match(content, /&lt;!channel&gt;/);
  assert.match(content, /开始时间：invalid-date/);
});

test('plugin registers a presentation hook without cancelling delivery', () => {
  let hook;
  plugin.register({ pluginConfig: { channelId }, on: (name, handler) => {
    assert.equal(name, 'message_sending'); hook = handler;
  } });
  assert.deepEqual(Object.keys(hook(event, context)), ['content']);
});
