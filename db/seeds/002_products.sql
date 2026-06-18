INSERT INTO products (category_id, sku, name, description, unit, base_price, wholesale_price, min_order_qty, sort_order)
SELECT id, 'P001', 'Tran chau den 3Q', 'Topping pha che.', 'Goi 1kg', 48000, 42000, 1, 10
FROM categories WHERE slug = 'topping'
ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, unit = EXCLUDED.unit, base_price = EXCLUDED.base_price, wholesale_price = EXCLUDED.wholesale_price;

INSERT INTO products (category_id, sku, name, description, unit, base_price, wholesale_price, min_order_qty, sort_order)
SELECT id, 'P002', 'Bot sua Royal', 'Bot sua cho menu do uong.', 'Goi 1kg', 139000, 125000, 1, 20
FROM categories WHERE slug = 'tra-sua'
ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, unit = EXCLUDED.unit, base_price = EXCLUDED.base_price, wholesale_price = EXCLUDED.wholesale_price;

INSERT INTO products (category_id, sku, name, description, unit, base_price, wholesale_price, min_order_qty, sort_order)
SELECT id, 'P003', 'Siro Vani', 'Nguyen lieu pha che.', 'Chai 750ml', 82000, 72000, 1, 30
FROM categories WHERE slug = 'tra-sua'
ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, unit = EXCLUDED.unit, base_price = EXCLUDED.base_price, wholesale_price = EXCLUDED.wholesale_price;

INSERT INTO products (category_id, sku, name, description, unit, base_price, wholesale_price, min_order_qty, sort_order)
SELECT id, 'P004', 'Sua dac 380g', 'Nguyen lieu pha che.', 'Lon 380g', 32000, 28000, 1, 40
FROM categories WHERE slug = 'tra-sua'
ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, unit = EXCLUDED.unit, base_price = EXCLUDED.base_price, wholesale_price = EXCLUDED.wholesale_price;
