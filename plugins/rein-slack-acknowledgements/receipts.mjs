// Observe only the configured bot's Slack reactions.add exchanges. Undici's
// diagnostics are passive: do not wrap fetch, consume a stream or change a request.
import { channel } from 'node:diagnostics_channel';
import { brotliDecompressSync, gunzipSync, inflateSync, zstdDecompressSync } from 'node:zlib';
import { nowUs } from './ledger.mjs';

function header(headers, wanted) {
  for (let i = 0; i < headers.length; i += 2) {
    if (String(headers[i]).toLowerCase() === wanted) return String(headers[i + 1]);
  }
}

export function observeReceipts(getBotToken, confirmed, warn) {
  const requests = new WeakMap();
  const subscriptions = [];
  function subscribe(event, callback) {
    const bus = channel('undici:request:' + event);
    const receive = data => {
      try { callback(data); } catch { warn(); }
    };
    bus.subscribe(receive);
    subscriptions.push(() => bus.unsubscribe(receive));
  }
  subscribe('create', ({ request }) => {
    if (request.method !== 'POST' || request.path !== '/api/reactions.add') return;
    const origin = String(request.origin);
    if (origin !== 'https://slack.com' && origin !== 'https://slack.com/') return;
    const token = getBotToken();
    if (!token || header(request.headers, 'authorization') !== 'Bearer ' + token) return;
    requests.set(request, { form: [], body: [], formSize: 0, bodySize: 0 });
  });
  function collect(request, chunk, field) {
    const item = requests.get(request);
    if (!item) return;
    const bytes = Buffer.from(chunk);
    item[field + 'Size'] += bytes.length;
    if (item[field + 'Size'] > 16384) { requests.delete(request); return; }
    item[field].push(bytes);
  }
  subscribe('bodyChunkSent', ({ request, chunk }) => collect(request, chunk, 'form'));
  subscribe('bodySent', ({ request }) => {
    const item = requests.get(request);
    if (!item) return;
    const form = new URLSearchParams(Buffer.concat(item.form).toString());
    item.form = [];
    if (form.get('name') !== 'eyes') { requests.delete(request); return; }
    item.target = [form.get('channel'), form.get('timestamp')];
  });
  subscribe('headers', ({ request, response }) => {
    const item = requests.get(request);
    if (!item) return;
    if (response.statusCode !== 200) { requests.delete(request); return; }
    item.encoding = header(response.headers, 'content-encoding') || 'identity';
  });
  subscribe('bodyChunkReceived', ({ request, chunk }) => collect(request, chunk, 'body'));
  subscribe('trailers', ({ request }) => {
    const item = requests.get(request);
    requests.delete(request);
    if (!item?.target) return;
    const received = nowUs();
    let body = Buffer.concat(item.body);
    if (item.encoding !== 'identity') {
      const decode = { gzip: gunzipSync, br: brotliDecompressSync, deflate: inflateSync, zstd: zstdDecompressSync }[item.encoding];
      if (!decode) { warn(); return; }
      body = decode(body, { maxOutputLength: 16384 });
    }
    const result = JSON.parse(body.toString());
    // already_reacted proves presence at this observation, never backdate it.
    if (result.ok === true || result.error === 'already_reacted') confirmed(...item.target, received);
  });
  return () => subscriptions.forEach(stop => stop());
}
