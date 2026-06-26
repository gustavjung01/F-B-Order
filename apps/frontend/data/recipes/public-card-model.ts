export type RecipeUnit = "g" | "kg" | "ml" | "l" | "piece" | "portion" | "pack";
export type RecipeDifficulty = "easy" | "medium" | "hard";

export type PublicRecipeCategory = {
  id: string;
  slug: string;
  name: string;
} | null;

export type PublicRecipeTag = {
  id: string;
  slug: string;
  name: string;
};

export type PublicRecipeCard = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  coverImageUrl: string | null;
  difficulty: RecipeDifficulty;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  yieldQuantity: number;
  yieldUnit: RecipeUnit;
  category: PublicRecipeCategory;
  tags: PublicRecipeTag[];
  ingredientCount: number;
  stepCount: number;
  publishedAt: string;
};

export const RECIPE_DIFFICULTY_LABELS: Record<RecipeDifficulty, string> = {
  easy: "Dễ làm",
  medium: "Vừa sức",
  hard: "Nâng cao",
};

export const RECIPE_UNIT_LABELS: Record<RecipeUnit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  piece: "cái",
  portion: "phần",
  pack: "gói",
};

export function formatRecipeQuantity(quantity: number | null, unit: RecipeUnit | null): string {
  if (quantity === null || unit === null) return "Chưa có định lượng";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(quantity)} ${RECIPE_UNIT_LABELS[unit]}`;
}
