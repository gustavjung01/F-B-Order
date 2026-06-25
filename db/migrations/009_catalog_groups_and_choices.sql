-- Bếp Sỉ F&B - Catalog group taxonomy and non-pricing product choices
-- Additive migration. Existing catalog/cart/order rows remain valid.

BEGIN;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS catalog_group_key TEXT;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS choice_groups JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE catalog_products
  DROP CONSTRAINT IF EXISTS catalog_products_choice_groups_shape_check;
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_choice_groups_shape_check
  CHECK (jsonb_typeof(choice_groups) = 'array');

CREATE INDEX IF NOT EXISTS catalog_products_group_idx
  ON catalog_products(industry_key, catalog_group_key, sort_order)
  WHERE catalog_group_key IS NOT NULL;

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS selections JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS selection_key TEXT NOT NULL DEFAULT '';

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_selections_shape_check;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_selections_shape_check
  CHECK (jsonb_typeof(selections) = 'object');

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_selection_key_length_check;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_selection_key_length_check
  CHECK (length(selection_key) <= 500);

DROP INDEX IF EXISTS cart_items_cart_variant_unique;
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_selection_unique
  ON cart_items(cart_id, variant_id, selection_key)
  WHERE variant_id IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selection_snapshot JSONB;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_selection_snapshot_shape_check;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_selection_snapshot_shape_check
  CHECK (selection_snapshot IS NULL OR jsonb_typeof(selection_snapshot) = 'object');

-- Only classify the tea ingredient branch. Other industries are untouched.
UPDATE catalog_products
SET catalog_group_key = CASE
  WHEN product_key LIKE 'siro-%' OR lower(COALESCE(source_group, '')) = 'siro' THEN 'siro'
  WHEN product_key LIKE 'sinh-to-%' OR lower(COALESCE(source_group, '')) LIKE 'sinh tố%' THEN 'sinh-to'
  WHEN product_key LIKE 'sot-%' OR lower(COALESCE(source_group, '')) LIKE 'sôt topping%' THEN 'sot'
  WHEN product_key LIKE 'tran-chau-%' OR product_key LIKE 'tc-%' OR lower(COALESCE(source_group, '')) = 'trân châu' THEN 'tran-chau'
  WHEN product_key LIKE '3q-%' AND (product_key LIKE '%thach%' OR product_key LIKE '%thuy-tinh%') THEN 'thach-rau-cau'
  WHEN product_key LIKE '3q-%' OR lower(COALESCE(source_group, '')) LIKE '3q%' THEN '3q'
  WHEN product_key LIKE '%thach%' OR product_key LIKE '%rau-cau%' OR product_key LIKE '%thuy-tinh%' THEN 'thach-rau-cau'
  WHEN product_key LIKE '%flan%' OR product_key LIKE '%pudding%' THEN 'flan-pudding'
  WHEN product_key LIKE 'bot-sua-%' OR product_key LIKE '%kem-beo%' OR lower(COALESCE(source_group, '')) LIKE 'bột sữa%' THEN 'bot-sua-kem-beo'
  WHEN product_key LIKE '%milk-foam%' OR product_key LIKE '%kem-cheese%' OR product_key LIKE '%kem-trung%' OR product_key LIKE '%muoi-bien%' THEN 'milk-foam-kem-cheese'
  WHEN product_key LIKE 'bot-%' OR lower(COALESCE(source_group, '')) LIKE 'bột %' THEN 'bot-tao-vi'
  WHEN product_key LIKE 'sua-%' OR product_key LIKE '%whipping%' OR product_key LIKE '%ice-hot%' THEN 'sua-kem'
  WHEN product_key LIKE 'duong-%' OR lower(COALESCE(source_group, '')) LIKE 'đường đen%' THEN 'duong-chat-tao-ngot'
  WHEN product_key LIKE '%dao-lon%' OR product_key LIKE 'nhan-%' OR product_key LIKE '%vai-hop%' OR product_key LIKE '%nha-dam%' THEN 'trai-cay-hop'
  WHEN product_key LIKE 'tra-%' OR lower(COALESCE(source_group, '')) LIKE 'trà %' THEN 'tra'
  ELSE 'topping-khac'
END
WHERE industry_key = 'nguyen-lieu-tra-sua';

-- Price-driving options stay in catalog_variants. These flavor choices do not change price.
UPDATE catalog_products SET choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Dâu","Kiwi","Chanh dây","Phúc bồn tử","Dưa lưới","Vải","Cam","Việt quất","Táo xanh","Blue Curacao","Bạc hà","Sô-cô-la"]}]'::jsonb
WHERE product_key = 'siro-thai-pixe-bgkq-0002';

UPDATE catalog_products SET choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Dâu","Đào","Vải","Việt quất","Táo xanh","Xoài","Chanh dây"]}]'::jsonb
WHERE product_key = 'siro-thai-dingfong-bgkq-0003';

UPDATE catalog_products SET choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Dâu","Đào","Ổi hồng","Việt quất","Xoài","Nho","Kiwi","Chanh dây","Vải","Bạc hà","Blue Curacao","Sâm dứa"]}]'::jsonb
WHERE product_key = 'siro-mama-gold';

UPDATE catalog_products
SET option_groups = '[]'::jsonb,
    choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Trái cây nhiệt đới","Dâu","Đường đen"]}]'::jsonb
WHERE product_key = 'siro-gtp';

UPDATE catalog_products
SET option_groups = '[]'::jsonb,
    choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Dâu","Đào","Vải","Ổi","Việt quất","Phúc bồn tử","Bạc hà","Khoai môn","Blue Curacao","Sâm dứa","Dưa lưới","Kiwi","Táo xanh","Chanh dây","Xoài"]}]'::jsonb
WHERE product_key = 'siro-vina';

UPDATE catalog_products SET choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Chanh","Sâm dứa","Dưa lưới","Vải","Đào","Khoai môn","Cam","Dâu","Ổi","Việt quất","Chanh dây","Me","Mơ","Lựu"]}]'::jsonb
WHERE product_key = 'siro-carisa-bgkq-0010';

UPDATE catalog_products SET choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Dâu","Đào","Vải","Kiwi","Chanh dây","Phúc bồn tử","Blue Curacao","Việt quất","Xoài","Vỏ cam","Trà xanh"]}]'::jsonb
WHERE product_key = 'siro-changthai-bgkq-0011';

UPDATE catalog_products SET choice_groups = '[]'::jsonb
WHERE product_key = 'siro-dd-hoang-kim-bgkq-0013';

UPDATE catalog_products
SET name = 'Siro Douxian 2,5 kg',
    choice_groups = '[{"key":"flavor","name":"Vị","required":true,"values":["Dâu","Đào","Vải","Bạc hà","Chanh","Đường đen"]}]'::jsonb
WHERE product_key = 'siro-douxian-2l';

-- Audited package sizes. Existing prices and SKU identities remain unchanged.
UPDATE catalog_variants SET options = options || '{"size":"730 ml","package":"Thùng 12 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0002';
UPDATE catalog_variants SET options = options || '{"size":"760 ml","package":"Thùng 12 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0003';
UPDATE catalog_variants SET options = options || '{"size":"2 L","package":"Thùng 4 bình","sell_unit":"bình"}'::jsonb WHERE sku = 'BGKQ-0004';
UPDATE catalog_variants SET options = options || '{"size":"700 ml","package":"Thùng 12 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0005';
UPDATE catalog_variants SET options = (options - 'flavor_or_type') || '{"size":"930 ml","package":"Thùng 12 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0006';
UPDATE catalog_variants SET options = (options - 'flavor') || '{"size":"750 ml","package":"Thùng 12 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0008';
UPDATE catalog_variants SET options = options || '{"size":"500 ml (680 g)","package":"Thùng 24 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0010';
UPDATE catalog_variants SET options = options || '{"size":"1 L","package":"Thùng 15 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0011';
UPDATE catalog_variants SET options = options || '{"size":"2,5 kg","type":"Bình tròn","package":"Thùng 6 bình","sell_unit":"bình"}'::jsonb WHERE sku = 'BGKQ-0012';
UPDATE catalog_variants SET options = options || '{"size":"2 L","package":"Thùng 6 chai","sell_unit":"chai"}'::jsonb WHERE sku = 'BGKQ-0013';
UPDATE catalog_variants SET options = options || '{"size":"2,5 kg","type":"Bình vuông / Hoàng kim","package":"Thùng 6 bình","sell_unit":"bình"}'::jsonb WHERE sku = 'BGKQ-0014';

-- Old rows that encoded a higher/lower price by flavor are retired; the canonical size SKU owns pricing.
UPDATE catalog_variants
SET is_active = false, is_public = false, is_orderable = false, status = 'inactive', updated_at = now()
WHERE sku IN ('BGKQ-0007', 'BGKQ-0009');

COMMIT;
