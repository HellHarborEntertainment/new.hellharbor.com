import type { Env, FulfillmentMessage } from './types.js';
import { route } from './router.js';
import { fulfillOrder, reconcileOrder } from './commerce/fulfillment.js';
import { getProvider } from './providers/index.js';
import { audit } from './lib/audit.js';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return route(request, env, ctx);
  },

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
  const now = new Date().toISOString();

  const expired = await env.COMMERCE_DB.prepare(`
    SELECT id FROM shipping_quotes
    WHERE status IN ('open','reserved') AND expires_at < ?
    LIMIT 200
  `).bind(now).all<{ id: string }>();
  for (const row of expired.results || []) await env.FULFILLMENT_QUEUE.send({ type: 'CLEANUP_QUOTE', quoteId: row.id });

  // Recover paid orders whose initial fulfillment message was lost or exhausted before any provider submission began.
  const needsSubmission = await env.COMMERCE_DB.prepare(`
    SELECT id FROM orders
    WHERE payment_status='paid'
      AND status NOT IN ('cancelled','expired')
      AND exception_code IS NULL
      AND fulfillment_status IN ('unfulfilled','queued')
    ORDER BY updated_at ASC
    LIMIT 100
  `).all<{ id: string }>();
  for (const row of needsSubmission.results || []) await env.FULFILLMENT_QUEUE.send({ type: 'FULFILL_ORDER', orderId: row.id });

  // Reconcile by provider-group state rather than master order state. This keeps healthy packages moving even when another group is in exception.
  const needsReconcile = await env.COMMERCE_DB.prepare(`
    SELECT DISTINCT order_id AS id
    FROM fulfillment_groups
    WHERE provider_order_id IS NOT NULL AND status NOT IN ('delivered','cancelled')
    ORDER BY updated_at ASC
    LIMIT 100
  `).all<{ id: string }>();
  for (const row of needsReconcile.results || []) await env.FULFILLMENT_QUEUE.send({ type: 'RECONCILE_ORDER', orderId: row.id });

  const stale = await env.COMMERCE_DB.prepare(`
    SELECT id,order_id,provider,submission_token
    FROM fulfillment_groups
    WHERE status='submitting'
      AND provider_order_id IS NULL
      AND COALESCE(submission_started_at,updated_at) < ?
    LIMIT 100
  `).bind(new Date(Date.now() - 30 * 60_000).toISOString()).all<{ id: string; order_id: string; provider: string; submission_token: string | null }>();

  for (const group of stale.results || []) {
    if (group.provider === 'kunaki') {
      const result = await env.COMMERCE_DB.prepare(`
        UPDATE fulfillment_groups
        SET status='exception',last_error=?,submission_token=NULL,submission_started_at=NULL,updated_at=?
        WHERE id=? AND status='submitting' AND provider_order_id IS NULL
      `).bind('Submission was interrupted before a Kunaki OrderId was persisted. Manual provider review is required before any resubmission.', now, group.id).run();
      if (Number(result.meta?.changes || 0) === 1) {
        await audit(env, { actorType: 'system', action: 'fulfillment.ambiguous_submission', entityType: 'fulfillment_group', entityId: group.id, metadata: { provider: 'kunaki' } });
      }
    } else if (group.provider === 'spreadconnect') {
      const result = await env.COMMERCE_DB.prepare(`
        UPDATE fulfillment_groups
        SET status='exception',last_error=?,submission_token=NULL,submission_started_at=NULL,updated_at=?
        WHERE id=? AND status='submitting' AND provider_order_id IS NULL
      `).bind('Spreadconnect submission lease expired. Safe retry queued against the existing draft order.', now, group.id).run();
      if (Number(result.meta?.changes || 0) === 1) await env.FULFILLMENT_QUEUE.send({ type: 'FULFILL_ORDER', orderId: group.order_id });
    }
  }

  await env.COMMERCE_DB.prepare(`DELETE FROM webhook_events WHERE processed_at IS NOT NULL AND received_at < ?`)
    .bind(new Date(Date.now() - 180 * 24 * 60 * 60_000).toISOString()).run();
}

async function cleanupQuote(env: Env, quoteId: string): Promise<void> {
  const quote = await env.COMMERCE_DB.prepare(`
    SELECT provider_quotes_json,order_id,status FROM shipping_quotes WHERE id=?
  `).bind(quoteId).first<{ provider_quotes_json: string; order_id: string | null; status: string }>();
  if (!quote) return;

  if (quote.order_id) {
    const order = await env.COMMERCE_DB.prepare(`SELECT payment_status,status FROM orders WHERE id=?`)
      .bind(quote.order_id).first<{ payment_status: string; status: string }>();
    if (order?.payment_status === 'paid' && order.status !== 'cancelled') return;
    if (order && order.payment_status !== 'paid') {
      await env.COMMERCE_DB.prepare(`UPDATE orders SET status='expired',updated_at=? WHERE id=? AND payment_status<>'paid'`)
        .bind(new Date().toISOString(), quote.order_id).run();
    }
  }

  const providers = JSON.parse(quote.provider_quotes_json) as Array<{ provider: 'kunaki' | 'spreadconnect'; draftOrderId?: string }>;
  for (const provider of providers) {
    if (provider.draftOrderId) await getProvider(provider.provider).cleanupDraft?.(env, provider.draftOrderId);
  }
  await env.COMMERCE_DB.prepare(`UPDATE shipping_quotes SET status='expired' WHERE id=? AND status IN ('open','reserved')`).bind(quoteId).run();
}
