"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { fetchCatalogV2Detail } from "@/lib/catalog-v2-client";
import { getCatalogV2OptionSummary, getCatalogV2PriceLabel } from "@/lib/catalog-v2-display";
import { clearCartItems, getCartCount, getCartItemKey, readCartItems, removeCartItem, updateCartItemQuantity, type CartItem } from "@/lib/cartStorageV4";

type Line = { item: CartItem; variant: CatalogV2VariantCard | null };
const money = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

export function SelectionOrderCartPage() {
  const router = useRouter();
  const orderKeyRef = useRef<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setItems(readCartItems()), []);
  useEffect(() => {
    let active = true;
    void Promise.all(items.map(async (item) => {
      try {
        const detail = await fetchCatalogV2Detail(item.variantId);
        return { item, variant: detail.variants.find((candidate) => candidate.variant_id === item.variantId) || null };
      } catch {
        return { item, variant: null };
      }
    })).then((next) => { if (active) setLines(next); });
    return () => { active = false; };
  }, [items]);

  const count = useMemo(() => getCartCount(items), [items]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + (line.variant?.price || 0) * line.item.quantity, 0), [lines]);
  const canOrder = useMemo(
    () => items.length > 0 && lines.length === items.length && lines.every((line) => Boolean(line.variant?.isOrderable)),
    [items.length, lines],
  );

  function markCartChanged() {
    orderKeyRef.current = null;
    setError("");
  }

  async function setQuantity(item: CartItem, quantity: number) {
    const key = getCartItemKey(item);
    const previous = item.quantity;
    markCartChanged();
    setBusy(key);
    setItems(updateCartItemQuantity(item.variantId, item.selectionKey, quantity));
    try {
      const response = await fetch("/api/cart-v2/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant_id: item.variantId, quantity, selections: item.selections }),
      });
      if (!response.ok) {
        setItems(updateCartItemQuantity(item.variantId, item.selectionKey, previous));
        setError("Không thể cập nhật số lượng.");
      }
    } catch {
      setItems(updateCartItemQuantity(item.variantId, item.selectionKey, previous));
      setError("Không thể cập nhật số lượng.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: CartItem) {
    const key = getCartItemKey(item);
    markCartChanged();
    setBusy(key);
    const response = await fetch("/api/cart-v2/items/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variant_id: item.variantId, selectionKey: item.selectionKey }),
    }).catch(() => null);
    if (!response?.ok) setError("Không thể xóa sản phẩm.");
    else setItems(removeCartItem(item.variantId, item.selectionKey));
    setBusy(null);
  }

  async function clear() {
    markCartChanged();
    const responses = await Promise.all(items.map((item) => fetch("/api/cart-v2/items/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variant_id: item.variantId, selectionKey: item.selectionKey }),
    })));
    if (responses.some((response) => !response.ok)) {
      setError("Một số sản phẩm chưa thể xóa.");
      return;
    }
    clearCartItems();
    setItems([]);
  }

  async function placeOrder() {
    if (!canOrder || ordering) return;
    setOrdering(true);
    setError("");
    orderKeyRef.current ||= `bepsi-order-${window.crypto.randomUUID()}`;

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": orderKeyRef.current,
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            variant_id: item.variantId,
            quantity: item.quantity,
            selections: item.selections,
            selection_key: item.selectionKey,
          })),
        }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) {
        setError(data.message || "Không thể tạo đơn hàng. Vui lòng kiểm tra lại giỏ hàng.");
        return;
      }

      await Promise.allSettled(items.map((item) => fetch("/api/cart-v2/items/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant_id: item.variantId, selectionKey: item.selectionKey }),
      })));
      clearCartItems();
      setItems([]);
      router.push("/orders");
      router.refresh();
    } catch {
      setError("Không thể kết nối hệ thống đặt hàng. Vui lòng thử lại.");
    } finally {
      setOrdering(false);
    }
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
            <div className="mt-3 flex gap-2"><div className="grid h-10 flex-1 grid-cols-3 overflow-hidden rounded-[14px] border border-[#eee7dc]"><button disabled={syncing || ordering || line.item.quantity <= 1} onClick={() => void setQuantity(line.item, line.item.quantity - 1)}>−</button><span className="grid place-items-center border-x border-[#eee7dc]">{syncing ? "…" : line.item.quantity}</span><button disabled={syncing || ordering || !line.variant?.isOrderable} onClick={() => void setQuantity(line.item, line.item.quantity + 1)}>+</button></div><button disabled={syncing || ordering} onClick={() => void remove(line.item)} className="h-10 rounded-[14px] bg-slate-100 px-4 text-sm font-black">Xóa</button></div>
          </article>;
        })}
      </div>
      {items.length ? <section className="mt-4 rounded-[24px] bg-white p-5 ring-1 ring-[#eee7dc]"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-slate-400">Tạm tính</p><p className="mt-1 text-2xl font-black text-[#ff5a00]">{money(total)}</p></div><button disabled={ordering} onClick={() => void clear()} className="text-sm font-black text-slate-500">Xóa giỏ</button></div><button type="button" disabled={!canOrder || ordering || Boolean(busy)} onClick={() => void placeOrder()} className="mt-4 h-[52px] w-full rounded-[18px] bg-[#0b1220] px-5 py-3 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{ordering ? "Đang tạo đơn…" : "Đặt hàng"}</button></section> : null}
    </ResponsivePageShell>
  );
}
