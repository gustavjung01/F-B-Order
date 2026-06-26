import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { RequestIdentity } from "../auth/auth.identity";
import {
  addCatalogChoiceCartItems,
  type AddCatalogChoiceCartItemInput,
} from "../catalog-v2/catalog-v2-cart-domain.service";
import {
  scalePublishedRecipe,
  type RecipeScaleWarning,
  type ScalePublishedRecipeInput,
} from "./recipe-scale.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CART_QUANTITY = 1_000_000;

export type AddRecipeIngredientsToCartInput = ScalePublishedRecipeInput & {
  includeOptionalIngredientIds?: unknown;
};

export type RecipeCartIssue = {
  code:
    | "MISSING_CATALOG_LINK"
    | "INGREDIENT_NOT_CART_READY"
    | "PURCHASE_QUANTITY_UNAVAILABLE"
    | "PURCHASE_QUANTITY_INVALID";
  message: string;
  ingredientId: string;
  ingredientName: string;
  scaleWarningCodes: RecipeScaleWarning["code"][];
};

export class RecipeCartError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function fail(code: string, status: number, message: string, details?: unknown): never {
  throw new RecipeCartError(code, status, message, details);
}

function normalizeOptionalIngredientIds(value: unknown): Set<string> {
  if (value === undefined || value === null) return new Set();
  if (!Array.isArray(value)) {
    fail("INVALID_OPTIONAL_INGREDIENT_SELECTION", 400, "includeOptionalIngredientIds must be an array of UUIDs.");
  }

  const result = new Set<string>();
  for (const candidate of value) {
    const ingredientId = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
    if (!UUID.test(ingredientId)) {
      fail("INVALID_OPTIONAL_INGREDIENT_SELECTION", 400, "includeOptionalIngredientIds contains an invalid UUID.");
    }
    result.add(ingredientId);
  }
  return result;
}

function parsePackageCount(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= MAX_CART_QUANTITY
    ? quantity
    : null;
}

function issue(
  code: RecipeCartIssue["code"],
  message: string,
  ingredient: Awaited<ReturnType<typeof scalePublishedRecipe>>["scaledIngredients"][number],
): RecipeCartIssue {
  return {
    code,
    message,
    ingredientId: ingredient.ingredientId,
    ingredientName: ingredient.name,
    scaleWarningCodes: ingredient.warnings.map((warning) => warning.code),
  };
}

export async function addRecipeIngredientsToCart(
  identity: RequestIdentity,
  input: AddRecipeIngredientsToCartInput,
  db: Pool = getDb(),
) {
  const selectedOptionalIngredientIds = normalizeOptionalIngredientIds(input.includeOptionalIngredientIds);
  const scaled = await scalePublishedRecipe({
    recipeId: input.recipeId,
    targetYieldQuantity: input.targetYieldQuantity,
    targetYieldUnit: input.targetYieldUnit,
    roundingPolicy: input.roundingPolicy,
  });

  const optionalIds = new Set(
    scaled.scaledIngredients
      .filter((ingredient) => ingredient.isOptional)
      .map((ingredient) => ingredient.ingredientId),
  );
  const unknownOptionalIds = [...selectedOptionalIngredientIds].filter((ingredientId) => !optionalIds.has(ingredientId));
  if (unknownOptionalIds.length > 0) {
    fail(
      "OPTIONAL_INGREDIENT_NOT_FOUND",
      400,
      "Selected optional ingredient does not belong to this recipe or is not optional.",
      { ingredientIds: unknownOptionalIds },
    );
  }

  const includedIngredients = scaled.scaledIngredients.filter(
    (ingredient) => !ingredient.isOptional || selectedOptionalIngredientIds.has(ingredient.ingredientId),
  );
  const excludedOptionalIngredientIds = scaled.scaledIngredients
    .filter((ingredient) => ingredient.isOptional && !selectedOptionalIngredientIds.has(ingredient.ingredientId))
    .map((ingredient) => ingredient.ingredientId);

  const issues: RecipeCartIssue[] = [];
  const grouped = new Map<string, AddCatalogChoiceCartItemInput>();

  for (const ingredient of includedIngredients) {
    if (
      ingredient.sourceType !== "catalog"
      || !ingredient.catalogProductId
      || !ingredient.catalogVariantId
    ) {
      issues.push(issue(
        "MISSING_CATALOG_LINK",
        "Nguyên liệu chưa liên kết đầy đủ với sản phẩm và biến thể Catalog.",
        ingredient,
      ));
      continue;
    }

    if (!ingredient.isCartReady) {
      issues.push(issue(
        "INGREDIENT_NOT_CART_READY",
        "Nguyên liệu Catalog chưa được duyệt sẵn sàng để thêm vào giỏ.",
        ingredient,
      ));
      continue;
    }

    if (!ingredient.purchasePackageCount) {
      issues.push(issue(
        "PURCHASE_QUANTITY_UNAVAILABLE",
        "Không thể xác định số gói hoặc chai cần mua từ dữ liệu quy đổi bao bì.",
        ingredient,
      ));
      continue;
    }

    const quantity = parsePackageCount(ingredient.purchasePackageCount);
    if (quantity === null) {
      issues.push(issue(
        "PURCHASE_QUANTITY_INVALID",
        "Số gói hoặc chai cần mua không hợp lệ hoặc vượt giới hạn giỏ hàng.",
        ingredient,
      ));
      continue;
    }

    const groupKey = `${ingredient.catalogVariantId}\u0000${ingredient.selectionKey}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      const combinedQuantity = existing.quantity + quantity;
      if (combinedQuantity > MAX_CART_QUANTITY) {
        issues.push(issue(
          "PURCHASE_QUANTITY_INVALID",
          "Tổng số gói hoặc chai sau khi gộp vượt giới hạn giỏ hàng.",
          ingredient,
        ));
        continue;
      }
      existing.quantity = combinedQuantity;
    } else {
      grouped.set(groupKey, {
        variantId: ingredient.catalogVariantId,
        quantity,
        selections: ingredient.selections,
      });
    }
  }

  if (issues.length > 0) {
    fail(
      "RECIPE_CART_NOT_READY",
      422,
      "Không thể thêm nguyên liệu công thức vào giỏ vì còn nguyên liệu chưa sẵn sàng.",
      { issues },
    );
  }

  const cartItems = [...grouped.values()];
  if (cartItems.length === 0) {
    fail("RECIPE_CART_EMPTY", 422, "Công thức không có nguyên liệu nào đủ điều kiện để thêm vào giỏ.");
  }

  const cart = await addCatalogChoiceCartItems(identity, cartItems, db);
  const warnings = scaled.warnings.filter(
    (warning) => warning.code !== "OPTIONAL_INGREDIENT_REQUIRES_SELECTION"
      || !warning.ingredientId
      || !selectedOptionalIngredientIds.has(warning.ingredientId),
  );

  return {
    recipeId: scaled.recipeId,
    title: scaled.title,
    baseYield: scaled.baseYield,
    targetYield: scaled.targetYield,
    scaleFactor: scaled.scaleFactor,
    roundingPolicy: scaled.roundingPolicy,
    cartId: cart.cartId,
    currency: cart.currency,
    includedIngredientCount: includedIngredients.length,
    excludedOptionalIngredientIds,
    selectedOptionalIngredientIds: [...selectedOptionalIngredientIds].sort(),
    cartLineCount: cart.items.length,
    items: cart.items,
    warnings,
  };
}
