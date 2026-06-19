"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountAction } from "@/components/auth/AccountAction";
import { addCartItem } from "@/lib/cartStorage";

type IngredientProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  imageUrl: string;
  minOrderQty: number;
  categoryName: string;
  categorySlug: string;
  price: number | null;
  publicPriceHint?: string | null;
};

type RecipeIngredient = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number | null;
  unit: string;
  note: string;
  optional: boolean;
  sortOrder: number;
  product: IngredientProduct | null;
};

type RecipeStep = {
  id: string;
  stepNo: number;
  title: string;
  content: string;
  imageUrl: string;
};

type RecipeDetail = {
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
  isLocked: boolean;
  lockReason: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

type RecipeDetailResponse = {
  approved: boolean;
  recipe: RecipeDetail;
};

type RecipeDetailClientProps = {
  slug: string;
};

const recipeEmojiByCategory: Record<string, string> = {
  "combo-cong-thuc": "📦",
  "cong-thuc-tra-sua": "🧋",
  "cong-thuc-tra-trai-cay": "🍹",
  "cong-thuc-do-uong-nong": "☕",
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
};

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function getRecipeEmoji(recipe: RecipeDetail) {
  return recipeEmojiByCategory[recipe.categorySlug] || "📋";
}

function RecipeState({ children }: { children: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#e7dccd] bg-white/75 px-6 py-10 text-center text-[16px] font-black text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

function ingredientQuantityLabel(ingredient: RecipeIngredient) {
  if (ingredient.quantity === null) return "Định lượng khóa";
  return `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ""}`;
}

function IngredientRow({ ingredient, approved }: { ingredient: RecipeIngredient; approved: boolean }) {
  const product = ingredient.product;

  return (
    <div className="rounded-[22px] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)] ring-1 ring-[#efe7dc]">
      <div className="flex gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-[#fff3ea] text-3xl">
          {product?.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : "🧾"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {product?.brand ? <span className="rounded-full bg-[#eefbf6] px-2.5 py-1 text-[11px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{product.brand}</span> : null}
            {ingredient.optional ? <span className="rounded-full bg-[#fbfaf7] px-2.5 py-1 text-[11px] font-black text-slate-500 ring-1 ring-[#eee7dc]">Tùy chọn</span> : null}
          </div>
          <h3 className="mt-2 text-[16px] font-black leading-tight text-[#0b1220]">{product?.name || ingredient.productName}</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">{ingredientQuantityLabel(ingredient)}</p>
          {ingredient.note ? <p className="mt-1 text-[13px] font-semibold leading-5 text-slate-500">{ingredient.note}</p> : null}
        </div>
      </div>

      {product ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0e7dc] pt-3">
          {approved && typeof product.price === "number" ? <p className="text-[16px] font-black text-[#ff5a00]">{formatVnd(product.price)}</p> : <p className="rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Giá sỉ sau duyệt</p>}
          <Link href={`/products/${product.slug}`} className="rounded-full bg-[#fbfaf7] px-3 py-1.5 text-[12px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">Xem sản phẩm</Link>
        </div>
      ) : null}
    </div>
  );
}

export function RecipeDetailClient({ slug }: RecipeDetailClientProps) {
  const [approved, setApproved] = useState(false);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addedCount, setAddedCount] = useState<number | null>(null);

  useEffect(() => {
    var activeRequest = true;

    async function loadRecipe() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`/api/recipes/${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (response.status === 404) throw new Error("Không tìm thấy công thức");
        if (!response.ok) throw new Error("Không tải được công thức");
        const data = (await response.json()) as RecipeDetailResponse;
        if (!activeRequest) return;
        setApproved(Boolean(data.approved));
        setRecipe(data.recipe);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được công thức");
        setRecipe(null);
      } finally {
        if (activeRequest) setLoading(false);
      }
    }

    loadRecipe();

    return () => {
      activeRequest = false;
    };
  }, [slug]);

  const cartableIngredients = useMemo(() => {
    if (!approved || !recipe) return [];
    return recipe.ingredients.filter((ingredient) => ingredient.product && typeof ingredient.product.price === "number");
  }, [approved, recipe]);

  if (loading) return <RecipeState>Đang tải công thức...</RecipeState>;
  if (error) return <RecipeState>{error}</RecipeState>;
  if (!recipe) return <RecipeState>Không có dữ liệu công thức</RecipeState>;

  function addIngredientsToCart() {
    if (!recipe || cartableIngredients.length === 0) return;

    cartableIngredients.forEach((ingredient) => {
      const product = ingredient.product;
      if (!product || typeof product.price !== "number") return;
      const minQty = Math.max(1, product.minOrderQty || 1);
      addCartItem({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.categoryName || "sản phẩm",
        price: product.price,
        quantity: minQty,
        minOrderQty: minQty,
        imageUrl: product.imageUrl,
        categorySlug: product.categorySlug,
      });
    });

    setAddedCount(cartableIngredients.length);
    window.setTimeout(() => setAddedCount(null), 1600);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start">
        <div className="overflow-hidden rounded-[32px] bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc]">
          <div className="grid min-h-[250px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] to-[#f4efff] text-[112px] md:min-h-[380px]">
            {recipe.coverImageUrl ? <img src={recipe.coverImageUrl} alt={recipe.title} className="h-full w-full object-contain" /> : getRecipeEmoji(recipe)}
          </div>
        </div>

        <div className="rounded-[32px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc] md:p-7">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#f4efff] px-3 py-1.5 text-[12px] font-black text-[#7c3aed] ring-1 ring-[#dccbff]">{recipe.categoryName}</span>
            {recipe.relatedBrand ? <span className="rounded-full bg-[#eefbf6] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{recipe.relatedBrand}</span> : null}
            {recipe.isLocked ? <span className="rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Khóa định lượng</span> : <span className="rounded-full bg-[#e9fbf2] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">Đã mở chi tiết</span>}
          </div>

          <h2 className="mt-4 text-[30px] font-black leading-tight tracking-tight text-[#0b1220] md:text-5xl">{recipe.title}</h2>
          {recipe.shortDescription ? <p className="mt-4 text-[15px] font-semibold leading-7 text-slate-600 md:text-base md:leading-8">{recipe.shortDescription}</p> : null}
          {recipe.description ? <p className="mt-3 text-[14px] font-semibold leading-7 text-slate-500 md:text-[15px] md:leading-8">{recipe.description}</p> : null}

          {recipe.isLocked ? (
            <div className="mt-6 rounded-[24px] bg-[#fff3ea] p-5 ring-1 ring-[#ffd0b3]">
              <p className="text-[15px] font-black text-[#ff5a00]">{recipe.lockReason}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Bạn vẫn xem được ý tưởng và danh sách nguyên liệu gợi ý. Định lượng và cách làm chi tiết mở sau khi hồ sơ quán được duyệt.</p>
              <div className="mt-4">
                <AccountAction href="/register" signedOutLabel="Tạo hồ sơ để mở công thức" className="flex h-12 w-full items-center justify-center rounded-[18px] bg-[#0b1220] px-6 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(15,23,42,0.18)]">Tạo hồ sơ để mở công thức</AccountAction>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] bg-[#e9fbf2] p-5 ring-1 ring-[#b9eadb]">
              <p className="text-[15px] font-black text-[#08775f]">Công thức đã mở cho shop của bạn.</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Có thể thêm toàn bộ nguyên liệu đã map sản phẩm vào giỏ để lên đơn nhanh.</p>
              <button type="button" onClick={addIngredientsToCart} disabled={cartableIngredients.length === 0} className={`mt-4 h-12 w-full rounded-[18px] px-6 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(255,90,0,0.24)] ring-1 active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none ${addedCount ? "bg-[#08775f] ring-[#0b8f72]/40" : "bg-[#ff5a00] ring-[#ff7a2e]/40"}`}>
                {addedCount ? `Đã thêm ${addedCount} nguyên liệu` : "Thêm nguyên liệu vào giỏ"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[30px] bg-[#fbfaf7] p-4 shadow-[0_16px_36px_rgba(15,23,42,0.055)] ring-1 ring-[#efe7dc] md:p-5">
          <h3 className="text-2xl font-black">Nguyên liệu</h3>
          <div className="mt-4 space-y-3">
            {recipe.ingredients.length ? recipe.ingredients.map((ingredient) => <IngredientRow key={ingredient.id} ingredient={ingredient} approved={approved} />) : <p className="rounded-[22px] bg-white p-4 text-sm font-bold text-slate-500 ring-1 ring-[#efe7dc]">Chưa có nguyên liệu.</p>}
          </div>
        </div>

        <div className="rounded-[30px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:p-6">
          <h3 className="text-2xl font-black">Cách làm</h3>
          {recipe.isLocked ? (
            <div className="mt-4 rounded-[24px] bg-[#fff3ea] p-5 ring-1 ring-[#ffd0b3]">
              <p className="text-sm font-bold leading-6 text-slate-600">Cách làm chi tiết đang khóa. Hồ sơ quán duyệt xong sẽ mở toàn bộ bước làm và định lượng.</p>
            </div>
          ) : recipe.steps.length ? (
            <div className="mt-4 space-y-4">
              {recipe.steps.map((step) => (
                <article key={step.id} className="rounded-[24px] bg-[#fbfaf7] p-4 ring-1 ring-[#eee7dc]">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ff5a00] text-sm font-black text-white">{step.stepNo}</span>
                    <h4 className="text-base font-black text-[#0b1220]">{step.title}</h4>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{step.content}</p>
                  {step.imageUrl ? <img src={step.imageUrl} alt={step.title} className="mt-3 rounded-[18px] object-cover" /> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-[22px] bg-[#fbfaf7] p-4 text-sm font-bold text-slate-500 ring-1 ring-[#eee7dc]">Chưa có bước làm.</p>
          )}
        </div>
      </section>
    </div>
  );
}
