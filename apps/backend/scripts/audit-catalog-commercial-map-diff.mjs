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

const inputPath = path.resolve(arg(
  "file",
  path.join(repoRoot, "data/private/catalog-imports/kenh-quan-commercial-map.json"),
));
const outputJsonPath = path.resolve(arg(
  "output-json",
  path.join(repoRoot, "artifacts/catalog-commercial-import/dry-run-diff.json"),
));
const outputCsvPath = path.resolve(arg(
  "output-csv",
  path.join(repoRoot, "artifacts/catalog-commercial-import/dry-run-diff.csv"),
));

if (!fs.existsSync(inputPath)) throw new Error(`Commercial map file is missing: ${inputPath}`);
const payload = normalizeCatalogCommercialPayload(
  JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "")),
);

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
const targetUrl = new URL(connectionString);
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname);
const pool = new Pool({
  connectionString,
  ssl: localConnection ? false : { rejectUnauthorized: false },
  max: 1,
});

function normalizePackaging(row) {
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
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '30s'");
  const skus = payload.rows.map((row) => row.sku);
  const variantResult = await client.query(
    `SELECT
       variant.id::text AS "variantId",
       variant.sku,
       variant.name AS "variantName",
       product.name AS "productName",
       variant.shop_price::float8 AS "shopPrice",
       variant.options,
       variant.price_mode AS "priceMode",
       variant.status AS "variantStatus",
       variant.is_active AS "isActive",
       variant.is_public AS "isPublic",
       variant.is_orderable AS "isOrderable"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     WHERE variant.sku = ANY($1::text[])
     ORDER BY variant.sku`,
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
         raw_source AS "rawSource"
       FROM catalog_variant_packaging_specs
       WHERE variant_id = ANY($1::uuid[])
       ORDER BY variant_id`,
      [variantIds],
    )
    : { rows: [] };
  await client.query("ROLLBACK");

  const packagingByVariant = new Map(
    packagingResult.rows.map((row) => [row.variantId, normalizePackaging(row)]),
  );
  const stateBySku = new Map(variantResult.rows.map((row) => [row.sku, row]));

  const rows = payload.rows.map((row) => {
    const current = stateBySku.get(row.sku);
    if (!current) {
      return {
        sku: row.sku,
        sourceName: row.name,
        status: "missing",
      };
    }

    const currentPackaging = packagingByVariant.get(current.variantId) || null;
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
    const nextOptions = { ...(current.options || {}), ...buildCommercialOptions(row) };
    const currentPrice = current.shopPrice === null ? null : Number(current.shopPrice);
    const priceChanged = currentPrice !== row.unitPrice;
    const packagingChanged = stableStringify(currentPackaging) !== stableStringify(nextPackaging);
    const packagingAction = !currentPackaging
      ? "create"
      : packagingChanged
        ? "update"
        : "unchanged";

    return {
      sku: row.sku,
      sourceName: row.name,
      catalogProductName: current.productName,
      catalogVariantName: current.variantName,
      status: "ready",
      currentPrice,
      nextPrice: row.unitPrice,
      priceDelta: currentPrice === null ? null : row.unitPrice - currentPrice,
      priceChanged,
      currentPackaging,
      nextPackaging,
      packagingAction,
      currentOptions: current.options || {},
      nextOptions,
      priceMode: current.priceMode,
      variantStatus: current.variantStatus,
      isActive: current.isActive === true,
      isPublic: current.isPublic === true,
      isOrderable: current.isOrderable === true,
    };
  });

  const summary = {
    rowCount: rows.length,
    missingCount: rows.filter((row) => row.status === "missing").length,
    priceChangeCount: rows.filter((row) => row.priceChanged).length,
    packagingCreateCount: rows.filter((row) => row.packagingAction === "create").length,
    packagingUpdateCount: rows.filter((row) => row.packagingAction === "update").length,
    unchangedPackagingCount: rows.filter((row) => row.packagingAction === "unchanged").length,
  };

  const report = {
    status: "DRY_RUN_DIFF_PASS",
    applied: false,
    payloadHash: payload.payloadHash,
    sourceKey: payload.sourceKey,
    target: {
      host: targetUrl.hostname,
      port: targetUrl.port || "5432",
      database: targetUrl.pathname.replace(/^\//, ""),
    },
    summary,
    priceChanges: rows.filter((row) => row.priceChanged),
    rows,
    note: "Read-only diff. No catalog row was inserted or updated.",
  };

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const csvHeaders = [
    "sku",
    "sourceName",
    "catalogProductName",
    "catalogVariantName",
    "currentPrice",
    "nextPrice",
    "priceDelta",
    "priceChanged",
    "packagingAction",
    "sellUnit",
    "packageQuantity",
    "packageUnit",
    "netQuantity",
    "netUnit",
  ];
  const csvRows = rows.map((row) => {
    const packaging = row.nextPackaging || {};
    return [
      row.sku,
      row.sourceName,
      row.catalogProductName,
      row.catalogVariantName,
      row.currentPrice,
      row.nextPrice,
      row.priceDelta,
      row.priceChanged,
      row.packagingAction,
      packaging.sellUnit,
      packaging.packageQuantity,
      packaging.packageUnit,
      packaging.netQuantity,
      packaging.netUnit,
    ].map(csvCell).join(",");
  });
  fs.writeFileSync(outputCsvPath, `${csvHeaders.map(csvCell).join(",")}\n${csvRows.join("\n")}\n`);

  console.log(JSON.stringify({
    status: "DRY_RUN_DIFF_PASS",
    applied: false,
    outputJsonPath,
    outputCsvPath,
    summary,
    priceChanges: report.priceChanges.map((row) => ({
      sku: row.sku,
      name: row.sourceName,
      currentPrice: row.currentPrice,
      nextPrice: row.nextPrice,
      priceDelta: row.priceDelta,
    })),
    note: "Read-only diff. No catalog row was inserted or updated.",
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
