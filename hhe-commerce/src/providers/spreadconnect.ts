import type { FulfillmentProvider, FulfillmentInput, FulfillmentResult, ShipmentResult } from './types.js';
import type { Address, CatalogItem, Contact, Env, ProviderQuote } from '../types.js';
import { inferTier } from './types.js';
import { upstream } from '../lib/errors.js';

interface SpodOrder { id: number | string; state?: string; shipping?: { price?: { amount?: number; currency?: string } }; }
interface SpodShipping { id: string; name?: string; company?: string; description?: string; price?: { amount?: number; currency?: string }; }

async function spod<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.SPREADCONNECT_BASE_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'X-SPOD-ACCESS-TOKEN': env.SPREADCONNECT_ACCESS_TOKEN, ...(init.headers || {}) }
  });
  const text = await res.text();
  let body: unknown = undefined;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (!res.ok) throw upstream(`Spreadconnect HTTP ${res.status}`, body);
  return body as T;
}

function spodAddress(a: Address) {
  return { firstName: a.firstName, lastName: a.lastName, company: a.company || undefined, street: a.address1, streetAnnex: a.address2 || undefined, city: a.city, state: a.state || undefined, country: a.country.toUpperCase(), zipCode: a.postalCode };
}

function createPayload(args: { reference: string; items: CatalogItem[]; address: Address; contact: Contact; state?: 'NEW' | 'CONFIRMED' }) {
  return {
    externalOrderReference: args.reference,
    externalOrderName: args.reference,
    state: args.state || 'NEW',
    email: args.contact.email,
    phone: args.contact.phone,
    orderItems: args.items.map(i => {
      if (!i.providerSku) throw upstream(`Spreadconnect SKU missing for ${i.sku}`);
      return { sku: i.providerSku, quantity: i.quantity, externalOrderItemReference: i.sku, customerPrice: { amount: (i.unitPrice * i.quantity) / 100, currency: i.currency.toUpperCase() } };
    }),
    shipping: { address: spodAddress(args.address), customerPrice: { amount: 0, currency: args.items[0]?.currency.toUpperCase() || 'USD' } }
  };
}

export const spreadconnectProvider: FulfillmentProvider = {
  name: 'spreadconnect',
  async quoteShipping(env: Env, args: { quoteId: string; items: CatalogItem[]; address: Address; contact: Contact }): Promise<ProviderQuote> {
    const draft = await spod<SpodOrder>(env, '/orders', { method: 'POST', body: JSON.stringify(createPayload({ reference: `HHE-QUOTE-${args.quoteId}`, items: args.items, address: args.address, contact: args.contact })) });
    if (!draft?.id) throw upstream('Spreadconnect did not return a draft order id');
    const shipping = await spod<SpodShipping[]>(env, `/orders/${encodeURIComponent(String(draft.id))}/shippingTypes`);
    const options = (shipping || []).map(s => {
      const name = [s.company, s.name].filter(Boolean).join(' ') || `Spreadconnect ${s.id}`;
      const amount = Number(s.price?.amount || 0);
      const option = { provider: 'spreadconnect' as const, id: String(s.id), name, price: Math.round(amount * 100), currency: (s.price?.currency || env.CURRENCY).toLowerCase(), metadata: { company: s.company, description: s.description } };
      return { ...option, tierHint: inferTier(option) };
    });
    if (!options.length) {
      await this.cleanupDraft?.(env, String(draft.id));
      throw upstream('Spreadconnect returned no shipping options');
    }
    return { provider: 'spreadconnect', draftOrderId: String(draft.id), options };
  },

  async fulfill(env: Env, input: FulfillmentInput): Promise<FulfillmentResult> {
    let providerOrderId = input.draftOrderId;
    if (!providerOrderId) {
      const created = await spod<SpodOrder>(env, '/orders', { method: 'POST', body: JSON.stringify(createPayload({ reference: input.orderNumber, items: input.items, address: input.address, contact: input.contact })) });
      providerOrderId = String(created.id);
    } else {
      await spod(env, `/orders/${encodeURIComponent(providerOrderId)}`, { method: 'PUT', body: JSON.stringify(createPayload({ reference: input.orderNumber, items: input.items, address: input.address, contact: input.contact })) });
    }
    await spod(env, `/orders/${encodeURIComponent(providerOrderId)}/shippingType`, { method: 'POST', body: JSON.stringify({ id: input.shippingSelection.optionId }) });
    const confirmed = await spod<SpodOrder>(env, `/orders/${encodeURIComponent(providerOrderId)}/confirm`, { method: 'POST' });
    return { providerOrderId, status: (confirmed?.state || 'confirmed').toLowerCase(), raw: confirmed };
  },

  async getStatus(env: Env, providerOrderId: string) {
    const order = await spod<SpodOrder>(env, `/orders/${encodeURIComponent(providerOrderId)}`);
    return { status: (order.state || 'unknown').toLowerCase(), raw: order };
  },

  async getShipments(env: Env, providerOrderId: string): Promise<ShipmentResult[]> {
    const rows = await spod<Array<Record<string, unknown>>>(env, `/orders/${encodeURIComponent(providerOrderId)}/shipments`);
    const result: ShipmentResult[] = [];
    for (const row of rows || []) {
      const tracking = Array.isArray(row.tracking) ? row.tracking as Array<Record<string, unknown>> : [];
      if (!tracking.length) result.push({ id: String(row.id || crypto.randomUUID()), status: 'shipped', raw: row });
      for (const t of tracking) result.push({ id: `${String(row.id || '')}:${String(t.code || '')}`, trackingNumber: t.code ? String(t.code) : undefined, trackingUrl: t.url ? String(t.url) : undefined, status: 'shipped', raw: row });
    }
    return result;
  },

  async cleanupDraft(env: Env, providerOrderId: string): Promise<void> {
    try { await spod(env, `/orders/${encodeURIComponent(providerOrderId)}/cancel`, { method: 'POST' }); } catch (error) { console.warn('Spreadconnect draft cleanup failed', providerOrderId, error); }
  }
};
