-- Bếp Sỉ F&B - DEV test seed
-- Purpose: verify DB + order flow only.
-- This file intentionally does NOT claim real catalog/product data.
-- Do not use these DEV TEST rows as sellable real products.

BEGIN;

INSERT INTO price_groups (code, name, description, is_default)
VALUES
  ('retail', 'Giá lẻ', 'Nhóm giá mặc định cho khách chưa phân nhóm', true),
  ('wholesale-test', 'Giá sỉ test', 'Nhóm giá dùng để kiểm thử tạo đơn', false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_default = EXCLUDED.is_default,
  updated_at = now();

WITH wholesale_group AS (
  SELECT id FROM price_groups WHERE code = 'wholesale-test' LIMIT 1
)
INSERT INTO customers (
  clerk_user_id,
  name,
  shop_name,
  contact_name,
  phone,
  address,
  area,
  price_group_id,
  approval_status,
  approval_decided_by_actor_type,
  approval_decided_by_actor_id,
  approval_decided_at,
  approval_note,
  status,
  note
)
SELECT
  'user_dev_test_customer',
  '[DEV TEST] Quán kiểm thử',
  '[DEV TEST] Quán kiểm thử',
  'Khách test',
  '0900000000',
  'Địa chỉ test - không giao thật',
  'dev-test',
  wholesale_group.id,
  'approved',
  'system',
  'system:dev-seed',
  now(),
  'Approved automatically for local seed verification.',
  'active',
  'Seed test để kiểm tra flow DB/order, không phải khách thật.'
FROM wholesale_group
ON CONFLICT DO NOTHING;

WITH wholesale_group AS (
  SELECT id FROM price_groups WHERE code = 'wholesale-test' LIMIT 1
)
UPDATE customers
SET
  name = '[DEV TEST] Quán kiểm thử',
  shop_name = '[DEV TEST] Quán kiểm thử',
  contact_name = 'Khách test',
  phone = '0900000000',
  address = 'Địa chỉ test - không giao thật',
  area = 'dev-test',
  price_group_id = wholesale_group.id,
  approval_status = 'approved',
  approval_decided_by_actor_type = 'system',
  approval_decided_by_actor_id = 'system:dev-seed',
  approval_decided_at = COALESCE(customers.approval_decided_at, now()),
  approval_note = 'Approved automatically for local seed verification.',
  status = 'active',
  note = 'Seed test để kiểm tra flow DB/order, không phải khách thật.',
  updated_at = now()
FROM wholesale_group
WHERE customers.clerk_user_id = 'user_dev_test_customer';

INSERT INTO customer_users (customer_id, clerk_user_id, role, is_primary)
SELECT id, 'user_dev_test_customer', 'customer', true
FROM customers
WHERE clerk_user_id = 'user_dev_test_customer'
ON CONFLICT (clerk_user_id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  role = EXCLUDED.role,
  is_primary = EXCLUDED.is_primary,
  updated_at = now();

INSERT INTO categories (name, slug, description, sort_order, is_active)
VALUES
  ('DEV TEST', 'dev-test', 'Danh mục chỉ dùng để kiểm thử DB/order.', 9999, true),
  ('Trà sữa pha chế', 'tra-sua-pha-che', 'Danh mục chính cho nguyên liệu trà sữa và pha chế.', 10, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

WITH dev_category AS (
  SELECT id FROM categories WHERE slug = 'dev-test' LIMIT 1
)
INSERT INTO products (
  category_id,
  sku,
  name,
  slug,
  brand,
  short_description,
  unit,
  unit_label,
  package_size,
  package_size_label,
  source_confidence,
  base_price,
  wholesale_price,
  min_order_qty,
  stock_status,
  status,
  is_active,
  tags
)
SELECT
  dev_category.id,
  'DEV-TEST-ORDER-001',
  '[DEV TEST] Sản phẩm kiểm thử tạo đơn',
  'dev-test-order-product',
  'DEV TEST',
  'Dòng test để kiểm tra schema và order flow, không phải sản phẩm bán thật.',
  'goi',
  'gói',
  '1 gói test',
  '1 gói test',
  'test_seed',
  10000,
  10000,
  1,
  'available',
  'active',
  true,
  '["dev-test"]'::jsonb
FROM dev_category
ON CONFLICT (sku) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  brand = EXCLUDED.brand,
  short_description = EXCLUDED.short_description,
  unit = EXCLUDED.unit,
  unit_label = EXCLUDED.unit_label,
  package_size = EXCLUDED.package_size,
  package_size_label = EXCLUDED.package_size_label,
  source_confidence = EXCLUDED.source_confidence,
  base_price = EXCLUDED.base_price,
  wholesale_price = EXCLUDED.wholesale_price,
  min_order_qty = EXCLUDED.min_order_qty,
  stock_status = EXCLUDED.stock_status,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  tags = EXCLUDED.tags,
  updated_at = now();

INSERT INTO product_aliases (product_id, alias)
SELECT id, 'dev test order'
FROM products
WHERE sku = 'DEV-TEST-ORDER-001'
ON CONFLICT (product_id, alias) DO NOTHING;

INSERT INTO product_prices (product_id, price_group_id, price, min_quantity)
SELECT products.id, price_groups.id, 10000, 1
FROM products
JOIN price_groups ON price_groups.code = 'wholesale-test'
WHERE products.sku = 'DEV-TEST-ORDER-001'
ON CONFLICT (product_id, price_group_id, min_quantity) DO UPDATE SET
  price = EXCLUDED.price,
  updated_at = now();

COMMIT;
