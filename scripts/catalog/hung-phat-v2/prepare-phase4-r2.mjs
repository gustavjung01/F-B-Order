import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readCsv } from "./csv-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeForMatch(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function industryFor(sourceGroup) {
  const normalized = normalizeForMatch(sourceGroup);
  if (normalized.includes("my cay") || normalized.includes("mi cay")) return "Nguyên Liệu Mì Cay";
  if (normalized.includes("dong lanh")) return "Đông Lạnh";
  if (normalized.includes("banh trang")) return "Nguyên Liệu Bánh Tráng";
  if (
    normalized.includes("ong hut") ||
    normalized.includes("muong") ||
    normalized.includes("nap") ||
    normalized.includes("bao ly")
  ) return "Bao Bì";
  return "Nguyên Liệu Trà Sữa";
}

function subcategoryFor(sourceGroup) {
  return clean(sourceGroup)
    .replace(/^\d+\s*[.\-]?\s*/u, "")
    .replace(/^\.+\s*/u, "");
}

const optionLabels = {
  flavor: "Vị",
  size: "Kích thước",
  type: "Loại",
  color: "Màu",
  packing: "Quy cách",
  pack: "Quy cách",
  diameter: "Đường kính",
  lid: "Loại nắp",
  flavor_or_type: "Loại",
};

const valueLabels = {
  dau: "Dâu",
  dao: "Đào",
  oi: "Ổi",
  "viet quoc": "Việt quất",
  "chanh day": "Chanh dây",
  vai: "Vải",
  kiwi: "Kiwi",
  "phuc bon tu": "Phúc bồn tử",
  xoai: "Xoài",
  nho: "Nho",
  "dau tam": "Dâu tằm",
  khom: "Khóm",
  "mang cau": "Mãng cầu",
  trang: "Trắng",
  den: "Đen",
  "duong den": "Đường đen",
  "hoang kim": "Hoàng kim",
  cafe: "Cà phê",
  olong: "Ô long",
  socola: "Sô-cô-la",
  mon: "Môn",
  trung: "Trứng",
  dua: "Dừa",
  lai: "Lài",
  hong: "Hồng trà",
  gao: "Gạo",
  nau: "Nâu",
  khac: "Khác",
};

function displayValue(value) {
  const normalized = clean(String(value || "").replace(/-/g, " ")).toLowerCase();
  return valueLabels[normalized] || clean(value);
}

function parsePrice(value) {
  const normalized = clean(value);
  return /^\d+(\.\d+)?$/.test(normalized) ? Math.round(Number(normalized) * 1000) : 0;
}

const normalizedDir = path.resolve(getArg(
  "normalized-dir",
  "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/normalized-v2",
));
const sourceImages = path.resolve(getArg(
  "source-images",
  "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/preview/assets",
));
const r2ReadyRoot = path.resolve(getArg(
  "r2-ready-root",
  "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/r2-ready",
));

const parents = readCsv(path.join(normalizedDir, "product-parents.csv"));
const sourceVariants = readCsv(path.join(normalizedDir, "product-variants.csv"));
assert(parents.length === 188, `Expected 188 parents, found ${parents.length}.`);
assert(sourceVariants.length === 275, `Expected 275 variants, found ${sourceVariants.length}.`);
assert(fs.existsSync(sourceImages), `Source images directory does not exist: ${sourceImages}`);

const parentKeys = parents.map((parent) => parent.parent_key);
const variantKeys = sourceVariants.map((variant) => variant.variant_key);
const skus = sourceVariants.map((variant) => variant.sku);
assert(unique(parentKeys).length === 188, "Duplicate parent_key found.");
assert(unique(variantKeys).length === 275, "Duplicate variant_key found.");
assert(unique(skus).length === 275, "Duplicate SKU found.");

const parentKeySet = new Set(parentKeys);
const orphanVariants = sourceVariants.filter((variant) => !parentKeySet.has(variant.parent_key));
assert(orphanVariants.length === 0, `Orphan variants found: ${orphanVariants.length}.`);

const variantsByParent = new Map();
for (const variant of sourceVariants) {
  if (!variantsByParent.has(variant.parent_key)) variantsByParent.set(variant.parent_key, []);
  variantsByParent.get(variant.parent_key).push(variant);
}

const productsDir = path.join(r2ReadyRoot, "products");
const manifestsDir = path.join(r2ReadyRoot, "manifests");
fs.rmSync(productsDir, { recursive: true, force: true });
fs.rmSync(manifestsDir, { recursive: true, force: true });
fs.mkdirSync(productsDir, { recursive: true });
fs.mkdirSync(manifestsDir, { recursive: true });

const imageKeys = unique(
  sourceVariants
    .filter((variant) => variant.image_status !== "MISSING")
    .map((variant) => variant.image_key),
);
assert(imageKeys.length === 269, `Expected 269 available image keys, found ${imageKeys.length}.`);

for (const imageKey of imageKeys) {
  const sourcePath = path.join(sourceImages, `${imageKey}.webp`);
  assert(fs.existsSync(sourcePath), `Mapped source image is missing: ${sourcePath}`);
  fs.copyFileSync(sourcePath, path.join(productsDir, `${imageKey}.webp`));
}

const availableImageSet = new Set(imageKeys);
const productVariantsManifest = [];
const productImagesManifest = [];
const missingImageKeys = [];

for (const variant of sourceVariants) {
  const rawOptions = variant.options_json ? JSON.parse(variant.options_json) : {};
  const options = {};
  for (const [key, value] of Object.entries(rawOptions)) {
    options[optionLabels[key] || key] = displayValue(value);
  }
  if (variant.parent_key === "sot-gold" && Object.keys(options).length === 0) {
    options.Vị = /matcha/i.test(variant.raw_name) ? "Matcha" : /mon/i.test(variant.raw_name) ? "Môn" : "Sô-cô-la";
  }
  if (variant.parent_key === "thai" && Object.keys(options).length === 0) {
    options.Loại = /nhan/i.test(variant.raw_name) ? "Nhãn" : "Đào";
  }

  const price = parsePrice(variant.price_khtt_nghin);
  assert(price > 0, `Invalid price for SKU ${variant.sku}: ${variant.price_khtt_nghin}`);

  const imageAvailable = availableImageSet.has(variant.image_key);
  if (!imageAvailable) missingImageKeys.push(variant.image_key);
  const objectKey = imageAvailable
    ? `catalog/hung-phat/v2/products/${variant.image_key}.webp`
    : null;

  productVariantsManifest.push({
    parentKey: variant.parent_key,
    variantKey: variant.variant_key,
    sku: variant.sku,
    name: variant.raw_name,
    options,
    price,
    imageKey: variant.image_key,
    image: {
      status: imageAvailable ? "available" : "missing",
      objectKey,
    },
    status: "active",
  });

  if (imageAvailable) {
    productImagesManifest.push({
      imageKey: variant.image_key,
      variantKey: variant.variant_key,
      sku: variant.sku,
      objectKey,
      role: "variant",
      mappingStatus: "exact",
    });
  }
}

assert(productVariantsManifest.length === 275, "Variant manifest count must be 275.");
assert(productImagesManifest.length === 269, "Image manifest count must be 269.");
assert(unique(productImagesManifest.map((image) => image.objectKey)).length === 269, "Duplicate image objectKey found.");
assert(unique(missingImageKeys).length === 6, `Expected 6 missing image keys, found ${unique(missingImageKeys).length}.`);

const variantManifestByParent = new Map();
for (const variant of productVariantsManifest) {
  if (!variantManifestByParent.has(variant.parentKey)) variantManifestByParent.set(variant.parentKey, []);
  variantManifestByParent.get(variant.parentKey).push(variant);
}

const productsManifest = parents.map((parent) => {
  const variants = variantManifestByParent.get(parent.parent_key) || [];
  assert(variants.length > 0, `Parent has no variants: ${parent.parent_key}`);
  const sourceGroup = (variantsByParent.get(parent.parent_key) || [])[0]?.source_group || "Chưa phân nhóm";
  const optionValues = new Map();

  for (const variant of variants) {
    for (const [label, value] of Object.entries(variant.options)) {
      if (!optionValues.has(label)) optionValues.set(label, []);
      if (!optionValues.get(label).includes(value)) optionValues.get(label).push(value);
    }
  }

  const optionGroups = [...optionValues.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([name, values]) => ({ name, values }));

  const preferredCover = parent.cover_image_key;
  const coverImageKey = availableImageSet.has(preferredCover)
    ? preferredCover
    : variants.find((variant) => variant.image.status === "available")?.imageKey || null;

  return {
    productKey: parent.parent_key,
    name: parent.name,
    brand: parent.brand || "",
    industry: industryFor(sourceGroup),
    subcategory: subcategoryFor(sourceGroup),
    sourceGroup,
    priceFrom: Math.min(...variants.map((variant) => variant.price)),
    status: "active",
    imageKey: coverImageKey,
    image: {
      status: coverImageKey ? "available" : "missing",
      objectKey: coverImageKey ? `catalog/hung-phat/v2/products/${coverImageKey}.webp` : null,
    },
    optionGroups,
    variantKeys: variants.map((variant) => variant.variantKey),
  };
});

assert(productsManifest.length === 188, "Products manifest count must be 188.");

const industries = [
  "Nguyên Liệu Trà Sữa",
  "Nguyên Liệu Mì Cay",
  "Đông Lạnh",
  "Nguyên Liệu Bánh Tráng",
  "Bao Bì",
];
const categoriesManifest = industries.map((industry, order) => {
  const products = productsManifest.filter((product) => product.industry === industry);
  return {
    key: normalizeForMatch(industry).replace(/\s+/g, "-"),
    name: industry,
    order: order + 1,
    cardCount: products.length,
    subcategories: unique(products.map((product) => product.subcategory)).sort((a, b) => a.localeCompare(b, "vi")),
  };
}).filter((category) => category.cardCount > 0);

const catalogVersionManifest = {
  catalogVersion: "hung-phat-v2",
  status: "staging",
  sourceRows: 276,
  excludedRows: 1,
  parentCardCount: 188,
  variantCount: 275,
  mappedImageCount: 269,
  missingImageCount: 6,
  duplicateProductKey: 0,
  duplicateVariantKey: 0,
  duplicateSku: 0,
  orphanVariant: 0,
  invalidPrice: 0,
  categoryMissing: 0,
  r2Prefixes: {
    products: "catalog/hung-phat/v2/products/",
    manifests: "catalog/hung-phat/v2/manifests/",
  },
  missingImageKeys: unique(missingImageKeys).sort(),
  legacyPrefixesModified: false,
};

writeJson(path.join(manifestsDir, "products.json"), productsManifest);
writeJson(path.join(manifestsDir, "product-variants.json"), productVariantsManifest);
writeJson(path.join(manifestsDir, "product-images.json"), productImagesManifest);
writeJson(path.join(manifestsDir, "categories.json"), categoriesManifest);
writeJson(path.join(manifestsDir, "catalog-version.json"), catalogVersionManifest);

console.log(JSON.stringify({
  phase: 4,
  status: "R2_READY_PASS",
  parentCardCount: 188,
  variantCount: 275,
  localImageCount: imageKeys.length,
  manifestCount: 5,
  missingImageCount: 6,
  duplicateProductKey: 0,
  duplicateVariantKey: 0,
  duplicateSku: 0,
  orphanVariant: 0,
  invalidPrice: 0,
  productsDir,
  manifestsDir,
}, null, 2));
