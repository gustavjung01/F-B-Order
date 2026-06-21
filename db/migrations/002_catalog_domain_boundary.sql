-- Bếp Sỉ F&B - catalog domain boundary
-- Physical products and bundles are both products. Recipes remain a separate domain.

BEGIN;

ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_kind TEXT NOT NULL DEFAULT 'sku_candidate';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_key TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_status_raw TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS data_issues JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_orderable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Legacy catalog imports stored the six sellable combos as recipe_content.
-- Normalize them before replacing the old product_type constraint.
UPDATE products
SET
  product_type = 'bundle',
  catalog_kind = 'bundle_candidate',
  is_orderable = false,
  data_issues = CASE
    WHEN data_issues @> '["missing_bundle_components"]'::jsonb THEN data_issues
    ELSE data_issues || '["missing_bundle_components"]'::jsonb
  END,
  updated_at = now()
WHERE product_type = 'recipe_content';

CREATE TABLE IF NOT EXISTS product_bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (bundle_product_id <> component_product_id),
  UNIQUE(bundle_product_id, component_product_id)
);

-- Compatibility cleanup for databases that briefly used catalog_suggestions.
DO $$
BEGIN
  IF to_regclass('public.catalog_suggestions') IS NOT NULL THEN
    EXECUTE $migrate$
      INSERT INTO products (
        category_id,
        subcategory_id,
        sku,
        name,
        slug,
        brand,
        description,
        short_description,
        unit,
        unit_label,
        package_spec,
        package_size,
        package_size_label,
        image_url,
        industry_group,
        product_type,
        catalog_kind,
        use_cases,
        tags,
        selling_points,
        source_key,
        source_confidence,
        source_status_raw,
        data_issues,
        base_price,
        wholesale_price,
        min_order_qty,
        stock_status,
        status,
        sort_order,
        is_active,
        is_orderable,
        is_public
      )
      SELECT
        suggestion.category_id,
        suggestion.subcategory_id,
        NULL,
        suggestion.title,
        suggestion.slug,
        suggestion.related_brand,
        suggestion.description,
        suggestion.short_description,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        suggestion.cover_image_url,
        'combo_cong_thuc',
        'bundle',
        'bundle_candidate',
        suggestion.use_cases,
        suggestion.tags,
        '[]'::jsonb,
        suggestion.source_key,
        suggestion.source_confidence,
        suggestion.source_status_raw,
        '["missing_sku","missing_unit","missing_price_retail","missing_price_wholesale","missing_bundle_components"]'::jsonb,
        0,
        NULL,
        1,
        'available',
        suggestion.status,
        suggestion.sort_order,
        suggestion.is_active,
        false,
        suggestion.is_public
      FROM catalog_suggestions suggestion
      ON CONFLICT (slug) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        subcategory_id = EXCLUDED.subcategory_id,
        name = EXCLUDED.name,
        brand = COALESCE(EXCLUDED.brand, products.brand),
        description = COALESCE(EXCLUDED.description, products.description),
        short_description = COALESCE(EXCLUDED.short_description, products.short_description),
        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
        industry_group = 'combo_cong_thuc',
        product_type = 'bundle',
        catalog_kind = 'bundle_candidate',
        use_cases = EXCLUDED.use_cases,
        tags = EXCLUDED.tags,
        source_key = EXCLUDED.source_key,
        source_confidence = EXCLUDED.source_confidence,
        source_status_raw = EXCLUDED.source_status_raw,
        data_issues = EXCLUDED.data_issues,
        status = EXCLUDED.status,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        is_orderable = false,
        is_public = EXCLUDED.is_public,
        updated_at = now()
    $migrate$;
  END IF;
END $$;

DROP TABLE IF EXISTS catalog_suggestions;

-- Tighten constraints only after every legacy row has been normalized.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('physical', 'bundle', 'service'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_catalog_kind_check;
ALTER TABLE products ADD CONSTRAINT products_catalog_kind_check
  CHECK (catalog_kind IN ('sku_candidate', 'bundle_candidate'));

CREATE INDEX IF NOT EXISTS products_source_key_idx ON products(source_key);
CREATE INDEX IF NOT EXISTS products_public_status_idx ON products(is_public, status, is_active);
CREATE INDEX IF NOT EXISTS product_bundle_items_bundle_idx ON product_bundle_items(bundle_product_id);
CREATE INDEX IF NOT EXISTS product_bundle_items_component_idx ON product_bundle_items(component_product_id);

DROP TRIGGER IF EXISTS set_product_bundle_items_updated_at ON product_bundle_items;
CREATE TRIGGER set_product_bundle_items_updated_at
BEFORE UPDATE ON product_bundle_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
