-- Bếp Sỉ F&B - RBAC foundation
BEGIN;

CREATE TABLE IF NOT EXISTS rbac_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL UNIQUE,
  module_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  description TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rbac_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES rbac_permissions(id) ON DELETE CASCADE,
  granted_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS staff_role_assignments (
  staff_user_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE RESTRICT,
  assigned_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  assignment_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (assignment_source IN ('migration', 'manual', 'system')),
  note TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  PRIMARY KEY (staff_user_id, role_id),
  CHECK (revoked_at IS NULL OR revoked_at >= assigned_at)
);

CREATE TABLE IF NOT EXISTS staff_role_assignment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('assigned', 'revoked', 'restored')),
  actor_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  reason TEXT,
  request_id TEXT,
  ip_address INET,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rbac_permissions_module_action
  ON rbac_permissions(module_key, action_key);

CREATE INDEX IF NOT EXISTS idx_rbac_role_permissions_permission
  ON rbac_role_permissions(permission_id, role_id);

CREATE INDEX IF NOT EXISTS idx_staff_role_assignments_active
  ON staff_role_assignments(staff_user_id, role_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_role_assignment_logs_staff_created
  ON staff_role_assignment_logs(staff_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_rbac_assignment_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_role_assignment_logs_append_only
  ON staff_role_assignment_logs;
CREATE TRIGGER staff_role_assignment_logs_append_only
BEFORE UPDATE OR DELETE ON staff_role_assignment_logs
FOR EACH ROW EXECUTE FUNCTION prevent_rbac_assignment_log_mutation();

INSERT INTO rbac_permissions (
  permission_key, module_key, action_key, description, risk_level, is_system
)
VALUES
  ('orders.view', 'orders', 'view', 'View orders', 'low', true),
  ('orders.update', 'orders', 'update', 'Update order operational state', 'high', true),
  ('orders.internal_notes', 'orders', 'internal_notes', 'View and edit internal order notes', 'medium', true),
  ('customers.view', 'customers', 'view', 'View customer profiles', 'medium', true),
  ('customers.update', 'customers', 'update', 'Update customer profile and approval state', 'high', true),
  ('catalog.view', 'catalog', 'view', 'View administrative catalog data', 'low', true),
  ('catalog.edit', 'catalog', 'edit', 'Create and edit catalog products and variants', 'high', true),
  ('catalog.publish', 'catalog', 'publish', 'Publish catalog products and variants', 'critical', true),
  ('catalog.pricing', 'catalog', 'pricing', 'Update catalog pricing', 'critical', true),
  ('recipes.view', 'recipes', 'view', 'View administrative and internal recipes', 'medium', true),
  ('recipes.edit', 'recipes', 'edit', 'Create and edit recipe drafts', 'high', true),
  ('recipes.review', 'recipes', 'review', 'Review recipe versions', 'high', true),
  ('recipes.publish', 'recipes', 'publish', 'Publish or unpublish recipes', 'critical', true),
  ('recipes.media.manage', 'recipes', 'media_manage', 'Manage recipe media', 'high', true),
  ('staff.view', 'staff', 'view', 'View staff and role assignments', 'high', true),
  ('staff.manage', 'staff', 'manage', 'Create, activate, deactivate, and update staff', 'critical', true),
  ('staff.roles.assign', 'staff', 'roles_assign', 'Assign and revoke staff roles', 'critical', true),
  ('audit.view', 'audit', 'view', 'View administrative audit logs', 'high', true),
  ('ai.use', 'ai', 'use', 'Use read-only AI features', 'medium', true),
  ('ai.execute', 'ai', 'execute', 'Allow AI draft and controlled actions', 'high', true),
  ('ai.configure', 'ai', 'configure', 'Configure AI models, prompts, tools, and policies', 'critical', true),
  ('ai.audit', 'ai', 'audit', 'View AI prompt and tool audit history', 'high', true)
ON CONFLICT (permission_key) DO UPDATE SET
  module_key = EXCLUDED.module_key,
  action_key = EXCLUDED.action_key,
  description = EXCLUDED.description,
  risk_level = EXCLUDED.risk_level,
  is_system = true,
  updated_at = now();

INSERT INTO rbac_roles (role_key, name, description, is_system, is_active)
VALUES
  ('super_admin', 'Super Admin', 'Full system access', true, true),
  ('operations', 'Operations', 'Order and customer operations', true, true),
  ('catalog_manager', 'Catalog Manager', 'Catalog, pricing, and publication management', true, true),
  ('recipe_editor', 'Recipe Editor', 'Recipe draft and media management', true, true),
  ('recipe_publisher', 'Recipe Publisher', 'Recipe review and publication', true, true),
  ('support', 'Support', 'Customer support and order lookup', true, true),
  ('ai_operator', 'AI Operator', 'Read-only AI and controlled AI actions', true, true),
  ('auditor', 'Auditor', 'Read-only operational and audit access', true, true)
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = true,
  is_active = true,
  updated_at = now();

WITH role_permission_map(role_key, permission_key) AS (
  VALUES
    ('operations', 'orders.view'),
    ('operations', 'orders.update'),
    ('operations', 'orders.internal_notes'),
    ('operations', 'customers.view'),
    ('operations', 'customers.update'),
    ('operations', 'catalog.view'),
    ('operations', 'recipes.view'),

    ('catalog_manager', 'catalog.view'),
    ('catalog_manager', 'catalog.edit'),
    ('catalog_manager', 'catalog.publish'),
    ('catalog_manager', 'catalog.pricing'),
    ('catalog_manager', 'recipes.view'),

    ('recipe_editor', 'catalog.view'),
    ('recipe_editor', 'recipes.view'),
    ('recipe_editor', 'recipes.edit'),
    ('recipe_editor', 'recipes.media.manage'),
    ('recipe_editor', 'ai.use'),

    ('recipe_publisher', 'catalog.view'),
    ('recipe_publisher', 'recipes.view'),
    ('recipe_publisher', 'recipes.review'),
    ('recipe_publisher', 'recipes.publish'),
    ('recipe_publisher', 'ai.use'),

    ('support', 'orders.view'),
    ('support', 'orders.internal_notes'),
    ('support', 'customers.view'),
    ('support', 'customers.update'),
    ('support', 'catalog.view'),
    ('support', 'recipes.view'),
    ('support', 'ai.use'),

    ('ai_operator', 'orders.view'),
    ('ai_operator', 'customers.view'),
    ('ai_operator', 'catalog.view'),
    ('ai_operator', 'recipes.view'),
    ('ai_operator', 'ai.use'),
    ('ai_operator', 'ai.execute'),

    ('auditor', 'orders.view'),
    ('auditor', 'orders.internal_notes'),
    ('auditor', 'customers.view'),
    ('auditor', 'catalog.view'),
    ('auditor', 'recipes.view'),
    ('auditor', 'staff.view'),
    ('auditor', 'audit.view'),
    ('auditor', 'ai.audit')
)
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM role_permission_map map
JOIN rbac_roles role ON role.role_key = map.role_key
JOIN rbac_permissions permission ON permission.permission_key = map.permission_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM rbac_roles role
CROSS JOIN rbac_permissions permission
WHERE role.role_key = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH legacy_assignments AS (
  SELECT
    staff.id AS staff_user_id,
    role.id AS role_id,
    CASE
      WHEN staff.role = 'admin' THEN 'Backfilled from legacy admin role'
      ELSE 'Backfilled from legacy staff role'
    END AS note
  FROM staff_users staff
  JOIN rbac_roles role
    ON role.role_key = CASE
      WHEN staff.role = 'admin' THEN 'super_admin'
      ELSE 'operations'
    END
)
INSERT INTO staff_role_assignments (
  staff_user_id, role_id, assignment_source, note
)
SELECT staff_user_id, role_id, 'migration', note
FROM legacy_assignments
ON CONFLICT (staff_user_id, role_id) DO UPDATE SET
  revoked_at = NULL,
  revoked_by_staff_id = NULL,
  assignment_source = 'migration',
  note = EXCLUDED.note;

INSERT INTO staff_role_assignment_logs (
  staff_user_id, role_id, action, actor_staff_id, reason, metadata
)
SELECT
  assignment.staff_user_id,
  assignment.role_id,
  'assigned',
  NULL,
  assignment.note,
  jsonb_build_object('source', 'migration', 'legacyRole', staff.role)
FROM staff_role_assignments assignment
JOIN staff_users staff ON staff.id = assignment.staff_user_id
WHERE assignment.assignment_source = 'migration'
  AND assignment.revoked_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM staff_role_assignment_logs log
    WHERE log.staff_user_id = assignment.staff_user_id
      AND log.role_id = assignment.role_id
      AND log.action = 'assigned'
      AND log.metadata ->> 'source' = 'migration'
  );

CREATE OR REPLACE VIEW staff_effective_permissions AS
SELECT DISTINCT
  assignment.staff_user_id,
  role.id AS role_id,
  role.role_key,
  permission.id AS permission_id,
  permission.permission_key,
  permission.module_key,
  permission.action_key,
  permission.risk_level
FROM staff_role_assignments assignment
JOIN rbac_roles role
  ON role.id = assignment.role_id
  AND role.is_active = true
JOIN rbac_role_permissions role_permission
  ON role_permission.role_id = role.id
JOIN rbac_permissions permission
  ON permission.id = role_permission.permission_id
WHERE assignment.revoked_at IS NULL;

COMMIT;
