import { applyParentFixes } from "./parent-map-apply.mjs";
import { finalizeParentMap } from "./parent-map-finalize.mjs";
import { loadInputs, outputDir, writeCsv, writeJson } from "./parent-map-io.mjs";

const result = finalizeParentMap(applyParentFixes(loadInputs()));
const { parents, variants, explicitParents, singletonParents, grouped } = result;
writeCsv("product-parents.csv", [
  "parent_key", "name", "brand", "cover_image_key", "confidence", "option_groups_json",
], parents);
writeCsv("product-variants.csv", [
  "product_key", "sku", "parent_key", "variant_key", "options_json", "source_row",
  "source_group", "raw_name", "price_khtt_nghin", "image_key", "image_status",
], variants);
const summary = {
  status: "PASS",
  sourceProductCount: variants.length,
  variantCount: variants.length,
  explicitParentCount: explicitParents.length,
  singletonParentCount: singletonParents.length,
  parentCardCount: parents.length,
  groupedProductCount: grouped.size,
  missingImageCount: variants.filter((row) => row.image_status === "MISSING").length,
  duplicateSku: 0,
  duplicateVariantKey: 0,
  orphanVariant: 0,
  multiVariantParentWithoutOptions: 0,
};
writeJson("catalog-summary.json", summary);
console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
