PRAGMA foreign_keys = ON;

ALTER TABLE shipping_quotes ADD COLUMN request_key TEXT;
ALTER TABLE shipping_quotes ADD COLUMN request_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipping_quotes_request_key ON shipping_quotes(request_key) WHERE request_key IS NOT NULL AND status IN ('open','reserved');

ALTER TABLE orders ADD COLUMN stripe_checkout_url TEXT;
ALTER TABLE orders ADD COLUMN stripe_address_json TEXT;
ALTER TABLE orders ADD COLUMN exception_code TEXT;
ALTER TABLE orders ADD COLUMN exception_detail TEXT;
ALTER TABLE orders ADD COLUMN refund_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE orders ADD COLUMN refunded_total INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shipping_quote_unique ON orders(shipping_quote_id);

CREATE TABLE IF NOT EXISTS fulfillment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fulfillment_group_id TEXT NOT NULL REFERENCES fulfillment_groups(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed')),
  provider_order_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_attempts_order ON fulfillment_attempts(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_health (
  provider TEXT PRIMARY KEY,
  last_operation TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL UNIQUE,
  stripe_refund_id TEXT UNIQUE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  reason TEXT,
  status TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id, created_at DESC);
