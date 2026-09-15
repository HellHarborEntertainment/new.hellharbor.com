import type { Address, Env } from '../types.js';
import { upstream } from '../lib/errors.js';

export interface CheckoutLine { name: string; sku: string; unitAmount: number; quantity: number; currency: string; }
export interface CheckoutCreateInput {
  orderId: string;
  orderNumber: string;
  email: string;
  address: Address;
  lines: CheckoutLine[];
  shipping: { name: string; amount: number; currency: string; minDays?: number; maxDays?: number };
  expiresAtEpoch?: number;
}

export async function createStripeCheckout(env: Env, input: CheckoutCreateInput): Promise<{ id: string; url?: string }> {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('customer_email', input.email);
  params.set('client_reference_id', input.orderId);
  params.set('success_url', `${env.STRIPE_SUCCESS_URL}${env.STRIPE_SUCCESS_URL.includes('?') ? '&' : '?'}order=${encodeURIComponent(input.orderNumber)}&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', env.STRIPE_CANCEL_URL);
  params.set('automatic_tax[enabled]', 'true');
  params.set('billing_address_collection', 'auto');
  params.set('phone_number_collection[enabled]', 'true');
  params.set('shipping_address_collection[allowed_countries][0]', input.address.country.toUpperCase());
  if (input.expiresAtEpoch) params.set('expires_at', String(input.expiresAtEpoch));
  params.set('metadata[order_id]', input.orderId);
  params.set('metadata[order_number]', input.orderNumber);
  params.set('payment_intent_data[metadata][hhe_order_id]', input.orderId);
  params.set('payment_intent_data[metadata][hhe_order_number]', input.orderNumber);

  input.lines.forEach((line, index) => {
    params.set(`line_items[${index}][quantity]`, String(line.quantity));
    params.set(`line_items[${index}][price_data][currency]`, line.currency);
    params.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitAmount));
    params.set(`line_items[${index}][price_data][tax_behavior]`, 'exclusive');
    params.set(`line_items[${index}][price_data][product_data][name]`, line.name);
    params.set(`line_items[${index}][price_data][product_data][metadata][sku]`, line.sku);
  });

  params.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.set('shipping_options[0][shipping_rate_data][display_name]', input.shipping.name);
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(input.shipping.amount));
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', input.shipping.currency);
  params.set('shipping_options[0][shipping_rate_data][tax_behavior]', 'exclusive');
  if (input.shipping.minDays) {
    params.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
    params.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', String(input.shipping.minDays));
  }
  if (input.shipping.maxDays) {
    params.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
    params.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', String(input.shipping.maxDays));
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `hhe-checkout-${input.orderId}` },
    body: params.toString()
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw upstream('Stripe Checkout session creation failed', body);
  return { id: String(body.id), url: body.url ? String(body.url) : undefined };
}

export async function expireStripeCheckout(env: Env, sessionId: string): Promise<void> {
  if (!sessionId) return;
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `hhe-expire-${sessionId}` },
    body: ''
  });
  if (response.ok) return;
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  // A session that is already complete or expired cannot be expired again. Reconciliation/webhooks remain authoritative.
  if (response.status === 400) throw upstream('Stripe Checkout Session could not be expired safely', body);
  throw upstream('Stripe Checkout Session expiration failed', body);
}
