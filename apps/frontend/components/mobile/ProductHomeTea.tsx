"use client";

import { useState } from "react";
import { CatalogHero } from "@/components/catalog/CatalogHero";
import { CompactProductCard } from "@/components/catalog/CompactProductCard";
import { TeaGroupFilter } from "@/components/catalog/TeaGroupFilter";
import { useIndustryCatalogBrowser } from "@/components/catalog/useIndustryCatalogBrowser";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { ProductQuickViewCompact } from "@/components/mobile/ProductQuickViewCompact";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { CatalogV2ListResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";

function ListState({ children }: { children: string }) {
  return <div className="col-span-2 rounded-[24px] border border-dashed border-[#e7dccd] bg-white/70 px-5 py-8 text-center text-sm font-black text-slate-500">{children}</div>;
}

export function ProductHomeTea({ active = "home", initialCatalog }: { active?: AppNavKey; initialCatalog: CatalogV2ListResponse | null }) {
  const [selectedProduct, setSelectedProduct] = useState<CatalogV2VariantCard | null>(null);
  const catalog = useIndustryCatalogBrowser(initialCatalog);
  return (
    <MobilePageShell active={active} title="Bếp Sỉ F&B" subtitle={catalog.loading ? "Đang tải sản phẩm" : `${catalog.total} sản phẩm`}>
      <CatalogHero searchText={catalog.searchText} onSearchChange={catalog.setSearchText} />
      <div className="mt-4"><TeaGroupFilter industries={catalog.industries} groups={catalog.groups} industry={catalog.selectedIndustry} group={catalog.selectedGroup} showGroups={catalog.showGroupFilter} total={catalog.total} onIndustry={catalog.setSelectedIndustry} onGroup={catalog.setSelectedGroup} onReset={catalog.resetFilters} /></div>
      <div className="mt-4 grid grid-cols-2 items-stretch gap-3">
        {catalog.loading ? <ListState>Đang tải sản phẩm...</ListState> : null}
        {!catalog.loading && catalog.error && catalog.products.length === 0 ? <ListState>{catalog.error}</ListState> : null}
        {!catalog.loading && !catalog.error && catalog.products.length === 0 ? <ListState>Không có sản phẩm phù hợp</ListState> : null}
        {!catalog.loading ? catalog.products.map((product) => <CompactProductCard key={product.product_id} product={product} onOpen={() => setSelectedProduct(product)} />) : null}
      </div>
      {!catalog.loading && catalog.products.length > 0 ? <div className="mt-5 flex flex-col items-center gap-3"><p className="text-xs font-black text-slate-500">Đang hiển thị {catalog.shownCount}/{catalog.total} sản phẩm</p>{catalog.hasMore ? <button type="button" onClick={catalog.showMore} disabled={catalog.loadingMore} className="h-12 w-full rounded-[18px] bg-[#ff5a00] text-sm font-black text-white disabled:opacity-60">{catalog.loadingMore ? "Đang tải thêm..." : `Xem thêm ${Math.min(catalog.pageSize, catalog.total - catalog.shownCount)} sản phẩm`}</button> : null}</div> : null}
      {selectedProduct ? <ProductQuickViewCompact product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </MobilePageShell>
  );
}
