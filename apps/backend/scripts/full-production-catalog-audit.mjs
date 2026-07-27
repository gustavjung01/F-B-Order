import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  argument, upper, readJson, normalizeManifest, collectSkuObjects, evaluateRow, pushIssue,
  normalizedActualPackaging, summarize, markdown, csv, selfTest,
} from "./full-production-catalog-audit-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}
if (process.argv.includes("--apply") || process.argv.some((value) => value.startsWith("--rollback"))) {
  throw Object.assign(new Error("Full production catalog audit is read-only. Apply and rollback are not supported."), { code: "CATALOG_AUDIT_WRITE_REFUSED" });
}

const configPath = path.resolve(repoRoot, argument("config", "data/catalog-remap/full-production-catalog-audit.json"));
const outputJsonPath = path.resolve(repoRoot, argument("output-json", "artifacts/catalog-audit/full-production-catalog-audit.json"));
const outputCsvPath = path.resolve(repoRoot, argument("output-csv", "artifacts/catalog-audit/full-production-catalog-audit.csv"));
const outputMarkdownPath = path.resolve(repoRoot, argument("output-md", "artifacts/catalog-audit/full-production-catalog-audit-summary.md"));
const config = readJson(configPath, "Audit configuration");
if (config.mode !== "READ_ONLY" || !Array.isArray(config.tasks) || !config.tasks.length) {
  throw Object.assign(new Error("Audit configuration is invalid."), { code: "CATALOG_AUDIT_CONFIG_INVALID" });
}

const manifests = config.tasks.map((task) => {
  const manifestPath = path.resolve(repoRoot, task.manifest);
  const raw = readJson(manifestPath, `Manifest ${task.taskId}`);
  const normalized = normalizeManifest(task, raw);
  if (normalized.taskId !== task.taskId) throw Object.assign(new Error(`Task ID mismatch for ${task.taskId}.`), { code: "CATALOG_AUDIT_TASK_ID_MISMATCH" });
  return { task, manifestPath, normalized };
});
const expectedRows = manifests.flatMap(({ normalized }) => normalized.rows);
const duplicateSkus = expectedRows.map((row) => upper(row.canonicalSku)).filter((sku, index, all) => all.indexOf(sku) !== index);
if (duplicateSkus.length) throw Object.assign(new Error(`Duplicate canonical SKUs in audit scope: ${[...new Set(duplicateSkus)].join(", ")}`), { code: "CATALOG_AUDIT_DUPLICATE_SCOPE_SKU" });

const dotenv = (await import("dotenv")).default;
const pg = (await import("pg")).default;
for (const envPath of [path.join(repoRoot, ".env"), path.resolve(here, "../.env"), path.resolve(here, "../.env.local")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) throw Object.assign(new Error("DATABASE_URL or BEPSI_DATABASE_URL is required."), { code: "CATALOG_AUDIT_DATABASE_URL_REQUIRED" });
const targetUrl = new URL(connectionString);
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname);
const pool = new pg.Pool({ connectionString, ssl: localConnection ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();

let apiPayload = null;
let apiError = null;
try {
  const response = await fetch(argument("api-url", config.apiUrl), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  apiPayload = await response.json();
} catch (error) {
  apiError = error instanceof Error ? error.message : String(error);
}
const apiBySku = collectSkuObjects(apiPayload);

try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='180s'");
  const skus = expectedRows.map((row) => upper(row.canonicalSku));
  const legacySkus = expectedRows.map((row) => upper(row.legacySku)).filter(Boolean);

  const variantRows = (await client.query(
    `SELECT
       product.id::text AS "productId",
       product.product_key AS "productKey",
       product.name AS "productName",
       product.brand,
       product.industry_key AS "industryKey",
       product.catalog_group_key AS "catalogGroupKey",
       product.subcategory,
       variant.id::text AS "variantId",
       variant.sku,
       variant.name AS "variantName",
       variant.options,
       variant.price_mode AS "priceMode",
       variant.shop_price::float8 AS "shopPrice",
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
       packaging.measure_mode AS "packagingMeasureMode",
       (SELECT COUNT(*)::int FROM cart_items item WHERE item.variant_id=variant.id) AS "cartItems",
       (SELECT COUNT(*)::int FROM order_items item WHERE item.variant_id=variant.id) AS "orderItems",
       (SELECT COUNT(*)::int FROM catalog_variant_prices price WHERE price.variant_id=variant.id) AS "priceRows",
       (SELECT COUNT(*)::int
        FROM recipe_ingredients ingredient
        WHERE ingredient.catalog_variant_id=variant.id
          AND (
            ingredient.catalog_product_id IS DISTINCT FROM variant.product_id
            OR ingredient.catalog_snapshot->>'variantId' IS DISTINCT FROM variant.id::text
            OR ingredient.catalog_snapshot->>'productId' IS DISTINCT FROM variant.product_id::text
            OR UPPER(ingredient.catalog_snapshot->>'sku') IS DISTINCT FROM UPPER(variant.sku)
            OR ingredient.catalog_snapshot->>'variantName' IS DISTINCT FROM variant.name
          )) AS "recipeMismatchCount",
       (SELECT COUNT(*)::int FROM recipe_ingredients ingredient WHERE ingredient.catalog_variant_id=variant.id) AS "recipeIngredients"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id=variant.product_id
     LEFT JOIN catalog_variant_packaging_specs packaging ON packaging.variant_id=variant.id
     WHERE UPPER(variant.sku)=ANY($1::text[])
     ORDER BY UPPER(variant.sku)`,
    [skus],
  )).rows;
  const variantsBySku = new Map();
  for (const row of variantRows) {
    const key = upper(row.sku);
    if (!variantsBySku.has(key)) variantsBySku.set(key, []);
    variantsBySku.get(key).push(row);
  }

  const aliasRows = legacySkus.length
    ? (await client.query(
      `SELECT UPPER(alias.alias_sku) AS "aliasSku", alias.variant_id::text AS "variantId", UPPER(variant.sku) AS "canonicalSku", alias.source
       FROM catalog_variant_sku_aliases alias
       JOIN catalog_variants variant ON variant.id=alias.variant_id
       WHERE UPPER(alias.alias_sku)=ANY($1::text[])`,
      [legacySkus],
    )).rows
    : [];
  const aliasesBySku = new Map(aliasRows.map((row) => [row.aliasSku, row]));

  const rows = expectedRows.map((expected) => {
    const candidates = variantsBySku.get(upper(expected.canonicalSku)) || [];
    const duplicateIssue = candidates.length > 1
      ? [{ severity: "BLOCKED", code: "CANONICAL_SKU_DUPLICATE", message: `SKU ${expected.canonicalSku} resolves to multiple variants.`, current: candidates.map((item) => item.variantId), expected: 1 }]
      : [];
    const actual = candidates[0] || null;
    const alias = expected.legacySku ? aliasesBySku.get(upper(expected.legacySku)) || null : null;
    const apiItem = apiBySku.get(upper(expected.canonicalSku)) || null;
    const evaluation = evaluateRow(expected, actual, alias, apiItem);
    const issues = [...duplicateIssue, ...evaluation.issues];
    if (apiError) pushIssue(issues, "WARN", "API_AUDIT_UNAVAILABLE", "Catalog API could not be read.", apiError, config.apiUrl);
    const status = issues.some((issue) => issue.severity === "BLOCKED") ? "BLOCKED" : issues.length ? "WARN" : "PASS";
    return {
      taskId: expected.taskId,
      rowNo: expected.rowNo,
      action: expected.action,
      legacySku: expected.legacySku || null,
      canonicalSku: expected.canonicalSku,
      status,
      issues,
      expected: {
        name: expected.name,
        parentKey: expected.targetParentKey,
        brand: expected.parent?.brand || null,
        productType: expected.productType || null,
        flavor: expected.flavor || null,
        legacyType: expected.legacyType || null,
        measureKind: expected.measureKind || null,
        packaging: {
          measureMode: expected.measureMode,
          sellUnit: expected.sellUnit,
          packageQuantity: expected.packageQuantity,
          packageUnit: expected.packageUnit,
          netQuantity: expected.netQuantity,
          netUnit: expected.netUnit,
        },
      },
      current: actual ? {
        productId: actual.productId,
        productKey: actual.productKey,
        productName: actual.productName,
        brand: actual.brand,
        subcategory: actual.subcategory,
        variantId: actual.variantId,
        variantName: actual.variantName,
        options: actual.options || {},
        shopPrice: Number(actual.shopPrice),
        derivedPackagePrice: Number(actual.shopPrice) * Number(actual.packagingPackageQuantity || 0),
        packaging: normalizedActualPackaging(actual),
        active: actual.isActive,
        public: actual.isPublic,
        orderable: actual.isOrderable,
        imageKey: actual.imageKey,
        imageObjectKey: actual.imageObjectKey,
        references: {
          cartItems: Number(actual.cartItems || 0),
          orderItems: Number(actual.orderItems || 0),
          priceRows: Number(actual.priceRows || 0),
          recipeIngredients: Number(actual.recipeIngredients || 0),
          recipeMismatchCount: Number(actual.recipeMismatchCount || 0),
        },
      } : {},
      alias,
      api: apiItem ? {
        found: true,
        type: apiItem.options?.type ?? apiItem.productType ?? apiItem.type ?? null,
        flavor: apiItem.options?.flavor ?? apiItem.flavor ?? null,
      } : { found: false },
    };
  });
  await client.query("ROLLBACK");

  const summary = summarize(rows);
  const status = summary.blockedCount > 0 ? "CORRECTIONS_REQUIRED" : summary.warnCount > 0 ? "AUDIT_WARN" : "AUDIT_PASS";
  const report = {
    status,
    auditId: config.auditId,
    mode: "READ_ONLY",
    productionModified: false,
    generatedAt: new Date().toISOString(),
    target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") },
    api: { url: argument("api-url", config.apiUrl), available: !apiError, error: apiError },
    scope: {
      taskCount: manifests.length,
      tasks: manifests.map(({ normalized, manifestPath }) => ({ taskId: normalized.taskId, manifest: path.relative(repoRoot, manifestPath).replaceAll("\\", "/"), rowCount: normalized.rows.length })),
      supersededTasks: config.supersededTasks || [],
    },
    priceVerification: {
      exactPrivateSourceCompared: false,
      productionUnitPricePositiveChecked: true,
      derivedPackagePriceReported: true,
      priceReferencePresenceChecked: true,
      note: "Exact source prices are private and were not reconstructed.",
    },
    summary,
    rows,
  };

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputMarkdownPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const headers = [
    "taskId", "rowNo", "action", "legacySku", "canonicalSku", "status", "issueCodes",
    "currentParentKey", "expectedParentKey", "brand", "type", "flavor", "measureKind",
    "measureMode", "sellUnit", "netQuantity", "netUnit", "packageQuantity", "packageUnit",
    "shopPrice", "derivedPackagePrice", "aliasCanonicalSku", "recipeMismatchCount",
    "cartItems", "orderItems", "priceRows", "imageObjectKey", "apiFound",
  ];
  const flatRows = rows.map((row) => ({
    taskId: row.taskId,
    rowNo: row.rowNo,
    action: row.action,
    legacySku: row.legacySku,
    canonicalSku: row.canonicalSku,
    status: row.status,
    issueCodes: row.issues.map((issue) => issue.code).join(" | "),
    currentParentKey: row.current.productKey,
    expectedParentKey: row.expected.parentKey,
    brand: row.current.brand,
    type: row.current.options?.type,
    flavor: row.current.options?.flavor,
    measureKind: row.current.options?.measure_kind,
    measureMode: row.current.packaging?.measureMode,
    sellUnit: row.current.packaging?.sellUnit,
    netQuantity: row.current.packaging?.netQuantity,
    netUnit: row.current.packaging?.netUnit,
    packageQuantity: row.current.packaging?.packageQuantity,
    packageUnit: row.current.packaging?.packageUnit,
    shopPrice: row.current.shopPrice,
    derivedPackagePrice: row.current.derivedPackagePrice,
    aliasCanonicalSku: row.alias?.canonicalSku,
    recipeMismatchCount: row.current.references?.recipeMismatchCount,
    cartItems: row.current.references?.cartItems,
    orderItems: row.current.references?.orderItems,
    priceRows: row.current.references?.priceRows,
    imageObjectKey: row.current.imageObjectKey,
    apiFound: row.api.found,
  }));
  fs.writeFileSync(outputCsvPath, `${[headers.join(","), ...flatRows.map((row) => headers.map((header) => csv(row[header])).join(","))].join("\n")}\n`, "utf8");
  fs.writeFileSync(outputMarkdownPath, markdown(report), "utf8");

  console.log(JSON.stringify({
    status: report.status,
    productionModified: false,
    totalSkusAudited: summary.totalSkusAudited,
    pass: summary.passCount,
    warn: summary.warnCount,
    blocked: summary.blockedCount,
    correctionTasksProposed: summary.correctionTasksProposed,
    artifacts: {
      json: outputJsonPath,
      csv: outputCsvPath,
      markdown: outputMarkdownPath,
    },
  }, null, 2));
  if (report.status === "CORRECTIONS_REQUIRED") process.exitCode = 2;
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({
    status: "FULL_PRODUCTION_CATALOG_AUDIT_FAILED",
    code: error?.code || "CATALOG_AUDIT_FAILED",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
    productionModified: false,
  }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
