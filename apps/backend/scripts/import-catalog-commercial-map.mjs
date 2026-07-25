import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import {
  buildCommercialOptions,
  buildCommercialRawSource,
  normalizeCatalogCommercialPayload,
  stableStringify,
} from "./catalog-commercial-map.mjs";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const backendRoot = path.resolve(here, "..");
for (const envPath of [path.join(repoRoot, ".env"), path.join(backendRoot, ".env"), path.join(backendRoot, ".env.local")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const arg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};
const assert = (condition, message, code = "CATALOG_COMMERCIAL_IMPORT_FAILED", details = undefined) => {
  if (condition) return;
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
};

const apply = process.argv.includes("--apply");
const rollbackBatchId = arg("rollback");
const allowRemoteApply = process.argv.includes("--allow-remote-apply");
const confirmHash = arg("confirm-hash");
const inputPath = path.resolve(arg(
  "file",
  path.join(repoRoot, "data/private/catalog-imports/kenh-quan-commercial-map.json"),
));

assert(!(apply && rollbackBatchId), "Choose either --apply or --rollback, not both.", "CATALOG_COMMERCIAL_MODE_INVALID");

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured.", "CATALOG_COMMERCIAL_DATABASE_URL_REQUIRED");
const targetUrl = new URL(connectionString);
const target = {
  host: targetUrl.hostname,
  port: targetUrl.port || "5432",
  database: targetUrl.pathname.replace(/^\//, ""),
};
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(target.host);
const writeMode = apply || Boolean(rollbackBatchId);
if (writeMode) {
  assert(
    localConnection || allowRemoteApply,
    "Refusing to modify a remote database. Use --allow-remote-apply only after backup and explicit approval.",
    "CATALOG_COMMERCIAL_REMOTE_WRITE_REFUSED",
  );
}

const pool = new Pool({
  connectionString,
  ssl: localConnection ? false : { rejectUnauthorized: false },
  max: 1,
});

function readPayload() {
  assert(fs.existsSync(inputPath), `Commercial map file is missing: ${inputPath}`, "CATALOG_COMMERCIAL_FILE_MISSING");
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
  return normalizeCatalogCommercialPayload(raw);
}

function iso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizePackagingRow(row) {
  if (!row) return null;
  return {
    sellUnit: row.sellUnit,
    packageQuantity: Number(row.packageQuantity),
    packageUnit: row.packageUnit,
    netQuantity: Number(row.netQuantity),
    netUnit: row.netUnit,
    conversionStatus: row.conversionStatus,
    source: row.source,
    confidence: row.confidence,
    sourceUrl: row.sourceUrl,
    note: row.note,
    verifiedBy: row.verifiedBy,
    verifiedDate: row.verifiedDate ? String(row.verifiedDate).slice(0, 10) : null,
    rawSource: row.rawSource || {},
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function assertBatchTable(client) {
  const result = await client.query("SELECT to_regclass('public.catalog_commercial_import_batches') AS table_name");
  assert(
    Boolean(result.rows[0]?.table_name),
    "Migration 030_catalog_commercial_import_batches.sql has not been applied.",
    "CATALOG_COMMERCIAL_BATCH_TABLE_MISSING",
  );
}

async function loadState(client, skus, { lock = false } = {}) {
  const variantResult = await client.query(
    `SELECT
       variant.id::text AS "variantId",
       variant.sku,
       variant.shop_price::float8 AS "shopPrice",
       variant.options,
       variant.price_mode AS "priceMode",
       variant.status AS "variantStatus",
       variant.is_active AS "isActive",
       variant.is_public AS "isPublic",
       variant.is_orderable AS "isOrderable",
       variant.catalog_version AS "catalogVersion",
       product.status AS "productStatus"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     WHERE variant.sku = ANY($1::text[])
     ORDER BY variant.sku
     ${lock ? "FOR UPDATE OF variant" : ""}`,
    [skus],
  );

  const variantIds = variantResult.rows.map((row) => row.variantId);
  const packagingResult = variantIds.length > 0
    ? await client.query(
      `SELECT
         variant_id::text AS "variantId",
         sell_unit AS "sellUnit",
         package_quantity::float8 AS "packageQuantity",
         package_unit AS "packageUnit",
         net_quantity::float8 AS "netQuantity",
         net_unit AS "netUnit",
         conversion_status AS "conversionStatus",
         source,
         confidence,
         source_url AS "sourceUrl",
         note,
         verified_by AS "verifiedBy",
         verified_date AS "verifiedDate",
         raw_source AS "rawSource",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM catalog_variant_packaging_specs
       WHERE variant_id = ANY($1::uuid[])
       ORDER BY variant_id
       ${lock ? "FOR UPDATE" : ""}`,
      [variantIds],
    )
    : { rows: [] };

  const packagingByVariant = new Map(packagingResult.rows.map((row) => [row.variantId, normalizePackagingRow(row)]));
  return variantResult.rows.map((variant) => ({
    variantId: variant.variantId,
    sku: variant.sku,
    shopPrice: variant.shopPrice === null ? null : Number(variant.shopPrice),
    options: variant.options || {},
    priceMode: variant.priceMode,
    variantStatus: variant.variantStatus,
    isActive: variant.isActive === true,
    isPublic: variant.isPublic === true,
    isOrderable: variant.isOrderable === true,
    catalogVersion: variant.catalogVersion,
    productStatus: variant.productStatus,
    packaging: packagingByVariant.get(variant.variantId) || null,
  }));
}

function analyze(payload, state) {
  const bySku = new Map(state.map((item) => [item.sku, item]));
  const missingSkus = [];
  const unavailableSkus = [];
  const nonFixedSkus = [];
  const nonOrderableSkus = [];
  let priceChangeCount = 0;
  let packagingCreateCount = 0;
  let packagingUpdateCount = 0;
  let unchangedCount = 0;

  for (const row of payload.rows) {
    const current = bySku.get(row.sku);
    if (!current) {
      missingSkus.push(row.sku);
      continue;
    }
    if (
      current.catalogVersion !== "hung-phat-v2"
      || current.productStatus !== "active"
      || !current.isActive
      || !current.isPublic
      || !["active", "market_price"].includes(current.variantStatus)
    ) {
      unavailableSkus.push(row.sku);
    }
    if (current.priceMode !== "fixed") nonFixedSkus.push(row.sku);
    if (!current.isOrderable) nonOrderableSkus.push(row.sku);

    const nextOptions = { ...current.options, ...buildCommercialOptions(row) };
    const nextPackaging = {
      sellUnit: row.sellUnit,
      packageQuantity: row.packageQuantity,
      packageUnit: row.packageUnit,
      netQuantity: row.netQuantity,
      netUnit: row.netUnit,
      conversionStatus: "verified",
      source: payload.sourceKey,
      confidence: "high",
      sourceUrl: null,
      note: "Imported from a private commercial map. Derived package price is reference-only.",
      verifiedBy: "catalog-commercial-import",
      verifiedDate: null,
      rawSource: buildCommercialRawSource(payload, row),
    };

    const priceChanged = current.shopPrice !== row.unitPrice;
    const optionsChanged = stableStringify(current.options) !== stableStringify(nextOptions);
    const packagingComparable = current.packaging ? {
      sellUnit: current.packaging.sellUnit,
      packageQuantity: current.packaging.packageQuantity,
      packageUnit: current.packaging.packageUnit,
      netQuantity: current.packaging.netQuantity,
      netUnit: current.packaging.netUnit,
      conversionStatus: current.packaging.conversionStatus,
      source: current.packaging.source,
      confidence: current.packaging.confidence,
      sourceUrl: current.packaging.sourceUrl,
      note: current.packaging.note,
      verifiedBy: current.packaging.verifiedBy,
      verifiedDate: current.packaging.verifiedDate,
      rawSource: current.packaging.rawSource,
    } : null;
    const packagingChanged = stableStringify(packagingComparable) !== stableStringify(nextPackaging);

    if (priceChanged) priceChangeCount += 1;
    if (!current.packaging) packagingCreateCount += 1;
    else if (packagingChanged) packagingUpdateCount += 1;
    if (!priceChanged && !optionsChanged && !packagingChanged) unchangedCount += 1;
  }

  const blockers = [...missingSkus, ...unavailableSkus, ...nonFixedSkus];
  return {
    rowCount: payload.rows.length,
    payloadHash: payload.payloadHash,
    sourceKey: payload.sourceKey,
    missingSkus,
    unavailableSkus,
    nonFixedSkus,
    nonOrderableSkus,
    priceChangeCount,
    packagingCreateCount,
    packagingUpdateCount,
    unchangedCount,
    canApply: blockers.length === 0,
  };
}

function snapshotForBatch(state) {
  return state.map((item) => ({
    variantId: item.variantId,
    sku: item.sku,
    shopPrice: item.shopPrice,
    options: item.options,
    packaging: item.packaging,
  }));
}

async function applyPayload(client, payload) {
  await assertBatchTable(client);
  assert(confirmHash, "--confirm-hash is required for --apply.", "CATALOG_COMMERCIAL_CONFIRM_HASH_REQUIRED");
  assert(
    confirmHash.toLowerCase() === payload.payloadHash,
    "--confirm-hash does not match payloadHash.",
    "CATALOG_COMMERCIAL_CONFIRM_HASH_MISMATCH",
    { confirmHash, payloadHash: payload.payloadHash },
  );

  const skus = payload.rows.map((row) => row.sku);
  const state = await loadState(client, skus, { lock: true });
  const report = analyze(payload, state);
  assert(report.canApply, "Commercial map has blockers and cannot be applied.", "CATALOG_COMMERCIAL_APPLY_BLOCKED", report);

  const existingBatch = await client.query(
    `SELECT id::text
     FROM catalog_commercial_import_batches
     WHERE source_hash = $1 AND status = 'applied'
     LIMIT 1`,
    [payload.payloadHash],
  );
  assert(!existingBatch.rows[0], "This payload hash is already applied.", "CATALOG_COMMERCIAL_ALREADY_APPLIED", {
    batchId: existingBatch.rows[0]?.id,
  });

  const beforeSnapshot = snapshotForBatch(state);
  const batchResult = await client.query(
    `INSERT INTO catalog_commercial_import_batches (
       source_key, source_hash, source_file, status, row_count, before_snapshot, summary
     ) VALUES ($1, $2, $3, 'applying', $4, $5::jsonb, $6::jsonb)
     RETURNING id::text`,
    [
      payload.sourceKey,
      payload.payloadHash,
      payload.sourceFile,
      payload.rows.length,
      JSON.stringify(beforeSnapshot),
      JSON.stringify(report),
    ],
  );
  const batchId = batchResult.rows[0].id;
  const stateBySku = new Map(state.map((item) => [item.sku, item]));

  for (const row of payload.rows) {
    const current = stateBySku.get(row.sku);
    assert(current, `SKU disappeared during apply: ${row.sku}`, "CATALOG_COMMERCIAL_VARIANT_DISAPPEARED");
    const options = buildCommercialOptions(row);
    await client.query(
      `UPDATE catalog_variants
       SET shop_price = $2,
           options = COALESCE(options, '{}'::jsonb) || $3::jsonb
       WHERE id = $1::uuid`,
      [current.variantId, row.unitPrice, JSON.stringify(options)],
    );

    await client.query(
      `INSERT INTO catalog_variant_packaging_specs (
         variant_id, sell_unit, package_quantity, package_unit, net_quantity, net_unit,
         conversion_status, source, confidence, source_url, note, verified_by,
         verified_date, raw_source
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6,
         'verified', $7, 'high', NULL, $8, 'catalog-commercial-import',
         CURRENT_DATE, $9::jsonb
       )
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
      [
        current.variantId,
        row.sellUnit,
        row.packageQuantity,
        row.packageUnit,
        row.netQuantity,
        row.netUnit,
        payload.sourceKey,
        "Imported from a private commercial map. Derived package price is reference-only.",
        JSON.stringify(buildCommercialRawSource(payload, row)),
      ],
    );
  }

  const afterState = await loadState(client, skus);
  const afterSnapshot = snapshotForBatch(afterState);
  await client.query(
    `UPDATE catalog_commercial_import_batches
     SET status = 'applied',
         after_snapshot = $2::jsonb,
         summary = $3::jsonb,
         applied_at = now()
     WHERE id = $1::uuid`,
    [batchId, JSON.stringify(afterSnapshot), JSON.stringify(report)],
  );

  return { batchId, report };
}

async function restorePackaging(client, variantId, packaging) {
  if (!packaging) {
    await client.query("DELETE FROM catalog_variant_packaging_specs WHERE variant_id = $1::uuid", [variantId]);
    return;
  }

  await client.query(
    `INSERT INTO catalog_variant_packaging_specs (
       variant_id, sell_unit, package_quantity, package_unit, net_quantity, net_unit,
       conversion_status, source, confidence, source_url, note, verified_by,
       verified_date, raw_source, created_at, updated_at
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13::date, $14::jsonb, $15::timestamptz, $16::timestamptz
     )
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
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [
      variantId,
      packaging.sellUnit,
      packaging.packageQuantity,
      packaging.packageUnit,
      packaging.netQuantity,
      packaging.netUnit,
      packaging.conversionStatus,
      packaging.source,
      packaging.confidence,
      packaging.sourceUrl,
      packaging.note,
      packaging.verifiedBy,
      packaging.verifiedDate,
      JSON.stringify(packaging.rawSource || {}),
      packaging.createdAt,
      packaging.updatedAt,
    ],
  );
}

async function rollbackBatch(client, batchId) {
  await assertBatchTable(client);
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId),
    "--rollback must be a batch UUID.",
    "CATALOG_COMMERCIAL_ROLLBACK_ID_INVALID",
  );

  const result = await client.query(
    `SELECT
       id::text,
       source_key AS "sourceKey",
       source_hash AS "sourceHash",
       status,
       before_snapshot AS "beforeSnapshot",
       after_snapshot AS "afterSnapshot"
     FROM catalog_commercial_import_batches
     WHERE id = $1::uuid
     FOR UPDATE`,
    [batchId],
  );
  const batch = result.rows[0];
  assert(batch, "Commercial import batch was not found.", "CATALOG_COMMERCIAL_BATCH_NOT_FOUND");
  assert(batch.status === "applied", "Only an applied batch can be rolled back.", "CATALOG_COMMERCIAL_BATCH_NOT_APPLIED", {
    status: batch.status,
  });
  assert(Array.isArray(batch.beforeSnapshot) && Array.isArray(batch.afterSnapshot), "Batch snapshots are invalid.", "CATALOG_COMMERCIAL_SNAPSHOT_INVALID");

  const skus = batch.afterSnapshot.map((item) => item.sku);
  const currentState = snapshotForBatch(await loadState(client, skus, { lock: true }));
  assert(
    stableStringify(currentState) === stableStringify(batch.afterSnapshot),
    "Current catalog state has diverged from this batch. Rollback refused to avoid overwriting newer changes.",
    "CATALOG_COMMERCIAL_ROLLBACK_STATE_DIVERGED",
  );

  for (const item of batch.beforeSnapshot) {
    await client.query(
      `UPDATE catalog_variants
       SET shop_price = $2,
           options = $3::jsonb
       WHERE id = $1::uuid`,
      [item.variantId, item.shopPrice, JSON.stringify(item.options || {})],
    );
    await restorePackaging(client, item.variantId, item.packaging);
  }

  await client.query(
    `UPDATE catalog_commercial_import_batches
     SET status = 'rolled_back', rolled_back_at = now()
     WHERE id = $1::uuid`,
    [batchId],
  );

  return {
    batchId,
    sourceKey: batch.sourceKey,
    sourceHash: batch.sourceHash,
    restoredRows: batch.beforeSnapshot.length,
  };
}

const client = await pool.connect();
try {
  if (rollbackBatchId) {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    const result = await rollbackBatch(client, rollbackBatchId);
    await client.query("COMMIT");
    console.log(JSON.stringify({
      status: "ROLLBACK_PASS",
      target,
      ...result,
    }, null, 2));
  } else {
    const payload = readPayload();
    if (!apply) {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = '30s'");
      const state = await loadState(client, payload.rows.map((row) => row.sku));
      const report = analyze(payload, state);
      await client.query("ROLLBACK");
      console.log(JSON.stringify({
        status: report.canApply ? "DRY_RUN_PASS" : "DRY_RUN_BLOCKED",
        applied: false,
        target,
        inputPath,
        report,
        note: "Read-only audit. No catalog row was inserted or updated.",
      }, null, 2));
      if (!report.canApply) process.exitCode = 2;
    } else {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '120s'");
      const result = await applyPayload(client, payload);
      await client.query("COMMIT");
      console.log(JSON.stringify({
        status: "IMPORT_PASS",
        applied: true,
        target,
        inputPath,
        payloadHash: payload.payloadHash,
        ...result,
        rollbackCommand: `pnpm catalog:commercial:rollback -- --rollback=${result.batchId}${localConnection ? "" : " --allow-remote-apply"}`,
      }, null, 2));
    }
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({
    status: "FAILED",
    code: error?.code || "CATALOG_COMMERCIAL_IMPORT_FAILED",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
  }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
