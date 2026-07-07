-- Bếp Sỉ F&B - Recipe draft / review / publish workflow and immutable snapshots
-- Scope: additive. Public read APIs will use published_version_id in a later phase.

BEGIN;

CREATE TABLE IF NOT EXISTS recipe_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  workflow_status TEXT NOT NULL DEFAULT 'draft',
  snapshot JSONB NOT NULL,
  change_note TEXT,
  created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  reviewed_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  published_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, version_no),
  CONSTRAINT recipe_versions_workflow_status_check
    CHECK (workflow_status IN ('draft', 'in_review', 'changes_requested', 'approved', 'published'))
);

ALTER TABLE recipe_versions
  ADD COLUMN IF NOT EXISTS version_no INT,
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS change_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS published_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE recipe_versions
SET version_no = COALESCE(version_no, version_number, 1)
WHERE version_no IS NULL;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES recipe_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_version_id UUID REFERENCES recipe_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL;

-- Preserve existing recipe data as version 1 before new workflow requests begin.
WITH inserted_versions AS (
  INSERT INTO recipe_versions (recipe_id, version_no, workflow_status, snapshot, created_at)
  SELECT
    recipe.id,
    1,
    CASE
      WHEN recipe.status = 'active' THEN 'published'
      WHEN recipe.status = 'needs_review' THEN 'in_review'
      ELSE 'draft'
    END,
    jsonb_build_object(
      'slug', recipe.slug,
      'title', recipe.title,
      'shortDescription', recipe.short_description,
      'description', recipe.description,
      'recipeCategoryId', recipe.recipe_category_id,
      'relatedBrand', recipe.related_brand,
      'coverImageUrl', recipe.cover_image_url,
      'yieldQuantity', recipe.yield_quantity,
      'yieldUnit', recipe.yield_unit,
      'sortOrder', recipe.sort_order,
      'ingredients', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'productName', ingredient.product_name,
          'quantity', ingredient.quantity,
          'unit', ingredient.unit,
          'note', ingredient.note,
          'optional', ingredient.optional
        ) ORDER BY ingredient.sort_order, ingredient.id)
        FROM recipe_ingredients ingredient
        WHERE ingredient.recipe_id = recipe.id
      ), '[]'::jsonb),
      'steps', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'title', step.title,
          'content', step.content,
          'imageUrl', step.image_url
        ) ORDER BY step.step_no, step.id)
        FROM recipe_steps step
        WHERE step.recipe_id = recipe.id
      ), '[]'::jsonb)
    ),
    recipe.created_at
  FROM recipes recipe
  WHERE NOT EXISTS (SELECT 1 FROM recipe_versions version WHERE version.recipe_id = recipe.id)
  RETURNING id, recipe_id, workflow_status
)
UPDATE recipes recipe
SET
  current_version_id = inserted_versions.id,
  published_version_id = CASE WHEN recipe.status = 'active' THEN inserted_versions.id ELSE recipe.published_version_id END,
  published_at = CASE WHEN recipe.status = 'active' THEN COALESCE(recipe.published_at, recipe.updated_at, recipe.created_at) ELSE recipe.published_at END
FROM inserted_versions
WHERE recipe.id = inserted_versions.recipe_id;

CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_version
  ON recipe_versions(recipe_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_workflow_status
  ON recipe_versions(workflow_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_current_version_id
  ON recipes(current_version_id);
CREATE INDEX IF NOT EXISTS idx_recipes_published_version_id
  ON recipes(published_version_id);

COMMIT;
