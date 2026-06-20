"use client";

import { useEffect, useMemo, useState } from "react";
import homeHeroImage from "../../../../home.png";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { ProductQuickView } from "@/components/mobile/ProductQuickView";
import type { CategoryWithCount, PublicProduct } from "@/data/catalog/product-model";

type BottomNavKey = "home" | "products" | "recipes" | "cart" | "account";

type CategoriesResponse = { categories: CategoryWithCount[] };
type ProductsResponse = { products: PublicProduct[]; total: number };

const categoryEmoji: Record<string, string> = {
  all: "▦",
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
  "thuc-pham-dong-lanh": "❄️",
  "combo-cong-thuc": "📦",
  "brand-distribution": "🏷️",
  topping: "🧊",
};

const categoryTones: Record<string, string> = {
  all: "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]",
  "tra-sua-pha-che": "bg-[#eefbf6] text-[#08775f] ring-[#b9eadb]",
  "mi-cay-han-quoc": "bg-[#fff0ef] text-[#dc2626] ring-[#ffc9c3]",
  "thuc-pham-dong-lanh": "bg-[#eef6ff] text-[#2563eb] ring-[#c7ddff]",
  "combo-cong-thuc": "bg-[#f4efff] text-[#7c3aed] ring-[#dccbff]",
  "brand-distribution": "bg-[#fff8e8] text-[#b77900] ring-[#ffe1a8]",
};

function buildProductsUrl(categoryId: string, q: string) {
  const params = new URLSearchParams();
  if (categoryId !== "all") params.set("categoryId", categoryId);
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", "80");
  return `/api/catalog/products?${params.toString()}`;
}

function getTabTone(id: string) {
  return categoryTones[id] || "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]";
}

function getProductEmoji(product: PublicProduct) {
  return categoryEmoji[product.categoryId] || categoryEmoji[product.subcategoryId || ""] || "📦";
}

function isUpdating(value: string | null | undefined) {
  return !value || value === "Đang cập nhật";
}

function ProductCard({ product, onOpen }: { product: PublicProduct; onOpen: () => void }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 pt-1">
          {!isUpdating(product.brand) ? <p className="mb-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{product.brand}</p> : null}
          <button type="button" onClick={onOpen} className="block text-left text-[20px] font-black leading-tight tracking-tight text-[#0b1220] active:text-[#ff5a00]">
            {product.name}
          </button>
          <p className="mt-2 text-[13px] font-black text-slate-500">{product.categoryName}</p>
          <div className="mt-2 space-y-1 text-[13px] font-semibold text-slate-500">
            <p>Quy cách: <span className="font-black text-[#0b1220]">{product.packageSizeLabel}</span></p>
            <p>Đơn vị: <span className="font-black text-[#0b1220]">{product.unitLabel}</span></p>
          </div>
          {product.shortDescription ? <p className="mt-2 line-clamp-2 text-[12px] font-semibold leading-snug text-slate-400">{product.shortDescription}</p> : null}
          <p className="mt-3 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-[13px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{product.priceLabel}</p>
        </div>
        <button type="button" onClick={onOpen} className="grid h-[112px] w-[116px] shrink-0 place-items-center overflow-hidden rounded-[25px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[62px] ring-1 ring-white/80">
          {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : getProductEmoji(product)}
        </button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onOpen} className="flex h-11 flex-1 items-center justify-center rounded-[16px] bg-[#fbfaf7] px-4 text-[15px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">
          Xem
        </button>
        <span className="flex h-11 min-w-[128px] items-center justify-center rounded-[16px] bg-[#0b1220] px-4 text-[13px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]">
          {product.orderLabel}
        </span>
      </div>
    </article>
  );
}

function ProductListState({ children }: { children: string }) {
  return <div className="rounded-[24px] border border-dashed border-[#e7dccd] bg-white/70 px-5 py-8 text-center text-[15px] font-black text-slate-500 shadow-sm">{children}</div>;
}

export function ProductHome({ active = "home" }: { active?: BottomNavKey }) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [searchText, setSearchText] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activeRequest = true;
    async function loadCategories() {
      try {
        setLoadingCategories(true);
        const response = await fetch("/api/catalog/categories", { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được danh mục");
        const data = (await response.json()) as CategoriesResponse;
        if (!activeRequest) return;
        setCategories(Array.isArray(data.categories) ? data.categories.filter((category) => category.parentId === null) : []);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh mục");
        setCategories([]);
      } finally {
        if (activeRequest) setLoadingCategories(false);
      }
    }
    loadCategories();
    return () => { activeRequest = false; };
  }, []);

  useEffect(() => {
    let activeRequest = true;
    async function loadProducts() {
      try {
        setLoadingProducts(true);
        setError("");
        const response = await fetch(buildProductsUrl(selectedCategory, searchText), { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được sản phẩm");
        const data = (await response.json()) as ProductsResponse;
        if (!activeRequest) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setTotalProducts(Number.isFinite(data.total) ? data.total : 0);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setProducts([]);
        setTotalProducts(0);
      } finally {
        if (activeRequest) setLoadingProducts(false);
      }
    }
    const timer = window.setTimeout(loadProducts, 180);
    return () => { activeRequest = false; window.clearTimeout(timer); };
  }, [selectedCategory, searchText]);

  const loading = loadingCategories || loadingProducts;
  const subtitle = useMemo(() => loading ? "Đang tải catalog" : "Catalog sản phẩm Hưng Phát", [loading]);
  const tabs = [{ id: "all", name: "Tất cả", productCount: totalProducts, parentId: null, sortOrder: 0 }, ...categories];

  return (
    <MobilePageShell active={active} title="Bếp Sỉ F&B" subtitle={subtitle}>
      <style>{`
        @keyframes heroTitleGradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
      <h1 className="sr-only">Sản phẩm</h1>

      <div className="relative min-h-[220px] overflow-hidden rounded-[30px] shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${homeHeroImage.src})` }} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,247,237,0.22)_44%,rgba(247,243,235,0.90)_100%)]" />
        <div className="relative z-10 min-h-[220px] p-4">
          <div className="absolute inset-x-4 top-[48%] -translate-y-1/2 text-center">
            <h2 className="mx-auto inline-block whitespace-nowrap bg-[linear-gradient(90deg,#0b1220,#ff5a00,#08775f,#0b1220)] bg-[length:260%_100%] bg-clip-text text-[clamp(22px,6.7vw,30px)] font-black leading-none tracking-[-0.045em] text-transparent drop-shadow-[0_1px_0_rgba(255,255,255,0.78)]" style={{ animation: "heroTitleGradient 4.8s ease-in-out infinite" }}>
              Nguyên liệu F&B cho quán
            </h2>
          </div>
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Tìm trà, bột sữa, topping..." className="absolute bottom-4 left-4 right-4 h-12 rounded-[18px] border border-white/80 bg-white/95 px-4 text-[15px] font-bold shadow-sm outline-none placeholder:text-slate-400 focus:border-[#ff5a00] focus:bg-white" />
        </div>
      </div>

      <div className="-mx-4 mt-4 overflow-hidden border-y border-[#eee7dc] bg-[#f7f3eb]/95">
        <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const selected = tab.id === selectedCategory;
            const empty = tab.id !== "all" && tab.productCount === 0;
            return (
              <button key={tab.id} type="button" aria-pressed={selected} onClick={() => setSelectedCategory(tab.id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-[14px] px-3.5 py-2.5 text-[13px] font-black shadow-sm ring-1 ${selected ? "bg-[#ff5a00] text-white ring-[#ff5a00] shadow-[0_8px_16px_rgba(255,90,0,0.18)]" : empty ? "bg-white text-slate-400 ring-[#eee7dc]" : getTabTone(tab.id)}`}>
                <span className="text-[16px] leading-none">{categoryEmoji[tab.id] || "▦"}</span>
                <span className="leading-none">{tab.name}</span>
                <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[11px] leading-none">{tab.productCount}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? <ProductListState>Đang tải sản phẩm...</ProductListState> : null}
        {!loading && error ? <ProductListState>{error}</ProductListState> : null}
        {!loading && !error && products.length === 0 ? <ProductListState>Nhóm này đang cập nhật dữ liệu sản phẩm</ProductListState> : null}
        {!loading && !error ? products.map((product) => <ProductCard key={product.id} product={product} onOpen={() => setSelectedProduct(product)} />) : null}
      </div>

      {selectedProduct ? <ProductQuickView product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </MobilePageShell>
  );
}
