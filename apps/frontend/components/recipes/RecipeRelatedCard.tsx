import Link from "next/link";
import type { PublicRecipeCard } from "@/data/recipes/public-model";
import { recipeEmoji } from "./recipe-detail-utils";

export function RecipeRelatedCard({ recipe }: { recipe: PublicRecipeCard }) {
  return (
    <Link href={`/recipes/${recipe.slug}`} className="rounded-[22px] bg-white p-3 ring-1 ring-[#efe7dc] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
      <div className="grid h-32 place-items-center overflow-hidden rounded-[18px] bg-gradient-to-br from-[#fffaf3] to-[#f4efff] text-5xl">
        {recipe.coverImageUrl ? <img src={recipe.coverImageUrl} alt={recipe.title} className="h-full w-full object-cover" /> : recipeEmoji(recipe)}
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] font-black leading-5 text-[#0b1220]">{recipe.title}</h3>
      <p className="mt-1 text-[11px] font-bold text-slate-500">{recipe.totalMinutes} phút · {recipe.ingredientCount} nguyên liệu</p>
    </Link>
  );
}
