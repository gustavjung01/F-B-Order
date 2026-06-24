import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const repoRoot = path.resolve(backendRoot, "../..");

for (const envPath of [path.join(backendRoot, ".env"), path.join(backendRoot, ".env.local")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or BEPSI_DATABASE_URL is not configured in apps/backend/.env.");
}

const targetUrl = new URL(connectionString);
const target = {
  host: targetUrl.hostname,
  port: targetUrl.port || "5432",
  database: targetUrl.pathname.replace(/^\//, ""),
};

const pool = new Pool({
  connectionString,
  ssl: ["localhost", "127.0.0.1", "::1"].includes(target.host)
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");

  const identity = await client.query(`
    SELECT
      current_database() AS database,
      current_user AS database_user,
      inet_server_addr()::text AS server_address,
      inet_server_port()::int AS server_port
  `);
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM catalog_products WHERE catalog_version='hung-phat-v2' AND status='active')::int AS active_products,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND is_active)::int AS active_variants,
      (SELECT COUNT(*) FROM catalog_products WHERE catalog_version='hung-phat-v2')::int AS all_products,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2')::int AS all_variants
  `);

  const current = counts.rows[0];
  if (current.active_products !== 188 || current.active_variants !== 275) {
    throw new Error(`Refusing backup: expected current Bếp Sỉ catalog 188/275, found ${current.active_products}/${current.active_variants}.`);
  }

  const products = await client.query(`
    SELECT *
    FROM catalog_products
    WHERE catalog_version='hung-phat-v2'
    ORDER BY sort_order, product_key
  `);
  const variants = await client.query(`
    SELECT *
    FROM catalog_variants
    WHERE catalog_version='hung-phat-v2'
    ORDER BY sort_order, variant_key
  `);
  const prices = await client.query(`
    SELECT price.*
    FROM catalog_variant_prices price
    JOIN catalog_variants variant ON variant.id = price.variant_id
    WHERE variant.catalog_version='hung-phat-v2'
    ORDER BY price.variant_id, price.price_group_id, price.min_quantity
  `);

  await client.query("ROLLBACK");

  const createdAt = new Date();
  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(repoRoot, "backups", "catalog-v2");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `bepsi-heroku-catalog-v2-before-182-${stamp}.json`);

  const snapshot = {
    format: "bepsi-catalog-v2-snapshot-v1",
    createdAt: createdAt.toISOString(),
    source: {
      ...target,
      ...identity.rows[0],
    },
    counts: current,
    tables: {
      catalog_products: products.rows,
      catalog_variants: variants.rows,
      catalog_variant_prices: prices.rows,
    },
  };

  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.writeFileSync(outputPath, json, "utf8");
  const checksum = crypto.createHash("sha256").update(json).digest("hex");
  const stat = fs.statSync(outputPath);

  console.log(JSON.stringify({
    status: "CATALOG_BACKUP_PASS",
    readOnly: true,
    target,
    outputPath,
    sizeBytes: stat.size,
    sha256: checksum,
    counts: current,
    backedUpRows: {
      catalogProducts: products.rowCount,
      catalogVariants: variants.rowCount,
      catalogVariantPrices: prices.rowCount,
    },
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
