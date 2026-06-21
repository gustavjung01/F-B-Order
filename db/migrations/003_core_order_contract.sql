-- Bếp Sỉ F&B - core customer approval and order contract
-- Idempotent migration: safe to run repeatedly after 001 and 002.

BEGIN;

-- Temporarily remove the append-only guard so an existing database can be
-- normalized when this migration is re-run.
DROP TRIGGER IF EXISTS order_status_logs_append_only ON order_status_logs;

-- Customer approval decision -------------------------------------------------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_decided_by_actor_type TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_decided_by_actor_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_decided_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_note TEXT;

UPDATE customers
SET approval_status = 'pending'
WHERE approval_status IS NULL;

UPDATE customers
SET
  approval_decided_by_actor_type = COALESCE(approval_decided_by_actor_type, 'system'),
  approval_decided_by_actor_id = COALESCE(approval_decided_by_actor_id, 'system:migration'),
  approval_decided_at = COALESCE(approval_decided_at, updated_at, created_at, now()),
  approval_note = CASE
    WHEN approval_status = 'rejected' THEN COALESCE(approval_note, rejected_reason)
    ELSE approval_note
  END
WHERE approval_status IN ('approved', 'rejected');

UPDATE customers
SET
  approval_decided_by_actor_type = NULL,
  approval_decided_by_actor_id = NULL,
  approval_decided_at = NULL
WHERE approval_status = 'pending';

ALTER TABLE customers ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE customers ALTER COLUMN approval_status SET NOT NULL;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_approval_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_approval_actor_type_check;
ALTER TABLE customers ADD CONSTRAINT customers_approval_actor_type_check
  CHECK (
    approval_decided_by_actor_type IS NULL
    OR approval_decided_by_actor_type IN ('staff', 'system')
  );

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_approval_state_consistency_check;
ALTER TABLE customers ADD CONSTRAINT customers_approval_state_consistency_check
  CHECK (
    (
      approval_status = 'pending'
      AND approval_decided_by_actor_type IS NULL
      AND approval_decided_by_actor_id IS NULL
      AND approval_decided_at IS NULL
    )
    OR
    (
      approval_status IN ('approved', 'rejected')
      AND approval_decided_by_actor_type IS NOT NULL
      AND approval_decided_by_actor_id IS NOT NULL
      AND approval_decided_at IS NOT NULL
    )
  );

-- Canonical order fields and statuses ---------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'VND';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN status TYPE TEXT USING status::text;

UPDATE orders
SET
  customer_note = COALESCE(customer_note, note),
  shipping_address = COALESCE(shipping_address, delivery_address),
  status = CASE status
    WHEN 'draft' THEN 'pending'
    WHEN 'submitted' THEN 'pending'
    WHEN 'preparing' THEN 'processing'
    WHEN 'delivering' THEN 'shipping'
    WHEN 'fulfilled' THEN 'completed'
    ELSE status
  END;

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'processing', 'shipping', 'completed', 'cancelled', 'rejected'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_check;
ALTER TABLE orders ADD CONSTRAINT orders_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_amounts_nonnegative_check;
ALTER TABLE orders ADD CONSTRAINT orders_amounts_nonnegative_check
  CHECK (
    subtotal >= 0
    AND discount_total >= 0
    AND total_amount >= 0
    AND discount_total <= subtotal
  );

-- Immutable order item snapshot ---------------------------------------------
-- Existing sku/name/unit/unit_price/quantity/line_total columns are the
-- canonical snapshot fields. product_id is only a traceable reference.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'physical';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bundle_snapshot JSONB;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS snapshot_version INT NOT NULL DEFAULT 1;

UPDATE order_items item
SET product_type = product.product_type
FROM products product
WHERE item.product_id = product.id;

UPDATE order_items
SET
  name = COALESCE(name, product_name),
  product_name = COALESCE(product_name, name),
  line_total = COALESCE(line_total, total_price, round(unit_price * quantity, 2)),
  total_price = COALESCE(total_price, line_total, round(unit_price * quantity, 2));

UPDATE order_items item
SET bundle_snapshot = jsonb_build_object(
  'components',
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'productId', component.id,
          'sku', component.sku,
          'name', component.name,
          'unit', bundle_item.unit,
          'quantity', bundle_item.quantity
        )
        ORDER BY bundle_item.sort_order, bundle_item.created_at
      )
      FROM product_bundle_items bundle_item
      JOIN products component ON component.id = bundle_item.component_product_id
      WHERE bundle_item.bundle_product_id = item.product_id
    ),
    '[]'::jsonb
  )
)
WHERE item.product_type = 'bundle'
  AND item.bundle_snapshot IS NULL;

ALTER TABLE order_items ALTER COLUMN name SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN line_total SET NOT NULL;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_type_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_type_check
  CHECK (product_type IN ('physical', 'bundle', 'service'));

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_quantity_positive_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive_check
  CHECK (quantity > 0);

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_amounts_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_amounts_check
  CHECK (
    unit_price >= 0
    AND line_total >= 0
    AND line_total = round(unit_price * quantity, 2)
  );

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_snapshot_version_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_snapshot_version_check
  CHECK (snapshot_version >= 1);

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_bundle_snapshot_shape_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_bundle_snapshot_shape_check
  CHECK (
    bundle_snapshot IS NULL
    OR (
      jsonb_typeof(bundle_snapshot) = 'object'
      AND bundle_snapshot ? 'components'
      AND jsonb_typeof(bundle_snapshot -> 'components') = 'array'
    )
  );

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_bundle_snapshot_required_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_bundle_snapshot_required_check
  CHECK (product_type <> 'bundle' OR bundle_snapshot IS NOT NULL);

-- Append-only order status history ------------------------------------------
ALTER TABLE order_status_logs ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'system';
ALTER TABLE order_status_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;

ALTER TABLE order_status_logs DROP CONSTRAINT IF EXISTS order_status_logs_from_status_check;
ALTER TABLE order_status_logs DROP CONSTRAINT IF EXISTS order_status_logs_to_status_check;
ALTER TABLE order_status_logs ALTER COLUMN from_status TYPE TEXT USING from_status::text;
ALTER TABLE order_status_logs ALTER COLUMN to_status TYPE TEXT USING to_status::text;

UPDATE order_status_logs
SET
  from_status = CASE from_status
    WHEN 'draft' THEN 'pending'
    WHEN 'submitted' THEN 'pending'
    WHEN 'preparing' THEN 'processing'
    WHEN 'delivering' THEN 'shipping'
    WHEN 'fulfilled' THEN 'completed'
    ELSE from_status
  END,
  to_status = CASE to_status
    WHEN 'draft' THEN 'pending'
    WHEN 'submitted' THEN 'pending'
    WHEN 'preparing' THEN 'processing'
    WHEN 'delivering' THEN 'shipping'
    WHEN 'fulfilled' THEN 'completed'
    ELSE to_status
  END,
  actor_type = CASE
    WHEN actor_type IN ('customer', 'staff', 'system') THEN actor_type
    WHEN changed_by_clerk_user_id IS NOT NULL THEN 'staff'
    ELSE 'system'
  END,
  actor_id = COALESCE(actor_id, changed_by_clerk_user_id, 'system:migration');

ALTER TABLE order_status_logs ALTER COLUMN actor_id SET NOT NULL;

ALTER TABLE order_status_logs DROP CONSTRAINT IF EXISTS order_status_logs_actor_type_check;
ALTER TABLE order_status_logs ADD CONSTRAINT order_status_logs_actor_type_check
  CHECK (actor_type IN ('customer', 'staff', 'system'));

ALTER TABLE order_status_logs DROP CONSTRAINT IF EXISTS order_status_logs_from_status_check;
ALTER TABLE order_status_logs ADD CONSTRAINT order_status_logs_from_status_check
  CHECK (
    from_status IS NULL
    OR from_status IN ('pending', 'confirmed', 'processing', 'shipping', 'completed', 'cancelled', 'rejected')
  );

ALTER TABLE order_status_logs DROP CONSTRAINT IF EXISTS order_status_logs_to_status_check;
ALTER TABLE order_status_logs ADD CONSTRAINT order_status_logs_to_status_check
  CHECK (to_status IN ('pending', 'confirmed', 'processing', 'shipping', 'completed', 'cancelled', 'rejected'));

CREATE OR REPLACE FUNCTION prevent_order_status_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'order_status_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_status_logs_append_only
BEFORE UPDATE OR DELETE ON order_status_logs
FOR EACH ROW EXECUTE FUNCTION prevent_order_status_log_mutation();

CREATE INDEX IF NOT EXISTS customers_approval_status_created_at_idx
  ON customers(approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx
  ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_status_logs_order_created_at_idx
  ON order_status_logs(order_id, created_at ASC);

COMMIT;
