"use client";

import { CompactProductCard } from "@/components/catalog/CompactProductCard";
import { TeaGroupFilter } from "@/components/catalog/TeaGroupFilter";
import { useIndustryCatalogBrowser } from "@/components/catalog/useIndustryCatalogBrowser";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { CatalogV2ListResponse } from "@/data/catalog-v2/product-model";

export function DesktopHomeIndustry({ active = "home", initialCatalog }: { active?: AppNavKey; initialCatalog: CatalogV2ListResponse | null }) {
  const catalog = useIndustryCatalogBrowser(initialCatalog);
  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <DesktopHeader active={active} />
      <section className="mx-auto max-w-7xl px-8 py-8">
        <input value={catalog.searchText} onChange={(event) => catalog.setSearchText(event.target.value)} placeholder="Tìm tên sản phẩm, thương hiệu hoặc mã sản phẩm..." className="h-14 w-full rounded-[20px] bg-white px-5 text-base font-bold shadow-sm outline-none ring-1 ring-[#eee7dc]" />
        <div className="mt-4">
          <TeaGroupFilter industries={catalog.industries} groups={catalog.groups} industry={catalog.selectedIndustry} group={catalog.selectedGroup} showGroups={catalog.showGroupFilter} total={catalog.total} onIndustry={catalog.setSelectedIndustry} onGroup={catalog.setSelectedGroup} onReset={catalog.resetFilters} />
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-8 pb-14">
        {catalog.loading ? <p className="rounded-[24px] bg-white p-10 text-center font-black text-slate-500">Đang tải sản phẩm...</p> : null}
        {!catalog.loading && catalog.products.length === 0 ? <p className="rounded-[24px] bg-white p-10 text-center font-black text-slate-500">{catalog.error || "Không có sản phẩm phù hợp"}</p> : null}
        {!catalog.loading && catalog.products.length > 0 ? (
          <>
            <div className="grid grid-cols-4 gap-5">
              {catalog.products.map((product) => <CompactProductCard key={product.product_id} product={product} href={"/products/" + product.variant_id} desktop />)}
            </div>
            {catalog.hasMore ? <button type="button" onClick={catalog.showMore} disabled={catalog.loadingMore} className="mx-auto mt-8 block rounded-2xl bg-[#ff5a00] px-8 py-4 font-black text-white disabled:opacity-60">{catalog.loadingMore ? "Đang tải thêm..." : "Xem thêm sản phẩm"}</button> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
