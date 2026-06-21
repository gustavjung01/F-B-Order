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

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(backendRoot, ".env"),
  path.join(backendRoot, ".env.local"),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

async function runSqlFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const sql = fs.readFileSync(absolutePath, "utf8");
  console.log(`Running ${relativePath}`);
  await pool.query(sql);
}

async function normalizeLegacyCatalog() {
  console.log("Normalizing legacy catalog rows");
  await pool.query(`
    BEGIN;

    ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_kind TEXT NOT NULL DEFAULT 'sku_candidate';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_orderable BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

    UPDATE products
    SET
      product_type = 'bundle',
      catalog_kind = 'bundle_candidate',
      is_orderable = false,
      updated_at = now()
    WHERE product_type = 'recipe_content'
       OR catalog_kind = 'content';

    UPDATE products
    SET
      catalog_kind = 'sku_candidate',
      status = 'inactive',
      is_active = false,
      is_public = false,
      is_orderable = false,
      updated_at = now()
    WHERE catalog_kind = 'category_scaffold';

    UPDATE products
    SET
      catalog_kind = CASE
        WHEN product_type = 'bundle' THEN 'bundle_candidate'
        ELSE 'sku_candidate'
      END,
      is_public = false,
      is_orderable = false,
      updated_at = now()
    WHERE catalog_kind IS NULL
       OR catalog_kind NOT IN ('sku_candidate', 'bundle_candidate');

    COMMIT;
  `);
}

async function normalizeLegacyOrders() {
  console.log("Normalizing legacy order rows");
  await pool.query(`
    BEGIN;

    -- Some production databases were created from the early MVP schema while
    -- others already contain the canonical columns. Keep both shapes readable
    -- so the core order contract migration can be safely re-run.
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;

    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(14,2);
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2);

    ALTER TABLE order_status_logs
      ADD COLUMN IF NOT EXISTS changed_by_clerk_user_id TEXT;

    UPDATE order_items item
    SET name = COALESCE(
      item.name,
      item.product_name,
      product.name,
      item.sku,
      'Legacy item ' || item.id::text
    )
    FROM products product
    WHERE item.product_id = product.id
      AND item.name IS NULL;

    UPDATE order_items
    SET name = COALESCE(
      name,
      product_name,
      sku,
      'Legacy item ' || id::text
    )
    WHERE name IS NULL;

    UPDATE order_items
    SET
      line_total = COALESCE(line_total, total_price, round(unit_price * quantity, 2)),
      total_price = COALESCE(total_price, line_total, round(unit_price * quantity, 2));

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
