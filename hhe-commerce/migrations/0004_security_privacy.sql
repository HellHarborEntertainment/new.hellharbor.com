PRAGMA foreign_keys = ON;

ALTER TABLE webhook_events ADD COLUMN payload_sha256 TEXT;
ALTER TABLE webhook_events ADD COLUMN processing_token TEXT;
ALTER TABLE webhook_events ADD COLUMN processing_started_at TEXT;

-- Raw webhook bodies may contain customer PII. Historical rows are scrubbed as part of this migration.
UPDATE webhook_events SET payload_json='{}';

CREATE INDEX IF NOT EXISTS idx_webhook_processing
  ON webhook_events(provider, processed_at, processing_started_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_unique
  ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE orders ADD COLUMN pii_redacted_at TEXT;
ALTER TABLE shipping_quotes ADD COLUMN pii_redacted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_pii_retention
  ON orders(pii_redacted_at, payment_status, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_quotes_pii_retention
  ON shipping_quotes(pii_redacted_at, status, created_at);
