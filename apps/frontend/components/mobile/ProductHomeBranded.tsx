"use client";

import { useState } from "react";
import { CatalogHero } from "@/components/catalog/CatalogHero";
import { CompactProductCard } from "@/components/catalog/CompactProductCard";
import { IndustryCatalogFilters } from "@/components/catalog/IndustryCatalogFilters";
import { useIndustryCatalogBrowser } from "@/components/catalog/useIndustryCatalogBrowser";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { ProductQuickView } from "@/components/mobile/ProductQuickView";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { CatalogV2ListResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";

function ProductListState({ children }: { children: string }) {
  return <div className="col-span-2 rounded-[24px] border border-dashed border-[#e7dccd] bg-white/70 px-5 py-8 text-center text-[15px] font-black text-slate-500 shadow-sm">{children}</div>;
}

export function ProductHomeBranded({ active = "home", initialCatalog }: { active?: AppNavKey; initialCatalog: CatalogV2ListResponse | null }) {
  const [selectedProduct, setSelectedProduct] = useState<CatalogV2VariantCard | null>(null);
  const catalog = useIndustryCatalogBrowser(initialCatalog);
  return (
    <MobilePageShell active={active} title="Bếp Sỉ F&B" subtitle={catalog.loading ? "Đang tải sản phẩm" : `${catalog.total} sản phẩm`}>
      <h1 className="sr-only">Sản phẩm</h1>
      <CatalogHero searchText={catalog.searchText} onSearchChange={catalog.setSearchText} />
      <div className="mt-4">
        <IndustryCatalogFilters industries={catalog.industries} selectedIndustry={catalog.selectedIndustry} onIndustryChange={catalog.setSelectedIndustry} onReset={catalog.resetFilters} resultCount={catalog.total} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#0b1220]">{catalog.loading ? "Đang tải" : `${catalog.total} sản phẩm`}</h2>
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-slate-500 ring-1 ring-[#eee7dc]">Danh mục sản phẩm</span>
      </div>
      <div className="mt-3 grid grid-cols-2 items-stretch gap-3">
        {catalog.loading ? <ProductListState>Đang tải sản phẩm...</ProductListState> : null}
        {!catalog.loading && catalog.error && catalog.products.length === 0 ? <ProductListState>{catalog.error}</ProductListState> : null}
        {!catalog.loading && !catalog.error && catalog.products.length === 0 ? <ProductListState>Không có sản phẩm phù hợp</ProductListState> : null}
        {!catalog.loading ? catalog.products.map((product) => <CompactProductCard key={product.product_id} product={product} onOpen={() => setSelectedProduct(product)} />) : null}
      </div>
      {!catalog.loading && catalog.products.length > 0 ? (
        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-xs font-black text-slate-500">Đang hiển thị {catalog.shownCount}/{catalog.total} sản phẩm</p>
          {catalog.error ? <p className="text-center text-xs font-black text-red-600">{catalog.error}</p> : null}
          {catalog.hasMore ? <button type="button" onClick={catalog.showMore} disabled={catalog.loadingMore} className="h-12 w-full rounded-[18px] bg-[#ff5a00] px-5 text-[15px] font-black text-white shadow-lg shadow-orange-200 disabled:opacity-60">{catalog.loadingMore ? "Đang tải thêm..." : `Xem thêm ${Math.min(catalog.pageSize, catalog.total - catalog.shownCount)} sản phẩm`}</button> : null}
        </div>
      ) : null}
      {selectedProduct ? <ProductQuickView product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </MobilePageShell>
  );
}
