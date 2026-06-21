-- Bếp Sỉ F&B - minimal admin operation audit

BEGIN;

CREATE TABLE IF NOT EXISTS customer_approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('pending', 'approved', 'rejected')),
  to_status TEXT NOT NULL CHECK (to_status IN ('pending', 'approved', 'rejected')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'system')),
  actor_id TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_internal_note_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_note TEXT,
  new_note TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'system')),
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO customer_approval_logs (
  customer_id,
  from_status,
  to_status,
  actor_type,
  actor_id,
  note,
  created_at
)
SELECT
  customer.id,
  'pending',
  customer.approval_status,
  COALESCE(customer.approval_decided_by_actor_type, 'system'),
  COALESCE(customer.approval_decided_by_actor_id, 'system:migration'),
  customer.approval_note,
  COALESCE(customer.approval_decided_at, customer.updated_at, customer.created_at, now())
FROM customers customer
WHERE customer.approval_status IN ('approved', 'rejected')
  AND NOT EXISTS (
    SELECT 1
    FROM customer_approval_logs log
    WHERE log.customer_id = customer.id
  );

CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_approval_logs_append_only ON customer_approval_logs;
CREATE TRIGGER customer_approval_logs_append_only
BEFORE UPDATE OR DELETE ON customer_approval_logs
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();

DROP TRIGGER IF EXISTS order_internal_note_logs_append_only ON order_internal_note_logs;
CREATE TRIGGER order_internal_note_logs_append_only
BEFORE UPDATE OR DELETE ON order_internal_note_logs
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();

CREATE INDEX IF NOT EXISTS customer_approval_logs_customer_created_at_idx
  ON customer_approval_logs(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_internal_note_logs_order_created_at_idx
  ON order_internal_note_logs(order_id, created_at DESC);

COMMIT;
