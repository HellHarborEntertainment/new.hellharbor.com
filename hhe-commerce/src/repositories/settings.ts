import type { Env, ShippingPolicy } from '../types.js';

async function setting(env: Env, key: string): Promise<string | null> {
  const row = await env.COMMERCE_DB.prepare('SELECT value_json FROM commerce_settings WHERE key = ?').bind(key).first<{ value_json: string }>();
  if (!row) return null;
  try { const parsed = JSON.parse(row.value_json); return typeof parsed === 'string' || typeof parsed === 'number' ? String(parsed) : null; } catch { return row.value_json; }
}
function integer(value: string | undefined | null, fallback = 0): number { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback; }
export async function getShippingPolicy(env: Env): Promise<ShippingPolicy> {
  const [threshold, subsidy, markup, minimum] = await Promise.all([
    setting(env,'free_shipping_threshold_cents'), setting(env,'shipping_subsidy_cents'), setting(env,'shipping_markup_bps'), setting(env,'min_shipping_charge_cents')
  ]);
  return {
    freeShippingThresholdCents: integer(threshold ?? env.FREE_SHIPPING_THRESHOLD_CENTS), shippingSubsidyCents: integer(subsidy ?? env.SHIPPING_SUBSIDY_CENTS),
    shippingMarkupBps: integer(markup ?? env.SHIPPING_MARKUP_BPS), minShippingChargeCents: integer(minimum ?? env.MIN_SHIPPING_CHARGE_CENTS)
  };
}
export async function setSetting(env: Env, key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  await env.COMMERCE_DB.prepare(`INSERT INTO commerce_settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`)
    .bind(key, JSON.stringify(value), now).run();
}
export async function listSettings(env: Env) { const r = await env.COMMERCE_DB.prepare('SELECT key, value_json, updated_at FROM commerce_settings ORDER BY key').all(); return r.results || []; }
