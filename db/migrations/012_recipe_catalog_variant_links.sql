-- Bếp Sỉ F&B - Link recipe ingredients to live Catalog V2 variants.
-- Existing legacy product_id and free-text ingredients remain valid for non-catalog inputs
-- such as water, ice, garnish, or preparation-only materials.

BEGIN;

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES catalog_products(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS catalog_variant_id UUID REFERENCES catalog_variants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB;

-- The composite FK below makes it impossible to save a variant under a wrong parent product.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_variants_id_product_id_unique_idx
  ON catalog_variants(id, product_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_variants_id_product_id_unique'
  ) THEN
    ALTER TABLE catalog_variants
      ADD CONSTRAINT catalog_variants_id_product_id_unique
      UNIQUE USING INDEX catalog_variants_id_product_id_unique_idx;
  END IF;
END $$;

ALTER TABLE recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_catalog_variant_product_fk;
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_catalog_variant_product_fk
  FOREIGN KEY (catalog_variant_id, catalog_product_id)
  REFERENCES catalog_variants(id, product_id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_catalog_snapshot_shape_check;
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_catalog_snapshot_shape_check
  CHECK (
    catalog_snapshot IS NULL
    OR (
      jsonb_typeof(catalog_snapshot) = 'object'
      AND catalog_snapshot ? 'variantId'
      AND catalog_snapshot ? 'productId'
      AND catalog_snapshot ? 'sku'
      AND catalog_snapshot ? 'productName'
      AND catalog_snapshot ? 'variantName'
    )
  ) NOT VALID;

ALTER TABLE recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_catalog_link_shape_check;
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_catalog_link_shape_check
  CHECK (
    (catalog_variant_id IS NULL AND catalog_product_id IS NULL AND catalog_snapshot IS NULL)
    OR (catalog_variant_id IS NOT NULL AND catalog_product_id IS NOT NULL AND catalog_snapshot IS NOT NULL)
  ) NOT VALID;

ALTER TABLE recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_legacy_and_catalog_link_check;
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_legacy_and_catalog_link_check
  CHECK (NOT (product_id IS NOT NULL AND catalog_variant_id IS NOT NULL)) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_catalog_variant_id
  ON recipe_ingredients(catalog_variant_id)
  WHERE catalog_variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_catalog_product_id
  ON recipe_ingredients(catalog_product_id)
  WHERE catalog_product_id IS NOT NULL;

COMMIT;
