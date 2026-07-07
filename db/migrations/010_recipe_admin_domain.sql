-- Bếp Sỉ F&B - Recipe admin domain foundation
-- Scope: additive only. Recipe publishing, versioning, pricing and cart actions are introduced later.

BEGIN;

CREATE TABLE IF NOT EXISTS recipe_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_categories_active_sort
  ON recipe_categories(is_active, sort_order, name);

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS recipe_category_id UUID REFERENCES recipe_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS yield_quantity NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS yield_unit TEXT,
  ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipes_yield_quantity_positive'
  ) THEN
    ALTER TABLE recipes
      ADD CONSTRAINT recipes_yield_quantity_positive
      CHECK (yield_quantity IS NULL OR yield_quantity > 0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recipes_recipe_category_id
  ON recipes(recipe_category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_admin_status_updated_at
  ON recipes(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_archived_at
  ON recipes(archived_at);

COMMIT;
