-- Legacy Heroku-style fixture based on the audited production differences.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE customer_approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE legacy_order_status AS ENUM (
  'draft',
  'pending',
  'submitted',
  'confirmed',
  'preparing',
  'delivering',
  'completed',
  'fulfilled',
  'cancelled'
);

CREATE TABLE price_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  shop_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  tax_code TEXT,
  business_type TEXT,
  note TEXT,
  sales_owner TEXT,
  approval_status customer_approval_status NOT NULL DEFAULT 'pending',
  rejected_reason TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
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

CREATE TABLE products (
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
  product_type TEXT NOT NULL DEFAULT 'physical'
    CHECK (product_type IN ('physical', 'bundle', 'recipe_content', 'service')),
  use_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  selling_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_confidence TEXT NOT NULL DEFAULT 'needs_review',
  base_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(14,2),
  min_order_qty INT NOT NULL DEFAULT 1,
  stock_status TEXT NOT NULL DEFAULT 'available',
  status TEXT NOT NULL DEFAULT 'needs_review',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status legacy_order_status NOT NULL DEFAULT 'submitted',
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

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(14,2) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  total_price NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status legacy_order_status,
  to_status legacy_order_status NOT NULL,
  changed_by_clerk_user_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO price_groups (code, name, is_default)
VALUES ('DEFAULT', 'Default wholesale', true);

INSERT INTO customers (
  clerk_user_id,
  shop_name,
  contact_name,
  phone,
  address,
  approval_status,
  approved_at,
  approved_by
) VALUES (
  'legacy-clerk-user',
  'Legacy Shop',
  'Legacy Contact',
  '0900000000',
  'Legacy address',
  'approved',
  now(),
  'legacy-admin'
);

INSERT INTO categories (name, slug, sort_order)
SELECT
  'Legacy Category ' || value,
  'legacy-category-' || value,
  value
FROM generate_series(1, 29) AS value;

INSERT INTO products (
  category_id,
  sku,
  name,
  slug,
  unit,
  product_type,
  base_price,
  wholesale_price,
  status,
  sort_order,
  is_active
)
SELECT
  category.id,
  'LEGACY-' || lpad(value::text, 3, '0'),
  'Legacy Product ' || value,
  'legacy-product-' || value,
  'unit',
  'physical',
  10000 + value,
  9000 + value,
  'active',
  value,
  true
FROM generate_series(1, 29) AS value
JOIN categories category ON category.slug = 'legacy-category-' || value;
