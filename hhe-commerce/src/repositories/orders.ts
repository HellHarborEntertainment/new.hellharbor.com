import type { CatalogItem, Env } from '../types.js';
import { notFound, unauthorized } from '../lib/errors.js';

export interface OrderRow {
  id: string; order_number: string; public_token: string; customer_email: string; customer_phone: string; status: string; payment_status: string;
  fulfillment_status: string; currency: string; subtotal: number; shipping_total: number; tax_total: number; grand_total: number;
  shipping_quote_id: string; shipping_option_id: string; address_json: string; stripe_checkout_session_id: string | null;
}

export async function getOrder(env: Env, id: string): Promise<OrderRow> {
  const order = await env.COMMERCE_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) throw notFound('Order not found');
  return order;
}

export async function getPublicOrder(env: Env, orderNumber: string, token: string) {
  const order = await env.COMMERCE_DB.prepare('SELECT * FROM orders WHERE order_number = ?').bind(orderNumber).first<OrderRow>();
  if (!order) throw notFound('Order not found');
  if (!token || token !== order.public_token) throw unauthorized('Invalid order token');
  const items = await env.COMMERCE_DB.prepare('SELECT sku, name, quantity, unit_price, provider FROM order_items WHERE order_id = ? ORDER BY rowid').bind(order.id).all();
  const groups = await env.COMMERCE_DB.prepare('SELECT id, provider, provider_order_id, status, shipping_method, shipping_cost, submitted_at, shipped_at, delivered_at FROM fulfillment_groups WHERE order_id = ? ORDER BY created_at').bind(order.id).all();
  const shipments = await env.COMMERCE_DB.prepare('SELECT fulfillment_group_id, provider, carrier, tracking_number, tracking_url, status, shipped_at, delivered_at FROM shipments WHERE order_id = ? ORDER BY created_at').bind(order.id).all();
  return { order: { orderNumber: order.order_number, status: order.status, paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status, currency: order.currency, subtotal: order.subtotal, shipping: order.shipping_total, tax: order.tax_total, total: order.grand_total }, items: items.results || [], fulfillments: groups.results || [], shipments: shipments.results || [] };
}

export async function orderItems(env: Env, orderId: string): Promise<CatalogItem[]> {
  const rows = await env.COMMERCE_DB.prepare(`SELECT oi.*, p.currency FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`).bind(orderId).all<Record<string, unknown>>();
  return (rows.results || []).map(r => ({ productId: String(r.product_id), variantId: String(r.variant_id), sku: String(r.sku), productName: String(r.name), provider: String(r.provider) as CatalogItem['provider'], providerProductId: r.provider_product_id ? String(r.provider_product_id) : undefined, providerSku: r.provider_sku ? String(r.provider_sku) : undefined, unitPrice: Number(r.unit_price), currency: String(r.currency), quantity: Number(r.quantity) }));
}
