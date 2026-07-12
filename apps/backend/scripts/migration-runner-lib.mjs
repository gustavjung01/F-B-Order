import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  BASELINE_MIGRATION_FILES,
  MIGRATION_FILES,
  MIGRATION_LOCK_KEYS,
} from "./migration-plan.mjs";

const LEDGER_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    execution_time_ms INTEGER NOT NULL CHECK (execution_time_ms >= 0),
    execution_mode TEXT NOT NULL DEFAULT 'executed'
      CHECK (execution_mode IN ('executed', 'baselined'))
  )
`;

export const ACCEPTED_LEGACY_CHECKSUMS = new Map([
  [
    "db/migrations/011_recipe_review_publish_versioning.sql",
    new Set(["6bd6ecf469081cba4112ee30c9e7dcb7c25655dda00f2c53b368b8e03f1cb91f"]),
  ],
]);

function normalizeSql(rawSql) {
  return rawSql.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

export function checksumSql(rawSql) {
  return createHash("sha256").update(normalizeSql(rawSql), "utf8").digest("hex");
}

export function stripOuterTransaction(rawSql) {
  const lines = normalizeSql(rawSql).split("\n");
  const significantIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0 && !line.startsWith("--"))
    .map(({ index }) => index);

  if (significantIndexes.length < 2) return lines.join("\n");

  const firstIndex = significantIndexes[0];
  const lastIndex = significantIndexes.at(-1);
  if (lines[firstIndex].trim().toUpperCase() !== "BEGIN;") return lines.join("\n");
  if (lines[lastIndex].trim().toUpperCase() !== "COMMIT;") return lines.join("\n");

  lines[firstIndex] = "";
  lines[lastIndex] = "";
  return lines.join("\n");
}

export function loadMigrations(repoRoot) {
  const seen = new Set();

  return MIGRATION_FILES.map((filename) => {
    if (seen.has(filename)) throw new Error(`Duplicate migration in plan: ${filename}`);
    seen.add(filename);

    const absolutePath = path.join(repoRoot, filename);
    if (!fs.existsSync(absolutePath)) throw new Error(`Migration file is missing: ${filename}`);

    const rawSql = fs.readFileSync(absolutePath, "utf8");
    return {
      filename,
      checksum: checksumSql(rawSql),
      sql: stripOuterTransaction(rawSql),
    };
  });
}

function selectBaselineMigrations(migrations) {
  const migrationsByFilename = new Map(migrations.map((migration) => [migration.filename, migration]));
  return BASELINE_MIGRATION_FILES.map((filename) => {
    const migration = migrationsByFilename.get(filename);
    if (!migration) throw new Error(`Baseline migration is missing from the plan: ${filename}`);
    return migration;
  });
}

async function ensureLedger(client) {
  await client.query(LEDGER_TABLE_SQL);
}

async function readLedger(client) {
  const result = await client.query(
    `SELECT filename, checksum, applied_at, execution_time_ms, execution_mode
     FROM schema_migrations
     ORDER BY applied_at, filename`,
  );
  return new Map(result.rows.map((row) => [row.filename, row]));
}

export function validateChecksums(migrations, applied) {
  for (const migration of migrations) {
    const ledgerRow = applied.get(migration.filename);
    if (!ledgerRow) continue;
    if (ledgerRow.checksum === migration.checksum) continue;

    const acceptedLegacyChecksums = ACCEPTED_LEGACY_CHECKSUMS.get(migration.filename);
    if (acceptedLegacyChecksums?.has(ledgerRow.checksum)) continue;

    throw new Error(
      `Checksum mismatch for applied migration ${migration.filename}: ` +
        `database=${ledgerRow.checksum} file=${migration.checksum}`,
    );
  }
}

async function assertExistingBaseline(client) {
  const requiredTables = [
    "price_groups",
    "customers",
    "categories",
    "products",
    "product_bundle_items",
    "orders",
    "order_items",
    "order_status_logs",
  ];

  const tableResult = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const presentTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !presentTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Cannot baseline: missing required tables: ${missingTables.join(", ")}`);
  }

  const requiredColumns = new Map([
    [
      "customers",
      [
        "name",
        "status",
        "approval_status",
        "approval_decided_by_actor_type",
        "approval_decided_by_actor_id",
        "approval_decided_at",
      ],
    ],
    [
      "orders",
      ["currency", "customer_note", "internal_note", "shipping_name", "shipping_phone", "shipping_address"],
    ],
    ["order_items", ["product_type", "bundle_snapshot", "snapshot_version"]],
    ["order_status_logs", ["actor_type", "actor_id"]],
  ]);

  const columnResult = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [[...requiredColumns.keys()]],
  );
  const columnsByTable = new Map();
  for (const row of columnResult.rows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Map());
    columnsByTable.get(row.table_name).set(row.column_name, row);
  }

  const missingColumns = [];
  for (const [table, columns] of requiredColumns) {
    const present = columnsByTable.get(table) ?? new Map();
    for (const column of columns) {
      if (!present.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }
  if (missingColumns.length > 0) {
    throw new Error(`Cannot baseline: missing required columns: ${missingColumns.join(", ")}`);
  }

  const customerApproval = columnsByTable.get("customers").get("approval_status");
  const orderStatus = columnsByTable.get("orders").get("status");
  const productId = columnsByTable.get("order_items").get("product_id");
  if (customerApproval?.data_type !== "text") {
    throw new Error("Cannot baseline: customers.approval_status must be TEXT");
  }
  if (orderStatus?.data_type !== "text") {
    throw new Error("Cannot baseline: orders.status must be TEXT");
  }
  if (!productId || productId.is_nullable !== "YES") {
    throw new Error("Cannot baseline: order_items.product_id must be nullable");
  }
}

async function baselineExisting(client, migrations, logger) {
  const applied = await readLedger(client);
  if (applied.size > 0) {
    throw new Error("Cannot baseline: schema_migrations is not empty");
  }

  await assertExistingBaseline(client);
  await client.query("BEGIN");
  try {
    for (const migration of migrations) {
      await client.query(
        `INSERT INTO schema_migrations
           (filename, checksum, execution_time_ms, execution_mode)
         VALUES ($1, $2, 0, 'baselined')`,
        [migration.filename, migration.checksum],
      );
      logger.log(`Baselined ${migration.filename}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function applyPending(client, migrations, logger) {
  let applied = await readLedger(client);
  validateChecksums(migrations, applied);

  for (const migration of migrations) {
    if (applied.has(migration.filename)) {
      logger.log(`Verified ${migration.filename}`);
      continue;
    }

    logger.log(`Running ${migration.filename}`);
    const startedAt = process.hrtime.bigint();
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      const elapsedMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      await client.query(
        `INSERT INTO schema_migrations
           (filename, checksum, execution_time_ms, execution_mode)
         VALUES ($1, $2, $3, 'executed')`,
        [migration.filename, migration.checksum, elapsedMs],
      );
      await client.query("COMMIT");
      logger.log(`Applied ${migration.filename} (${elapsedMs} ms)`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    applied = await readLedger(client);
  }
}

export async function runMigrations({ pool, repoRoot, baseline = false, logger = console }) {
  const client = await pool.connect();
  const migrations = loadMigrations(repoRoot);
  const [lockKeyA, lockKeyB] = MIGRATION_LOCK_KEYS;
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [lockKeyA, lockKeyB]);
    lockAcquired = true;
    await ensureLedger(client);

    if (baseline) {
      await baselineExisting(client, selectBaselineMigrations(migrations), logger);
    } else {
      await applyPending(client, migrations, logger);
    }
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT pg_advisory_unlock($1, $2)", [lockKeyA, lockKeyB])
        .catch(() => undefined);
    }
    client.release();
  }
}
