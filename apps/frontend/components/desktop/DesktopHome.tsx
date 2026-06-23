"use client";

import Link from "next/link";
import { CatalogFilters } from "@/components/catalog/CatalogFilters";
import { useCatalogBrowser } from "@/components/catalog/useCatalogBrowser";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import {
  getCatalogV2OrderLabel,
  getCatalogV2PriceHeading,
  getCatalogV2PriceLabel,
  getCatalogV2SpecificationLabel,
} from "@/lib/catalog-v2-display";

function categoryEmoji(id: string) {
  const value = id.toLowerCase();
  if (value.includes("tra") || value.includes("pha-che")) return "🧋";
  if (value.includes("topping")) return "🧊";
  if (value.includes("bot")) return "🥛";
  if (value.includes("syrup") || value.includes("mut")) return "🍓";
  if (value.includes("dung-cu")) return "🥄";
  return "📦";
}

function DesktopProductCard({ product }: { product: CatalogV2VariantCard }) {
  const detailHref = `/products/${product.variant_id}`;

  return (
    <article className="rounded-[30px] bg-white p-5 shadow-lg ring-1 ring-[#efe7dc]">
      <Link href={detailHref} className="grid h-40 place-items-center overflow-hidden rounded-[26px] bg-[#fff3ea] text-7xl">
        {product.image.url ? <img src={product.image.url} alt={product.name} className="h-full w-full object-contain" /> : categoryEmoji(product.industryKey)}
      </Link>
      {product.brand ? <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[#ff5a00]">{product.brand}</p> : null}
      <Link href={detailHref} className="mt-2 block min-h-14 text-xl font-black leading-tight text-[#0b1220] hover:text-[#ff5a00]">{product.name}</Link>
      <p className="mt-2 text-sm font-black text-slate-500">{product.industry}</p>
      <div className="mt-3 rounded-[16px] bg-[#fbfaf7] p-3 text-sm font-semibold text-slate-500 ring-1 ring-[#eee7dc]">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Quy cách đại diện</p>
        <p className="mt-1 font-black text-[#0b1220]">{getCatalogV2SpecificationLabel(product)}</p>
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{getCatalogV2PriceHeading(product)}</p>
        <p className="mt-1 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{getCatalogV2PriceLabel(product)}</p>
      </div>
      <div className="mt-5 flex gap-2">
        <Link href={detailHref} className="flex-1 rounded-2xl bg-[#fbfaf7] px-4 py-3 text-center text-sm font-black ring-1 ring-[#eee7dc]">Chọn phân loại</Link>
        <span className={`rounded-2xl px-4 py-3 text-center text-xs font-black ${product.isOrderable ? "bg-[#0b1220] text-white" : "bg-slate-200 text-slate-600"}`}>{getCatalogV2OrderLabel(product)}</span>
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

export function DesktopHome({ active = "home" }: { active?: AppNavKey }) {
  const {
    products,
    industries,
    brands,
    selectedIndustry,
    setSelectedIndustry,
    selectedBrand,
    setSelectedBrand,
    resetFilters,
    searchText,
    setSearchText,
    loading,
    error,
    total,
  } = useCatalogBrowser();

  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <DesktopHeader active={active} />

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="relative overflow-hidden rounded-[40px] bg-white shadow-lg ring-1 ring-white">
          <img src="/home/home-trang-chu.png" alt="Nguyên liệu F&B cho quán" className="block h-auto w-full object-contain" draggable={false} />
          <div className="absolute inset-x-10 bottom-8">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Tìm tên sản phẩm, thương hiệu hoặc SKU..."
              className="h-14 w-full rounded-[20px] border border-white/80 bg-white/95 px-5 text-base font-bold shadow-lg outline-none placeholder:text-slate-400 focus:border-[#ff5a00]"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-6">
        <CatalogFilters
          industries={industries}
          brands={brands}
          selectedIndustry={selectedIndustry}
          selectedBrand={selectedBrand}
          onIndustryChange={setSelectedIndustry}
          onBrandChange={setSelectedBrand}
          onReset={resetFilters}
          resultCount={total}
        />
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-14">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-4xl font-black">{loading ? "Đang tải sản phẩm" : `${total} sản phẩm`}</h2>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-500 ring-1 ring-[#eee7dc]">Một card = một sản phẩm cha</span>
        </div>

        {loading ? <ProductGridState>Đang tải sản phẩm...</ProductGridState> : null}
        {!loading && error ? <ProductGridState>{error}</ProductGridState> : null}
        {!loading && !error && products.length === 0 ? <ProductGridState>Không có sản phẩm phù hợp</ProductGridState> : null}
        {!loading && !error && products.length > 0 ? (
          <div className="grid grid-cols-4 gap-5">
            {products.map((product) => <DesktopProductCard key={product.product_id} product={product} />)}
          </div>
        ) : null}
      </section>
    </main>
  );
}
