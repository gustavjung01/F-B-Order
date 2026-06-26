import Link from "next/link";
import type { PublicRecipeCard, PublicRecipeDetail } from "@/data/recipes/public-model";
import { RecipeAdviceSections } from "./RecipeAdviceSections";
import { RecipeCatalogSection } from "./RecipeCatalogSection";
import { RecipeCoreSections } from "./RecipeCoreSections";
import { RecipeDetailHero } from "./RecipeDetailHero";
import { RecipeRelatedSection } from "./RecipeRelatedSection";

type RecipeDetailClientProps = {
  recipe: PublicRecipeDetail;
  relatedRecipes: PublicRecipeCard[];
};

export function RecipeDetailClient({ recipe, relatedRecipes }: RecipeDetailClientProps) {
  return (
    <div className="space-y-6">
      <Link href="/recipes" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] font-black text-slate-600 ring-1 ring-[#efe7dc]">← Quay lại danh sách</Link>
      <RecipeDetailHero recipe={recipe} />
      <RecipeCoreSections recipe={recipe} />
      <RecipeAdviceSections recipe={recipe} />
      <RecipeCatalogSection recipe={recipe} />
      <RecipeRelatedSection recipes={relatedRecipes} />
    </div>
  );
}
