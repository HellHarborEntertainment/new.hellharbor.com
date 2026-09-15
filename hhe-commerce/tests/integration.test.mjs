import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { resolveCart } from '../dist/repositories/catalog.js';
import { createShippingQuote } from '../dist/commerce/shipping.js';
import { createCheckout } from '../dist/commerce/checkout.js';
import { route } from '../dist/router.js';
import { fulfillOrder } from '../dist/commerce/fulfillment.js';
import { bytesToHex, hmacSha256 } from '../dist/lib/crypto.js';
import { createRefund } from '../dist/stripe/refunds.js';
import { retryFulfillment } from '../dist/admin/service.js';

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { const statement = new Statement(this.db, this.sql); statement.values = values; return statement; }
  async first(column) { const row = this.db.prepare(this.sql).get(...this.values); if (!row) return null; return column ? row[column] : row; }
  async all() { return { success: true, results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() { const result = this.db.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
}
class D1Mock {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Statement(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const statement of statements) {
        const result = this.db.prepare(statement.sql).run(...statement.values);
        out.push({ success: true, meta: { changes: Number(result.changes) } });
      }
      this.db.exec('COMMIT');
      return out;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function setupEnv() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const filename of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(new URL(filename, migrations), 'utf8'));
  }
  const d1 = new D1Mock(db);
  const queued = [];
  const env = {
    COMMERCE_DB: d1,
    FULFILLMENT_QUEUE: { async send(message) { queued.push(message); } },
    PUBLIC_RATE_LIMITER: { async limit() { return { success: true }; } },
    ADMIN_RATE_LIMITER: { async limit() { return { success: true }; } },
    STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_SUCCESS_URL: 'https://hhe.test/success', STRIPE_CANCEL_URL: 'https://hhe.test/cart', STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'US,CA',
    SPREADCONNECT_ACCESS_TOKEN: 'spod', SPREADCONNECT_WEBHOOK_SECRET: 'spodsecret', SPREADCONNECT_BASE_URL: 'https://spread.test',
    KUNAKI_USER_ID: 'user', KUNAKI_PASSWORD: 'pass', KUNAKI_MODE: 'TEST', KUNAKI_BASE_URL: 'https://kunaki.test/HTTPService.ASP',
    ALLOWED_ORIGINS: 'https://hhe.test', CURRENCY: 'usd', QUOTE_TTL_MINUTES: '45', ADMIN_API_KEY: 'admin-key-that-is-longer-than-thirty-two-characters',
    FREE_SHIPPING_THRESHOLD_CENTS: '0', SHIPPING_SUBSIDY_CENTS: '0', SHIPPING_MARKUP_BPS: '0', MIN_SHIPPING_CHARGE_CENTS: '0'
  };
  return { db, env, queued };
}

function seed(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO products (id,sku,name,retail_price,currency,provider,provider_product_id,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run('p1', 'TEE', 'Tee', 3000, 'usd', 'spreadconnect', null, 1, now, now);
  db.prepare(`INSERT INTO product_variants (id,product_id,sku,name,provider_sku,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).run('v1', 'p1', 'TEE-BLK-L', 'Black L', 'SPOD-TEE-L', 1, now, now);
  db.prepare(`INSERT INTO products (id,sku,name,retail_price,currency,provider,provider_product_id,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run('p2', 'CD', 'Album CD', 1500, 'usd', 'kunaki', 'KUNAKI-CD-1', 1, now, now);
  db.prepare(`INSERT INTO product_variants (id,product_id,sku,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run('v2', 'p2', 'CD-STD', 'Standard', 1, now, now);
}

function stripeSignature(raw, secret) {
  return (async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = bytesToHex(await hmacSha256(`${timestamp}.${raw}`, secret));
    return `t=${timestamp},v1=${signature}`;
  })();
}

test('mixed cart flows quote -> checkout -> paid webhook -> both fulfillment providers', async () => {
  const { db, env, queued } = setupEnv(); seed(db); const calls = []; const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input); calls.push({ url, init });
    if (url === 'https://spread.test/orders' && init.method === 'POST') return new Response(JSON.stringify({ id: 101, state: 'NEW' }), { status: 200 });
    if (url === 'https://spread.test/orders/101/shippingTypes') return new Response(JSON.stringify([{ id: 'SC-GROUND', name: 'Ground', price: { amount: 6.5, currency: 'USD' } }]), { status: 200 });
    if (url === 'https://spread.test/orders/101' && init.method === 'PUT') return new Response(JSON.stringify({ id: 101, state: 'NEW' }), { status: 200 });
    if (url === 'https://spread.test/orders/101/shippingType') return new Response('{}', { status: 200 });
    if (url === 'https://spread.test/orders/101/confirm') return new Response(JSON.stringify({ id: 101, state: 'CONFIRMED' }), { status: 200 });
    if (url.startsWith('https://kunaki.test/HTTPService.ASP?')) {
      const parsed = new URL(url); const type = parsed.searchParams.get('RequestType');
      if (type === 'ShippingOptions') return new Response('<Response><ErrorCode>0</ErrorCode><Option><Description>Media Mail</Description><Price>5.00</Price><DeliveryTime>5-9 days</DeliveryTime></Option></Response>', { status: 200 });
      if (type === 'Order') return new Response('<Response><ErrorCode>0</ErrorCode><OrderId>K-200</OrderId></Response>', { status: 200 });
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected fetch ${init.method || 'GET'} ${url}`);
  };
  try {
    const items = await resolveCart(env, [{ sku: 'TEE-BLK-L', quantity: 1 }, { sku: 'CD-STD', quantity: 1 }]);
    const address = { firstName: 'Jordin', lastName: 'Bryant', address1: '123 Main St', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
    const quote = await createShippingQuote(env, items, address, { email: 'buyer@example.com', phone: '5551234567' }, 'quote-key-1');
    assert.equal(quote.options[0].actualProviderCost, 1150);
    const providerCallsAfterQuote = calls.length;
    const quoteAgain = await createShippingQuote(env, items, address, { email: 'buyer@example.com', phone: '5551234567' }, 'quote-key-1');
    assert.equal(quoteAgain.quoteId, quote.quoteId); assert.equal(calls.length, providerCallsAfterQuote);
    await assert.rejects(() => createShippingQuote(env, items, { ...address, postalCode: '98101' }, { email: 'buyer@example.com', phone: '5551234567' }, 'quote-key-1'), /different shipping quote request/);

    const checkout = await createCheckout(env, quote.quoteId, quote.options[0].id); assert.equal(checkout.checkoutSessionId, 'cs_1');
    const stripeCallsAfterCheckout = calls.filter(call => call.url === 'https://api.stripe.com/v1/checkout/sessions').length;
    const checkoutAgain = await createCheckout(env, quote.quoteId, quote.options[0].id);
    assert.equal(checkoutAgain.checkoutSessionId, 'cs_1'); assert.equal(calls.filter(call => call.url === 'https://api.stripe.com/v1/checkout/sessions').length, stripeCallsAfterCheckout);
    const order = db.prepare('SELECT * FROM orders WHERE order_number=?').get(checkout.orderNumber); assert.equal(order.shipping_total, 1150); assert.equal(order.grand_total, 5650);
    const stripeCall = calls.find(call => call.url === 'https://api.stripe.com/v1/checkout/sessions');
    assert.match(String(stripeCall.init.body), /shipping_address_collection%5Ballowed_countries%5D%5B0%5D=US/);
    assert.doesNotMatch(String(stripeCall.init.body), /token=/);

    const event = { id: 'evt_paid_1', type: 'checkout.session.completed', data: { object: {
      id: 'cs_1', client_reference_id: order.id, metadata: { order_id: order.id, order_number: order.order_number }, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_1',
      amount_subtotal: 4500, amount_total: 5650, total_details: { amount_tax: 0, amount_shipping: 1150 },
      collected_information: { shipping_details: { name: 'Jordin Bryant', address: { line1: '123 Main St', city: 'Aberdeen', state: 'WA', postal_code: '98520', country: 'US' } } }
    } } };
    const raw = JSON.stringify(event);
    const response = await route(new Request('https://api.hhe.test/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': await stripeSignature(raw, env.STRIPE_WEBHOOK_SECRET) }, body: raw }), env, { waitUntil(promise) { promise.catch(() => {}); }, passThroughOnException() {} });
    assert.equal(response.status, 200);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(db.prepare('SELECT payment_status FROM orders WHERE id=?').get(order.id).payment_status, 'paid');
    assert.ok(queued.some(message => message.type === 'FULFILL_ORDER' && message.orderId === order.id));

    await fulfillOrder(env, order.id);
    const groups = db.prepare('SELECT provider,provider_order_id,status FROM fulfillment_groups WHERE order_id=? ORDER BY provider').all(order.id);
    assert.equal(groups.length, 2); assert.deepEqual(groups.map(group => group.provider_order_id), ['K-200', '101']);
    assert.equal(db.prepare('SELECT fulfillment_status FROM orders WHERE id=?').get(order.id).fulfillment_status, 'processing');
  } finally { globalThis.fetch = original; db.close(); }
});

test('paid webhook fails closed when Stripe address changes postal code', async () => {
  const { db, env, queued } = setupEnv(); seed(db); const expires = new Date(Date.now() + 3600000).toISOString();
  const address = { firstName: 'A', lastName: 'B', address1: '1 Main', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,selected_option_id,order_id,expires_at,created_at) VALUES ('q','reserved','[]',?,?,?,?, 'economy','o',?,?)`).run(JSON.stringify(address), '{}', '[]', '[]', expires, new Date().toISOString());
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,stripe_checkout_session_id,created_at,updated_at) VALUES ('o','HHE-X','tok','a@b.com','1','pending_payment','unpaid','unfulfilled','usd',1,1,0,2,'q','economy',?,'cs_mismatch',?,?)`).run(JSON.stringify(address), new Date().toISOString(), new Date().toISOString());
  const event = { id: 'evt_mismatch', type: 'checkout.session.completed', data: { object: {
    id: 'cs_mismatch', client_reference_id: 'o', metadata: { order_id: 'o', order_number: 'HHE-X' }, currency: 'usd', payment_status: 'paid', payment_intent: 'pi', amount_subtotal: 1, amount_total: 2, total_details: { amount_tax: 0, amount_shipping: 1 },
    collected_information: { shipping_details: { name: 'A B', address: { line1: '1 Main', city: 'Aberdeen', state: 'WA', postal_code: '98101', country: 'US' } } }
  } } };
  const raw = JSON.stringify(event);
  const response = await route(new Request('https://x/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': await stripeSignature(raw, env.STRIPE_WEBHOOK_SECRET) }, body: raw }), env, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const order = db.prepare(`SELECT status,payment_status,fulfillment_status,exception_code FROM orders WHERE id='o'`).get();
  assert.equal(order.payment_status, 'paid'); assert.equal(order.status, 'exception'); assert.equal(order.fulfillment_status, 'exception'); assert.equal(order.exception_code, 'shipping_address_mismatch'); assert.equal(queued.length, 0); db.close();
});

test('paid webhook blocks a validly signed Stripe session with the wrong amount', async () => {
  const { db, env, queued } = setupEnv(); seed(db); const expires = new Date(Date.now() + 3600000).toISOString();
  const address = { firstName: 'A', lastName: 'B', address1: '1 Main', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,selected_option_id,order_id,expires_at,created_at) VALUES ('qi','reserved','[]',?,?,?,?, 'economy','oi',?,?)`).run(JSON.stringify(address), '{}', '[]', '[]', expires, new Date().toISOString());
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,stripe_checkout_session_id,created_at,updated_at) VALUES ('oi','HHE-I','tok','a@b.com','1','pending_payment','unpaid','unfulfilled','usd',1000,500,0,1500,'qi','economy',?,'cs_integrity',?,?)`).run(JSON.stringify(address), new Date().toISOString(), new Date().toISOString());
  const event = { id: 'evt_integrity', type: 'checkout.session.completed', data: { object: {
    id: 'cs_integrity', client_reference_id: 'oi', metadata: { order_id: 'oi', order_number: 'HHE-I' }, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_i', amount_subtotal: 900, amount_total: 1400, total_details: { amount_tax: 0, amount_shipping: 500 },
    collected_information: { shipping_details: { name: 'A B', address: { line1: '1 Main', city: 'Aberdeen', state: 'WA', postal_code: '98520', country: 'US' } } }
  } } };
  const raw = JSON.stringify(event);
  const response = await route(new Request('https://x/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': await stripeSignature(raw, env.STRIPE_WEBHOOK_SECRET) }, body: raw }), env, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const order = db.prepare(`SELECT status,payment_status,exception_code FROM orders WHERE id='oi'`).get();
  assert.equal(order.payment_status, 'paid'); assert.equal(order.status, 'exception'); assert.equal(order.exception_code, 'payment_integrity_mismatch'); assert.equal(queued.length, 0); db.close();
});

test('duplicate SKU lines are consolidated and cannot bypass per-SKU quantity limits', async () => {
  const { db, env } = setupEnv(); seed(db);
  const items = await resolveCart(env, [{ sku: 'CD-STD', quantity: 10 }, { sku: 'CD-STD', quantity: 10 }]);
  assert.equal(items.length, 1); assert.equal(items[0].quantity, 20);
  await assert.rejects(() => resolveCart(env, [{ sku: 'CD-STD', quantity: 20 }, { sku: 'CD-STD', quantity: 10 }]), /Quantity limit exceeded/);
  db.close();
});

test('concurrent Kunaki fulfillment workers create only one manufacturing order', async () => {
  const { db, env } = setupEnv(); seed(db); const now = new Date().toISOString(); const expires = new Date(Date.now() + 3600000).toISOString();
  const address = { firstName: 'A', lastName: 'B', address1: '1 Main', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  const item = { productId: 'p2', variantId: 'v2', sku: 'CD-STD', productName: 'Album CD', variantName: 'Standard', provider: 'kunaki', providerProductId: 'KUNAKI-CD-1', unitPrice: 1500, currency: 'usd', quantity: 1 };
  const providerQuotes = [{ provider: 'kunaki', options: [{ provider: 'kunaki', id: 'Media Mail', name: 'Media Mail', price: 500, currency: 'usd' }] }];
  const options = [{ id: 'economy', name: 'HHE Economy', price: 500, actualProviderCost: 500, currency: 'usd', providerSelections: { kunaki: { optionId: 'Media Mail', name: 'Media Mail', price: 500 } } }];
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,selected_option_id,order_id,expires_at,created_at) VALUES ('qc','consumed',?,?,?,?,?,'economy','oc',?,?)`).run(JSON.stringify([item]), JSON.stringify(address), JSON.stringify({ email: 'a@b.com', phone: '1' }), JSON.stringify(providerQuotes), JSON.stringify(options), expires, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,created_at,updated_at) VALUES ('oc','HHE-C','t','a@b.com','1','paid','paid','unfulfilled','usd',1500,500,0,2000,'qc','economy',?,?,?)`).run(JSON.stringify(address), now, now);
  db.prepare(`INSERT INTO order_items (id,order_id,product_id,variant_id,sku,name,quantity,unit_price,provider,provider_product_id) VALUES ('ic','oc','p2','v2','CD-STD','Album CD',1,1500,'kunaki','KUNAKI-CD-1')`).run();
  const original = globalThis.fetch; let orderCalls = 0;
  globalThis.fetch = async input => { const url = String(input); if (url.startsWith('https://kunaki.test/HTTPService.ASP?')) { const parsed = new URL(url); if (parsed.searchParams.get('RequestType') === 'Order') { orderCalls++; await new Promise(resolve => setTimeout(resolve, 20)); return new Response('<Response><ErrorCode>0</ErrorCode><OrderId>K-CONCURRENT</OrderId></Response>', { status: 200 }); } } throw new Error(`unexpected fetch ${url}`); };
  try {
    await Promise.all([fulfillOrder(env, 'oc'), fulfillOrder(env, 'oc')]);
    assert.equal(orderCalls, 1);
    const group = db.prepare(`SELECT provider_order_id,status,submission_token FROM fulfillment_groups WHERE order_id='oc'`).get();
    assert.equal(group.provider_order_id, 'K-CONCURRENT'); assert.equal(group.submission_token, null);
  } finally { globalThis.fetch = original; db.close(); }
});

test('refunds are idempotent and update aggregate refund state', async () => {
  const { db, env } = setupEnv(); seed(db); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
  const address = { firstName: 'A', lastName: 'B', address1: '1 Main', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qr','consumed','[]',?,'{}','[]','[]',?,?)`).run(JSON.stringify(address), expires, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,stripe_payment_intent_id,created_at,updated_at) VALUES ('or','HHE-R','t','a@b.com','1','paid','paid','unfulfilled','usd',5000,0,0,5000,'qr','economy',?,'pi_refund',?,?)`).run(JSON.stringify(address), now, now);
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async url => { if (String(url) === 'https://api.stripe.com/v1/refunds') { calls++; return new Response(JSON.stringify({ id: 're_1', status: 'succeeded' }), { status: 200 }); } throw new Error('unexpected fetch'); };
  try {
    const first = await createRefund(env, { orderId: 'or', amount: 5000, reason: 'customer request', requestKey: 'refund-key' });
    const second = await createRefund(env, { orderId: 'or', amount: 5000, reason: 'customer request', requestKey: 'refund-key' });
    assert.equal(first.id, second.id); assert.equal(calls, 1);
    const order = db.prepare(`SELECT refund_status,refunded_total FROM orders WHERE id='or'`).get(); assert.equal(order.refund_status, 'full'); assert.equal(order.refunded_total, 5000);
    await assert.rejects(() => createRefund(env, { orderId: 'or', amount: 1000, requestKey: 'refund-key' }), /different refund amount/);
  } finally { globalThis.fetch = original; db.close(); }
});

test('concurrent refunds cannot reserve more than the paid order total', async () => {
  const { db, env } = setupEnv(); seed(db); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
  const address = { firstName: 'A', lastName: 'B', address1: '1 Main', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qrr','consumed','[]',?,'{}','[]','[]',?,?)`).run(JSON.stringify(address), expires, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,stripe_payment_intent_id,created_at,updated_at) VALUES ('orr','HHE-RR','t','a@b.com','1','paid','paid','unfulfilled','usd',5000,0,0,5000,'qrr','economy',?,'pi_refund_race',?,?)`).run(JSON.stringify(address), now, now);
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async url => { if (String(url) === 'https://api.stripe.com/v1/refunds') { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response(JSON.stringify({ id: `re_race_${calls}`, status: 'succeeded' }), { status: 200 }); } throw new Error('unexpected fetch'); };
  try {
    const results = await Promise.allSettled([
      createRefund(env, { orderId: 'orr', amount: 4000, requestKey: 'race-a' }),
      createRefund(env, { orderId: 'orr', amount: 4000, requestKey: 'race-b' })
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal(calls, 1);
    const reserved = db.prepare(`SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE order_id='orr' AND status NOT IN ('failed','canceled')`).get().total;
    assert.equal(reserved, 4000);
  } finally { globalThis.fetch = original; db.close(); }
});

test('Kunaki ambiguous retry requires explicit duplicate-risk acknowledgement', async () => {
  const { db, env, queued } = setupEnv(); seed(db); const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
  const address = { firstName: 'A', lastName: 'B', address1: '1 Main', city: 'Aberdeen', state: 'WA', postalCode: '98520', country: 'US' };
  db.prepare(`INSERT INTO shipping_quotes (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,expires_at,created_at) VALUES ('qk','consumed','[]',?,'{}','[]','[]',?,?)`).run(JSON.stringify(address), expires, now);
  db.prepare(`INSERT INTO orders (id,order_number,public_token,customer_email,customer_phone,status,payment_status,fulfillment_status,currency,subtotal,shipping_total,tax_total,grand_total,shipping_quote_id,shipping_option_id,address_json,created_at,updated_at) VALUES ('ok','HHE-K','t2','a@b.com','1','exception','paid','exception','usd',1500,0,0,1500,'qk','economy',?,?,?)`).run(JSON.stringify(address), now, now);
  db.prepare(`INSERT INTO fulfillment_groups (id,order_id,provider,status,last_error,created_at,updated_at) VALUES ('fgk','ok','kunaki','exception','ambiguous',?,?)`).run(now, now);
  await assert.rejects(() => retryFulfillment(env, 'fgk'), /duplicate manufacturing order/);
  await retryFulfillment(env, 'fgk', 'I_UNDERSTAND_DUPLICATE_RISK');
  assert.equal(db.prepare(`SELECT status FROM fulfillment_groups WHERE id='fgk'`).get().status, 'queued');
  assert.ok(queued.some(message => message.type === 'FULFILL_ORDER' && message.orderId === 'ok')); db.close();
});
