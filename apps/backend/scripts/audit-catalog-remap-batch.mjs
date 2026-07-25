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

function fail(message, code = "CATALOG_REMAP_BATCH_AUDIT_FAILED", details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function assert(condition, message, code, details = undefined) {
  if (!condition) fail(message, code, details);
}

function readJson(filePath, label) {
  assert(filePath && fs.existsSync(filePath), `${label} is missing: ${filePath}`, "CATALOG_REMAP_BATCH_FILE_MISSING", { filePath, label });
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

function csvCell(value) {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function probeImage(url) {
  if (!url) return { reachable: false, status: null, contentType: null, error: "missing_object_key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 403 || response.status === 405) {
      response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        signal: controller.signal,
      });
    }
    return {
      reachable: response.ok || response.status === 206,
      status: response.status,
      contentType: response.headers.get("content-type"),
      error: null,
    };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      contentType: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const manifestPath = path.resolve(argument("manifest", path.join(repoRoot, "data/catalog-remap/tea-batch-02.json")));
const commercialArg = argument("commercial-file");
assert(commercialArg, "--commercial-file is required.", "CATALOG_REMAP_BATCH_COMMERCIAL_REQUIRED");
const commercialPath = path.resolve(commercialArg);
const outputJsonPath = path.resolve(argument("output-json", path.join(repoRoot, "artifacts/catalog-remap/tea-batch-02-audit.json")));
const outputCsvPath = path.resolve(argument("output-csv", path.join(repoRoot, "artifacts/catalog-remap/tea-batch-02-audit.csv")));

const manifest = readJson(manifestPath, "Batch manifest");
const commercial = readJson(commercialPath, "Private commercial payload");

assert(manifest.schemaVersion === 2, "Unsupported batch manifest schema.", "CATALOG_REMAP_BATCH_SCHEMA_UNSUPPORTED");
assert(manifest.reviewApproval?.status === "APPROVED", "Batch mapping has not been approved.", "CATALOG_REMAP_BATCH_NOT_APPROVED");
assert(Array.isArray(manifest.rows) && manifest.rows.length >= 15 && manifest.rows.length <= 30, "Batch must contain 15-30 rows.", "CATALOG_REMAP_BATCH_SIZE_INVALID");
assert(commercial.schemaVersion === 1 && commercial.taskId === manifest.taskId, "Private payload does not match batch task.", "CATALOG_REMAP_BATCH_PRIVATE_MISMATCH");

const actions = new Set(["REMAP", "CREATE_NEW"]);
const canonicalSkus = manifest.rows.map((row) => clean(row.canonicalSku));
const legacySkus = manifest.rows.filter((row) => row.action === "REMAP").map((row) => clean(row.legacySku));
assert(canonicalSkus.every(Boolean), "Every row requires canonicalSku.", "CATALOG_REMAP_BATCH_CANONICAL_MISSING");
assert(new Set(canonicalSkus).size === canonicalSkus.length, "Duplicate canonical SKU in batch.", "CATALOG_REMAP_BATCH_CANONICAL_DUPLICATE");
assert(new Set(legacySkus).size === legacySkus.length, "Duplicate legacy SKU in batch.", "CATALOG_REMAP_BATCH_LEGACY_DUPLICATE");
for (const row of manifest.rows) {
  assert(actions.has(row.action), `Unsupported action: ${row.action}`, "CATALOG_REMAP_BATCH_ACTION_INVALID", { rowNo: row.rowNo });
  assert(manifest.targetParents?.[row.detailGroup], `Missing target parent for ${row.detailGroup}.`, "CATALOG_REMAP_BATCH_PARENT_MISSING", { rowNo: row.rowNo });
  if (row.action === "REMAP") assert(clean(row.legacySku), "REMAP row requires legacySku.", "CATALOG_REMAP_BATCH_LEGACY_REQUIRED", { rowNo: row.rowNo });
  if (row.action === "CREATE_NEW") assert(!clean(row.legacySku), "CREATE_NEW row must not define legacySku.", "CATALOG_REMAP_BATCH_CREATE_LEGACY_FORBIDDEN", { rowNo: row.rowNo });
}

const privateByCanonical = new Map((commercial.rows || []).map((row) => [clean(row.canonicalSku), row]));
assert(privateByCanonical.size === manifest.rows.length, "Private payload row count does not match manifest.", "CATALOG_REMAP_BATCH_PRIVATE_COUNT_MISMATCH");

const survivorLegacySkus = Object.values(manifest.targetParents || {})
  .map((parent) => clean(parent.survivorLegacySku))
  .filter(Boolean);
const querySkus = [...new Set([...legacySkus, ...canonicalSkus, ...survivorLegacySkus])];

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured.", "CATALOG_REMAP_BATCH_DATABASE_URL_REQUIRED");

const targetUrl = new URL(connectionString);
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname);
const assetBaseUrl = (process.env.R2_PUBLIC_BASE_URL || process.env.CATALOG_ASSET_BASE_URL || "https://cdn.bepsi.click").replace(/\/+$/, "");
const pool = new Pool({
  connectionString,
  ssl: localConnection ? false : { rejectUnauthorized: false },
  max: 1,
});

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");

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
       product.cover_image_key AS "coverImageKey",
       product.cover_image_object_key AS "coverImageObjectKey",
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
       variant.catalog_version AS "catalogVersion",
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
    [querySkus],
  );

  const rowsBySku = new Map();
  for (const row of variantResult.rows) {
    const list = rowsBySku.get(row.sku) || [];
    list.push(row);
    rowsBySku.set(row.sku, list);
  }

  const targetParentKeys = [...new Set(Object.values(manifest.targetParents).map((parent) => parent.productKey))];
  const targetParentResult = await client.query(
    `SELECT id::text AS "productId", product_key AS "productKey", name, brand
     FROM catalog_products
     WHERE product_key = ANY($1::text[])`,
    [targetParentKeys],
  );
  const targetProductByKey = new Map(targetParentResult.rows.map((row) => [row.productKey, row]));

  const capabilityResult = await client.query(
    `SELECT
       to_regclass('public.catalog_variant_sku_aliases')::text AS "aliasTable",
       to_regclass('public.catalog_group_remap_batches')::text AS "batchTable"`,
  );
  const schema = capabilityResult.rows[0] || {};
  const migrationRequired = !schema.aliasTable || !schema.batchTable;

  const parentPlans = {};
  const globalBlockers = [];
  for (const [detailGroup, parent] of Object.entries(manifest.targetParents)) {
    const survivorMatches = clean(parent.survivorLegacySku) ? (rowsBySku.get(parent.survivorLegacySku) || []) : [];
    const survivor = survivorMatches.length === 1 ? survivorMatches[0] : null;
    const targetProduct = targetProductByKey.get(parent.productKey) || null;
    const blockers = [];

    if (clean(parent.survivorLegacySku) && survivorMatches.length !== 1) {
      blockers.push(`survivor_sku_match_count=${survivorMatches.length}`);
    }
    if (targetProduct && survivor && targetProduct.productId !== survivor.productId) {
      blockers.push("target_parent_key_collision");
    }

    parentPlans[detailGroup] = {
      detailGroup,
      productKey: parent.productKey,
      productName: parent.name,
      brand: parent.brand,
      strategy: parent.strategy,
      survivorLegacySku: parent.survivorLegacySku || null,
      survivorProductId: survivor?.productId || null,
      existingTargetProductId: targetProduct?.productId || null,
      blockers,
    };
    if (blockers.length > 0) globalBlockers.push(`${detailGroup}:${blockers.join("|")}`);
  }

  const auditedRows = [];
  for (const expected of manifest.rows) {
    const privateRow = privateByCanonical.get(expected.canonicalSku) || null;
    const legacyMatches = expected.action === "REMAP" ? (rowsBySku.get(expected.legacySku) || []) : [];
    const canonicalMatches = rowsBySku.get(expected.canonicalSku) || [];
    const current = legacyMatches.length === 1 ? legacyMatches[0] : null;
    const parentPlan = parentPlans[expected.detailGroup];
    const blockers = [];

    if (!privateRow) blockers.push("private_row_missing");
    if (privateRow) {
      if (privateRow.action !== expected.action) blockers.push("private_action_mismatch");
      if (clean(privateRow.legacySku) !== clean(expected.legacySku)) blockers.push("private_legacy_sku_mismatch");
      if (normalize(privateRow.name) !== normalize(expected.name)) blockers.push("private_name_mismatch");
      if (normalize(privateRow.group) !== normalize(manifest.catalogGroupName)) blockers.push("private_group_mismatch");
      if (normalize(privateRow.detailGroup) !== normalize(expected.detailGroup)) blockers.push("private_detail_group_mismatch");
      if (!samePackaging(targetPackaging(privateRow), targetPackaging(expected))) blockers.push("private_packaging_mismatch");
      if (privateRow.status !== "ready") blockers.push("private_row_not_ready");
      if (!positiveNumber(privateRow.unitPrice)) blockers.push("private_price_invalid");
    }

    if (expected.action === "REMAP") {
      if (legacyMatches.length !== 1) blockers.push(`legacy_sku_match_count=${legacyMatches.length}`);
      if (canonicalMatches.some((row) => !current || row.variantId !== current.variantId)) blockers.push("canonical_sku_collision");
      if (current) {
        if (current.catalogVersion !== "hung-phat-v2") blockers.push("unexpected_catalog_version");
        if (!current.isActive || !current.isPublic || !current.isOrderable) blockers.push("legacy_variant_unavailable");
        if (!current.productId || !current.variantId) blockers.push("missing_catalog_ids");
      }
    } else {
      if (canonicalMatches.length > 0) blockers.push("canonical_sku_collision");
    }

    let image = {
      source: null,
      key: expected.imageMigration?.currentImageKey || null,
      objectKey: null,
      url: null,
      reachable: false,
      status: null,
      contentType: null,
      error: expected.action === "CREATE_NEW" ? "create_new_waiting_manual_image" : "legacy_variant_missing",
      allowedMissing: false,
    };

    if (expected.action === "REMAP" && current) {
      const objectKey = current.imageObjectKey || current.coverImageObjectKey || null;
      const key = current.imageKey || current.coverImageKey || expected.imageMigration?.currentImageKey || null;
      const source = current.imageObjectKey ? "variant" : current.coverImageObjectKey ? "product_cover" : null;
      const url = objectKey ? `${assetBaseUrl}/${String(objectKey).replace(/^\/+/, "")}` : null;
      const missingAllowed = expected.imageMigration?.status === "MISSING_IMAGE_USER_CONFIRMED";
      const probe = missingAllowed && !url
        ? { reachable: false, status: null, contentType: null, error: "missing_image_user_confirmed" }
        : await probeImage(url);
      image = { source, key, objectKey, url, ...probe, allowedMissing: missingAllowed };

      if (!missingAllowed) {
        if (!objectKey) blockers.push("image_object_key_missing");
        else if (!probe.reachable) blockers.push("image_unreachable");
      }
    }

    if (expected.action === "CREATE_NEW") {
      const missingAllowed = ["WAITING_MANUAL_IMAGE", "MISSING_IMAGE_USER_CONFIRMED"].includes(expected.imageMigration?.status);
      image.allowedMissing = missingAllowed;
      if (!missingAllowed) blockers.push("create_new_image_policy_invalid");
    }

    const currentPack = currentPackaging(current);
    const expectedPack = targetPackaging(expected);
    const expectedPrice = privateRow ? Number(privateRow.unitPrice) : null;
    const currentPrice = current?.shopPrice === null || current?.shopPrice === undefined ? null : Number(current.shopPrice);

    auditedRows.push({
      rowNo: expected.rowNo,
      action: expected.action,
      legacySku: expected.legacySku || null,
      canonicalSku: expected.canonicalSku,
      detailGroup: expected.detailGroup,
      pass: blockers.length === 0,
      blockers,
      current: current ? {
        productId: current.productId,
        productKey: current.productKey,
        productName: current.productName,
        variantId: current.variantId,
        variantKey: current.variantKey,
        sku: current.sku,
        variantName: current.variantName,
        price: currentPrice,
        packaging: currentPack,
      } : null,
      target: {
        parentProductKey: parentPlan.productKey,
        parentProductName: parentPlan.productName,
        parentBrand: parentPlan.brand,
        targetProductId: parentPlan.existingTargetProductId || parentPlan.survivorProductId || null,
        industryKey: manifest.industryKey,
        catalogGroupKey: manifest.catalogGroupKey,
        subcategory: expected.detailGroup,
        sku: expected.canonicalSku,
        variantName: expected.name,
        type: expected.type,
        price: expectedPrice,
        packaging: expectedPack,
        createNewVariant: expected.action === "CREATE_NEW",
        legacyAlias: expected.action === "REMAP" ? expected.legacySku : null,
      },
      changes: {
        reparentProduct: expected.action === "REMAP"
          ? Boolean(current && parentPlan.survivorProductId && current.productId !== parentPlan.survivorProductId)
          : false,
        sku: expected.action === "REMAP" ? current?.sku !== expected.canonicalSku : true,
        variantName: expected.action === "REMAP" ? normalize(current?.variantName) !== normalize(expected.name) : true,
        price: expected.action === "REMAP" ? currentPrice !== expectedPrice : true,
        packaging: expected.action === "REMAP" ? !samePackaging(currentPack, expectedPack) : true,
        aliasInsert: expected.action === "REMAP",
      },
      image,
    });
  }

  const rowBlockedCount = auditedRows.filter((row) => !row.pass).length;
  const status = globalBlockers.length === 0 && rowBlockedCount === 0 ? "BATCH_AUDIT_PASS" : "BATCH_AUDIT_BLOCKED";
  const report = {
    status,
    applied: false,
    canProceedToDryRun: status === "BATCH_AUDIT_PASS",
    target: {
      host: targetUrl.hostname,
      database: targetUrl.pathname.replace(/^\//, ""),
    },
    manifest: {
      path: manifestPath,
      taskId: manifest.taskId,
      groupKey: manifest.groupKey,
      rowCount: manifest.rows.length,
      reviewApproval: manifest.reviewApproval,
    },
    commercial: {
      path: commercialPath,
      payloadHash: commercial.payloadHash || null,
    },
    schema: {
      aliasTable: schema.aliasTable || null,
      batchTable: schema.batchTable || null,
      migrationRequired,
      requiredMigration: migrationRequired ? "db/migrations/031_catalog_group_remap.sql" : null,
    },
    summary: {
      rowCount: auditedRows.length,
      remapCount: auditedRows.filter((row) => row.action === "REMAP").length,
      createNewCount: auditedRows.filter((row) => row.action === "CREATE_NEW").length,
      rowPassCount: auditedRows.length - rowBlockedCount,
      rowBlockedCount,
      missingImageAllowedCount: auditedRows.filter((row) => row.image.allowedMissing).length,
      globalBlockers,
    },
    parentPlans,
    rows: auditedRows,
    note: "Read-only batch audit. No migration, SKU, product, variant, alias, image, price, packaging, cart, order, recipe, service, or R2 row/object was modified.",
  };

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const headers = [
    "rowNo", "action", "legacySku", "canonicalSku", "detailGroup", "pass", "variantId", "sourceProductId",
    "targetProductId", "reparentProduct", "aliasInsert", "imageStatus", "imageAllowedMissing", "imageObjectKey", "blockers",
  ];
  const csvRows = auditedRows.map((row) => ({
    rowNo: row.rowNo,
    action: row.action,
    legacySku: row.legacySku,
    canonicalSku: row.canonicalSku,
    detailGroup: row.detailGroup,
    pass: row.pass,
    variantId: row.current?.variantId || null,
    sourceProductId: row.current?.productId || null,
    targetProductId: row.target.targetProductId,
    reparentProduct: row.changes.reparentProduct,
    aliasInsert: row.changes.aliasInsert,
    imageStatus: row.image.error || row.image.status || null,
    imageAllowedMissing: row.image.allowedMissing,
    imageObjectKey: row.image.objectKey,
    blockers: row.blockers.join(" | "),
  }));
  const csv = [headers.join(","), ...csvRows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\n");
  fs.writeFileSync(outputCsvPath, `${csv}\n`, "utf8");

  await client.query("ROLLBACK");
  console.log(JSON.stringify(report, null, 2));
  if (status !== "BATCH_AUDIT_PASS") process.exitCode = 2;
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({
    status: "FAILED",
    code: error?.code || "CATALOG_REMAP_BATCH_AUDIT_FAILED",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
  }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
