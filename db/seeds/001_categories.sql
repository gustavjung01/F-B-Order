INSERT INTO categories (name, slug, sort_order) VALUES
  ('Tra sua', 'tra-sua', 10),
  ('Mi cay', 'mi-cay', 20),
  ('Topping', 'topping', 30),
  ('Bao bi', 'bao-bi', 40),
  ('Combo', 'combo', 50)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;
