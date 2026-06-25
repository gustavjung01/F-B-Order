"use client";

import { CompactProductCard } from "@/components/catalog/CompactProductCard";
import { IndustryCatalogFilters } from "@/components/catalog/IndustryCatalogFilters";
import { useIndustryCatalogBrowser } from "@/components/catalog/useIndustryCatalogBrowser";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import type { AppNavKey } from "@/components/navigation/app-navigation";

function ProductGridState({ children }: { children: string }) {
  return <div className="rounded-[30px] border border-dashed border-[#e7dccd] bg-white/70 px-8 py-12 text-center text-lg font-black text-slate-500 shadow-sm">{children}</div>;
}

export function DesktopHomeIndustry({ active = "home" }: { active?: AppNavKey }) {
  const catalog = useIndustryCatalogBrowser();

  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <DesktopHeader active={active} />
      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="relative overflow-hidden rounded-[40px] bg-white shadow-lg ring-1 ring-white">
          <img src="/home/home-trang-chu.png" alt="Nguyên liệu F&B cho quán" className="block h-auto w-full object-contain" draggable={false} />
          <div className="absolute inset-x-10 bottom-8">
            <input value={catalog.searchText} onChange={(event) => catalog.setSearchText(event.target.value)} placeholder="Tìm tên sản phẩm, thương hiệu hoặc mã sản phẩm..." className="h-14 w-full rounded-[20px] border border-white/80 bg-white/95 px-5 text-base font-bold shadow-lg outline-none placeholder:text-slate-400 focus:border-[#ff5a00]" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-6">
        <IndustryCatalogFilters industries={catalog.industries} selectedIndustry={catalog.selectedIndustry} onIndustryChange={catalog.setSelectedIndustry} onReset={catalog.resetFilters} resultCount={catalog.total} />
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-14">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-4xl font-black">{catalog.loading ? "Đang tải sản phẩm" : `${catalog.total} sản phẩm`}</h2>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-500 ring-1 ring-[#eee7dc]">Lọc theo ngành nguyên liệu</span>
        </div>
        {catalog.loading ? <ProductGridState>Đang tải sản phẩm...</ProductGridState> : null}
        {!catalog.loading && catalog.error && catalog.products.length === 0 ? <ProductGridState>{catalog.error}</ProductGridState> : null}
        {!catalog.loading && !catalog.error && catalog.products.length === 0 ? <ProductGridState>Không có sản phẩm phù hợp</ProductGridState> : null}
        {!catalog.loading && catalog.products.length > 0 ? (
          <>
            <div className="grid grid-cols-4 gap-5">
              {catalog.products.map((product) => <CompactProductCard key={product.product_id} product={product} href={`/products/${product.variant_id}`} desktop />)}
            </div>
            <div className="mt-8 flex flex-col items-center gap-3">
              <p className="text-sm font-black text-slate-500">Đang hiển thị {catalog.shownCount}/{catalog.total} sản phẩm</p>
              {catalog.error ? <p className="text-center text-sm font-black text-red-600">{catalog.error}</p> : null}
              {catalog.hasMore ? <button type="button" onClick={catalog.showMore} disabled={catalog.loadingMore} className="rounded-2xl bg-[#ff5a00] px-8 py-4 text-base font-black text-white shadow-lg shadow-orange-200 disabled:opacity-60">{catalog.loadingMore ? "Đang tải thêm..." : `Xem thêm ${Math.min(catalog.pageSize, catalog.total - catalog.shownCount)} sản phẩm`}</button> : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
