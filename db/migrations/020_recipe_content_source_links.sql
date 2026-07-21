-- B?p S? F&B - recipe content source and recipe-to-recipe ingredient links
BEGIN;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS recipe_kind TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS serving_size_ml NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS content_source_key TEXT,
  ADD COLUMN IF NOT EXISTS operational_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_recipe_id UUID REFERENCES recipes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_recipe_slug TEXT,
  ADD COLUMN IF NOT EXISTS catalog_key TEXT;

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_visibility_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_visibility_check CHECK (visibility IN ('public', 'internal')) NOT VALID;
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_source_type_check;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_source_type_check CHECK (source_type IN ('manual', 'catalog_candidate', 'recipe')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_recipes_content_source_key ON recipes(content_source_key);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_source_recipe_id ON recipe_ingredients(source_recipe_id) WHERE source_recipe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_catalog_key ON recipe_ingredients(catalog_key) WHERE catalog_key IS NOT NULL;

COMMIT;
