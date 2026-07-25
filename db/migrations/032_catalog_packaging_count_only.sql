-- Bếp Sỉ F&B - support products sold by counted outer packaging
-- Example: tea sachets sold by box with 30 boxes/carton, where the source does
-- not publish a reliable net weight. Existing measured packaging remains intact.

BEGIN;

ALTER TABLE catalog_variant_packaging_specs
  ADD COLUMN IF NOT EXISTS measure_mode TEXT;

ALTER TABLE catalog_variant_packaging_specs
  ALTER COLUMN net_quantity DROP NOT NULL,
  ALTER COLUMN net_unit DROP NOT NULL;

UPDATE catalog_variant_packaging_specs
SET measure_mode = CASE
  WHEN net_quantity IS NULL AND net_unit IS NULL THEN 'count_only'
  ELSE 'measured'
END
WHERE measure_mode IS NULL
   OR measure_mode NOT IN ('measured', 'count_only');

ALTER TABLE catalog_variant_packaging_specs
  ALTER COLUMN measure_mode SET DEFAULT 'measured',
  ALTER COLUMN measure_mode SET NOT NULL;

CREATE OR REPLACE FUNCTION normalize_catalog_variant_packaging_measure_mode()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Compatibility for snapshots created before count-only support: a zero with
  -- no unit is treated as an absent measurement, never as a real weight.
  IF NEW.net_quantity = 0 AND (NEW.net_unit IS NULL OR BTRIM(NEW.net_unit) = '') THEN
    NEW.net_quantity := NULL;
  END IF;

  IF NEW.net_quantity IS NULL AND (NEW.net_unit IS NULL OR BTRIM(NEW.net_unit) = '') THEN
    NEW.net_unit := NULL;
    NEW.measure_mode := 'count_only';
  ELSE
    NEW.measure_mode := 'measured';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_catalog_variant_packaging_measure_mode_trigger
  ON catalog_variant_packaging_specs;
CREATE TRIGGER normalize_catalog_variant_packaging_measure_mode_trigger
BEFORE INSERT OR UPDATE OF net_quantity, net_unit, measure_mode
ON catalog_variant_packaging_specs
FOR EACH ROW EXECUTE FUNCTION normalize_catalog_variant_packaging_measure_mode();

ALTER TABLE catalog_variant_packaging_specs
  DROP CONSTRAINT IF EXISTS catalog_variant_packaging_specs_measure_mode_check;
ALTER TABLE catalog_variant_packaging_specs
  ADD CONSTRAINT catalog_variant_packaging_specs_measure_mode_check
  CHECK (measure_mode IN ('measured', 'count_only'));

ALTER TABLE catalog_variant_packaging_specs
  DROP CONSTRAINT IF EXISTS catalog_variant_packaging_specs_measure_fields_check;
ALTER TABLE catalog_variant_packaging_specs
  ADD CONSTRAINT catalog_variant_packaging_specs_measure_fields_check
  CHECK (
    (
      measure_mode = 'measured'
      AND net_quantity IS NOT NULL
      AND net_quantity > 0
      AND net_unit IS NOT NULL
      AND BTRIM(net_unit) <> ''
    )
    OR
    (
      measure_mode = 'count_only'
      AND net_quantity IS NULL
      AND net_unit IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS catalog_variant_packaging_specs_measure_mode_idx
  ON catalog_variant_packaging_specs(measure_mode);

COMMIT;
