import type { PublicRecipeDetail } from "@/data/recipes/public-model";
import { formatRecipeQuantity, RECIPE_DIFFICULTY_LABELS } from "@/data/recipes/public-model";
import { recipeEmoji } from "./recipe-detail-utils";

export function RecipeDetailHero({ recipe }: { recipe: PublicRecipeDetail }) {
  return (
    <section className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-start">
      <div className="overflow-hidden rounded-[32px] bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc]">
        <div className="grid min-h-[280px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] to-[#f4efff] text-[112px] md:min-h-[430px]">
          {recipe.coverImageUrl ? <img src={recipe.coverImageUrl} alt={recipe.title} className="h-full w-full object-cover" /> : recipeEmoji(recipe)}
        </div>
      </div>

      <div className="rounded-[32px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc] md:p-7">
        <div className="flex flex-wrap gap-2">
          {recipe.category ? <span className="rounded-full bg-[#f4efff] px-3 py-1.5 text-[12px] font-black text-[#7c3aed] ring-1 ring-[#dccbff]">{recipe.category.name}</span> : null}
          <span className="rounded-full bg-[#eefbf6] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{RECIPE_DIFFICULTY_LABELS[recipe.difficulty]}</span>
          <span className="rounded-full bg-[#e9fbf2] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">Đã xuất bản</span>
        </div>
        <h1 className="mt-4 text-[31px] font-black leading-tight tracking-tight text-[#0b1220] md:text-5xl">{recipe.title}</h1>
        <p className="mt-4 text-[15px] font-semibold leading-7 text-slate-600 md:text-base md:leading-8">{recipe.shortDescription}</p>
        {recipe.aliases.length ? <p className="mt-3 text-[12px] font-bold text-slate-400">Tên gọi khác: {recipe.aliases.join(", ")}</p> : null}
        {recipe.tags.length ? <div className="mt-4 flex flex-wrap gap-2">{recipe.tags.map((tag) => <span key={tag.id} className="rounded-full bg-[#fbfaf7] px-3 py-1 text-[11px] font-black text-slate-500 ring-1 ring-[#eee7dc]">#{tag.name}</span>)}</div> : null}
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="Chuẩn bị" value={`${recipe.prepMinutes} phút`} />
          <Metric label="Chế biến" value={`${recipe.cookMinutes} phút`} />
          <Metric label="Tổng thời gian" value={`${recipe.totalMinutes} phút`} />
          <Metric label="Sản lượng" value={formatRecipeQuantity(recipe.yieldQuantity, recipe.yieldUnit)} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[17px] bg-[#fbfaf7] p-3 ring-1 ring-[#eee7dc]"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-[14px] font-black text-[#0b1220]">{value}</p></div>;
}
