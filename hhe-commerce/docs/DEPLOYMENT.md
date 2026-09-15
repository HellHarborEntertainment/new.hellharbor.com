# HHE Commerce RC1 Deployment Checklist

## Cloudflare resources

- Create the D1 database and replace the database ID placeholder.
- Create the fulfillment queue and dead-letter queue.
- Confirm Rate Limiting namespace IDs are unique within the Cloudflare account.
- Apply `0001_core.sql` and `0002_rc1_hardening.sql` through Wrangler migrations.
- Configure all Worker secrets.
- Deploy with Spreadconnect staging and Kunaki TEST mode first.

## Stripe

- Use test-mode API keys during RC validation.
- Create the Checkout webhook endpoint for `/api/webhooks/stripe`.
- Subscribe to Checkout completion, asynchronous payment success/failure, Checkout expiration, and refund create/update events.
- Store the signing secret as `STRIPE_WEBHOOK_SECRET`.
- Verify allowed shipping countries match HHE fulfillment policy.

## Spreadconnect

- Use the staging REST base during RC validation.
- Configure the API access token as a Worker secret.
- Configure the signed webhook subscription for `/api/webhooks/spreadconnect`.
- Verify quote drafts can be created, assigned a shipping type, updated, confirmed, reconciled, and cancelled while still cancellable.

## Kunaki

- Keep `KUNAKI_MODE=TEST` during validation.
- Verify every HHE Kunaki SKU has the correct `provider_product_id`.
- Verify ShippingOptions descriptions returned by Kunaki are accepted by the Order request.
- Confirm the production account funding strategy before switching to LIVE mode.
- Test manual recovery of an ambiguous submission without creating a duplicate live order.

## Catalog and policy

- Import or create all sellable HHE products and variants.
- Confirm Spreadconnect variants contain `provider_sku`.
- Confirm Kunaki products contain `provider_product_id`.
- Confirm all storefront prices are stored in integer cents.
- Configure shipping subsidy, markup, minimum, and free-shipping threshold values.

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
7. Payment failure and Checkout expiration.
8. Spreadconnect draft expiration cleanup.
9. Successful tracking reconciliation.
10. Ambiguous Kunaki submission recovery.
11. Partial and full Stripe refunds with repeated idempotency keys.
12. Admin cancellation behavior before and after provider submission.

Do not switch Spreadconnect or Kunaki to production until these tests have been completed with test/staging credentials.
