ALTER TABLE ai_documents
  ADD COLUMN IF NOT EXISTS reviewed_by_staff_id UUID REFERENCES staff_users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS apply_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ai_document_review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_staff_id UUID NOT NULL REFERENCES staff_users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_documents_review_queue
  ON ai_documents(source, status, apply_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_document_review_logs_document_created
  ON ai_document_review_logs(document_id, created_at DESC);
