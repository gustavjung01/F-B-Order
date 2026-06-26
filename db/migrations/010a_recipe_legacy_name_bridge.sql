-- Bếp Sỉ F&B - bridge the oldest Recipe schema that used recipes.name.
--
-- Some local databases predate the title-based Recipe draft schema and still
-- require recipes.name. Recipe Core writes recipes.title, so leaving the old
-- NOT NULL constraint in place blocks every new Recipe insert. Keep the legacy
-- column for compatibility, preserve its data, and synchronize both names.

BEGIN;

DO $bridge$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'name'
  ) THEN
    EXECUTE $sql$
      UPDATE recipes
      SET title = BTRIM(name::text)
      WHERE NULLIF(BTRIM(name::text), '') IS NOT NULL
        AND (
          NULLIF(BTRIM(title), '') IS NULL
          OR title = 'Công thức cũ ' || id::text
        )
    $sql$;

    EXECUTE 'ALTER TABLE recipes ALTER COLUMN name DROP NOT NULL';

    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION sync_recipe_legacy_name()
      RETURNS TRIGGER AS $function$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NULLIF(BTRIM(NEW.title), '') IS NULL THEN
            NEW.title := NULLIF(BTRIM(NEW.name::text), '');
          END IF;

          IF NULLIF(BTRIM(NEW.name::text), '') IS NULL THEN
            NEW.name := NEW.title;
          END IF;
        ELSE
          IF NEW.title IS DISTINCT FROM OLD.title THEN
            NEW.name := NEW.title;
          ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
            NEW.title := NEW.name;
          END IF;
        END IF;

        RETURN NEW;
      END;
      $function$ LANGUAGE plpgsql
    $sql$;

    EXECUTE 'DROP TRIGGER IF EXISTS sync_recipe_legacy_name_trigger ON recipes';
    EXECUTE $sql$
      CREATE TRIGGER sync_recipe_legacy_name_trigger
      BEFORE INSERT OR UPDATE OF title, name ON recipes
      FOR EACH ROW EXECUTE FUNCTION sync_recipe_legacy_name()
    $sql$;
  END IF;
END;
$bridge$;

COMMIT;
