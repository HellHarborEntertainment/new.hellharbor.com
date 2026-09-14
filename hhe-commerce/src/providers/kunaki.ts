import type { FulfillmentProvider, FulfillmentInput, FulfillmentResult, ShipmentResult } from './types.js';
import type { Address, CatalogItem, Contact, Env, ProviderQuote } from '../types.js';
import { upstream } from '../lib/errors.js';
import { parseDays, xmlBlocks, xmlText } from '../lib/xml.js';
import { inferTier } from './types.js';

function kunakiCountry(country: string): string {
  const c = country.toUpperCase();
  return c === 'US' || c === 'USA' ? 'United States' : c === 'CA' ? 'Canada' : country;
}

function productParams(params: URLSearchParams, items: CatalogItem[]) {
  for (const item of items) {
    if (!item.providerProductId) throw upstream(`Kunaki provider product id missing for ${item.sku}`);
    params.append('ProductId', item.providerProductId);
    params.append('Quantity', String(item.quantity));
  }
}

async function request(env: Env, params: URLSearchParams): Promise<string> {
  const res = await fetch(`${env.KUNAKI_BASE_URL}?${params.toString()}`, { method: 'GET' });
  const text = await res.text();
  if (!res.ok) throw upstream(`Kunaki HTTP ${res.status}`, text.slice(0, 500));
  const errorCode = xmlText(text, 'ErrorCode');
  if (errorCode && errorCode !== '0') throw upstream(`Kunaki API error ${errorCode}: ${xmlText(text, 'ErrorText') || 'Unknown error'}`);
  return text;
}

export const kunakiProvider: FulfillmentProvider = {
  name: 'kunaki',
  async quoteShipping(env: Env, args: { quoteId: string; items: CatalogItem[]; address: Address; contact: Contact }): Promise<ProviderQuote> {
    const p = new URLSearchParams({
      RequestType: 'ShippingOptions', Country: kunakiCountry(args.address.country), State_Province: args.address.state || '',
      PostalCode: args.address.postalCode, ResponseType: 'XML'
    });
    productParams(p, args.items);
    const xml = await request(env, p);
    const options = xmlBlocks(xml, 'Option').map((block, i) => {
      const name = xmlText(block, 'Description') || `Kunaki shipping ${i + 1}`;
      const price = Math.round(Number(xmlText(block, 'Price') || '0') * 100);
      const days = parseDays(xmlText(block, 'DeliveryTime'));
      return { provider: 'kunaki' as const, id: name, name, price, currency: env.CURRENCY.toLowerCase(), ...days, tierHint: inferTier({ name, maxDays: days.maxDays }) };
    }).filter(o => Number.isFinite(o.price));
    if (!options.length) throw upstream('Kunaki returned no shipping options');
    return { provider: 'kunaki', options };
  },

  async fulfill(env: Env, input: FulfillmentInput): Promise<FulfillmentResult> {
    const a = input.address;
    const p = new URLSearchParams({
      RequestType: 'Order', UserId: env.KUNAKI_USER_ID, Password: env.KUNAKI_PASSWORD, Mode: env.KUNAKI_MODE,
      Name: `${a.firstName} ${a.lastName}`.trim(), Company: a.company || '', Address1: a.address1, Address2: a.address2 || '',
      City: a.city, State_Province: a.state || '', PostalCode: a.postalCode, Country: kunakiCountry(a.country),
      ShippingDescription: input.shippingSelection.name, ResponseType: 'XML'
    });
    productParams(p, input.items);
    const xml = await request(env, p);
    const orderId = xmlText(xml, 'OrderId');
    if (!orderId) throw upstream('Kunaki did not return an OrderId');
    return { providerOrderId: orderId, status: 'submitted', raw: { orderId } };
  },

  async getStatus(env: Env, providerOrderId: string) {
    const p = new URLSearchParams({ RequestType: 'OrderStatus', UserId: env.KUNAKI_USER_ID, Password: env.KUNAKI_PASSWORD, OrderId: providerOrderId, ResponseType: 'XML' });
    const xml = await request(env, p);
    return { status: (xmlText(xml, 'OrderStatus') || 'unknown').toLowerCase(), raw: { trackingType: xmlText(xml, 'TrackingType'), trackingId: xmlText(xml, 'TrackingId') } };
  },

  async getShipments(env: Env, providerOrderId: string): Promise<ShipmentResult[]> {
    const status = await this.getStatus(env, providerOrderId);
    const raw = status.raw as { trackingType?: string; trackingId?: string };
    if (!raw.trackingId || raw.trackingId === 'NA') return [];
    return [{ id: `${providerOrderId}:${raw.trackingId}`, carrier: raw.trackingType === 'NA' ? undefined : raw.trackingType, trackingNumber: raw.trackingId, status: status.status, raw }];
  }
};
