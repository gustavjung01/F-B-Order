-- Bếp Sỉ F&B - reversible catalog group/SKU remap support
-- Additive schema only. No catalog row is remapped by this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS catalog_variant_sku_aliases (
  alias_sku TEXT PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES catalog_variants(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (BTRIM(alias_sku) <> ''),
  CHECK (BTRIM(source) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_variant_sku_aliases_lower_unique
  ON catalog_variant_sku_aliases (LOWER(alias_sku));

CREATE INDEX IF NOT EXISTS catalog_variant_sku_aliases_variant_idx
  ON catalog_variant_sku_aliases (variant_id);

CREATE TABLE IF NOT EXISTS catalog_group_remap_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  group_key TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applying'
    CHECK (status IN ('applying', 'applied', 'rolled_back')),
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (BTRIM(task_id) <> ''),
  CHECK (BTRIM(group_key) <> ''),
  CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(before_snapshot) = 'object'),
  CHECK (after_snapshot IS NULL OR jsonb_typeof(after_snapshot) = 'object'),
  CHECK (jsonb_typeof(summary) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_group_remap_batches_applied_hash_unique
  ON catalog_group_remap_batches (manifest_hash)
  WHERE status = 'applied';

CREATE INDEX IF NOT EXISTS catalog_group_remap_batches_task_created_idx
  ON catalog_group_remap_batches (task_id, created_at DESC);

COMMIT;
