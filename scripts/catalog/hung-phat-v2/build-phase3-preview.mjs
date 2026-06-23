import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function unique(values) {
  return [...new Set(values)];
}

function hasSuspiciousName(name) {
  const text = String(name || "");
  return (
    text.trim() !== text ||
    /\s{2,}/.test(text) ||
    /\uFFFD/.test(text) ||
    /[\u0000-\u001F]/.test(text) ||
    text.trim().length < 3
  );
}

function hasOptionIssue(product) {
  const groups = Array.isArray(product.optionGroups) ? product.optionGroups : [];
  const groupNames = groups.map((group) => String(group?.name || "").trim());
  if (groupNames.some((name) => !name) || unique(groupNames).length !== groupNames.length) return true;

  for (const group of groups) {
    const values = Array.isArray(group?.values)
      ? group.values.map((value) => String(value || "").trim())
      : [];
    if (!values.length || values.some((value) => !value) || unique(values).length !== values.length) return true;
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  return variants.some((variant) => {
    if (!variant || !String(variant.sku || "").trim()) return true;
    if (!variant.options || typeof variant.options !== "object" || Array.isArray(variant.options)) return true;
    return Object.values(variant.options).some((value) => !String(value || "").trim());
  });
}

const publicBaseUrl = normalizeBaseUrl(
  getArg("public-base-url", process.env.R2_PUBLIC_BASE_URL || "https://img.bepsi.click"),
);
const outputPath = path.resolve(
  repoRoot,
  getArg("output", "artifacts/catalog/hung-phat-v2-preview/index.html"),
);
const manifestDir = path.join(repoRoot, "data/catalog/hung-phat/v2/manifests");
const productsPath = path.join(manifestDir, "products.json");
const versionPath = path.join(manifestDir, "catalog-version.json");
const templatePath = path.join(scriptDir, "phase3-preview.template.html");
const cssPath = path.join(scriptDir, "phase3-preview.css");
const jsPath = path.join(scriptDir, "phase3-preview.js");

assert(fs.existsSync(productsPath), `Missing manifest: ${productsPath}`);
assert(fs.existsSync(versionPath), `Missing manifest: ${versionPath}`);
assert(fs.existsSync(templatePath), `Missing template: ${templatePath}`);
assert(fs.existsSync(cssPath), `Missing stylesheet: ${cssPath}`);
assert(fs.existsSync(jsPath), `Missing script: ${jsPath}`);
assert(publicBaseUrl, "Public base URL cannot be empty.");

const products = readJson(productsPath);
const version = readJson(versionPath);
assert(Array.isArray(products), "products.json must contain an array.");
assert(products.length === 275, `Expected 275 products, found ${products.length}.`);

const skuCounts = new Map();
for (const product of products) {
  for (const variant of Array.isArray(product.variants) ? product.variants : []) {
    const sku = String(variant?.sku || "").trim();
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }
}

const previewProducts = products.map((product, index) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variantPrices = variants
    .map((variant) => Number(variant?.price))
    .filter((price) => Number.isFinite(price));
  const minVariantPrice = variantPrices.length ? Math.min(...variantPrices) : null;
  const duplicateSkus = unique(
    variants
      .map((variant) => String(variant?.sku || "").trim())
      .filter((sku) => sku && (skuCounts.get(sku) || 0) > 1),
  );

  const imageAvailable = product?.image?.status === "available" && Boolean(product?.image?.objectKey);
  const priceFrom = Number(product.priceFrom);
  const priceIssue =
    !Number.isFinite(priceFrom) ||
    priceFrom <= 0 ||
    !variantPrices.length ||
    variantPrices.some((price) => price <= 0) ||
    minVariantPrice !== priceFrom;

  return {
    index,
    productKey: product.productKey,
    name: product.name,
    brand: product.brand || "",
    category: product.category || "Chưa phân nhóm",
    priceFrom,
    status: product.status || "draft",
    imageKey: product.imageKey || "",
    imageStatus: imageAvailable ? "available" : "missing",
    imageQualityStatus: product?.image?.qualityStatus || "UNKNOWN",
    imageObjectKey: imageAvailable ? product.image.objectKey : "",
    imageUrl: imageAvailable ? `${publicBaseUrl}/${product.image.objectKey}` : "",
    optionGroups: Array.isArray(product.optionGroups) ? product.optionGroups : [],
    variants,
    duplicateSkus,
    autoIssues: {
      missingImage: !imageAvailable,
      wrongName: hasSuspiciousName(product.name),
      wrongOption: hasOptionIssue(product),
      duplicateSku: duplicateSkus.length > 0,
      wrongPrice: priceIssue,
    },
  };
});

const issueKeys = ["missingImage", "wrongName", "wrongOption", "duplicateSku", "wrongPrice"];
const issueCounts = Object.fromEntries(
  issueKeys.map((key) => [key, previewProducts.filter((product) => product.autoIssues[key]).length]),
);

const payload = {
  catalogVersion: version.catalogVersion || "hung-phat-v2",
  generatedAt: new Date().toISOString(),
  publicBaseUrl,
  expectedCardCount: 275,
  products: previewProducts,
  issueCounts,
};

const template = fs.readFileSync(templatePath, "utf8");
assert(template.includes("__CATALOG_PAYLOAD__"), "Preview template is missing __CATALOG_PAYLOAD__ placeholder.");
const html = template.replace("__CATALOG_PAYLOAD__", safeJson(payload));

const outputDir = path.dirname(outputPath);
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
fs.copyFileSync(cssPath, path.join(outputDir, "preview.css"));
fs.copyFileSync(jsPath, path.join(outputDir, "preview.js"));

console.log(JSON.stringify({
  phase: 3,
  status: "PASS",
  catalogVersion: payload.catalogVersion,
  cardCount: previewProducts.length,
  missingImageCount: issueCounts.missingImage,
  duplicateSkuCardCount: issueCounts.duplicateSku,
  invalidPriceCardCount: issueCounts.wrongPrice,
  suspiciousNameCardCount: issueCounts.wrongName,
  optionIssueCardCount: issueCounts.wrongOption,
  output: outputPath,
  behavior: "popup-only-no-route-change",
}, null, 2));
