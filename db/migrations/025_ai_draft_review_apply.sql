-- Bếp Sỉ F&B - review, approval, and controlled application for AI drafts
BEGIN;

INSERT INTO rbac_permissions(
  permission_key,module_key,action_key,description,risk_level,is_system
) VALUES(
  'ai.approve','ai','approve','Review and approve or reject AI drafts','high',true
)
ON CONFLICT(permission_key) DO UPDATE SET
  module_key=EXCLUDED.module_key,
  action_key=EXCLUDED.action_key,
  description=EXCLUDED.description,
  risk_level=EXCLUDED.risk_level,
  is_system=true,
  updated_at=now();

INSERT INTO rbac_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM rbac_roles role
JOIN rbac_permissions permission ON permission.permission_key='ai.approve'
WHERE role.role_key IN ('super_admin','recipe_publisher')
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE ai_drafts
  ADD COLUMN IF NOT EXISTS target_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS base_recipe_version_id UUID REFERENCES recipe_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_recipe_version_id UUID REFERENCES recipe_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ai_drafts
  DROP CONSTRAINT IF EXISTS ai_drafts_status_check;

ALTER TABLE ai_drafts
  ADD CONSTRAINT ai_drafts_status_check
  CHECK (status IN ('draft', 'approved', 'rejected', 'applied', 'archived'));

ALTER TABLE ai_drafts
  DROP CONSTRAINT IF EXISTS ai_drafts_apply_consistency_check;

ALTER TABLE ai_drafts
  ADD CONSTRAINT ai_drafts_apply_consistency_check
  CHECK (
    status <> 'applied'
    OR (
      applied_by_staff_id IS NOT NULL
      AND applied_at IS NOT NULL
      AND applied_recipe_version_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_ai_drafts_recipe_status_created
  ON ai_drafts(target_recipe_id, status, created_at DESC)
  WHERE draft_type = 'recipe';

CREATE INDEX IF NOT EXISTS idx_ai_drafts_review_queue
  ON ai_drafts(status, created_at DESC)
  WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS ai_draft_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES ai_drafts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('generated', 'approved', 'rejected', 'applied')),
  actor_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_draft_events_draft_created
  ON ai_draft_events(draft_id, created_at ASC);

DROP TRIGGER IF EXISTS ai_draft_events_append_only ON ai_draft_events;
CREATE TRIGGER ai_draft_events_append_only
BEFORE UPDATE OR DELETE ON ai_draft_events
FOR EACH ROW EXECUTE FUNCTION prevent_ai_action_event_mutation();

COMMIT;
