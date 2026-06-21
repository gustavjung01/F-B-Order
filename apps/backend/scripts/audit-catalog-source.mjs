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
const products = catalog.products.filter((item) => item.catalogKind === "sku_candidate");
const suggestions = catalog.products.filter(
  (item) => item.catalogKind === "content" || item.catalogKind === "bundle_candidate",
);
const scaffolds = catalog.products.filter((item) => item.catalogKind === "category_scaffold");
const ids = catalog.products.map((item) => item.id);

const failures = [];

if (products.length !== 16) failures.push(`Expected 16 products, received ${products.length}`);
if (suggestions.length !== 6) failures.push(`Expected 6 suggestions, received ${suggestions.length}`);
if (scaffolds.length !== 7) failures.push(`Expected 7 scaffolds, received ${scaffolds.length}`);
if (new Set(ids).size !== ids.length) failures.push("Catalog IDs must be unique");
if (products.some((item) => item.productType === "recipe_content")) {
  failures.push("recipe_content must not enter products");
}
if (suggestions.some((item) => item.categoryId !== "combo-cong-thuc")) {
  failures.push("All current suggestions must belong to combo-cong-thuc");
}
if (suggestions.some((item) => item.isOrderable)) {
  failures.push("Catalog suggestions must never be orderable");
}

if (failures.length > 0) {
  console.error("Catalog audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Catalog audit passed.");
console.log(`Products: ${products.length}`);
console.log(`Suggestions: ${suggestions.length}`);
console.log(`Excluded scaffolds: ${scaffolds.length}`);
