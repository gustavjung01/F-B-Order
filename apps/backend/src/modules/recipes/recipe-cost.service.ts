import { getDb } from "../../db/pool";
import {
  RecipeScaleError,
  scalePublishedRecipe,
  type RecipeScaleWarning,
  type ScalePublishedRecipeInput,
  type ScaledRecipeIngredient,
} from "./recipe-scale.service";
import {
  add,
  convertRecipeQuantity,
  decimalString,
  divide,
  multiply,
  parseDecimal,
  subtract,
  zeroRational,
  type Rational,
} from "./recipe-units";

export const RECIPE_COST_CURRENCY = "VND" as const;

export type RecipeCostWarning = {
  code:
    | "OPTIONAL_INGREDIENT_EXCLUDED"
    | "MISSING_CATALOG_LINK"
    | "CATALOG_LINK_MISMATCH"
    | "CATALOG_VARIANT_UNAVAILABLE"
    | "MARKET_PRICE_UNAVAILABLE"
    | "DEALER_PRICE_UNAVAILABLE"
    | "COST_QUANTITY_UNAVAILABLE";
  message: string;
  ingredientId: string;
};

export type RecipeIngredientPricingStatus =
  | "priced"
  | "missing_catalog_link"
  | "catalog_link_mismatch"
  | "catalog_variant_unavailable"
  | "market_price"
  | "dealer_price_unavailable"
  | "quantity_unavailable";

export type RecipeIngredientCost = {
  ingredientId: string;
  name: string;
  sourceType: "catalog" | "external";
  isOptional: boolean;
  includedInTotals: boolean;
  catalogProductId: string | null;
  catalogVariantId: string | null;
  sku: string | null;
  variantName: string | null;
  pricingStatus: RecipeIngredientPricingStatus;
  pricingSource: "dealer" | null;
  currency: typeof RECIPE_COST_CURRENCY;
  packagePrice: string | null;
  scaledQuantity: string | null;
  wasteAdjustedQuantity: string | null;
  quantityUnit: ScaledRecipeIngredient["quantityUnit"];
  packageContentQuantity: string | null;
  packageContentUnit: ScaledRecipeIngredient["packageContentUnit"];
  purchasePackageCount: string | null;
  purchaseQuantity: string | null;
  leftoverQuantity: string | null;
  scaledUsageCost: string | null;
  wasteCost: string | null;
  wasteAdjustedCost: string | null;
  purchaseCost: string | null;
  leftoverValue: string | null;
  scaleWarnings: RecipeScaleWarning[];
  costWarnings: RecipeCostWarning[];
};

export type RecipeCostResult = {
  recipeId: string;
  title: string;
  baseYield: {
    quantity: string;
    unit: ScaledRecipeIngredient["quantityUnit"];
  };
  targetYield: {
    quantity: string;
    unit: ScaledRecipeIngredient["quantityUnit"];
  };
  scaleFactor: string;
  roundingPolicy: ScalePublishedRecipeInput["roundingPolicy"];
  currency: typeof RECIPE_COST_CURRENCY;
  complete: boolean;
  selectedOptionalIngredientIds: string[];
  pricedIngredientCount: number;
  unpricedIngredientCount: number;
  excludedOptionalIngredientCount: number;
  totals: {
    scaledUsageCost: string;
    wasteCost: string;
    wasteAdjustedCost: string;
    purchaseCost: string;
    leftoverValue: string;
  };
  ingredientCosts: RecipeIngredientCost[];
  scaleWarnings: RecipeScaleWarning[];
  costWarnings: RecipeCostWarning[];
};

export type CostPublishedRecipeInput = ScalePublishedRecipeInput & {
  includeOptionalIngredientIds?: unknown;
};

export class RecipeCostError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type CatalogVariantRow = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  price_mode: "fixed" | "market";
  price_label: string | null;
  shop_price: string | null;
  status: string;
  is_active: boolean;
  is_public: boolean;
  is_orderable: boolean;
  product_status: string;
};

type CostAmounts = {
  scaledUsageCost: Rational;
  wasteCost: Rational;
  wasteAdjustedCost: Rational;
  purchaseCost: Rational;
  leftoverValue: Rational;
};

type CostedIngredient = {
  item: RecipeIngredientCost;
  amounts: CostAmounts | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, status: number, message: string, details?: unknown): never {
  throw new RecipeCostError(code, status, message, details);
}

function moneyString(value: Rational) {
  return decimalString(value, 2);
}

function costWarning(
  code: RecipeCostWarning["code"],
  message: string,
  ingredientId: string,
): RecipeCostWarning {
  return { code, message, ingredientId };
}

function normalizeOptionalIngredientIds(value: unknown): Set<string> {
  if (value === undefined || value === null) return new Set();
  if (!Array.isArray(value)) {
    fail("INVALID_OPTIONAL_INGREDIENT_SELECTION", 400, "includeOptionalIngredientIds must be an array of UUIDs.");
  }

  const result = new Set<string>();
  for (const candidate of value) {
    const normalized = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
    if (!UUID.test(normalized)) {
      fail("INVALID_OPTIONAL_INGREDIENT_SELECTION", 400, "includeOptionalIngredientIds contains an invalid UUID.");
    }
    result.add(normalized);
  }
  return result;
}

function baseItem(
  ingredient: ScaledRecipeIngredient,
  includedInTotals: boolean,
  pricingStatus: RecipeIngredientPricingStatus,
  scaleWarnings: RecipeScaleWarning[],
  costWarnings: RecipeCostWarning[],
  variant?: CatalogVariantRow,
): RecipeIngredientCost {
  return {
    ingredientId: ingredient.ingredientId,
    name: ingredient.name,
    sourceType: ingredient.sourceType,
    isOptional: ingredient.isOptional,
    includedInTotals,
    catalogProductId: ingredient.catalogProductId,
    catalogVariantId: ingredient.catalogVariantId,
    sku: variant?.sku || null,
    variantName: variant?.name || null,
    pricingStatus,
    pricingSource: null,
    currency: RECIPE_COST_CURRENCY,
    packagePrice: null,
    scaledQuantity: ingredient.scaledQuantity,
    wasteAdjustedQuantity: ingredient.wasteAdjustedQuantity,
    quantityUnit: ingredient.quantityUnit,
    packageContentQuantity: ingredient.packageContentQuantity,
    packageContentUnit: ingredient.packageContentUnit,
    purchasePackageCount: ingredient.purchasePackageCount,
    purchaseQuantity: ingredient.purchaseQuantity,
    leftoverQuantity: ingredient.leftoverQuantity,
    scaledUsageCost: null,
    wasteCost: null,
    wasteAdjustedCost: null,
    purchaseCost: null,
    leftoverValue: null,
    scaleWarnings,
    costWarnings,
  };
}

function costIngredient(
  ingredient: ScaledRecipeIngredient,
  variants: Map<string, CatalogVariantRow>,
  selectedOptionalIngredientIds: Set<string>,
): CostedIngredient {
  const includedInTotals = !ingredient.isOptional || selectedOptionalIngredientIds.has(ingredient.ingredientId);
  const scaleWarnings = ingredient.warnings.filter(
    (item) => item.code !== "OPTIONAL_INGREDIENT_REQUIRES_SELECTION" || !includedInTotals,
  );
  const warnings: RecipeCostWarning[] = [];

  if (ingredient.isOptional && !includedInTotals) {
    warnings.push(costWarning(
      "OPTIONAL_INGREDIENT_EXCLUDED",
      "Nguyên liệu tùy chọn không được cộng vào tổng chi phí vì request chưa chọn nguyên liệu này.",
      ingredient.ingredientId,
    ));
  }

  if (
    ingredient.sourceType !== "catalog"
    || !ingredient.catalogProductId
    || !ingredient.catalogVariantId
  ) {
    warnings.push(costWarning(
      "MISSING_CATALOG_LINK",
      "Nguyên liệu chưa liên kết đầy đủ với sản phẩm và biến thể Catalog.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "missing_catalog_link", scaleWarnings, warnings),
      amounts: null,
    };
  }

  const variant = variants.get(ingredient.catalogVariantId);
  if (!variant) {
    warnings.push(costWarning(
      "CATALOG_VARIANT_UNAVAILABLE",
      "Biến thể Catalog đã liên kết không còn tồn tại trong Catalog v2.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "catalog_variant_unavailable", scaleWarnings, warnings),
      amounts: null,
    };
  }

  if (variant.product_id !== ingredient.catalogProductId) {
    warnings.push(costWarning(
      "CATALOG_LINK_MISMATCH",
      "Biến thể Catalog không thuộc sản phẩm đã liên kết với nguyên liệu.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "catalog_link_mismatch", scaleWarnings, warnings, variant),
      amounts: null,
    };
  }

  if (
    !variant.is_active
    || !variant.is_public
    || variant.product_status !== "active"
    || !["active", "market_price"].includes(variant.status)
  ) {
    warnings.push(costWarning(
      "CATALOG_VARIANT_UNAVAILABLE",
      "Biến thể Catalog đã liên kết hiện không hoạt động hoặc không công khai.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "catalog_variant_unavailable", scaleWarnings, warnings, variant),
      amounts: null,
    };
  }

  if (variant.price_mode === "market") {
    warnings.push(costWarning(
      "MARKET_PRICE_UNAVAILABLE",
      variant.price_label || "Biến thể đang dùng giá thời điểm và không thể tính tự động.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "market_price", scaleWarnings, warnings, variant),
      amounts: null,
    };
  }

  if (!variant.is_orderable) {
    warnings.push(costWarning(
      "CATALOG_VARIANT_UNAVAILABLE",
      "Biến thể Catalog chưa sẵn sàng để đặt mua.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "catalog_variant_unavailable", scaleWarnings, warnings, variant),
      amounts: null,
    };
  }

  if (!variant.shop_price) {
    warnings.push(costWarning(
      "DEALER_PRICE_UNAVAILABLE",
      "Biến thể Catalog chưa có giá đại lý cố định.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "dealer_price_unavailable", scaleWarnings, warnings, variant),
      amounts: null,
    };
  }

  if (
    !ingredient.scaledQuantity
    || !ingredient.wasteAdjustedQuantity
    || !ingredient.quantityUnit
    || !ingredient.packageContentQuantity
    || !ingredient.packageContentUnit
    || !ingredient.purchasePackageCount
  ) {
    warnings.push(costWarning(
      "COST_QUANTITY_UNAVAILABLE",
      "Thiếu dữ liệu định lượng hoặc quy đổi bao bì để tính chi phí.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "quantity_unavailable", scaleWarnings, warnings, variant),
      amounts: null,
    };
  }

  const scaledInPackageUnit = convertRecipeQuantity(
    parseDecimal(ingredient.scaledQuantity),
    ingredient.quantityUnit,
    ingredient.packageContentUnit,
  );
  const wasteAdjustedInPackageUnit = convertRecipeQuantity(
    parseDecimal(ingredient.wasteAdjustedQuantity),
    ingredient.quantityUnit,
    ingredient.packageContentUnit,
  );
  if (!scaledInPackageUnit || !wasteAdjustedInPackageUnit) {
    warnings.push(costWarning(
      "COST_QUANTITY_UNAVAILABLE",
      "Đơn vị sử dụng và đơn vị bao bì không tương thích để tính chi phí.",
      ingredient.ingredientId,
    ));
    return {
      item: baseItem(ingredient, includedInTotals, "quantity_unavailable", scaleWarnings, warnings, variant),
      amounts: null,
    };
  }

  const packageSize = parseDecimal(ingredient.packageContentQuantity);
  const packagePrice = parseDecimal(variant.shop_price);
  const scaledUsageCost = multiply(divide(scaledInPackageUnit, packageSize), packagePrice);
  const wasteAdjustedCost = multiply(divide(wasteAdjustedInPackageUnit, packageSize), packagePrice);
  const wasteCost = subtract(wasteAdjustedCost, scaledUsageCost);
  const purchaseCost = multiply(parseDecimal(ingredient.purchasePackageCount), packagePrice);
  const leftoverValue = subtract(purchaseCost, wasteAdjustedCost);
  const amounts = {
    scaledUsageCost,
    wasteCost,
    wasteAdjustedCost,
    purchaseCost,
    leftoverValue,
  };

  const item = baseItem(ingredient, includedInTotals, "priced", scaleWarnings, warnings, variant);
  return {
    item: {
      ...item,
      pricingSource: "dealer",
      packagePrice: moneyString(packagePrice),
      scaledUsageCost: moneyString(scaledUsageCost),
      wasteCost: moneyString(wasteCost),
      wasteAdjustedCost: moneyString(wasteAdjustedCost),
      purchaseCost: moneyString(purchaseCost),
      leftoverValue: moneyString(leftoverValue),
    },
    amounts,
  };
}

export async function costPublishedRecipe(input: CostPublishedRecipeInput): Promise<RecipeCostResult> {
  const selectedOptionalIngredientIds = normalizeOptionalIngredientIds(input.includeOptionalIngredientIds);
  const scaled = await scalePublishedRecipe({
    recipeId: input.recipeId,
    targetYieldQuantity: input.targetYieldQuantity,
    targetYieldUnit: input.targetYieldUnit,
    roundingPolicy: input.roundingPolicy,
  });

  const optionalIngredientIds = new Set(
    scaled.scaledIngredients.filter((ingredient) => ingredient.isOptional).map((ingredient) => ingredient.ingredientId),
  );
  const invalidSelections = [...selectedOptionalIngredientIds].filter((ingredientId) => !optionalIngredientIds.has(ingredientId));
  if (invalidSelections.length > 0) {
    fail(
      "OPTIONAL_INGREDIENT_NOT_FOUND",
      400,
      "Selected optional ingredient does not belong to this recipe or is not optional.",
      { ingredientIds: invalidSelections },
    );
  }

  const variantIds = [...new Set(
    scaled.scaledIngredients
      .map((ingredient) => ingredient.catalogVariantId)
      .filter((variantId): variantId is string => Boolean(variantId)),
  )];
  const variants = new Map<string, CatalogVariantRow>();
  if (variantIds.length > 0) {
    const result = await getDb().query<CatalogVariantRow>(
      `SELECT variant.id::text,variant.product_id::text,variant.sku,variant.name,
        variant.price_mode,variant.price_label,variant.shop_price::text,variant.status,
        variant.is_active,variant.is_public,variant.is_orderable,product.status AS product_status
       FROM catalog_variants variant
       JOIN catalog_products product ON product.id=variant.product_id
       WHERE variant.id=ANY($1::uuid[])
         AND variant.catalog_version='hung-phat-v2'
         AND product.catalog_version='hung-phat-v2'`,
      [variantIds],
    );
    for (const row of result.rows) variants.set(row.id, row);
  }

  const costedIngredients = scaled.scaledIngredients.map((ingredient) =>
    costIngredient(ingredient, variants, selectedOptionalIngredientIds),
  );
  const totals: CostAmounts = {
    scaledUsageCost: zeroRational(),
    wasteCost: zeroRational(),
    wasteAdjustedCost: zeroRational(),
    purchaseCost: zeroRational(),
    leftoverValue: zeroRational(),
  };

  for (const costed of costedIngredients) {
    if (!costed.item.includedInTotals || !costed.amounts) continue;
    totals.scaledUsageCost = add(totals.scaledUsageCost, costed.amounts.scaledUsageCost);
    totals.wasteCost = add(totals.wasteCost, costed.amounts.wasteCost);
    totals.wasteAdjustedCost = add(totals.wasteAdjustedCost, costed.amounts.wasteAdjustedCost);
    totals.purchaseCost = add(totals.purchaseCost, costed.amounts.purchaseCost);
    totals.leftoverValue = add(totals.leftoverValue, costed.amounts.leftoverValue);
  }

  const included = costedIngredients.filter((costed) => costed.item.includedInTotals);
  const unpricedIngredientCount = included.filter((costed) => costed.item.pricingStatus !== "priced").length;
  const scaleWarnings = scaled.warnings.filter(
    (item) => item.code !== "OPTIONAL_INGREDIENT_REQUIRES_SELECTION"
      || !item.ingredientId
      || !selectedOptionalIngredientIds.has(item.ingredientId),
  );
  const costWarnings = costedIngredients.flatMap((costed) => costed.item.costWarnings);

  return {
    recipeId: scaled.recipeId,
    title: scaled.title,
    baseYield: scaled.baseYield,
    targetYield: scaled.targetYield,
    scaleFactor: scaled.scaleFactor,
    roundingPolicy: scaled.roundingPolicy,
    currency: RECIPE_COST_CURRENCY,
    complete: unpricedIngredientCount === 0,
    selectedOptionalIngredientIds: [...selectedOptionalIngredientIds].sort(),
    pricedIngredientCount: included.length - unpricedIngredientCount,
    unpricedIngredientCount,
    excludedOptionalIngredientCount: costedIngredients.filter((costed) => !costed.item.includedInTotals).length,
    totals: {
      scaledUsageCost: moneyString(totals.scaledUsageCost),
      wasteCost: moneyString(totals.wasteCost),
      wasteAdjustedCost: moneyString(totals.wasteAdjustedCost),
      purchaseCost: moneyString(totals.purchaseCost),
      leftoverValue: moneyString(totals.leftoverValue),
    },
    ingredientCosts: costedIngredients.map((costed) => costed.item),
    scaleWarnings,
    costWarnings,
  };
}

export { RecipeScaleError };
