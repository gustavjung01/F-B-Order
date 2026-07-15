-- Bếp Sỉ F&B - Recipe ingredient legacy name compatibility
-- Production retains a required legacy `name` column while the canonical admin
-- workflow writes `product_name`. Keep both representations synchronized without
-- weakening the production NOT NULL or non-blank constraints.

BEGIN;

-- Fresh databases gain the compatibility column so the normal Recipe workflow
-- integration test exercises the same shape as production. Existing production
-- databases already have this column, so this statement is a no-op there.
ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS name TEXT;

-- Preserve existing canonical labels when adopting the compatibility column.
UPDATE recipe_ingredients
SET name = product_name
WHERE name IS NULL
  AND NULLIF(btrim(product_name), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_recipe_ingredient_name_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NULLIF(btrim(NEW.product_name), '') IS NOT NULL THEN
      NEW.name := NEW.product_name;
    ELSIF NULLIF(btrim(NEW.name), '') IS NOT NULL THEN
      NEW.product_name := NEW.name;
    END IF;
  ELSE
    -- Prefer the side explicitly changed by the writer. Canonical application
    -- writes change product_name; older tools may still change name.
    IF NEW.product_name IS DISTINCT FROM OLD.product_name THEN
      NEW.name := NEW.product_name;
    ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
      NEW.product_name := NEW.name;
    ELSIF NEW.name IS NULL AND NEW.product_name IS NOT NULL THEN
      NEW.name := NEW.product_name;
    ELSIF NEW.product_name IS NULL AND NEW.name IS NOT NULL THEN
      NEW.product_name := NEW.name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_recipe_ingredient_name_columns
  ON recipe_ingredients;

CREATE TRIGGER sync_recipe_ingredient_name_columns
BEFORE INSERT OR UPDATE OF name, product_name
ON recipe_ingredients
FOR EACH ROW
EXECUTE FUNCTION sync_recipe_ingredient_name_columns();

COMMIT;
