"use client";

import { useState } from "react";
import { useCatalogBrowser } from "@/components/catalog/useCatalogBrowser";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { ProductQuickView } from "@/components/mobile/ProductQuickView";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import {
  getCatalogV2OptionSummary,
  getCatalogV2OrderLabel,
  getCatalogV2PriceLabel,
} from "@/lib/catalog-v2-display";

function categoryEmoji(id: string) {
  const value = id.toLowerCase();
  if (value === "all") return "▦";
  if (value.includes("tra") || value.includes("pha-che")) return "🧋";
  if (value.includes("topping")) return "🧊";
  if (value.includes("bot")) return "🥛";
  if (value.includes("syrup") || value.includes("mut")) return "🍓";
  if (value.includes("dung-cu")) return "🥄";
  return "📦";
}

function ProductCard({ product, onOpen }: { product: CatalogV2VariantCard; onOpen: () => void }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 pt-1">
          {product.brand ? <p className="mb-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{product.brand}</p> : null}
          <button type="button" onClick={onOpen} className="block text-left text-[20px] font-black leading-tight tracking-tight text-[#0b1220] active:text-[#ff5a00]">
            {product.name}
          </button>
          <p className="mt-2 text-[13px] font-black text-slate-500">{product.industry}</p>
          <div className="mt-2 space-y-1 text-[13px] font-semibold text-slate-500">
            <p>SKU: <span className="font-black text-[#0b1220]">{product.sku}</span></p>
            <p>Phân loại: <span className="font-black text-[#0b1220]">{getCatalogV2OptionSummary(product)}</span></p>
          </div>
          <p className="mt-3 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-[13px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{getCatalogV2PriceLabel(product)}</p>
        </div>

        <button type="button" onClick={onOpen} className="grid h-[112px] w-[116px] shrink-0 place-items-center overflow-hidden rounded-[25px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[62px] ring-1 ring-white/80">
          {product.image.url ? <img src={product.image.url} alt={product.name} className="h-full w-full object-contain" /> : categoryEmoji(product.industryKey)}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onOpen} className="flex h-11 flex-1 items-center justify-center rounded-[16px] bg-[#fbfaf7] px-4 text-[15px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">
          Chọn phân loại
        </button>
        <span className={`flex h-11 min-w-[128px] items-center justify-center rounded-[16px] px-4 text-center text-[12px] font-black ${product.isOrderable ? "bg-[#0b1220] text-white" : "bg-slate-200 text-slate-600"}`}>
          {getCatalogV2OrderLabel(product)}
        </span>
      </div>
    </article>
  );
}

function ProductListState({ children }: { children: string }) {
  return <div className="rounded-[24px] border border-dashed border-[#e7dccd] bg-white/70 px-5 py-8 text-center text-[15px] font-black text-slate-500 shadow-sm">{children}</div>;
}

export function ProductHome({ active = "home" }: { active?: AppNavKey }) {
  const [selectedProduct, setSelectedProduct] = useState<CatalogV2VariantCard | null>(null);
  const {
    products,
    tabs,
    selectedCategory,
    setSelectedCategory,
    searchText,
    setSearchText,
    loading,
    error,
    total,
  } = useCatalogBrowser();

  const subtitle = loading ? "Đang tải catalog" : `${total} card biến thể`;

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
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Tìm tên hoặc SKU..." className="absolute bottom-4 left-4 right-4 h-12 rounded-[18px] border border-white/80 bg-white/95 px-4 text-[15px] font-bold shadow-sm outline-none placeholder:text-slate-400 focus:border-[#ff5a00] focus:bg-white" />
        </div>
      </div>

      <div className="-mx-4 mt-4 overflow-hidden border-y border-[#eee7dc] bg-[#f7f3eb]/95">
        <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const selected = tab.id === selectedCategory;
            return (
              <button key={tab.id} type="button" aria-pressed={selected} onClick={() => setSelectedCategory(tab.id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-[14px] px-3.5 py-2.5 text-[13px] font-black shadow-sm ring-1 ${selected ? "bg-[#ff5a00] text-white ring-[#ff5a00]" : "bg-white text-slate-600 ring-[#eee7dc]"}`}>
                <span className="text-[16px] leading-none">{categoryEmoji(tab.id)}</span>
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
        {!loading && !error && products.length === 0 ? <ProductListState>Không có sản phẩm phù hợp</ProductListState> : null}
        {!loading && !error ? products.map((product) => <ProductCard key={product.variant_id} product={product} onOpen={() => setSelectedProduct(product)} />) : null}
      </div>

      {selectedProduct ? <ProductQuickView product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </MobilePageShell>
  );
}
