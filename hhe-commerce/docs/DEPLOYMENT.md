# HHE Commerce RC1.1 Deployment Checklist

## Cloudflare resources

- Create the D1 database and replace the database ID placeholder.
- Create the fulfillment queue and dead-letter queue.
- Confirm Rate Limiting namespace IDs are unique within the Cloudflare account.
- Apply `0001_core.sql`, `0002_rc1_hardening.sql`, and `0003_rc1_1_concurrency.sql` through Wrangler migrations.
- Verify `fulfillment_groups` includes `submission_token` and `submission_started_at` after migrations.
- Configure all Worker secrets.
- Use an `ADMIN_API_KEY` with at least 32 random characters.
- Deploy with Spreadconnect staging and Kunaki TEST mode first.
- Confirm the scheduled trigger runs and can enqueue quote cleanup, lost-fulfillment recovery, reconciliation, and stale-lease recovery jobs.

## Stripe

- Use test-mode API keys during RC validation.
- Create the Checkout webhook endpoint for `/api/webhooks/stripe`.
- Subscribe to Checkout completion, asynchronous payment success/failure, Checkout expiration, and refund create/update/failure events.
- Store the signing secret as `STRIPE_WEBHOOK_SECRET`.
- Verify allowed shipping countries match HHE fulfillment policy.
- Confirm successful Checkout events contain the expected Session ID, order metadata, currency, subtotal, shipping amount, total, tax details, PaymentIntent, and shipping address.
- Verify a deliberately altered signed test Session is blocked as `payment_integrity_mismatch` and never reaches fulfillment.
- Verify the Stripe success URL contains the HHE order number and Session ID but does not contain the private HHE order-access token.
- Verify refund retries with the same HHE idempotency key do not create duplicate Stripe refunds after an intentionally interrupted/ambiguous request.

## Spreadconnect

- Use the staging REST base during RC validation.
- Configure the API access token as a Worker secret.
- Configure the signed webhook subscription for `/api/webhooks/spreadconnect`.
- Verify quote drafts can be created, assigned a shipping type, updated, confirmed, reconciled, and cancelled while still cancellable.
- Force a quote-idempotency race and confirm the losing temporary draft is cancelled.
- Force an ambiguous confirmation response and confirm HHE checks the existing draft state before attempting another submission.
- Verify a stale Spreadconnect submission lease is cleared and safely retried against the same draft order.

## Kunaki

- Keep `KUNAKI_MODE=TEST` during validation.
- Verify every active HHE Kunaki product has the correct `provider_product_id`.
- Verify ShippingOptions descriptions returned by Kunaki are accepted by the Order request.
- Confirm the production account funding strategy before switching to LIVE mode.
- Test manual recovery of an ambiguous submission without creating a duplicate live order.
- Trigger concurrent fulfillment workers against one TEST order and confirm only one Kunaki manufacturing request is sent.
- Verify a stale Kunaki submission lease becomes a manual-review exception and is never automatically resubmitted.

## Catalog and policy

- Import or create all sellable HHE products and variants.
- Confirm active Spreadconnect variants contain `provider_sku`.
- Confirm active Kunaki products contain `provider_product_id`.
- Confirm unsupported/future providers cannot be activated before an adapter is implemented.
- Confirm duplicate cart lines are consolidated and quantity caps apply after consolidation.
- Confirm all storefront prices are stored in integer cents.
- Configure shipping subsidy, markup, minimum, and free-shipping threshold values.
- Verify provider shipping currencies match the cart currency.

## Customer-order access

- Persist the `publicToken` returned from `POST /api/checkout/create` only in the client/application state that needs it.
- Do not append that token to URLs.
- Read customer orders through `GET /api/orders/:orderNumber` with `X-HHE-Order-Token`.
- Confirm an invalid/missing token returns 401 and provider order identifiers are not exposed in the customer response.

## RC validation

Run:

```bash
npm test
```

Required result: all tests pass.

Then test in staging:

1. Spreadconnect-only cart.
2. Kunaki-only cart.
3. Mixed Spreadconnect + Kunaki cart.
4. Economy and fastest available shipping tiers.
5. Stripe address formatting changes that should normalize as equal.
6. Stripe postal/address change that should block fulfillment.
7. Validly signed Stripe event with an incorrect subtotal/session/order binding that should block fulfillment.
8. Payment failure and Checkout expiration.
9. Spreadconnect draft expiration cleanup.
10. Successful tracking reconciliation.
11. Ambiguous Kunaki submission recovery.
12. Concurrent Kunaki queue deliveries producing one manufacturing order.
13. Partial and full Stripe refunds with repeated idempotency keys.
14. Concurrent refund reservations that cannot exceed the paid order total.
15. Ambiguous refund request retried with the same idempotency key.
16. Admin cancellation behavior before and after provider submission.
17. Lost initial fulfillment queue message recovered by scheduled maintenance.
18. Healthy provider package continues reconciliation while another provider group is in exception.
19. Customer order lookup through the header token flow.
20. Oversized API/webhook bodies are rejected with HTTP 413.

Do not switch Spreadconnect or Kunaki to production until these tests have been completed with test/staging credentials.
