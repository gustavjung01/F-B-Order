-- Bếp Sỉ F&B - Recipe catalog foundation
-- Scope: additive schema only. No destructive changes.
-- Recipes are content offers that map back to real products through recipe_ingredients.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  related_brand TEXT,
  cover_image_url TEXT,
  source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  status TEXT NOT NULL DEFAULT 'needs_review',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Legacy DBs already have the MVP recipes table. Add the catalog columns in place.
ALTER TABLE IF EXISTS recipes
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id),
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS related_brand TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'is_active'
  ) THEN
    EXECUTE $sql$
      UPDATE recipes
      SET title = COALESCE(title, name),
          short_description = COALESCE(short_description, summary),
          description = COALESCE(description, detail),
          status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END,
          source_confidence = COALESCE(source_confidence, 'needs_review')
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipes_status_check'
  ) THEN
    ALTER TABLE recipes
      ADD CONSTRAINT recipes_status_check
      CHECK (status IN ('needs_review', 'active', 'draft', 'inactive'))
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recipes_category_id ON recipes(category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipes_related_brand ON recipes(related_brand);
CREATE INDEX IF NOT EXISTS idx_recipes_sort_order ON recipes(sort_order);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT,
  quantity NUMERIC(14,2),
  unit TEXT,
  note TEXT,
  optional BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product_id ON recipe_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_sort_order ON recipe_ingredients(recipe_id, sort_order);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_no INT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id ON recipe_steps(recipe_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_steps_recipe_step_no ON recipe_steps(recipe_id, step_no);
