"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { fetchCatalogV2Detail } from "@/lib/catalog-v2-client";
import { getCatalogV2OptionSummary, getCatalogV2PriceLabel } from "@/lib/catalog-v2-display";
import { clearCartItems, getCartCount, getCartItemKey, readCartItems, removeCartItem, updateCartItemQuantity, type CartItem } from "@/lib/cartStorageV4";

type Line = { item: CartItem; variant: CatalogV2VariantCard | null };
const money = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

export function SelectionCartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => setItems(readCartItems()), []);
  useEffect(() => {
    let active = true;
    void Promise.all(items.map(async (item) => {
      try {
        const detail = await fetchCatalogV2Detail(item.variantId);
        return { item, variant: detail.variants.find((candidate) => candidate.variant_id === item.variantId) || null };
      } catch { return { item, variant: null }; }
    })).then((next) => { if (active) setLines(next); });
    return () => { active = false; };
  }, [items]);

  const count = useMemo(() => getCartCount(items), [items]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + (line.variant?.price || 0) * line.item.quantity, 0), [lines]);

  async function setQuantity(item: CartItem, quantity: number) {
    const key = getCartItemKey(item);
    const previous = item.quantity;
    setBusy(key);
    setItems(updateCartItemQuantity(item.variantId, item.selectionKey, quantity));
    try {
      const response = await fetch("/api/cart-v2/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variant_id: item.variantId, quantity, selections: item.selections }) });
      if (!response.ok) {
        setItems(updateCartItemQuantity(item.variantId, item.selectionKey, previous));
        setError("Không thể cập nhật số lượng.");
      }
    } catch {
      setItems(updateCartItemQuantity(item.variantId, item.selectionKey, previous));
      setError("Không thể cập nhật số lượng.");
    } finally { setBusy(null); }
  }

  async function remove(item: CartItem) {
    const key = getCartItemKey(item);
    setBusy(key);
    const response = await fetch("/api/cart-v2/items/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variant_id: item.variantId, selectionKey: item.selectionKey }) }).catch(() => null);
    if (!response?.ok) setError("Không thể xóa sản phẩm.");
    else setItems(removeCartItem(item.variantId, item.selectionKey));
    setBusy(null);
  }

  async function clear() {
    const responses = await Promise.all(items.map((item) => fetch("/api/cart-v2/items/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variant_id: item.variantId, selectionKey: item.selectionKey }) })));
    if (responses.some((response) => !response.ok)) return setError("Một số sản phẩm chưa thể xóa.");
    clearCartItems();
    setItems([]);
  }

  return (
    <ResponsivePageShell active="cart" title="Giỏ hàng" subtitle={count ? `${count} sản phẩm` : "Chưa có sản phẩm"}>
      {error ? <p className="rounded-[16px] bg-red-50 p-3 text-sm font-black text-red-700">{error}</p> : null}
      {!items.length ? <section className="rounded-[24px] bg-white p-5 ring-1 ring-[#eee7dc]"><h1 className="text-2xl font-black">Giỏ hàng đang trống</h1><Link href="/" className="mt-4 inline-flex rounded-[16px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Tiếp tục mua hàng</Link></section> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {lines.map((line) => {
          const key = getCartItemKey(line.item);
          const syncing = busy === key;
          const flavor = Object.values(line.item.selections).join(" · ");
          return <article key={key} className="rounded-[24px] bg-white p-4 ring-1 ring-[#eee7dc]">
            {line.variant ? <div className="flex gap-3"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-[#fff3ea]">{line.variant.image.url ? <img src={line.variant.image.url} alt={line.variant.name} className="h-full w-full object-contain" /> : "📦"}</div><div className="min-w-0"><h2 className="font-black">{line.variant.name}</h2><p className="mt-1 text-xs font-bold text-slate-500">{getCatalogV2OptionSummary(line.variant)}</p>{flavor ? <p className="mt-1 text-xs font-black text-[#ff5a00]">Vị: {flavor}</p> : null}<p className="mt-2 text-sm font-black text-[#ff5a00]">{getCatalogV2PriceLabel(line.variant)}</p></div></div> : <p className="font-black text-red-700">Không tải được sản phẩm</p>}
            <div className="mt-3 flex gap-2"><div className="grid h-10 flex-1 grid-cols-3 overflow-hidden rounded-[14px] border border-[#eee7dc]"><button disabled={syncing || line.item.quantity <= 1} onClick={() => void setQuantity(line.item, line.item.quantity - 1)}>−</button><span className="grid place-items-center border-x border-[#eee7dc]">{syncing ? "…" : line.item.quantity}</span><button disabled={syncing || !line.variant?.isOrderable} onClick={() => void setQuantity(line.item, line.item.quantity + 1)}>+</button></div><button disabled={syncing} onClick={() => void remove(line.item)} className="h-10 rounded-[14px] bg-slate-100 px-4 text-sm font-black">Xóa</button></div>
          </article>;
        })}
      </div>
      {items.length ? <section className="mt-4 rounded-[24px] bg-white p-5 ring-1 ring-[#eee7dc]"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-slate-400">Tạm tính</p><p className="mt-1 text-2xl font-black text-[#ff5a00]">{money(total)}</p></div><button onClick={() => void clear()} className="text-sm font-black text-slate-500">Xóa giỏ</button></div></section> : null}
    </ResponsivePageShell>
  );
}
