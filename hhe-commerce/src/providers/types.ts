import type { Address, CatalogItem, Contact, Env, ProviderName, ProviderQuote, ProviderShippingOption } from '../types.js';

export interface FulfillmentInput {
  orderId: string;
  orderNumber: string;
  items: CatalogItem[];
  address: Address;
  contact: Contact;
  shippingSelection: { optionId: string; name: string; price: number; metadata?: Record<string, unknown> };
  draftOrderId?: string;
}

export interface FulfillmentResult { providerOrderId: string; status: string; raw?: unknown; }
export interface ShipmentResult { id: string; carrier?: string; trackingNumber?: string; trackingUrl?: string; status?: string; raw?: unknown; }

export interface FulfillmentProvider {
  name: ProviderName;
  quoteShipping(env: Env, args: { quoteId: string; items: CatalogItem[]; address: Address; contact: Contact }): Promise<ProviderQuote>;
  fulfill(env: Env, input: FulfillmentInput): Promise<FulfillmentResult>;
  getStatus(env: Env, providerOrderId: string): Promise<{ status: string; raw?: unknown }>;
  getShipments(env: Env, providerOrderId: string): Promise<ShipmentResult[]>;
  cleanupDraft?(env: Env, providerOrderId: string): Promise<void>;
}

export function inferTier(option: Pick<ProviderShippingOption, 'name' | 'maxDays'>): 'economy' | 'standard' | 'express' {
  const n = option.name.toLowerCase();
  if (/next day|overnight|express|2nd day|2-day|2 day/.test(n) || (option.maxDays !== undefined && option.maxDays <= 2)) return 'express';
  if (/priority|premium|tracked|ground/.test(n) || (option.maxDays !== undefined && option.maxDays <= 5)) return 'standard';
  return 'economy';
}
