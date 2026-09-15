# HHE Commerce Backend

Provider-agnostic commerce orchestration for Hell Harbor Entertainment on Cloudflare Workers. HHE Commerce owns catalog pricing, shipping quotes, Stripe checkout, order state, provider routing, fulfillment, refunds, recovery controls, privacy retention, auditing, and tracking while the public website remains a separate frontend.

## Release state

Current code target: **0.2.2-rc1.2**.

This release candidate supports Spreadconnect print-on-demand fulfillment, Kunaki physical-media fulfillment, one Stripe payment across mixed-provider orders, Cloudflare D1 persistence, Queues, rate limiting, scheduled reconciliation, admin recovery APIs, and HHE-normalized shipping/tracking.

## Core order flow

1. `POST /api/shipping/quote` resolves HHE SKUs from D1 and requests provider rates.
2. Provider choices and true provider costs are frozen internally, while the public response exposes only HHE shipping tier, customer price, currency, and ETA.
3. `POST /api/checkout/create` reserves the quote and creates one HHE order and one Stripe Checkout Session using server-authoritative prices.
4. Stripe collects the shipping address. Signed webhook processing validates the exact Checkout Session ID, HHE metadata, currency, merchandise subtotal, shipping charge, tax arithmetic, PaymentIntent uniqueness, and paid shipping address.
5. Any payment-integrity or address discrepancy fails closed and blocks fulfillment.
6. A valid payment queues provider fulfillment. Each provider group must atomically acquire a D1 submission lease before any manufacturing call.
7. Spreadconnect reuses its saved unconfirmed quote draft. Kunaki is submitted only after verified payment.
8. Reconciliation is monotonic: delivered/shipped packages cannot regress because of stale provider status responses.
9. Customers see HHE package/tracking information without provider identities, provider order IDs, internal fulfillment IDs, or supplier costs.

## Security and privacy controls

- Provider and Stripe credentials remain Worker secrets and are never returned to browsers.
- Browser-supplied product prices are ignored; active SKU price and provider mapping come from D1.
- Cart quantities, SKU lengths, unit prices, order totals, shipping values, request sizes, contact fields, and addresses have explicit bounds.
- Quote and refund idempotency keys are SHA-256 hashed before storage.
- Customer order access tokens are HMAC-derived from `ORDER_ACCESS_SECRET`; D1 stores only their SHA-256 hash. The same order token can therefore be recovered after a lost checkout response without storing the bearer token itself.
- Order tokens are carried in `X-HHE-Order-Token`, not URLs.
- Stripe and Spreadconnect webhook signatures are verified before parsing side effects.
- Webhook bodies are never persisted. D1 stores only event identity, type, SHA-256 payload fingerprint, processing state, and errors.
- A provider event ID reused with a different payload fingerprint is rejected.
- Webhook processing uses an atomic lease so concurrent deliveries cannot both execute the same event.
- Payment fulfillment requires the exact stored Checkout Session and a PaymentIntent that has not been assigned to another HHE order.
- Admin retry, provider-order attachment, cancellation, and manual-shipment actions are blocked while a provider submission lease is active.
- Upstream/provider response details are never exposed through public 5xx responses.
- Public catalog, quote, and order APIs omit provider identities, supplier pricing, internal IDs, and exception details.
- Cloudflare Turnstile can be required in staging and is automatically mandatory when Kunaki is `LIVE` or Spreadconnect is not using a staging endpoint. Live verification requires an allowlisted hostname and exact action.
- Scheduled privacy retention removes customer email, phone, fulfillment addresses, stored Stripe address data, checkout URLs, old tracking identifiers/links, refund notes, provider errors, and order audit metadata after configurable retention windows.
- Raw processed webhook ledger entries are retained only for a short deduplication window and contain no raw webhook payload.

## Provider safety

### Spreadconnect

Shipping quotes use unconfirmed Spreadconnect draft orders. The draft ID is stored internally with the HHE quote. After payment, HHE updates that same draft with the final order reference, selects the frozen shipping type, and confirms it. Expired unpaid drafts are cancelled only after Stripe confirms the associated Checkout Session is expired. Ambiguous confirmation responses are reconciled against the existing draft before retry decisions are made.

### Kunaki

Authenticated fulfillment and OrderStatus traffic uses Kunaki's HTTPS XML service with credentials inside the POST body, never the request URL. Kunaki manufacturing submissions occur only after verified Stripe payment. Because Kunaki does not provide a general manufacturing idempotency key, an interrupted submission without a persisted OrderId becomes a manual-review exception rather than an automatic retry. Explicit resubmission requires the admin duplicate-risk acknowledgement.

## Concurrency and recovery

- `UNIQUE(order_id, provider)` plus atomic submission leases prevent duplicate HHE fulfillment groups and concurrent external submissions.
- Concurrent refund requests atomically reserve refundable balance before calling Stripe.
- Stripe refunds use stable refund-scoped Stripe idempotency keys; network/5xx ambiguity remains reserved as `unknown` and is safely retried with the same HHE request key.
- Scheduled maintenance recovers paid orders whose initial queue message was lost, reconciles provider orders independently, clears stale webhook leases, and turns stale Kunaki submissions into manual-review exceptions.
- Provider reconciliation is monotonic and master order state returns from `exception` to `paid` when a recoverable provider exception clears.
- Quote cleanup rechecks both Stripe and D1 immediately before destructive provider cleanup, preventing late payment from cancelling a paid Spreadconnect draft.

## Required secrets

Configure these with Worker secrets, never repository variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SPREADCONNECT_ACCESS_TOKEN`
- `SPREADCONNECT_WEBHOOK_SECRET`
- `KUNAKI_USER_ID`
- `KUNAKI_PASSWORD`
- `ADMIN_API_KEY` with at least 32 random characters
- `ORDER_ACCESS_SECRET` with at least 32 random characters
- `TURNSTILE_SECRET_KEY` when Turnstile is required

## Setup

1. Create the D1 database named `hhe-commerce` and replace the placeholder database ID in `wrangler.jsonc`.
2. Create `hhe-commerce-fulfillment` and `hhe-commerce-fulfillment-dlq`.
3. Apply every migration in order, including `0003_rc1_1_concurrency.sql` and `0004_security_privacy.sql`.
4. Configure unique Workers Rate Limiting namespace IDs.
5. Configure all required Worker secrets.
6. Keep Spreadconnect on staging and Kunaki in `TEST` until staging validation passes.
7. Register Stripe and Spreadconnect webhook endpoints and signing secrets.
8. Configure Turnstile site keys/hostname allowlist before switching either provider live.
9. Confirm privacy-retention settings before production.
10. Run `npm test` and require a green CI result before deployment or promotion.

## Testing

`npm test` compiles under strict TypeScript and runs isolated plus SQLite-backed integration/adversarial tests. The test harness applies every migration in order and mocks Stripe, Spreadconnect, Kunaki XML, signed webhooks, concurrent fulfillment, concurrent refunds, payment-integrity failures, public-data minimization, cleanup/payment races, and privacy retention without placing live orders.

See `docs/API.md` for the route contract and `docs/DEPLOYMENT.md` for the pre-production gate.
