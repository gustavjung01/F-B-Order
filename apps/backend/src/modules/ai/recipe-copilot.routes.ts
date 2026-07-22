import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { getDb } from "../../db/pool.js";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission } from "../auth/auth.permissions.js";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors.js";
import { buildRecipeCostPreview, type RecipeCostIngredientInput } from "./recipe-cost.js";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function requireActiveStaff(identity: RequestIdentity): StaffIdentity {
  if (identity.kind !== "staff" || !identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required");
  }
  return identity;
}

function sendError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "INVALID_REQUEST", details: error.flatten() });
    return;
  }
  console.error("Recipe Copilot request failed", error);
  res.status(500).json({ error: "RECIPE_COPILOT_FAILED" });
}

export function createRecipeCopilotRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/:recipeId/cost-preview", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      await requirePermission(identity, "recipes.view");
      await requirePermission(identity, "catalog.view");
      const recipeId = z.string().uuid().parse(req.params.recipeId);

      const [recipeResult, ingredientResult] = await Promise.all([
        getDb().query<{
          id: string;
          title: string;
          yieldQuantity: string | null;
          yieldUnit: string | null;
        }>(
          `SELECT
             id::text,
             title,
             yield_quantity::text AS "yieldQuantity",
             yield_unit AS "yieldUnit"
           FROM recipes
           WHERE id = $1`,
          [recipeId],
        ),
        getDb().query<{
          productName: string;
          quantity: string | null;
          unit: string | null;
          optional: boolean;
          catalogVariantId: string | null;
          sourceType: string | null;
          sourceRecipeSlug: string | null;
          sku: string | null;
          shopPrice: string | null;
          retailPrice: string | null;
          variantData: unknown;
          productData: unknown;
        }>(
          `SELECT
             ingredient.product_name AS "productName",
             ingredient.quantity::text AS quantity,
             ingredient.unit,
             ingredient.optional,
             ingredient.catalog_variant_id::text AS "catalogVariantId",
             ingredient.source_type AS "sourceType",
             ingredient.source_recipe_slug AS "sourceRecipeSlug",
             variant.sku,
             variant.shop_price::text AS "shopPrice",
             variant.retail_price::text AS "retailPrice",
             to_jsonb(variant) AS "variantData",
             to_jsonb(product) AS "productData"
           FROM recipe_ingredients ingredient
           LEFT JOIN catalog_variants variant ON variant.id = ingredient.catalog_variant_id
           LEFT JOIN catalog_products product ON product.id = variant.product_id
           WHERE ingredient.recipe_id = $1
           ORDER BY ingredient.sort_order, ingredient.created_at`,
          [recipeId],
        ),
      ]);

      const recipe = recipeResult.rows[0];
      if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found");

      res.json({
        cost: buildRecipeCostPreview(recipe, ingredientResult.rows as RecipeCostIngredientInput[]),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
