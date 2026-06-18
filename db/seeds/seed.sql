INSERT INTO price_groups (name, code)
VALUES
  ('Gia quan', 'retail_shop'),
  ('Gia dai ly', 'dealer'),
  ('Gia HoReCa', 'horeca')
ON CONFLICT (code) DO NOTHING;

INSERT INTO categories (name, slug, sort_order)
VALUES
  ('Tra sua', 'tra-sua', 10),
  ('Mi cay quan an', 'mi-cay-quan-an', 20),
  ('Hang khuyen mai', 'hang-khuyen-mai', 30)
ON CONFLICT (slug) DO NOTHING;
