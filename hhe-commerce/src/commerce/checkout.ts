import type { Env, HheShippingOption } from '../types.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { randomId } from '../lib/crypto.js';
import { createStripeCheckout } from '../stripe/client.js';

interface QuoteRow { id: string; status: string; items_json: string; address_json: string; contact_json: string; provider_quotes_json: string; options_json: string; expires_at: string; }

function orderNumber(): string {
  const d = new Date();
  const date = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  return `HHE-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createCheckout(env: Env, quoteId: string, optionId: string) {
  const quote = await env.COMMERCE_DB.prepare('SELECT * FROM shipping_quotes WHERE id = ?').bind(quoteId).first<QuoteRow>();
  if (!quote) throw notFound('Shipping quote not found');
  if (quote.status !== 'open') throw conflict('Shipping quote is no longer available');
  if (Date.parse(quote.expires_at) <= Date.now()) throw conflict('Shipping quote has expired');
  const items = JSON.parse(quote.items_json) as Array<{ productId: string; variantId: string; sku: string; productName: string; variantName?: string; provider: string; providerProductId?: string; providerSku?: string; unitPrice: number; currency: string; quantity: number }>;
  const contact = JSON.parse(quote.contact_json) as { email: string; phone: string };
  const options = JSON.parse(quote.options_json) as HheShippingOption[];
  const selected = options.find(o => o.id === optionId);
  if (!selected) throw badRequest('Unknown shipping option');
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const id = randomId('ord'); const number = orderNumber(); const token = randomId('access'); const now = new Date().toISOString();
  await env.COMMERCE_DB.prepare(`
    INSERT INTO orders (id, order_number, public_token, customer_email, customer_phone, status, payment_status, fulfillment_status,
      currency, subtotal, shipping_total, tax_total, grand_total, shipping_quote_id, shipping_option_id, address_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending_payment', 'unpaid', 'unfulfilled', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
  `).bind(id, number, token, contact.email, contact.phone, items[0]?.currency || env.CURRENCY, subtotal, selected.price, subtotal + selected.price, quoteId, selected.id, quote.address_json, now, now).run();
  const statements = items.map(i => env.COMMERCE_DB.prepare(`
    INSERT INTO order_items (id, order_id, product_id, variant_id, sku, name, quantity, unit_price, provider, provider_product_id, provider_sku)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(randomId('item'), id, i.productId, i.variantId, i.sku, `${i.productName}${i.variantName ? ` - ${i.variantName}` : ''}`, i.quantity, i.unitPrice, i.provider, i.providerProductId || null, i.providerSku || null));
  if (statements.length) await env.COMMERCE_DB.batch(statements);
  const session = await createStripeCheckout(env, {
    orderId: id, orderNumber: number, publicToken: token, email: contact.email,
    lines: items.map(i => ({ name: `${i.productName}${i.variantName ? ` - ${i.variantName}` : ''}`, sku: i.sku, unitAmount: i.unitPrice, quantity: i.quantity, currency: i.currency })),
    shipping: { name: selected.name, amount: selected.price, currency: selected.currency, minDays: selected.minDays, maxDays: selected.maxDays }
  });
  await env.COMMERCE_DB.prepare(`UPDATE orders SET stripe_checkout_session_id = ?, updated_at = ? WHERE id = ?`).bind(session.id, new Date().toISOString(), id).run();
  await env.COMMERCE_DB.prepare(`UPDATE shipping_quotes SET status = 'reserved', selected_option_id = ?, order_id = ? WHERE id = ? AND status = 'open'`).bind(selected.id, id, quoteId).run();
  return { orderNumber: number, publicToken: token, checkoutSessionId: session.id, checkoutUrl: session.url };
}
