import assert from 'node:assert/strict';
import { resolveAgentRoute } from '../vendor/openclaw/dist/plugin-sdk/routing.js';

// Controlled native-router probe, not real Discord/member acceptance. Mirrors
// buildDiscordRoutePeer: a guild peer is the channel, a DM peer is the sender.
const a = { sender: 'routing-probe-alice', channel: 'routing-probe-room' };
const b = { sender: 'routing-probe-bob', channel: 'routing-probe-room' };
function key(message, direct, dmScope) {
  return resolveAgentRoute({
    cfg: { session: { dmScope, groupScope: 'per-group' } },
    channel: 'discord', accountId: 'routing-probe-bot',
    peer: { kind: direct ? 'direct' : 'channel', id: direct ? message.sender : message.channel },
  }).sessionKey;
}
const results = [];
for (const dmScope of ['main', 'per-account-channel-peer']) {
  const publicShared = key(a, false, dmScope) === key(b, false, dmScope);
  const dmShared = key(a, true, dmScope) === key(b, true, dmScope);
  assert.equal(publicShared, true);
  assert.equal(dmShared, dmScope === 'main');
  assert.notEqual(key(a, false, dmScope), key({ ...b, channel: 'routing-probe-other-room' }, false, dmScope));
  results.push({ dmScope, differentSendersInSameRoomShareSession: publicShared, differentDmSendersShareSession: dmShared });
}
console.log(JSON.stringify({ probe: 'pinned upstream routing; synthetic identifiers only', results }, null, 2));
