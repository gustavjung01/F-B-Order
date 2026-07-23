-- Bếp Sỉ F&B - kitchen capacity simulation foundation
BEGIN;

INSERT INTO rbac_permissions(
  permission_key,module_key,action_key,description,risk_level,is_system
) VALUES
  ('kitchen.capacity.view','kitchen','capacity_view','View kitchen capacity profiles and simulation results','medium',true),
  ('kitchen.capacity.manage','kitchen','capacity_manage','Configure kitchen stations, equipment, and Recipe Version capacity profiles','high',true)
ON CONFLICT(permission_key) DO UPDATE SET
  module_key=EXCLUDED.module_key,
  action_key=EXCLUDED.action_key,
  description=EXCLUDED.description,
  risk_level=EXCLUDED.risk_level,
  is_system=true,
  updated_at=now();

WITH role_permission_map(role_key,permission_key) AS (
  VALUES
    ('super_admin','kitchen.capacity.view'),
    ('super_admin','kitchen.capacity.manage'),
    ('operations','kitchen.capacity.view'),
    ('operations','kitchen.capacity.manage'),
    ('catalog_manager','kitchen.capacity.view'),
    ('ai_operator','kitchen.capacity.view'),
    ('auditor','kitchen.capacity.view')
)
INSERT INTO rbac_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM role_permission_map map
JOIN rbac_roles role ON role.role_key=map.role_key
JOIN rbac_permissions permission ON permission.permission_key=map.permission_key
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS kitchen_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parallel_slots INTEGER NOT NULL DEFAULT 1 CHECK (parallel_slots BETWEEN 1 AND 1000),
  available_workers INTEGER NOT NULL DEFAULT 1 CHECK (available_workers BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kitchen_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES kitchen_stations(id) ON DELETE CASCADE,
  equipment_key TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(station_id,equipment_key)
);

CREATE TABLE IF NOT EXISTS recipe_version_operation_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id UUID NOT NULL UNIQUE REFERENCES recipe_versions(id) ON DELETE CASCADE,
  batch_output_quantity NUMERIC(14,3) NOT NULL CHECK (batch_output_quantity > 0),
  batch_output_unit TEXT NOT NULL,
  setup_minutes NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (setup_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft','ready','inactive')),
  notes TEXT,
  created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  updated_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_version_operation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES recipe_version_operation_profiles(id) ON DELETE CASCADE,
  recipe_step_no INTEGER NOT NULL CHECK (recipe_step_no > 0),
  step_name TEXT NOT NULL,
  station_id UUID NOT NULL REFERENCES kitchen_stations(id) ON DELETE RESTRICT,
  equipment_id UUID REFERENCES kitchen_equipment(id) ON DELETE RESTRICT,
  cycle_minutes NUMERIC(10,3) NOT NULL CHECK (cycle_minutes > 0),
  labor_minutes NUMERIC(10,3) NOT NULL CHECK (labor_minutes >= 0 AND labor_minutes <= cycle_minutes),
  output_per_run NUMERIC(14,3) NOT NULL CHECK (output_per_run > 0),
  workers_required INTEGER NOT NULL DEFAULT 1 CHECK (workers_required BETWEEN 1 AND 1000),
  equipment_units_required INTEGER NOT NULL DEFAULT 0 CHECK (equipment_units_required BETWEEN 0 AND 1000),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id,recipe_step_no),
  CHECK ((equipment_id IS NULL AND equipment_units_required = 0) OR (equipment_id IS NOT NULL AND equipment_units_required > 0))
);

CREATE INDEX IF NOT EXISTS kitchen_stations_status_name_idx
  ON kitchen_stations(status,name);
CREATE INDEX IF NOT EXISTS kitchen_equipment_station_status_idx
  ON kitchen_equipment(station_id,status,name);
CREATE INDEX IF NOT EXISTS recipe_version_operation_profiles_status_idx
  ON recipe_version_operation_profiles(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS recipe_version_operation_steps_station_idx
  ON recipe_version_operation_steps(station_id,profile_id,sort_order);
CREATE INDEX IF NOT EXISTS recipe_version_operation_steps_equipment_idx
  ON recipe_version_operation_steps(equipment_id)
  WHERE equipment_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_kitchen_stations_updated_at ON kitchen_stations;
CREATE TRIGGER set_kitchen_stations_updated_at
BEFORE UPDATE ON kitchen_stations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_kitchen_equipment_updated_at ON kitchen_equipment;
CREATE TRIGGER set_kitchen_equipment_updated_at
BEFORE UPDATE ON kitchen_equipment
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recipe_version_operation_profiles_updated_at ON recipe_version_operation_profiles;
CREATE TRIGGER set_recipe_version_operation_profiles_updated_at
BEFORE UPDATE ON recipe_version_operation_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recipe_version_operation_steps_updated_at ON recipe_version_operation_steps;
CREATE TRIGGER set_recipe_version_operation_steps_updated_at
BEFORE UPDATE ON recipe_version_operation_steps
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
