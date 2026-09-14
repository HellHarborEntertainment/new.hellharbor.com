PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  retail_price INTEGER NOT NULL CHECK(retail_price >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  provider TEXT NOT NULL CHECK(provider IN ('kunaki','spreadconnect','in_house')),
  provider_product_id TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  name TEXT,
  size TEXT,
  color TEXT,
  provider_sku TEXT,
  retail_price INTEGER CHECK(retail_price IS NULL OR retail_price >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS shipping_quotes (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('open','reserved','expired','consumed','cancelled')),
  items_json TEXT NOT NULL,
  address_json TEXT NOT NULL,
  contact_json TEXT NOT NULL,
  provider_quotes_json TEXT NOT NULL,
  options_json TEXT NOT NULL,
  selected_option_id TEXT,
  order_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipping_quotes_expiry ON shipping_quotes(status, expires_at);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  fulfillment_status TEXT NOT NULL,
  currency TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  shipping_total INTEGER NOT NULL,
  tax_total INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL,
  shipping_quote_id TEXT NOT NULL REFERENCES shipping_quotes(id),
  shipping_option_id TEXT NOT NULL,
  address_json TEXT NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status, fulfillment_status, updated_at);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price INTEGER NOT NULL CHECK(unit_price >= 0),
  provider TEXT NOT NULL,
  provider_product_id TEXT,
  provider_sku TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS fulfillment_groups (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  status TEXT NOT NULL,
  shipping_method TEXT,
  shipping_cost INTEGER,
  last_error TEXT,
  submitted_at TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(order_id, provider)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_provider_order ON fulfillment_groups(provider, provider_order_id) WHERE provider_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fulfillment_group_items (
  fulfillment_group_id TEXT NOT NULL REFERENCES fulfillment_groups(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  PRIMARY KEY(fulfillment_group_id, order_item_id)
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fulfillment_group_id TEXT NOT NULL REFERENCES fulfillment_groups(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  status TEXT NOT NULL,
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  last_error TEXT,
  UNIQUE(provider, provider_event_id)
);
