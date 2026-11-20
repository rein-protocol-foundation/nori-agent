import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/rein-operations/index.ts';
import { configureDiscordVoiceIdentity } from '../scripts/configure-discord-voice-identity.mjs';

function noticeHandler(language) {
  const previous = process.env.NORI_CHAT_NOTICE_LANGUAGE;
  process.env.NORI_CHAT_NOTICE_LANGUAGE = language;
  try {
    const hooks = [];
    plugin.register({ pluginConfig: {}, registerTool() {}, on: (name, handle) => hooks.push([name, handle]) });
    return hooks.find(([name]) => name === 'reply_payload_sending')[1];
  } finally {
    if (previous === undefined) delete process.env.NORI_CHAT_NOTICE_LANGUAGE;
    else process.env.NORI_CHAT_NOTICE_LANGUAGE = previous;
  }
}
const format = noticeHandler('zh');

test('marked host notices retain delivery fields and member quotations pass through', () => {
  for (const [flag, source, expected] of [
    ['isStatusNotice', '✅ New session started.', 'Nori 已为你开启新对话。'],
    ['isStatusNotice', '⚠️ ACP session reset failed. Check /acp status and try again.', 'Nori 未能重置任务会话。请用 /acp status 查看状态后重试。'],
    ['isError', 'OpenClaw could not write local session data because the disk is full. Free some disk space and try again.', 'Nori 的存储空间已满，这次会话数据未能写入。请联系管理员释放空间后重试。'],
  ]) {
    const payload = { text: source, [flag]: true, mediaUrls: ['fixture.png'], replyToId: 'thread' };
    assert.deepEqual(format({ payload }), { payload: { ...payload, text: expected } });
    assert.equal(format({ payload: { text: source } }), undefined);
    assert.equal(format({ payload: { ...payload, text: 'Quoted: ' + source } }), undefined);
  }
});

test('Discord voice identity respects account instructions and voice enrollment', () => {
  const discord = { accounts: { silent: {}, disabled: { voice: { enabled: false } },
    own: { voice: { realtime: { instructions: 'Custom' } } }, enrolled: { voice: { mode: 'agent-proxy' } } } };
  configureDiscordVoiceIdentity(discord);
  assert.equal(discord.voice, undefined);
  assert.deepEqual(discord.accounts.silent, {});
  assert.deepEqual(discord.accounts.disabled.voice, { enabled: false });
  assert.equal(discord.accounts.own.voice.realtime.instructions, 'Custom');
  assert.match(discord.accounts.enrolled.voice.realtime.instructions, /Nori/);
  assert.equal(discord.accounts.enrolled.voice.mode, 'agent-proxy');
});

test('task errors retain the reported cause and recovery action', () => {
  const cause = 'Budget expired.\nPartial output available.';
  const text = 'ACP error (ACP_TURN_FAILED): ' + cause + '\nnext: Retry, or use `/acp cancel` and send the message again.';
  const result = format({ payload: { text, isError: true } });
  assert.ok(result.payload.text.includes(cause));
  assert.match(result.payload.text, /\/acp cancel/);
  assert.equal(format({ payload: { text } }), undefined);
  assert.equal(format({ payload: { text: text + ' custom operator hint', isError: true } }), undefined);
});

test('an English deployment keeps system notices in English', () => {
  const formatEnglish = noticeHandler('en');
  assert.equal(formatEnglish({ payload: { isStatusNotice: true, text: '✅ Session reset.' } }).payload.text,
    'Nori reset this conversation.');
});
