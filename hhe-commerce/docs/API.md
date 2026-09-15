# HHE Commerce RC1.1 API

All monetary values are integer minor units, such as cents for USD.

## Public API

### GET `/health`
Returns service identity and backend version.

### GET `/api/catalog`
Returns active HHE products and variants. Provider credentials and private order identifiers are never returned.

### POST `/api/shipping/quote`

Headers:

- `Content-Type: application/json`
- `Idempotency-Key: <unique client key>` recommended

Body:

```json
{
  "items": [{ "sku": "HHE-SKU", "quantity": 1 }],
  "address": {
    "firstName": "Jane",
    "lastName": "Doe",
    "address1": "123 Main St",
    "city": "Aberdeen",
    "state": "WA",
    "postalCode": "98520",
    "country": "US"
  },
  "contact": {
    "email": "customer@example.com",
    "phone": "5551234567"
  }
}
```

Duplicate SKU lines are consolidated before quantity limits and pricing are applied. The response contains `quoteId`, `expiresAt`, and HHE shipping options. Each option has the customer price and delivery estimate. Internal provider selections are currently returned by the backend object and should be filtered by the future frontend API presentation layer if the frontend does not need them.

The same `Idempotency-Key` may be retried only for the same normalized cart, shipping address, and contact data. A concurrent losing request cleans up any temporary provider drafts and returns the winning quote.

### POST `/api/checkout/create`

Body:

```json
{
  "quoteId": "quote_...",
  "shippingOptionId": "economy"
}
```

Returns HHE order number, private customer order token, Stripe Checkout Session ID, and Checkout URL. Repeating the same request for a reserved quote returns the existing Checkout Session rather than creating a second HHE order.

The private order token is returned in the API response only. It is not placed in the Stripe success redirect URL.

### GET `/api/orders/:orderNumber`

Headers:

- `X-HHE-Order-Token: <private order token>`

Returns customer-safe aggregate order, item, fulfillment, refund, and shipment state. The token must not be placed in a query string.

## Webhooks

Webhook bodies are capped at 1 MiB before signature verification/parsing.

### POST `/api/webhooks/stripe`
Requires a valid Stripe signature.

Before fulfillment is authorized, HHE verifies the signed paid Checkout Session against the stored order:

- stored Stripe Checkout Session ID
- `client_reference_id`
- HHE order metadata
- currency
- merchandise subtotal
- shipping amount
- tax/total arithmetic
- presence of a PaymentIntent
- Stripe-collected shipping address versus the quoted fulfillment address

A mismatch records the payment but puts the HHE order into an exception state and does not enqueue manufacturing.

Handled events include successful/failed/expired Checkout Sessions and Stripe refund lifecycle events used by HHE refunds.

### POST `/api/webhooks/spreadconnect`
Requires the configured Spreadconnect HMAC signature. Relevant events queue order reconciliation. Webhook events are deduplicated in the D1 event ledger.

## Admin authentication

All `/api/admin/*` routes require:

`Authorization: Bearer <ADMIN_API_KEY>`

`ADMIN_API_KEY` must be at least 32 characters. Admin requests are additionally protected by the Cloudflare `ADMIN_RATE_LIMITER` binding.

## Admin order routes

### GET `/api/admin/summary`
Returns order-state counts, provider health state, fulfillment exception counts, expired quote cleanup counts, and provider mode information.

### GET `/api/admin/orders`
Optional query parameters: `status`, `provider`, `limit`, and `cursor`.

### GET `/api/admin/orders/:id`
Returns complete internal order details, fulfillment groups, shipments, attempts, and refunds.

### POST `/api/admin/orders/:id/reconcile`
Queues provider reconciliation.

### POST `/api/admin/orders/:id/cancel`
Attempts to cancel every cancellable fulfillment group. This does not automatically refund Stripe. The response tells the caller whether a refund is still required.

### POST `/api/admin/orders/:id/resolve-address`
Clears a Stripe shipping-address exception and explicitly authorizes use of the original quoted address. This should only be called after the customer or staff has confirmed that the originally quoted address is the intended fulfillment address.

This route is not intended to override `payment_integrity_mismatch`; payment-integrity exceptions require investigation/refund rather than automatic fulfillment.

### POST `/api/admin/orders/:id/refund`
Requires `Idempotency-Key`.

Body:

```json
{
  "amount": 2500,
  "reason": "customer request"
}
```

Omit `amount` to request the remaining refundable order total.

Refund semantics:

- The request key is permanently bound to the same order, amount, and reason.
- D1 atomically reserves the refundable amount before contacting Stripe.
- Concurrent requests cannot reserve more than the order total.
- Network failures and Stripe 5xx responses produce an `unknown` outcome. Retry the exact request with the same `Idempotency-Key`; HHE reuses the same Stripe idempotency key.
- Explicit Stripe rejection produces `failed`, releasing that amount for a later new refund request.
- Refund state is tracked independently of fulfillment state.

## Admin fulfillment routes

### POST `/api/admin/fulfillments/:id/retry`
Retries an unsubmitted fulfillment group.

For an ambiguous Kunaki exception with no persisted provider order ID, the body must include:

```json
{
  "duplicateRiskToken": "I_UNDERSTAND_DUPLICATE_RISK"
}
```

HHE uses an atomic D1 submission lease before any provider manufacturing call. Concurrent queue deliveries therefore cannot both submit the same fulfillment group.

### POST `/api/admin/fulfillments/:id/attach-provider-order`
Attaches a provider order ID discovered manually and immediately queues reconciliation.

```json
{
  "providerOrderId": "provider-order-id"
}
```

### POST `/api/admin/fulfillments/:id/cancel`
Cancels an unsubmitted group locally or calls the provider cancellation API when the provider supports it. Kunaki submitted orders are deliberately not treated as cancellable.

### POST `/api/admin/fulfillments/:id/shipments`
Adds a manual shipment/tracking record for provider recovery cases.

## Catalog routes

### POST `/api/admin/products`
Creates or upserts a product by HHE product SKU.

Currently active fulfillment providers are `spreadconnect` and `kunaki`. Active Kunaki products require a provider product ID.

### POST `/api/admin/variants`
Creates or upserts a sellable HHE variant SKU. Active Spreadconnect variants require a provider SKU.

### POST `/api/admin/products/:id/status`
Sets product `active` state.

### POST `/api/admin/variants/:id/status`
Sets variant `active` state.

## Commerce settings

### GET `/api/admin/settings`
Lists D1-backed commerce setting overrides.

### POST `/api/admin/settings`
Accepts any subset of the supported shipping settings:

```json
{
  "free_shipping_threshold_cents": 10000,
  "shipping_subsidy_cents": 200,
  "shipping_markup_bps": 0,
  "min_shipping_charge_cents": 0
}
```

`shipping_markup_bps` is capped at 10000, equal to 100 percent.

## Audit

### GET `/api/admin/audit`
Optional query parameters: `limit`, `cursor`, and `action`.

Records system, admin, customer checkout, provider recovery, payment-integrity, refund, and catalog-management actions.

## Request size limits

Ordinary JSON API bodies default to 128 KiB. Signed Stripe and Spreadconnect webhook bodies are capped at 1 MiB. Oversized requests receive HTTP 413.
