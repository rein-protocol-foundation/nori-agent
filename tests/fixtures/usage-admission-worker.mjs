import { createUsageLedger, usageIdentity } from '../../plugins/rein-router/usage-limits.mjs';
const ledger = createUsageLedger({ stateDir: process.argv[2] });
const id = usageIdentity({ runId: process.argv[3], agentId: 'nori-community', sessionKey: process.argv[3],
  channel: 'discord', accountId: 'default', senderId: 'synthetic-sender', chatId: 'synthetic-room' }, 'synthetic-guild');
process.stdin.once('data', () => {
  try {
    ledger.admit(id, { perUserPerMinute: 20, perConversationPerMinute: 20, perUserConcurrent: 1,
      perConversationConcurrent: 1, maxConcurrent: 1, maxGatewayRequestsPerDay: 100 });
    process.stdout.write('accepted\n');
  } catch { process.stdout.write('refused\n'); }
});
process.stdout.write('ready\n');
process.stdin.resume(); // Keep the native process alive until the test ends its stdin.
process.stdin.on('end', () => ledger.close());
