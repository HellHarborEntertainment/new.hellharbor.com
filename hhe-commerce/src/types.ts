export type ProviderName = 'kunaki' | 'spreadconnect' | 'in_house';
export type ShippingTier = 'economy' | 'standard' | 'express';
export type OrderStatus = 'pending_payment' | 'paid' | 'payment_failed' | 'expired' | 'cancelled' | 'complete' | 'exception';
export type FulfillmentStatus = 'unfulfilled' | 'queued' | 'submitted' | 'processing' | 'partially_shipped' | 'shipped' | 'partially_delivered' | 'delivered' | 'exception' | 'cancelled';

export interface Env {
  COMMERCE_DB: D1Database;
  FULFILLMENT_QUEUE: Queue<FulfillmentMessage>;
  PUBLIC_RATE_LIMITER: RateLimit;
  ADMIN_RATE_LIMITER: RateLimit;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SUCCESS_URL: string;
  STRIPE_CANCEL_URL: string;
  STRIPE_ALLOWED_SHIPPING_COUNTRIES: string;
  SPREADCONNECT_ACCESS_TOKEN: string;
  SPREADCONNECT_WEBHOOK_SECRET?: string;
  SPREADCONNECT_BASE_URL: string;
  KUNAKI_USER_ID: string;
  KUNAKI_PASSWORD: string;
  KUNAKI_MODE: 'TEST' | 'LIVE';
  KUNAKI_BASE_URL: string;
  KUNAKI_XML_BASE_URL?: string;
  ALLOWED_ORIGINS: string;
  CURRENCY: string;
  QUOTE_TTL_MINUTES: string;
  ADMIN_API_KEY: string;
  FREE_SHIPPING_THRESHOLD_CENTS?: string;
  SHIPPING_SUBSIDY_CENTS?: string;
  SHIPPING_MARKUP_BPS?: string;
  MIN_SHIPPING_CHARGE_CENTS?: string;
  REQUIRE_TURNSTILE?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAMES?: string;
  CUSTOMER_PII_RETENTION_DAYS?: string;
  UNPAID_PII_RETENTION_DAYS?: string;
}

export interface Address {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface Contact { email: string; phone: string; }
export interface CartItemInput { sku: string; quantity: number; }

export interface CatalogItem {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName?: string;
  provider: ProviderName;
  providerProductId?: string;
  providerSku?: string;
  unitPrice: number;
  currency: string;
  quantity: number;
}

export interface ProviderShippingOption {
  provider: ProviderName;
  id: string;
  name: string;
  price: number;
  currency: string;
  minDays?: number;
  maxDays?: number;
  tierHint?: ShippingTier;
  metadata?: Record<string, unknown>;
}

export interface ProviderQuote {
  provider: ProviderName;
  options: ProviderShippingOption[];
  draftOrderId?: string;
  metadata?: Record<string, unknown>;
}

export interface HheShippingOption {
  id: ShippingTier;
  name: string;
  price: number;
  actualProviderCost: number;
  currency: string;
  minDays?: number;
  maxDays?: number;
  providerSelections: Record<string, { optionId: string; name: string; price: number; metadata?: Record<string, unknown> }>;
}

export interface ShippingPolicy {
  freeShippingThresholdCents: number;
  shippingSubsidyCents: number;
  shippingMarkupBps: number;
  minShippingChargeCents: number;
}

export interface FulfillmentMessage {
  type: 'FULFILL_ORDER' | 'RECONCILE_ORDER' | 'CLEANUP_QUOTE';
  orderId?: string;
  quoteId?: string;
}
