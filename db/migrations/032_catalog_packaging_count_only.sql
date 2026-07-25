-- Bếp Sỉ F&B - support products sold by counted outer packaging
-- Example: tea sachets sold by box with 30 boxes/carton, where the source does
-- not publish a reliable net weight. Existing measured packaging remains intact.

BEGIN;

ALTER TABLE catalog_variant_packaging_specs
  ADD COLUMN IF NOT EXISTS measure_mode TEXT NOT NULL DEFAULT 'measured';

ALTER TABLE catalog_variant_packaging_specs
  ALTER COLUMN net_quantity DROP NOT NULL,
  ALTER COLUMN net_unit DROP NOT NULL;

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
