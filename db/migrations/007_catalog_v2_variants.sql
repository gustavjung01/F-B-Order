-- Bếp Sỉ F&B - Catalog v2 parent/variant model
-- Additive only: legacy products/catalog remain untouched during cutover.

BEGIN;

CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version TEXT NOT NULL DEFAULT 'hung-phat-v2',
  product_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  industry TEXT NOT NULL,
  industry_key TEXT NOT NULL,
  subcategory TEXT,
  source_group TEXT,
  option_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  cover_image_key TEXT,
  cover_image_object_key TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'inactive')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(option_groups) = 'array')
);

CREATE TABLE IF NOT EXISTS catalog_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  catalog_version TEXT NOT NULL DEFAULT 'hung-phat-v2',
  variant_key TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (price_mode IN ('fixed', 'market')),
  price_label TEXT,
  retail_price NUMERIC(14,2),
  shop_price NUMERIC(14,2),
  image_key TEXT,
  image_object_key TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'market_price', 'inactive')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_orderable BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(options) = 'object'),
  CHECK (retail_price IS NULL OR retail_price > 0),
  CHECK (shop_price IS NULL OR shop_price > 0),
  CHECK (price_mode <> 'market' OR COALESCE(price_label, '') <> '')
);

CREATE TABLE IF NOT EXISTS catalog_variant_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES catalog_variants(id) ON DELETE CASCADE,
  price_group_id UUID NOT NULL REFERENCES price_groups(id) ON DELETE CASCADE,
  price NUMERIC(14,2) NOT NULL CHECK (price > 0),
  min_quantity NUMERIC(14,2) NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(variant_id, price_group_id, min_quantity)
);

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES catalog_variants(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES catalog_variants(id);

ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_product_or_variant_check;
ALTER TABLE cart_items ADD CONSTRAINT cart_items_product_or_variant_check
  CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_unique
  ON cart_items(cart_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_products_version_status_idx
  ON catalog_products(catalog_version, status, sort_order);
CREATE INDEX IF NOT EXISTS catalog_products_industry_idx
  ON catalog_products(industry_key, subcategory, sort_order);
CREATE INDEX IF NOT EXISTS catalog_variants_product_idx
  ON catalog_variants(product_id, sort_order);
CREATE INDEX IF NOT EXISTS catalog_variants_public_status_idx
  ON catalog_variants(is_public, is_active, status, sort_order);
CREATE INDEX IF NOT EXISTS catalog_variant_prices_lookup_idx
  ON catalog_variant_prices(variant_id, price_group_id, min_quantity DESC);
CREATE INDEX IF NOT EXISTS order_items_variant_idx
  ON order_items(variant_id)
  WHERE variant_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_catalog_products_updated_at ON catalog_products;
CREATE TRIGGER set_catalog_products_updated_at
BEFORE UPDATE ON catalog_products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_catalog_variants_updated_at ON catalog_variants;
CREATE TRIGGER set_catalog_variants_updated_at
BEFORE UPDATE ON catalog_variants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_catalog_variant_prices_updated_at ON catalog_variant_prices;
CREATE TRIGGER set_catalog_variant_prices_updated_at
BEFORE UPDATE ON catalog_variant_prices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
