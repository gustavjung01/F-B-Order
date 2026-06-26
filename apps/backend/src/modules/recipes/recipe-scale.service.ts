import { getDb } from "../../db/pool";
import {
  applyRecipeRounding,
  areUnitsCompatible,
  ceilRational,
  compare,
  convertRecipeQuantity,
  decimalString,
  divide,
  isRecipeUnit,
  multiply,
  parseDecimal,
  percentFactor,
  rational,
  subtract,
  type Rational,
  type RecipeRoundingPolicy,
  type RecipeUnit,
} from "./recipe-units";

export type RecipeScaleWarning = {
  code:
    | "LARGE_SCALE_REVIEW_RECOMMENDED"
    | "SMALL_SCALE_REVIEW_RECOMMENDED"
    | "OPTIONAL_INGREDIENT_REQUIRES_SELECTION"
    | "CATALOG_INGREDIENT_NOT_CART_READY"
    | "MISSING_USAGE_QUANTITY"
    | "MISSING_USAGE_UNIT"
    | "PACKAGE_CONVERSION_MISSING"
    | "PACKAGE_UNIT_INCOMPATIBLE";
  message: string;
  ingredientId?: string;
};

export type ScaledRecipeIngredient = {
  ingredientId: string;
  name: string;
  sourceType: "catalog" | "external";
  isOptional: boolean;
  isCartReady: boolean;
  catalogProductId: string | null;
  catalogVariantId: string | null;
  selections: Record<string, string>;
  selectionKey: string;
  rawRequiredQuantity: string | null;
  scaledQuantity: string | null;
  wasteAdjustedQuantity: string | null;
  quantityUnit: RecipeUnit | null;
  packageContentQuantity: string | null;
  packageContentUnit: RecipeUnit | null;
  purchasePackageCount: string | null;
  purchaseQuantity: string | null;
  leftoverQuantity: string | null;
  warnings: RecipeScaleWarning[];
};

export type RecipeScaleResult = {
  recipeId: string;
  title: string;
  baseYield: {
    quantity: string;
    unit: RecipeUnit;
  };
  targetYield: {
    quantity: string;
    unit: RecipeUnit;
  };
  scaleFactor: string;
  roundingPolicy: RecipeRoundingPolicy;
  scaledIngredients: ScaledRecipeIngredient[];
  warnings: RecipeScaleWarning[];
};

export type ScalePublishedRecipeInput = {
  recipeId: string;
  targetYieldQuantity: string | number;
  targetYieldUnit: RecipeUnit;
  roundingPolicy: RecipeRoundingPolicy;
};

export class RecipeScaleError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ZERO = rational(0n);
const MAX_TARGET_YIELD = parseDecimal("1000000000");

function fail(code: string, status: number, message: string, details?: unknown): never {
  throw new RecipeScaleError(code, status, message, details);
}

function parsePositiveDecimal(value: string | number, field: string): Rational {
  let parsed: Rational;
  try {
    parsed = parseDecimal(value);
  } catch {
    fail("INVALID_SCALE_INPUT", 400, `${field} must be a decimal number.`);
  }
  if (compare(parsed, ZERO) <= 0 || compare(parsed, MAX_TARGET_YIELD) > 0) {
    fail("INVALID_SCALE_INPUT", 400, `${field} is out of range.`);
  }
  return parsed;
}

function validateInput(input: ScalePublishedRecipeInput) {
  const recipeId = typeof input.recipeId === "string" ? input.recipeId.trim().toLowerCase() : "";
  if (!UUID.test(recipeId)) fail("INVALID_RECIPE_ID", 400, "recipeId must be a UUID.");
  if (!isRecipeUnit(input.targetYieldUnit)) fail("INVALID_TARGET_YIELD_UNIT", 400, "targetYieldUnit is invalid.");
  if (input.roundingPolicy !== "exact" && input.roundingPolicy !== "practical") {
    fail("INVALID_ROUNDING_POLICY", 400, "roundingPolicy must be exact or practical.");
  }
  return {
    recipeId,
    targetYieldQuantity: parsePositiveDecimal(input.targetYieldQuantity, "targetYieldQuantity"),
    targetYieldUnit: input.targetYieldUnit,
    roundingPolicy: input.roundingPolicy,
  };
}

type RecipeRow = {
  id: string;
  title: string;
  yield_quantity: string | null;
  yield_unit: string | null;
};

type IngredientRow = {
  id: string;
  name: string;
  source_type: "catalog" | "external";
  catalog_product_id: string | null;
  catalog_variant_id: string | null;
  default_selections: Record<string, string> | null;
  selection_key: string;
  usage_quantity: string | null;
  usage_unit: string | null;
  package_content_quantity: string | null;
  package_content_unit: string | null;
  waste_percent: string;
  usable_yield_percent: string;
  is_optional: boolean;
  is_cart_ready: boolean;
};

function warning(
  code: RecipeScaleWarning["code"],
  message: string,
  ingredientId?: string,
): RecipeScaleWarning {
  return ingredientId ? { code, message, ingredientId } : { code, message };
}

function numericString(value: Rational) {
  return decimalString(value, 6);
}

function scaleIngredient(
  row: IngredientRow,
  scaleFactor: Rational,
  roundingPolicy: RecipeRoundingPolicy,
): ScaledRecipeIngredient {
  const warnings: RecipeScaleWarning[] = [];

  if (row.is_optional) {
    warnings.push(warning(
      "OPTIONAL_INGREDIENT_REQUIRES_SELECTION",
      "Nguyên liệu tùy chọn chỉ được đưa vào bước mua hàng khi người dùng xác nhận.",
      row.id,
    ));
  }
  if (row.source_type === "catalog" && !row.is_cart_ready) {
    warnings.push(warning(
      "CATALOG_INGREDIENT_NOT_CART_READY",
      "Nguyên liệu Catalog chưa đủ dữ liệu để tạo dòng mua hàng.",
      row.id,
    ));
  }

  if (!row.usage_quantity) {
    warnings.push(warning("MISSING_USAGE_QUANTITY", "Nguyên liệu chưa có định lượng sử dụng.", row.id));
  }
  if (!isRecipeUnit(row.usage_unit)) {
    warnings.push(warning("MISSING_USAGE_UNIT", "Nguyên liệu chưa có đơn vị sử dụng hợp lệ.", row.id));
  }

  if (!row.usage_quantity || !isRecipeUnit(row.usage_unit)) {
    return {
      ingredientId: row.id,
      name: row.name,
      sourceType: row.source_type,
      isOptional: row.is_optional,
      isCartReady: row.is_cart_ready,
      catalogProductId: row.catalog_product_id,
      catalogVariantId: row.catalog_variant_id,
      selections: row.default_selections || {},
      selectionKey: row.selection_key || "",
      rawRequiredQuantity: null,
      scaledQuantity: null,
      wasteAdjustedQuantity: null,
      quantityUnit: isRecipeUnit(row.usage_unit) ? row.usage_unit : null,
      packageContentQuantity: row.package_content_quantity,
      packageContentUnit: isRecipeUnit(row.package_content_unit) ? row.package_content_unit : null,
      purchasePackageCount: null,
      purchaseQuantity: null,
      leftoverQuantity: null,
      warnings,
    };
  }

  const usageQuantity = parsePositiveDecimal(row.usage_quantity, `ingredient ${row.id} usageQuantity`);
  const rawRequired = multiply(usageQuantity, scaleFactor);
  const scaledQuantity = applyRecipeRounding(rawRequired, row.usage_unit, roundingPolicy);
  const wastePercent = parseDecimal(row.waste_percent || "0");
  const usableYieldPercent = parseDecimal(row.usable_yield_percent || "100");
  const wasteAdjusted = multiply(scaledQuantity, percentFactor(wastePercent, usableYieldPercent));

  let packageContentQuantity: string | null = null;
  let packageContentUnit: RecipeUnit | null = null;
  let purchasePackageCount: string | null = null;
  let purchaseQuantity: string | null = null;
  let leftoverQuantity: string | null = null;

  if (!row.package_content_quantity || !isRecipeUnit(row.package_content_unit)) {
    warnings.push(warning(
      "PACKAGE_CONVERSION_MISSING",
      "Thiếu dữ liệu quy đổi bao bì; engine chỉ trả lượng cần dùng, chưa thể tính số gói/chai phải mua.",
      row.id,
    ));
  } else {
    packageContentQuantity = row.package_content_quantity;
    packageContentUnit = row.package_content_unit;
    if (!areUnitsCompatible(row.usage_unit, row.package_content_unit)) {
      warnings.push(warning(
        "PACKAGE_UNIT_INCOMPATIBLE",
        `Không thể quy đổi ${row.usage_unit} sang ${row.package_content_unit} khi chưa có density hoặc conversion được duyệt.`,
        row.id,
      ));
    } else {
      const requiredInPackageUnit = convertRecipeQuantity(
        wasteAdjusted,
        row.usage_unit,
        row.package_content_unit,
      );
      if (!requiredInPackageUnit) {
        fail("INTERNAL_SCALE_ERROR", 500, "Compatible unit conversion unexpectedly failed.");
      }
      const packageSize = parsePositiveDecimal(row.package_content_quantity, `ingredient ${row.id} packageContentQuantity`);
      const packageCount = ceilRational(divide(requiredInPackageUnit, packageSize));
      const purchased = multiply(rational(packageCount), packageSize);
      const leftover = subtract(purchased, requiredInPackageUnit);
      purchasePackageCount = packageCount.toString();
      purchaseQuantity = numericString(purchased);
      leftoverQuantity = numericString(leftover);
    }
  }

  return {
    ingredientId: row.id,
    name: row.name,
    sourceType: row.source_type,
    isOptional: row.is_optional,
    isCartReady: row.is_cart_ready,
    catalogProductId: row.catalog_product_id,
    catalogVariantId: row.catalog_variant_id,
    selections: row.default_selections || {},
    selectionKey: row.selection_key || "",
    rawRequiredQuantity: numericString(rawRequired),
    scaledQuantity: numericString(scaledQuantity),
    wasteAdjustedQuantity: numericString(wasteAdjusted),
    quantityUnit: row.usage_unit,
    packageContentQuantity,
    packageContentUnit,
    purchasePackageCount,
    purchaseQuantity,
    leftoverQuantity,
    warnings,
  };
}

export async function scalePublishedRecipe(input: ScalePublishedRecipeInput): Promise<RecipeScaleResult> {
  const normalized = validateInput(input);
  const recipeResult = await getDb().query<RecipeRow>(
    `SELECT id::text,title,yield_quantity::text,yield_unit
     FROM recipes
     WHERE id=$1::uuid AND status='published' AND visibility='public'`,
    [normalized.recipeId],
  );
  const recipe = recipeResult.rows[0];
  if (!recipe) fail("RECIPE_NOT_FOUND", 404, "Published public recipe was not found.");
  if (!recipe.yield_quantity || !isRecipeUnit(recipe.yield_unit)) {
    fail("RECIPE_YIELD_NOT_CONFIGURED", 422, "Recipe does not have a valid base yield.");
  }
  if (!areUnitsCompatible(recipe.yield_unit, normalized.targetYieldUnit)) {
    fail(
      "TARGET_YIELD_UNIT_INCOMPATIBLE",
      422,
      `Cannot scale recipe yield from ${recipe.yield_unit} to ${normalized.targetYieldUnit}.`,
    );
  }

  const baseYieldQuantity = parsePositiveDecimal(recipe.yield_quantity, "recipe yieldQuantity");
  const targetInBaseUnit = convertRecipeQuantity(
    normalized.targetYieldQuantity,
    normalized.targetYieldUnit,
    recipe.yield_unit,
  );
  if (!targetInBaseUnit) fail("TARGET_YIELD_UNIT_INCOMPATIBLE", 422, "Target yield unit is incompatible.");
  const scaleFactor = divide(targetInBaseUnit, baseYieldQuantity);

  const ingredientResult = await getDb().query<IngredientRow>(
    `SELECT id::text,name,source_type,catalog_product_id::text,catalog_variant_id::text,
      default_selections,selection_key,usage_quantity::text,usage_unit,
      package_content_quantity::text,package_content_unit,waste_percent::text,
      usable_yield_percent::text,is_optional,is_cart_ready
     FROM recipe_ingredients WHERE recipe_id=$1::uuid ORDER BY sort_order,id`,
    [normalized.recipeId],
  );

  const topLevelWarnings: RecipeScaleWarning[] = [];
  if (compare(scaleFactor, parseDecimal("8")) >= 0) {
    topLevelWarnings.push(warning(
      "LARGE_SCALE_REVIEW_RECOMMENDED",
      "Hệ số scale lớn; cần kiểm tra lại thiết bị, thời gian thao tác và chất lượng theo mẻ.",
    ));
  } else if (compare(scaleFactor, parseDecimal("0.25")) <= 0) {
    topLevelWarnings.push(warning(
      "SMALL_SCALE_REVIEW_RECOMMENDED",
      "Hệ số scale rất nhỏ; cần kiểm tra giới hạn cân đong và sai số dụng cụ.",
    ));
  }

  const scaledIngredients = ingredientResult.rows.map((ingredient) =>
    scaleIngredient(ingredient, scaleFactor, normalized.roundingPolicy),
  );
  const ingredientWarnings = scaledIngredients.flatMap((ingredient) => ingredient.warnings);

  return {
    recipeId: recipe.id,
    title: recipe.title,
    baseYield: {
      quantity: numericString(baseYieldQuantity),
      unit: recipe.yield_unit,
    },
    targetYield: {
      quantity: numericString(normalized.targetYieldQuantity),
      unit: normalized.targetYieldUnit,
    },
    scaleFactor: numericString(scaleFactor),
    roundingPolicy: normalized.roundingPolicy,
    scaledIngredients,
    warnings: [...topLevelWarnings, ...ingredientWarnings],
  };
}
