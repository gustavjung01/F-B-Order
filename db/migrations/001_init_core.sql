-- Bếp Sỉ F&B - DB schema v1
-- Target: PostgreSQL / Heroku Postgres compatible
-- Safe to run more than once on a fresh/dev database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS price_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE,
  name TEXT NOT NULL,
  shop_name TEXT,
  contact_name TEXT,
  phone TEXT,
  address TEXT,
  area TEXT,
  tax_code TEXT,
  business_type TEXT,
  note TEXT,
  price_group_id UUID REFERENCES price_groups(id),
  sales_owner TEXT,
  sales_owner_name TEXT,
  sales_owner_phone TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  rejected_reason TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  clerk_user_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'owner', 'buyer')),
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  subcategory_id UUID REFERENCES categories(id),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  brand TEXT,
  description TEXT,
  short_description TEXT,
  unit TEXT,
  unit_label TEXT,
  package_spec TEXT,
  package_size TEXT,
  package_size_label TEXT,
  origin TEXT,
  image_url TEXT,
  industry_group TEXT,
  product_type TEXT NOT NULL DEFAULT 'physical' CHECK (product_type IN ('physical', 'bundle', 'recipe_content', 'service')),
  use_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  selling_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  base_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(14,2),
  min_order_qty INT NOT NULL DEFAULT 1,
  stock_status TEXT NOT NULL DEFAULT 'available' CHECK (stock_status IN ('available', 'out_of_stock', 'preorder', 'discontinued')),
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'active', 'draft', 'inactive')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, alias)
);

CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_group_id UUID NOT NULL REFERENCES price_groups(id) ON DELETE CASCADE,
  price NUMERIC(14,2) NOT NULL,
  min_quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, price_group_id, min_quantity)
);

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, status)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'pending', 'submitted', 'confirmed', 'preparing', 'delivering', 'completed', 'fulfilled', 'cancelled')),
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT,
  delivery_address TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  product_name TEXT,
  unit TEXT,
  quantity NUMERIC(14,2) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  line_total NUMERIC(14,2) NOT NULL,
  total_price NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_clerk_user_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  target_url TEXT,
  placement TEXT NOT NULL DEFAULT 'home',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  target_price_group_id UUID REFERENCES price_groups(id),
  target_area TEXT,
  created_by_clerk_user_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notification_id, customer_id)
);

CREATE TABLE IF NOT EXISTS onesignal_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  clerk_user_id TEXT,
  subscription_id TEXT UNIQUE NOT NULL,
  platform TEXT,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  recipe_category_id UUID REFERENCES recipe_categories(id),
  related_brand TEXT,
  cover_image_url TEXT,
  estimated_cost NUMERIC(14,2),
  suggested_price NUMERIC(14,2),
  source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'active', 'draft', 'inactive')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT,
  quantity NUMERIC(14,2),
  unit TEXT,
  note TEXT,
  optional BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, product_id)
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_no INT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, step_no)
);

-- Compatibility upgrades for DBs that already ran the old draft schema.
ALTER TABLE price_groups ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE price_groups ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE price_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE customers ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_owner TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_label TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS package_size_label TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE orders ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(14,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2);
ALTER TABLE order_items ALTER COLUMN product_name DROP NOT NULL;
UPDATE order_items SET name = COALESCE(name, product_name) WHERE name IS NULL;
UPDATE order_items SET line_total = COALESCE(line_total, total_price, unit_price * quantity) WHERE line_total IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_clerk_user_id_unique_idx ON customers(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_users_customer_id_idx ON customer_users(customer_id);
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories(parent_id);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON products(status, is_active);
CREATE INDEX IF NOT EXISTS product_aliases_alias_idx ON product_aliases(alias);
CREATE INDEX IF NOT EXISTS product_prices_product_id_idx ON product_prices(product_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS notifications_sent_at_idx ON notifications(sent_at);

DROP TRIGGER IF EXISTS set_price_groups_updated_at ON price_groups;
CREATE TRIGGER set_price_groups_updated_at BEFORE UPDATE ON price_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_customers_updated_at ON customers;
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_customer_users_updated_at ON customer_users;
CREATE TRIGGER set_customer_users_updated_at BEFORE UPDATE ON customer_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_staff_users_updated_at ON staff_users;
CREATE TRIGGER set_staff_users_updated_at BEFORE UPDATE ON staff_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_categories_updated_at ON categories;
CREATE TRIGGER set_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_products_updated_at ON products;
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_product_prices_updated_at ON product_prices;
CREATE TRIGGER set_product_prices_updated_at BEFORE UPDATE ON product_prices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_carts_updated_at ON carts;
CREATE TRIGGER set_carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_cart_items_updated_at ON cart_items;
CREATE TRIGGER set_cart_items_updated_at BEFORE UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_orders_updated_at ON orders;
CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_banners_updated_at ON banners;
CREATE TRIGGER set_banners_updated_at BEFORE UPDATE ON banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_onesignal_devices_updated_at ON onesignal_devices;
CREATE TRIGGER set_onesignal_devices_updated_at BEFORE UPDATE ON onesignal_devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_recipe_categories_updated_at ON recipe_categories;
CREATE TRIGGER set_recipe_categories_updated_at BEFORE UPDATE ON recipe_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_recipes_updated_at ON recipes;
CREATE TRIGGER set_recipes_updated_at BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
