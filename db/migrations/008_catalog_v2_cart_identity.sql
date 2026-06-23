-- Bếp Sỉ F&B - Catalog v2 cart identity
-- Keep legacy product cart lines valid while allowing new variant-only lines.

BEGIN;

ALTER TABLE cart_items ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_product_or_variant_check;
ALTER TABLE cart_items ADD CONSTRAINT cart_items_product_or_variant_check
  CHECK ((product_id IS NOT NULL) <> (variant_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_unique
  ON cart_items(cart_id, variant_id)
  WHERE variant_id IS NOT NULL;

COMMIT;
