"use client";

import Link from "next/link";
import { useCatalogBrowser } from "@/components/catalog/useCatalogBrowser";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import type { AppNavKey } from "@/components/navigation/app-navigation";
import type { PublicProduct } from "@/data/catalog/product-model";

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

function getProductEmoji(product: PublicProduct) {
  return categoryEmoji[product.categoryId] || categoryEmoji[product.subcategoryId || ""] || "📦";
}

function isUpdating(value: string | null | undefined) {
  return !value || value === "Đang cập nhật";
}

function DesktopProductCard({ product }: { product: PublicProduct }) {
  const detailHref = `/products/${product.slug}`;

  return (
    <article className="rounded-[30px] bg-white p-5 shadow-lg ring-1 ring-[#efe7dc]">
      <Link href={detailHref} className="grid h-40 place-items-center overflow-hidden rounded-[26px] bg-[#fff3ea] text-7xl">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : getProductEmoji(product)}
      </Link>
      {!isUpdating(product.brand) ? <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[#ff5a00]">{product.brand}</p> : null}
      <Link href={detailHref} className="mt-2 block min-h-14 text-xl font-black leading-tight text-[#0b1220] hover:text-[#ff5a00]">{product.name}</Link>
      <p className="mt-2 text-sm font-black text-slate-500">{product.categoryName}</p>
      <div className="mt-2 space-y-1 text-sm font-semibold text-slate-500">
        <p>Quy cách: <span className="font-black text-[#0b1220]">{product.packageSizeLabel}</span></p>
        <p>Đơn vị: <span className="font-black text-[#0b1220]">{product.unitLabel}</span></p>
      </div>
      {product.shortDescription ? <p className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-400">{product.shortDescription}</p> : null}
      <p className="mt-4 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{product.priceLabel}</p>
      <div className="mt-5 flex gap-2">
        <Link href={detailHref} className="flex-1 rounded-2xl bg-[#fbfaf7] px-4 py-3 text-center text-sm font-black ring-1 ring-[#eee7dc]">Chi tiết</Link>
        <span className="rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-black text-white">{product.orderLabel}</span>
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
          <h2 className="text-4xl font-black">{loading ? "Đang tải sản phẩm" : "Sản phẩm"}</h2>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-500 ring-1 ring-[#eee7dc]">Cùng catalog với PWA</span>
        </div>

        {loading ? <ProductGridState>Đang tải sản phẩm...</ProductGridState> : null}
        {!loading && error ? <ProductGridState>{error}</ProductGridState> : null}
        {!loading && !error && products.length === 0 ? <ProductGridState>Nhóm này đang cập nhật dữ liệu sản phẩm</ProductGridState> : null}
        {!loading && !error && products.length > 0 ? (
          <div className="grid grid-cols-4 gap-5">
            {products.map((product) => <DesktopProductCard key={product.id} product={product} />)}
          </div>
        ) : null}
      </section>
    </main>
  );
}
