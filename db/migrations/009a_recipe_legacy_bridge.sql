-- Bếp Sỉ F&B - bridge legacy Recipe draft tables into the base shape
-- required by 010_recipe_core.sql.
--
-- Some existing databases adopted migrations 001-009 as a production baseline
-- while already containing an older Recipe schema. CREATE TABLE IF NOT EXISTS in
-- 001 therefore did not add the newer base columns. This bridge is additive,
-- idempotent and deliberately runs before Recipe Core.

BEGIN;

CREATE TABLE IF NOT EXISTS recipe_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recipe_categories
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE recipe_categories
SET
  name = COALESCE(NULLIF(BTRIM(name), ''), 'Nhóm công thức ' || id::text),
  slug = COALESCE(NULLIF(BTRIM(slug), ''), 'legacy-recipe-category-' || id::text),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE recipe_categories ALTER COLUMN name SET NOT NULL;
ALTER TABLE recipe_categories ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recipe_categories_slug_unique_idx
  ON recipe_categories(slug);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipe_category_id UUID REFERENCES recipe_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_brand TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS suggested_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Be tolerant when the legacy status column is a PostgreSQL enum.
ALTER TABLE recipes ALTER COLUMN status DROP DEFAULT;
ALTER TABLE recipes ALTER COLUMN status TYPE TEXT USING status::text;
ALTER TABLE recipes ALTER COLUMN status SET DEFAULT 'needs_review';

UPDATE recipes
SET
  slug = COALESCE(NULLIF(BTRIM(slug), ''), 'legacy-recipe-' || id::text),
  title = COALESCE(NULLIF(BTRIM(title), ''), 'Công thức cũ ' || id::text),
  status = COALESCE(NULLIF(BTRIM(status), ''), 'needs_review'),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE recipes ALTER COLUMN slug SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN title SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recipes_slug_unique_idx
  ON recipes(slug);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  name TEXT,
  quantity NUMERIC(14,2),
  unit TEXT,
  note TEXT,
  optional BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Be tolerant when an old deployment used an enum for the display unit.
ALTER TABLE recipe_ingredients ALTER COLUMN unit TYPE TEXT USING unit::text;

UPDATE recipe_ingredients
SET
  product_name = COALESCE(NULLIF(BTRIM(product_name), ''), 'Nguyên liệu'),
  name = COALESCE(NULLIF(BTRIM(name), ''), NULLIF(BTRIM(product_name), ''), 'Nguyên liệu'),
  optional = COALESCE(optional, false),
  sort_order = COALESCE(sort_order, 0),
  created_at = COALESCE(created_at, now());

CREATE TABLE IF NOT EXISTS recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_no INTEGER NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS step_no INTEGER,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recipe_id
      ORDER BY COALESCE(step_no, 2147483647), created_at, id
    )::integer AS repaired_step_no
  FROM recipe_steps
)
UPDATE recipe_steps step
SET step_no = ranked.repaired_step_no
FROM ranked
WHERE step.id = ranked.id
  AND step.step_no IS NULL;

UPDATE recipe_steps
SET
  content = COALESCE(NULLIF(BTRIM(content), ''), NULLIF(BTRIM(title), ''), 'Bước chế biến'),
  created_at = COALESCE(created_at, now());

ALTER TABLE recipe_steps ALTER COLUMN step_no SET NOT NULL;
ALTER TABLE recipe_steps ALTER COLUMN content SET NOT NULL;

COMMIT;
