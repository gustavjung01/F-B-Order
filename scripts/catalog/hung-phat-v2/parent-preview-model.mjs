import { assert, clean, parseJson, unique } from "./parent-map-io.mjs";

const labels = {
  flavor: "Vị", size: "Kích thước", type: "Loại", color: "Màu",
  packing: "Quy cách", pack: "Quy cách", diameter: "Đường kính",
  lid: "Loại nắp", flavor_or_type: "Loại",
};
const values = {
  dau: "Dâu", dao: "Đào", oi: "Ổi", "viet quoc": "Việt quất",
  "chanh day": "Chanh dây", vai: "Vải", kiwi: "Kiwi",
  "phuc bon tu": "Phúc bồn tử", xoai: "Xoài", nho: "Nho",
  "dau tam": "Dâu tằm", khom: "Khóm", "mang cau": "Mãng cầu",
  trang: "Trắng", den: "Đen", "duong den": "Đường đen",
  "hoang kim": "Hoàng kim", cafe: "Cà phê", olong: "Ô long",
  socola: "Sô-cô-la", mon: "Môn", trung: "Trứng", dua: "Dừa",
  lai: "Lài", hong: "Hồng trà", gao: "Gạo", nau: "Nâu", khac: "Khác",
  tron: "Tròn", tieu: "Tiêu", ot: "Ớt",
};
const show = (value) => {
  const key = clean(String(value || "").replace(/-/g, " ")).toLowerCase();
  return values[key] || clean(value);
};
const price = (value) => /^\d+(\.\d+)?$/.test(clean(value)) ? Math.round(Number(value) * 1000) : 0;

export function buildPreviewCards(parents, variants) {
  const byParent = new Map();
  const skuCounts = new Map();
  for (const variant of variants) {
    if (!byParent.has(variant.parent_key)) byParent.set(variant.parent_key, []);
    byParent.get(variant.parent_key).push(variant);
    skuCounts.set(variant.sku, (skuCounts.get(variant.sku) || 0) + 1);
  }
  assert(unique(variants.map((row) => row.sku)).length === variants.length, "Duplicate preview SKU.");

  return parents.map((parent, index) => {
    const source = byParent.get(parent.parent_key) || [];
    assert(source.length > 0, `Parent ${parent.parent_key} has no variants.`);
    const optionValues = new Map();
    const rows = source.map((variant) => {
      const options = Object.fromEntries(
        Object.entries(parseJson(variant.options_json)).map(([key, value]) => [labels[key] || key, show(value)]),
      );
      for (const [label, value] of Object.entries(options)) {
        if (!optionValues.has(label)) optionValues.set(label, []);
        if (!optionValues.get(label).includes(value)) optionValues.get(label).push(value);
      }
      return {
        variantKey: variant.variant_key,
        sku: variant.sku,
        name: variant.raw_name,
        options,
        price: price(variant.price_khtt_nghin),
        imageKey: variant.image_key,
        imageStatus: variant.image_status,
      };
    });
    const optionGroups = [...optionValues.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) => ({ name, values: list }));
    const signatures = rows.map((row) => JSON.stringify(optionGroups.map((group) => row.options[group.name] || "")));
    assert(rows.length === 1 || optionGroups.length > 0, `Parent ${parent.parent_key} has variants without options.`);
    assert(unique(signatures).length === signatures.length, `Parent ${parent.parent_key} has duplicate option signatures.`);
    const validPrices = rows.map((row) => row.price).filter((value) => value > 0);
    const coverVariant = rows.find((row) => row.imageKey === parent.cover_image_key);
    const coverMissing = !parent.cover_image_key || coverVariant?.imageStatus === "MISSING";
    return {
      index,
      productKey: parent.parent_key,
      name: parent.name,
      brand: parent.brand || "",
      category: source[0]?.source_group || "Chưa phân nhóm",
      sourceGroup: source[0]?.source_group || "Chưa phân nhóm",
      priceFrom: validPrices.length ? Math.min(...validPrices) : 0,
      status: "draft",
      imageKey: parent.cover_image_key,
      imageStatus: coverMissing ? "missing" : "available",
      imageQualityStatus: "R2_OR_LOCAL_PREVIEW",
      optionGroups,
      variants: rows,
      variantCount: rows.length,
      duplicateSkus: rows.filter((row) => skuCounts.get(row.sku) > 1).map((row) => row.sku),
      autoIssues: {
        missingImage: rows.some((row) => row.imageStatus === "MISSING"),
        wrongName: /\s{2,}/.test(parent.name || ""),
        wrongOption: false,
        duplicateSku: false,
        wrongPrice: rows.some((row) => row.price <= 0),
      },
    };
  });
}
