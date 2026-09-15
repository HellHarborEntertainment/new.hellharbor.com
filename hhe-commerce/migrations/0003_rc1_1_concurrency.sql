PRAGMA foreign_keys = ON;

ALTER TABLE fulfillment_groups ADD COLUMN submission_token TEXT;
ALTER TABLE fulfillment_groups ADD COLUMN submission_started_at TEXT;

CREATE INDEX IF NOT EXISTS idx_fulfillment_submission_lease
  ON fulfillment_groups(status, submission_started_at)
  WHERE provider_order_id IS NULL;
