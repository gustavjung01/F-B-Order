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

const outputPath = path.resolve(
  repoRoot,
  getArg("output", "artifacts/catalog/hung-phat-v2-preview/index.html"),
);
const sourceImages = path.resolve(getArg(
  "source-images",
  "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/preview/assets",
));
const manifestDir = path.join(repoRoot, "data/catalog/hung-phat/v2/manifests");
const productsPath = path.join(manifestDir, "products.json");
const versionPath = path.join(manifestDir, "catalog-version.json");
const templatePath = path.join(scriptDir, "phase3-preview.template.html");
const cssPath = path.join(scriptDir, "phase3-preview.css");
const mobileCssPath = path.join(scriptDir, "phase3-mobile.css");
const jsPath = path.join(scriptDir, "phase3-preview.js");
const filterOrderPath = path.join(scriptDir, "phase3-filter-order.js");

for (const required of [productsPath, versionPath, templatePath, cssPath, mobileCssPath, jsPath, filterOrderPath]) {
  assert(fs.existsSync(required), `Missing required file: ${required}`);
}
assert(fs.existsSync(sourceImages), `Local image source does not exist: ${sourceImages}`);

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

const outputDir = path.dirname(outputPath);
const assetDir = path.join(outputDir, "assets");
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(assetDir, { recursive: true });

let copiedImageCount = 0;
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

  const manifestImageAvailable = product?.image?.status === "available" && Boolean(product?.image?.objectKey);
  const localImagePath = path.join(sourceImages, `${product.imageKey}.webp`);
  const localImageAvailable = manifestImageAvailable && fs.existsSync(localImagePath);
  if (localImageAvailable) {
    fs.copyFileSync(localImagePath, path.join(assetDir, `${product.imageKey}.webp`));
    copiedImageCount += 1;
  }

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
    imageStatus: localImageAvailable ? "available" : "missing",
    imageQualityStatus: product?.image?.qualityStatus || "UNKNOWN",
    imageObjectKey: manifestImageAvailable ? product.image.objectKey : "",
    imageUrl: localImageAvailable ? `./assets/${product.imageKey}.webp` : "",
    optionGroups: Array.isArray(product.optionGroups) ? product.optionGroups : [],
    variants,
    duplicateSkus,
    autoIssues: {
      missingImage: !localImageAvailable,
      wrongName: hasSuspiciousName(product.name),
      wrongOption: hasOptionIssue(product),
      duplicateSku: duplicateSkus.length > 0,
      wrongPrice: priceIssue,
    },
  };
});

assert(copiedImageCount === 269, `Expected 269 local preview images, copied ${copiedImageCount}.`);

const issueKeys = ["missingImage", "wrongName", "wrongOption", "duplicateSku", "wrongPrice"];
const issueCounts = Object.fromEntries(
  issueKeys.map((key) => [key, previewProducts.filter((product) => product.autoIssues[key]).length]),
);

const payload = {
  catalogVersion: version.catalogVersion || "hung-phat-v2",
  generatedAt: new Date().toISOString(),
  expectedCardCount: 275,
  localImageMode: true,
  products: previewProducts,
  issueCounts,
};

const template = fs.readFileSync(templatePath, "utf8");
assert(template.includes("__CATALOG_PAYLOAD__"), "Preview template is missing payload placeholder.");
const html = template.replace("__CATALOG_PAYLOAD__", safeJson(payload));

fs.writeFileSync(outputPath, html, "utf8");
fs.copyFileSync(cssPath, path.join(outputDir, "preview.css"));
fs.copyFileSync(mobileCssPath, path.join(outputDir, "mobile.css"));
fs.copyFileSync(jsPath, path.join(outputDir, "preview.js"));
fs.copyFileSync(filterOrderPath, path.join(outputDir, "filter-order.js"));

console.log(JSON.stringify({
  phase: 3,
  status: "PASS",
  catalogVersion: payload.catalogVersion,
  cardCount: previewProducts.length,
  copiedImageCount,
  missingImageCount: issueCounts.missingImage,
  duplicateSkuCardCount: issueCounts.duplicateSku,
  invalidPriceCardCount: issueCounts.wrongPrice,
  suspiciousNameCardCount: issueCounts.wrongName,
  optionIssueCardCount: issueCounts.wrongOption,
  output: outputPath,
  behavior: "popup-ordering-no-route-change",
  imageMode: "local-assets",
}, null, 2));
