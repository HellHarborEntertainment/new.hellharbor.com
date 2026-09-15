import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCart } from '../dist/repositories/catalog.js';
import { createShippingQuote } from '../dist/commerce/shipping.js';
import { createCheckout } from '../dist/commerce/checkout.js';
import { fulfillOrder, normalizeProviderStatus, recomputeOrderFulfillmentStatus } from '../dist/commerce/fulfillment.js';
import { route } from '../dist/router.js';
import { createRefund } from '../dist/stripe/refunds.js';
import { cancelFulfillment, retryFulfillment } from '../dist/admin/service.js';
import { setupEnv, seed, stripeSignature, mockCoreProviders } from './helpers.mjs';

test('mixed cart completes quote -> checkout -> signed payment -> both providers without storing raw webhook PII', async () => {
  const { db, env, queued } = setupEnv(); seed(db); const calls = []; const original = globalThis.fetch; globalThis.fetch = mockCoreProviders(calls);
  try {
    const items = await resolveCart(env, [{ sku: 'TEE-BLK-L', quantity: 1 }, { sku: 'CD-STD', quantity: 1 }]);
    const address = { firstName: 'Jordin', lastName: 'Bryant', address1: '123 Main St', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
    const quote = await createShippingQuote(env, items, address, { email: 'buyer@example.com', phone: '5551234567' }, 'quote-key-1');
    assert.equal(quote.options[0].actualProviderCost, 1150);
    const checkout = await createCheckout(env, quote.quoteId, quote.options[0].id);
    const checkoutAgain = await createCheckout(env, quote.quoteId, quote.options[0].id);
    assert.equal(checkoutAgain.checkoutSessionId, checkout.checkoutSessionId);
    assert.equal(checkoutAgain.publicToken, checkout.publicToken);
    const order = db.prepare('SELECT * FROM orders WHERE order_number=?').get(checkout.orderNumber);
    assert.notEqual(order.public_token, checkout.publicToken);
    assert.equal(order.public_token.length, 64);

    const event = { id: 'evt_paid_1', type: 'checkout.session.completed', data: { object: {
      id: 'cs_1', client_reference_id: order.id, metadata: { order_id: order.id, order_number: order.order_number }, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_1', amount_subtotal: 4500, amount_total: 5650, total_details: { amount_tax: 0, amount_shipping: 1150 },
      collected_information: { shipping_details: { name: 'Jordin Bryant', address: { line1: '123 Main St', city: 'Aberdeen', state: 'WA', postal_code: '98520', country: 'US' } } }
    } } };
    const raw = JSON.stringify(event);
    const response = await route(new Request('https://api.hhe.test/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': await stripeSignature(raw, env.STRIPE_WEBHOOK_SECRET) }, body: raw }), env, { waitUntil(promise) { promise.catch(() => {}); }, passThroughOnException() {} });
    assert.equal(response.status, 200);
    const ledger = db.prepare(`SELECT payload_json,payload_sha256,processed_at FROM webhook_events WHERE provider_event_id='evt_paid_1'`).get();
    assert.equal(ledger.payload_json, '{}'); assert.equal(ledger.payload_sha256.length, 64); assert.ok(ledger.processed_at);
    assert.ok(queued.some(message => message.type === 'FULFILL_ORDER' && message.orderId === order.id));

    await fulfillOrder(env, order.id);
    const groups = db.prepare('SELECT provider,provider_order_id,status FROM fulfillment_groups WHERE order_id=? ORDER BY provider').all(order.id);
    assert.deepEqual(groups.map(group => group.provider_order_id), ['K-200', '101']);
    const kunakiCall = calls.find(call => call.url === 'https://kunaki.test/XMLService.ASP' && String(call.init.body || '').includes('<Order>'));
    assert.ok(kunakiCall); assert.doesNotMatch(kunakiCall.url, /user|pass/i); assert.match(String(kunakiCall.init.body), /<UserId>user<\/UserId>/); assert.match(String(kunakiCall.init.body), /<Password>pass<\/Password>/);
  } finally { globalThis.fetch = original; db.close(); }
});

test('public quote response hides provider selections and actual provider costs', async () => {
  const { db, env } = setupEnv(); seed(db); const calls = []; const original = globalThis.fetch; globalThis.fetch = mockCoreProviders(calls);
  try {
    const body = { items: [{ sku: 'CD-STD', quantity: 1 }], address: { firstName: 'A', lastName: 'B', address1: '1 Main St', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' }, contact: { email: 'a@example.com', phone: '5551112222' } };
    const response = await route(new Request('https://api.hhe.test/api/shipping/quote', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'public-quote' }, body: JSON.stringify(body) }), env, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 201); const text = await response.text(); assert.doesNotMatch(text, /providerSelections|actualProviderCost|kunaki/i);
  } finally { globalThis.fetch = original; db.close(); }
});

test('public order response accepts hashed token but hides providers, group ids, costs, and exception internals', async () => {
  const { db, env } = setupEnv(); seed(db); const calls = []; const original = globalThis.fetch; globalThis.fetch = mockCoreProviders(calls);
  try {
    const items = await resolveCart(env, [{ sku: 'CD-STD', quantity: 1 }]); const address = { firstName: 'A', lastName: 'B', address1: '1 Main St', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
    const quote = await createShippingQuote(env, items, address, { email: 'a@example.com', phone: '5551112222' }, 'order-view'); const checkout = await createCheckout(env, quote.quoteId, quote.options[0].id);
    const response = await route(new Request(`https://api.hhe.test/api/orders/${checkout.orderNumber}`, { headers: { 'x-hhe-order-token': checkout.publicToken } }), env, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200); const text = await response.text(); assert.doesNotMatch(text, /provider|shipping_cost|shippingCost|fulfillment_group|exceptionCode/i);
  } finally { globalThis.fetch = original; db.close(); }
});

test('paid webhook fails closed on changed address and on wrong amount', async () => {
  for (const mode of ['address', 'amount']) {
    const { db, env, queued } = setupEnv(); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString(); const address = { firstName: 'A', lastName: 'B', address1: '1 Main St', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
    db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,selected_option_id,order_id,expires_at,created_at) VALUES ('q','reserved','[]',?,?,?,?, 'economy','o',?,?)`).run(JSON.stringify(address), '{}', '[]', '[]', expires, now);
    db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,stripe_checkout_session_id,created_at,updated_at) VALUES ('o','HHE-X','tok','a@b.com','1','pending_payment','unpaid','unfulfilled','usd',1000,500,0,1500,'q','economy',?,'cs_x',?,?)`).run(JSON.stringify(address), now, now);
    const event = { id: `evt_${mode}`, type: 'checkout.session.completed', data: { object: { id: 'cs_x', client_reference_id: 'o', metadata: { order_id: 'o', order_number: 'HHE-X' }, currency: 'usd', payment_status: 'paid', payment_intent: `pi_${mode}`, amount_subtotal: mode === 'amount' ? 900 : 1000, amount_total: mode === 'amount' ? 1400 : 1500, total_details: { amount_tax: 0, amount_shipping: 500 }, collected_information: { shipping_details: { name: 'A B', address: { line1: '1 Main St', city: 'Aberdeen', state: 'WA', postal_code: mode === 'address' ? '98101' : '98520', country: 'US' } } } } } };
    const raw = JSON.stringify(event); const response = await route(new Request('https://x/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': await stripeSignature(raw, env.STRIPE_WEBHOOK_SECRET) }, body: raw }), env, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200); const order = db.prepare(`SELECT status,payment_status,fulfillment_status,exception_code FROM orders WHERE id='o'`).get(); assert.equal(order.payment_status, 'paid'); assert.equal(order.status, 'exception'); assert.equal(order.fulfillment_status, 'exception'); assert.equal(queued.length, 0); db.close();
  }
});

test('duplicate SKU lines are consolidated and cannot bypass quantity caps', async () => {
  const { db, env } = setupEnv(); seed(db); const items = await resolveCart(env, [{ sku: 'CD-STD', quantity: 10 }, { sku: 'CD-STD', quantity: 10 }]); assert.equal(items.length, 1); assert.equal(items[0].quantity, 20); await assert.rejects(() => resolveCart(env, [{ sku: 'CD-STD', quantity: 20 }, { sku: 'CD-STD', quantity: 10 }]), /Quantity limit exceeded/); db.close();
});

test('concurrent Kunaki fulfillment workers create only one manufacturing order', async () => {
  const { db, env } = setupEnv(); seed(db); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString(), address = { firstName: 'A', lastName: 'B', address1: '1 Main St', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  const item = { productId: 'p2', variantId: 'v2', sku: 'CD-STD', productName: 'Album CD', variantName: 'Standard', provider: 'kunaki', providerProductId: 'KUNAKI-CD-1', unitPrice: 1500, currency: 'usd', quantity: 1 };
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,selected_option_id,order_id,expires_at,created_at) VALUES ('qc','consumed',?,?,?,?,?,'economy','oc',?,?)`).run(JSON.stringify([item]), JSON.stringify(address), JSON.stringify({ email: 'a@b.com', phone: '1' }), JSON.stringify([{ provider: 'kunaki', options: [{ provider: 'kunaki', id: 'Media Mail', name: 'Media Mail', price: 500, currency: 'usd' }] }]), JSON.stringify([{ id: 'economy', name: 'HHE Economy', price: 500, actualProviderCost: 500, currency: 'usd', providerSelections: { kunaki: { optionId: 'Media Mail', name: 'Media Mail', price: 500 } } }]), expires, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,created_at,updated_at) VALUES ('oc','HHE-C','t','a@b.com','1','paid','paid','unfulfilled','usd',1500,500,0,2000,'qc','economy',?,?,?)`).run(JSON.stringify(address), now, now);
  db.prepare(`INSERT INTO order_items (id,order_id,product_id,variant_id,sku,name,quantity,unit_price,provider,provider_product_id) VALUES ('ic','oc','p2','v2','CD-STD','Album CD',1,1500,'kunaki','KUNAKI-CD-1')`).run();
  const original = globalThis.fetch; let orderCalls = 0; globalThis.fetch = async (input, init = {}) => { if (String(input) === env.KUNAKI_XML_BASE_URL && String(init.body || '').includes('<Order>')) { orderCalls++; await new Promise(resolve => setTimeout(resolve, 20)); return new Response('<Response><ErrorCode>0</ErrorCode><OrderId>K-CONCURRENT</OrderId></Response>', { status: 200 }); } throw new Error('unexpected fetch'); };
  try { await Promise.all([fulfillOrder(env, 'oc'), fulfillOrder(env, 'oc')]); assert.equal(orderCalls, 1); } finally { globalThis.fetch = original; db.close(); }
});

test('refund reservations are idempotent, hashed, and cannot exceed paid total under concurrency', async () => {
  const { db, env } = setupEnv(); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString(), address = { firstName: 'A', lastName: 'B', address1: '1 Main St', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qr','consumed','[]',?,'{}','[]','[]',?,?)`).run(JSON.stringify(address), expires, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,stripe_payment_intent_id,created_at,updated_at) VALUES ('or','HHE-R','t','a@b.com','1','paid','paid','unfulfilled','usd',5000,0,0,5000,'qr','economy',?,'pi_refund',?,?)`).run(JSON.stringify(address), now, now);
  const original = globalThis.fetch; let calls = 0; globalThis.fetch = async url => { if (String(url) === 'https://api.stripe.com/v1/refunds') { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response(JSON.stringify({ id: `re_${calls}`, status: 'succeeded' }), { status: 200 }); } throw new Error('unexpected fetch'); };
  try {
    const first = await createRefund(env, { orderId: 'or', amount: 1000, requestKey: 'refund-secret-key' }); const again = await createRefund(env, { orderId: 'or', amount: 1000, requestKey: 'refund-secret-key' }); assert.equal(first.id, again.id); assert.notEqual(db.prepare('SELECT request_key FROM refunds WHERE id=?').get(first.id).request_key, 'refund-secret-key');
    const results = await Promise.allSettled([createRefund(env, { orderId: 'or', amount: 3000, requestKey: 'race-a' }), createRefund(env, { orderId: 'or', amount: 3000, requestKey: 'race-b' })]); assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  } finally { globalThis.fetch = original; db.close(); }
});

test('admin retry and cancel refuse a live submission lease', async () => {
  const { db, env } = setupEnv(); seed(db); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString(); db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('ql','consumed','[]','{}','{}','[]','[]',?,?)`).run(expires, now); db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,created_at,updated_at) VALUES ('ol','HHE-L','t','a@b.com','1','paid','paid','submitted','usd',1,0,0,1,'ql','economy','{}',?,?)`).run(now, now); db.prepare(`INSERT INTO fulfillment_groups (id,order_id,provider,status,submission_token,submission_started_at,created_at,updated_at) VALUES ('fgl','ol','kunaki','submitting','lease',?,?,?)`).run(now, now, now); await assert.rejects(() => retryFulfillment(env, 'fgl', 'I_UNDERSTAND_DUPLICATE_RISK'), /currently in progress/); await assert.rejects(() => cancelFulfillment(env, 'fgl'), /currently in progress/); db.close();
});

test('provider status normalization and master order recover monotonically', async () => {
  assert.equal(normalizeProviderStatus('DECLINED'), 'exception'); assert.equal(normalizeProviderStatus('SHIPPED'), 'shipped');
  const { db, env } = setupEnv(); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString(); db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qs','consumed','[]','{}','{}','[]','[]',?,?)`).run(expires, now); db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,created_at,updated_at) VALUES ('os','HHE-S','t','a@b.com','1','exception','paid','exception','usd',1,0,0,1,'qs','economy','{}',?,?)`).run(now, now); db.prepare(`INSERT INTO fulfillment_groups (id,order_id,provider,status,provider_order_id,created_at,updated_at) VALUES ('fgs','os','kunaki','processing','K-1',?,?)`).run(now, now); await recomputeOrderFulfillmentStatus(env, 'os'); const order = db.prepare(`SELECT status,fulfillment_status FROM orders WHERE id='os'`).get(); assert.equal(order.status, 'paid'); assert.equal(order.fulfillment_status, 'processing'); db.close();
});
