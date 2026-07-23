-- Bếp Sỉ F&B - Phase 7 deterministic production planning permissions
BEGIN;

INSERT INTO rbac_permissions(
  permission_key,module_key,action_key,description,risk_level,is_system
) VALUES
  ('production.plan.view','production','plan_view','View deterministic multi-Recipe production plans, material requirements, and capacity warnings','medium',true),
  ('production.plan.analyze','production','plan_analyze','Run read-only AI explanations for deterministic production plans','medium',true)
ON CONFLICT(permission_key) DO UPDATE SET
  module_key=EXCLUDED.module_key,
  action_key=EXCLUDED.action_key,
  description=EXCLUDED.description,
  risk_level=EXCLUDED.risk_level,
  is_system=true,
  updated_at=now();

WITH role_permission_map(role_key,permission_key) AS (
  VALUES
    ('super_admin','production.plan.view'),
    ('super_admin','production.plan.analyze'),
    ('operations','production.plan.view'),
    ('operations','production.plan.analyze'),
    ('ai_operator','production.plan.view'),
    ('ai_operator','production.plan.analyze'),
    ('auditor','production.plan.view')
)
INSERT INTO rbac_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM role_permission_map map
JOIN rbac_roles role ON role.role_key=map.role_key
JOIN rbac_permissions permission ON permission.permission_key=map.permission_key
ON CONFLICT(role_id,permission_id) DO NOTHING;

COMMIT;
