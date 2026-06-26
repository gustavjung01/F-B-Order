import type { PublicRecipeIngredient } from "@/data/recipes/public-model";
import { formatRecipeQuantity } from "@/data/recipes/public-model";
import { RecipeCatalogReference } from "./RecipeCatalogReference";
import { RecipePackageConversion } from "./RecipePackageConversion";

export function RecipeIngredientCard({ ingredient }: { ingredient: PublicRecipeIngredient }) {
  const sourceLabel = ingredient.sourceType === "catalog" ? "Nguyên liệu Catalog" : "Nguyên liệu bên ngoài";
  return (
    <article className="rounded-[22px] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.055)] ring-1 ring-[#efe7dc]">
      <div className="flex items-start gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[17px] bg-[#fff3ea] text-2xl">{ingredient.sourceType === "catalog" ? "🧃" : "🥣"}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            {ingredient.isOptional ? <span className="rounded-full bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-[#eee7dc]">Tùy chọn</span> : null}
            <span className="rounded-full bg-[#eefbf6] px-2.5 py-1 text-[10px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{sourceLabel}</span>
          </div>
          <h3 className="mt-2 text-[17px] font-black leading-tight text-[#0b1220]">{ingredient.name}</h3>
          <p className="mt-1 text-[14px] font-black text-[#ff5a00]">{formatRecipeQuantity(ingredient.usageQuantity, ingredient.usageUnit)}</p>
          {ingredient.note ? <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-500">{ingredient.note}</p> : null}
        </div>
      </div>
      {ingredient.packageConversion ? <RecipePackageConversion value={ingredient.packageConversion} /> : null}
      {ingredient.catalog ? <RecipeCatalogReference reference={ingredient.catalog} /> : null}
    </article>
  );
}
