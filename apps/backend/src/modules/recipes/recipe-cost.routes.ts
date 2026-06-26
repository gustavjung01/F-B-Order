import { Router, type Response } from "express";
import {
  RecipeCostError,
  RecipeScaleError,
  costPublishedRecipe,
} from "./recipe-cost.service";
import type { RecipeRoundingPolicy, RecipeUnit } from "./recipe-units";

function sendError(res: Response, error: unknown) {
  if (error instanceof RecipeCostError || error instanceof RecipeScaleError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }
  console.error("recipe cost request failed", error);
  res.status(500).json({ error: "RECIPE_COST_FAILED" });
}

export function createRecipeCostRouter() {
  const router = Router();

  router.post("/:recipeId/cost", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const targetYieldQuantity = body.targetYieldQuantity ?? body.target_yield_quantity;
      const targetYieldUnit = body.targetYieldUnit ?? body.target_yield_unit;
      const roundingPolicy = body.roundingPolicy ?? body.rounding_policy;
      const includeOptionalIngredientIds = body.includeOptionalIngredientIds
        ?? body.include_optional_ingredient_ids;

      const result = await costPublishedRecipe({
        recipeId: req.params.recipeId,
        targetYieldQuantity: targetYieldQuantity as string | number,
        targetYieldUnit: targetYieldUnit as RecipeUnit,
        roundingPolicy: roundingPolicy as RecipeRoundingPolicy,
        includeOptionalIngredientIds,
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
