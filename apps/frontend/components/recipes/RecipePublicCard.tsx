import Link from "next/link";
import type { PublicRecipeCard } from "@/data/recipes/public-model";
import { formatRecipeQuantity, RECIPE_DIFFICULTY_LABELS } from "@/data/recipes/public-model";
import { getRecipeEmoji } from "./recipe-list-utils";

export function RecipePublicCard({ recipe }: { recipe: PublicRecipeCard }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.13)] md:p-5">
      <Link href={`/recipes/${recipe.slug}`} className="grid min-h-[190px] place-items-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#fffaf3] to-[#f4efff] text-[82px] shadow-inner ring-1 ring-white/80">
        {recipe.coverImageUrl ? (
          <img src={recipe.coverImageUrl} alt={recipe.title} className="h-full max-h-[260px] w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : getRecipeEmoji(recipe)}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {recipe.category ? (
          <span className="rounded-full bg-[#f4efff] px-3 py-1 text-[11px] font-black text-[#7c3aed] ring-1 ring-[#dccbff]">{recipe.category.name}</span>
        ) : null}
        <span className="rounded-full bg-[#eefbf6] px-3 py-1 text-[11px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{RECIPE_DIFFICULTY_LABELS[recipe.difficulty]}</span>
      </div>

      <Link href={`/recipes/${recipe.slug}`} className="mt-3 block text-[21px] font-black leading-tight tracking-tight text-[#0b1220] transition hover:text-[#ff5a00]">
        {recipe.title}
      </Link>
      <p className="mt-2 line-clamp-3 text-[13px] font-semibold leading-6 text-slate-500">{recipe.shortDescription}</p>

      {recipe.tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span key={tag.id} className="rounded-full bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-[#eee7dc]">#{tag.name}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] font-bold text-slate-600">
        <div className="rounded-[15px] bg-[#fbfaf7] px-3 py-2.5 ring-1 ring-[#eee7dc]">⏱ {recipe.totalMinutes} phút</div>
        <div className="rounded-[15px] bg-[#fbfaf7] px-3 py-2.5 ring-1 ring-[#eee7dc]">🍽 {formatRecipeQuantity(recipe.yieldQuantity, recipe.yieldUnit)}</div>
        <div className="rounded-[15px] bg-[#fbfaf7] px-3 py-2.5 ring-1 ring-[#eee7dc]">🧾 {recipe.ingredientCount} nguyên liệu</div>
        <div className="rounded-[15px] bg-[#fbfaf7] px-3 py-2.5 ring-1 ring-[#eee7dc]">👨‍🍳 {recipe.stepCount} bước</div>
      </div>

      <Link href={`/recipes/${recipe.slug}`} className="mt-auto flex h-12 items-center justify-center rounded-[17px] bg-[#ff5a00] px-5 text-[15px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)] transition hover:bg-[#e95000]">
        Xem công thức
      </Link>
    </article>
  );
}
