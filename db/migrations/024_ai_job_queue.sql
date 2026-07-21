-- Bếp Sỉ F&B - durable AI job queue
BEGIN;

CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  job_type TEXT NOT NULL CHECK (job_type IN ('read_only', 'draft')),
  prompt TEXT NOT NULL,
  context_scope TEXT[] NOT NULL DEFAULT '{}'::text[],
  context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_type TEXT CHECK (draft_type IN ('recipe', 'customer_reply', 'catalog_copy', 'operations_note')),
  draft_title TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  interaction_id UUID REFERENCES ai_interactions(id) ON DELETE SET NULL,
  draft_id UUID REFERENCES ai_drafts(id) ON DELETE SET NULL,
  response_text TEXT,
  provider TEXT,
  model TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (job_type <> 'draft' OR (draft_type IS NOT NULL AND draft_title IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_claim
  ON ai_jobs(status, available_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ai_jobs_staff_created
  ON ai_jobs(staff_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_locked
  ON ai_jobs(locked_at)
  WHERE status = 'processing';

COMMIT;
