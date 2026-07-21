-- Bếp Sỉ F&B - append-only administrative audit log
BEGIN;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
  permission_key TEXT,
  reason TEXT,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_created
  ON admin_audit_logs(actor_staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource_created
  ON admin_audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_created
  ON admin_audit_logs(action_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_outcome_created
  ON admin_audit_logs(outcome, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_logs_append_only ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_append_only
BEFORE UPDATE OR DELETE ON admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();

COMMIT;
