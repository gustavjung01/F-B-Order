"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountAction } from "@/components/auth/AccountAction";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";

type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  children: CategoryNode[];
};

type ApiProduct = {
  id: string;
  sku: string;
  slug?: string;
  name: string;
  brand?: string;
  description?: string;
  shortDescription?: string;
  unit?: string;
  packageSpec?: string;
  packageSize?: string;
  imageUrl?: string;
  minOrderQty?: number;
  categoryName?: string;
  categorySlug: string;
  subcategorySlug?: string;
  price: number | null;
  publicPriceHint?: string | null;
};

type CategoriesResponse = {
  primaryTabs: CategoryNode[];
};

type ProductsResponse = {
  approved: boolean;
  products: ApiProduct[];
};

type BottomNavKey = "home" | "products" | "recipes" | "cart" | "account";

const categoryEmoji: Record<string, string> = {
  all: "▦",
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
  "thuc-pham-dong-lanh": "❄️",
  "combo-cong-thuc": "📦",
  "brand-distribution": "🏷️",
};

const categoryTones: Record<string, string> = {
  all: "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]",
  "tra-sua-pha-che": "bg-[#eefbf6] text-[#08775f] ring-[#b9eadb]",
  "mi-cay-han-quoc": "bg-[#fff0ef] text-[#dc2626] ring-[#ffc9c3]",
  "thuc-pham-dong-lanh": "bg-[#eef6ff] text-[#2563eb] ring-[#c7ddff]",
  "combo-cong-thuc": "bg-[#f4efff] text-[#7c3aed] ring-[#dccbff]",
  "brand-distribution": "bg-[#fff8e8] text-[#b77900] ring-[#ffe1a8]",
};

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildProductsUrl(categorySlug: string) {
  const params = new URLSearchParams();
  if (categorySlug !== "all") params.set("category", categorySlug);
  params.set("limit", "80");
  return `/api/products?${params.toString()}`;
}

function getTabTone(slug: string) {
  return categoryTones[slug] || "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]";
}

function ProductCard({ product, approved }: { product: ApiProduct; approved: boolean }) {
  const detailHref = `/products/${product.slug || product.sku}`;
  const packageLabel = product.packageSize || product.packageSpec || product.unit || "Sản phẩm";
  const description = product.shortDescription || product.description;
  const price = product.price;

  return (
    <article className="overflow-hidden rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 pt-1">
          {product.brand ? <p className="mb-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{product.brand}</p> : null}
          <Link href={detailHref} className="block text-[20px] font-black leading-tight tracking-tight text-[#0b1220] active:text-[#ff5a00]">{product.name}</Link>
          <p className="mt-2 text-[14px] font-semibold text-slate-500">{packageLabel}</p>
          {description ? <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug text-slate-400">{description}</p> : null}
          {approved && typeof price === "number" ? (
            <p className="mt-3 text-[24px] font-black tracking-tight text-[#ff5a00]">{formatVnd(price)}</p>
          ) : (
            <p className="mt-3 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-[13px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{product.publicPriceHint || "Giá sỉ sau duyệt"}</p>
          )}
        </div>
        <Link href={detailHref} className="grid h-[112px] w-[116px] shrink-0 place-items-center overflow-hidden rounded-[25px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[62px] ring-1 ring-white/80">
          {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : categoryEmoji[product.categorySlug] || "📦"}
        </Link>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Link href={detailHref} className="flex h-11 flex-1 items-center justify-center rounded-[16px] bg-[#fbfaf7] px-4 text-[15px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">Xem chi tiết</Link>
        {!approved ? <AccountAction href="/register" signedOutLabel="Mở giá" className="flex h-11 min-w-[112px] items-center justify-center rounded-[16px] bg-[#0b1220] px-4 text-[14px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]">Mở giá</AccountAction> : null}
      </div>
    </article>
  );
}

function ProductListState({ children }: { children: string }) {
  return <div className="rounded-[24px] border border-dashed border-[#e7dccd] bg-white/70 px-5 py-8 text-center text-[15px] font-black text-slate-500 shadow-sm">{children}</div>;
}

export function ProductHome({ active = "home" }: { active?: BottomNavKey }) {
  const [approved, setApproved] = useState(false);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activeRequest = true;

    async function loadCategories() {
      try {
        setLoadingCategories(true);
        const response = await fetch("/api/categories", { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được danh mục");
        const data = (await response.json()) as CategoriesResponse;
        if (activeRequest) setCategories(Array.isArray(data.primaryTabs) ? data.primaryTabs : []);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh mục");
        setCategories([]);
      } finally {
        if (activeRequest) setLoadingCategories(false);
      }
    }

    loadCategories();
    return () => {
      activeRequest = false;
    };
  }, []);

  useEffect(() => {
    let activeRequest = true;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        setError("");
        const response = await fetch(buildProductsUrl(selectedCategory), { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được sản phẩm");
        const data = (await response.json()) as ProductsResponse;
        if (!activeRequest) return;
        setApproved(Boolean(data.approved));
        setProducts(Array.isArray(data.products) ? data.products : []);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setProducts([]);
      } finally {
        if (activeRequest) setLoadingProducts(false);
      }
    }

    loadProducts();
    return () => {
      activeRequest = false;
    };
  }, [selectedCategory]);

  const loading = loadingCategories || loadingProducts;
  const subtitle = useMemo(() => loading ? "Đang tải catalog" : approved ? "Bảng giá khách sỉ" : "Xem catalog trước", [approved, loading]);

  return (
    <MobilePageShell active={active} title="Bếp Sỉ F&B" subtitle={subtitle}>
      <h1 className="sr-only">Sản phẩm</h1>

      <Link href="/products" aria-label="Xem sản phẩm" className="block overflow-hidden rounded-[30px] bg-white shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <img src="/home/home-trang-chu.png" alt="Xem catalog trước, duyệt hồ sơ để mở giá" className="block h-auto w-full object-contain" draggable={false} />
      </Link>

      <div className="-mx-4 mt-4 overflow-hidden border-y border-[#eee7dc] bg-[#f7f3eb]/95">
        <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((tab) => {
            const selected = tab.slug === selectedCategory;
            return (
              <button key={tab.slug} type="button" aria-pressed={selected} onClick={() => setSelectedCategory(tab.slug)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-[14px] px-3.5 py-2.5 text-[13px] font-black shadow-sm ring-1 ${selected ? "bg-[#ff5a00] text-white ring-[#ff5a00] shadow-[0_8px_16px_rgba(255,90,0,0.18)]" : getTabTone(tab.slug)}`}>
                <span className="text-[16px] leading-none">{categoryEmoji[tab.slug] || "▦"}</span>
                <span className="leading-none">{tab.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? <ProductListState>Đang tải sản phẩm...</ProductListState> : null}
        {!loading && error ? <ProductListState>{error}</ProductListState> : null}
        {!loading && !error && products.length === 0 ? <ProductListState>Chưa có sản phẩm</ProductListState> : null}
        {!loading && !error ? products.map((product) => <ProductCard key={product.id || product.sku} product={product} approved={approved} />) : null}
      </div>

      {!approved ? (
        <div className="mt-4">
          <AccountAction href="/register" signedOutLabel="Đăng nhập để mở giá sỉ" className="block w-full rounded-[20px] bg-[#0b1220] px-5 py-4 text-center text-[15px] font-black text-white shadow-[0_14px_26px_rgba(15,23,42,0.18)]">Tạo hồ sơ quán để mở giá sỉ</AccountAction>
        </div>
      ) : null}
    </MobilePageShell>
  );
}
