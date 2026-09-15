import type { Env, ProviderName } from '../types.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { getAdminOrder, listAdminOrders } from '../repositories/orders.js';
import { getProvider } from '../providers/index.js';
import { recomputeOrderFulfillmentStatus } from '../commerce/fulfillment.js';
import { audit } from '../lib/audit.js';
import { getProviderHealth } from '../lib/provider-health.js';
import { listSettings, setSetting } from '../repositories/settings.js';
import { upsertProduct, upsertVariant, type ProductUpsert, type VariantUpsert } from '../repositories/catalog.js';
import { randomId } from '../lib/crypto.js';

const SETTING_KEYS = new Set(['free_shipping_threshold_cents', 'shipping_subsidy_cents', 'shipping_markup_bps', 'min_shipping_charge_cents']);
export { listAdminOrders, getAdminOrder };

export async function adminSummary(env: Env) {
  const counts = await env.COMMERCE_DB.prepare(`SELECT payment_status,fulfillment_status,COUNT(*) count FROM orders GROUP BY payment_status,fulfillment_status`).all();
  const exceptions = await env.COMMERCE_DB.prepare(`SELECT COUNT(*) count FROM fulfillment_groups WHERE status='exception'`).first<{ count: number }>();
  const stale = await env.COMMERCE_DB.prepare(`SELECT COUNT(*) count FROM shipping_quotes WHERE status IN ('open','reserved') AND expires_at<?`).bind(new Date().toISOString()).first<{ count: number }>();
  const leases = await env.COMMERCE_DB.prepare(`SELECT COUNT(*) count FROM fulfillment_groups WHERE status='submitting' AND provider_order_id IS NULL`).first<{ count: number }>();
  return {
    orders: counts.results || [],
    fulfillmentExceptions: Number(exceptions?.count || 0),
    activeSubmissionLeases: Number(leases?.count || 0),
    expiredQuotesPendingCleanup: Number(stale?.count || 0),
    providerHealth: await getProviderHealth(env),
    modes: { kunaki: env.KUNAKI_MODE, spreadconnect: env.SPREADCONNECT_BASE_URL.includes('staging') ? 'staging' : 'production' }
  };
}

export async function retryFulfillment(env: Env, groupId: string, duplicateRiskToken?: string) {
  const group = await env.COMMERCE_DB.prepare(`SELECT * FROM fulfillment_groups WHERE id=?`).bind(groupId).first<Record<string, unknown>>();
  if (!group) throw notFound('Fulfillment group not found');
  const provider = String(group.provider) as ProviderName;
  const orderId = String(group.order_id);
  if (group.provider_order_id) {
    await env.FULFILLMENT_QUEUE.send({ type: 'RECONCILE_ORDER', orderId });
    await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'fulfillment.reconcile_queued', entityType: 'fulfillment_group', entityId: groupId });
    return { queued: 'reconcile' };
  }
  if (provider === 'kunaki' && String(group.status) === 'exception' && duplicateRiskToken !== 'I_UNDERSTAND_DUPLICATE_RISK') {
    throw conflict('Kunaki resubmission could create a duplicate manufacturing order. Supply the explicit duplicate-risk acknowledgement token.');
  }
  await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_groups
    SET status='queued',last_error=NULL,submission_token=NULL,submission_started_at=NULL,updated_at=?
    WHERE id=?
  `).bind(new Date().toISOString(), groupId).run();
  await env.FULFILLMENT_QUEUE.send({ type: 'FULFILL_ORDER', orderId });
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'fulfillment.retry_queued', entityType: 'fulfillment_group', entityId: groupId, metadata: { provider, duplicateRiskAcknowledged: provider === 'kunaki' } });
  return { queued: 'fulfill' };
}

export async function attachProviderOrder(env: Env, groupId: string, providerOrderId: string) {
  if (!providerOrderId.trim()) throw badRequest('providerOrderId is required');
  const group = await env.COMMERCE_DB.prepare(`SELECT order_id,provider FROM fulfillment_groups WHERE id=?`).bind(groupId).first<{ order_id: string; provider: string }>();
  if (!group) throw notFound('Fulfillment group not found');
  const now = new Date().toISOString();
  await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_groups
    SET provider_order_id=?,status='submitted',last_error=NULL,submitted_at=COALESCE(submitted_at,?),
        submission_token=NULL,submission_started_at=NULL,updated_at=?
    WHERE id=?
  `).bind(providerOrderId.trim(), now, now, groupId).run();
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'fulfillment.provider_order_attached', entityType: 'fulfillment_group', entityId: groupId, metadata: { provider: group.provider, providerOrderId } });
  await env.FULFILLMENT_QUEUE.send({ type: 'RECONCILE_ORDER', orderId: group.order_id });
  return { attached: true };
}

export async function cancelFulfillment(env: Env, groupId: string) {
  const group = await env.COMMERCE_DB.prepare(`SELECT * FROM fulfillment_groups WHERE id=?`).bind(groupId).first<Record<string, unknown>>();
  if (!group) throw notFound('Fulfillment group not found');
  const provider = String(group.provider) as ProviderName;
  const providerOrderId = group.provider_order_id ? String(group.provider_order_id) : null;
  let result: unknown;
  if (providerOrderId) {
    const implementation = getProvider(provider);
    if (!implementation.cancel) throw conflict(`${provider} does not support API cancellation; manual provider handling is required`);
    result = await implementation.cancel(env, providerOrderId);
  }
  await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_groups
    SET status='cancelled',last_error=NULL,submission_token=NULL,submission_started_at=NULL,updated_at=?
    WHERE id=?
  `).bind(new Date().toISOString(), groupId).run();
  await audit(env, {
    actorType: 'admin', actorId: 'admin-api',
    action: providerOrderId ? 'fulfillment.cancelled' : 'fulfillment.cancelled_unsubmitted',
    entityType: 'fulfillment_group', entityId: groupId,
    metadata: providerOrderId ? { provider, providerOrderId, result } : { provider }
  });
  await recomputeOrderFulfillmentStatus(env, String(group.order_id));
  return { cancelled: true };
}

export async function addManualShipment(env: Env, groupId: string, input: { carrier?: string; trackingNumber?: string; trackingUrl?: string; status?: string }) {
  const group = await env.COMMERCE_DB.prepare(`SELECT order_id,provider FROM fulfillment_groups WHERE id=?`).bind(groupId).first<{ order_id: string; provider: string }>();
  if (!group) throw notFound('Fulfillment group not found');
  const id = randomId('manual_ship');
  const status = input.status || 'shipped';
  const now = new Date().toISOString();
  if (status !== 'shipped' && status !== 'delivered') throw badRequest('Manual shipment status must be shipped or delivered');
  await env.COMMERCE_DB.prepare(`
    INSERT INTO shipments (id,order_id,fulfillment_group_id,provider,carrier,tracking_number,tracking_url,status,shipped_at,delivered_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(id, group.order_id, groupId, group.provider, input.carrier || null, input.trackingNumber || null, input.trackingUrl || null, status, now, status === 'delivered' ? now : null, now, now).run();
  await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_groups
    SET status=?,shipped_at=COALESCE(shipped_at,?),delivered_at=CASE WHEN ?='delivered' THEN COALESCE(delivered_at,?) ELSE delivered_at END,updated_at=?
    WHERE id=?
  `).bind(status === 'delivered' ? 'delivered' : 'shipped', now, status, now, now, groupId).run();
  await recomputeOrderFulfillmentStatus(env, group.order_id);
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'shipment.manual_added', entityType: 'fulfillment_group', entityId: groupId, metadata: input });
  return { id };
}

export async function updateSettings(env: Env, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    if (!SETTING_KEYS.has(key)) throw badRequest(`Unsupported setting: ${key}`);
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw badRequest(`Setting ${key} must be a non-negative number`);
    if (key === 'shipping_markup_bps' && number > 10000) throw badRequest('shipping_markup_bps cannot exceed 10000 (100%)');
    if (key !== 'shipping_markup_bps' && number > 10000000) throw badRequest(`Setting ${key} is unreasonably large`);
    await setSetting(env, key, Math.round(number));
  }
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'settings.updated', entityType: 'commerce_settings', metadata: values });
  return listSettings(env);
}

export { listSettings };

export async function saveProduct(env: Env, input: ProductUpsert) {
  const id = await upsertProduct(env, input);
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'catalog.product_upserted', entityType: 'product', entityId: id, metadata: { sku: input.sku } });
  return { id };
}

export async function saveVariant(env: Env, input: VariantUpsert) {
  const id = await upsertVariant(env, input);
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'catalog.variant_upserted', entityType: 'variant', entityId: id, metadata: { sku: input.sku, productId: input.productId } });
  return { id };
}

export async function listAudit(env: Env, args: { limit?: number; cursor?: string; action?: string }) {
  const limit = Math.min(200, Math.max(1, args.limit || 100));
  const clauses: string[] = [];
  const bind: unknown[] = [];
  if (args.cursor) { clauses.push('created_at<?'); bind.push(args.cursor); }
  if (args.action) { clauses.push('action=?'); bind.push(args.action); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await env.COMMERCE_DB.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ?`).bind(...bind, limit + 1).all<Record<string, unknown>>();
  const rows = result.results || [];
  const more = rows.length > limit;
  const entries = more ? rows.slice(0, limit) : rows;
  return { entries, nextCursor: more ? String(entries[entries.length - 1]?.created_at || '') : null };
}

export async function resolveAddressException(env: Env, orderId: string) {
  const order = await env.COMMERCE_DB.prepare(`SELECT payment_status,exception_code FROM orders WHERE id=?`).bind(orderId).first<{ payment_status: string; exception_code: string | null }>();
  if (!order) throw notFound('Order not found');
  if (order.payment_status !== 'paid' || !['shipping_address_mismatch', 'shipping_address_missing'].includes(order.exception_code || '')) throw conflict('Order does not have a resolvable shipping-address exception');
  await env.COMMERCE_DB.prepare(`UPDATE orders SET status='paid',fulfillment_status='unfulfilled',exception_code=NULL,exception_detail=NULL,updated_at=? WHERE id=?`).bind(new Date().toISOString(), orderId).run();
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'order.address_exception_resolved', entityType: 'order', entityId: orderId, metadata: { resolution: 'use_quoted_address' } });
  await env.FULFILLMENT_QUEUE.send({ type: 'FULFILL_ORDER', orderId });
  return { queued: true, resolution: 'use_quoted_address' };
}

export async function cancelOrder(env: Env, orderId: string) {
  const order = await env.COMMERCE_DB.prepare(`SELECT shipping_quote_id,payment_status FROM orders WHERE id=?`).bind(orderId).first<{ shipping_quote_id: string; payment_status: string }>();
  if (!order) throw notFound('Order not found');
  const groups = await env.COMMERCE_DB.prepare(`SELECT id FROM fulfillment_groups WHERE order_id=? AND status<>'cancelled'`).bind(orderId).all<{ id: string }>();
  const failures: Array<{ groupId: string; error: string }> = [];
  for (const group of groups.results || []) {
    try { await cancelFulfillment(env, group.id); }
    catch (error) { failures.push({ groupId: group.id, error: String(error) }); }
  }
  if (!(groups.results || []).length) {
    await env.COMMERCE_DB.prepare(`UPDATE orders SET status='cancelled',fulfillment_status='cancelled',updated_at=? WHERE id=?`).bind(new Date().toISOString(), orderId).run();
    await env.FULFILLMENT_QUEUE.send({ type: 'CLEANUP_QUOTE', quoteId: order.shipping_quote_id });
  }
  if (failures.length) throw conflict('One or more fulfillment groups could not be cancelled', { failures });
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: 'order.cancelled', entityType: 'order', entityId: orderId, metadata: { refundRequired: order.payment_status === 'paid' } });
  return { cancelled: true, refundRequired: order.payment_status === 'paid' };
}

export async function setCatalogActive(env: Env, kind: 'product' | 'variant', id: string, active: boolean) {
  if (active) {
    if (kind === 'product') {
      const product = await env.COMMERCE_DB.prepare(`SELECT provider,provider_product_id FROM products WHERE id=?`).bind(id).first<{ provider: ProviderName; provider_product_id: string | null }>();
      if (!product) throw notFound('product not found');
      if (product.provider === 'kunaki' && !product.provider_product_id) throw badRequest('Cannot activate Kunaki product without providerProductId');
      if (!['kunaki', 'spreadconnect'].includes(product.provider)) throw badRequest(`Cannot activate unsupported provider: ${product.provider}`);
    } else {
      const variant = await env.COMMERCE_DB.prepare(`
        SELECT p.provider,v.provider_sku FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?
      `).bind(id).first<{ provider: ProviderName; provider_sku: string | null }>();
      if (!variant) throw notFound('variant not found');
      if (variant.provider === 'spreadconnect' && !variant.provider_sku) throw badRequest('Cannot activate Spreadconnect variant without providerSku');
      if (!['kunaki', 'spreadconnect'].includes(variant.provider)) throw badRequest(`Cannot activate unsupported provider: ${variant.provider}`);
    }
  }
  const table = kind === 'product' ? 'products' : 'product_variants';
  const result = await env.COMMERCE_DB.prepare(`UPDATE ${table} SET active=?,updated_at=? WHERE id=?`).bind(active ? 1 : 0, new Date().toISOString(), id).run();
  if (!result.meta?.changes) throw notFound(`${kind} not found`);
  await audit(env, { actorType: 'admin', actorId: 'admin-api', action: `catalog.${kind}_status_changed`, entityType: kind, entityId: id, metadata: { active } });
  return { id, active };
}
