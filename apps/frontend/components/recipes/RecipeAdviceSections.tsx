import type { PublicRecipeDetail } from "@/data/recipes/public-model";
import { RecipeBusinessTipCard, RecipeMistakeCard, RecipeSeasonalRuleCard } from "./RecipeAdviceCards";

export function RecipeAdviceSections({ recipe }: { recipe: PublicRecipeDetail }) {
  return (
    <>
      {recipe.mistakes.length ? (
        <section className="rounded-[30px] bg-[#fff9f5] p-5 ring-1 ring-[#ffd9c2] md:p-6">
          <h2 className="text-2xl font-black text-[#0b1220]">Lỗi thường gặp và cách cứu món</h2>
          <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-500">Mở từng mục để kiểm tra triệu chứng, nguyên nhân và cách xử lý.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{recipe.mistakes.map((mistake) => <RecipeMistakeCard key={mistake.id} mistake={mistake} />)}</div>
        </section>
      ) : null}

      {recipe.businessTips.length ? (
        <section className="rounded-[30px] bg-[#f5fbf8] p-5 ring-1 ring-[#cdeee0] md:p-6">
          <h2 className="text-2xl font-black text-[#0b1220]">Bí quyết bán món</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{recipe.businessTips.map((tip) => <RecipeBusinessTipCard key={tip.id} tip={tip} />)}</div>
        </section>
      ) : null}

      {recipe.seasonalRules.length ? (
        <section className="rounded-[30px] bg-[#f8f5ff] p-5 ring-1 ring-[#e2d8ff] md:p-6">
          <h2 className="text-2xl font-black text-[#0b1220]">Mùa vụ và thời điểm bán</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{recipe.seasonalRules.map((rule) => <RecipeSeasonalRuleCard key={rule.id} rule={rule} />)}</div>
        </section>
      ) : null}
    </>
  );
}
