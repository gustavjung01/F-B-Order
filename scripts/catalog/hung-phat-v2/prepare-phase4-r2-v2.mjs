import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readCsv } from "./csv-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function unique(values) {
  return [...new Set(values)];
}
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function normalize(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function industryFor(sourceGroup) {
  const value = normalize(sourceGroup);
  if (value.includes("my cay") || value.includes("mi cay")) return "Nguyên Liệu Mì Cay";
  if (value.includes("dong lanh")) return "Đông Lạnh";
  if (value.includes("banh trang")) return "Nguyên Liệu Bánh Tráng";
  if (value.includes("ong hut") || value.includes("muong") || value.includes("nap") || value.includes("bao ly")) return "Bao Bì";
  return "Nguyên Liệu Trà Sữa";
}
function subcategoryFor(sourceGroup) {
  return clean(sourceGroup).replace(/^\d+\s*[.\-]?\s*/u, "").replace(/^\.+\s*/u, "");
}
function parseThousands(value) {
  const raw = clean(value);
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const amount = Math.round(Number(raw) * 1000);
  return amount > 0 ? amount : null;
}
function parseVnd(value) {
  const raw = clean(value);
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const amount = Math.round(Number(raw));
  return amount > 0 ? amount : null;
}

const copyImages = process.argv.includes("--copy-images");
const generatedRoot = path.resolve(getArg("generated-root", path.join(repoRoot, "data/catalog/hung-phat/v2/generated")));
const normalizedDir = path.resolve(getArg("normalized-dir", generatedRoot));
const manifestsDir = path.resolve(getArg("manifests-dir", path.join(generatedRoot, "manifests")));
const productsDir = path.resolve(getArg("products-dir", path.join(generatedRoot, "products")));
const sourceImages = path.resolve(getArg(
  "source-images",
  "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/preview/assets",
));
const policyPath = path.resolve(getArg("policy", path.join(repoRoot, "data/catalog/hung-phat/v2/price-policies.csv")));
const summaryPath = path.join(normalizedDir, "catalog-summary.json");

for (const required of [normalizedDir, policyPath, summaryPath]) {
  assert(fs.existsSync(required), `Missing required path: ${required}`);
}
if (copyImages) assert(fs.existsSync(sourceImages), `Missing local image source: ${sourceImages}`);

const parents = readCsv(path.join(normalizedDir, "product-parents.csv"));
const sourceVariants = readCsv(path.join(normalizedDir, "product-variants.csv"));
const policies = readCsv(policyPath);
const summary = readJson(summaryPath);
const expectedParentCount = Number(summary.parentCardCount);
const expectedVariantCount = Number(summary.variantCount);

assert(summary.status === "PASS", `Parent-map summary is not PASS: ${summary.status}`);
assert(parents.length === expectedParentCount, `Expected ${expectedParentCount} parents, found ${parents.length}.`);
assert(sourceVariants.length === expectedVariantCount, `Expected ${expectedVariantCount} variants, found ${sourceVariants.length}.`);

const policyBySku = new Map();
for (const policy of policies) {
  assert(policy.sku, "Price policy row missing sku.");
  assert(!policyBySku.has(policy.sku), `Duplicate price policy for ${policy.sku}.`);
  assert(["fixed", "market"].includes(policy.price_mode), `Invalid price_mode for ${policy.sku}.`);
  policyBySku.set(policy.sku, policy);
}

const parentKeys = parents.map((row) => row.parent_key);
const variantKeys = sourceVariants.map((row) => row.variant_key);
const skus = sourceVariants.map((row) => row.sku);
assert(unique(parentKeys).length === expectedParentCount, "Duplicate parent_key found.");
assert(unique(variantKeys).length === expectedVariantCount, "Duplicate variant_key found.");
assert(unique(skus).length === expectedVariantCount, "Duplicate SKU found.");
const parentKeySet = new Set(parentKeys);
assert(sourceVariants.every((row) => parentKeySet.has(row.parent_key)), "Orphan variant found.");

fs.rmSync(manifestsDir, { recursive: true, force: true });
fs.mkdirSync(manifestsDir, { recursive: true });
if (copyImages) {
  fs.rmSync(productsDir, { recursive: true, force: true });
  fs.mkdirSync(productsDir, { recursive: true });
}

const imageKeys = unique(
  sourceVariants
    .filter((row) => row.image_status !== "MISSING" && clean(row.image_key))
    .map((row) => row.image_key),
);
if (copyImages) {
  for (const imageKey of imageKeys) {
    const source = path.join(sourceImages, `${imageKey}.webp`);
    assert(fs.existsSync(source), `Missing mapped local image: ${source}`);
    fs.copyFileSync(source, path.join(productsDir, `${imageKey}.webp`));
  }
}
const imageSet = new Set(imageKeys);

const optionLabels = {
  flavor: "Vị", size: "Kích thước", type: "Loại", color: "Màu",
  packing: "Quy cách", pack: "Quy cách", diameter: "Đường kính",
  lid: "Loại nắp", flavor_or_type: "Loại",
};

const variantsManifest = [];
const imagesManifest = [];
const variantsByParent = new Map();
const marketPriceSkus = [];
const missingImageKeys = [];

for (const source of sourceVariants) {
  const policy = policyBySku.get(source.sku);
  const priceMode = policy?.price_mode === "market" ? "market" : "fixed";
  const sourceShopPrice = parseThousands(source.price_khtt_nghin);
  const overrideShopPrice = parseVnd(policy?.shop_price_vnd);
  const shopPrice = priceMode === "market" ? null : (overrideShopPrice ?? sourceShopPrice);
  const retailPrice = parseVnd(policy?.retail_price_vnd);

  if (priceMode === "market") marketPriceSkus.push(source.sku);
  else assert(shopPrice !== null, `Fixed-price SKU has no valid shop price: ${source.sku}`);

  const rawOptions = source.options_json ? JSON.parse(source.options_json) : {};
  const options = Object.fromEntries(Object.entries(rawOptions).map(([key, value]) => [optionLabels[key] || key, value]));
  const imageAvailable = imageSet.has(source.image_key);
  if (!imageAvailable && clean(source.image_key)) missingImageKeys.push(source.image_key);
  const objectKey = imageAvailable ? `catalog/hung-phat/v2/products/${source.image_key}.webp` : null;

  const variant = {
    parentKey: source.parent_key,
    variantKey: source.variant_key,
    sku: source.sku,
    name: source.raw_name,
    options,
    priceMode,
    priceLabel: priceMode === "market" ? "Thời giá" : null,
    shopPrice,
    retailPrice,
    priceStatus: priceMode === "market" ? "market" : "ready",
    retailPriceStatus: retailPrice ? "ready" : "not_set",
    imageKey: source.image_key || null,
    image: { status: imageAvailable ? "available" : "missing", objectKey },
    status: priceMode === "market" ? "market_price" : "active",
    isOrderable: priceMode === "fixed",
  };
  variantsManifest.push(variant);
  if (!variantsByParent.has(source.parent_key)) variantsByParent.set(source.parent_key, []);
  variantsByParent.get(source.parent_key).push(variant);

  if (imageAvailable) {
    imagesManifest.push({
      imageKey: source.image_key,
      variantKey: source.variant_key,
      sku: source.sku,
      objectKey,
      role: "variant",
      mappingStatus: "exact",
    });
  }
}

const mappedImageCount = imagesManifest.length;
const missingImageCount = unique(missingImageKeys).length;
assert(variantsManifest.length === expectedVariantCount, `Variant manifest count must be ${expectedVariantCount}.`);
assert(unique(imagesManifest.map((row) => row.objectKey)).length === mappedImageCount, "Duplicate image objectKey found.");
assert(missingImageCount === Number(summary.missingImageCount), `Expected ${summary.missingImageCount} missing images, found ${missingImageCount}.`);
assert(marketPriceSkus.length === 3, `Expected 3 market-price SKUs, found ${marketPriceSkus.length}.`);

const productsManifest = parents.map((parent) => {
  const variants = variantsByParent.get(parent.parent_key) || [];
  assert(variants.length > 0, `Parent has no variants: ${parent.parent_key}`);
  const sourceGroup = sourceVariants.find((row) => row.parent_key === parent.parent_key)?.source_group || "Chưa phân nhóm";
  const optionValues = new Map();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      if (!optionValues.has(name)) optionValues.set(name, []);
      if (!optionValues.get(name).includes(value)) optionValues.get(name).push(value);
    }
  }
  const fixedPrices = variants.map((row) => row.shopPrice).filter((value) => Number.isFinite(value) && value > 0);
  const marketCount = variants.filter((row) => row.priceMode === "market").length;
  const priceMode = marketCount === variants.length ? "market" : marketCount > 0 ? "mixed" : "fixed";
  const preferredCover = parent.cover_image_key;
  const coverImageKey = imageSet.has(preferredCover)
    ? preferredCover
    : variants.find((row) => row.image.status === "available")?.imageKey || null;

  return {
    productKey: parent.parent_key,
    name: parent.name,
    brand: parent.brand || "",
    industry: industryFor(sourceGroup),
    subcategory: subcategoryFor(sourceGroup),
    sourceGroup,
    priceMode,
    priceLabel: priceMode === "market" ? "Thời giá" : null,
    shopPriceFrom: fixedPrices.length ? Math.min(...fixedPrices) : null,
    retailPriceFrom: null,
    retailPricingStatus: "deferred",
    status: priceMode === "market" ? "market_price" : "active",
    imageKey: coverImageKey,
    image: {
      status: coverImageKey ? "available" : "missing",
      objectKey: coverImageKey ? `catalog/hung-phat/v2/products/${coverImageKey}.webp` : null,
    },
    optionGroups: [...optionValues.entries()]
      .filter(([, values]) => values.length > 1)
      .map(([name, values]) => ({ name, values })),
    variantKeys: variants.map((row) => row.variantKey),
  };
});

const industryOrder = ["Nguyên Liệu Trà Sữa", "Nguyên Liệu Mì Cay", "Đông Lạnh", "Nguyên Liệu Bánh Tráng", "Bao Bì"];
const categoriesManifest = industryOrder.map((name, index) => {
  const products = productsManifest.filter((row) => row.industry === name);
  return {
    key: normalize(name).replace(/\s+/g, "-"),
    name,
    order: index + 1,
    cardCount: products.length,
    subcategories: unique(products.map((row) => row.subcategory)).sort((a, b) => a.localeCompare(b, "vi")),
  };
}).filter((row) => row.cardCount > 0);

const catalogVersionManifest = {
  catalogVersion: "hung-phat-v2",
  status: "staging",
  sourceRows: Number(summary.sourceProductCount),
  excludedRows: 0,
  parentCardCount: productsManifest.length,
  variantCount: variantsManifest.length,
  mappedImageCount,
  missingImageCount,
  marketPriceCount: marketPriceSkus.length,
  marketPriceSkus: marketPriceSkus.sort(),
  invalidPriceCount: 0,
  duplicateProductKey: 0,
  duplicateVariantKey: 0,
  duplicateSku: 0,
  orphanVariant: 0,
  categoryMissing: 0,
  retailPricingPhase: "deferred",
  r2Prefixes: {
    products: "catalog/hung-phat/v2/products/",
    manifests: "catalog/hung-phat/v2/manifests/",
  },
  missingImageKeys: unique(missingImageKeys).sort(),
  imagesCopiedLocally: copyImages,
  legacyPrefixesModified: false,
};

writeJson(path.join(manifestsDir, "products.json"), productsManifest);
writeJson(path.join(manifestsDir, "product-variants.json"), variantsManifest);
writeJson(path.join(manifestsDir, "product-images.json"), imagesManifest);
writeJson(path.join(manifestsDir, "categories.json"), categoriesManifest);
writeJson(path.join(manifestsDir, "catalog-version.json"), catalogVersionManifest);

console.log(JSON.stringify({
  phase: 4,
  status: copyImages ? "R2_READY_PASS" : "MANIFEST_PASS",
  parentCardCount: productsManifest.length,
  variantCount: variantsManifest.length,
  mappedImageCount,
  missingImageCount,
  copiedImageCount: copyImages ? imageKeys.length : 0,
  manifestCount: 5,
  marketPriceCount: marketPriceSkus.length,
  marketPriceSkus: marketPriceSkus.sort(),
  invalidPriceCount: 0,
  manifestsDir,
  productsDir: copyImages ? productsDir : null,
}, null, 2));
