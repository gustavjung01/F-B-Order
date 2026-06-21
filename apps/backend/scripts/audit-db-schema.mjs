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

const tables = [
  "price_groups",
  "customers",
  "customer_users",
  "staff_users",
  "categories",
  "products",
  "orders",
  "order_items",
  "order_status_logs",
];

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

try {
  const columns = await pool.query(
    `
      SELECT
        table_name,
        ordinal_position,
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
      ORDER BY table_name, ordinal_position
    `,
    ["public", tables],
  );

  const constraints = await pool.query(
    `
      SELECT
        cls.relname AS table_name,
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = $1
        AND cls.relname = ANY($2::text[])
      ORDER BY cls.relname, con.conname
    `,
    ["public", tables],
  );

  const enums = await pool.query(
    `
      SELECT DISTINCT
        typ.typname AS enum_name,
        enum.enumsortorder,
        enum.enumlabel
      FROM pg_type typ
      JOIN pg_enum enum ON enum.enumtypid = typ.oid
      JOIN pg_attribute attr ON attr.atttypid = typ.oid
      JOIN pg_class cls ON cls.oid = attr.attrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = $1
        AND cls.relname = ANY($2::text[])
        AND attr.attnum > 0
        AND NOT attr.attisdropped
      ORDER BY typ.typname, enum.enumsortorder
    `,
    ["public", tables],
  );

  const rowCounts = [];
  for (const table of tables) {
    const exists = columns.rows.some((column) => column.table_name === table);
    if (!exists) {
      rowCounts.push({ table, exists: false });
      continue;
    }

    const result = await pool.query(`SELECT count(*)::bigint AS count FROM public."${table}"`);
    rowCounts.push({
      table,
      exists: true,
      count: result.rows[0].count,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rowCounts,
    columns: columns.rows,
    constraints: constraints.rows,
    enums: enums.rows,
  };

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Database schema audit failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
