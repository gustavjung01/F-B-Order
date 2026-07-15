-- Bếp Sỉ F&B - Recipe yield unit and legacy version compatibility
-- Production inherited a narrow recipes_yield_unit_check that rejected valid
-- admin units such as "ly" and "mẻ". The application contract accepts trimmed
-- unit labels up to 80 characters and preserves legacy values, so the database
-- constraint must enforce the same boundary instead of a shorter enum.

BEGIN;

ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_yield_unit_check;

ALTER TABLE recipes
  ADD CONSTRAINT recipes_yield_unit_check
  CHECK (
    yield_unit IS NULL
    OR length(btrim(yield_unit)) BETWEEN 1 AND 80
  ) NOT VALID;

-- Some audited production databases still contain the legacy version_number
-- column as NOT NULL alongside the canonical version_no column. New code writes
-- version_no, so keep the immutable historical rows untouched and only relax the
-- obsolete write requirement for future inserts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipe_versions'
      AND column_name = 'version_number'
  ) THEN
    EXECUTE '
      ALTER TABLE recipe_versions
      ALTER COLUMN version_number DROP NOT NULL
    ';
  END IF;
END $$;

COMMIT;
