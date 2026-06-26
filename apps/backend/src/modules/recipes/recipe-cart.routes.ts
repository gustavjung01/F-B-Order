import { Router, type Request, type Response } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { CatalogV2CartError } from "../catalog-v2/catalog-v2-cart-domain.service";
import {
  RecipeCartError,
  addRecipeIngredientsToCart,
} from "./recipe-cart.service";
import { RecipeScaleError } from "./recipe-scale.service";
import type { RecipeRoundingPolicy, RecipeUnit } from "./recipe-units";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendError(res: Response, error: unknown) {
  if (
    error instanceof RecipeCartError
    || error instanceof RecipeScaleError
    || error instanceof CatalogV2CartError
  ) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }
  console.error("recipe add ingredients to cart failed", error);
  res.status(500).json({ error: "RECIPE_CART_FAILED" });
}

export function createRecipeCartRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/:recipeId/cart", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const targetYieldQuantity = body.targetYieldQuantity ?? body.target_yield_quantity;
      const targetYieldUnit = body.targetYieldUnit ?? body.target_yield_unit;
      const roundingPolicy = body.roundingPolicy ?? body.rounding_policy;
      const includeOptionalIngredientIds = body.includeOptionalIngredientIds
        ?? body.include_optional_ingredient_ids;

      const result = await addRecipeIngredientsToCart(await identityResolver(req), {
        recipeId: req.params.recipeId,
        targetYieldQuantity: targetYieldQuantity as string | number,
        targetYieldUnit: targetYieldUnit as RecipeUnit,
        roundingPolicy: roundingPolicy as RecipeRoundingPolicy,
        includeOptionalIngredientIds,
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
