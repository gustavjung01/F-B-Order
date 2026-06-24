export type CatalogV2CommercialSupplement = {
  sizeLabel?: string;
  packageLabel?: string;
  sellUnit?: string;
  shortDescription: string;
  confidence: "high" | "medium";
};

const BERRINO_DESCRIPTION =
  "Sinh tố trái cây cô đặc dùng pha smoothie, sữa chua, soda và đồ uống đá xay; lắc đều và giữ lạnh sau khi mở.";

const GOLD_DESCRIPTION =
  "Sinh tố trái cây dùng pha smoothie, yogurt, soda và đồ uống đá xay; có thể dùng làm sốt hoặc topping.";

const DOUXIAN_PEARL_DESCRIPTION =
  "Trân châu Douxian dùng làm topping trà sữa; nấu và ủ theo hướng dẫn để đạt độ dai, sau đó trộn đường hoặc syrup.";

const MILK_FOAM_DESCRIPTION =
  "Bột tạo lớp milk foam béo mặn ngọt cho trà, cà phê và đồ uống đá xay; pha lạnh và đánh bông theo hướng dẫn trên bao bì.";

const BLACK_TEA_9_DESCRIPTION =
  "Trà đen dùng ủ cốt trà sữa; nước trà nâu đỏ, hương đậm và vẫn giữ mùi khi phối cùng bột sữa.";

function rows(
  skus: string[],
  supplement: Omit<CatalogV2CommercialSupplement, "confidence"> & {
    confidence?: CatalogV2CommercialSupplement["confidence"];
  },
) {
  return Object.fromEntries(
    skus.map((sku) => [
      sku,
      {
        confidence: supplement.confidence || "high",
        ...supplement,
      } satisfies CatalogV2CommercialSupplement,
    ]),
  );
}

export const CATALOG_V2_COMMERCIAL_SUPPLEMENTS: Readonly<
  Record<string, CatalogV2CommercialSupplement>
> = Object.freeze({
  ...rows(
    [
      "BGKQ-0015", "BGKQ-0016", "BGKQ-0017", "BGKQ-0018",
      "BGKQ-0019", "BGKQ-0020", "BGKQ-0021", "BGKQ-0022",
      "BGKQ-0023", "BGKQ-0024", "BGKQ-0025", "BGKQ-0026",
    ],
    {
      sizeLabel: "1 L",
      packageLabel: "Chai 1 L · thùng 12 chai",
      sellUnit: "chai",
      shortDescription: BERRINO_DESCRIPTION,
    },
  ),

  ...rows(
    [
      "BGKQ-0027", "BGKQ-0028", "BGKQ-0029", "BGKQ-0030",
      "BGKQ-0031", "BGKQ-0032", "BGKQ-0033", "BGKQ-0034",
      "BGKQ-0035", "BGKQ-0036", "BGKQ-0037", "BGKQ-0038",
    ],
    {
      shortDescription: GOLD_DESCRIPTION,
      confidence: "medium",
    },
  ),

  "BGKQ-0063": {
    sizeLabel: "1 kg",
    packageLabel: "Gói 1 kg",
    sellUnit: "gói",
    shortDescription: DOUXIAN_PEARL_DESCRIPTION,
    confidence: "high",
  },
  "BGKQ-0064": {
    sizeLabel: "2 kg",
    packageLabel: "Gói 2 kg",
    sellUnit: "gói",
    shortDescription: DOUXIAN_PEARL_DESCRIPTION,
    confidence: "high",
  },
  "BGKQ-0065": {
    sizeLabel: "3 kg",
    packageLabel: "Gói 3 kg",
    sellUnit: "gói",
    shortDescription: DOUXIAN_PEARL_DESCRIPTION,
    confidence: "high",
  },
  "BGKQ-0066": {
    sizeLabel: "1 kg",
    packageLabel: "Gói 1 kg",
    sellUnit: "gói",
    shortDescription: DOUXIAN_PEARL_DESCRIPTION,
    confidence: "high",
  },
  "BGKQ-0067": {
    sizeLabel: "3 kg",
    packageLabel: "Gói 3 kg",
    sellUnit: "gói",
    shortDescription: DOUXIAN_PEARL_DESCRIPTION,
    confidence: "high",
  },

  "BGKQ-0118": {
    sizeLabel: "500 g",
    packageLabel: "Gói 500 g",
    sellUnit: "gói",
    shortDescription: MILK_FOAM_DESCRIPTION,
    confidence: "high",
  },
  "BGKQ-0120": {
    shortDescription: MILK_FOAM_DESCRIPTION,
    confidence: "medium",
  },
  "BGKQ-0121": {
    shortDescription: MILK_FOAM_DESCRIPTION,
    confidence: "medium",
  },

  ...rows(
    ["BGKQ-0151", "BGKQ-0152", "BGKQ-0153"],
    {
      sizeLabel: "500 g",
      packageLabel: "Gói 500 g",
      sellUnit: "gói",
      shortDescription: BLACK_TEA_9_DESCRIPTION,
    },
  ),
});

export function getCatalogV2CommercialSupplement(sku: string) {
  return CATALOG_V2_COMMERCIAL_SUPPLEMENTS[sku] || null;
}
