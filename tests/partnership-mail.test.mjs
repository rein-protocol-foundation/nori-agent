import test from 'node:test';
import assert from 'node:assert/strict';
import { createResendMail } from '../plugins/rein-partnership/mail.mjs';

const material = { from: 'noreply@example.org', to: 'test@example.org', subject: 'Test draft', text: 'Exact body.' };

test('Resend adapter uses exact plain-text material, a fixed endpoint and idempotency key', async () => {
  const calls = [];
  const mail = createResendMail({ apiKey: 'synthetic-key', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return Response.json({ id: 'receipt-1' });
  } });
  assert.deepEqual(await mail.send(material, 'partnership/id/version/digest'), { id: 'receipt-1', provider: 'resend', accepted: true, deliveryVerified: false });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'partnership/id/version/digest');
  assert.equal(calls[0].options.redirect, 'error'); assert.deepEqual(JSON.parse(calls[0].options.body), { ...material, to: [material.to] });
});

test('provider transport failures and malformed receipts are never automatically retried', async () => {
  for (const behavior of [async () => { throw Error('connection lost'); }, async () => new Response('bad response'),
    async () => Response.json({}, { status: 200 }), async () => Response.json({ message: 'error' }, { status: 503 })]) {
    let calls = 0;
    const mail = createResendMail({ apiKey: 'synthetic-key', fetchImpl: async (...args) => { calls++; return behavior(...args); } });
    await assert.rejects(mail.send(material, 'key')); assert.equal(calls, 1);
  }
});

test('receipt reconciliation is read-only and rejects mismatched provider IDs', async () => {
  const calls = [];
  const mail = createResendMail({ apiKey: 'synthetic-key', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return Response.json({ id: 'receipt-1', last_event: 'delivered' });
  } });
  assert.equal((await mail.retrieve('receipt-1')).last_event, 'delivered');
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].url, 'https://api.resend.com/emails/receipt-1');
  await assert.rejects(mail.retrieve('../emails'), /receipt_invalid/);
  await assert.rejects(mail.retrieve('another-id'), /receipt_mismatch/);
});
