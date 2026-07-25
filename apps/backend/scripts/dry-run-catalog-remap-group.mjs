import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const backendRoot = path.resolve(here, "..");

for (const envPath of [path.join(repoRoot, ".env"), path.join(backendRoot, ".env"), path.join(backendRoot, ".env.local")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function fail(message, code = "CATALOG_REMAP_DRY_RUN_FAILED", details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function assert(condition, message, code, details = undefined) {
  if (!condition) fail(message, code, details);
}

function readJson(filePath, label) {
  assert(filePath && fs.existsSync(filePath), `${label} is missing: ${filePath}`, "CATALOG_REMAP_FILE_MISSING", { filePath, label });
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function csvCell(value) {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function targetPackaging(row) {
  return {
    sellUnit: clean(row.sellUnit),
    packageQuantity: positiveNumber(row.packageQuantity),
    packageUnit: clean(row.packageUnit),
    netQuantity: positiveNumber(row.netQuantity),
    netUnit: clean(row.netUnit),
  };
}

function currentPackaging(row) {
  if (!row?.packagingSellUnit) return null;
  return {
    sellUnit: clean(row.packagingSellUnit),
    packageQuantity: positiveNumber(row.packagingPackageQuantity),
    packageUnit: clean(row.packagingPackageUnit),
    netQuantity: positiveNumber(row.packagingNetQuantity),
    netUnit: clean(row.packagingNetUnit),
    confidence: row.packagingConfidence || null,
  };
}

function samePackaging(left, right) {
  if (!left || !right) return false;
  return normalize(left.sellUnit) === normalize(right.sellUnit)
    && Number(left.packageQuantity) === Number(right.packageQuantity)
    && normalize(left.packageUnit) === normalize(right.packageUnit)
    && Number(left.netQuantity) === Number(right.netQuantity)
    && normalize(left.netUnit) === normalize(right.netUnit);
}

function targetOptions(current, expected) {
  return {
    ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
    type: expected.type,
    size: `${expected.netQuantity}${expected.netUnit}`,
    package: `${expected.packageUnit} ${expected.packageQuantity} ${expected.sellUnit}`,
    sell_unit: expected.sellUnit,
  };
}

function countByVariant(rows, key = "variantId") {
  return new Map(rows.map((row) => [String(row[key]), Number(row.count) || 0]));
}

const manifestPath = path.resolve(argument("manifest", path.join(repoRoot, "data/catalog-remap/tea-novia.json")));
const commercialArg = argument("commercial-file");
assert(commercialArg, "--commercial-file is required.", "CATALOG_REMAP_COMMERCIAL_FILE_REQUIRED");
const commercialPath = path.resolve(commercialArg);
const outputJsonPath = path.resolve(argument("output-json", path.join(repoRoot, "artifacts/catalog-remap/tea-novia-dry-run.json")));
const outputCsvPath = path.resolve(argument("output-csv", path.join(repoRoot, "artifacts/catalog-remap/tea-novia-dry-run.csv")));

const manifest = readJson(manifestPath, "Remap manifest");
const commercial = readJson(commercialPath, "Commercial payload");
assert(manifest.schemaVersion === 1, "Unsupported remap manifest schema.", "CATALOG_REMAP_SCHEMA_UNSUPPORTED");
assert(Array.isArray(manifest.rows) && manifest.rows.length > 0, "Remap manifest has no rows.", "CATALOG_REMAP_ROWS_MISSING");
assert(manifest.auditVerification?.status === "AUDIT_PASS", "Manifest has not passed audit review.", "CATALOG_REMAP_AUDIT_NOT_APPROVED");
assert(manifest.auditVerification?.productionModified === false, "Audit verification must confirm production was not modified.", "CATALOG_REMAP_AUDIT_STATE_INVALID");

const legacySkus = manifest.rows.map((row) => clean(row.legacySku));
const canonicalSkus = manifest.rows.map((row) => clean(row.canonicalSku));
assert(new Set(legacySkus).size === legacySkus.length, "Duplicate legacy SKU in manifest.", "CATALOG_REMAP_DUPLICATE_LEGACY_SKU");
assert(new Set(canonicalSkus).size === canonicalSkus.length, "Duplicate canonical SKU in manifest.", "CATALOG_REMAP_DUPLICATE_CANONICAL_SKU");
assert(manifest.rows.some((row) => row.legacySku === manifest.targetParent?.survivorLegacySku), "Survivor legacy SKU is not in manifest.", "CATALOG_REMAP_SURVIVOR_MISSING");

const commercialByLegacySku = new Map((commercial.rows || []).map((row) => [clean(row.sku), row]));
const manifestHash = sha256(manifest);
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured.", "CATALOG_REMAP_DATABASE_URL_REQUIRED");
const targetUrl = new URL(connectionString);
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname);
const pool = new Pool({
  connectionString,
  ssl: localConnection ? false : { rejectUnauthorized: false },
  max: 1,
});

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '45s'");

  const variantResult = await client.query(
    `SELECT
       product.id::text AS "productId",
       product.product_key AS "productKey",
       product.name AS "productName",
       product.brand,
       product.industry,
       product.industry_key AS "industryKey",
       product.catalog_group_key AS "catalogGroupKey",
       product.subcategory,
       product.option_groups AS "optionGroups",
       product.cover_image_key AS "coverImageKey",
       product.cover_image_object_key AS "coverImageObjectKey",
       product.status AS "productStatus",
       variant.id::text AS "variantId",
       variant.variant_key AS "variantKey",
       variant.sku,
       variant.name AS "variantName",
       variant.options,
       variant.shop_price::float8 AS "shopPrice",
       variant.price_mode AS "priceMode",
       variant.status AS "variantStatus",
       variant.is_active AS "isActive",
       variant.is_public AS "isPublic",
       variant.is_orderable AS "isOrderable",
       variant.image_key AS "imageKey",
       variant.image_object_key AS "imageObjectKey",
       packaging.sell_unit AS "packagingSellUnit",
       packaging.package_quantity::float8 AS "packagingPackageQuantity",
       packaging.package_unit AS "packagingPackageUnit",
       packaging.net_quantity::float8 AS "packagingNetQuantity",
       packaging.net_unit AS "packagingNetUnit",
       packaging.confidence AS "packagingConfidence"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     LEFT JOIN catalog_variant_packaging_specs packaging ON packaging.variant_id = variant.id
     WHERE variant.sku = ANY($1::text[])
     ORDER BY variant.sku, variant.id`,
    [[...legacySkus, ...canonicalSkus]],
  );

  const rowsBySku = new Map();
  for (const row of variantResult.rows) {
    const rows = rowsBySku.get(row.sku) || [];
    rows.push(row);
    rowsBySku.set(row.sku, rows);
  }

  const survivorMatches = rowsBySku.get(manifest.targetParent.survivorLegacySku) || [];
  const survivor = survivorMatches.length === 1 ? survivorMatches[0] : null;
  const variantIds = manifest.rows.flatMap((expected) => {
    const matches = rowsBySku.get(expected.legacySku) || [];
    return matches.length === 1 ? [matches[0].variantId] : [];
  });
  const sourceProductIds = manifest.rows.flatMap((expected) => {
    const matches = rowsBySku.get(expected.legacySku) || [];
    return matches.length === 1 ? [matches[0].productId] : [];
  });

  const schemaResult = await client.query(
    `SELECT
       to_regclass('public.catalog_variant_sku_aliases')::text AS "aliasTable",
       to_regclass('public.catalog_group_remap_batches')::text AS "batchTable"`,
  );
  const schema = schemaResult.rows[0] || {};

  const parentCollisionResult = await client.query(
    `SELECT id::text AS "productId", product_key AS "productKey", name
     FROM catalog_products
     WHERE product_key = $1`,
    [manifest.targetParent.productKey],
  );

  const [cartResult, orderResult, recipeResult, priceResult, packagingResult] = variantIds.length > 0
    ? await Promise.all([
      client.query(
        `SELECT variant_id::text AS "variantId", COUNT(*)::int AS count
         FROM cart_items WHERE variant_id = ANY($1::uuid[]) GROUP BY variant_id`,
        [variantIds],
      ),
      client.query(
        `SELECT variant_id::text AS "variantId", COUNT(*)::int AS count
         FROM order_items WHERE variant_id = ANY($1::uuid[]) GROUP BY variant_id`,
        [variantIds],
      ),
      client.query(
        `SELECT
           id::text AS "ingredientId",
           catalog_variant_id::text AS "variantId",
           catalog_product_id::text AS "productId",
           catalog_snapshot AS snapshot
         FROM recipe_ingredients
         WHERE catalog_variant_id = ANY($1::uuid[])
         ORDER BY id`,
        [variantIds],
      ),
      client.query(
        `SELECT variant_id::text AS "variantId", COUNT(*)::int AS count
         FROM catalog_variant_prices WHERE variant_id = ANY($1::uuid[]) GROUP BY variant_id`,
        [variantIds],
      ),
      client.query(
        `SELECT variant_id::text AS "variantId", COUNT(*)::int AS count
         FROM catalog_variant_packaging_specs WHERE variant_id = ANY($1::uuid[]) GROUP BY variant_id`,
        [variantIds],
      ),
    ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }];

  const cartCounts = countByVariant(cartResult.rows);
  const orderCounts = countByVariant(orderResult.rows);
  const priceCounts = countByVariant(priceResult.rows);
  const packagingCounts = countByVariant(packagingResult.rows);
  const recipesByVariant = new Map();
  for (const row of recipeResult.rows) {
    const rows = recipesByVariant.get(row.variantId) || [];
    rows.push(row);
    recipesByVariant.set(row.variantId, rows);
  }

  const globalBlockers = [];
  if (!survivor) globalBlockers.push("survivor_variant_not_unique");
  if (new Set(variantIds).size !== manifest.rows.length) globalBlockers.push("legacy_variants_not_unique");
  if (new Set(sourceProductIds).size !== manifest.rows.length) globalBlockers.push("legacy_products_not_one_per_source_row");
  const conflictingParent = parentCollisionResult.rows.find((row) => !survivor || row.productId !== survivor.productId);
  if (conflictingParent) globalBlockers.push("target_parent_key_collision");

  const plannedRows = [];
  for (const expected of manifest.rows) {
    const legacyMatches = rowsBySku.get(expected.legacySku) || [];
    const canonicalMatches = rowsBySku.get(expected.canonicalSku) || [];
    const current = legacyMatches.length === 1 ? legacyMatches[0] : null;
    const source = commercialByLegacySku.get(expected.legacySku) || null;
    const blockers = [];

    if (legacyMatches.length !== 1) blockers.push(`legacy_sku_match_count=${legacyMatches.length}`);
    if (canonicalMatches.some((row) => !current || row.variantId !== current.variantId)) blockers.push("canonical_sku_collision");
    if (!source) blockers.push("commercial_row_missing");
    if (source) {
      if (normalize(source.name) !== normalize(expected.name)) blockers.push("commercial_name_mismatch");
      if (normalize(source.group) !== normalize(manifest.catalogGroupName)) blockers.push("commercial_group_mismatch");
      if (!samePackaging(targetPackaging(source), targetPackaging(expected))) blockers.push("commercial_packaging_mismatch");
    }
    if (current && (!current.isActive || !current.isPublic || !current.isOrderable)) blockers.push("legacy_variant_unavailable");
    if (current && !(current.imageObjectKey || current.coverImageObjectKey)) blockers.push("image_object_key_missing");

    const expectedPrice = source ? Number(source.unitPrice) : null;
    const beforePackaging = currentPackaging(current);
    const afterPackaging = targetPackaging(expected);
    const afterOptions = targetOptions(current?.options, expected);
    const recipeRows = current ? (recipesByVariant.get(current.variantId) || []) : [];
    const recipeChanges = recipeRows.map((row) => {
      const snapshot = row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot) ? row.snapshot : {};
      return {
        ingredientId: row.ingredientId,
        productIdChange: survivor ? row.productId !== survivor.productId : true,
        snapshotChange: survivor
          ? snapshot.productId !== survivor.productId
            || snapshot.variantId !== current.variantId
            || snapshot.sku !== expected.canonicalSku
            || normalize(snapshot.productName) !== normalize(manifest.targetParent.name)
            || normalize(snapshot.variantName) !== normalize(expected.name)
          : true,
      };
    });

    plannedRows.push({
      pass: blockers.length === 0,
      blockers,
      legacySku: expected.legacySku,
      canonicalSku: expected.canonicalSku,
      variantId: current?.variantId || null,
      sourceProductId: current?.productId || null,
      targetProductId: survivor?.productId || null,
      preserveVariantId: true,
      preserveImageObject: true,
      imageObjectKey: current?.imageObjectKey || current?.coverImageObjectKey || null,
      before: current ? {
        productKey: current.productKey,
        productName: current.productName,
        brand: current.brand,
        industryKey: current.industryKey,
        catalogGroupKey: current.catalogGroupKey,
        subcategory: current.subcategory,
        variantKey: current.variantKey,
        sku: current.sku,
        variantName: current.variantName,
        options: current.options || {},
        price: current.shopPrice === null ? null : Number(current.shopPrice),
        packaging: beforePackaging,
      } : null,
      after: {
        productKey: manifest.targetParent.productKey,
        productName: manifest.targetParent.name,
        brand: manifest.targetParent.brand,
        industryKey: manifest.industryKey,
        catalogGroupKey: manifest.catalogGroupKey,
        subcategory: manifest.detailGroup,
        sku: expected.canonicalSku,
        variantName: expected.name,
        options: afterOptions,
        price: expectedPrice,
        packaging: afterPackaging,
        legacyAlias: expected.legacySku,
      },
      changes: current ? {
        reparentProduct: Boolean(survivor && current.productId !== survivor.productId),
        productMetadata: current.productKey !== manifest.targetParent.productKey
          || normalize(current.productName) !== normalize(manifest.targetParent.name)
          || normalize(current.brand) !== normalize(manifest.targetParent.brand)
          || current.industryKey !== manifest.industryKey
          || current.catalogGroupKey !== manifest.catalogGroupKey
          || normalize(current.subcategory) !== normalize(manifest.detailGroup),
        sku: current.sku !== expected.canonicalSku,
        variantName: normalize(current.variantName) !== normalize(expected.name),
        options: JSON.stringify(stableValue(current.options || {})) !== JSON.stringify(stableValue(afterOptions)),
        price: expectedPrice !== null && Number(current.shopPrice) !== expectedPrice,
        packaging: !samePackaging(beforePackaging, afterPackaging),
        aliasInsert: true,
      } : null,
      references: {
        cartItemsPreserved: current ? (cartCounts.get(current.variantId) || 0) : 0,
        orderItemsPreserved: current ? (orderCounts.get(current.variantId) || 0) : 0,
        priceRowsPreserved: current ? (priceCounts.get(current.variantId) || 0) : 0,
        packagingRowsExisting: current ? (packagingCounts.get(current.variantId) || 0) : 0,
        recipeIngredients: recipeRows.length,
        recipeProductIdUpdates: recipeChanges.filter((row) => row.productIdChange).length,
        recipeSnapshotUpdates: recipeChanges.filter((row) => row.snapshotChange).length,
      },
    });
  }

  const rowBlockedCount = plannedRows.filter((row) => !row.pass).length;
  const planPass = globalBlockers.length === 0 && rowBlockedCount === 0;
  const migrationRequired = !schema.aliasTable || !schema.batchTable;
  const sourceProductsToDeactivate = [...new Set(sourceProductIds)].filter((id) => survivor && id !== survivor.productId);
  const summary = {
    rowCount: plannedRows.length,
    rowPassCount: plannedRows.length - rowBlockedCount,
    rowBlockedCount,
    uniqueVariantIds: new Set(variantIds).size,
    uniqueSourceProductIds: new Set(sourceProductIds).size,
    survivorProductId: survivor?.productId || null,
    variantsReparented: plannedRows.filter((row) => row.changes?.reparentProduct).length,
    aliasesInserted: plannedRows.length,
    sourceProductsDeactivated: sourceProductsToDeactivate.length,
    cartItemsPreserved: plannedRows.reduce((sum, row) => sum + row.references.cartItemsPreserved, 0),
    orderItemsPreserved: plannedRows.reduce((sum, row) => sum + row.references.orderItemsPreserved, 0),
    recipeProductIdUpdates: plannedRows.reduce((sum, row) => sum + row.references.recipeProductIdUpdates, 0),
    recipeSnapshotUpdates: plannedRows.reduce((sum, row) => sum + row.references.recipeSnapshotUpdates, 0),
    imagesPreserved: plannedRows.filter((row) => row.imageObjectKey).length,
    migrationRequired,
    globalBlockers,
  };

  const report = {
    status: planPass ? "REMAP_DRY_RUN_PASS" : "REMAP_DRY_RUN_BLOCKED",
    applied: false,
    canApplyNow: planPass && !migrationRequired,
    canApplyAfterMigration: planPass,
    target: {
      host: targetUrl.hostname,
      database: targetUrl.pathname.replace(/^\//, ""),
    },
    manifest: {
      path: manifestPath,
      taskId: manifest.taskId,
      groupKey: manifest.groupKey,
      hash: manifestHash,
      auditVerification: manifest.auditVerification,
    },
    commercial: {
      path: commercialPath,
      payloadHash: commercial.payloadHash || null,
    },
    schema: {
      aliasTable: schema.aliasTable || null,
      batchTable: schema.batchTable || null,
      requiredMigration: migrationRequired ? "db/migrations/031_catalog_group_remap.sql" : null,
    },
    operations: {
      updateSurvivorProduct: survivor ? {
        productId: survivor.productId,
        productKey: manifest.targetParent.productKey,
        name: manifest.targetParent.name,
        brand: manifest.targetParent.brand,
        industryKey: manifest.industryKey,
        catalogGroupKey: manifest.catalogGroupKey,
        subcategory: manifest.detailGroup,
      } : null,
      updateVariants: plannedRows.length,
      insertLegacyAliases: plannedRows.length,
      upsertPackagingSpecs: plannedRows.length,
      updateRecipeLinksAndSnapshots: summary.recipeProductIdUpdates + summary.recipeSnapshotUpdates,
      deactivateEmptySourceProducts: sourceProductsToDeactivate,
      preserveCartAndOrderVariantReferences: true,
      preserveOrderItemSnapshots: true,
      preserveImageObjectKeys: true,
      r2Writes: 0,
    },
    summary,
    rows: plannedRows,
    note: "Read-only dry-run. No migration, SKU, product, variant, alias, image, price, packaging, cart, order, recipe, service, or R2 row/object was modified.",
  };

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const csvHeaders = [
    "pass", "legacySku", "canonicalSku", "variantId", "sourceProductId", "targetProductId",
    "reparentProduct", "skuChange", "nameChange", "priceChange", "packagingChange", "aliasInsert",
    "cartItemsPreserved", "orderItemsPreserved", "recipeProductIdUpdates", "recipeSnapshotUpdates",
    "imageObjectKey", "blockers",
  ];
  const csvRows = plannedRows.map((row) => ({
    pass: row.pass,
    legacySku: row.legacySku,
    canonicalSku: row.canonicalSku,
    variantId: row.variantId,
    sourceProductId: row.sourceProductId,
    targetProductId: row.targetProductId,
    reparentProduct: row.changes?.reparentProduct,
    skuChange: row.changes?.sku,
    nameChange: row.changes?.variantName,
    priceChange: row.changes?.price,
    packagingChange: row.changes?.packaging,
    aliasInsert: row.changes?.aliasInsert,
    cartItemsPreserved: row.references.cartItemsPreserved,
    orderItemsPreserved: row.references.orderItemsPreserved,
    recipeProductIdUpdates: row.references.recipeProductIdUpdates,
    recipeSnapshotUpdates: row.references.recipeSnapshotUpdates,
    imageObjectKey: row.imageObjectKey,
    blockers: row.blockers.join(" | "),
  }));
  const csv = [csvHeaders.join(","), ...csvRows.map((row) => csvHeaders.map((key) => csvCell(row[key])).join(","))].join("\n");
  fs.writeFileSync(outputCsvPath, `${csv}\n`, "utf8");

  await client.query("ROLLBACK");
  console.log(JSON.stringify(report, null, 2));
  if (!planPass) process.exitCode = 2;
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({
    status: "FAILED",
    code: error?.code || "CATALOG_REMAP_DRY_RUN_FAILED",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
  }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
