# HHE Commerce RC1 API

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

The response contains `quoteId`, `expiresAt`, and HHE shipping options. Each option has the customer price and delivery estimate. Internal provider selections are currently returned by the backend object and should be filtered by the future frontend API presentation layer if the frontend does not need them.

### POST `/api/checkout/create`

Body:

```json
{
  "quoteId": "quote_...",
  "shippingOptionId": "economy"
}
```

Returns HHE order number, private public-order token, Stripe Checkout Session ID, and Checkout URL. Repeating the same request for a reserved quote returns the existing Checkout Session rather than creating a second HHE order.

### GET `/api/orders/:orderNumber?token=...`
Returns customer-safe aggregate order, item, fulfillment, refund, and shipment state.

## Webhooks

### POST `/api/webhooks/stripe`
Requires a valid Stripe signature. Payment fulfillment is blocked unless the Stripe-collected shipping address matches the quoted fulfillment address after normalization.

### POST `/api/webhooks/spreadconnect`
Requires the configured Spreadconnect HMAC signature. Relevant events queue order reconciliation.

## Admin authentication

All `/api/admin/*` routes require:

`Authorization: Bearer <ADMIN_API_KEY>`

Admin requests are additionally protected by the Cloudflare `ADMIN_RATE_LIMITER` binding.

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

### POST `/api/admin/orders/:id/refund`
Requires `Idempotency-Key`.

Body:

```json
{
  "amount": 2500,
  "reason": "customer request"
}
```

Omit `amount` to request the remaining refundable order total. Refund state is tracked separately from fulfillment state.

## Admin fulfillment routes

### POST `/api/admin/fulfillments/:id/retry`
Retries an unsubmitted fulfillment group.

For an ambiguous Kunaki exception with no persisted provider order ID, the body must include:

```json
{
  "duplicateRiskToken": "I_UNDERSTAND_DUPLICATE_RISK"
}
```

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

### POST `/api/admin/variants`
Creates or upserts a sellable HHE variant SKU.

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

Records system, admin, customer checkout, provider recovery, payment, refund, and catalog-management actions.
