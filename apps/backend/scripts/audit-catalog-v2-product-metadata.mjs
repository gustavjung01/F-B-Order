import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalogV2ProductMetadata } from "./catalog-v2-product-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const metadata = loadCatalogV2ProductMetadata(repoRoot);

const mama = metadata.forProduct({
  productKey: "siro-mama-gold",
  name: "Siro Mama Gold",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Siro",
});
assert.equal(mama.catalogGroupKey, "siro");
assert.equal(mama.choiceGroups.length, 1);
assert.equal(mama.choiceGroups[0].key, "flavor");
assert.ok(mama.choiceGroups[0].values.includes("Dâu"));
assert.equal(mama.variantOptions["BGKQ-0004"].size, "2 L");
assert.equal(mama.variantOptions["BGKQ-0005"].size, "700 ml");

const smoothie = metadata.forProduct({
  productKey: "sinh-to-berrino",
  name: "Sinh tố Berrino",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Sinh tố Berrino",
});
assert.equal(smoothie.catalogGroupKey, "sinh-to");
assert.deepEqual(smoothie.choiceGroups, []);

assert.ok(metadata.disabledSkus.has("BGKQ-0007"));
assert.ok(metadata.disabledSkus.has("BGKQ-0009"));
assert.equal(metadata.disabledSkus.size, 2);

const douxian = metadata.forProduct({
  productKey: "siro-douxian-2l",
  name: "Siro Douxian 2L",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Siro",
});
assert.equal(douxian.nameOverride, "Siro Douxian 2,5 kg");
assert.equal(douxian.variantOptions["BGKQ-0012"].size, "2,5 kg");
assert.equal(douxian.variantOptions["BGKQ-0014"].size, "2,5 kg");

console.log("Catalog v2 product metadata audit passed.");
