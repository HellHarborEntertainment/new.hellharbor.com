import type { Address, CatalogItem, Env, HheShippingOption, ProviderName, ProviderQuote } from '../types.js';
import { getProvider } from '../providers/index.js';
import { getOrder, orderItems } from '../repositories/orders.js';
import { groupByProvider } from './shipping.js';
import { randomId } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { providerFailure, providerSuccess } from '../lib/provider-health.js';

interface QuoteRow { provider_quotes_json: string; options_json: string; contact_json: string; }
interface GroupRow {
  id: string;
  order_id: string;
  provider: ProviderName;
  status: string;
  provider_order_id: string | null;
  submission_token: string | null;
  submission_started_at: string | null;
}

export function normalizeProviderStatus(value: string): string {
  const s = value.trim().toLowerCase();
  if (['delivered', 'complete', 'completed'].includes(s)) return 'delivered';
  if (['sent', 'shipped', 'dispatched'].includes(s)) return 'shipped';
  if (['production', 'in_production', 'processed', 'processing', 'confirmed', 'checked'].includes(s)) return 'processing';
  if (s.includes('cancel')) return 'cancelled';
  if (/(issue|error|failed|reject)/.test(s)) return 'exception';
  return 'submitted';
}

async function startAttempt(env: Env, orderId: string, groupId: string, provider: ProviderName, operation: string) {
  const id = randomId('attempt');
  const now = new Date().toISOString();
  await env.COMMERCE_DB.prepare(`
    INSERT INTO fulfillment_attempts (id,order_id,fulfillment_group_id,provider,operation,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'started',?,?)
  `).bind(id, orderId, groupId, provider, operation, now, now).run();
  return id;
}

async function finishAttempt(env: Env, id: string, status: 'succeeded' | 'failed', providerOrderId?: string, error?: unknown) {
  await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_attempts SET status=?,provider_order_id=?,error=?,updated_at=? WHERE id=?
  `).bind(status, providerOrderId || null, error ? String(error).slice(0, 2000) : null, new Date().toISOString(), id).run();
}

async function ensureGroup(env: Env, orderId: string, provider: ProviderName, items: CatalogItem[]): Promise<GroupRow> {
  let row = await env.COMMERCE_DB.prepare(`
    SELECT id,order_id,provider,status,provider_order_id,submission_token,submission_started_at
    FROM fulfillment_groups WHERE order_id=? AND provider=?
  `).bind(orderId, provider).first<GroupRow>();

  if (!row) {
    const candidateId = randomId('fg');
    const now = new Date().toISOString();
    await env.COMMERCE_DB.prepare(`
      INSERT OR IGNORE INTO fulfillment_groups (id,order_id,provider,status,created_at,updated_at)
      VALUES (?,?,?,'queued',?,?)
    `).bind(candidateId, orderId, provider, now, now).run();
    row = await env.COMMERCE_DB.prepare(`
      SELECT id,order_id,provider,status,provider_order_id,submission_token,submission_started_at
      FROM fulfillment_groups WHERE order_id=? AND provider=?
    `).bind(orderId, provider).first<GroupRow>();
  }

  if (!row) throw new Error(`Unable to create fulfillment group for ${provider}`);
  const links = items.map(item => env.COMMERCE_DB.prepare(`
    INSERT OR IGNORE INTO fulfillment_group_items (fulfillment_group_id,order_item_id)
    SELECT ?,id FROM order_items WHERE order_id=? AND sku=?
  `).bind(row!.id, orderId, item.sku));
  if (links.length) await env.COMMERCE_DB.batch(links);
  return row;
}

async function claimSubmission(env: Env, group: GroupRow): Promise<string | null> {
  if (group.provider_order_id || group.status === 'cancelled') return null;
  const token = randomId('submit');
  const now = new Date().toISOString();
  const result = await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_groups
    SET status='submitting',submission_token=?,submission_started_at=?,updated_at=?
    WHERE id=? AND provider_order_id IS NULL AND submission_token IS NULL
      AND (
        status='queued'
        OR (provider='spreadconnect' AND status='exception')
      )
  `).bind(token, now, now, group.id).run();
  return Number(result.meta?.changes || 0) === 1 ? token : null;
}

function isConfirmedSpreadconnectState(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ['confirmed', 'production', 'in_production', 'processed', 'processing', 'sent', 'shipped', 'dispatched', 'delivered', 'complete', 'completed'].includes(normalized);
}

async function persistSubmission(env: Env, groupId: string, leaseToken: string, providerOrderId: string, status: string, shippingMethod: string, shippingCost: number) {
  const now = new Date().toISOString();
  const result = await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_groups
    SET provider_order_id=?,status=?,shipping_method=?,shipping_cost=?,last_error=NULL,
        submitted_at=COALESCE(submitted_at,?),submission_token=NULL,submission_started_at=NULL,updated_at=?
    WHERE id=? AND submission_token=?
  `).bind(providerOrderId, status, shippingMethod, shippingCost, now, now, groupId, leaseToken).run();
  if (Number(result.meta?.changes || 0) !== 1) throw new Error(`Submission lease was lost before provider order ${providerOrderId} could be persisted`);
}

async function failSubmission(env: Env, groupId: string, leaseToken: string, provider: ProviderName, error: unknown) {
  const note = provider === 'kunaki'
    ? `Kunaki submission outcome requires manual review before retry: ${String(error)}`
    : String(error);
  await env.COMMERCE_DB.prepare(`
    UPDATE fulfillment_groups
    SET status='exception',last_error=?,submission_token=NULL,submission_started_at=NULL,updated_at=?
    WHERE id=? AND submission_token=?
  `).bind(note.slice(0, 4000), new Date().toISOString(), groupId, leaseToken).run();
}

export async function fulfillOrder(env: Env, orderId: string): Promise<void> {
  const order = await getOrder(env, orderId);
  if (order.payment_status !== 'paid' || order.status === 'cancelled' || order.status === 'expired') return;
  if (order.exception_code) return;

  const items = await orderItems(env, order.id);
  const quote = await env.COMMERCE_DB.prepare(`
    SELECT provider_quotes_json,options_json,contact_json FROM shipping_quotes WHERE id=?
  `).bind(order.shipping_quote_id).first<QuoteRow>();
  if (!quote) throw new Error(`Shipping quote missing for ${order.id}`);

  const providerQuotes = JSON.parse(quote.provider_quotes_json) as ProviderQuote[];
  const options = JSON.parse(quote.options_json) as HheShippingOption[];
  const selected = options.find(option => option.id === order.shipping_option_id);
  if (!selected) throw new Error(`Selected shipping option missing for ${order.id}`);
  const address = JSON.parse(order.address_json) as Address;
  const contact = JSON.parse(quote.contact_json) as { email: string; phone: string };
  const groups = groupByProvider(items);

  for (const [providerNameRaw, groupItems] of groups) {
    const providerName = providerNameRaw as ProviderName;
    let group = await ensureGroup(env, order.id, providerName, groupItems);
    if (group.status === 'cancelled' || group.provider_order_id) continue;
    if (providerName === 'kunaki' && group.status === 'exception') continue;

    const leaseToken = await claimSubmission(env, group);
    if (!leaseToken) continue;
    group = { ...group, status: 'submitting', submission_token: leaseToken };

    const providerQuote = providerQuotes.find(q => q.provider === providerName);
    const shippingSelection = selected.providerSelections[providerName];
    if (!shippingSelection) {
      await failSubmission(env, group.id, leaseToken, providerName, new Error(`Provider shipping selection missing for ${providerName}`));
      throw new Error(`Provider shipping selection missing for ${providerName}`);
    }

    const attemptId = await startAttempt(env, order.id, group.id, providerName, 'submit');
    const provider = getProvider(providerName);
    try {
      const result = await provider.fulfill(env, {
        orderId: order.id,
        orderNumber: order.order_number,
        items: groupItems,
        address,
        contact,
        shippingSelection,
        draftOrderId: providerQuote?.draftOrderId
      });
      await persistSubmission(env, group.id, leaseToken, result.providerOrderId, normalizeProviderStatus(result.status), shippingSelection.name, shippingSelection.price);
      await finishAttempt(env, attemptId, 'succeeded', result.providerOrderId);
      await providerSuccess(env, providerName, 'fulfill');
      await audit(env, { actorType: 'system', action: 'fulfillment.submitted', entityType: 'fulfillment_group', entityId: group.id, metadata: { provider: providerName, providerOrderId: result.providerOrderId } });
    } catch (error) {
      let recovered = false;
      if (providerName === 'spreadconnect' && providerQuote?.draftOrderId) {
        try {
          const status = await provider.getStatus(env, providerQuote.draftOrderId);
          if (isConfirmedSpreadconnectState(status.status)) {
            await persistSubmission(env, group.id, leaseToken, providerQuote.draftOrderId, normalizeProviderStatus(status.status), shippingSelection.name, shippingSelection.price);
            await finishAttempt(env, attemptId, 'succeeded', providerQuote.draftOrderId);
            await providerSuccess(env, providerName, 'fulfill_recovered');
            await audit(env, { actorType: 'system', action: 'fulfillment.recovered_after_ambiguous_response', entityType: 'fulfillment_group', entityId: group.id, metadata: { provider: providerName, providerOrderId: providerQuote.draftOrderId } });
            recovered = true;
          }
        } catch (recoveryError) {
          console.warn('Spreadconnect ambiguous submission recovery failed', group.id, recoveryError);
        }
      }
      if (recovered) continue;

      await failSubmission(env, group.id, leaseToken, providerName, error);
      await finishAttempt(env, attemptId, 'failed', undefined, error);
      await providerFailure(env, providerName, 'fulfill', error);
      await audit(env, { actorType: 'system', action: 'fulfillment.failed', entityType: 'fulfillment_group', entityId: group.id, metadata: { provider: providerName, error: String(error) } });
      if (providerName !== 'kunaki') throw error;
    }
  }

  await env.COMMERCE_DB.prepare(`UPDATE shipping_quotes SET status='consumed' WHERE id=? AND status='reserved'`).bind(order.shipping_quote_id).run();
  await recomputeOrderFulfillmentStatus(env, order.id);
}

export async function reconcileOrder(env: Env, orderId: string): Promise<void> {
  const groups = await env.COMMERCE_DB.prepare(`
    SELECT * FROM fulfillment_groups
    WHERE order_id=? AND provider_order_id IS NOT NULL AND status NOT IN ('delivered','cancelled')
  `).bind(orderId).all<Record<string, unknown>>();
  const errors: unknown[] = [];

  for (const group of groups.results || []) {
    const providerName = String(group.provider) as ProviderName;
    const provider = getProvider(providerName);
    const providerOrderId = String(group.provider_order_id);
    const attemptId = await startAttempt(env, orderId, String(group.id), providerName, 'reconcile');
    try {
      const status = await provider.getStatus(env, providerOrderId);
      const normalized = normalizeProviderStatus(status.status);
      const now = new Date().toISOString();
      await env.COMMERCE_DB.prepare(`
        UPDATE fulfillment_groups
        SET status=?,last_error=NULL,
            shipped_at=CASE WHEN ?='shipped' AND shipped_at IS NULL THEN ? ELSE shipped_at END,
            delivered_at=CASE WHEN ?='delivered' AND delivered_at IS NULL THEN ? ELSE delivered_at END,
            updated_at=?
        WHERE id=?
      `).bind(normalized, normalized, now, normalized, now, now, String(group.id)).run();

      const shipments = await provider.getShipments(env, providerOrderId);
      for (const shipment of shipments) {
        const shipmentStatus = normalizeProviderStatus(shipment.status || 'shipped');
        await env.COMMERCE_DB.prepare(`
          INSERT INTO shipments (id,order_id,fulfillment_group_id,provider,carrier,tracking_number,tracking_url,status,shipped_at,delivered_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            carrier=excluded.carrier,tracking_number=excluded.tracking_number,tracking_url=excluded.tracking_url,
            status=excluded.status,delivered_at=COALESCE(shipments.delivered_at,excluded.delivered_at),updated_at=excluded.updated_at
        `).bind(`${group.provider}:${shipment.id}`, orderId, String(group.id), providerName, shipment.carrier || null, shipment.trackingNumber || null, shipment.trackingUrl || null, shipmentStatus, now, shipmentStatus === 'delivered' ? now : null, now, now).run();
      }
      await finishAttempt(env, attemptId, 'succeeded', providerOrderId);
      await providerSuccess(env, providerName, 'reconcile');
    } catch (error) {
      errors.push(error);
      await finishAttempt(env, attemptId, 'failed', providerOrderId, error);
      await providerFailure(env, providerName, 'reconcile', error);
      await env.COMMERCE_DB.prepare(`UPDATE fulfillment_groups SET last_error=?,updated_at=? WHERE id=?`).bind(String(error).slice(0, 4000), new Date().toISOString(), String(group.id)).run();
    }
  }

  await recomputeOrderFulfillmentStatus(env, orderId);
  if (errors.length) throw new AggregateError(errors, 'One or more provider reconciliations failed');
}

export function computeFulfillmentStatus(statuses: string[]): string {
  if (!statuses.length) return 'unfulfilled';
  if (statuses.some(status => status === 'exception')) return 'exception';
  if (statuses.every(status => status === 'cancelled')) return 'cancelled';
  const active = statuses.filter(status => status !== 'cancelled');
  if (active.length && active.every(status => status === 'delivered')) return 'delivered';
  if (active.some(status => status === 'delivered')) return 'partially_delivered';
  if (active.length && active.every(status => status === 'shipped')) return 'shipped';
  if (active.some(status => status === 'shipped')) return 'partially_shipped';
  if (active.some(status => status === 'processing')) return 'processing';
  if (active.some(status => status === 'submitted' || status === 'submitting')) return 'submitted';
  if (active.some(status => status === 'queued')) return 'queued';
  return 'unfulfilled';
}

export async function recomputeOrderFulfillmentStatus(env: Env, orderId: string): Promise<void> {
  const rows = await env.COMMERCE_DB.prepare(`SELECT status FROM fulfillment_groups WHERE order_id=?`).bind(orderId).all<{ status: string }>();
  const status = computeFulfillmentStatus((rows.results || []).map(row => row.status));
  let orderStatus: string | undefined;
  if (status === 'delivered') orderStatus = 'complete';
  else if (status === 'exception') orderStatus = 'exception';
  else if (status === 'cancelled') orderStatus = 'cancelled';
  await env.COMMERCE_DB.prepare(`UPDATE orders SET fulfillment_status=?,status=COALESCE(?,status),updated_at=? WHERE id=?`).bind(status, orderStatus || null, new Date().toISOString(), orderId).run();
}
