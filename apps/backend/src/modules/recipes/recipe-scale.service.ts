import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SCALE_OUTPUT_DECIMALS = 3;
const FACTOR_OUTPUT_DECIMALS = 6;

type DecimalValue = { coefficient: bigint; scale: number };

type ScaleSource = "current" | "published";

type StoredIngredient = {
  id: string | null;
  sortOrder: number;
  productName: string;
  quantity: string | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
  catalogVariantId: string | null;
  catalogProductId: string | null;
  catalogSnapshot: unknown;
};

type RecipeScaleSource = {
  recipeId: string;
  slug: string;
  title: string;
  versionId: string | null;
  versionNo: number | null;
  baseYieldQuantity: string | null;
  baseYieldUnit: string | null;
  ingredients: StoredIngredient[];
};

export type RecipeScaleIngredientInput = {
  id?: string | null;
  sortOrder?: number;
  productName: string;
  quantity: string | number | null;
  unit?: string | null;
  note?: string | null;
  optional?: boolean;
  catalogVariantId?: string | null;
  catalogProductId?: string | null;
  catalogSnapshot?: unknown;
};

export type RecipeScaleCalculationInput = {
  baseYieldQuantity: string | number | null;
  baseYieldUnit: string | null;
  targetYieldQuantity: string | number | null;
  targetYieldUnit?: string | null;
  ingredients: RecipeScaleIngredientInput[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUuid(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("INVALID_RECIPE_ID", 400, "recipeId must be a UUID.");
  }
  return normalized;
}

function normalizeUnit(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}

function readRequiredYieldUnit(value: unknown, code: string): string {
  const unit = typeof value === "string" ? value.trim() : "";
  if (!unit) {
    throw new OrderEngineError(code, 409, "Recipe yield unit is required before scaling.");
  }
  return unit;
}

function parsePositiveDecimal(value: unknown, code: string, message: string): DecimalValue {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new OrderEngineError(code, 400, message);
  }

  const [whole, fraction = ""] = raw.split(".");
  const coefficient = BigInt(`${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0");
  if (coefficient <= 0n) {
    throw new OrderEngineError(code, 400, message);
  }

  return { coefficient, scale: fraction.length };
}

function parseOptionalPositiveDecimal(value: unknown, code: string, message: string): DecimalValue | null {
  if (value === null || value === undefined || value === "") return null;
  return parsePositiveDecimal(value, code, message);
}

function pow10(scale: number): bigint {
  return 10n ** BigInt(scale);
}

function formatFixed(coefficient: bigint, scale: number): string {
  const raw = coefficient.toString().padStart(scale + 1, "0");
  if (scale === 0) return raw;
  const whole = raw.slice(0, -scale);
  const fraction = raw.slice(-scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function formatRational(numerator: bigint, denominator: bigint, outputScale: number): string {
  if (numerator < 0n || denominator <= 0n) {
    throw new Error("Scale rational must be positive.");
  }

  const multiplier = pow10(outputScale);
  const scaledNumerator = numerator * multiplier;
  const quotient = scaledNumerator / denominator;
  const remainder = scaledNumerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return formatFixed(rounded, outputScale);
}

function scaleQuantity(quantity: DecimalValue, targetYield: DecimalValue, baseYield: DecimalValue): string {
  const numerator = quantity.coefficient * targetYield.coefficient * pow10(baseYield.scale);
  const denominator = pow10(quantity.scale) * pow10(targetYield.scale) * baseYield.coefficient;
  return formatRational(numerator, denominator, SCALE_OUTPUT_DECIMALS);
}

function scaleFactor(targetYield: DecimalValue, baseYield: DecimalValue): string {
  const numerator = targetYield.coefficient * pow10(baseYield.scale);
  const denominator = baseYield.coefficient * pow10(targetYield.scale);
  return formatRational(numerator, denominator, FACTOR_OUTPUT_DECIMALS);
}

function normalizeSource(value: unknown): ScaleSource {
  if (value === undefined || value === null || value === "" || value === "current") return "current";
  if (value === "published") return "published";
  throw new OrderEngineError("RECIPE_SCALE_SOURCE_INVALID", 400, "source must be current or published.");
}

function ingredientFromSnapshot(value: unknown, index: number): StoredIngredient {
  if (!isRecord(value)) {
    throw new OrderEngineError("RECIPE_SCALE_SNAPSHOT_INVALID", 409, `Published recipe ingredient ${index + 1} is invalid.`);
  }

  const catalogSnapshot = value.catalogSnapshot;
  const fallbackName = isRecord(catalogSnapshot) && typeof catalogSnapshot.productName === "string"
    ? catalogSnapshot.productName
    : null;
  const productName = typeof value.productName === "string" && value.productName.trim()
    ? value.productName.trim()
    : fallbackName;
  if (!productName) {
    throw new OrderEngineError("RECIPE_SCALE_SNAPSHOT_INVALID", 409, `Published recipe ingredient ${index + 1} has no name.`);
  }

  const quantity = typeof value.quantity === "number" || typeof value.quantity === "string"
    ? String(value.quantity)
    : null;
  return {
    id: null,
    sortOrder: typeof value.sortOrder === "number" && Number.isInteger(value.sortOrder) ? value.sortOrder : index,
    productName,
    quantity,
    unit: typeof value.unit === "string" ? value.unit : null,
    note: typeof value.note === "string" ? value.note : null,
    optional: value.optional === true,
    catalogVariantId: typeof value.catalogVariantId === "string" ? value.catalogVariantId : null,
    catalogProductId: typeof value.catalogProductId === "string" ? value.catalogProductId : null,
    catalogSnapshot,
  };
}

function calculateFromSource(
  source: RecipeScaleSource,
  targetYieldQuantity: unknown,
  targetYieldUnit: unknown,
) {
  const baseYield = parsePositiveDecimal(
    source.baseYieldQuantity,
    "RECIPE_SCALE_BASE_YIELD_INVALID",
    "Recipe base yield quantity must be a positive decimal before scaling.",
  );
  const targetYield = parsePositiveDecimal(
    targetYieldQuantity,
    "RECIPE_SCALE_TARGET_YIELD_INVALID",
    "targetYieldQuantity must be a positive decimal.",
  );
  const baseUnit = readRequiredYieldUnit(source.baseYieldUnit, "RECIPE_SCALE_BASE_YIELD_UNIT_REQUIRED");
  const requestedUnit = typeof targetYieldUnit === "string" && targetYieldUnit.trim()
    ? targetYieldUnit.trim()
    : baseUnit;
  if (normalizeUnit(requestedUnit) !== normalizeUnit(baseUnit)) {
    throw new OrderEngineError(
      "RECIPE_SCALE_YIELD_UNIT_MISMATCH",
      400,
      `targetYieldUnit must match the recipe base yield unit (${baseUnit}).`,
    );
  }

  const factor = scaleFactor(targetYield, baseYield);
  const ingredients = source.ingredients.map((ingredient) => {
    const baseQuantity = parseOptionalPositiveDecimal(
      ingredient.quantity,
      "RECIPE_SCALE_INGREDIENT_QUANTITY_INVALID",
      `Ingredient ${ingredient.productName} quantity must be a positive decimal when present.`,
    );
    return {
      id: ingredient.id,
      sortOrder: ingredient.sortOrder,
      productName: ingredient.productName,
      unit: ingredient.unit,
      note: ingredient.note,
      optional: ingredient.optional,
      catalogVariantId: ingredient.catalogVariantId,
      catalogProductId: ingredient.catalogProductId,
      catalogSnapshot: ingredient.catalogSnapshot,
      baseQuantity: baseQuantity ? formatFixed(baseQuantity.coefficient, baseQuantity.scale) : null,
      scaledQuantity: baseQuantity ? scaleQuantity(baseQuantity, targetYield, baseYield) : null,
      scaleStatus: baseQuantity ? "scaled" : "manual_quantity_required",
    };
  });

  const unscaledIngredientCount = ingredients.filter((ingredient) => ingredient.scaleStatus !== "scaled").length;
  const catalogIngredientCount = ingredients.filter((ingredient) => ingredient.catalogVariantId).length;

  return {
    recipe: {
      id: source.recipeId,
      slug: source.slug,
      title: source.title,
      sourceVersionId: source.versionId,
      sourceVersionNo: source.versionNo,
    },
    baseYield: { quantity: formatFixed(baseYield.coefficient, baseYield.scale), unit: baseUnit },
    targetYield: { quantity: formatFixed(targetYield.coefficient, targetYield.scale), unit: requestedUnit },
    scaleFactor: factor,
    rounding: { mode: "half_up", maximumFractionDigits: SCALE_OUTPUT_DECIMALS },
    ingredients,
    summary: {
      ingredientCount: ingredients.length,
      scaledIngredientCount: ingredients.length - unscaledIngredientCount,
      manualQuantityRequiredCount: unscaledIngredientCount,
      catalogIngredientCount,
    },
  };
}

export function calculateRecipeScale(input: RecipeScaleCalculationInput) {
  return calculateFromSource(
    {
      recipeId: "calculation",
      slug: "calculation",
      title: "Recipe scale calculation",
      versionId: null,
      versionNo: null,
      baseYieldQuantity: input.baseYieldQuantity === null ? null : String(input.baseYieldQuantity),
      baseYieldUnit: input.baseYieldUnit,
      ingredients: input.ingredients.map((ingredient, index) => ({
        id: ingredient.id || null,
        sortOrder: Number.isInteger(ingredient.sortOrder) ? ingredient.sortOrder! : index,
        productName: ingredient.productName,
        quantity: ingredient.quantity === null ? null : String(ingredient.quantity),
        unit: ingredient.unit || null,
        note: ingredient.note || null,
        optional: ingredient.optional === true,
        catalogVariantId: ingredient.catalogVariantId || null,
        catalogProductId: ingredient.catalogProductId || null,
        catalogSnapshot: ingredient.catalogSnapshot,
      })),
    },
    input.targetYieldQuantity,
    input.targetYieldUnit,
  );
}

async function loadCurrentRecipeScaleSource(db: Pool, recipeId: string): Promise<RecipeScaleSource> {
  const recipeResult = await db.query<{
    id: string;
    slug: string;
    title: string;
    versionId: string | null;
    versionNo: number | null;
    baseYieldQuantity: string | null;
    baseYieldUnit: string | null;
  }>(
    `SELECT
       recipe.id::text AS id,
       recipe.slug,
       recipe.title,
       version.id::text AS "versionId",
       version.version_no AS "versionNo",
       recipe.yield_quantity::text AS "baseYieldQuantity",
       recipe.yield_unit AS "baseYieldUnit"
     FROM recipes recipe
     LEFT JOIN recipe_versions version ON version.id = recipe.current_version_id
     WHERE recipe.id = $1`,
    [recipeId],
  );
  const recipe = recipeResult.rows[0];
  if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");

  const ingredientsResult = await db.query<StoredIngredient>(
    `SELECT
       ingredient.id::text AS id,
       ingredient.sort_order AS "sortOrder",
       ingredient.product_name AS "productName",
       ingredient.quantity::text AS quantity,
       ingredient.unit,
       ingredient.note,
       ingredient.optional,
       ingredient.catalog_variant_id::text AS "catalogVariantId",
       ingredient.catalog_product_id::text AS "catalogProductId",
       ingredient.catalog_snapshot AS "catalogSnapshot"
     FROM recipe_ingredients ingredient
     WHERE ingredient.recipe_id = $1
     ORDER BY ingredient.sort_order ASC, ingredient.id ASC`,
    [recipeId],
  );

  return { recipeId: recipe.id, ...recipe, ingredients: ingredientsResult.rows };
}

async function loadPublishedRecipeScaleSource(db: Pool, recipeId: string): Promise<RecipeScaleSource> {
  const result = await db.query<{
    id: string;
    slug: string;
    title: string;
    versionId: string;
    versionNo: number;
    snapshot: unknown;
  }>(
    `SELECT
       recipe.id::text AS id,
       recipe.slug,
       recipe.title,
       version.id::text AS "versionId",
       version.version_no AS "versionNo",
       version.snapshot
     FROM recipes recipe
     JOIN recipe_versions version ON version.id = recipe.published_version_id
     WHERE recipe.id = $1`,
    [recipeId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new OrderEngineError("RECIPE_PUBLISHED_VERSION_NOT_FOUND", 404, "Recipe does not have a published version to scale.");
  }
  if (!isRecord(row.snapshot) || !Array.isArray(row.snapshot.ingredients)) {
    throw new OrderEngineError("RECIPE_SCALE_SNAPSHOT_INVALID", 409, "Published recipe snapshot is invalid.");
  }

  const title = typeof row.snapshot.title === "string" && row.snapshot.title.trim() ? row.snapshot.title : row.title;
  const slug = typeof row.snapshot.slug === "string" && row.snapshot.slug.trim() ? row.snapshot.slug : row.slug;
  const baseYieldQuantity = typeof row.snapshot.yieldQuantity === "number" || typeof row.snapshot.yieldQuantity === "string"
    ? String(row.snapshot.yieldQuantity)
    : null;
  const baseYieldUnit = typeof row.snapshot.yieldUnit === "string" ? row.snapshot.yieldUnit : null;

  return {
    recipeId: row.id,
    slug,
    title,
    versionId: row.versionId,
    versionNo: row.versionNo,
    baseYieldQuantity,
    baseYieldUnit,
    ingredients: row.snapshot.ingredients.map(ingredientFromSnapshot),
  };
}

export async function scaleAdminRecipe(
  identity: StaffIdentity,
  recipeId: string,
  input: { targetYieldQuantity?: unknown; targetYieldUnit?: unknown; source?: unknown },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const id = normalizeUuid(recipeId);
  const source = normalizeSource(input.source);
  const recipe = source === "published"
    ? await loadPublishedRecipeScaleSource(db, id)
    : await loadCurrentRecipeScaleSource(db, id);

  return {
    source,
    ...calculateFromSource(recipe, input.targetYieldQuantity, input.targetYieldUnit),
  };
}

