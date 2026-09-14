import type { Address, CatalogItem, Contact, Env, HheShippingOption, ProviderQuote, ProviderShippingOption, ShippingTier } from '../types.js';
import { getProvider } from '../providers/index.js';
import { badRequest, upstream } from '../lib/errors.js';
import { randomId } from '../lib/crypto.js';

export function groupByProvider(items: CatalogItem[]): Map<string, CatalogItem[]> {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) groups.set(item.provider, [...(groups.get(item.provider) || []), item]);
  return groups;
}

function speedScore(o: ProviderShippingOption): number { return o.maxDays ?? o.minDays ?? 999; }
function cheapest(options: ProviderShippingOption[]): ProviderShippingOption { return [...options].sort((a, b) => a.price - b.price || speedScore(a) - speedScore(b))[0]; }
function fastest(options: ProviderShippingOption[]): ProviderShippingOption { return [...options].sort((a, b) => speedScore(a) - speedScore(b) || a.price - b.price)[0]; }

function selectForTier(options: ProviderShippingOption[], tier: ShippingTier): ProviderShippingOption {
  if (tier === 'economy') return cheapest(options);
  if (tier === 'express') return fastest(options);
  const standard = options.filter(o => o.tierHint === 'standard');
  if (standard.length) return cheapest(standard);
  const economy = cheapest(options); const express = fastest(options);
  if (economy.id === express.id) return economy;
  const candidates = options.filter(o => o.id !== economy.id && o.id !== express.id);
  return candidates.length ? cheapest(candidates) : (speedScore(express) < speedScore(economy) ? express : economy);
}

export function combineProviderQuotes(providerQuotes: ProviderQuote[], currency: string): HheShippingOption[] {
  const tiers: ShippingTier[] = ['economy', 'standard', 'express'];
  const built = tiers.map(tier => {
    let price = 0; let minDays = 0; let maxDays = 0; const providerSelections: HheShippingOption['providerSelections'] = {};
    for (const quote of providerQuotes) {
      const chosen = selectForTier(quote.options, tier);
      price += chosen.price;
      minDays = Math.max(minDays, chosen.minDays || 0);
      maxDays = Math.max(maxDays, chosen.maxDays || chosen.minDays || 0);
      providerSelections[quote.provider] = { optionId: chosen.id, name: chosen.name, price: chosen.price, metadata: chosen.metadata };
    }
    return { id: tier, name: `HHE ${tier[0].toUpperCase()}${tier.slice(1)}`, price, currency, minDays: minDays || undefined, maxDays: maxDays || undefined, providerSelections } satisfies HheShippingOption;
  });
  const seen = new Set<string>();
  return built.filter(o => {
    const fingerprint = JSON.stringify(Object.entries(o.providerSelections).map(([p, s]) => [p, s.optionId]));
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint); return true;
  });
}

export async function createShippingQuote(env: Env, items: CatalogItem[], address: Address, contact: Contact) {
  if (!contact.email || !contact.email.includes('@')) throw badRequest('A valid email is required');
  if (!contact.phone) throw badRequest('Phone is required for fulfillment quotes');
  const quoteId = randomId('quote');
  const groups = groupByProvider(items);
  const providerQuotes: ProviderQuote[] = [];
  try {
    for (const [providerName, group] of groups) providerQuotes.push(await getProvider(providerName as CatalogItem['provider']).quoteShipping(env, { quoteId, items: group, address, contact }));
  } catch (error) {
    for (const q of providerQuotes) if (q.draftOrderId) await getProvider(q.provider).cleanupDraft?.(env, q.draftOrderId);
    throw error;
  }
  const currencies = new Set(items.map(i => i.currency.toLowerCase()));
  if (currencies.size !== 1) throw upstream('Mixed currencies are not supported');
  const options = combineProviderQuotes(providerQuotes, items[0].currency.toLowerCase());
  const ttl = Math.max(5, Number(env.QUOTE_TTL_MINUTES) || 20);
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
  await env.COMMERCE_DB.prepare(`
    INSERT INTO shipping_quotes (id, status, items_json, address_json, contact_json, provider_quotes_json, options_json, expires_at, created_at)
    VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?)
  `).bind(quoteId, JSON.stringify(items), JSON.stringify(address), JSON.stringify(contact), JSON.stringify(providerQuotes), JSON.stringify(options), expiresAt, new Date().toISOString()).run();
  return { quoteId, expiresAt, options };
}
