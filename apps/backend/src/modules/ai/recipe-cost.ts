export type RecipeCostStatus = "ready" | "partial" | "unavailable";
export type RecipeCostLineStatus =
  | "calculated"
  | "missing_quantity"
  | "missing_catalog"
  | "missing_price"
  | "missing_package_size"
  | "unit_mismatch"
  | "nested_recipe";

type Dimension = "mass" | "volume" | "count";

type NormalizedQuantity = {
  dimension: Dimension;
  baseQuantity: number;
  displayUnit: string;
};

type PackageMeasure = {
  dimension: Dimension;
  baseQuantity: number;
  label: string;
};

export type RecipeCostIngredientInput = {
  productName: string;
  quantity: string | number | null;
  unit: string | null;
  optional: boolean;
  catalogVariantId: string | null;
  sourceType: string | null;
  sourceRecipeSlug: string | null;
  sku: string | null;
  shopPrice: string | number | null;
  retailPrice: string | number | null;
  variantData: unknown;
  productData: unknown;
};

export type RecipeCostLine = {
  productName: string;
  quantity: number | null;
  unit: string | null;
  optional: boolean;
  catalogVariantId: string | null;
  sku: string | null;
  status: RecipeCostLineStatus;
  reason: string | null;
  priceSource: "shop" | "retail" | null;
  packagePrice: number | null;
  packageLabel: string | null;
  unitCost: number | null;
  lineCost: number | null;
};

export type RecipeCostPreview = {
  status: RecipeCostStatus;
  recipeId: string;
  recipeTitle: string;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  knownMandatoryCost: number;
  optionalCost: number;
  totalWithOptional: number;
  costPerYield: number | null;
  calculatedLineCount: number;
  missingMandatoryCount: number;
  lines: RecipeCostLine[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/,/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

function collectMeasureCandidates(value: unknown, output: string[], depth = 0): void {
  if (depth > 4 || value === null || value === undefined) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (text && text.length <= 240) output.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) collectMeasureCandidates(item, output, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!/(name|label|option|package|size|weight|volume|unit|quy|dung|net)/i.test(key)) continue;
    collectMeasureCandidates(child, output, depth + 1);
  }
}

function parsePackageMeasure(...values: unknown[]): PackageMeasure | null {
  const candidates: string[] = [];
  for (const value of values) collectMeasureCandidates(value, candidates);

  for (const original of candidates) {
    const text = normalizeSearchText(original).replace(/,/g, ".");
    const metric = text.match(/(?:^|\D)(\d+(?:\.\d+)?)\s*(kg|g|lit|liter|l|ml)\b/i);
    if (metric) {
      const amount = Number(metric[1]);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const unit = metric[2].toLowerCase();
      if (unit === "kg" || unit === "g") {
        return { dimension: "mass", baseQuantity: unit === "kg" ? amount * 1000 : amount, label: original };
      }
      return { dimension: "volume", baseQuantity: unit === "l" || unit === "lit" || unit === "liter" ? amount * 1000 : amount, label: original };
    }

    const count = text.match(/(?:^|\D)(\d+(?:\.\d+)?)\s*(chai|goi|hop|cai|tui|lon|hu|bich|pack|piece|pcs)\b/i);
    if (count) {
      const amount = Number(count[1]);
      if (Number.isFinite(amount) && amount > 0) {
        return { dimension: "count", baseQuantity: amount, label: original };
      }
    }
  }
  return null;
}

function normalizeRecipeQuantity(quantity: unknown, unitValue: string | null): NormalizedQuantity | null {
  const amount = toNumber(quantity);
  if (!amount || amount <= 0) return null;
  const unit = normalizeSearchText(String(unitValue || "").trim());
  if (unit === "g") return { dimension: "mass", baseQuantity: amount, displayUnit: "g" };
  if (unit === "kg") return { dimension: "mass", baseQuantity: amount * 1000, displayUnit: "kg" };
  if (unit === "ml") return { dimension: "volume", baseQuantity: amount, displayUnit: "ml" };
  if (["l", "lit", "liter"].includes(unit)) return { dimension: "volume", baseQuantity: amount * 1000, displayUnit: unitValue || "l" };
  if (["piece", "pcs", "pack", "cai", "chai", "goi", "hop", "tui", "lon", "hu", "bich", "portion"].includes(unit)) {
    return { dimension: "count", baseQuantity: amount, displayUnit: unitValue || "piece" };
  }
  return null;
}

function selectPrice(input: RecipeCostIngredientInput): { value: number; source: "shop" | "retail" } | null {
  const shop = toNumber(input.shopPrice);
  if (shop && shop > 0) return { value: shop, source: "shop" };
  const retail = toNumber(input.retailPrice);
  if (retail && retail > 0) return { value: retail, source: "retail" };
  return null;
}

function unresolvedLine(input: RecipeCostIngredientInput, status: RecipeCostLineStatus, reason: string): RecipeCostLine {
  return {
    productName: input.productName,
    quantity: toNumber(input.quantity),
    unit: input.unit,
    optional: input.optional,
    catalogVariantId: input.catalogVariantId,
    sku: input.sku,
    status,
    reason,
    priceSource: null,
    packagePrice: null,
    packageLabel: null,
    unitCost: null,
    lineCost: null,
  };
}

export function calculateRecipeCostLine(input: RecipeCostIngredientInput): RecipeCostLine {
  if (input.sourceType === "recipe" || input.sourceRecipeSlug) {
    return unresolvedLine(input, "nested_recipe", "Công thức nền chưa có giá vốn được chốt để cộng dồn.");
  }
  const recipeQuantity = normalizeRecipeQuantity(input.quantity, input.unit);
  if (!recipeQuantity) {
    return unresolvedLine(input, "missing_quantity", "Thiếu định lượng hoặc đơn vị chưa hỗ trợ quy đổi.");
  }
  if (!input.catalogVariantId) {
    return unresolvedLine(input, "missing_catalog", "Nguyên liệu chưa liên kết SKU catalog.");
  }
  const price = selectPrice(input);
  if (!price) {
    return unresolvedLine(input, "missing_price", "SKU chưa có giá sỉ hoặc giá lẻ hợp lệ.");
  }
  const packageMeasure = parsePackageMeasure(input.variantData, input.productData);
  if (!packageMeasure) {
    return unresolvedLine(input, "missing_package_size", "Catalog chưa có quy cách định lượng đọc được, ví dụ 1 kg hoặc 750 ml.");
  }
  if (packageMeasure.dimension !== recipeQuantity.dimension) {
    return unresolvedLine(input, "unit_mismatch", "Đơn vị công thức không cùng loại với quy cách SKU.");
  }

  const unitCost = price.value / packageMeasure.baseQuantity;
  const lineCost = recipeQuantity.baseQuantity * unitCost;
  return {
    productName: input.productName,
    quantity: toNumber(input.quantity),
    unit: input.unit,
    optional: input.optional,
    catalogVariantId: input.catalogVariantId,
    sku: input.sku,
    status: "calculated",
    reason: null,
    priceSource: price.source,
    packagePrice: roundMoney(price.value),
    packageLabel: packageMeasure.label,
    unitCost: roundMoney(unitCost),
    lineCost: roundMoney(lineCost),
  };
}

export function buildRecipeCostPreview(
  recipe: { id: string; title: string; yieldQuantity: string | number | null; yieldUnit: string | null },
  ingredients: RecipeCostIngredientInput[],
): RecipeCostPreview {
  const lines = ingredients.map(calculateRecipeCostLine);
  const mandatory = lines.filter((line) => !line.optional);
  const calculatedMandatory = mandatory.filter((line) => line.status === "calculated");
  const missingMandatoryCount = mandatory.length - calculatedMandatory.length;
  const knownMandatoryCost = roundMoney(calculatedMandatory.reduce((sum, line) => sum + (line.lineCost || 0), 0));
  const optionalCost = roundMoney(lines.filter((line) => line.optional && line.status === "calculated").reduce((sum, line) => sum + (line.lineCost || 0), 0));
  const yieldQuantity = toNumber(recipe.yieldQuantity);
  const status: RecipeCostStatus = !ingredients.length || !calculatedMandatory.length
    ? "unavailable"
    : missingMandatoryCount > 0
      ? "partial"
      : "ready";

  return {
    status,
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    yieldQuantity: yieldQuantity && yieldQuantity > 0 ? yieldQuantity : null,
    yieldUnit: recipe.yieldUnit,
    knownMandatoryCost,
    optionalCost,
    totalWithOptional: roundMoney(knownMandatoryCost + optionalCost),
    costPerYield: status === "ready" && yieldQuantity && yieldQuantity > 0
      ? roundMoney(knownMandatoryCost / yieldQuantity)
      : null,
    calculatedLineCount: lines.filter((line) => line.status === "calculated").length,
    missingMandatoryCount,
    lines,
  };
}

export const __testing = {
  normalizeRecipeQuantity,
  parsePackageMeasure,
};
