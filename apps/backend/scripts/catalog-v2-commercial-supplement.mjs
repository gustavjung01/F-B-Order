const entries = new Map();

function add(skus, options) {
  for (const sku of skus) entries.set(sku, options);
}

add(
  Array.from({ length: 12 }, (_, index) => `BGKQ-${String(index + 15).padStart(4, "0")}`),
  { size: "1 L", package: "Thùng 12 chai", sell_unit: "chai" },
);

add(["BGKQ-0063", "BGKQ-0066"], { size: "1 kg", package: "Gói 1 kg", sell_unit: "gói" });
add(["BGKQ-0064"], { size: "2 kg", package: "Gói 2 kg", sell_unit: "gói" });
add(["BGKQ-0065", "BGKQ-0067"], { size: "3 kg", package: "Gói 3 kg", sell_unit: "gói" });
add(["BGKQ-0118", "BGKQ-0151", "BGKQ-0152", "BGKQ-0153"], {
  size: "500 g",
  package: "Gói 500 g",
  sell_unit: "gói",
});

export function loadCatalogV2CommercialOptions() {
  return new Map(entries);
}
