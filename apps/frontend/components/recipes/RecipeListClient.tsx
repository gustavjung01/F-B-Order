"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountAction } from "@/components/auth/AccountAction";

type ApiRecipe = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  relatedBrand: string;
  coverImageUrl: string;
  sourceConfidence: string;
  status: string;
  categoryName: string;
  categorySlug: string;
  ingredientCount: number;
  mappedProductCount: number;
  isLocked: boolean;
  lockReason: string | null;
};

type RecipesResponse = {
  approved: boolean;
  recipes: ApiRecipe[];
};

const recipeEmojiByCategory: Record<string, string> = {
  "combo-cong-thuc": "📦",
  "cong-thuc-tra-sua": "🧋",
  "cong-thuc-tra-trai-cay": "🍹",
  "cong-thuc-do-uong-nong": "☕",
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
};

function getRecipeEmoji(recipe: ApiRecipe) {
  return recipeEmojiByCategory[recipe.categorySlug] || "📋";
}

function RecipeListState({ children }: { children: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#e7dccd] bg-white/75 px-6 py-10 text-center text-[16px] font-black text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

function RecipeCard({ recipe, index, approved }: { recipe: ApiRecipe; index: number; approved: boolean }) {
  const href = `/recipes/${recipe.slug}`;

  return (
    <article className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-5">
      <div className="flex gap-3 md:block">
        <Link href={href} className="grid h-[92px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#fffaf3] to-[#f4efff] text-[52px] shadow-inner ring-1 ring-white/80 md:h-40 md:w-full md:text-7xl">
          {recipe.coverImageUrl ? <img src={recipe.coverImageUrl} alt={recipe.title} className="h-full w-full object-cover" /> : getRecipeEmoji(recipe)}
        </Link>
        <div className="min-w-0 flex-1 md:mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f4efff] px-3 py-1 text-[11px] font-black text-[#7c3aed] ring-1 ring-[#dccbff]">Ý tưởng #{index + 1}</span>
            {recipe.relatedBrand ? <span className="rounded-full bg-[#eefbf6] px-3 py-1 text-[11px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{recipe.relatedBrand}</span> : null}
          </div>
          <Link href={href} className="mt-3 block text-[19px] font-black leading-tight tracking-tight text-[#0b1220] hover:text-[#ff5a00] md:text-2xl">{recipe.title}</Link>
          {recipe.shortDescription ? <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-5 text-slate-500">{recipe.shortDescription}</p> : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className="rounded-[14px] bg-[#fbfaf7] px-3 py-2 text-[12px] font-bold text-slate-600 ring-1 ring-[#eee7dc]">{recipe.ingredientCount} nguyên liệu</span>
        <span className="rounded-[14px] bg-[#fbfaf7] px-3 py-2 text-[12px] font-bold text-slate-600 ring-1 ring-[#eee7dc]">{recipe.mappedProductCount} sản phẩm map</span>
      </div>

      {approved ? (
        <Link href={href} className="mt-4 flex h-11 items-center justify-center rounded-[16px] bg-[#ff5a00] px-5 text-[15px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)]">Xem công thức</Link>
      ) : (
        <>
          <div className="mt-4 rounded-[18px] bg-[#fbfaf7] p-4 ring-1 ring-[#eee7dc]">
            <p className="text-[13px] font-bold leading-6 text-slate-600">{recipe.lockReason || "Công thức chi tiết, định lượng và danh sách nguyên liệu sẽ mở sau khi hồ sơ quán được duyệt."}</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href={href} className="flex h-11 items-center justify-center rounded-[16px] bg-[#fbfaf7] px-5 text-[15px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">Xem ý tưởng</Link>
            <AccountAction href="/register" signedOutLabel="Mở công thức" className="flex h-11 items-center justify-center rounded-[16px] bg-[#0b1220] px-5 text-[15px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]">Mở công thức</AccountAction>
          </div>
        </>
      )}
    </article>
  );
}

export function RecipeListClient() {
  const [approved, setApproved] = useState(false);
  const [recipes, setRecipes] = useState<ApiRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    var activeRequest = true;

    async function loadRecipes() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/recipes?limit=80", { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được công thức");
        const data = (await response.json()) as RecipesResponse;
        if (!activeRequest) return;
        setApproved(Boolean(data.approved));
        setRecipes(Array.isArray(data.recipes) ? data.recipes : []);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được công thức");
        setRecipes([]);
      } finally {
        if (activeRequest) setLoading(false);
      }
    }

    loadRecipes();

    return () => {
      activeRequest = false;
    };
  }, []);

  const subtitle = useMemo(() => {
    if (loading) return "Đang tải công thức";
    if (approved) return "Công thức chi tiết đã mở";
    return "Xem ý tưởng trước, duyệt hồ sơ để mở định lượng";
  }, [approved, loading]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[26px] bg-white shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <img src="/home/home-cong-thuc.png" alt="Công thức" className="block h-auto w-full object-contain" draggable={false} />
      </section>

      <div className="rounded-[24px] bg-white/80 p-4 text-[14px] font-bold leading-6 text-slate-600 ring-1 ring-white/80">
        {subtitle}
      </div>

      {loading ? <RecipeListState>Đang tải công thức...</RecipeListState> : null}
      {!loading && error ? <RecipeListState>{error}</RecipeListState> : null}
      {!loading && !error && recipes.length === 0 ? <RecipeListState>Chưa có công thức active</RecipeListState> : null}
      {!loading && !error && recipes.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {recipes.map((recipe, index) => <RecipeCard key={recipe.id || recipe.slug} recipe={recipe} index={index} approved={approved} />)}
        </div>
      ) : null}
    </div>
  );
}
