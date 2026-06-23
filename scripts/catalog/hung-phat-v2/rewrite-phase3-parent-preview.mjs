import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readCsv } from "./csv-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const unique = (values) => [...new Set(values)];
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const normalizedDir = path.resolve(arg(
  "normalized-dir",
  "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/normalized-v2",
));
const outputDir = path.join(repoRoot, "artifacts/catalog/hung-phat-v2-preview");
const outputPath = path.join(outputDir, "index.html");
const templatePath = path.join(scriptDir, "phase3-preview.template.html");

const parents = readCsv(path.join(normalizedDir, "product-parents.csv"));
const variants = readCsv(path.join(normalizedDir, "product-variants.csv"));
assert(parents.length === 188, `Expected 188 parent cards, found ${parents.length}.`);
assert(variants.length === 275, `Expected 275 variants, found ${variants.length}.`);

const labelMap = {
  flavor: "Vị", size: "Kích thước", type: "Loại", color: "Màu",
  packing: "Quy cách", pack: "Quy cách", diameter: "Đường kính",
  lid: "Loại nắp", flavor_or_type: "Loại",
};
const valueMap = {
  dau: "Dâu", dao: "Đào", oi: "Ổi", "viet quoc": "Việt quất",
  "chanh day": "Chanh dây", vai: "Vải", kiwi: "Kiwi",
  "phuc bon tu": "Phúc bồn tử", xoai: "Xoài", nho: "Nho",
  "dau tam": "Dâu tằm", khom: "Khóm", "mang cau": "Mãng cầu",
  trang: "Trắng", den: "Đen", "duong den": "Đường đen",
  "hoang kim": "Hoàng kim", cafe: "Cà phê", olong: "Ô long",
  socola: "Sô-cô-la", mon: "Môn", trung: "Trứng", dua: "Dừa",
  lai: "Lài", hong: "Hồng trà", gao: "Gạo", nau: "Nâu", khac: "Khác",
};
const showValue = (value) => {
  const normalized = clean(String(value || "").replace(/-/g, " ")).toLowerCase();
  return valueMap[normalized] || clean(value);
};
const parsePrice = (value) => /^\d+(\.\d+)?$/.test(clean(value)) ? Math.round(Number(value) * 1000) : 0;

function normalizeForMatch(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function industryFor(sourceGroup) {
  const normalized = normalizeForMatch(sourceGroup);

  if (normalized.includes("my cay") || normalized.includes("mi cay")) {
    return "Nguyên Liệu Mì Cay";
  }
  if (normalized.includes("dong lanh")) {
    return "Đông Lạnh";
  }
  if (normalized.includes("banh trang")) {
    return "Nguyên Liệu Bánh Tráng";
  }
  if (
    normalized.includes("ong hut") ||
    normalized.includes("muong") ||
    normalized.includes("nap") ||
    normalized.includes("bao ly")
  ) {
    return "Bao Bì";
  }

  return "Nguyên Liệu Trà Sữa";
}

function subcategoryFor(sourceGroup) {
  return clean(sourceGroup)
    .replace(/^\d+\s*[.\-]?\s*/u, "")
    .replace(/^\.+\s*/u, "");
}

const byParent = new Map();
const skuCounts = new Map();
for (const variant of variants) {
  if (!byParent.has(variant.parent_key)) byParent.set(variant.parent_key, []);
  byParent.get(variant.parent_key).push(variant);
  skuCounts.set(variant.sku, (skuCounts.get(variant.sku) || 0) + 1);
}

const cards = parents.map((parent, index) => {
  const sourceVariants = byParent.get(parent.parent_key) || [];
  const sourceGroup = sourceVariants[0]?.source_group || "Chưa phân nhóm";
  const optionValues = new Map();
  let missingImage = false;

  const rows = sourceVariants.map((variant) => {
    const options = {};
    if (variant.options_json) {
      for (const [key, value] of Object.entries(JSON.parse(variant.options_json))) {
        options[labelMap[key] || key] = showValue(value);
      }
    }
    if (parent.parent_key === "sot-gold" && !Object.keys(options).length) {
      options.Vị = /matcha/i.test(variant.raw_name) ? "Matcha" : /mon/i.test(variant.raw_name) ? "Môn" : "Sô-cô-la";
    }
    if (parent.parent_key === "thai" && !Object.keys(options).length) {
      options.Loại = /nhan/i.test(variant.raw_name) ? "Nhãn" : "Đào";
    }
    for (const [label, value] of Object.entries(options)) {
      if (!optionValues.has(label)) optionValues.set(label, []);
      if (!optionValues.get(label).includes(value)) optionValues.get(label).push(value);
    }
    const price = parsePrice(variant.price_khtt_nghin);
    if (variant.image_status === "MISSING") missingImage = true;
    return {
      variantKey: variant.variant_key,
      sku: variant.sku,
      name: variant.raw_name,
      options,
      price,
      imageKey: variant.image_key,
      imageStatus: variant.image_status,
    };
  });

  const optionGroups = [...optionValues.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([name, values]) => ({ name, values }));
  const signatures = rows.map((row) => JSON.stringify(optionGroups.map((group) => row.options[group.name] || "")));
  const duplicateSkus = unique(rows.filter((row) => skuCounts.get(row.sku) > 1).map((row) => row.sku));
  const validPrices = rows.map((row) => row.price).filter((price) => price > 0);

  let cover = parent.cover_image_key;
  if (!cover || !fs.existsSync(path.join(outputDir, "assets", `${cover}.webp`))) {
    cover = rows.find((row) => row.imageStatus !== "MISSING" && fs.existsSync(path.join(outputDir, "assets", `${row.imageKey}.webp`)))?.imageKey || "";
  }

  return {
    index,
    productKey: parent.parent_key,
    name: parent.name,
    brand: parent.brand || "",
    category: industryFor(sourceGroup),
    subcategory: subcategoryFor(sourceGroup),
    sourceGroup,
    priceFrom: validPrices.length ? Math.min(...validPrices) : 0,
    status: "draft",
    imageKey: cover,
    imageStatus: cover ? "available" : "missing",
    imageQualityStatus: "LOCAL_PREVIEW",
    imageUrl: cover ? `./assets/${cover}.webp` : "",
    optionGroups,
    variants: rows,
    variantCount: rows.length,
    duplicateSkus,
    autoIssues: {
      missingImage,
      wrongName: /\s{2,}/.test(parent.name || ""),
      wrongOption: rows.length > 1 && (!optionGroups.length || unique(signatures).length !== rows.length),
      duplicateSku: duplicateSkus.length > 0,
      wrongPrice: rows.some((row) => row.price <= 0),
    },
  };
});

assert(cards.length === 188, `Expected 188 cards, found ${cards.length}.`);
assert(cards.reduce((sum, card) => sum + card.variantCount, 0) === 275, "Variant total must be 275.");
const berrino = cards.find((card) => card.productKey === "sinh-to-berrino");
assert(berrino?.variantCount === 12, `Berrino must be 1 card with 12 variants, found ${berrino?.variantCount || 0}.`);

const industryCounts = Object.fromEntries(
  [...new Set(cards.map((card) => card.category))]
    .map((industry) => [industry, cards.filter((card) => card.category === industry).length]),
);

const template = fs.readFileSync(templatePath, "utf8");
const payload = {
  catalogVersion: "hung-phat-v2-parent-draft",
  generatedAt: new Date().toISOString(),
  expectedCardCount: 188,
  variantCount: 275,
  industryCounts,
  products: cards,
};
fs.writeFileSync(outputPath, template.replace("__CATALOG_PAYLOAD__", safeJson(payload)), "utf8");

console.log(JSON.stringify({
  phase: 3,
  status: "PASS",
  parentCardCount: 188,
  variantCount: 275,
  berrinoCardCount: 1,
  berrinoVariantCount: 12,
  industryCounts,
  output: outputPath,
}, null, 2));
