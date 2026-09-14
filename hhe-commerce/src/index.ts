import type { Env, FulfillmentMessage } from './types.js';
import { route } from './router.js';
import { fulfillOrder, reconcileOrder } from './commerce/fulfillment.js';
import { getProvider } from './providers/index.js';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> { return route(request, env, ctx); },

  async queue(batch: MessageBatch<FulfillmentMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (message.body.type === 'FULFILL_ORDER' && message.body.orderId) await fulfillOrder(env, message.body.orderId);
        else if (message.body.type === 'RECONCILE_ORDER' && message.body.orderId) await reconcileOrder(env, message.body.orderId);
        else if (message.body.type === 'CLEANUP_QUOTE' && message.body.quoteId) await cleanupQuote(env, message.body.quoteId);
        message.ack();
      } catch (error) {
        console.error('Queue job failed', message.body, error);
        message.retry({ delaySeconds: Math.min(3600, Math.max(60, 60 * 2 ** Math.min(message.attempts, 5))) });
      }
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledMaintenance(env));
  }
};

async function runScheduledMaintenance(env: Env): Promise<void> {
  const expired = await env.COMMERCE_DB.prepare(`SELECT id FROM shipping_quotes WHERE status IN ('open','reserved') AND expires_at < ?`).bind(new Date().toISOString()).all<{ id: string }>();
  for (const row of expired.results || []) await env.FULFILLMENT_QUEUE.send({ type: 'CLEANUP_QUOTE', quoteId: row.id });
  const active = await env.COMMERCE_DB.prepare(`SELECT id FROM orders WHERE payment_status='paid' AND fulfillment_status NOT IN ('delivered','cancelled') ORDER BY updated_at ASC LIMIT 100`).all<{ id: string }>();
  for (const row of active.results || []) await env.FULFILLMENT_QUEUE.send({ type: 'RECONCILE_ORDER', orderId: row.id });
}

async function cleanupQuote(env: Env, quoteId: string): Promise<void> {
  const quote = await env.COMMERCE_DB.prepare('SELECT provider_quotes_json, order_id, status FROM shipping_quotes WHERE id = ?').bind(quoteId).first<{ provider_quotes_json: string; order_id: string | null; status: string }>();
  if (!quote) return;
  if (quote.order_id) {
    const order = await env.COMMERCE_DB.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(quote.order_id).first<{ payment_status: string }>();
    if (order?.payment_status === 'paid') return;
  }
  const providers = JSON.parse(quote.provider_quotes_json) as Array<{ provider: 'kunaki' | 'spreadconnect'; draftOrderId?: string }>;
  for (const p of providers) if (p.draftOrderId) await getProvider(p.provider).cleanupDraft?.(env, p.draftOrderId);
  await env.COMMERCE_DB.prepare(`UPDATE shipping_quotes SET status='expired' WHERE id=?`).bind(quoteId).run();
}
