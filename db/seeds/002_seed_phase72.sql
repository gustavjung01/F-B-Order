BEGIN;

DO $$
BEGIN
  IF current_database() !~* '(test|phase72)' THEN
    RAISE EXCEPTION
      'Refusing to run Phase 7.2 test seed on database %',
      current_database();
  END IF;
END
$$;
INSERT INTO categories (
  name,
  slug,
  description,
  sort_order,
  is_active
)
VALUES (
  'PHASE 7.2 TEST',
  'phase72-test',
  'Danh mục chỉ dùng cho integration test Phase 7.2.',
  9998,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

WITH phase72_category AS (
  SELECT id
  FROM categories
  WHERE slug = 'phase72-test'
  LIMIT 1
)
INSERT INTO products (
  category_id,
  sku,
  name,
  slug,
  brand,
  description,
  short_description,
  unit,
  unit_label,
  package_spec,
  package_size,
  package_size_label,
  product_type,
  catalog_kind,
  source_key,
  source_confidence,
  source_status_raw,
  data_issues,
  base_price,
  wholesale_price,
  min_order_qty,
  stock_status,
  status,
  sort_order,
  is_active,
  is_public,
  is_orderable
)
SELECT
  phase72_category.id,
  'PHASE72-SMOKE-001',
  '[PHASE 7.2] Sản phẩm kiểm thử tạo đơn',
  'phase72-smoke-product',
  'PHASE 7.2 TEST',
  'Sản phẩm chỉ dùng cho integration test, không phải hàng bán thật.',
  'Kiểm tra approve, pricing, cart, order và status log.',
  'goi',
  'gói',
  '1 gói test',
  '1 gói',
  '1 gói',
  'physical',
  'sku_candidate',
  'phase72-test',
  'verified',
  'integration_test',
  '[]'::jsonb,
  12000,
  10000,
  1,
  'available',
  'active',
  1,
  true,
  true,
  true
FROM phase72_category
ON CONFLICT (sku) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  brand = EXCLUDED.brand,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  unit = EXCLUDED.unit,
  unit_label = EXCLUDED.unit_label,
  package_spec = EXCLUDED.package_spec,
  package_size = EXCLUDED.package_size,
  package_size_label = EXCLUDED.package_size_label,
  product_type = EXCLUDED.product_type,
  catalog_kind = EXCLUDED.catalog_kind,
  source_key = EXCLUDED.source_key,
  source_confidence = EXCLUDED.source_confidence,
  source_status_raw = EXCLUDED.source_status_raw,
  data_issues = EXCLUDED.data_issues,
  base_price = EXCLUDED.base_price,
  wholesale_price = EXCLUDED.wholesale_price,
  min_order_qty = EXCLUDED.min_order_qty,
  stock_status = EXCLUDED.stock_status,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_public = true,
  is_orderable = true,
  updated_at = now();

COMMIT;
