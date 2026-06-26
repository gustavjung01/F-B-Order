import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalogV2ProductMetadata } from "./catalog-v2-product-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const metadata = loadCatalogV2ProductMetadata(repoRoot);

const frozenProducts = [
  ["ca-hanh-tieu-bgkq-0228", "Cá hành tiêu"],
  ["ca-hanh-ot-bgkq-0229", "Cá hành ớt"],
  ["ca-vien-trang-beco-bgkq-0230", "Cá viên trắng Beco"],
  ["ca-sing-bgkq-0231", "Cá Sing"],
  ["ca-cut-bgkq-0232", "Cá Cút"],
  ["dau-hu-ca-bgkq-0233", "Đậu hủ cá"],
  ["dau-hu-pho-mai-lc-bgkq-0234", "Đậu hủ Phô mai LC"],
  ["dau-hu-phomai-ngon-bgkq-0235", "Đậu hủ phomai ngon"],
  ["khoai-tay-dong-lanh", "Khoai tây đông lạnh"],
  ["pho-mai-que-hop-bgkq-0238", "Phô mai que hộp"],
  ["oc-nhoi-bgkq-0239", "Ốc nhồi"],
  ["bo-vien-bgkq-0240", "Bò Viên"],
  ["bo-la-lot-bgkq-0241", "Bò lá lốt"],
  ["xuc-xich-yummy-bgkq-0242", "Xúc Xích Yummy"],
  ["xuc-xich-tokyo-bgkq-0243", "Xúc Xích Tokyo"],
  ["xuc-xich-vuon-bia-bgkq-0244", "Xúc Xích Vườn bia"],
  ["doi-sun-bgkq-0245", "Dồi Sụn"],
  ["vien-tha-lau-bgkq-0246", "Viên Thả lẩu"],
  ["banh-bao-trung-bgkq-0247", "Bánh Bao Trứng"],
  ["cha-ca-hap-bgkq-0248", "Chả cá Hấp"],
  ["cha-que-bgkq-0249", "Chả quế"],
  ["cha-gio-bgkq-0250", "Chả Giò"],
  ["cha-ca-han-quoc-bgkq-0251", "Chả cá Hàn Quốc"],
  ["thanh-cua-dai-1kg-bgkq-0252", "Thanh cua dài 1kg"],
  ["thanh-cua-lichuan-bgkq-0253", "Thanh cua Lichuan"],
  ["com-hong-ongon-bgkq-0254", "Cốm hồng Ongon"],
  ["com-hong-thien-nhien-bgkq-0255", "Cốm hồng Thiên Nhiên"],
  ["hotdog-pho-mai-bgkq-0256", "Hotdog phô mai"],
  ["tom-vien-bgkq-0257", "Tôm viên"],
  ["tom-con-ongon-bgkq-0258", "Tôm Con Ongon"],
  ["chao-sa-bgkq-0259", "Chạo sả"],
  ["tui-tien-hai-san-bgkq-0260", "Túi tiền Hải Sản"],
  ["banh-sua-tuoi-bgkq-0261", "Bánh sữa tươi"],
  ["banh-gao-thoi-bgkq-0262", "Bánh gạo thỏi"],
  ["sot-banh-gao-saijang-bgkq-0263", "Sốt bánh gạo Saijang"],
  ["sot-banh-gao-ky-bgkq-0264", "Sốt bánh gạo Kỳ"],
];

assert.equal(frozenProducts.length, 36);

for (const [productKey, name] of frozenProducts) {
  const value = metadata.forProduct({
    productKey,
    name,
    industryKey: "nguyen-lieu-tra-sua",
    sourceGroup: "Thực Phẩm Đông Lạnh",
  });

  assert.equal(value.catalogGroupKey, null, `${productKey} must not belong to the tea taxonomy`);
  assert.equal(value.industryOverride, "Đông Lạnh", `${productKey} has the wrong industry`);
  assert.equal(value.industryKeyOverride, "dong-lanh", `${productKey} has the wrong industry key`);
  assert.equal(value.sourceGroupOverride, "Thực Phẩm Đông Lạnh", `${productKey} has the wrong source group`);
  assert.equal(value.subcategoryOverride, "Thực Phẩm Đông Lạnh", `${productKey} has the wrong subcategory`);
}

console.log(`Catalog v2 frozen industry audit passed for ${frozenProducts.length} parent products.`);
