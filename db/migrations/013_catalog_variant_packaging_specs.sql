BEGIN;

CREATE TABLE IF NOT EXISTS catalog_variant_packaging_specs (
  variant_id UUID PRIMARY KEY REFERENCES catalog_variants(id) ON DELETE CASCADE,
  sell_unit TEXT NOT NULL,
  package_quantity NUMERIC(14,4) NOT NULL CHECK (package_quantity > 0),
  package_unit TEXT NOT NULL,
  net_quantity NUMERIC(14,4) NOT NULL CHECK (net_quantity > 0),
  net_unit TEXT NOT NULL,
  conversion_status TEXT NOT NULL DEFAULT 'verified',
  source TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'high'
    CHECK (confidence IN ('high', 'medium', 'low')),
  source_url TEXT,
  note TEXT,
  verified_by TEXT,
  verified_date DATE,
  raw_source JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(raw_source) = 'object')
);

CREATE INDEX IF NOT EXISTS catalog_variant_packaging_specs_unit_idx
  ON catalog_variant_packaging_specs(net_unit, sell_unit);

DROP TRIGGER IF EXISTS set_catalog_variant_packaging_specs_updated_at ON catalog_variant_packaging_specs;
CREATE TRIGGER set_catalog_variant_packaging_specs_updated_at
BEFORE UPDATE ON catalog_variant_packaging_specs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
