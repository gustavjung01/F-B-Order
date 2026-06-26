CREATE TABLE IF NOT EXISTS ai_gateway_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  schema_version TEXT NOT NULL,
  use_case TEXT NOT NULL CHECK (
    use_case IN (
      'recipe_draft',
      'catalog_enrichment',
      'customer_support_draft',
      'operations_assistant'
    )
  ),
  provider TEXT NOT NULL CHECK (provider IN ('vertex_ai', 'mock')),
  model TEXT NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 200),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'customer', 'staff')),
  actor_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'rejected')),
  response_format TEXT NOT NULL CHECK (response_format IN ('text', 'json')),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  input_char_count INTEGER NOT NULL CHECK (input_char_count >= 0),
  output_char_count INTEGER CHECK (output_char_count >= 0),
  input_token_count INTEGER CHECK (input_token_count >= 0),
  output_token_count INTEGER CHECK (output_token_count >= 0),
  total_token_count INTEGER CHECK (total_token_count >= 0),
  latency_ms INTEGER CHECK (latency_ms >= 0),
  finish_reason TEXT,
  error_code TEXT,
  safety_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (actor_type = 'system' AND actor_id IS NULL)
    OR (actor_type IN ('customer', 'staff') AND NULLIF(btrim(actor_id), '') IS NOT NULL)
  ),
  CHECK (
    (status = 'started' AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed', 'rejected') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_runs_created_at
  ON ai_gateway_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_runs_use_case_status
  ON ai_gateway_runs (use_case, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_runs_actor
  ON ai_gateway_runs (actor_type, actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ai_gateway_runs_updated_at ON ai_gateway_runs;
CREATE TRIGGER trg_ai_gateway_runs_updated_at
BEFORE UPDATE ON ai_gateway_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE ai_gateway_runs IS
  'AI gateway audit metadata only. Raw prompts and model outputs must not be stored here.';
