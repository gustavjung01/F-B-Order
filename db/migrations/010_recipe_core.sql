-- Bếp Sỉ F&B - Recipe Core domain
-- Additive upgrade over the legacy recipe draft tables created in 001_init_core.sql.
-- Catalog V2, pricing, cart and order behavior remain untouched.

BEGIN;

-- ---------------------------------------------------------------------------
-- Recipe categories
-- ---------------------------------------------------------------------------

ALTER TABLE recipe_categories
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS prep_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cook_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yield_quantity NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS yield_unit TEXT,
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provenance_source TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS provenance_ai_run_id TEXT,
  ADD COLUMN IF NOT EXISTS provenance_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS provenance_imported_source TEXT;

-- Legacy active recipes have no immutable version snapshot. Keep them private and
-- require an explicit review/publish operation before exposing them again.
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_status_check;
UPDATE recipes
SET status = CASE
  WHEN status = 'inactive' THEN 'archived'
  ELSE 'draft'
END
WHERE status NOT IN ('draft', 'in_review', 'published', 'archived')
   OR status IN ('active', 'needs_review', 'inactive');
ALTER TABLE recipes ALTER COLUMN status SET DEFAULT 'draft';

UPDATE recipes
SET archived_at = COALESCE(archived_at, updated_at, now())
WHERE status = 'archived';

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_aliases_shape_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_aliases_shape_check
  CHECK (jsonb_typeof(aliases) = 'array');

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_status_domain_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_status_domain_check
  CHECK (status IN ('draft', 'in_review', 'published', 'archived'));

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_visibility_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_visibility_check
  CHECK (visibility IN ('public', 'internal'));

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_difficulty_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_difficulty_check
  CHECK (difficulty IN ('easy', 'medium', 'hard'));

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_duration_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_duration_check
  CHECK (prep_minutes >= 0 AND cook_minutes >= 0);

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_yield_quantity_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_yield_quantity_check
  CHECK (yield_quantity IS NULL OR yield_quantity > 0);

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_yield_unit_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_yield_unit_check
  CHECK (yield_unit IS NULL OR yield_unit IN ('g', 'kg', 'ml', 'l', 'piece', 'portion', 'pack'));

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_current_version_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_current_version_check
  CHECK (current_version >= 0);

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_published_version_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_published_version_check
  CHECK (status <> 'published' OR (current_version > 0 AND published_at IS NOT NULL));

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_archived_at_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_archived_at_check
  CHECK (status <> 'archived' OR archived_at IS NOT NULL);

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_provenance_source_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_provenance_source_check
  CHECK (provenance_source IN ('human', 'ai', 'imported'));

-- ---------------------------------------------------------------------------
-- Recipe versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  snapshot JSONB NOT NULL,
  change_note TEXT,
  source TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('human', 'ai', 'imported')),
  created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipe_versions_snapshot_shape_check CHECK (jsonb_typeof(snapshot) = 'object'),
  UNIQUE(recipe_id, version_number)
);

CREATE OR REPLACE FUNCTION prevent_recipe_version_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Recipe version snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_recipe_version_update_trigger ON recipe_versions;
CREATE TRIGGER prevent_recipe_version_update_trigger
BEFORE UPDATE ON recipe_versions
FOR EACH ROW EXECUTE FUNCTION prevent_recipe_version_update();

-- ---------------------------------------------------------------------------
-- Recipe ingredients
-- ---------------------------------------------------------------------------

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES catalog_products(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS catalog_variant_id UUID REFERENCES catalog_variants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_selections JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selection_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS usage_quantity NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS usage_unit TEXT,
  ADD COLUMN IF NOT EXISTS package_content_quantity NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS package_content_unit TEXT,
  ADD COLUMN IF NOT EXISTS waste_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usable_yield_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cart_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catalog_product_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS catalog_variant_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS sku_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS specification_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS selection_key_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS provenance_source TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS provenance_ai_run_id TEXT,
  ADD COLUMN IF NOT EXISTS provenance_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS provenance_imported_source TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE recipe_ingredients ingredient
SET name = COALESCE(
  NULLIF(BTRIM(ingredient.product_name), ''),
  NULLIF(BTRIM(product.name), ''),
  'Nguyên liệu'
)
FROM products product
WHERE ingredient.product_id = product.id
  AND NULLIF(BTRIM(ingredient.name), '') IS NULL;

UPDATE recipe_ingredients
SET name = 'Nguyên liệu'
WHERE NULLIF(BTRIM(name), '') IS NULL;

UPDATE recipe_ingredients
SET usage_quantity = quantity
WHERE usage_quantity IS NULL
  AND quantity IS NOT NULL
  AND quantity > 0;

UPDATE recipe_ingredients
SET usage_unit = CASE LOWER(BTRIM(unit))
  WHEN 'g' THEN 'g'
  WHEN 'kg' THEN 'kg'
  WHEN 'ml' THEN 'ml'
  WHEN 'l' THEN 'l'
  WHEN 'piece' THEN 'piece'
  WHEN 'portion' THEN 'portion'
  WHEN 'pack' THEN 'pack'
  ELSE NULL
END
WHERE usage_unit IS NULL
  AND unit IS NOT NULL;

UPDATE recipe_ingredients
SET is_optional = optional
WHERE optional IS NOT NULL;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY recipe_id
           ORDER BY sort_order, created_at, id
         )::integer AS next_sort_order
  FROM recipe_ingredients
)
UPDATE recipe_ingredients ingredient
SET sort_order = ranked.next_sort_order
FROM ranked
WHERE ingredient.id = ranked.id;

ALTER TABLE recipe_ingredients ALTER COLUMN name SET NOT NULL;
ALTER TABLE recipe_ingredients ALTER COLUMN sort_order SET DEFAULT 1;

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_name_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_name_check
  CHECK (BTRIM(name) <> '');

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_source_type_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_source_type_check
  CHECK (source_type IN ('catalog', 'external'));

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_default_selections_shape_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_default_selections_shape_check
  CHECK (jsonb_typeof(default_selections) = 'object');

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_selection_key_length_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_selection_key_length_check
  CHECK (length(selection_key) <= 500 AND (selection_key_snapshot IS NULL OR length(selection_key_snapshot) <= 500));

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_usage_quantity_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_usage_quantity_check
  CHECK (usage_quantity IS NULL OR usage_quantity > 0);

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_usage_unit_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_usage_unit_check
  CHECK (usage_unit IS NULL OR usage_unit IN ('g', 'kg', 'ml', 'l', 'piece', 'portion', 'pack'));

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_package_quantity_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_package_quantity_check
  CHECK (package_content_quantity IS NULL OR package_content_quantity > 0);

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_package_unit_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_package_unit_check
  CHECK (package_content_unit IS NULL OR package_content_unit IN ('g', 'kg', 'ml', 'l', 'piece', 'portion', 'pack'));

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_package_pair_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_package_pair_check
  CHECK ((package_content_quantity IS NULL) = (package_content_unit IS NULL));

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_waste_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_waste_check
  CHECK (waste_percent >= 0 AND waste_percent <= 100);

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_usable_yield_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_usable_yield_check
  CHECK (usable_yield_percent > 0 AND usable_yield_percent <= 100);

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_sort_order_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_sort_order_check
  CHECK (sort_order > 0);

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_cart_ready_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_cart_ready_check
  CHECK (
    NOT is_cart_ready OR (
      source_type = 'catalog'
      AND catalog_product_id IS NOT NULL
      AND catalog_variant_id IS NOT NULL
      AND usage_quantity IS NOT NULL
      AND usage_unit IS NOT NULL
      AND package_content_quantity IS NOT NULL
      AND package_content_unit IS NOT NULL
    )
  );

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_provenance_source_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_provenance_source_check
  CHECK (provenance_source IN ('human', 'ai', 'imported'));

CREATE UNIQUE INDEX IF NOT EXISTS recipe_ingredients_recipe_sort_unique
  ON recipe_ingredients(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS recipe_ingredients_catalog_product_idx
  ON recipe_ingredients(catalog_product_id)
  WHERE catalog_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recipe_ingredients_catalog_variant_idx
  ON recipe_ingredients(catalog_variant_id)
  WHERE catalog_variant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Recipe steps
-- ---------------------------------------------------------------------------

ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS instruction TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS temperature_celsius NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS success_marker TEXT,
  ADD COLUMN IF NOT EXISTS warning TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provenance_source TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS provenance_ai_run_id TEXT,
  ADD COLUMN IF NOT EXISTS provenance_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS provenance_imported_source TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE recipe_steps
SET instruction = COALESCE(NULLIF(BTRIM(content), ''), 'Bước chế biến')
WHERE instruction IS NULL OR BTRIM(instruction) = '';

UPDATE recipe_steps
SET media_url = image_url
WHERE media_url IS NULL
  AND image_url IS NOT NULL;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY recipe_id
           ORDER BY step_no, created_at, id
         )::integer AS next_sort_order
  FROM recipe_steps
)
UPDATE recipe_steps step
SET sort_order = ranked.next_sort_order
FROM ranked
WHERE step.id = ranked.id;

ALTER TABLE recipe_steps ALTER COLUMN instruction SET NOT NULL;

ALTER TABLE recipe_steps DROP CONSTRAINT IF EXISTS recipe_steps_instruction_check;
ALTER TABLE recipe_steps ADD CONSTRAINT recipe_steps_instruction_check
  CHECK (BTRIM(instruction) <> '');

ALTER TABLE recipe_steps DROP CONSTRAINT IF EXISTS recipe_steps_duration_check;
ALTER TABLE recipe_steps ADD CONSTRAINT recipe_steps_duration_check
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE recipe_steps DROP CONSTRAINT IF EXISTS recipe_steps_temperature_check;
ALTER TABLE recipe_steps ADD CONSTRAINT recipe_steps_temperature_check
  CHECK (temperature_celsius IS NULL OR temperature_celsius BETWEEN -50 AND 500);

ALTER TABLE recipe_steps DROP CONSTRAINT IF EXISTS recipe_steps_sort_order_check;
ALTER TABLE recipe_steps ADD CONSTRAINT recipe_steps_sort_order_check
  CHECK (sort_order > 0);

ALTER TABLE recipe_steps DROP CONSTRAINT IF EXISTS recipe_steps_provenance_source_check;
ALTER TABLE recipe_steps ADD CONSTRAINT recipe_steps_provenance_source_check
  CHECK (provenance_source IN ('human', 'ai', 'imported'));

CREATE UNIQUE INDEX IF NOT EXISTS recipe_steps_recipe_sort_unique
  ON recipe_steps(recipe_id, sort_order);

-- ---------------------------------------------------------------------------
-- Mistakes, business tips and seasonal rules
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  symptom TEXT NOT NULL CHECK (BTRIM(symptom) <> ''),
  likely_causes JSONB NOT NULL DEFAULT '[]'::jsonb,
  immediate_fix TEXT,
  prevention TEXT NOT NULL CHECK (BTRIM(prevention) <> ''),
  related_step_order INTEGER CHECK (related_step_order IS NULL OR related_step_order > 0),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  sort_order INTEGER NOT NULL DEFAULT 1 CHECK (sort_order > 0),
  provenance_source TEXT NOT NULL DEFAULT 'human' CHECK (provenance_source IN ('human', 'ai', 'imported')),
  provenance_ai_run_id TEXT,
  provenance_prompt_version TEXT,
  provenance_imported_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipe_mistakes_likely_causes_shape_check CHECK (jsonb_typeof(likely_causes) = 'array'),
  UNIQUE(recipe_id, sort_order)
);

CREATE TABLE IF NOT EXISTS recipe_business_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  recommendation TEXT NOT NULL CHECK (BTRIM(recommendation) <> ''),
  target_customer TEXT,
  selling_moment TEXT,
  combo_suggestion TEXT,
  packaging_suggestion TEXT,
  storage_suggestion TEXT,
  batch_preparation_suggestion TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1 CHECK (sort_order > 0),
  provenance_source TEXT NOT NULL DEFAULT 'human' CHECK (provenance_source IN ('human', 'ai', 'imported')),
  provenance_ai_run_id TEXT,
  provenance_prompt_version TEXT,
  provenance_imported_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, sort_order)
);

CREATE TABLE IF NOT EXISTS recipe_seasonal_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('month_range', 'festival', 'weather', 'always')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  start_month INTEGER CHECK (start_month IS NULL OR start_month BETWEEN 1 AND 12),
  end_month INTEGER CHECK (end_month IS NULL OR end_month BETWEEN 1 AND 12),
  festival TEXT,
  weather_condition TEXT,
  regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  suitability_reason TEXT NOT NULL CHECK (BTRIM(suitability_reason) <> ''),
  marketing_message TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  provenance_source TEXT NOT NULL DEFAULT 'human' CHECK (provenance_source IN ('human', 'ai', 'imported')),
  provenance_ai_run_id TEXT,
  provenance_prompt_version TEXT,
  provenance_imported_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipe_seasonal_rules_regions_shape_check CHECK (jsonb_typeof(regions) = 'array')
);

CREATE INDEX IF NOT EXISTS recipe_mistakes_recipe_idx
  ON recipe_mistakes(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS recipe_business_tips_recipe_idx
  ON recipe_business_tips(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS recipe_seasonal_rules_recipe_idx
  ON recipe_seasonal_rules(recipe_id, priority DESC, created_at);

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (BTRIM(slug) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_tag_links (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES recipe_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(recipe_id, tag_id)
);

CREATE INDEX IF NOT EXISTS recipe_tag_links_tag_idx
  ON recipe_tag_links(tag_id, recipe_id);

-- ---------------------------------------------------------------------------
-- Catalog V2 product links outside the ingredient list
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_product_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  catalog_product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE RESTRICT,
  catalog_variant_id UUID REFERENCES catalog_variants(id) ON DELETE RESTRICT,
  selections JSONB NOT NULL DEFAULT '{}'::jsonb,
  selection_key TEXT NOT NULL DEFAULT '',
  catalog_product_name_snapshot TEXT,
  catalog_variant_name_snapshot TEXT,
  sku_snapshot TEXT,
  specification_snapshot TEXT,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1 CHECK (sort_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipe_product_links_selections_shape_check CHECK (jsonb_typeof(selections) = 'object'),
  CONSTRAINT recipe_product_links_selection_key_length_check CHECK (length(selection_key) <= 500),
  UNIQUE(recipe_id, sort_order)
);

CREATE UNIQUE INDEX IF NOT EXISTS recipe_product_links_parent_unique
  ON recipe_product_links(recipe_id, catalog_product_id)
  WHERE catalog_variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recipe_product_links_variant_unique
  ON recipe_product_links(recipe_id, catalog_variant_id, selection_key)
  WHERE catalog_variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recipe_product_links_catalog_product_idx
  ON recipe_product_links(catalog_product_id);

-- ---------------------------------------------------------------------------
-- General indexes and updated_at triggers
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS recipes_public_listing_idx
  ON recipes(status, visibility, published_at DESC, sort_order)
  WHERE status = 'published' AND visibility = 'public';
CREATE INDEX IF NOT EXISTS recipes_recipe_category_idx
  ON recipes(recipe_category_id, status, sort_order);
CREATE INDEX IF NOT EXISTS recipe_versions_recipe_idx
  ON recipe_versions(recipe_id, version_number DESC);

DROP TRIGGER IF EXISTS set_recipe_ingredients_updated_at ON recipe_ingredients;
CREATE TRIGGER set_recipe_ingredients_updated_at
BEFORE UPDATE ON recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recipe_steps_updated_at ON recipe_steps;
CREATE TRIGGER set_recipe_steps_updated_at
BEFORE UPDATE ON recipe_steps
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recipe_mistakes_updated_at ON recipe_mistakes;
CREATE TRIGGER set_recipe_mistakes_updated_at
BEFORE UPDATE ON recipe_mistakes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recipe_business_tips_updated_at ON recipe_business_tips;
CREATE TRIGGER set_recipe_business_tips_updated_at
BEFORE UPDATE ON recipe_business_tips
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recipe_seasonal_rules_updated_at ON recipe_seasonal_rules;
CREATE TRIGGER set_recipe_seasonal_rules_updated_at
BEFORE UPDATE ON recipe_seasonal_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recipe_product_links_updated_at ON recipe_product_links;
CREATE TRIGGER set_recipe_product_links_updated_at
BEFORE UPDATE ON recipe_product_links
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
