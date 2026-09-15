# HHE Commerce Backend

Provider-agnostic commerce orchestration for Hell Harbor Entertainment on Cloudflare Workers. HHE Commerce owns catalog pricing, shipping quotes, Stripe checkout, order state, provider routing, fulfillment, refunds, recovery controls, auditing, and tracking while the public website remains a separate frontend.

## Release state

Current code target: **0.2.1-rc1.1**.

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
- Scheduled reconciliation, lost-job recovery, stale submission leases, and expired quote cleanup
- Customer aggregate order and tracking reads
- Admin order, fulfillment, catalog, policy, refund, audit, and recovery APIs

## Core order flow

1. `POST /api/shipping/quote` resolves HHE SKUs from D1 and requests provider shipping options.
2. Provider options are normalized into customer-facing HHE shipping tiers. Exact provider choices and actual provider costs are frozen into the quote snapshot.
3. `POST /api/checkout/create` reserves the quote, creates the HHE order, and creates a Stripe Checkout Session with server-authoritative line prices.
4. Stripe collects the shipping address. HHE validates the signed paid Checkout Session against the stored session ID, order metadata, currency, merchandise subtotal, shipping amount, tax arithmetic, and payment intent.
5. HHE compares Stripe's paid shipping address with the address used to generate the provider quote.
6. Any payment-integrity or address mismatch fails closed. The payment remains recorded, but fulfillment is blocked for explicit administrative review or refund.
7. A valid paid Stripe webhook queues fulfillment.
8. HHE creates one fulfillment group per provider and acquires an atomic D1 submission lease before any external manufacturing call. Spreadconnect confirms the saved draft order. Kunaki receives a manufacturing order only after payment.
9. Provider reconciliation updates normalized fulfillment state and all available tracking records. Scheduled maintenance recovers paid orders whose initial queue message was lost and continues reconciling healthy packages even when another provider group is in exception.
10. `GET /api/orders/:orderNumber` with `X-HHE-Order-Token` returns the aggregate customer order state without exposing provider credentials or provider order IDs.

## Provider safety

### Spreadconnect

Shipping quotes use unconfirmed Spreadconnect draft orders. The draft ID is stored with the HHE quote. After payment, HHE updates that same draft with the final HHE order reference, applies the selected shipping type, and confirms it. Expired unpaid quote drafts are cancelled by scheduled maintenance.

Quote creation cleans up draft orders on downstream policy/database failures and on idempotency races. If the confirmation response is ambiguous, HHE checks the existing draft state before treating the submission as failed. Stale Spreadconnect submission leases are safe to requeue because the same provider draft is reused.

### Kunaki

Kunaki orders are submitted only after verified Stripe payment. A request failure during Kunaki submission is treated as ambiguous because Kunaki does not provide a safe general-purpose idempotency key for manufacturing submissions. HHE will not automatically resubmit an ambiguous Kunaki group. Admin resubmission requires the literal acknowledgement token `I_UNDERSTAND_DUPLICATE_RISK`, or an administrator can attach a provider order ID after confirming the order directly in Kunaki.

Atomic submission leases ensure concurrent Cloudflare Queue deliveries cannot both submit the same Kunaki manufacturing group. A stale Kunaki submission lease becomes a manual-review exception rather than an automatic retry.

## Checkout integrity

- Retail prices are always read from D1.
- Browser-supplied prices are ignored.
- Duplicate cart SKU lines are consolidated before quantity limits and pricing are applied.
- Active provider mappings are validated before checkout.
- Shipping quote idempotency keys are bound to a request hash, so the same key cannot be reused for a different cart or address.
- Quote idempotency races clean up any losing Spreadconnect draft instead of leaking provider orders.
- Each shipping quote can produce only one HHE order.
- Stripe Checkout creation uses an HHE order-scoped Stripe idempotency key.
- Stripe webhook signatures are verified using the raw body.
- Fulfillment requires `payment_status='paid'` and no unresolved order exception.
- The paid Stripe Checkout Session is checked against HHE's stored session, order metadata, currency, subtotal, shipping charge, total arithmetic, and payment intent before fulfillment.
- Stripe shipping details are compared against the provider-quoted address before fulfillment.
- Stripe and Spreadconnect webhook events are persisted in an idempotent event ledger.
- Public order access tokens are never placed in redirect URLs. Customer order reads use the `X-HHE-Order-Token` header.
- JSON/API and webhook request bodies are bounded before parsing.

## Refund safety

- Refund creation requires an `Idempotency-Key`.
- A refund idempotency key is bound to one order, amount, and reason.
- Refundable balance is reserved atomically in D1, preventing concurrent refund requests from reserving more than the paid order total.
- Stripe refund calls use a stable HHE refund-scoped Stripe idempotency key.
- Network/5xx ambiguity is stored as `unknown`, keeps the amount reserved, and can be retried safely with the same request key.
- Explicit Stripe rejection releases the reservation through a `failed` state.
- Fulfillment cancellation and payment refunds remain separate operations.

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
3. Apply all migrations in `migrations/`, including `0003_rc1_1_concurrency.sql`.
4. Configure unique Rate Limiting namespace IDs in `wrangler.jsonc` if namespace IDs `1001` and `1002` are already in use in the Cloudflare account.
5. Configure production secrets with `wrangler secret put` using `.dev.vars.example` as the list of required secrets. `ADMIN_API_KEY` must be at least 32 characters.
6. Keep `SPREADCONNECT_BASE_URL` on the Spreadconnect staging endpoint and `KUNAKI_MODE=TEST` until staging validation is complete.
7. Register `/api/webhooks/stripe` in Stripe and save the webhook signing secret.
8. Register `/api/webhooks/spreadconnect` with its signing secret.
9. Run `npm test` before deployment.
10. Change provider modes to production only after live-account credentials, shipping policy, catalog mappings, and webhook delivery have been validated.

Cloudflare Workers Rate Limiting requires Wrangler 4.36.0 or later, so the backend pins Wrangler accordingly.

## Testing

`npm test` compiles the Worker and runs isolated plus SQLite-backed integration tests. The integration harness applies every migration in order and mocks Stripe, Spreadconnect, and Kunaki to validate the complete mixed-cart path without creating live orders. RC1.1 additionally races concurrent fulfillment and refund requests to verify the atomic D1 guards.

See `docs/API.md` for the backend route contract and `docs/DEPLOYMENT.md` for the deployment checklist.

## Continuous integration

GitHub Actions runs strict TypeScript compilation and the automated backend test suite for changes under `hhe-commerce/`. The release candidate must not be promoted when this validation job is failing.
