import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { normalizeCatalogCommercialPayload } from "./catalog-commercial-map.mjs";

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
const outputPath = path.resolve(arg(
  "output",
  path.join(repoRoot, "artifacts/catalog-commercial-import/reconciliation.json"),
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const IGNORED_TOKENS = new Set([
  "siro", "syrup", "mut", "puree", "tra", "bot", "duong", "nuoc", "cot",
  "chai", "goi", "hop", "lon", "tui", "thung", "kg", "g", "ml", "lit", "l",
  "loai", "vi", "huong", "cao", "cap", "dac", "san", "pham",
]);

function meaningfulTokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !IGNORED_TOKENS.has(token) && !/^\d+$/.test(token));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function optionValues(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) return [];
  return Object.values(options)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value));
}

function scoreLabel(payloadName, label) {
  const left = meaningfulTokens(payloadName);
  const right = meaningfulTokens(label);
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const common = [...leftSet].filter((token) => rightSet.has(token)).length;
  if (common === 0) return 0;
  const precision = common / rightSet.size;
  const recall = common / leftSet.size;
  const f1 = (2 * precision * recall) / (precision + recall);
  const containment = common === Math.min(leftSet.size, rightSet.size) ? 0.08 : 0;
  return Math.min(1, f1 + containment);
}

function candidateLabels(row) {
  const options = optionValues(row.options);
  return unique([
    row.variantName,
    row.productName,
    `${row.brand || ""} ${row.variantName || ""}`,
    `${row.productName || ""} ${row.variantName || ""}`,
    `${row.brand || ""} ${row.productName || ""} ${row.variantName || ""}`,
    `${row.productName || ""} ${options.join(" ")}`,
    `${row.brand || ""} ${row.productName || ""} ${row.variantName || ""} ${options.join(" ")}`,
  ].map((value) => value.trim()));
}

function scoreCandidate(payloadRow, candidate) {
  const payloadNormalized = normalizeText(payloadRow.name);
  const labels = candidateLabels(candidate);
  const exact = labels.some((label) => normalizeText(label) === payloadNormalized);
  const score = exact ? 1 : Math.max(...labels.map((label) => scoreLabel(payloadRow.name, label)), 0);
  return {
    sku: candidate.sku,
    productName: candidate.productName,
    variantName: candidate.variantName,
    brand: candidate.brand,
    options: candidate.options || {},
    priceMode: candidate.priceMode,
    shopPrice: candidate.shopPrice === null ? null : Number(candidate.shopPrice),
    score: Math.round(score * 1000) / 1000,
    exact,
  };
}

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '30s'");
  const result = await client.query(`SELECT
    variant.sku,
    variant.name AS "variantName",
    product.name AS "productName",
    product.brand,
    variant.options,
    variant.price_mode AS "priceMode",
    variant.shop_price::float8 AS "shopPrice"
  FROM catalog_variants variant
  JOIN catalog_products product ON product.id = variant.product_id
  WHERE product.catalog_version = 'hung-phat-v2'
    AND product.status = 'active'
    AND variant.catalog_version = 'hung-phat-v2'
    AND variant.is_active = true
    AND variant.is_public = true
    AND variant.status IN ('active', 'market_price')
  ORDER BY product.sort_order, variant.sort_order, variant.sku`);
  await client.query("ROLLBACK");

  const candidates = result.rows;
  const rows = payload.rows.map((payloadRow) => {
    const ranked = candidates
      .map((candidate) => scoreCandidate(payloadRow, candidate))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.sku.localeCompare(right.sku))
      .slice(0, 5);
    const best = ranked[0] || null;
    const second = ranked[1] || null;
    const margin = best ? best.score - (second?.score || 0) : 0;
    let matchStatus = "unmatched";
    if (best?.exact && margin >= 0.1) matchStatus = "exact_unique";
    else if (best && best.score >= 0.86 && margin >= 0.12) matchStatus = "strong_unique";
    else if (best && best.score >= 0.68) matchStatus = "ambiguous";

    return {
      sourceSku: payloadRow.sku,
      sourceName: payloadRow.name,
      sourceGroup: payloadRow.group,
      matchStatus,
      suggestedSku: ["exact_unique", "strong_unique"].includes(matchStatus) ? best.sku : null,
      bestScore: best?.score || 0,
      scoreMargin: Math.round(margin * 1000) / 1000,
      candidates: ranked,
    };
  });

  const summary = {
    payloadRows: payload.rows.length,
    activeCatalogVariants: candidates.length,
    exactUnique: rows.filter((row) => row.matchStatus === "exact_unique").length,
    strongUnique: rows.filter((row) => row.matchStatus === "strong_unique").length,
    ambiguous: rows.filter((row) => row.matchStatus === "ambiguous").length,
    unmatched: rows.filter((row) => row.matchStatus === "unmatched").length,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    status: "RECONCILIATION_PASS",
    applied: false,
    payloadHash: payload.payloadHash,
    sourceKey: payload.sourceKey,
    target: {
      host: targetUrl.hostname,
      port: targetUrl.port || "5432",
      database: targetUrl.pathname.replace(/^\//, ""),
    },
    summary,
    rows,
    note: "Read-only candidate report. Suggested SKU values are not applied automatically.",
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    status: "RECONCILIATION_PASS",
    applied: false,
    outputPath,
    summary,
    note: "Read-only candidate report. No catalog row was inserted or updated.",
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
