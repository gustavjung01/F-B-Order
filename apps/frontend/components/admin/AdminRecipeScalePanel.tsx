"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { adminApiFetch } from "@/lib/admin-api";

type RecipeOption = {
  id: string;
  title: string;
  yieldQuantity: string | null;
  yieldUnit: string | null;
  currentVersionNo: number | null;
  publishedVersionId: string | null;
};

type ScaleIngredient = {
  id: string | null;
  sortOrder: number;
  productName: string;
  unit: string | null;
  note: string | null;
  optional: boolean;
  catalogVariantId: string | null;
  baseQuantity: string | null;
  scaledQuantity: string | null;
  scaleStatus: "scaled" | "manual_quantity_required";
};

type ScaleResult = {
  source: "current" | "published";
  recipe: { title: string; sourceVersionNo: number | null };
  baseYield: { quantity: string; unit: string };
  targetYield: { quantity: string; unit: string };
  scaleFactor: string;
  rounding: { mode: string; maximumFractionDigits: number };
  ingredients: ScaleIngredient[];
  summary: {
    ingredientCount: number;
    scaledIngredientCount: number;
    manualQuantityRequiredCount: number;
    catalogIngredientCount: number;
  };
};

function formatQuantity(value: string | null, unit: string | null): string {
  return value === null ? "Cần nhập tay" : `${value}${unit ? ` ${unit}` : ""}`;
}

export function AdminRecipeScalePanel() {
  const { getToken, isLoaded } = useAuth();
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [source, setSource] = useState<"current" | "published">("current");
  const [targetYieldQuantity, setTargetYieldQuantity] = useState("");
  const [result, setResult] = useState<ScaleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");

  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === recipeId) || null,
    [recipeId, recipes],
  );

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Bạn cần đăng nhập admin để scale công thức.");
    return value;
  }

  async function loadRecipes() {
    if (!isLoaded) return;
    setLoading(true);
    setError("");
    try {
      const response = await adminApiFetch<{ recipes: RecipeOption[] }>(
        "/api/admin/recipes?limit=100",
        await token(),
      );
      setRecipes(response.recipes || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được công thức.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRecipes(); }, [isLoaded]);

  function chooseRecipe(nextRecipeId: string) {
    setRecipeId(nextRecipeId);
    setResult(null);
    const nextRecipe = recipes.find((recipe) => recipe.id === nextRecipeId);
    if (nextRecipe?.yieldQuantity) setTargetYieldQuantity(nextRecipe.yieldQuantity);
  }

  async function scale() {
    if (!recipeId || !targetYieldQuantity.trim()) {
      setError("Chọn công thức và nhập yield mục tiêu trước khi tính.");
      return;
    }
    setCalculating(true);
    setError("");
    try {
      const response = await adminApiFetch<ScaleResult>(
        `/api/admin/recipes/${recipeId}/scale`,
        await token(),
        {
          method: "POST",
          body: JSON.stringify({ source, targetYieldQuantity }),
        },
      );
      setResult(response);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "Không tính được lượng nguyên liệu.");
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-200">{error}</p> : null}

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Scale engine</p>
        <h2 className="mt-2 text-3xl font-black">Quy đổi công thức theo yield</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Kết quả chỉ là bản tính. Không thay đổi công thức, version hoặc giỏ hàng.</p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <select value={recipeId} disabled={loading} onChange={(event) => chooseRecipe(event.target.value)} className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none disabled:opacity-60">
            <option value="">Chọn công thức</option>
            {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}{recipe.yieldQuantity ? ` · gốc ${recipe.yieldQuantity} ${recipe.yieldUnit || ""}` : " · thiếu yield gốc"}</option>)}
          </select>
          <select value={source} onChange={(event) => { setSource(event.target.value as "current" | "published"); setResult(null); }} className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none">
            <option value="current">Bản hiện tại (admin)</option>
            <option value="published" disabled={!selectedRecipe?.publishedVersionId}>Bản đã xuất bản</option>
          </select>
          <input value={targetYieldQuantity} onChange={(event) => { setTargetYieldQuantity(event.target.value); setResult(null); }} inputMode="decimal" placeholder="Yield mục tiêu, ví dụ 30" className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none" />
          <div className="flex h-12 items-center rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-600">Đơn vị yield sẽ theo bản {source === "published" ? "đã xuất bản" : "hiện tại"}</div>
        </div>

        <button disabled={calculating || loading || !recipeId || !targetYieldQuantity.trim()} onClick={() => void scale()} className="mt-4 w-full rounded-2xl bg-orange-500 px-5 py-4 text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{calculating ? "Đang tính..." : "Tính lượng nguyên liệu"}</button>
      </section>

      {result ? <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Kết quả</p><h3 className="mt-2 text-2xl font-black">{result.recipe.title}</h3></div>
          <span className="rounded-full bg-orange-100 px-3 py-2 text-xs font-black text-orange-800">Hệ số × {result.scaleFactor}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-100 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Yield gốc</p><p className="mt-1 text-lg font-black">{result.baseYield.quantity} {result.baseYield.unit}</p></div>
          <div className="rounded-2xl bg-slate-100 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Yield mục tiêu</p><p className="mt-1 text-lg font-black">{result.targetYield.quantity} {result.targetYield.unit}</p></div>
          <div className="rounded-2xl bg-slate-100 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Nguồn</p><p className="mt-1 text-lg font-black">{result.source === "published" ? "Bản đã xuất bản" : "Bản hiện tại"}{result.recipe.sourceVersionNo ? ` · v${result.recipe.sourceVersionNo}` : ""}</p></div>
        </div>
        {result.summary.manualQuantityRequiredCount ? <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Có {result.summary.manualQuantityRequiredCount} nguyên liệu không có lượng gốc, nên hệ thống không tự bịa lượng. Hãy xử lý thủ công phần đó.</p> : null}
        <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Nguyên liệu</th><th className="px-4 py-3">Gốc</th><th className="px-4 py-3">Đã scale</th><th className="px-4 py-3">Catalog</th></tr></thead><tbody>{result.ingredients.map((ingredient) => <tr key={`${ingredient.id || ingredient.sortOrder}-${ingredient.productName}`} className="border-t border-slate-100"><td className="px-4 py-3 font-black">{ingredient.productName}{ingredient.optional ? <span className="ml-2 text-xs text-slate-500">tùy chọn</span> : null}{ingredient.note ? <p className="mt-1 text-xs font-bold text-slate-500">{ingredient.note}</p> : null}</td><td className="px-4 py-3 font-bold text-slate-600">{formatQuantity(ingredient.baseQuantity, ingredient.unit)}</td><td className="px-4 py-3 font-black">{formatQuantity(ingredient.scaledQuantity, ingredient.unit)}</td><td className="px-4 py-3">{ingredient.catalogVariantId ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">Đã gắn</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">Nhập tay</span>}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-xs font-bold text-slate-500">Làm tròn: half-up, tối đa {result.rounding.maximumFractionDigits} số lẻ. Chưa có quy đổi đóng gói hoặc làm tròn theo MOQ; phần đó sẽ thuộc bước giỏ hàng/cost.</p>
      </section> : null}
    </div>
  );
}
