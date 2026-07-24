-- Bếp Sỉ F&B - reversible private commercial map imports
-- Price payloads stay outside the public repository. This table stores the
-- before/after snapshots required for guarded rollback by batch ID.

BEGIN;

CREATE TABLE IF NOT EXISTS catalog_commercial_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_file TEXT,
  status TEXT NOT NULL DEFAULT 'applying'
    CHECK (status IN ('applying', 'applied', 'rolled_back')),
  row_count INT NOT NULL CHECK (row_count > 0),
  before_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  after_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(before_snapshot) = 'array'),
  CHECK (jsonb_typeof(after_snapshot) = 'array'),
  CHECK (jsonb_typeof(summary) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_commercial_import_batches_active_hash_idx
  ON catalog_commercial_import_batches(source_hash)
  WHERE status = 'applied';

CREATE INDEX IF NOT EXISTS catalog_commercial_import_batches_source_created_idx
  ON catalog_commercial_import_batches(source_key, created_at DESC);

DROP TRIGGER IF EXISTS set_catalog_commercial_import_batches_updated_at
  ON catalog_commercial_import_batches;
CREATE TRIGGER set_catalog_commercial_import_batches_updated_at
BEFORE UPDATE ON catalog_commercial_import_batches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
