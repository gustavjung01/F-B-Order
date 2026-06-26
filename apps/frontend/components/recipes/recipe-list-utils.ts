import type { PublicRecipeCard, PublicRecipeTag } from "@/data/recipes/public-model";

export type RecipeFilterOption = { slug: string; name: string };
export const RECIPE_PAGE_SIZE = 24;

const recipeEmojiByCategory: Record<string, string> = {
  "combo-cong-thuc": "📦",
  "cong-thuc-tra-sua": "🧋",
  "cong-thuc-tra-trai-cay": "🍹",
  "cong-thuc-do-uong-nong": "☕",
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
};

export function getRecipeEmoji(recipe: PublicRecipeCard) {
  return recipe.category ? recipeEmojiByCategory[recipe.category.slug] || "📋" : "📋";
}

export function uniqueRecipeCategories(recipes: PublicRecipeCard[]): RecipeFilterOption[] {
  const map = new Map<string, RecipeFilterOption>();
  for (const recipe of recipes) {
    if (recipe.category) map.set(recipe.category.slug, { slug: recipe.category.slug, name: recipe.category.name });
  }
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name, "vi"));
}

export function uniqueRecipeTags(recipes: PublicRecipeCard[]): RecipeFilterOption[] {
  const map = new Map<string, PublicRecipeTag>();
  for (const recipe of recipes) for (const tag of recipe.tags) map.set(tag.slug, tag);
  return [...map.values()]
    .map((tag) => ({ slug: tag.slug, name: tag.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));
}
