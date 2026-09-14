# HHE Commerce Backend

Cloudflare Workers commerce orchestration for Hell Harbor Entertainment. The service owns pricing, checkout, order state, shipping normalization, provider routing, fulfillment, and tracking while the public site remains a separate frontend.

## Providers

- **Spreadconnect**: print-on-demand apparel/merch. Shipping quotes use an unconfirmed Spreadconnect draft order. The draft is updated with the HHE order reference, assigned the selected shipping type, then confirmed only after Stripe payment succeeds.
- **Kunaki**: physical media. Shipping is quoted directly. Manufacturing orders are submitted only after Stripe payment succeeds because Kunaki orders cannot be cancelled or have their shipping method changed after submission.

## Core flow

1. `POST /api/shipping/quote` validates SKUs against D1 and asks each provider for its shipping options.
2. Provider options are normalized into HHE Economy / Standard / Express tiers and the exact provider selections are frozen into a short-lived quote.
3. `POST /api/checkout/create` turns a quote into an HHE order and creates a Stripe Checkout Session.
4. Stripe's signed webhook marks the order paid and places a fulfillment job on Cloudflare Queues.
5. The queue consumer creates/updates one `fulfillment_group` per provider and submits production orders idempotently.
6. Spreadconnect webhooks and scheduled reconciliation update provider state and tracking. Kunaki is reconciled through its OrderStatus API.
7. `GET /api/orders/:orderNumber?token=...` returns the customer-facing aggregate state across all packages.

## Setup

1. Create a Cloudflare D1 database named `hhe-commerce` and put its ID in `wrangler.jsonc`.
2. Create `hhe-commerce-fulfillment` and `hhe-commerce-fulfillment-dlq` queues.
3. Apply `migrations/0001_core.sql` with Wrangler migrations.
4. Set Worker secrets from `.dev.vars.example` with `wrangler secret put` in production.
5. Keep `SPREADCONNECT_BASE_URL` on staging and `KUNAKI_MODE=TEST` until end-to-end tests pass.
6. Register `/api/webhooks/stripe` in Stripe and configure its signing secret.
7. Register `/api/webhooks/spreadconnect` as a Spreadconnect subscription using a secret and store that same secret as `SPREADCONNECT_WEBHOOK_SECRET`.

## Product mapping

Every sellable variant is an HHE SKU. Spreadconnect variants require `provider_sku`. Kunaki products require `provider_product_id` containing the Kunaki ProductId. Retail prices are always loaded from D1 and never trusted from the browser.

## Safety properties

- No provider credentials are sent to the frontend.
- Stripe and Spreadconnect webhooks are signature verified from the raw body.
- Fulfillment is gated on `payment_status='paid'`.
- `UNIQUE(order_id, provider)` prevents duplicate provider groups.
- Provider order IDs are unique per provider.
- Shipping quote snapshots preserve the exact provider methods used to price checkout.
- Expired Spreadconnect draft orders are cancelled by scheduled cleanup.
- Queue retries do not create a second provider order once `provider_order_id` is persisted.
