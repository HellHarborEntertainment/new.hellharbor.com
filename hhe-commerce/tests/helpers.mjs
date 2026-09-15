import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { bytesToBase64, bytesToHex, hmacSha256 } from '../dist/lib/crypto.js';

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

export function setupEnv(overrides = {}) {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const filename of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) db.exec(fs.readFileSync(new URL(filename, migrations), 'utf8'));
  const queued = [];
  const env = {
    COMMERCE_DB: new D1Mock(db),
    FULFILLMENT_QUEUE: { async send(message) { queued.push(message); } },
    PUBLIC_RATE_LIMITER: { async limit() { return { success: true }; } },
    ADMIN_RATE_LIMITER: { async limit() { return { success: true }; } },
    STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_SUCCESS_URL: 'https://hhe.test/success', STRIPE_CANCEL_URL: 'https://hhe.test/cart', STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'US,CA',
    SPREADCONNECT_ACCESS_TOKEN: 'spod', SPREADCONNECT_WEBHOOK_SECRET: 'spodsecret', SPREADCONNECT_BASE_URL: 'https://spreadconnect-staging.test',
    KUNAKI_USER_ID: 'user', KUNAKI_PASSWORD: 'pass', KUNAKI_MODE: 'TEST', KUNAKI_XML_BASE_URL: 'https://kunaki.test/XMLService.ASP',
    ALLOWED_ORIGINS: 'https://hhe.test', CURRENCY: 'usd', QUOTE_TTL_MINUTES: '60', ADMIN_API_KEY: 'admin-key-that-is-longer-than-thirty-two-characters', ORDER_ACCESS_SECRET: 'order-access-secret-that-is-longer-than-thirty-two-characters',
    FREE_SHIPPING_THRESHOLD_CENTS: '0', SHIPPING_SUBSIDY_CENTS: '0', SHIPPING_MARKUP_BPS: '0', MIN_SHIPPING_CHARGE_CENTS: '0', REQUIRE_TURNSTILE: 'false', TURNSTILE_EXPECTED_HOSTNAMES: 'hhe.test', UNPAID_PII_RETENTION_DAYS: '7', CUSTOMER_PII_RETENTION_DAYS: '365',
    ...overrides
  };
  return { db, env, queued };
}

export function seed(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO products (id,sku,name,retail_price,currency,provider,provider_product_id,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run('p1','TEE','Tee',3000,'usd','spreadconnect',null,1,now,now);
  db.prepare(`INSERT INTO product_variants (id,product_id,sku,name,provider_sku,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).run('v1','p1','TEE-BLK-L','Black L','SPOD-TEE-L',1,now,now);
  db.prepare(`INSERT INTO products (id,sku,name,retail_price,currency,provider,provider_product_id,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run('p2','CD','Album CD',1500,'usd','kunaki','KUNAKI-CD-1',1,now,now);
  db.prepare(`INSERT INTO product_variants (id,product_id,sku,name,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run('v2','p2','CD-STD','Standard',1,now,now);
}

export async function stripeSignature(raw, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = bytesToHex(await hmacSha256(`${timestamp}.${raw}`, secret));
  return `t=${timestamp},v1=${signature}`;
}
export async function spreadSignature(raw, secret) { return bytesToBase64(await hmacSha256(raw, secret)); }

export function mockCoreProviders(calls, { kunakiOrderId = 'K-200' } = {}) {
  return async (input, init = {}) => {
    const url = String(input); calls.push({ url, init });
    if (url === 'https://spreadconnect-staging.test/orders' && init.method === 'POST') return new Response(JSON.stringify({ id: 101, state: 'NEW' }), { status: 200 });
    if (url === 'https://spreadconnect-staging.test/orders/101/shippingTypes') return new Response(JSON.stringify([{ id: 'SC-GROUND', name: 'Ground', price: { amount: 6.5, currency: 'USD' } }]), { status: 200 });
    if (url === 'https://spreadconnect-staging.test/orders/101' && init.method === 'PUT') return new Response(JSON.stringify({ id: 101, state: 'NEW' }), { status: 200 });
    if (url === 'https://spreadconnect-staging.test/orders/101/shippingType') return new Response('{}', { status: 200 });
    if (url === 'https://spreadconnect-staging.test/orders/101/confirm') return new Response(JSON.stringify({ id: 101, state: 'CONFIRMED' }), { status: 200 });
    if (url === 'https://spreadconnect-staging.test/orders/101') return new Response(JSON.stringify({ id: 101, state: 'CONFIRMED' }), { status: 200 });
    if (url === 'https://spreadconnect-staging.test/orders/101/shipments') return new Response('[]', { status: 200 });
    if (url === 'https://kunaki.test/XMLService.ASP' && init.method === 'POST') {
      const body = String(init.body || '');
      if (body.includes('<ShippingOptions>')) return new Response('<Response><ErrorCode>0</ErrorCode><Option><Description>Media Mail</Description><Price>5.00</Price><DeliveryTime>5-9 days</DeliveryTime></Option></Response>', { status: 200 });
      if (body.includes('<Order>')) return new Response(`<Response><ErrorCode>0</ErrorCode><OrderId>${kunakiOrderId}</OrderId></Response>`, { status: 200 });
      if (body.includes('<OrderStatus>')) return new Response('<Response><ErrorCode>0</ErrorCode><OrderStatus>PROCESSING</OrderStatus><TrackingType>NA</TrackingType><TrackingId>NA</TrackingId></Response>', { status: 200 });
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected fetch ${init.method || 'GET'} ${url}`);
  };
}
