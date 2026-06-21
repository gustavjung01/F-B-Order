-- Bếp Sỉ F&B - transactional order engine support

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_check;
ALTER TABLE orders ADD CONSTRAINT orders_idempotency_key_check
  CHECK (
    idempotency_key IS NULL
    OR char_length(idempotency_key) BETWEEN 8 AND 200
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_request_fingerprint_check;
ALTER TABLE orders ADD CONSTRAINT orders_request_fingerprint_check
  CHECK (
    request_fingerprint IS NULL
    OR request_fingerprint ~ '^[a-f0-9]{64}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_idempotency_key_uidx
  ON orders(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_customer_created_at_idx
  ON orders(customer_id, created_at DESC);

COMMIT;
