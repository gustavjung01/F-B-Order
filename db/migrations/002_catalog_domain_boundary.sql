-- Bếp Sỉ F&B - catalog domain boundary
-- Products are orderable catalog candidates. Suggestions are homepage content cards.

BEGIN;

ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_kind TEXT NOT NULL DEFAULT 'sku_candidate';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_key TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_status_raw TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS data_issues JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_orderable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS catalog_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  subcategory_id UUID REFERENCES categories(id),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  related_brand TEXT,
  short_description TEXT,
  description TEXT,
  cover_image_url TEXT,
  suggestion_type TEXT NOT NULL DEFAULT 'combo' CHECK (suggestion_type IN ('combo', 'menu_solution', 'content')),
  use_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_key TEXT NOT NULL DEFAULT 'manual',
  source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  source_status_raw TEXT,
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'active', 'draft', 'inactive')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Move any legacy recipe-content rows out of products before tightening the constraint.
INSERT INTO catalog_suggestions (
  category_id,
  subcategory_id,
  slug,
  title,
  related_brand,
  short_description,
  description,
  cover_image_url,
  suggestion_type,
  use_cases,
  tags,
  source_key,
  source_confidence,
  source_status_raw,
  status,
  sort_order,
  is_active,
  is_public
)
SELECT
  category_id,
  subcategory_id,
  slug,
  name,
  brand,
  short_description,
  description,
  image_url,
  'content',
  use_cases,
  tags,
  source_key,
  source_confidence,
  source_status_raw,
  status,
  sort_order,
  is_active,
  is_public
FROM products
WHERE product_type = 'recipe_content'
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  related_brand = EXCLUDED.related_brand,
  short_description = EXCLUDED.short_description,
  description = EXCLUDED.description,
  cover_image_url = EXCLUDED.cover_image_url,
  source_key = EXCLUDED.source_key,
  source_confidence = EXCLUDED.source_confidence,
  source_status_raw = EXCLUDED.source_status_raw,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_public = EXCLUDED.is_public,
  updated_at = now();

DELETE FROM products WHERE product_type = 'recipe_content';

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('physical', 'bundle', 'service'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_catalog_kind_check;
ALTER TABLE products ADD CONSTRAINT products_catalog_kind_check
  CHECK (catalog_kind IN ('sku_candidate', 'bundle_candidate'));

CREATE INDEX IF NOT EXISTS products_source_key_idx ON products(source_key);
CREATE INDEX IF NOT EXISTS products_public_status_idx ON products(is_public, status, is_active);
CREATE INDEX IF NOT EXISTS catalog_suggestions_category_id_idx ON catalog_suggestions(category_id);
CREATE INDEX IF NOT EXISTS catalog_suggestions_status_idx ON catalog_suggestions(status, is_active);
CREATE INDEX IF NOT EXISTS catalog_suggestions_public_status_idx ON catalog_suggestions(is_public, status, is_active);
CREATE INDEX IF NOT EXISTS catalog_suggestions_source_key_idx ON catalog_suggestions(source_key);

DROP TRIGGER IF EXISTS set_catalog_suggestions_updated_at ON catalog_suggestions;
CREATE TRIGGER set_catalog_suggestions_updated_at
BEFORE UPDATE ON catalog_suggestions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
