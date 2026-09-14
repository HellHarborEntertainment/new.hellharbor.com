import type { Address, CatalogItem, Env, HheShippingOption, ProviderQuote } from '../types.js';
import { getProvider } from '../providers/index.js';
import { getOrder, orderItems } from '../repositories/orders.js';
import { groupByProvider } from './shipping.js';
import { randomId } from '../lib/crypto.js';

interface QuoteRow { provider_quotes_json: string; options_json: string; contact_json: string; }

function normalizeProviderStatus(value: string): string {
  const s = value.toLowerCase();
  if (/sent|shipped/.test(s)) return 'shipped';
  if (/production|processed|processing|confirmed|checked/.test(s)) return 'processing';
  if (/cancel/.test(s)) return 'cancelled';
  if (/issue|error|failed/.test(s)) return 'exception';
  return 'submitted';
}

export async function fulfillOrder(env: Env, orderId: string): Promise<void> {
  const order = await getOrder(env, orderId);
  if (order.payment_status !== 'paid') return;
  const items = await orderItems(env, order.id);
  const quote = await env.COMMERCE_DB.prepare('SELECT provider_quotes_json, options_json, contact_json FROM shipping_quotes WHERE id = ?').bind(order.shipping_quote_id).first<QuoteRow>();
  if (!quote) throw new Error(`Shipping quote missing for ${order.id}`);
  const providerQuotes = JSON.parse(quote.provider_quotes_json) as ProviderQuote[];
  const options = JSON.parse(quote.options_json) as HheShippingOption[];
  const selected = options.find(o => o.id === order.shipping_option_id);
  if (!selected) throw new Error(`Selected shipping option missing for ${order.id}`);
  const address = JSON.parse(order.address_json) as Address;
  const contact = JSON.parse(quote.contact_json) as { email: string; phone: string };
  const groups = groupByProvider(items);
  for (const [providerName, groupItems] of groups) {
    const existing = await env.COMMERCE_DB.prepare('SELECT * FROM fulfillment_groups WHERE order_id = ? AND provider = ?').bind(order.id, providerName).first<Record<string, unknown>>();
    if (existing?.provider_order_id) continue;
    if (providerName === 'kunaki' && existing?.status === 'exception') continue;
    const groupId = existing?.id ? String(existing.id) : randomId('fg');
    if (!existing) {
      await env.COMMERCE_DB.prepare(`INSERT INTO fulfillment_groups (id, order_id, provider, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)`)
        .bind(groupId, order.id, providerName, new Date().toISOString(), new Date().toISOString()).run();
      const linkStatements = groupItems.map(i => env.COMMERCE_DB.prepare('INSERT OR IGNORE INTO fulfillment_group_items (fulfillment_group_id, order_item_id) SELECT ?, id FROM order_items WHERE order_id = ? AND sku = ?').bind(groupId, order.id, i.sku));
      if (linkStatements.length) await env.COMMERCE_DB.batch(linkStatements);
    }
    const pq = providerQuotes.find(q => q.provider === providerName);
    const shippingSelection = selected.providerSelections[providerName];
    if (!shippingSelection) throw new Error(`Provider shipping selection missing for ${providerName}`);
    await env.COMMERCE_DB.prepare(`UPDATE fulfillment_groups SET status = 'submitting', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), groupId).run();
    try {
      const result = await getProvider(providerName as CatalogItem['provider']).fulfill(env, { orderId: order.id, orderNumber: order.order_number, items: groupItems, address, contact, shippingSelection, draftOrderId: pq?.draftOrderId });
      await env.COMMERCE_DB.prepare(`UPDATE fulfillment_groups SET provider_order_id = ?, status = ?, shipping_method = ?, shipping_cost = ?, submitted_at = ?, updated_at = ? WHERE id = ?`)
        .bind(result.providerOrderId, normalizeProviderStatus(result.status), shippingSelection.name, shippingSelection.price, new Date().toISOString(), new Date().toISOString(), groupId).run();
    } catch (error) {
      const note = providerName === 'kunaki'
        ? `Kunaki submission outcome requires manual review before retry: ${String(error)}`
        : String(error);
      await env.COMMERCE_DB.prepare(`UPDATE fulfillment_groups SET status = 'exception', last_error = ?, updated_at = ? WHERE id = ?`).bind(note, new Date().toISOString(), groupId).run();
      if (providerName !== 'kunaki') throw error;
    }
  }
  await recomputeOrderFulfillmentStatus(env, order.id);
}

export async function reconcileOrder(env: Env, orderId: string): Promise<void> {
  const groups = await env.COMMERCE_DB.prepare(`SELECT * FROM fulfillment_groups WHERE order_id = ? AND provider_order_id IS NOT NULL AND status NOT IN ('delivered','cancelled')`).bind(orderId).all<Record<string, unknown>>();
  for (const g of groups.results || []) {
    const provider = getProvider(String(g.provider) as CatalogItem['provider']);
    const providerOrderId = String(g.provider_order_id);
    const status = await provider.getStatus(env, providerOrderId);
    const normalized = normalizeProviderStatus(status.status);
    await env.COMMERCE_DB.prepare('UPDATE fulfillment_groups SET status = ?, updated_at = ? WHERE id = ?').bind(normalized, new Date().toISOString(), String(g.id)).run();
    const shipments = await provider.getShipments(env, providerOrderId);
    for (const shipment of shipments) {
      await env.COMMERCE_DB.prepare(`
        INSERT INTO shipments (id, order_id, fulfillment_group_id, provider, carrier, tracking_number, tracking_url, status, shipped_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET carrier=excluded.carrier, tracking_number=excluded.tracking_number, tracking_url=excluded.tracking_url, status=excluded.status, updated_at=excluded.updated_at
      `).bind(`${g.provider}:${shipment.id}`, orderId, String(g.id), String(g.provider), shipment.carrier || null, shipment.trackingNumber || null, shipment.trackingUrl || null, shipment.status || 'shipped', new Date().toISOString(), new Date().toISOString(), new Date().toISOString()).run();
    }
  }
  await recomputeOrderFulfillmentStatus(env, orderId);
}

export async function recomputeOrderFulfillmentStatus(env: Env, orderId: string): Promise<void> {
  const rows = await env.COMMERCE_DB.prepare('SELECT status FROM fulfillment_groups WHERE order_id = ?').bind(orderId).all<{ status: string }>();
  const statuses = (rows.results || []).map(r => r.status);
  let status = 'unfulfilled';
  if (!statuses.length) status = 'unfulfilled';
  else if (statuses.some(s => s === 'exception')) status = 'exception';
  else if (statuses.every(s => s === 'cancelled')) status = 'cancelled';
  else if (statuses.every(s => s === 'delivered')) status = 'delivered';
  else if (statuses.some(s => s === 'delivered')) status = 'partially_delivered';
  else if (statuses.every(s => s === 'shipped')) status = 'shipped';
  else if (statuses.some(s => s === 'shipped')) status = 'partially_shipped';
  else if (statuses.some(s => s === 'processing')) status = 'processing';
  else if (statuses.some(s => s === 'submitted' || s === 'submitting')) status = 'submitted';
  else if (statuses.some(s => s === 'queued')) status = 'queued';
  await env.COMMERCE_DB.prepare('UPDATE orders SET fulfillment_status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), orderId).run();
}
