-- Bếp Sỉ F&B - operational intelligence foundation for inventory and suppliers
BEGIN;

INSERT INTO rbac_permissions(
  permission_key,module_key,action_key,description,risk_level,is_system
) VALUES
  ('inventory.view','inventory','view','View inventory balances, reorder thresholds, and movement history','medium',true),
  ('suppliers.view','suppliers','view','View suppliers and supplier catalog offers','medium',true)
ON CONFLICT(permission_key) DO UPDATE SET
  module_key=EXCLUDED.module_key,
  action_key=EXCLUDED.action_key,
  description=EXCLUDED.description,
  risk_level=EXCLUDED.risk_level,
  is_system=true,
  updated_at=now();

WITH role_permission_map(role_key,permission_key) AS (
  VALUES
    ('super_admin','inventory.view'),
    ('super_admin','suppliers.view'),
    ('operations','inventory.view'),
    ('operations','suppliers.view'),
    ('catalog_manager','inventory.view'),
    ('catalog_manager','suppliers.view'),
    ('ai_operator','inventory.view'),
    ('ai_operator','suppliers.view'),
    ('auditor','inventory.view'),
    ('auditor','suppliers.view')
)
INSERT INTO rbac_role_permissions(role_id,permission_id)
SELECT role.id,permission.id
FROM role_permission_map map
JOIN rbac_roles role ON role.role_key=map.role_key
JOIN rbac_permissions permission ON permission.permission_key=map.permission_key
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','blocked')),
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  default_lead_time_days INTEGER
    CHECK (default_lead_time_days IS NULL OR default_lead_time_days >= 0),
  minimum_order_value NUMERIC(14,2)
    CHECK (minimum_order_value IS NULL OR minimum_order_value >= 0),
  currency TEXT NOT NULL DEFAULT 'VND'
    CHECK (char_length(currency) = 3),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_catalog_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  catalog_variant_id UUID NOT NULL REFERENCES catalog_variants(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  purchase_price NUMERIC(14,2) NOT NULL CHECK (purchase_price > 0),
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (char_length(currency) = 3),
  package_quantity NUMERIC(14,3)
    CHECK (package_quantity IS NULL OR package_quantity > 0),
  package_unit TEXT,
  minimum_order_quantity NUMERIC(14,3) NOT NULL DEFAULT 1
    CHECK (minimum_order_quantity > 0),
  lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id,catalog_variant_id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CHECK ((package_quantity IS NULL) = (package_unit IS NULL))
);

CREATE TABLE IF NOT EXISTS inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  catalog_variant_id UUID NOT NULL REFERENCES catalog_variants(id) ON DELETE CASCADE,
  on_hand_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
  reserved_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  available_quantity NUMERIC(14,3)
    GENERATED ALWAYS AS (on_hand_quantity - reserved_quantity) STORED,
  reorder_point NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  safety_stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  unit TEXT NOT NULL DEFAULT 'package',
  last_counted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(location_id,catalog_variant_id),
  CHECK (reserved_quantity <= on_hand_quantity)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  catalog_variant_id UUID NOT NULL REFERENCES catalog_variants(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('receipt','issue','adjustment','reservation','release','transfer_in','transfer_out')),
  quantity_delta NUMERIC(14,3) NOT NULL CHECK (quantity_delta <> 0),
  unit TEXT NOT NULL DEFAULT 'package',
  reference_type TEXT,
  reference_id TEXT,
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_status_name_idx
  ON suppliers(status,name);
CREATE INDEX IF NOT EXISTS supplier_catalog_offers_variant_price_idx
  ON supplier_catalog_offers(catalog_variant_id,is_active,purchase_price);
CREATE INDEX IF NOT EXISTS inventory_balances_variant_idx
  ON inventory_balances(catalog_variant_id,available_quantity,reorder_point);
CREATE INDEX IF NOT EXISTS inventory_movements_variant_occurred_idx
  ON inventory_movements(catalog_variant_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_location_occurred_idx
  ON inventory_movements(location_id,occurred_at DESC);

DROP TRIGGER IF EXISTS set_suppliers_updated_at ON suppliers;
CREATE TRIGGER set_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_supplier_catalog_offers_updated_at ON supplier_catalog_offers;
CREATE TRIGGER set_supplier_catalog_offers_updated_at
BEFORE UPDATE ON supplier_catalog_offers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_inventory_locations_updated_at ON inventory_locations;
CREATE TRIGGER set_inventory_locations_updated_at
BEFORE UPDATE ON inventory_locations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_inventory_balances_updated_at ON inventory_balances;
CREATE TRIGGER set_inventory_balances_updated_at
BEFORE UPDATE ON inventory_balances
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION prevent_inventory_movement_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_movements_append_only ON inventory_movements;
CREATE TRIGGER inventory_movements_append_only
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();

COMMIT;
