import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const sourcePath = path.join(repoRoot, "apps/frontend/data/catalog/hung-phat-catalog.ts");

const source = fs.readFileSync(sourcePath, "utf8");
const marker = "export const hungPhatCatalog = ";
const start = source.indexOf(marker);
const end = source.lastIndexOf(" as const;");

if (start < 0 || end < 0 || end <= start) {
  throw new Error("Cannot locate hungPhatCatalog JSON object.");
}

const catalog = JSON.parse(source.slice(start + marker.length, end).trim());
const physicalProducts = catalog.products.filter((item) => item.catalogKind === "sku_candidate");
const bundleProducts = catalog.products.filter(
  (item) => item.catalogKind === "content" || item.catalogKind === "bundle_candidate",
);
const scaffolds = catalog.products.filter((item) => item.catalogKind === "category_scaffold");
const importedProducts = [...physicalProducts, ...bundleProducts];
const ids = catalog.products.map((item) => item.id);

const failures = [];

if (physicalProducts.length !== 16) failures.push(`Expected 16 physical products, received ${physicalProducts.length}`);
if (bundleProducts.length !== 6) failures.push(`Expected 6 bundle products, received ${bundleProducts.length}`);
if (importedProducts.length !== 22) failures.push(`Expected 22 public products, received ${importedProducts.length}`);
if (scaffolds.length !== 7) failures.push(`Expected 7 excluded scaffolds, received ${scaffolds.length}`);
if (new Set(ids).size !== ids.length) failures.push("Catalog IDs must be unique");
if (bundleProducts.some((item) => item.categoryId !== "combo-cong-thuc")) {
  failures.push("All six bundles must belong to combo-cong-thuc");
}

if (failures.length > 0) {
  console.error("Catalog audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Catalog audit passed.");
console.log(`Physical products: ${physicalProducts.length}`);
console.log(`Bundle products: ${bundleProducts.length}`);
console.log(`Public products: ${importedProducts.length}`);
console.log(`Excluded scaffolds: ${scaffolds.length}`);
