import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "../..");
const SOURCE_PATH = path.join(ROOT, "docs/catalog/hung-phat-product-catalog-map.md");
const OUTPUT_DIR = path.join(process.cwd(), "data/catalog/imported");
const PRODUCTS_JSON_PATH = path.join(OUTPUT_DIR, "hung-phat-products.imported.json");
const AUDIT_CSV_PATH = path.join(OUTPUT_DIR, "hung-phat-products.imported-audit.csv");

const PRODUCT_TABLE_HEADERS = [
  "Product ID",
  "Name",
  "Brand",
  "Category",
  "Package",
  "Origin",
  "Use cases",
  "Selling points",
  "Data status",
];

const BUNDLE_TABLE_HEADERS = [
  "Product ID",
  "Name",
  "Type",
  "Related Product/Brand",
  "Use cases",
  "Data status",
];

const CATEGORY_TO_PARENT = new Map([
  ["tra-nen-tra-tui-loc", "tra-sua-pha-che"],
  ["bot-sua-bot-beo", "tra-sua-pha-che"],
  ["topping", "tra-sua-pha-che"],
  ["syrup-sot-mut", "tra-sua-pha-che"],
  ["bot-pudding-jelly", "tra-sua-pha-che"],
  ["nguyen-lieu-da-xay", "tra-sua-pha-che"],
  ["cot-dua", "tra-sua-pha-che"],
  ["mi-cay-base", "mi-cay-han-quoc"],
  ["topping-mi-cay", "mi-cay-han-quoc"],
  ["thuc-pham-dong-lanh", "thuc-pham-dong-lanh"],
  ["xien-que-an-vat", "thuc-pham-dong-lanh"],
  ["vien-tha-lau", "thuc-pham-dong-lanh"],
  ["do-chien-dong-lanh", "thuc-pham-dong-lanh"],
  ["combo-mo-quan", "combo-cong-thuc"],
  ["cong-thuc-tra-sua", "combo-cong-thuc"],
  ["cong-thuc-tra-trai-cay", "combo-cong-thuc"],
  ["cong-thuc-do-uong-nong", "combo-cong-thuc"],
]);

const CATEGORY_TO_INDUSTRY_GROUP = new Map([
  ["tra-sua-pha-che", "tra_sua_pha_che"],
  ["mi-cay-han-quoc", "mi_cay_han_quoc"],
  ["thuc-pham-dong-lanh", "thuc_pham_dong_lanh"],
  ["combo-cong-thuc", "combo_cong_thuc"],
]);

function cleanCell(value = "") {
  return value
    .trim()
    .replace(/^`|`$/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function emptyToNull(value) {
  const cleaned = cleanCell(value);
  if (!cleaned) return null;
  if (/^TODO$/i.test(cleaned)) return null;
  if (/^null$/i.test(cleaned)) return null;
  return cleaned;
}

function splitList(value) {
  const cleaned = emptyToNull(value);
  if (!cleaned) return [];
  return cleaned
    .split(/[,;]+/)
    .map((item) => cleanCell(item))
    .filter(Boolean)
    .filter((item) => !/^TODO/i.test(item));
}

function normalizeStatus(status) {
  const cleaned = cleanCell(status);
  if (cleaned === "confirmed-public-post-snippet") return "confirmed";
  if (cleaned === "public-snippet") return "public-snippet";
  if (cleaned === "inferred-category") return "inferred-category";
  return "todo";
}

function topCategoryFor(subcategoryId) {
  if (!subcategoryId) return null;
  return CATEGORY_TO_PARENT.get(subcategoryId) ?? subcategoryId;
}

function industryGroupFor(categoryId) {
  return CATEGORY_TO_INDUSTRY_GROUP.get(categoryId) ?? "tra_sua_pha_che";
}

function parseTableLine(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cleanCell);
}

function isSeparator(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function headersMatch(headers, expected) {
  return expected.every((header, index) => headers[index] === header);
}

function parseTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) continue;

    const headers = parseTableLine(line);
    const isProductTable = headersMatch(headers, PRODUCT_TABLE_HEADERS);
    const isBundleTable = headersMatch(headers, BUNDLE_TABLE_HEADERS);
    if (!isProductTable && !isBundleTable) continue;

    const separator = lines[index + 1] ?? "";
    if (!isSeparator(separator)) continue;

    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
      const cells = parseTableLine(lines[cursor]);
      if (cells.length >= headers.length) {
        rows.push({ headers, cells, kind: isProductTable ? "product" : "bundle" });
      }
      cursor += 1;
    }

    index = cursor;
  }

  return rows;
}

function normalizeProductRow(row) {
  const [id, name, brand, subcategoryId, packageSize, origin, useCases, sellingPoints, sourceStatusRaw] = row.cells;
  const categoryId = topCategoryFor(emptyToNull(subcategoryId)) ?? "tra-sua-pha-che";
  const sourceConfidence = normalizeStatus(sourceStatusRaw);
  const normalizedPackageSize = emptyToNull(packageSize);
  const normalizedOrigin = emptyToNull(origin);
  const dataIssues = [];

  if (!normalizedPackageSize) dataIssues.push("missing_package_size");
  dataIssues.push("missing_unit", "missing_price_retail", "missing_price_wholesale", "missing_image");
  if (!normalizedOrigin) dataIssues.push("missing_origin");
  if (sourceConfidence === "todo") dataIssues.push("needs_official_sku");

  return {
    id: cleanCell(id),
    slug: cleanCell(id),
    name: cleanCell(name),
    brand: emptyToNull(brand),
    sku: null,
    barcode: null,
    categoryId,
    subcategoryId: emptyToNull(subcategoryId),
    industryGroup: industryGroupFor(categoryId),
    productType: "physical",
    catalogKind: sourceConfidence === "todo" ? "category_scaffold" : "sku_candidate",
    packageSize: normalizedPackageSize,
    unit: null,
    origin: normalizedOrigin,
    useCases: splitList(useCases),
    sellingPoints: splitList(sellingPoints),
    priceRetail: null,
    priceWholesale: null,
    currency: "VND",
    imageUrls: [],
    sourceUrls: [],
    sourceAccuracy: "company_crawl_confirmed",
    sourceConfidence,
    sourceStatusRaw: cleanCell(sourceStatusRaw),
    status: "needs_review",
    isOrderable: false,
    dataIssues,
  };
}

function normalizeBundleRow(row) {
  const [id, name, _type, relatedProductOrBrand, useCases, sourceStatusRaw] = row.cells;

  return {
    id: cleanCell(id),
    slug: cleanCell(id),
    name: cleanCell(name),
    brand: emptyToNull(relatedProductOrBrand),
    sku: null,
    barcode: null,
    categoryId: "combo-cong-thuc",
    subcategoryId: null,
    industryGroup: "combo_cong_thuc",
    productType: "bundle",
    catalogKind: "bundle_candidate",
    packageSize: null,
    unit: null,
    origin: null,
    useCases: splitList(useCases),
    sellingPoints: [],
    priceRetail: null,
    priceWholesale: null,
    currency: "VND",
    imageUrls: [],
    sourceUrls: [],
    sourceAccuracy: "company_crawl_confirmed",
    sourceConfidence: normalizeStatus(sourceStatusRaw),
    sourceStatusRaw: cleanCell(sourceStatusRaw),
    status: "needs_review",
    isOrderable: false,
    dataIssues: [
      "missing_sku",
      "missing_unit",
      "missing_price_retail",
      "missing_price_wholesale",
      "missing_image",
      "missing_bundle_components",
    ],
  };
}

function toCsvCell(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function makeAuditCsv(products) {
  const headers = [
    "id",
    "name",
    "brand",
    "categoryId",
    "subcategoryId",
    "productType",
    "catalogKind",
    "packageSize",
    "unit",
    "priceRetail",
    "priceWholesale",
    "imageCount",
    "sourceAccuracy",
    "sourceConfidence",
    "status",
    "isOrderable",
    "dataIssues",
  ];

  const lines = [headers.join(",")];
  for (const product of products) {
    lines.push([
      product.id,
      product.name,
      product.brand,
      product.categoryId,
      product.subcategoryId,
      product.productType,
      product.catalogKind,
      product.packageSize,
      product.unit,
      product.priceRetail,
      product.priceWholesale,
      product.imageUrls.length,
      product.sourceAccuracy,
      product.sourceConfidence,
      product.status,
      product.isOrderable,
      product.dataIssues.join("|"),
    ].map(toCsvCell).join(","));
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const markdown = await fs.readFile(SOURCE_PATH, "utf8");
  const rows = parseTables(markdown);
  const products = rows.map((row) => row.kind === "product" ? normalizeProductRow(row) : normalizeBundleRow(row));

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(PRODUCTS_JSON_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await fs.writeFile(AUDIT_CSV_PATH, makeAuditCsv(products), "utf8");

  console.log(`Imported ${products.length} catalog rows.`);
  console.log(`Wrote ${path.relative(process.cwd(), PRODUCTS_JSON_PATH)}`);
  console.log(`Wrote ${path.relative(process.cwd(), AUDIT_CSV_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
