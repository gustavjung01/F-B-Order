import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const manifestPath = path.resolve(repoRoot, "data/catalog-remap/sinh-to-mut-correction-01.json");
const sourceCatalogPath = path.resolve(repoRoot, "data/catalog/hung-phat/v2/manifests/products.json");
const targetPath = path.resolve(repoRoot, "data/private/catalog-imports/sinh-to-mut-correction-01.private.json");
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function fail(message) {
  console.error(`[prepare-sinh-to-mut-correction-private] ${message}`);
  process.exit(1);
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function priceMapFromCatalog(raw) {
  const map = new Map();
  for (const product of Array.isArray(raw) ? raw : []) {
    for (const variant of Array.isArray(product.variants) ? product.variants : []) {
      const sku = String(variant.sku || "").trim().toUpperCase();
      if (!sku) continue;
      map.set(sku, {
        unitPrice: Number(variant.price),
        sourceRow: null,
        sourceFile: sourceCatalogPath,
        sourceMatchStatus: "catalog-source",
      });
    }
  }
  return map;
}

async function databasePriceMap(skus) {
  const dotenv = (await import("dotenv")).default;
  const pg = (await import("pg")).default;
  for (const envPath of [path.join(repoRoot, ".env"), path.resolve(here, "../.env"), path.resolve(here, "../.env.local")]) {
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
  }
  const url = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL || "";
  if (!url) return new Map();
  const target = new URL(url);
  const localConnection = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
  const { Pool } = pg;
  const pool = new Pool({ connectionString: url, ssl: localConnection ? false : { rejectUnauthorized: false }, max: 1 });
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT UPPER(variant.sku) AS sku, variant.shop_price::float8 AS "unitPrice"
       FROM catalog_variants variant
       WHERE UPPER(variant.sku) = ANY($1::text[])`,
      [skus.map((sku) => String(sku).trim().toUpperCase())],
    );
    return new Map(result.rows.map((row) => [row.sku, { unitPrice: Number(row.unitPrice), sourceRow: null, sourceFile: null, sourceMatchStatus: "database-snapshot" }]));
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const manifest = loadJson(manifestPath, "Correction manifest");
  const sourceCatalog = loadJson(sourceCatalogPath, "Source catalog");
  if (!Array.isArray(manifest.rows) || manifest.rows.length !== 25) fail("Correction manifest must contain 25 rows.");

  const sourceBySku = priceMapFromCatalog(sourceCatalog);
  const missing = [];
  for (const expected of manifest.rows) {
    const skuCandidates = [expected.canonicalSku, expected.legacySku].map((value) => String(value || "").trim().toUpperCase()).filter(Boolean);
    let source = null;
    for (const sku of skuCandidates) {
      source = sourceBySku.get(sku) || null;
      if (source) break;
    }
    if (!source) missing.push(expected.canonicalSku);
  }

  const dbPrices = missing.length ? await databasePriceMap(missing) : new Map();
  const rows = manifest.rows.map((expected) => {
    const skuCandidates = [expected.canonicalSku, expected.legacySku].map((value) => String(value || "").trim().toUpperCase()).filter(Boolean);
    let source = null;
    let matchedSku = null;
    for (const sku of skuCandidates) {
      source = sourceBySku.get(sku) || null;
      if (source) {
        matchedSku = sku;
        break;
      }
    }
    if (!source) {
      for (const sku of skuCandidates) {
        source = dbPrices.get(sku) || null;
        if (source) {
          matchedSku = sku;
          break;
        }
      }
    }
    if (!source) fail(`Cannot resolve price for ${expected.canonicalSku}. Run this script where the production DB is reachable.`);
    const unitPrice = Number(source.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) fail(`Invalid unitPrice for ${expected.canonicalSku}.`);
    return {
      sku: expected.canonicalSku,
      action: expected.action,
      legacySku: expected.legacySku || "",
      name: expected.name,
      group: manifest.catalogGroupName,
      detailGroup: expected.detailGroup,
      status: "ready",
      measureMode: "measured",
      sellUnit: expected.sellUnit,
      packageQuantity: expected.packageQuantity,
      packageUnit: expected.packageUnit,
      netQuantity: expected.netQuantity,
      netUnit: expected.netUnit,
      unitPrice,
      derivedPackagePrice: Math.round(unitPrice * Number(expected.packageQuantity)),
      sourceRow: expected.sourceRow,
      sourceMatchStatus: expected.legacySku ? `catalog-source:${matchedSku || expected.legacySku}` : `catalog-source:${matchedSku || expected.canonicalSku}`,
    };
  });

  const payload = {
    schemaVersion: 1,
    taskId: manifest.taskId,
    sourceKey: "sinh-to-mut-correction-01",
    sourceFile: sourceCatalogPath,
    rows,
  };
  payload.payloadHash = sha256({ schemaVersion: payload.schemaVersion, sourceKey: payload.sourceKey, rows: payload.rows });

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) {
    const backup = `${targetPath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    fs.copyFileSync(targetPath, backup);
    console.log(`[prepare-sinh-to-mut-correction-private] Backup: ${backup}`);
  }
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("[prepare-sinh-to-mut-correction-private] PASS");
  console.log(`[prepare-sinh-to-mut-correction-private] Repo: ${repoRoot}`);
  console.log(`[prepare-sinh-to-mut-correction-private] Manifest: ${manifestPath}`);
  console.log(`[prepare-sinh-to-mut-correction-private] Source catalog: ${sourceCatalogPath}`);
  console.log(`[prepare-sinh-to-mut-correction-private] Target: ${targetPath}`);
  console.log(`[prepare-sinh-to-mut-correction-private] Rows: ${rows.length}`);
  console.log(`[prepare-sinh-to-mut-correction-private] UPDATE_EXISTING: ${rows.filter((row) => row.action === "UPDATE_EXISTING").length}`);
  console.log(`[prepare-sinh-to-mut-correction-private] REMAP: ${rows.filter((row) => row.action === "REMAP").length}`);
  console.log(`[prepare-sinh-to-mut-correction-private] Payload hash: ${payload.payloadHash}`);
  console.log("[prepare-sinh-to-mut-correction-private] Không ghi database, production hoặc R2.");
}

main().catch((error) => {
  console.error(`[prepare-sinh-to-mut-correction-private] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
