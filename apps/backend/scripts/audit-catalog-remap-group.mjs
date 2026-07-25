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

function fail(message, code = "CATALOG_REMAP_AUDIT_FAILED", details = undefined) {
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

function normalizePackaging(row) {
  if (!row?.packagingSellUnit) return null;
  return {
    sellUnit: row.packagingSellUnit,
    packageQuantity: positiveNumber(row.packagingPackageQuantity),
    packageUnit: row.packagingPackageUnit,
    netQuantity: positiveNumber(row.packagingNetQuantity),
    netUnit: row.packagingNetUnit,
    confidence: row.packagingConfidence,
  };
}

function targetPackaging(row) {
  return {
    sellUnit: row.sellUnit,
    packageQuantity: row.packageQuantity,
    packageUnit: row.packageUnit,
    netQuantity: row.netQuantity,
    netUnit: row.netUnit,
  };
}

function samePackaging(current, target) {
  if (!current) return false;
  return normalize(current.sellUnit) === normalize(target.sellUnit)
    && Number(current.packageQuantity) === Number(target.packageQuantity)
    && normalize(current.packageUnit) === normalize(target.packageUnit)
    && Number(current.netQuantity) === Number(target.netQuantity)
    && normalize(current.netUnit) === normalize(target.netUnit);
}

async function probeImage(url) {
  if (!url) return { reachable: false, status: null, error: "missing_object_key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 403) {
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
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const manifestPath = path.resolve(argument("manifest", path.join(repoRoot, "data/catalog-remap/tea-novia.json")));
const commercialPathArg = argument("commercial-file");
const commercialPath = commercialPathArg ? path.resolve(commercialPathArg) : null;
const outputJsonPath = path.resolve(argument("output-json", path.join(repoRoot, "artifacts/catalog-remap/tea-novia-audit.json")));
const outputCsvPath = path.resolve(argument("output-csv", path.join(repoRoot, "artifacts/catalog-remap/tea-novia-audit.csv")));

const manifest = readJson(manifestPath, "Remap manifest");
assert(manifest.schemaVersion === 1, "Unsupported remap manifest schema.", "CATALOG_REMAP_SCHEMA_UNSUPPORTED");
assert(Array.isArray(manifest.rows) && manifest.rows.length > 0, "Remap manifest has no rows.", "CATALOG_REMAP_ROWS_MISSING");

const legacySkus = manifest.rows.map((row) => clean(row.legacySku));
const canonicalSkus = manifest.rows.map((row) => clean(row.canonicalSku));
assert(new Set(legacySkus).size === legacySkus.length, "Duplicate legacy SKU in manifest.", "CATALOG_REMAP_DUPLICATE_LEGACY_SKU");
assert(new Set(canonicalSkus).size === canonicalSkus.length, "Duplicate canonical SKU in manifest.", "CATALOG_REMAP_DUPLICATE_CANONICAL_SKU");

let commercialByLegacySku = new Map();
let commercialPayloadHash = null;
if (commercialPath) {
  const commercial = readJson(commercialPath, "Commercial payload");
  commercialPayloadHash = commercial.payloadHash || null;
  commercialByLegacySku = new Map((commercial.rows || []).map((row) => [clean(row.sku), row]));
}

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured.", "CATALOG_REMAP_DATABASE_URL_REQUIRED");
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
  await client.query("SET LOCAL statement_timeout = '30s'");

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
    [[...legacySkus, ...canonicalSkus]],
  );

  const parentCollisionResult = await client.query(
    `SELECT id::text AS "productId", product_key AS "productKey", name
     FROM catalog_products
     WHERE product_key = $1`,
    [manifest.targetParent.productKey],
  );

  const capabilityResult = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'catalog_variants' AND column_name = 'legacy_sku'
       ) AS "legacySkuColumn",
       to_regclass('public.catalog_variant_sku_aliases')::text AS "aliasTable"`,
  );

  const rowsBySku = new Map();
  for (const row of variantResult.rows) {
    const list = rowsBySku.get(row.sku) || [];
    list.push(row);
    rowsBySku.set(row.sku, list);
  }

  const auditedRows = [];
  for (const expected of manifest.rows) {
    const legacyMatches = rowsBySku.get(expected.legacySku) || [];
    const canonicalMatches = rowsBySku.get(expected.canonicalSku) || [];
    const current = legacyMatches.length === 1 ? legacyMatches[0] : null;
    const commercial = commercialByLegacySku.get(expected.legacySku) || null;
    const blockers = [];

    if (legacyMatches.length !== 1) blockers.push(`legacy_sku_match_count=${legacyMatches.length}`);
    if (canonicalMatches.some((row) => !current || row.variantId !== current.variantId)) blockers.push("canonical_sku_collision");
    if (!commercialPath) blockers.push("commercial_payload_not_supplied");
    if (commercialPath && !commercial) blockers.push("commercial_row_missing");

    if (commercial) {
      if (normalize(commercial.name) !== normalize(expected.name)) blockers.push("commercial_name_mismatch");
      if (normalize(commercial.group) !== normalize(manifest.catalogGroupName)) blockers.push("commercial_group_mismatch");
      if (!samePackaging(targetPackaging(expected), targetPackaging(commercial))) blockers.push("commercial_packaging_mismatch");
    }

    let image = {
      source: null,
      key: null,
      objectKey: null,
      url: null,
      reachable: false,
      status: null,
      error: "legacy_variant_missing",
    };

    if (current) {
      const objectKey = current.imageObjectKey || current.coverImageObjectKey || null;
      const key = current.imageKey || current.coverImageKey || null;
      const source = current.imageObjectKey ? "variant" : current.coverImageObjectKey ? "product_cover" : null;
      const url = objectKey ? `${assetBaseUrl}/${String(objectKey).replace(/^\/+/, "")}` : null;
      const probe = await probeImage(url);
      image = { source, key, objectKey, url, ...probe };

      if (current.catalogVersion !== "hung-phat-v2") blockers.push("unexpected_catalog_version");
      if (!current.isActive || !current.isPublic || !current.isOrderable) blockers.push("legacy_variant_unavailable");
      if (!current.productId || !current.variantId) blockers.push("missing_catalog_ids");
      if (!objectKey) blockers.push("image_object_key_missing");
      else if (!probe.reachable) blockers.push("image_unreachable");
    }

    const currentPackaging = current ? normalizePackaging(current) : null;
    const expectedPackaging = targetPackaging(expected);
    const expectedPrice = commercial ? Number(commercial.unitPrice) : null;
    const currentPrice = current?.shopPrice === null || current?.shopPrice === undefined ? null : Number(current.shopPrice);

    auditedRows.push({
      legacySku: expected.legacySku,
      canonicalSku: expected.canonicalSku,
      pass: blockers.length === 0,
      blockers,
      current: current ? {
        productId: current.productId,
        productKey: current.productKey,
        productName: current.productName,
        brand: current.brand,
        industry: current.industry,
        industryKey: current.industryKey,
        catalogGroupKey: current.catalogGroupKey,
        subcategory: current.subcategory,
        variantId: current.variantId,
        variantKey: current.variantKey,
        sku: current.sku,
        variantName: current.variantName,
        options: current.options || {},
        price: currentPrice,
        priceMode: current.priceMode,
        status: current.variantStatus,
        packaging: currentPackaging,
      } : null,
      target: {
        productKey: manifest.targetParent.productKey,
        productName: manifest.targetParent.name,
        brand: manifest.targetParent.brand,
        industryKey: manifest.industryKey,
        catalogGroupKey: manifest.catalogGroupKey,
        subcategory: manifest.detailGroup,
        sku: expected.canonicalSku,
        variantName: expected.name,
        type: expected.type,
        price: expectedPrice,
        packaging: expectedPackaging,
      },
      changes: current ? {
        reparentProduct: current.productKey !== manifest.targetParent.productKey,
        sku: current.sku !== expected.canonicalSku,
        productName: normalize(current.productName) !== normalize(manifest.targetParent.name),
        variantName: normalize(current.variantName) !== normalize(expected.name),
        brand: normalize(current.brand) !== normalize(manifest.targetParent.brand),
        industryKey: current.industryKey !== manifest.industryKey,
        catalogGroupKey: current.catalogGroupKey !== manifest.catalogGroupKey,
        subcategory: normalize(current.subcategory) !== normalize(manifest.detailGroup),
        type: normalize(current.options?.type) !== normalize(expected.type),
        price: expectedPrice !== null && currentPrice !== expectedPrice,
        packaging: !samePackaging(currentPackaging, expectedPackaging),
      } : null,
      imageMapping: {
        legacySku: expected.legacySku,
        canonicalSku: expected.canonicalSku,
        expectedImageKey: expected.imageKey,
        keepObjectKey: true,
        ...image,
      },
    });
  }

  const productIds = auditedRows.map((row) => row.current?.productId).filter(Boolean);
  const variantIds = auditedRows.map((row) => row.current?.variantId).filter(Boolean);
  const capabilities = capabilityResult.rows[0] || {};
  const parentCollisions = parentCollisionResult.rows;
  const globalBlockers = [];
  if (new Set(productIds).size !== manifest.rows.length) globalBlockers.push("legacy_products_not_one_per_source_row");
  if (new Set(variantIds).size !== manifest.rows.length) globalBlockers.push("legacy_variants_not_unique");
  if (parentCollisions.length > 0 && !productIds.includes(parentCollisions[0].productId)) globalBlockers.push("target_parent_key_collision");
  if (!capabilities.legacySkuColumn && !capabilities.aliasTable) globalBlockers.push("legacy_sku_storage_missing");

  const rowPassCount = auditedRows.filter((row) => row.pass).length;
  const auditPass = rowPassCount === auditedRows.length;
  const canApply = auditPass && globalBlockers.length === 0;
  const report = {
    status: auditPass ? "REMAP_AUDIT_PASS" : "REMAP_AUDIT_BLOCKED",
    applied: false,
    canApply,
    target: {
      host: targetUrl.hostname,
      database: targetUrl.pathname.replace(/^\//, ""),
      assetBaseUrl,
    },
    manifest: {
      path: manifestPath,
      groupKey: manifest.groupKey,
      industryKey: manifest.industryKey,
      catalogGroupKey: manifest.catalogGroupKey,
      detailGroup: manifest.detailGroup,
      targetParent: manifest.targetParent,
      rowCount: manifest.rows.length,
    },
    commercial: {
      path: commercialPath,
      payloadHash: commercialPayloadHash,
    },
    summary: {
      rowCount: auditedRows.length,
      rowPassCount,
      rowBlockedCount: auditedRows.length - rowPassCount,
      uniqueProductIds: new Set(productIds).size,
      uniqueVariantIds: new Set(variantIds).size,
      imagePassCount: auditedRows.filter((row) => row.imageMapping.reachable).length,
      canonicalCollisionCount: auditedRows.filter((row) => row.blockers.includes("canonical_sku_collision")).length,
      parentCollisionCount: parentCollisions.length,
      globalBlockers,
      schemaCapabilities: {
        legacySkuColumn: capabilities.legacySkuColumn === true,
        aliasTable: capabilities.aliasTable || null,
      },
    },
    rows: auditedRows,
    note: "Read-only audit. No SKU, product, image, price, packaging, cart, order, or recipe row was modified.",
  };

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const csvHeaders = [
    "pass", "legacySku", "canonicalSku", "productId", "variantId", "currentProductName", "targetProductName",
    "currentVariantName", "targetVariantName", "currentBrand", "targetBrand", "currentIndustryKey", "targetIndustryKey",
    "currentGroupKey", "targetGroupKey", "currentSubcategory", "targetSubcategory", "currentPrice", "targetPrice",
    "currentPackaging", "targetPackaging", "imageSource", "imageObjectKey", "imageReachable", "blockers",
  ];
  const csvRows = auditedRows.map((row) => ({
    pass: row.pass,
    legacySku: row.legacySku,
    canonicalSku: row.canonicalSku,
    productId: row.current?.productId,
    variantId: row.current?.variantId,
    currentProductName: row.current?.productName,
    targetProductName: row.target.productName,
    currentVariantName: row.current?.variantName,
    targetVariantName: row.target.variantName,
    currentBrand: row.current?.brand,
    targetBrand: row.target.brand,
    currentIndustryKey: row.current?.industryKey,
    targetIndustryKey: row.target.industryKey,
    currentGroupKey: row.current?.catalogGroupKey,
    targetGroupKey: row.target.catalogGroupKey,
    currentSubcategory: row.current?.subcategory,
    targetSubcategory: row.target.subcategory,
    currentPrice: row.current?.price,
    targetPrice: row.target.price,
    currentPackaging: row.current?.packaging,
    targetPackaging: row.target.packaging,
    imageSource: row.imageMapping.source,
    imageObjectKey: row.imageMapping.objectKey,
    imageReachable: row.imageMapping.reachable,
    blockers: row.blockers.join(" | "),
  }));
  const csv = [csvHeaders.join(","), ...csvRows.map((row) => csvHeaders.map((key) => csvCell(row[key])).join(","))].join("\n");
  fs.writeFileSync(outputCsvPath, `${csv}\n`, "utf8");

  await client.query("ROLLBACK");
  console.log(JSON.stringify(report, null, 2));
  if (!auditPass) process.exitCode = 2;
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({
    status: "FAILED",
    code: error?.code || "CATALOG_REMAP_AUDIT_FAILED",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
  }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
