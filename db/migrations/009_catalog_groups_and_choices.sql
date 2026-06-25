-- Bếp Sỉ F&B - Catalog group taxonomy and non-pricing product choices
-- Additive migration. Existing catalog/cart/order rows remain valid.

BEGIN;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS catalog_group_key TEXT;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS choice_groups JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE catalog_products
  DROP CONSTRAINT IF EXISTS catalog_products_choice_groups_shape_check;
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_choice_groups_shape_check
  CHECK (jsonb_typeof(choice_groups) = 'array');

CREATE INDEX IF NOT EXISTS catalog_products_group_idx
  ON catalog_products(industry_key, catalog_group_key, sort_order)
  WHERE catalog_group_key IS NOT NULL;

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS selections JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS selection_key TEXT NOT NULL DEFAULT '';

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_selections_shape_check;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_selections_shape_check
  CHECK (jsonb_typeof(selections) = 'object');

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_selection_key_length_check;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_selection_key_length_check
  CHECK (length(selection_key) <= 500);

DROP INDEX IF EXISTS cart_items_cart_variant_unique;
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_selection_unique
  ON cart_items(cart_id, variant_id, selection_key)
  WHERE variant_id IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selection_snapshot JSONB;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_selection_snapshot_shape_check;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_selection_snapshot_shape_check
  CHECK (selection_snapshot IS NULL OR jsonb_typeof(selection_snapshot) = 'object');

COMMIT;
