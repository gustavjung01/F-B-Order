"use client";

import { useState } from "react";
import { CatalogFilters } from "@/components/catalog/CatalogFilters";
import { useCatalogBrowser } from "@/components/catalog/useCatalogBrowser";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { ProductQuickView } from "@/components/mobile/ProductQuickView";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import {
  getCatalogV2OrderLabel,
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

function ProductCard({ product, onOpen }: { product: CatalogV2VariantCard; onOpen: () => void }) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-white/80 bg-white p-3 shadow-[0_12px_26px_rgba(15,23,42,0.09)] ring-1 ring-[#efe7dc]">
      <div className="grid min-w-0 grid-cols-[70px_minmax(0,1fr)] gap-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="grid h-[96px] w-[70px] place-items-center overflow-hidden rounded-[18px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[38px] ring-1 ring-white/80"
          aria-label={`Mở ${product.name}`}
        >
          {product.image.url ? <img src={product.image.url} alt={product.name} className="h-full w-full object-contain" /> : categoryEmoji(product.industryKey)}
        </button>

        <div className="min-w-0 pt-0.5">
          {product.brand ? <p className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{product.brand}</p> : null}
          <button type="button" onClick={onOpen} className="mt-1 block w-full text-left text-[15px] font-black leading-[1.12] tracking-tight text-[#0b1220] active:text-[#ff5a00]">
            <span className="line-clamp-3">{product.name}</span>
          </button>
          <p className="mt-1.5 line-clamp-2 text-[10px] font-black leading-tight text-slate-500">{product.industry}</p>
        </div>
      </div>

      <div className="mt-3 rounded-[13px] bg-[#fbfaf7] px-2.5 py-2 text-[10px] font-black leading-snug text-[#0b1220] ring-1 ring-[#eee7dc]">
        <p className="line-clamp-2">{getCatalogV2SpecificationLabel(product)}</p>
      </div>

      <div className="mt-2.5">
        <p className="flex w-full items-center justify-center rounded-[13px] bg-[#fff3ea] px-2 py-1.5 text-center text-[11px] font-black leading-tight text-[#ff5a00] ring-1 ring-[#ffd0b3]">
          {getCatalogV2PriceLabel(product)}
        </p>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
        <button type="button" onClick={onOpen} className="min-h-11 rounded-[14px] bg-[#fbfaf7] px-2 py-2 text-[11px] font-black leading-tight text-[#0b1220] ring-1 ring-[#eee7dc]">
          Chọn phân loại
        </button>
        <span className={`flex min-h-11 items-center justify-center rounded-[14px] px-2 py-2 text-center text-[10px] font-black leading-tight ${product.isOrderable ? "bg-[#0b1220] text-white" : "bg-slate-200 text-slate-600"}`}>
          {getCatalogV2OrderLabel(product)}
        </span>
      </div>
    </article>
  );
}

function ProductListState({ children }: { children: string }) {
  return <div className="col-span-2 rounded-[24px] border border-dashed border-[#e7dccd] bg-white/70 px-5 py-8 text-center text-[15px] font-black text-slate-500 shadow-sm">{children}</div>;
}

export function ProductHome({ active = "home" }: { active?: AppNavKey }) {
  const [selectedProduct, setSelectedProduct] = useState<CatalogV2VariantCard | null>(null);
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
    shownCount,
    hasMore,
    showMore,
    pageSize,
    isBrandFilterHidden,
  } = useCatalogBrowser();

  const subtitle = loading ? "Đang tải sản phẩm" : `${total} sản phẩm`;

  return (
    <MobilePageShell active={active} title="Bếp Sỉ F&B" subtitle={subtitle}>
      <h1 className="sr-only">Sản phẩm</h1>

      <div className="relative min-h-[220px] overflow-hidden rounded-[30px] shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero/home.png')" }} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,247,237,0.22)_44%,rgba(247,243,235,0.90)_100%)]" />
        <div className="relative z-10 min-h-[220px] p-4">
          <div className="absolute inset-x-4 top-[48%] -translate-y-1/2 text-center">
            <h2 className="mx-auto inline-block whitespace-nowrap text-[clamp(22px,6.7vw,30px)] font-black leading-none tracking-[-0.045em] text-[#0b1220]">
              Nguyên liệu F&B cho quán
            </h2>
          </div>
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Tìm tên, thương hiệu hoặc mã sản phẩm..." className="absolute bottom-4 left-4 right-4 h-12 rounded-[18px] border border-white/80 bg-white/95 px-4 text-[15px] font-bold shadow-sm outline-none placeholder:text-slate-400 focus:border-[#ff5a00] focus:bg-white" />
        </div>
      </div>

      <div className="mt-4">
        <CatalogFilters
          industries={industries}
          brands={brands}
          selectedIndustry={selectedIndustry}
          selectedBrand={selectedBrand}
          onIndustryChange={setSelectedIndustry}
          onBrandChange={setSelectedBrand}
          onReset={resetFilters}
          resultCount={total}
          hideBrandFilter={isBrandFilterHidden}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#0b1220]">{loading ? "Đang tải" : `${total} sản phẩm`}</h2>
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-slate-500 ring-1 ring-[#eee7dc]">Danh mục sản phẩm</span>
      </div>

      <div className="mt-3 grid grid-cols-2 items-stretch gap-3">
        {loading ? <ProductListState>Đang tải sản phẩm...</ProductListState> : null}
        {!loading && error ? <ProductListState>{error}</ProductListState> : null}
        {!loading && !error && products.length === 0 ? <ProductListState>Không có sản phẩm phù hợp</ProductListState> : null}
        {!loading && !error ? products.map((product) => <ProductCard key={product.product_id} product={product} onOpen={() => setSelectedProduct(product)} />) : null}
      </div>

      {!loading && !error && products.length > 0 ? (
        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-xs font-black text-slate-500">Đang hiển thị {shownCount}/{total} sản phẩm</p>
          {hasMore ? (
            <button
              type="button"
              onClick={showMore}
              className="h-12 w-full rounded-[18px] bg-[#ff5a00] px-5 text-[15px] font-black text-white shadow-lg shadow-orange-200 active:scale-[0.99]"
            >
              Xem thêm {Math.min(pageSize, total - shownCount)} sản phẩm
            </button>
          ) : null}
        </div>
      ) : null}

      {selectedProduct ? <ProductQuickView product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </MobilePageShell>
  );
}
