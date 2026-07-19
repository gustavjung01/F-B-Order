"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import {
  AdminAlert,
  AdminButton,
  AdminDialog,
  AdminEmptyState,
  AdminInput,
  AdminToolbar,
} from "@/components/admin/ui/AdminUI";
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

  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      eyebrow="Catalog picker"
      title="Chọn sản phẩm hoặc SKU"
      description="Kết quả nằm trong dialog riêng, không làm card nguyên liệu dài ra."
      size="lg"
    >
      <div className="space-y-4">
        <AdminToolbar>
          <AdminInput
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}
            placeholder="Tên sản phẩm, biến thể hoặc SKU"
            className="md:flex-1"
          />
          <AdminButton tone="dark" disabled={loading} onClick={() => void search()}>{loading ? "Đang tìm…" : "Tìm catalog"}</AdminButton>
        </AdminToolbar>
        {error ? <AdminAlert tone="danger">{error}</AdminAlert> : null}
        {items.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((option) => (
              <button key={option.variantId} type="button" onClick={() => onSelect(option)} className="group rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-orange-100">
                <div className="grid h-32 place-items-center rounded-xl bg-slate-50">
                  {option.imageUrl ? <img src={option.imageUrl} alt="" className="h-28 w-full object-contain" /> : <span className="text-xs font-black text-slate-400">Sản phẩm chưa có ảnh</span>}
                </div>
                <p className="mt-3 text-sm font-black text-slate-900 group-hover:text-orange-700">{catalogLabel(option)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{option.brand || "Không thương hiệu"}{option.priceLabel ? ` · ${option.priceLabel}` : ""}</p>
              </button>
            ))}
          </div>
        ) : <AdminEmptyState title="Nhập từ khóa để tìm catalog" description="Có thể tìm theo tên sản phẩm, biến thể hoặc SKU." />}
      </div>
    </AdminDialog>
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
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      eyebrow="Media picker"
      title="Chọn ảnh minh họa"
      description="Ảnh bìa, ảnh SKU và ảnh upload đều hiển thị bằng thumbnail."
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-500">{items.length} ảnh có thể dùng</p>
          <AdminButton tone="danger" size="sm" onClick={onClear}>Không dùng ảnh</AdminButton>
        </div>
        {items.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <button key={item.id} type="button" onClick={() => onSelect(item)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-orange-100">
                <img src={item.thumbnailUrl || item.imageUrl} alt="" className="h-40 w-full bg-slate-50 object-contain" />
                <div className="p-3">
                  <p className="truncate text-sm font-black text-slate-900 group-hover:text-orange-700">{item.label}</p>
                  <p className="mt-1 text-xs font-bold uppercase text-slate-500">{item.source === "ingredient" ? "Ảnh SKU" : item.source === "cover" ? "Ảnh bìa" : "Ảnh bước"}</p>
                </div>
              </button>
            ))}
          </div>
        ) : <AdminEmptyState title="Chưa có media" description="Upload ảnh hoặc liên kết SKU trước khi chọn ảnh minh họa." />}
      </div>
    </AdminDialog>
  );
}
