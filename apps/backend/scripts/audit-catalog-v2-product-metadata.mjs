import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalogV2ProductMetadata } from "./catalog-v2-product-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const metadata = loadCatalogV2ProductMetadata(repoRoot);

function product(productKey, name = productKey, sourceGroup = "Siro") {
  return metadata.forProduct({
    productKey,
    name,
    industryKey: "nguyen-lieu-tra-sua",
    sourceGroup,
  });
}

const pixie = product("siro-thai-pixe-bgkq-0002", "Siro Thái PIXE");
assert.equal(pixie.choiceGroups[0].values.length, 18);
assert.ok(pixie.choiceGroups[0].values.includes("Hỗn hợp trái cây (Blue Punch)"));
assert.ok(pixie.choiceGroups[0].values.includes("Cookies"));

const dingFong = product("siro-thai-dingfong-bgkq-0003", "Siro Thái Ding Fong");
assert.equal(dingFong.choiceGroups[0].values.length, 12);
assert.ok(dingFong.choiceGroups[0].values.includes("Blue Hawaii"));
assert.ok(dingFong.choiceGroups[0].values.includes("Dưa hấu"));

const goldenFarmSyrup = product("siro-mama-gold", "Siro Mama Gold");
assert.equal(goldenFarmSyrup.nameOverride, "Siro Golden Farm");
assert.equal(goldenFarmSyrup.brandOverride, "Golden Farm");
assert.equal(goldenFarmSyrup.choiceGroups.length, 1);
assert.equal(goldenFarmSyrup.choiceGroups[0].key, "flavor");
assert.equal(goldenFarmSyrup.choiceGroups[0].valuesBySku["BGKQ-0004"].length, 12);
assert.equal(goldenFarmSyrup.choiceGroups[0].valuesBySku["BGKQ-0005"].length, 16);
assert.ok(goldenFarmSyrup.choiceGroups[0].valuesBySku["BGKQ-0004"].includes("Đường đen"));
assert.ok(goldenFarmSyrup.choiceGroups[0].valuesBySku["BGKQ-0005"].includes("Trái cây nhiệt đới"));
assert.equal(goldenFarmSyrup.variantOptions["BGKQ-0004"].size, "2 L");
assert.equal(goldenFarmSyrup.variantOptions["BGKQ-0005"].size, "700 ml");

const gtp = product("siro-gtp", "Siro GTP");
assert.equal(gtp.choiceGroups[0].values.length, 20);
assert.ok(gtp.choiceGroups[0].values.includes("Ổi xá lị"));
assert.ok(gtp.choiceGroups[0].values.includes("Blue Curacao"));

const syrupVina = product("siro-vina", "Siro Vina");
assert.equal(syrupVina.choiceGroups[0].values.length, 17);
assert.ok(syrupVina.choiceGroups[0].values.includes("Măng cụt"));
assert.ok(syrupVina.choiceGroups[0].values.includes("Mật ong"));

const carisa = product("siro-carisa-bgkq-0010", "Siro Carisa");
assert.ok(carisa.choiceGroups[0].values.includes("Sầu riêng"));
assert.ok(carisa.choiceGroups[0].values.includes("Sô-cô-la"));
assert.ok(carisa.choiceGroups[0].values.includes("Ổi hồng"));
assert.ok(carisa.choiceGroups[0].values.includes("Chanh xanh"));

const changThai = product("siro-changthai-bgkq-0011", "Siro Chang Thai");
assert.equal(changThai.choiceGroups[0].values.length, 16);
assert.ok(changThai.choiceGroups[0].values.includes("Mãng cầu"));
assert.ok(!changThai.choiceGroups[0].values.includes("Vỏ cam"));

const blackSyrup = product("siro-dd-hoang-kim-bgkq-0013", "Siro đường đen Hoàng Kim");
assert.deepEqual(blackSyrup.choiceGroups, []);

assert.ok(metadata.disabledSkus.has("BGKQ-0007"));
assert.ok(metadata.disabledSkus.has("BGKQ-0009"));
assert.equal(metadata.disabledSkus.size, 2);

const syrupDouxian = product("siro-douxian-2l", "Siro Douxian 2L");
assert.equal(syrupDouxian.nameOverride, "Siro Douxian 2,5 kg");
assert.equal(syrupDouxian.variantOptions["BGKQ-0012"].size, "2,5 kg");
assert.equal(syrupDouxian.variantOptions["BGKQ-0014"].size, "2,5 kg");
assert.equal(syrupDouxian.choiceGroups[0].valuesBySku["BGKQ-0012"].length, 10);
assert.deepEqual(syrupDouxian.choiceGroups[0].valuesBySku["BGKQ-0014"], ["Đào"]);

const smoothie = product("sinh-to-berrino", "Sinh tố Berrino", "Sinh tố Berrino");
assert.equal(smoothie.catalogGroupKey, "sinh-to");
assert.deepEqual(smoothie.choiceGroups, []);

const jellyDouxian = product("thach-douxian-cac-loai-bgkq-0083", "Thạch Douxian các loại", "3Q Giòn");
assert.equal(jellyDouxian.catalogGroupKey, "thach-rau-cau");
assert.equal(jellyDouxian.choiceGroups[0].key, "flavor_or_type");
assert.equal(jellyDouxian.choiceGroups[0].values.length, 9);
assert.ok(jellyDouxian.choiceGroups[0].values.includes("Thạch dừa táo xanh"));

const sauceDouxian = product("sot-douxian-cac-loai-bgkq-0087", "Sốt Douxian các loại", "Sốt Topping");
assert.equal(sauceDouxian.catalogGroupKey, "sot");
assert.deepEqual(sauceDouxian.choiceGroups[0].values, ["Caramel", "Dâu", "Sô-cô-la"]);

const goldenFarmSauce = product("sot-gold", "Sốt Gold", "Sốt Topping");
assert.equal(goldenFarmSauce.nameOverride, "Sốt Golden Farm");
assert.equal(goldenFarmSauce.brandOverride, "Golden Farm");
assert.deepEqual(goldenFarmSauce.choiceGroups, []);
assert.deepEqual(goldenFarmSauce.optionGroupsOverride, ["flavor"]);
assert.equal(goldenFarmSauce.variantOptions["BGKQ-0091"].flavor, "Caramel");
assert.equal(goldenFarmSauce.variantNameOverrides["BGKQ-0091"], "Sốt Golden Farm Caramel");

const vina = product("sinh-to-vina", "Sinh tố Vina", "Sinh Tố Glod");
assert.equal(vina.sourceGroupOverride, "Sinh Tố Vina");
assert.equal(vina.subcategoryOverride, "Sinh Tố Vina");
assert.deepEqual(vina.optionGroupsOverride, ["size", "flavor"]);

const mozzarella = product("pho-mai-mozzarella", "Phô mai Mozzarella", "Đồ Lẻ");
assert.equal(mozzarella.catalogGroupKey, null);
assert.equal(mozzarella.industryOverride, "Đông Lạnh");
assert.equal(mozzarella.industryKeyOverride, "dong-lanh");
assert.equal(mozzarella.sourceGroupOverride, "Thực Phẩm Đông Lạnh");

console.log("Catalog v2 product metadata audit passed.");
