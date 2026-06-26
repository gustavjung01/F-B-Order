import type { Request, Response } from "express";
import { Router } from "express";
import {
  getPublicRecipeDetail,
  getPublicRecipeList,
  getRelatedPublicRecipes,
  RecipeNotFoundError,
} from "./recipe.service";
import {
  parseRecipeId,
  parseRecipeListFilters,
  parseRecipeSlug,
  parseRelatedLimit,
  RecipeValidationError,
} from "./recipe.validation";

function noStore(res: Response) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
}

function sendRecipeError(res: Response, error: unknown, fallbackCode: string, logMessage: string) {
  if (error instanceof RecipeValidationError) {
    res.status(400).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof RecipeNotFoundError) {
    res.status(404).json({ error: error.code, message: error.message });
    return;
  }
  console.error(logMessage, error);
  res.status(500).json({ error: fallbackCode });
}

export function createRecipeReadRouter() {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    noStore(res);
    try {
      const filters = parseRecipeListFilters(req.query as Record<string, unknown>);
      res.json(await getPublicRecipeList(filters));
    } catch (error) {
      sendRecipeError(res, error, "RECIPE_LIST_FAILED", "recipe list failed");
    }
  });

  router.get("/:id/related", async (req: Request, res: Response) => {
    noStore(res);
    try {
      const recipeId = parseRecipeId(req.params.id);
      const limit = parseRelatedLimit(req.query.limit);
      const recipes = await getRelatedPublicRecipes(recipeId, limit);
      res.json({ recipes, total: recipes.length });
    } catch (error) {
      sendRecipeError(res, error, "RECIPE_RELATED_FAILED", "related recipes failed");
    }
  });

  router.get("/:slug", async (req: Request, res: Response) => {
    noStore(res);
    try {
      const slug = parseRecipeSlug(req.params.slug);
      res.json({ recipe: await getPublicRecipeDetail(slug) });
    } catch (error) {
      sendRecipeError(res, error, "RECIPE_DETAIL_FAILED", "recipe detail failed");
    }
  });

  return router;
}
