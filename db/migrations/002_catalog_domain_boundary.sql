-- Bếp Sỉ F&B - catalog domain boundary
-- Products are orderable catalog candidates. Suggestions are homepage content cards.

BEGIN;

ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_kind TEXT NOT NULL DEFAULT 'sku_candidate';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_status_raw TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS data_issues JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_orderable BOOLEAN NOT NULL DEFAULT false;

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
  source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  source_status_raw TEXT,
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'active', 'draft', 'inactive')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_suggestions_category_id_idx ON catalog_suggestions(category_id);
CREATE INDEX IF NOT EXISTS catalog_suggestions_status_idx ON catalog_suggestions(status, is_active);

DROP TRIGGER IF EXISTS set_catalog_suggestions_updated_at ON catalog_suggestions;
CREATE TRIGGER set_catalog_suggestions_updated_at
BEFORE UPDATE ON catalog_suggestions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
