import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

for (const envPath of [path.join(repoRoot, ".env"), path.join(backendRoot, ".env"), path.join(backendRoot, ".env.local")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  max: 1,
});

async function runSqlFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const sql = fs.readFileSync(absolutePath, "utf8");
  console.log(`Running ${relativePath}`);
  await pool.query(sql);
}

async function normalizeLegacyCatalog() {
  console.log("Normalizing legacy catalog schema and rows");
  await pool.query(`
    BEGIN;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id);
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES categories(id);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_label TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS package_spec TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS package_size TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS package_size_label TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS origin TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS industry_group TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'physical';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_kind TEXT NOT NULL DEFAULT 'sku_candidate';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS use_cases JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_points JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS source_key TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS source_confidence TEXT NOT NULL DEFAULT 'needs_review';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS source_status_raw TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS data_issues JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price NUMERIC(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(14,2);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS min_order_qty INT NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_status TEXT NOT NULL DEFAULT 'available';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'needs_review';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_orderable BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    UPDATE categories SET created_at = COALESCE(created_at, now()), updated_at = COALESCE(updated_at, created_at, now());
    UPDATE products SET product_type = 'bundle', catalog_kind = 'bundle_candidate', is_orderable = false, updated_at = now()
      WHERE product_type::text = 'recipe_content' OR catalog_kind = 'content';
    UPDATE products SET catalog_kind = 'sku_candidate', status = 'inactive', is_active = false, is_public = false, is_orderable = false, updated_at = now()
      WHERE catalog_kind = 'category_scaffold';
    UPDATE products SET catalog_kind = CASE WHEN product_type::text = 'bundle' THEN 'bundle_candidate' ELSE 'sku_candidate' END,
      is_public = false, is_orderable = false, created_at = COALESCE(created_at, now()), updated_at = COALESCE(updated_at, created_at, now())
      WHERE catalog_kind IS NULL OR catalog_kind NOT IN ('sku_candidate', 'bundle_candidate');
    COMMIT;
  `);
}

async function normalizeLegacyOrders() {
  console.log("Normalizing legacy customer, core and order schema and rows");
  await pool.query(`
    BEGIN;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_name TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_name TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS area TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_code TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_group_id UUID REFERENCES price_groups(id);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_owner TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_owner_name TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_owner_phone TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE customers ALTER COLUMN approval_status DROP DEFAULT;
    ALTER TABLE customers ALTER COLUMN approval_status TYPE TEXT USING approval_status::text;
    ALTER TABLE customers ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE customers ALTER COLUMN status TYPE TEXT USING status::text;
    UPDATE customers SET
      name = COALESCE(NULLIF(name, ''), NULLIF(shop_name, ''), NULLIF(contact_name, ''), NULLIF(phone, ''), 'Legacy customer ' || id::text),
      approval_status = COALESCE(NULLIF(approval_status, ''), 'pending'),
      status = COALESCE(NULLIF(status, ''), 'active'),
      created_at = COALESCE(created_at, now()), updated_at = COALESCE(updated_at, created_at, now());
    ALTER TABLE customers ALTER COLUMN name SET NOT NULL;
    ALTER TABLE customers ALTER COLUMN approval_status SET DEFAULT 'pending';
    ALTER TABLE customers ALTER COLUMN status SET DEFAULT 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS customers_clerk_user_id_unique_idx ON customers(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_total NUMERIC(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    UPDATE orders SET subtotal = GREATEST(COALESCE(subtotal, total_amount, 0), 0),
      discount_total = LEAST(GREATEST(COALESCE(discount_total, 0), 0), GREATEST(COALESCE(subtotal, total_amount, 0), 0)),
      total_amount = GREATEST(COALESCE(total_amount, subtotal - discount_total, 0), 0),
      created_at = COALESCE(created_at, now()), updated_at = COALESCE(updated_at, created_at, now());
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,2);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,2);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(14,2);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    UPDATE order_items SET quantity = COALESCE(NULLIF(quantity, 0), 1), unit_price = GREATEST(COALESCE(unit_price, 0), 0), created_at = COALESCE(created_at, now());
    UPDATE order_items item SET name = COALESCE(item.name, item.product_name, product.name, item.sku, 'Legacy item ' || item.id::text)
      FROM products product WHERE item.product_id = product.id AND item.name IS NULL;
    UPDATE order_items SET name = COALESCE(name, product_name, sku, 'Legacy item ' || id::text),
      product_name = COALESCE(product_name, name, sku, 'Legacy item ' || id::text),
      line_total = round(unit_price * quantity, 2), total_price = round(unit_price * quantity, 2);
    ALTER TABLE order_status_logs ADD COLUMN IF NOT EXISTS from_status TEXT;
    ALTER TABLE order_status_logs ADD COLUMN IF NOT EXISTS to_status TEXT;
    ALTER TABLE order_status_logs ADD COLUMN IF NOT EXISTS changed_by_clerk_user_id TEXT;
    ALTER TABLE order_status_logs ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE order_status_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    UPDATE order_status_logs SET created_at = COALESCE(created_at, now());
    COMMIT;
  `);
}

try {
  await runSqlFile("db/migrations/001_init_core.sql");
  await normalizeLegacyCatalog();
  await runSqlFile("db/migrations/002_catalog_domain_boundary.sql");
  await normalizeLegacyOrders();
  await runSqlFile("db/migrations/003_core_order_contract.sql");
  console.log("Database migrations completed.");
} catch (error) {
  console.error("Database migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
