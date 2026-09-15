import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/index.js';
import { route } from '../dist/router.js';
import { createCheckout } from '../dist/commerce/checkout.js';
import { claimWebhook, finishWebhook } from '../dist/lib/webhooks.js';
import { verifyTurnstile } from '../dist/security/turnstile.js';
import { setupEnv, seed, spreadSignature } from './helpers.mjs';

test('webhook event ids are cryptographically bound to one payload', async () => {
  const { db, env } = setupEnv();
  const claim = await claimWebhook(env, 'stripe', 'evt_same', 'test.event', 'a'.repeat(64));
  assert.ok(claim); await finishWebhook(env, claim);
  await assert.rejects(() => claimWebhook(env, 'stripe', 'evt_same', 'test.event', 'b'.repeat(64)), /different payload/);
  assert.equal(db.prepare(`SELECT payload_json FROM webhook_events WHERE provider_event_id='evt_same'`).get().payload_json, '{}'); db.close();
});

test('documented Spreadconnect eventType/data envelope queues reconciliation', async () => {
  const { db, env, queued } = setupEnv(); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qw','consumed','[]','{}','{}','[]','[]',?,?)`).run(expires, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,created_at,updated_at) VALUES ('ow','HHE-W','tok','a@b.com','1','paid','paid','processing','usd',1,0,0,1,'qw','economy','{}',?,?)`).run(now, now);
  const payload = { id: 'sc-event-1', eventType: 'ORDER_STATUS_CHANGED', data: { order: { externalOrderReference: 'HHE-W' } } }; const raw = JSON.stringify(payload);
  const response = await route(new Request('https://api.hhe.test/api/webhooks/spreadconnect', { method: 'POST', headers: { 'x-sprd-signature': await spreadSignature(raw, env.SPREADCONNECT_WEBHOOK_SECRET) }, body: raw }), env, { waitUntil(promise) { promise.catch(() => {}); }, passThroughOnException() {} });
  assert.equal(response.status, 202); assert.ok(queued.some(message => message.type === 'RECONCILE_ORDER' && message.orderId === 'ow'));
  const ledger = db.prepare(`SELECT payload_json,payload_sha256,processed_at FROM webhook_events WHERE provider_event_id='sc-event-1'`).get(); assert.equal(ledger.payload_json, '{}'); assert.equal(ledger.payload_sha256.length, 64); assert.ok(ledger.processed_at); db.close();
});

test('live commerce mode fails closed if Turnstile is not configured', async () => {
  const { db, env } = setupEnv({ KUNAKI_MODE: 'LIVE', TURNSTILE_SECRET_KEY: undefined, REQUIRE_TURNSTILE: 'false' });
  await assert.rejects(() => verifyTurnstile(env, new Request('https://hhe.test'), 'shipping_quote'), /required but not configured/); db.close();
});

test('Turnstile requires matching hostname and action when enabled', async () => {
  const { db, env } = setupEnv({ REQUIRE_TURNSTILE: 'true', TURNSTILE_SECRET_KEY: 'turnstile-secret-longer-than-twenty-characters' }); const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: 'hhe.test', action: 'wrong_action' }), { status: 200, headers: { 'content-type': 'application/json' } });
  try { await assert.rejects(() => verifyTurnstile(env, new Request('https://hhe.test', { headers: { 'x-turnstile-token': 'token' } }), 'shipping_quote'), /action mismatch/); }
  finally { globalThis.fetch = original; db.close(); }
});

test('Checkout refuses a quote too close to Stripe minimum expiration window', async () => {
  const { db, env } = setupEnv(); const now = new Date().toISOString(), expires = new Date(Date.now() + 20 * 60000).toISOString();
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qlate','open','[]','{}','{}','[]','[]',?,?)`).run(expires, now);
  await assert.rejects(() => createCheckout(env, 'qlate', 'economy'), /too close to expiry/); db.close();
});

test('quote cleanup never cancels provider drafts when Stripe says Session is paid/complete', async () => {
  const { db, env } = setupEnv(); const now = new Date(Date.now() - 7200000).toISOString(), expired = new Date(Date.now() - 3600000).toISOString();
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,selected_option_id,order_id,expires_at,created_at) VALUES ('qclean','reserved','[]','{}','{}',?,'[]','economy','oclean',?,?)`).run(JSON.stringify([{ provider: 'spreadconnect', draftOrderId: 'draft-1', options: [] }]), expired, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,stripe_checkout_session_id,created_at,updated_at) VALUES ('oclean','HHE-CLEAN','tok','a@b.com','1','pending_payment','unpaid','unfulfilled','usd',1,0,0,1,'qclean','economy','{}','cs_paid',?,?)`).run(now, now);
  const original = globalThis.fetch; let providerCancel = false; globalThis.fetch = async (input, init = {}) => { const url = String(input); if (url === 'https://api.stripe.com/v1/checkout/sessions/cs_paid') return new Response(JSON.stringify({ id: 'cs_paid', status: 'complete', payment_status: 'paid' }), { status: 200 }); if (url.includes('/cancel')) { providerCancel = true; return new Response('{}', { status: 200 }); } throw new Error(`unexpected fetch ${init.method || 'GET'} ${url}`); };
  let acked = false, retried = false;
  try { await worker.queue({ queue: 'test', messages: [{ body: { type: 'CLEANUP_QUOTE', quoteId: 'qclean' }, attempts: 1, ack() { acked = true; }, retry() { retried = true; } }] }, env); assert.equal(acked, true); assert.equal(retried, false); assert.equal(providerCancel, false); assert.equal(db.prepare(`SELECT status FROM shipping_quotes WHERE id='qclean'`).get().status, 'reserved'); }
  finally { globalThis.fetch = original; db.close(); }
});

test('scheduled privacy retention redacts completed customer PII and tracking data', async () => {
  const { db, env } = setupEnv({ CUSTOMER_PII_RETENTION_DAYS: '30' }); const old = new Date(Date.now() - 60 * 86400000).toISOString(), expires = new Date(Date.now() - 59 * 86400000).toISOString();
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qp','consumed','[]',?,?, '[]','[]',?,?)`).run(JSON.stringify({ address1: 'Secret St' }), JSON.stringify({ email: 'customer@example.com', phone: '555' }), expires, old);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,created_at,updated_at) VALUES ('op','HHE-P','tok','customer@example.com','555','complete','paid','delivered','usd',1,0,0,1,'qp','economy',?, ?,?)`).run(JSON.stringify({ address1: 'Secret St' }), old, old);
  let maintenance; worker.scheduled({ scheduledTime: Date.now(), cron: '17 * * * *' }, env, { waitUntil(promise) { maintenance = promise; }, passThroughOnException() {} }); await maintenance;
  const order = db.prepare(`SELECT customer_email,customer_phone,address_json,pii_redacted_at FROM orders WHERE id='op'`).get(); assert.equal(order.customer_email, '[redacted]'); assert.equal(order.customer_phone, '[redacted]'); assert.equal(order.address_json, '{}'); assert.ok(order.pii_redacted_at); assert.equal(db.prepare(`SELECT address_json,contact_json FROM shipping_quotes WHERE id='qp'`).get().contact_json, '{}'); db.close();
});
