"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSelect,
  AdminStatCard,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
} from "@/components/admin/ui/AdminUI";
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

  const selectedRecipe = useMemo(() => recipes.find((recipe) => recipe.id === recipeId) || null, [recipeId, recipes]);

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
      const response = await adminApiFetch<{ recipes: RecipeOption[] }>("/api/admin/recipes?limit=100", await token());
      setRecipes(response.recipes || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được công thức.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRecipes(); }, [isLoaded]);

  function chooseRecipe(nextRecipeId: string) {
    const nextRecipe = recipes.find((recipe) => recipe.id === nextRecipeId) || null;
    setRecipeId(nextRecipeId);
    setResult(null);
    setError("");
    setTargetYieldQuantity(nextRecipe?.yieldQuantity || "");
    if (!nextRecipe?.publishedVersionId) setSource("current");
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
        { method: "POST", body: JSON.stringify({ source, targetYieldQuantity }) },
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
    <div className="space-y-4">
      {error ? <AdminAlert tone="danger">{error}</AdminAlert> : null}

      <AdminSurface>
        <AdminSurfaceHeader
          eyebrow="Scale engine"
          title="Quy đổi công thức theo yield"
          description="Kết quả chỉ là bản tính. Không thay đổi công thức, version, media hoặc giỏ hàng."
        />
        <AdminSurfaceBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <AdminField label="Công thức">
              <AdminSelect value={recipeId} disabled={loading} onChange={(event) => chooseRecipe(event.target.value)}>
                <option value="">Chọn công thức</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}{recipe.yieldQuantity ? ` · gốc ${recipe.yieldQuantity} ${recipe.yieldUnit || ""}` : " · thiếu yield gốc"}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Nguồn version">
              <AdminSelect value={source} onChange={(event) => { setSource(event.target.value as "current" | "published"); setResult(null); }}>
                <option value="current">Bản hiện tại (admin)</option>
                <option value="published" disabled={!selectedRecipe?.publishedVersionId}>Bản đã xuất bản</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="Yield mục tiêu">
              <AdminInput value={targetYieldQuantity} onChange={(event) => { setTargetYieldQuantity(event.target.value); setResult(null); }} inputMode="decimal" placeholder="Ví dụ: 30" />
            </AdminField>
            <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-600">
              Đơn vị yield theo bản {source === "published" ? "đã xuất bản" : "hiện tại"}.
            </div>
          </div>
          <AdminButton tone="primary" size="lg" className="w-full" disabled={calculating || loading || !recipeId || !targetYieldQuantity.trim()} onClick={() => void scale()}>
            {calculating ? "Đang tính…" : "Tính lượng nguyên liệu"}
          </AdminButton>
        </AdminSurfaceBody>
      </AdminSurface>

      {result ? (
        <AdminSurface>
          <AdminSurfaceHeader
            eyebrow="Kết quả"
            title={result.recipe.title}
            actions={<AdminBadge tone="orange">Hệ số × {result.scaleFactor}</AdminBadge>}
          />
          <AdminSurfaceBody className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <AdminStatCard label="Yield gốc" value={`${result.baseYield.quantity} ${result.baseYield.unit}`} />
              <AdminStatCard label="Yield mục tiêu" value={`${result.targetYield.quantity} ${result.targetYield.unit}`} />
              <AdminStatCard label="Nguồn" value={`${result.source === "published" ? "Đã xuất bản" : "Hiện tại"}${result.recipe.sourceVersionNo ? ` · v${result.recipe.sourceVersionNo}` : ""}`} />
            </div>

            {result.summary.manualQuantityRequiredCount ? (
              <AdminAlert tone="warning">Có {result.summary.manualQuantityRequiredCount} nguyên liệu thiếu lượng gốc. Hệ thống giữ trạng thái nhập tay, không tự bịa định lượng.</AdminAlert>
            ) : null}

            {result.ingredients.length === 0 ? (
              <AdminEmptyState title="Không có nguyên liệu để scale" />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-600">
                    <tr><th className="px-4 py-3">Nguyên liệu</th><th className="px-4 py-3">Gốc</th><th className="px-4 py-3">Đã scale</th><th className="px-4 py-3">Catalog</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.ingredients.map((ingredient) => (
                      <tr key={`${ingredient.id || ingredient.sortOrder}-${ingredient.productName}`}>
                        <td className="px-4 py-3 font-black text-slate-900">
                          {ingredient.productName}{ingredient.optional ? <span className="ml-2 text-xs font-medium text-slate-500">tùy chọn</span> : null}
                          {ingredient.note ? <p className="mt-1 text-xs font-medium text-slate-500">{ingredient.note}</p> : null}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-600">{formatQuantity(ingredient.baseQuantity, ingredient.unit)}</td>
                        <td className="px-4 py-3 font-black text-slate-900">{formatQuantity(ingredient.scaledQuantity, ingredient.unit)}</td>
                        <td className="px-4 py-3"><AdminBadge tone={ingredient.catalogVariantId ? "success" : "neutral"}>{ingredient.catalogVariantId ? "Đã gắn" : "Nhập tay"}</AdminBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs font-medium leading-5 text-slate-500">Làm tròn half-up, tối đa {result.rounding.maximumFractionDigits} số lẻ. Quy đổi đóng gói và MOQ vẫn thuộc luồng giỏ hàng/cost.</p>
          </AdminSurfaceBody>
        </AdminSurface>
      ) : null}
    </div>
  );
}
