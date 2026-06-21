"use client";

import Link from "next/link";
import { useCatalogBrowser } from "@/components/catalog/useCatalogBrowser";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { PublicCatalogItem } from "@/data/catalog/product-model";

const categoryEmoji: Record<string, string> = {
  all: "▦",
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
  "thuc-pham-dong-lanh": "❄️",
  "combo-cong-thuc": "📦",
  topping: "🧊",
};

const categoryTones: Record<string, string> = {
  all: "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]",
  "tra-sua-pha-che": "bg-[#eefbf6] text-[#08775f] ring-[#b9eadb]",
  "mi-cay-han-quoc": "bg-[#fff0ef] text-[#dc2626] ring-[#ffc9c3]",
  "thuc-pham-dong-lanh": "bg-[#eef6ff] text-[#2563eb] ring-[#c7ddff]",
  "combo-cong-thuc": "bg-[#f4efff] text-[#7c3aed] ring-[#dccbff]",
};

function getTabTone(id: string) {
  return categoryTones[id] || "bg-white text-slate-600 ring-[#eee7dc]";
}

function getItemEmoji(item: PublicCatalogItem) {
  return categoryEmoji[item.categoryId] || categoryEmoji[item.subcategoryId || ""] || "📦";
}

function isUpdating(value: string | null | undefined) {
  return !value || value === "Đang cập nhật";
}

function DesktopCatalogCard({ item }: { item: PublicCatalogItem }) {
  const isProduct = item.itemKind === "product";
  const detailHref = isProduct ? `/products/${item.slug}` : null;

  return (
    <article className="rounded-[30px] bg-white p-5 shadow-lg ring-1 ring-[#efe7dc]">
      {detailHref ? (
        <Link href={detailHref} className="grid h-40 place-items-center overflow-hidden rounded-[26px] bg-[#fff3ea] text-7xl">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : getItemEmoji(item)}
        </Link>
      ) : (
        <div className="grid h-40 place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] to-[#f4efff] text-7xl">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : getItemEmoji(item)}
        </div>
      )}

      {!isUpdating(item.brand) ? <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[#ff5a00]">{item.brand}</p> : null}
      {detailHref ? (
        <Link href={detailHref} className="mt-2 block min-h-14 text-xl font-black leading-tight text-[#0b1220] hover:text-[#ff5a00]">{item.name}</Link>
      ) : (
        <h3 className="mt-2 min-h-14 text-xl font-black leading-tight text-[#0b1220]">{item.name}</h3>
      )}
      <p className="mt-2 text-sm font-black text-slate-500">{item.categoryName}</p>

      {isProduct ? (
        <div className="mt-2 space-y-1 text-sm font-semibold text-slate-500">
          <p>Quy cách: <span className="font-black text-[#0b1220]">{item.packageSizeLabel}</span></p>
          <p>Đơn vị: <span className="font-black text-[#0b1220]">{item.unitLabel}</span></p>
        </div>
      ) : (
        <p className="mt-3 inline-flex rounded-full bg-[#f4efff] px-3 py-2 text-sm font-black text-[#7c3aed] ring-1 ring-[#dccbff]">Combo gợi ý</p>
      )}

      {item.shortDescription ? <p className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-400">{item.shortDescription}</p> : null}
      {isProduct ? <p className="mt-4 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{item.priceLabel}</p> : null}

      <div className="mt-5 flex gap-2">
        {detailHref ? (
          <Link href={detailHref} className="flex-1 rounded-2xl bg-[#fbfaf7] px-4 py-3 text-center text-sm font-black ring-1 ring-[#eee7dc]">Chi tiết</Link>
        ) : (
          <span className="flex-1 rounded-2xl bg-[#f4efff] px-4 py-3 text-center text-sm font-black text-[#7c3aed] ring-1 ring-[#dccbff]">Gợi ý triển khai menu</span>
        )}
        <span className="rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-black text-white">{item.orderLabel}</span>
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
    items,
    tabs,
    selectedCategory,
    setSelectedCategory,
    searchText,
    setSearchText,
    loading,
    error,
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
              placeholder="Tìm trà, bột sữa, topping..."
              className="h-14 w-full rounded-[20px] border border-white/80 bg-white/95 px-5 text-base font-bold shadow-lg outline-none placeholder:text-slate-400 focus:border-[#ff5a00]"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-6">
        <div className="flex flex-wrap gap-3">
          {tabs.map((tab) => {
            const selected = tab.id === selectedCategory;
            const empty = tab.id !== "all" && tab.productCount === 0;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedCategory(tab.id)}
                className={`inline-flex items-center gap-2 rounded-[16px] px-4 py-3 text-sm font-black shadow-sm ring-1 transition ${selected ? "bg-[#ff5a00] text-white ring-[#ff5a00] shadow-[0_8px_16px_rgba(255,90,0,0.18)]" : empty ? "bg-white text-slate-400 ring-[#eee7dc]" : getTabTone(tab.id)}`}
              >
                <span className="text-lg leading-none">{categoryEmoji[tab.id] || "▦"}</span>
                <span>{tab.name}</span>
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs">{tab.productCount}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-14">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-4xl font-black">{loading ? "Đang tải catalog" : "Catalog"}</h2>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-500 ring-1 ring-[#eee7dc]">Cùng dữ liệu với PWA</span>
        </div>

        {loading ? <ProductGridState>Đang tải catalog...</ProductGridState> : null}
        {!loading && error ? <ProductGridState>{error}</ProductGridState> : null}
        {!loading && !error && items.length === 0 ? <ProductGridState>Nhóm này đang cập nhật dữ liệu</ProductGridState> : null}
        {!loading && !error && items.length > 0 ? (
          <div className="grid grid-cols-4 gap-5">
            {items.map((item) => <DesktopCatalogCard key={`${item.itemKind}-${item.id}`} item={item} />)}
          </div>
        ) : null}
      </section>
    </main>
  );
}
