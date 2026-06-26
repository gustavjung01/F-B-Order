"use client";

import type { PublicRecipeListResponse } from "@/data/recipes/public-model";
import { RecipeListToolbar } from "./RecipeListToolbar";
import { RecipePublicCard } from "./RecipePublicCard";
import { usePublicRecipeList } from "./usePublicRecipeList";

type RecipeListClientProps = { initialResult: PublicRecipeListResponse | null };

function RecipeListState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[28px] border border-dashed border-[#e7dccd] bg-white/75 px-6 py-12 text-center text-[15px] font-black leading-7 text-slate-500 shadow-sm">{children}</div>;
}

export function RecipeListClient({ initialResult }: RecipeListClientProps) {
  const state = usePublicRecipeList(initialResult);
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)] ring-1 ring-white/80">
        <img src="/home/home-cong-thuc.png" alt="Công thức pha chế Bếp Sỉ" className="block h-auto w-full object-contain" draggable={false} />
      </section>

      <RecipeListToolbar
        searchDraft={state.searchDraft}
        category={state.category}
        tag={state.tag}
        categories={state.categories}
        tags={state.tags}
        total={state.total}
        loading={state.loading}
        hasFilters={state.hasFilters}
        onSearchChange={state.setSearchDraft}
        onCategoryChange={state.setCategory}
        onTagChange={state.setTag}
        onClear={state.clearFilters}
      />

      {state.loading ? <RecipeListState>Đang tải công thức...</RecipeListState> : null}
      {!state.loading && state.error ? <RecipeListState>{state.error}</RecipeListState> : null}
      {!state.loading && !state.error && state.recipes.length === 0 ? <RecipeListState>Không có công thức phù hợp với bộ lọc hiện tại.</RecipeListState> : null}
      {!state.loading && state.recipes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.recipes.map((recipe) => <RecipePublicCard key={recipe.id} recipe={recipe} />)}</div>
      ) : null}
      {!state.loading && state.recipes.length > 0 && state.hasMore ? (
        <div className="flex justify-center pt-2">
          <button type="button" onClick={() => void state.loadMore()} disabled={state.loadingMore} className="flex h-12 min-w-[190px] items-center justify-center rounded-[17px] bg-[#0b1220] px-6 text-[14px] font-black text-white shadow-[0_14px_26px_rgba(15,23,42,0.18)] disabled:cursor-wait disabled:opacity-60">
            {state.loadingMore ? "Đang tải thêm..." : "Xem thêm công thức"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
