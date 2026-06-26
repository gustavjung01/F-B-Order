import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalogV2ProductMetadata } from "./catalog-v2-product-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const metadata = loadCatalogV2ProductMetadata(repoRoot);

function product(productKey, name, sourceGroup) {
  return metadata.forProduct({
    productKey,
    name,
    industryKey: "nguyen-lieu-tra-sua",
    sourceGroup,
  });
}

const torani = product("siro-torani-bgkq-0001", "Siro Torani", "Siro");
assert.equal(torani.catalogGroupKey, "siro");
assert.equal(torani.choiceGroups.length, 1);
assert.equal(torani.choiceGroups[0].key, "flavor");
assert.equal(torani.choiceGroups[0].values.length, 18);
assert.ok(torani.choiceGroups[0].values.includes("Blue Curacao"));
assert.ok(torani.choiceGroups[0].values.includes("Kiwi"));
assert.equal(torani.variantOptions["BGKQ-0001"].size, "750 ml");
assert.equal(torani.variantOptions["BGKQ-0001"].sell_unit, "chai");

const douxianAPlus = product("siro-douxian-a-bgkq-0062", "Siro Douxian A+", "Đường Đen");
assert.equal(douxianAPlus.catalogGroupKey, "duong-chat-tao-ngot");
assert.deepEqual(douxianAPlus.choiceGroups, []);
assert.equal(douxianAPlus.sourceGroupOverride, "Đường Đen");
assert.equal(douxianAPlus.subcategoryOverride, "Đường Đen");
assert.equal(douxianAPlus.variantOptions["BGKQ-0062"].sell_unit, "chai");

console.log("Catalog v2 syrup override audit passed.");
