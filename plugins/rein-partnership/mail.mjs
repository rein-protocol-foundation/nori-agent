const emailId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** One HTTP POST per durable intent; errors after dispatch are deliberately uncertain. */
export function createResendMail({ apiKey, fetchImpl = globalThis.fetch }) {
  async function request(route, options) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw Error('partnership_mail_credential_unavailable');
    const response = await fetchImpl(`https://api.resend.com${route}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...options.headers },
    });
    const raw = await response.text();
    if (raw.length > 65_536) throw Error('partnership_mail_response_invalid');
    let body; try { body = JSON.parse(raw); } catch { throw Error('partnership_mail_response_invalid'); }
    if (!response.ok) throw Error('partnership_mail_provider_rejected_or_unknown');
    return body;
  }
  return {
    async send(material, idempotencyKey) {
      const body = await request('/emails', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ from: material.from, to: [material.to], subject: material.subject, text: material.text }) });
      if (!emailId(body.id)) throw Error('partnership_mail_receipt_missing');
      return { id: body.id, provider: 'resend', accepted: true, deliveryVerified: false };
    },
    async retrieve(id) {
      if (!emailId(id)) throw Error('partnership_mail_receipt_invalid');
      const body = await request(`/emails/${encodeURIComponent(id)}`, { method: 'GET' });
      if (body.id !== id) throw Error('partnership_mail_receipt_mismatch');
      return body;
    },
  };
}
