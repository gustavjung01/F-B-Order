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

const syrupDouxian = metadata.forProduct({
  productKey: "siro-douxian-2l",
  name: "Siro Douxian 2L",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Siro",
});
assert.equal(syrupDouxian.nameOverride, "Siro Douxian 2,5 kg");
assert.equal(syrupDouxian.variantOptions["BGKQ-0012"].size, "2,5 kg");
assert.equal(syrupDouxian.variantOptions["BGKQ-0014"].size, "2,5 kg");

const jellyDouxian = metadata.forProduct({
  productKey: "thach-douxian-cac-loai-bgkq-0083",
  name: "Thạch Douxian các loại",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "3Q Giòn",
});
assert.equal(jellyDouxian.catalogGroupKey, "thach-rau-cau");
assert.equal(jellyDouxian.choiceGroups[0].key, "flavor_or_type");
assert.equal(jellyDouxian.choiceGroups[0].values.length, 9);
assert.ok(jellyDouxian.choiceGroups[0].values.includes("Thạch dừa táo xanh"));

const sauceDouxian = metadata.forProduct({
  productKey: "sot-douxian-cac-loai-bgkq-0087",
  name: "Sốt Douxian các loại",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Sốt Topping",
});
assert.equal(sauceDouxian.catalogGroupKey, "sot");
assert.deepEqual(sauceDouxian.choiceGroups[0].values, ["Caramel", "Dâu", "Sô-cô-la"]);

const goldenFarm = metadata.forProduct({
  productKey: "sot-gold",
  name: "Sốt Gold",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Sốt Topping",
});
assert.equal(goldenFarm.nameOverride, "Sốt Golden Farm");
assert.equal(goldenFarm.brandOverride, "Golden Farm");
assert.deepEqual(goldenFarm.choiceGroups, []);
assert.deepEqual(goldenFarm.optionGroupsOverride, ["flavor"]);
assert.equal(goldenFarm.variantOptions["BGKQ-0091"].flavor, "Caramel");
assert.equal(goldenFarm.variantNameOverrides["BGKQ-0091"], "Sốt Golden Farm Caramel");

const vina = metadata.forProduct({
  productKey: "sinh-to-vina",
  name: "Sinh tố Vina",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Sinh Tố Glod",
});
assert.equal(vina.sourceGroupOverride, "Sinh Tố Vina");
assert.equal(vina.subcategoryOverride, "Sinh Tố Vina");
assert.deepEqual(vina.optionGroupsOverride, ["size", "flavor"]);

const mozzarella = metadata.forProduct({
  productKey: "pho-mai-mozzarella",
  name: "Phô mai Mozzarella",
  industryKey: "nguyen-lieu-tra-sua",
  sourceGroup: "Đồ Lẻ",
});
assert.equal(mozzarella.catalogGroupKey, null);
assert.equal(mozzarella.industryOverride, "Đông Lạnh");
assert.equal(mozzarella.industryKeyOverride, "dong-lanh");
assert.equal(mozzarella.sourceGroupOverride, "Thực Phẩm Đông Lạnh");

console.log("Catalog v2 product metadata audit passed.");
