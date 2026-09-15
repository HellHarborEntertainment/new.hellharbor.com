# HHE Commerce Backend

Provider-agnostic commerce orchestration for Hell Harbor Entertainment on Cloudflare Workers. HHE Commerce owns catalog pricing, shipping quotes, Stripe checkout, order state, provider routing, fulfillment, refunds, recovery controls, auditing, and tracking while the public website remains a separate frontend.

## Release state

Current code target: **0.2.0-rc1**.

The backend supports:

- Spreadconnect print-on-demand fulfillment
- Kunaki physical-media fulfillment
- One HHE order and one Stripe payment across multiple fulfillment providers
- HHE Economy, Standard, and Express shipping normalization
- Shipping subsidies, markups, minimum charges, and Economy free-shipping thresholds
- Stripe automatic tax
- Cloudflare D1 persistence
- Cloudflare Queues for fulfillment and retries
- Cloudflare native Rate Limiting bindings
- Scheduled reconciliation and expired quote cleanup
- Customer aggregate order and tracking reads
- Admin order, fulfillment, catalog, policy, refund, audit, and recovery APIs

## Core order flow

1. `POST /api/shipping/quote` resolves HHE SKUs from D1 and requests provider shipping options.
2. Provider options are normalized into customer-facing HHE shipping tiers. Exact provider choices and actual provider costs are frozen into the quote snapshot.
3. `POST /api/checkout/create` reserves the quote, creates the HHE order, and creates a Stripe Checkout Session with server-authoritative line prices.
4. Stripe collects the shipping address. HHE compares Stripe's paid shipping address with the address used to generate the provider quote.
5. A mismatch fails closed. The payment remains recorded, but fulfillment is blocked until an administrator explicitly resolves the address exception or refunds the order.
6. A valid paid Stripe webhook queues fulfillment.
7. HHE creates one fulfillment group per provider. Spreadconnect confirms the saved draft order. Kunaki receives a manufacturing order only after payment.
8. Provider reconciliation updates normalized fulfillment state and all available tracking records.
9. `GET /api/orders/:orderNumber?token=...` returns the aggregate customer order state without exposing provider credentials or provider order IDs.

## Provider safety

### Spreadconnect

Shipping quotes use unconfirmed Spreadconnect draft orders. The draft ID is stored with the HHE quote. After payment, HHE updates that same draft with the final HHE order reference, applies the selected shipping type, and confirms it. Expired unpaid quote drafts are cancelled by scheduled maintenance.

### Kunaki

Kunaki orders are submitted only after verified Stripe payment. A request failure during Kunaki submission is treated as ambiguous because Kunaki does not provide a safe general-purpose idempotency key for manufacturing submissions. HHE will not automatically resubmit an ambiguous Kunaki group. Admin resubmission requires the literal acknowledgement token `I_UNDERSTAND_DUPLICATE_RISK`, or an administrator can attach a provider order ID after confirming the order directly in Kunaki.

## Checkout integrity

- Retail prices are always read from D1.
- Browser-supplied prices are ignored.
- Shipping quote idempotency keys are bound to a request hash, so the same key cannot be reused for a different cart or address.
- Each shipping quote can produce only one HHE order.
- Stripe Checkout creation uses an HHE order-scoped Stripe idempotency key.
- Stripe webhook signatures are verified using the raw body.
- Fulfillment requires `payment_status='paid'`.
- Stripe shipping details are compared against the provider-quoted address before fulfillment.
- Stripe and Spreadconnect webhook events are persisted in an idempotent event ledger.

## Shipping policy

Defaults can be supplied in `wrangler.jsonc` and overridden through `commerce_settings`:

- `free_shipping_threshold_cents`
- `shipping_subsidy_cents`
- `shipping_markup_bps`
- `min_shipping_charge_cents`

The provider shipping cost remains preserved separately from the amount charged to the customer.

## Setup

1. Create a Cloudflare D1 database named `hhe-commerce` and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`.
2. Create `hhe-commerce-fulfillment` and `hhe-commerce-fulfillment-dlq` queues.
3. Apply all migrations in `migrations/`.
4. Configure unique Rate Limiting namespace IDs in `wrangler.jsonc` if namespace IDs `1001` and `1002` are already in use in the Cloudflare account.
5. Configure production secrets with `wrangler secret put` using `.dev.vars.example` as the list of required secrets.
6. Keep `SPREADCONNECT_BASE_URL` on the Spreadconnect staging endpoint and `KUNAKI_MODE=TEST` until staging validation is complete.
7. Register `/api/webhooks/stripe` in Stripe and save the webhook signing secret.
8. Register `/api/webhooks/spreadconnect` with its signing secret.
9. Run `npm test` before deployment.
10. Change provider modes to production only after live-account credentials, shipping policy, catalog mappings, and webhook delivery have been validated.

Cloudflare Workers Rate Limiting requires Wrangler 4.36.0 or later, so RC1 pins Wrangler accordingly.

## Testing

`npm test` compiles the Worker and runs isolated plus SQLite-backed integration tests. The integration harness simulates D1 and mocks Stripe, Spreadconnect, and Kunaki to validate the complete mixed-cart path without creating live orders.

See `docs/API.md` for the backend route contract and `docs/DEPLOYMENT.md` for the RC1 deployment checklist.

## Continuous integration

GitHub Actions runs strict TypeScript compilation and the automated backend test suite for changes under `hhe-commerce/`. RC1 should not be promoted when this validation job is failing.
