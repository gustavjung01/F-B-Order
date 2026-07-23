-- Bếp Sỉ F&B - Recipe R&D request, proposal, review, apply, and trial workflow
BEGIN;

INSERT INTO rbac_permissions(
  permission_key,module_key,action_key,description,risk_level,is_system
) VALUES
  ('recipe.rd.view','recipe_rd','view','View Recipe R&D requests, proposals, evaluations, and trial results','medium',true),
  ('recipe.rd.create','recipe_rd','create','Create AI-assisted Recipe R&D requests and proposals','high',true),
  ('recipe.rd.review','recipe_rd','review','Review and approve or reject Recipe R&D proposals','high',true),
  ('recipe.rd.apply','recipe_rd','apply','Apply an approved Recipe R&D proposal as a new draft Recipe Version','critical',true)
ON CONFLICT(permission_key) DO UPDATE SET
  module_key=EXCLUDED.module_key,
  action_key=EXCLUDED.action_key,
  description=EXCLUDED.description,
  risk_level=EXCLUDED.risk_level,
  is_system=true,
  updated_at=now();

WITH role_permission_map(role_key,permission_key) AS (
  VALUES
    ('super_admin','recipe.rd.view'),
    ('super_admin','recipe.rd.create'),
    ('super_admin','recipe.rd.review'),
    ('super_admin','recipe.rd.apply'),
    ('recipe_editor','recipe.rd.view'),
    ('recipe_editor','recipe.rd.create'),
    ('recipe_editor','recipe.rd.apply'),
    ('recipe_publisher','recipe.rd.view'),
    ('recipe_publisher','recipe.rd.review'),
    ('ai_operator','recipe.rd.view'),
    ('ai_operator','recipe.rd.create'),
    ('operations','recipe.rd.view'),
    ('auditor','recipe.rd.view')
)
INSERT INTO rbac_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM role_permission_map map
JOIN rbac_roles role ON role.role_key=map.role_key
JOIN rbac_permissions permission ON permission.permission_key=map.permission_key
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS recipe_rd_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  base_recipe_version_id UUID NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
  objective TEXT NOT NULL,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','generated','approved','rejected','applied','failed','cancelled')),
  ai_job_id UUID UNIQUE REFERENCES ai_jobs(id) ON DELETE SET NULL,
  ai_draft_id UUID UNIQUE REFERENCES ai_drafts(id) ON DELETE SET NULL,
  reviewed_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  applied_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  applied_recipe_version_id UUID REFERENCES recipe_versions(id) ON DELETE SET NULL,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(constraints) = 'object'),
  CHECK (
    status <> 'applied'
    OR (applied_by_staff_id IS NOT NULL AND applied_at IS NOT NULL AND applied_recipe_version_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS recipe_rd_trial_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_request_id UUID NOT NULL REFERENCES recipe_rd_requests(id) ON DELETE CASCADE,
  recorded_by_staff_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE RESTRICT,
  result_status TEXT NOT NULL DEFAULT 'planned'
    CHECK (result_status IN ('planned','passed','needs_changes','failed')),
  batch_quantity NUMERIC(14,3) CHECK (batch_quantity IS NULL OR batch_quantity > 0),
  batch_unit TEXT,
  sensory_score NUMERIC(5,2) CHECK (sensory_score IS NULL OR (sensory_score >= 0 AND sensory_score <= 10)),
  operational_score NUMERIC(5,2) CHECK (operational_score IS NULL OR (operational_score >= 0 AND operational_score <= 10)),
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((batch_quantity IS NULL) = (batch_unit IS NULL)),
  CHECK (jsonb_typeof(measurements) = 'object')
);

CREATE INDEX IF NOT EXISTS recipe_rd_requests_recipe_created_idx
  ON recipe_rd_requests(recipe_id,created_at DESC);
CREATE INDEX IF NOT EXISTS recipe_rd_requests_status_created_idx
  ON recipe_rd_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS recipe_rd_trial_results_request_created_idx
  ON recipe_rd_trial_results(rd_request_id,created_at DESC);

DROP TRIGGER IF EXISTS set_recipe_rd_requests_updated_at ON recipe_rd_requests;
CREATE TRIGGER set_recipe_rd_requests_updated_at
BEFORE UPDATE ON recipe_rd_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
