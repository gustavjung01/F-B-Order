import Link from "next/link";
import type { PublicRecipeCard } from "@/data/recipes/public-model";
import { RecipeRelatedCard } from "./RecipeRelatedCard";

export function RecipeRelatedSection({ recipes }: { recipes: PublicRecipeCard[] }) {
  if (!recipes.length) return null;
  return (
    <section className="rounded-[30px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)] ring-1 ring-[#efe7dc] md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-[#0b1220]">Công thức liên quan</h2>
        <Link href="/recipes" className="text-[12px] font-black text-[#ff5a00]">Xem tất cả →</Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{recipes.map((recipe) => <RecipeRelatedCard key={recipe.id} recipe={recipe} />)}</div>
    </section>
  );
}
