import type { Address, CatalogItem, Contact, Env, HheShippingOption, ProviderQuote, ProviderShippingOption, ShippingTier } from '../types.js';
import { getProvider } from '../providers/index.js';
import { badRequest, conflict, upstream } from '../lib/errors.js';
import { randomId, sha256Hex } from '../lib/crypto.js';
import { normalizeAddress } from '../lib/address.js';
import { getShippingPolicy } from '../repositories/settings.js';
import { applyShippingPolicy } from './policy.js';
import { providerFailure, providerSuccess } from '../lib/provider-health.js';

export function groupByProvider(items: CatalogItem[]): Map<string, CatalogItem[]> {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) groups.set(item.provider, [...(groups.get(item.provider) || []), item]);
  return groups;
}

function speed(option: ProviderShippingOption): number { return option.maxDays ?? option.minDays ?? 999; }
function cheapest(options: ProviderShippingOption[]): ProviderShippingOption { return [...options].sort((a, b) => a.price - b.price || speed(a) - speed(b))[0]; }
function fastest(options: ProviderShippingOption[]): ProviderShippingOption { return [...options].sort((a, b) => speed(a) - speed(b) || a.price - b.price)[0]; }

function select(options: ProviderShippingOption[], tier: ShippingTier): ProviderShippingOption {
  if (tier === 'economy') return cheapest(options);
  if (tier === 'express') return fastest(options);
  const standard = options.filter(option => option.tierHint === 'standard');
  if (standard.length) return cheapest(standard);
  const low = cheapest(options);
  const fast = fastest(options);
  if (low.id === fast.id) return low;
  const middle = options.filter(option => option.id !== low.id && option.id !== fast.id);
  return middle.length ? cheapest(middle) : (speed(fast) < speed(low) ? fast : low);
}

export function combineProviderQuotes(providerQuotes: ProviderQuote[], currency: string): HheShippingOption[] {
  const normalizedCurrency = currency.toLowerCase();
  for (const quote of providerQuotes) {
    if (!quote.options.length) throw upstream(`${quote.provider} returned no shipping options`);
    for (const option of quote.options) {
      if (!Number.isFinite(option.price) || option.price < 0) throw upstream(`${quote.provider} returned an invalid shipping price`);
      if (option.currency.toLowerCase() !== normalizedCurrency) throw upstream(`${quote.provider} returned shipping in an unexpected currency`, { expected: normalizedCurrency, received: option.currency });
    }
  }

  const tiers: ShippingTier[] = ['economy', 'standard', 'express'];
  const built = tiers.map(tier => {
    let actual = 0;
    let min = 0;
    let max = 0;
    const selections: HheShippingOption['providerSelections'] = {};
    for (const quote of providerQuotes) {
      const chosen = select(quote.options, tier);
      actual += chosen.price;
      min = Math.max(min, chosen.minDays || 0);
      max = Math.max(max, chosen.maxDays || chosen.minDays || 0);
      selections[quote.provider] = { optionId: chosen.id, name: chosen.name, price: chosen.price, metadata: chosen.metadata };
    }
    return {
      id: tier,
      name: `HHE ${tier[0].toUpperCase()}${tier.slice(1)}`,
      price: actual,
      actualProviderCost: actual,
      currency: normalizedCurrency,
      minDays: min || undefined,
      maxDays: max || undefined,
      providerSelections: selections
    } satisfies HheShippingOption;
  });

  const seen = new Set<string>();
  return built.filter(option => {
    const fingerprint = JSON.stringify(Object.entries(option.providerSelections).map(([provider, selection]) => [provider, selection.optionId]));
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

async function cleanupDrafts(env: Env, providerQuotes: ProviderQuote[]): Promise<void> {
  for (const quote of providerQuotes) {
    if (!quote.draftOrderId) continue;
    try { await getProvider(quote.provider).cleanupDraft?.(env, quote.draftOrderId); }
    catch (error) { console.warn('Provider quote draft cleanup failed', quote.provider, quote.draftOrderId, error); }
  }
}

export async function createShippingQuote(env: Env, items: CatalogItem[], addressInput: Address, contactInput: Contact, requestKey?: string) {
  const contact: Contact = { email: String(contactInput.email || '').trim().toLowerCase(), phone: String(contactInput.phone || '').trim() };
  if (!contact.email || !contact.email.includes('@')) throw badRequest('A valid email is required');
  if (!contact.phone) throw badRequest('Phone is required for fulfillment quotes');

  const currencies = new Set(items.map(item => item.currency.toLowerCase()));
  if (currencies.size !== 1) throw upstream('Mixed currencies are not supported');
  const currency = items[0].currency.toLowerCase();
  const address = normalizeAddress(addressInput);
  const requestHash = await sha256Hex(JSON.stringify({
    items: items.map(item => ({ sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, provider: item.provider })),
    address,
    contact
  }));

  if (requestKey) {
    const existing = await env.COMMERCE_DB.prepare(`
      SELECT id,expires_at,options_json,request_hash
      FROM shipping_quotes
      WHERE request_key=? AND status IN ('open','reserved') AND expires_at>?
    `).bind(requestKey, new Date().toISOString()).first<{ id: string; expires_at: string; options_json: string; request_hash: string | null }>();
    if (existing) {
      if (existing.request_hash && existing.request_hash !== requestHash) throw conflict('Idempotency-Key was already used for a different shipping quote request');
      return { quoteId: existing.id, expiresAt: existing.expires_at, options: JSON.parse(existing.options_json) as HheShippingOption[], reused: true };
    }
  }

  const allowed = (env.STRIPE_ALLOWED_SHIPPING_COUNTRIES || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(address.country)) throw badRequest(`Shipping to ${address.country} is not enabled`);

  const quoteId = randomId('quote');
  const groups = groupByProvider(items);
  const providerQuotes: ProviderQuote[] = [];

  try {
    for (const [name, group] of groups) {
      try {
        const quote = await getProvider(name as CatalogItem['provider']).quoteShipping(env, { quoteId, items: group, address, contact });
        providerQuotes.push(quote);
        await providerSuccess(env, name as CatalogItem['provider'], 'quote');
      } catch (error) {
        await providerFailure(env, name as CatalogItem['provider'], 'quote', error);
        throw error;
      }
    }

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const policy = await getShippingPolicy(env);
    const options = applyShippingPolicy(combineProviderQuotes(providerQuotes, currency), subtotal, policy);
    if (!options.length) throw upstream('No HHE shipping options could be built');

    const ttl = Math.max(35, Number(env.QUOTE_TTL_MINUTES) || 45);
    const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
    try {
      await env.COMMERCE_DB.prepare(`
        INSERT INTO shipping_quotes
          (id,status,items_json,address_json,contact_json,provider_quotes_json,options_json,request_key,request_hash,expires_at,created_at)
        VALUES (?,'open',?,?,?,?,?,?,?,?,?)
      `).bind(quoteId, JSON.stringify(items), JSON.stringify(address), JSON.stringify(contact), JSON.stringify(providerQuotes), JSON.stringify(options), requestKey || null, requestHash, expiresAt, new Date().toISOString()).run();
    } catch (error) {
      if (requestKey) {
        const raced = await env.COMMERCE_DB.prepare(`
          SELECT id,expires_at,options_json,request_hash
          FROM shipping_quotes
          WHERE request_key=? AND status IN ('open','reserved') AND expires_at>?
        `).bind(requestKey, new Date().toISOString()).first<{ id: string; expires_at: string; options_json: string; request_hash: string | null }>();
        if (raced) {
          await cleanupDrafts(env, providerQuotes);
          if (raced.request_hash && raced.request_hash !== requestHash) throw conflict('Idempotency-Key was already used for a different shipping quote request');
          return { quoteId: raced.id, expiresAt: raced.expires_at, options: JSON.parse(raced.options_json) as HheShippingOption[], reused: true };
        }
      }
      throw error;
    }

    return { quoteId, expiresAt, options };
  } catch (error) {
    await cleanupDrafts(env, providerQuotes);
    throw error;
  }
}
