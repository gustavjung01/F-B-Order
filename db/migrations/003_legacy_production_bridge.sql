-- Bếp Sỉ F&B - audited bridge from the legacy Heroku schema
-- This migration is intentionally narrow: it only reconciles differences
-- confirmed by the production schema audit before applying the core contract.

BEGIN;

-- Customers ------------------------------------------------------------------
-- The legacy Heroku table used an enum approval_status, required profile
-- fields, and did not contain several canonical customer columns.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_group_id UUID REFERENCES price_groups(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_owner_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_owner_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_decided_by_actor_type TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_decided_by_actor_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_decided_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_note TEXT;

-- Drop constraints that explicitly cast values to the legacy enum before
-- converting the column to canonical TEXT.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_approval_state_consistency_check;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_approval_status_check;
ALTER TABLE customers ALTER COLUMN approval_status DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN approval_status TYPE TEXT USING approval_status::text;

-- Be tolerant of a legacy enum on status as well, while remaining idempotent
-- when status is already TEXT.
ALTER TABLE customers ALTER COLUMN status DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN status TYPE TEXT USING status::text;

-- Canonical customer identity must not depend on all profile fields being
-- present. Preserve the existing production row by deriving name safely.
UPDATE customers
SET
  name = COALESCE(
    NULLIF(name, ''),
    NULLIF(shop_name, ''),
    NULLIF(contact_name, ''),
    NULLIF(phone, ''),
    'Legacy customer ' || id::text
  ),
  approval_status = CASE
    WHEN approval_status IN ('pending', 'approved', 'rejected') THEN approval_status
    ELSE 'pending'
  END,
  status = CASE
    WHEN status IN ('active', 'inactive', 'blocked') THEN status
    ELSE 'active'
  END,
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

-- Preserve legacy approval metadata when those columns exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'approved_at'
  ) THEN
    EXECUTE $sql$
      UPDATE customers
      SET approval_decided_at = COALESCE(approval_decided_at, approved_at)
      WHERE approval_status IN ('approved', 'rejected')
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'approved_by'
  ) THEN
    EXECUTE $sql$
      UPDATE customers
      SET
        approval_decided_by_actor_type = COALESCE(approval_decided_by_actor_type, 'staff'),
        approval_decided_by_actor_id = COALESCE(approval_decided_by_actor_id, approved_by)
      WHERE approval_status IN ('approved', 'rejected')
        AND approved_by IS NOT NULL
    $sql$;
  END IF;
END $$;

UPDATE customers
SET
  approval_decided_by_actor_type = COALESCE(approval_decided_by_actor_type, 'system'),
  approval_decided_by_actor_id = COALESCE(approval_decided_by_actor_id, 'system:legacy-bridge'),
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

ALTER TABLE customers ALTER COLUMN clerk_user_id DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN shop_name DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN contact_name DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN address DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN name SET NOT NULL;
ALTER TABLE customers ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE customers ALTER COLUMN approval_status SET NOT NULL;
ALTER TABLE customers ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE customers ALTER COLUMN status SET NOT NULL;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check
  CHECK (status IN ('active', 'inactive', 'blocked'));

-- Order item snapshots -------------------------------------------------------
-- Canonical snapshots may outlive or intentionally omit a product reference.
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;

COMMIT;
