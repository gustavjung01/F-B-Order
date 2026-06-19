"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountAction } from "@/components/auth/AccountAction";
import { AuthControls } from "@/components/auth/AuthControls";
import { BrandLogo } from "@/components/brand/BrandLogo";

type ApiProduct = {
  id: string;
  sku: string;
  slug?: string;
  name: string;
  brand?: string;
  description: string;
  shortDescription?: string;
  unit: string;
  packageSpec?: string;
  packageSize?: string;
  imageUrl: string;
  minOrderQty: number;
  categoryName: string;
  categorySlug: string;
  subcategorySlug?: string;
  price: number | null;
  publicPriceHint?: string | null;
};

type ProductsResponse = {
  approved: boolean;
  products: ApiProduct[];
};

const categoryEmoji: Record<string, string> = {
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
  "thuc-pham-dong-lanh": "❄️",
  "combo-cong-thuc": "📦",
  "tra-nen-tra-tui-loc": "🍵",
  "bot-sua-bot-beo": "🥛",
  topping: "🧊",
  "syrup-sot-mut": "🍯",
  "bot-pudding-jelly": "🍮",
  "nguyen-lieu-da-xay": "🥤",
  "cot-dua": "🥥",
};

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function getProductEmoji(product: ApiProduct) {
  return categoryEmoji[product.subcategorySlug || ""] || categoryEmoji[product.categorySlug] || "📦";
}

function approvalLabel(approved: boolean) {
  return approved ? "Đã mở giá sỉ" : "Chờ admin duyệt";
}

function approvalTone(approved: boolean) {
  return approved ? "bg-[#e9fbf2] text-[#08775f] ring-[#b9eadb]" : "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]";
}

function DesktopProductCard({ product, approved }: { product: ApiProduct; approved: boolean }) {
  const price = product.price;
  const hasPrice = typeof price === "number";
  const packageLabel = product.packageSize || product.packageSpec || product.unit;
  const description = product.shortDescription || product.description;

  return (
    <article className="rounded-[30px] bg-white p-5 shadow-lg ring-1 ring-[#efe7dc]">
      <div className="grid h-40 place-items-center overflow-hidden rounded-[26px] bg-[#fff3ea] text-7xl">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : getProductEmoji(product)}
      </div>
      {product.brand ? <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[#ff5a00]">{product.brand}</p> : null}
      <h3 className="mt-2 min-h-14 text-xl font-black leading-tight">{product.name}</h3>
      <p className="mt-2 text-sm font-bold text-slate-500">{packageLabel}</p>
      {description ? <p className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-400">{description}</p> : null}
      {hasPrice ? <p className="mt-4 text-2xl font-black text-[#ff5a00]">{formatVnd(price)}</p> : <p className="mt-4 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{product.publicPriceHint || "Giá sỉ sau duyệt"}</p>}
      <div className="mt-5 flex gap-2">
        <button className="flex-1 rounded-2xl bg-[#fbfaf7] px-4 py-3 text-sm font-black ring-1 ring-[#eee7dc]">Chi tiết</button>
        {!approved ? <AccountAction href="/register" signedOutLabel="Mở giá" className="rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-black text-white">Mở giá</AccountAction> : null}
      </div>
    </article>
  );
}

function ProductGridState({ children }: { children: string }) {
  return (
    <div className="rounded-[30px] border border-dashed border-[#e7dccd] bg-white/70 px-8 py-12 text-center text-lg font-black text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

export function DesktopHome() {
  const [approved, setApproved] = useState(false);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    var activeRequest = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/products?limit=8", { cache: "no-store" });
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
        if (activeRequest) setLoading(false);
      }
    }

    loadProducts();

    return () => {
      activeRequest = false;
    };
  }, []);

  const featuredTitle = useMemo(() => {
    if (loading) return "Đang tải sản phẩm";
    return "Sản phẩm nổi bật";
  }, [loading]);

  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <header className="sticky top-0 z-40 border-b border-[#eee7dc] bg-[#f7f3eb]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <Link href="/" className="flex items-center"><BrandLogo className="h-16 w-[260px]" /></Link>
          <nav className="flex gap-2 text-sm font-black text-slate-600">
            <Link href="/" className="rounded-full bg-white px-4 py-2 text-[#ff5a00]">Sản phẩm</Link>
            <Link href="/recipes" className="rounded-full px-4 py-2 hover:bg-white">Công thức</Link>
            <Link href="/cart" className="rounded-full px-4 py-2 hover:bg-white">Giỏ hàng</Link>
            <Link href="/account" className="rounded-full px-4 py-2 hover:bg-white">Tài khoản</Link>
          </nav>
          <AuthControls />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <Link href="/products" aria-label="Sản phẩm" className="block overflow-hidden rounded-[40px] bg-white shadow-lg ring-1 ring-white">
          <img src="/home/home-trang-chu.png" alt="Sản phẩm" className="block h-auto w-full object-contain" draggable={false} />
        </Link>
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-14">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-4xl font-black">{featuredTitle}</h2>
          <span className={`inline-flex rounded-full px-4 py-2 text-sm font-black ring-1 ${approvalTone(approved)}`}>{approvalLabel(approved)}</span>
        </div>

        {loading ? <ProductGridState>Đang tải sản phẩm...</ProductGridState> : null}
        {!loading && error ? <ProductGridState>{error}</ProductGridState> : null}
        {!loading && !error && products.length === 0 ? <ProductGridState>Chưa có sản phẩm active</ProductGridState> : null}
        {!loading && !error && products.length > 0 ? (
          <div className="grid grid-cols-4 gap-5">
            {products.map((product) => <DesktopProductCard key={product.id || product.sku} product={product} approved={approved} />)}
          </div>
        ) : null}
      </section>
    </main>
  );
}
