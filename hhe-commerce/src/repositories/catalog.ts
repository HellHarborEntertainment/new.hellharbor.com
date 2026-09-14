import type { CartItemInput, CatalogItem, Env } from '../types.js';
import { badRequest } from '../lib/errors.js';

interface VariantRow {
  product_id: string; variant_id: string; sku: string; product_name: string; variant_name: string | null;
  provider: string; provider_product_id: string | null; provider_sku: string | null;
  product_price: number; variant_price: number | null; currency: string; product_active: number; variant_active: number;
}

export async function resolveCart(env: Env, requested: CartItemInput[]): Promise<CatalogItem[]> {
  if (!Array.isArray(requested) || requested.length === 0) throw badRequest('Cart must contain at least one item');
  if (requested.length > 50) throw badRequest('Cart contains too many line items');
  const normalized = requested.map(i => ({ sku: String(i.sku || '').trim(), quantity: Number(i.quantity) }));
  for (const item of normalized) if (!item.sku || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 25) throw badRequest('Invalid cart item');
  const uniqueSkus = [...new Set(normalized.map(i => i.sku))];
  const placeholders = uniqueSkus.map(() => '?').join(',');
  const rows = await env.COMMERCE_DB.prepare(`
    SELECT p.id product_id, v.id variant_id, v.sku, p.name product_name, v.name variant_name,
           p.provider, p.provider_product_id, v.provider_sku, p.retail_price product_price,
           v.retail_price variant_price, p.currency, p.active product_active, v.active variant_active
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.sku IN (${placeholders})
  `).bind(...uniqueSkus).all<VariantRow>();
  const map = new Map((rows.results || []).map(r => [r.sku, r]));
  return normalized.map(item => {
    const row = map.get(item.sku);
    if (!row || !row.product_active || !row.variant_active) throw badRequest(`SKU is unavailable: ${item.sku}`);
    return {
      productId: row.product_id, variantId: row.variant_id, sku: row.sku, productName: row.product_name,
      variantName: row.variant_name || undefined, provider: row.provider as CatalogItem['provider'],
      providerProductId: row.provider_product_id || undefined, providerSku: row.provider_sku || undefined,
      unitPrice: row.variant_price ?? row.product_price, currency: row.currency, quantity: item.quantity
    };
  });
}

export async function listCatalog(env: Env): Promise<unknown[]> {
  const result = await env.COMMERCE_DB.prepare(`
    SELECT p.id product_id, p.sku product_sku, p.name, p.description, p.retail_price, p.currency,
           p.provider, v.id variant_id, v.sku, v.name variant_name, v.retail_price variant_price,
           v.size, v.color
    FROM products p JOIN product_variants v ON v.product_id = p.id
    WHERE p.active = 1 AND v.active = 1 ORDER BY p.name, v.name
  `).all();
  return result.results || [];
}
