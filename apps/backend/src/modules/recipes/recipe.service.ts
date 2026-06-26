import {
  findPublicRecipeCardById,
  findPublicRecipeDetailRow,
  listPublicRecipes,
  listRelatedPublicRecipes,
  loadPublicRecipeSections,
} from "./recipe.repository";
import { presentRecipeCard, presentRecipeDetail } from "./recipe.presenter";
import type { RecipeApiCard, RecipeApiDetail, RecipeListFilters, RecipeListResult } from "./recipe.types";

export class RecipeNotFoundError extends Error {
  readonly code = "RECIPE_NOT_FOUND";

  constructor() {
    super("Recipe was not found.");
    this.name = "RecipeNotFoundError";
  }
}

export async function getPublicRecipeList(filters: RecipeListFilters): Promise<RecipeListResult> {
  const result = await listPublicRecipes(filters);
  const recipes = result.rows.map(presentRecipeCard);
  return {
    recipes,
    total: result.total,
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      hasMore: filters.offset + recipes.length < result.total,
    },
  };
}

export async function getPublicRecipeDetail(slug: string): Promise<RecipeApiDetail> {
  const recipe = await findPublicRecipeDetailRow(slug);
  if (!recipe) throw new RecipeNotFoundError();
  const sections = await loadPublicRecipeSections(recipe.id);
  return presentRecipeDetail({ recipe, ...sections });
}

export async function getRelatedPublicRecipes(recipeId: string, limit: number): Promise<RecipeApiCard[]> {
  const source = await findPublicRecipeCardById(recipeId);
  if (!source) throw new RecipeNotFoundError();
  const related = await listRelatedPublicRecipes(source, limit);
  return related.map(presentRecipeCard);
}
