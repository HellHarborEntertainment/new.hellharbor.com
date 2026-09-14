import type { Env } from './types.js';
import { listCatalog, resolveCart } from './repositories/catalog.js';
import { createShippingQuote } from './commerce/shipping.js';
import { createCheckout } from './commerce/checkout.js';
import { getPublicOrder } from './repositories/orders.js';
import { corsHeaders, errorResponse, json, readJson } from './lib/http.js';
import { badRequest, notFound, unauthorized } from './lib/errors.js';
import { verifyStripeWebhook } from './security/stripe-webhook.js';
import { verifySpreadconnectWebhook } from './security/spreadconnect-webhook.js';
import { randomId } from './lib/crypto.js';

export async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url); const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  try {
    if (request.method === 'GET' && path === '/health') return json({ ok: true, service: 'hhe-commerce', version: '0.1.0' });
    if (request.method === 'GET' && path === '/api/catalog') return json({ products: await listCatalog(env) });
    if (request.method === 'POST' && path === '/api/shipping/quote') {
      const body = await readJson<{ items: Array<{ sku: string; quantity: number }>; address: import('./types.js').Address; contact: import('./types.js').Contact }>(request);
      const items = await resolveCart(env, body.items);
      return json(await createShippingQuote(env, items, body.address, body.contact), 201);
    }
    if (request.method === 'POST' && path === '/api/checkout/create') {
      const body = await readJson<{ quoteId: string; shippingOptionId: string }>(request);
      if (!body.quoteId || !body.shippingOptionId) throw badRequest('quoteId and shippingOptionId are required');
      return json(await createCheckout(env, body.quoteId, body.shippingOptionId), 201);
    }
    const publicOrder = path.match(/^\/api\/orders\/([^/]+)$/);
    if (request.method === 'GET' && publicOrder) return json(await getPublicOrder(env, decodeURIComponent(publicOrder[1]), url.searchParams.get('token') || ''));
    if (request.method === 'POST' && path === '/api/webhooks/stripe') return handleStripeWebhook(request, env, ctx);
    if (request.method === 'POST' && path === '/api/webhooks/spreadconnect') return handleSpreadconnectWebhook(request, env, ctx);
    if (request.method === 'POST' && path === '/api/admin/reconcile') {
      if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_API_KEY}`) throw unauthorized();
      const body = await readJson<{ orderId: string }>(request); await env.FULFILLMENT_QUEUE.send({ type: 'RECONCILE_ORDER', orderId: body.orderId }); return json({ queued: true }, 202);
    }
    throw notFound('Route not found');
  } catch (error) {
    const response = errorResponse(error); for (const [k,v] of Object.entries(corsHeaders(request, env))) response.headers.set(k, String(v)); return response;
  }
}

async function handleStripeWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const raw = await request.text();
  await verifyStripeWebhook(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  const event = JSON.parse(raw) as Record<string, any>;
  const eventId = String(event.id || randomId('stripe_evt'));
  const existing = await env.COMMERCE_DB.prepare('SELECT id FROM webhook_events WHERE provider = ? AND provider_event_id = ?').bind('stripe', eventId).first();
  if (existing) return json({ received: true });
  await env.COMMERCE_DB.prepare(`INSERT INTO webhook_events (id, provider, provider_event_id, event_type, payload_json, received_at) VALUES (?, 'stripe', ?, ?, ?, ?)`)
    .bind(randomId('evt'), eventId, String(event.type || ''), raw, new Date().toISOString()).run();
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data?.object || {}; const orderId = String(session.client_reference_id || session.metadata?.order_id || '');
    if (orderId) {
      const tax = Number(session.total_details?.amount_tax || 0); const total = Number(session.amount_total || 0);
      await env.COMMERCE_DB.prepare(`UPDATE orders SET status='paid', payment_status='paid', tax_total=?, grand_total=?, stripe_payment_intent_id=?, updated_at=? WHERE id=? AND payment_status <> 'paid'`)
        .bind(tax, total, session.payment_intent ? String(session.payment_intent) : null, new Date().toISOString(), orderId).run();
      ctx.waitUntil(env.FULFILLMENT_QUEUE.send({ type: 'FULFILL_ORDER', orderId }));
    }
  } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'payment_intent.payment_failed') {
    const session = event.data?.object || {}; const orderId = String(session.client_reference_id || session.metadata?.order_id || '');
    if (orderId) await env.COMMERCE_DB.prepare(`UPDATE orders SET status='payment_failed', payment_status='failed', updated_at=? WHERE id=?`).bind(new Date().toISOString(), orderId).run();
  }
  return json({ received: true });
}

async function handleSpreadconnectWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const raw = await request.text();
  await verifySpreadconnectWebhook(raw, request.headers.get('x-sprd-signature'), env.SPREADCONNECT_WEBHOOK_SECRET);
  const payload = JSON.parse(raw) as Record<string, any>;
  const providerEventId = String(payload.id || payload.eventId || crypto.randomUUID());
  const existing = await env.COMMERCE_DB.prepare('SELECT id FROM webhook_events WHERE provider = ? AND provider_event_id = ?').bind('spreadconnect', providerEventId).first();
  if (!existing) await env.COMMERCE_DB.prepare(`INSERT INTO webhook_events (id, provider, provider_event_id, event_type, payload_json, received_at) VALUES (?, 'spreadconnect', ?, ?, ?, ?)`)
    .bind(randomId('evt'), providerEventId, String(payload.type || payload.event || ''), raw, new Date().toISOString()).run();
  const externalOrderReference = payload.externalOrderReference || payload.order?.externalOrderReference || payload.shipment?.externalOrderReference;
  if (externalOrderReference) {
    const order = await env.COMMERCE_DB.prepare('SELECT id FROM orders WHERE order_number = ?').bind(String(externalOrderReference)).first<{ id: string }>();
    if (order?.id) ctx.waitUntil(env.FULFILLMENT_QUEUE.send({ type: 'RECONCILE_ORDER', orderId: order.id }));
  }
  return new Response('[accepted]', { status: 202, headers: { 'content-type': 'text/plain' } });
}
