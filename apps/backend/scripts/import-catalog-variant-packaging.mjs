import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
for (const envPath of [path.join(repoRoot, ".env"), path.join(repoRoot, "apps/backend/.env")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const filePath = path.resolve(process.cwd(), "catalog-variant-packaging-ready.json");
const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
const records = payload.records || [];
const apply = process.argv.includes("--apply");

if (payload.match_key !== "sku" || payload.apply_action !== "UPSERT_VARIANT_PACKAGING") {
  throw new Error("Unsupported packaging payload.");
}
if (records.length === 0) throw new Error("Packaging payload is empty.");
if (new Set(records.map((row) => row.sku)).size !== records.length) {
  throw new Error("Duplicate SKU in packaging payload.");
}

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

const client = await pool.connect();
try {
  const missingTable = await client.query("SELECT to_regclass('public.catalog_variant_packaging_specs') IS NULL AS missing");
  if (missingTable.rows[0].missing) throw new Error("Run migration 013_catalog_variant_packaging_specs.sql first.");

  const missing = await client.query(
    `SELECT p.sku
     FROM unnest($1::text[]) AS p(sku)
     LEFT JOIN catalog_variants v ON v.sku = p.sku
     WHERE v.id IS NULL`,
    [records.map((row) => row.sku)],
  );
  if (missing.rows.length > 0) {
    throw new Error(`Unknown SKU: ${missing.rows.map((row) => row.sku).join(", ")}`);
  }

  if (!apply) {
    console.log(JSON.stringify({
      status: "DRY_RUN_OK",
      records: records.length,
      note: "No catalog rows changed.",
    }, null, 2));
    process.exit(0);
  }

  await client.query("BEGIN");
  await client.query(
    `INSERT INTO catalog_variant_packaging_specs (
      variant_id, sell_unit, package_quantity, package_unit,
      net_quantity, net_unit, conversion_status, source,
      confidence, source_url, note, verified_by, verified_date, raw_source
    )
    SELECT
      v.id,
      x.sell_unit,
      x.package_quantity,
      x.package_unit,
      x.net_quantity,
      x.net_unit,
      x.conversion_status,
      x.source,
      x.confidence,
      x.source_url,
      x.note,
      x.verified_by,
      NULLIF(x.verified_date, '')::date,
      x.raw_source
    FROM jsonb_to_recordset($1::jsonb) AS x(
      sku text,
      sell_unit text,
      package_quantity numeric,
      package_unit text,
      net_quantity numeric,
      net_unit text,
      conversion_status text,
      source text,
      confidence text,
      source_url text,
      note text,
      verified_by text,
      verified_date text,
      raw_source jsonb
    )
    JOIN catalog_variants v ON v.sku = x.sku
    ON CONFLICT (variant_id) DO UPDATE SET
      sell_unit = EXCLUDED.sell_unit,
      package_quantity = EXCLUDED.package_quantity,
      package_unit = EXCLUDED.package_unit,
      net_quantity = EXCLUDED.net_quantity,
      net_unit = EXCLUDED.net_unit,
      conversion_status = EXCLUDED.conversion_status,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      source_url = EXCLUDED.source_url,
      note = EXCLUDED.note,
      verified_by = EXCLUDED.verified_by,
      verified_date = EXCLUDED.verified_date,
      raw_source = EXCLUDED.raw_source,
      updated_at = now()`,
    [JSON.stringify(records.map((row) => ({ ...row, raw_source: row })))],
  );
  await client.query("COMMIT");
  console.log(JSON.stringify({ status: "IMPORT_OK", records: records.length }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
