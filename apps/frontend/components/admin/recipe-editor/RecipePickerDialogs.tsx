"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { adminApiFetch } from "@/lib/admin-api";
import type { CatalogOption, MediaPickerItem } from "./types";
import { catalogLabel } from "./types";

export function RecipeCatalogPickerDialog({
  open,
  ingredientLabel,
  onClose,
  onSelect,
}: {
  open: boolean;
  ingredientLabel: string;
  onClose: () => void;
  onSelect: (option: CatalogOption) => void;
}) {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery(ingredientLabel);
    setItems([]);
    setError("");
  }, [open, ingredientLabel]);

  async function search() {
    const value = query.trim();
    if (value.length < 2) {
      setError("Nhập ít nhất 2 ký tự để tìm catalog.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Bạn cần đăng nhập admin.");
      const result = await adminApiFetch<{ items: CatalogOption[] }>(`/api/admin/recipes/catalog-options?q=${encodeURIComponent(value)}&limit=24`, token);
      setItems(result.items || []);
      if (!result.items?.length) setError("Không tìm thấy SKU phù hợp.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tìm được catalog.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/70 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Chọn SKU catalog" className="flex max-h-[min(760px,92vh)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white text-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 md:p-5">
          <div><p className="text-xs font-black uppercase tracking-[0.15em] text-orange-600">Catalog picker</p><h3 className="mt-1 text-xl font-black">Chọn sản phẩm hoặc SKU</h3><p className="mt-1 text-sm font-bold text-slate-500">Kết quả hiển thị trong dialog, không làm card nguyên liệu dài ra.</p></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl font-black">×</button>
        </header>
        <div className="border-b border-slate-200 p-4">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Tên sản phẩm, biến thể hoặc SKU" className="h-12 rounded-2xl bg-slate-100 px-4 font-bold" />
            <button type="button" disabled={loading} onClick={() => void search()} className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? "Đang tìm..." : "Tìm catalog"}</button>
          </div>
          {error ? <p role="alert" className="mt-2 text-sm font-bold text-red-700">{error}</p> : null}
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {items.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((option) => (
            <button key={option.variantId} type="button" onClick={() => onSelect(option)} className="group rounded-2xl bg-slate-50 p-3 text-left ring-1 ring-slate-200 transition hover:bg-orange-50 hover:ring-orange-300">
              <div className="grid h-32 place-items-center rounded-xl bg-white">{option.imageUrl ? <img src={option.imageUrl} alt="" className="h-28 w-full object-contain" /> : <span className="text-xs font-black text-slate-400">Sản phẩm chưa có ảnh</span>}</div>
              <p className="mt-3 text-sm font-black group-hover:text-orange-800">{catalogLabel(option)}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{option.brand || "Không thương hiệu"}{option.priceLabel ? ` · ${option.priceLabel}` : ""}</p>
            </button>
          ))}</div> : <div className="grid min-h-56 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-center text-sm font-black text-slate-400">Nhập từ khóa và bấm Tìm catalog.</div>}
        </div>
      </section>
    </div>
  );
}

export function RecipeMediaPickerDialog({
  open,
  items,
  onClose,
  onSelect,
  onClear,
}: {
  open: boolean;
  items: MediaPickerItem[];
  onClose: () => void;
  onSelect: (item: MediaPickerItem) => void;
  onClear: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/70 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Chọn ảnh minh họa" className="flex max-h-[min(720px,92vh)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white text-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 md:p-5">
          <div><p className="text-xs font-black uppercase tracking-[0.15em] text-orange-600">Media picker</p><h3 className="mt-1 text-xl font-black">Chọn ảnh minh họa</h3><p className="mt-1 text-sm font-bold text-slate-500">Ảnh bìa, ảnh SKU và ảnh đã upload đều có thumbnail trực quan.</p></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl font-black">×</button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          <div className="mb-4 flex justify-between gap-3"><p className="text-sm font-bold text-slate-500">{items.length} ảnh có thể dùng</p><button type="button" onClick={onClear} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-black text-red-700">Không dùng ảnh</button></div>
          {items.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => (
            <button key={item.id} type="button" onClick={() => onSelect(item)} className="group overflow-hidden rounded-2xl bg-slate-50 text-left ring-1 ring-slate-200 transition hover:ring-orange-300">
              <img src={item.thumbnailUrl || item.imageUrl} alt="" className="h-40 w-full bg-white object-contain" />
              <div className="p-3"><p className="truncate text-sm font-black group-hover:text-orange-800">{item.label}</p><p className="mt-1 text-xs font-bold uppercase text-slate-500">{item.source === "ingredient" ? "Ảnh SKU" : item.source === "cover" ? "Ảnh bìa" : "Ảnh bước"}</p></div>
            </button>
          ))}</div> : <div className="grid min-h-56 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-center text-sm font-black text-slate-400">Chưa có media. Upload ảnh hoặc liên kết SKU trước.</div>}
        </div>
      </section>
    </div>
  );
}
