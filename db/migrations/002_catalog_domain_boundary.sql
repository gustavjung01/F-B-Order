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

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('physical', 'bundle', 'service'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_catalog_kind_check;
ALTER TABLE products ADD CONSTRAINT products_catalog_kind_check
  CHECK (catalog_kind IN ('sku_candidate', 'bundle_candidate'));

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

CREATE INDEX IF NOT EXISTS products_source_key_idx ON products(source_key);
CREATE INDEX IF NOT EXISTS products_public_status_idx ON products(is_public, status, is_active);
CREATE INDEX IF NOT EXISTS product_bundle_items_bundle_idx ON product_bundle_items(bundle_product_id);
CREATE INDEX IF NOT EXISTS product_bundle_items_component_idx ON product_bundle_items(component_product_id);

DROP TRIGGER IF EXISTS set_product_bundle_items_updated_at ON product_bundle_items;
CREATE TRIGGER set_product_bundle_items_updated_at
BEFORE UPDATE ON product_bundle_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Remove the abandoned suggestion-domain experiment if it was created in a dev database.
DROP TABLE IF EXISTS catalog_suggestions;

COMMIT;
