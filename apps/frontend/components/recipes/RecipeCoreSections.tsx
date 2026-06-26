import type { PublicRecipeDetail } from "@/data/recipes/public-model";
import { RecipeIngredientCard } from "./RecipeIngredientCard";
import { RecipeStepCard } from "./RecipeStepCard";

export function RecipeCoreSections({ recipe }: { recipe: PublicRecipeDetail }) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
      <div className="rounded-[30px] bg-[#fbfaf7] p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] ring-1 ring-[#efe7dc] md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black text-[#0b1220]">Nguyên liệu</h2>
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500 ring-1 ring-[#eee7dc]">{recipe.ingredients.length} mục</span>
        </div>
        <div className="mt-4 space-y-3">
          {recipe.ingredients.map((ingredient) => <RecipeIngredientCard key={ingredient.id} ingredient={ingredient} />)}
        </div>
      </div>

      <div className="rounded-[30px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black text-[#0b1220]">Cách làm</h2>
          <span className="rounded-full bg-[#fbfaf7] px-3 py-1 text-[11px] font-black text-slate-500 ring-1 ring-[#eee7dc]">{recipe.steps.length} bước</span>
        </div>
        <div className="mt-4 space-y-4">
          {recipe.steps.map((step, index) => <RecipeStepCard key={step.id} step={step} index={index} />)}
        </div>
      </div>
    </section>
  );
}
