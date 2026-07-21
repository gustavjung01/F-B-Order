-- Bếp Sỉ F&B - AI read-only, draft, and approved action workflow
BEGIN;

CREATE TABLE IF NOT EXISTS ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('read_only', 'draft')),
  prompt TEXT NOT NULL,
  context_scope TEXT[] NOT NULL DEFAULT '{}'::text[],
  provider TEXT NOT NULL,
  model TEXT,
  response_text TEXT NOT NULL,
  response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  draft_type TEXT NOT NULL CHECK (draft_type IN ('recipe', 'customer_reply', 'catalog_copy', 'operations_note')),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  source_interaction_id UUID REFERENCES ai_interactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'archived')),
  reviewed_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_action_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  source_interaction_id UUID REFERENCES ai_interactions(id) ON DELETE SET NULL,
  source_draft_id UUID REFERENCES ai_drafts(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  required_permission_key TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'cancelled')),
  requested_reason TEXT NOT NULL,
  approved_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_note TEXT,
  executed_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_action_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_request_id UUID NOT NULL REFERENCES ai_action_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('requested', 'approved', 'rejected', 'executed', 'failed', 'cancelled')),
  actor_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_staff_created
  ON ai_interactions(staff_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_creator_status_created
  ON ai_drafts(created_by_staff_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_requests_status_created
  ON ai_action_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_events_request_created
  ON ai_action_events(action_request_id, created_at ASC);

CREATE OR REPLACE FUNCTION prevent_ai_action_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_action_events_append_only ON ai_action_events;
CREATE TRIGGER ai_action_events_append_only
BEFORE UPDATE OR DELETE ON ai_action_events
FOR EACH ROW EXECUTE FUNCTION prevent_ai_action_event_mutation();

COMMIT;
