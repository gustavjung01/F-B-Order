"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import type {
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { fetchCatalogV2Detail } from "@/lib/catalog-v2-client";
import {
  getCatalogV2OptionSummary,
  getCatalogV2PriceLabel,
} from "@/lib/catalog-v2-display";
import {
  CART_STORAGE_KEY,
  CART_UPDATED_EVENT,
  clearCartItems,
  getCartCount,
  readCartItems,
  removeCartItem,
  updateCartItemQuantity,
  type CartItem,
} from "@/lib/cartStorage";

type HydratedCartLine = {
  item: CartItem;
  variant: CatalogV2VariantCard | null;
  error: string | null;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function syncErrorMessage(status: number, code?: string) {
  if (status === 401 || code === "AUTH_REQUIRED") return "Bạn cần đăng nhập để cập nhật giỏ hàng.";
  if (code === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi đặt hàng.";
  if (code === "CUSTOMER_NOT_APPROVED") return "Hồ sơ quán chưa được duyệt.";
  if (code === "MARKET_PRICE") return "Sản phẩm thời giá cần được báo giá riêng.";
  if (code === "DEALER_PRICE_UNAVAILABLE") return "Sản phẩm chưa có giá đại lý.";
  return "Không thể cập nhật giỏ hàng. Vui lòng thử lại.";
}

export default function CartPage() {
  const [storedItems, setStoredItems] = useState<CartItem[]>([]);
  const [lines, setLines] = useState<HydratedCartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [syncingVariantId, setSyncingVariantId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refreshStoredCart = useCallback(() => {
    setStoredItems(readCartItems());
    setLoaded(true);
  }, []);

  useEffect(() => {
    refreshStoredCart();
    function handleStorage(event: StorageEvent) {
      if (!event.key || event.key === CART_STORAGE_KEY) refreshStoredCart();
    }
    window.addEventListener(CART_UPDATED_EVENT, refreshStoredCart);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, refreshStoredCart);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshStoredCart]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      if (storedItems.length === 0) {
        setLines([]);
        setHydrating(false);
        return;
      }

      setHydrating(true);
      setError("");
      const nextLines = await Promise.all(storedItems.map(async (item): Promise<HydratedCartLine> => {
        try {
          const detail = await fetchCatalogV2Detail(item.variantId);
          const variant = detail.variants.find((candidate) => candidate.variant_id === item.variantId) || null;
          return { item, variant, error: variant ? null : "Sản phẩm này không còn được bán" };
        } catch {
          return { item, variant: null, error: "Không tải được thông tin sản phẩm" };
        }
      }));

      if (active) {
        setLines(nextLines);
        setHydrating(false);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [storedItems]);

  const itemCount = useMemo(() => getCartCount(storedItems), [storedItems]);
  const totalPreview = useMemo(
    () => lines.reduce((total, line) => {
      if (line.variant?.price === null || line.variant?.price === undefined) return total;
      return total + line.variant.price * line.item.quantity;
    }, 0),
    [lines],
  );
  const completePriceCount = useMemo(
    () => lines.filter((line) => line.variant?.price !== null && line.variant?.price !== undefined).length,
    [lines],
  );

  async function syncQuantity(item: CartItem, quantity: number) {
    const previousQuantity = item.quantity;
    const nextItems = updateCartItemQuantity(item.variantId, quantity);
    setStoredItems(nextItems);
    setSyncingVariantId(item.variantId);
    setError("");

    try {
      const response = await fetch("/api/cart-v2/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant_id: item.variantId, quantity }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStoredItems(updateCartItemQuantity(item.variantId, previousQuantity));
        setError(syncErrorMessage(response.status, data.error));
      }
    } catch {
      setStoredItems(updateCartItemQuantity(item.variantId, previousQuantity));
      setError("Không thể cập nhật số lượng. Vui lòng thử lại.");
    } finally {
      setSyncingVariantId(null);
    }
  }

  async function removeLine(variantId: string) {
    setSyncingVariantId(variantId);
    setError("");
    try {
      const response = await fetch(`/api/cart-v2/items/${encodeURIComponent(variantId)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(syncErrorMessage(response.status, data.error));
        return;
      }
      setStoredItems(removeCartItem(variantId));
    } catch {
      setError("Không thể xóa sản phẩm. Vui lòng thử lại.");
    } finally {
      setSyncingVariantId(null);
    }
  }

  async function clearCart() {
    if (!storedItems.length || !window.confirm("Xóa toàn bộ giỏ hàng hiện tại?")) return;
    setError("");
    const results = await Promise.all(storedItems.map((item) => (
      fetch(`/api/cart-v2/items/${encodeURIComponent(item.variantId)}`, { method: "DELETE" })
    )));
    if (results.some((response) => !response.ok)) {
      setError("Một số sản phẩm chưa thể xóa. Vui lòng thử lại.");
      return;
    }
    clearCartItems();
    setStoredItems([]);
  }

  return (
    <ResponsivePageShell active="cart" title="Giỏ hàng" subtitle={itemCount > 0 ? `${itemCount} sản phẩm` : "Chưa có sản phẩm"}>
      <section className="rounded-[26px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Đơn hàng của bạn</p>
        <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Kiểm tra sản phẩm trước khi đặt hàng</h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:text-base">Giá và tình trạng sản phẩm được cập nhật trực tiếp từ hệ thống.</p>
      </section>

      {error ? <p className="mt-4 rounded-[20px] bg-red-50 p-4 text-sm font-black text-red-700 ring-1 ring-red-100">{error}</p> : null}
      {!loaded || hydrating ? <p className="mt-4 rounded-[24px] bg-white p-5 font-black text-slate-600 ring-1 ring-[#eee7dc]">Đang cập nhật giỏ hàng...</p> : null}

      {loaded && storedItems.length === 0 ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-[#efe7dc]">
          <h2 className="text-[24px] font-black">Giỏ hàng đang trống</h2>
          <Link href="/" className="mt-5 inline-flex rounded-[18px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Tiếp tục mua hàng</Link>
        </section>
      ) : null}

      {lines.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {lines.map((line) => {
            const variant = line.variant;
            const syncing = syncingVariantId === line.item.variantId;
            return (
              <article key={line.item.variantId} className={`rounded-[26px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ${variant?.isOrderable ? "ring-[#b9eadb]" : "ring-red-200"}`}>
                {variant ? (
                  <div className="flex gap-3">
                    <Link href={`/products/${variant.variant_id}`} className="grid h-[92px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-[22px] bg-[#fff3ea] text-[42px]">
                      {variant.image.url ? <img src={variant.image.url} alt={variant.name} className="h-full w-full object-contain" /> : "📦"}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/products/${variant.variant_id}`} className="text-[18px] font-black leading-tight hover:text-[#ff5a00]">{variant.name}</Link>
                      <p className="mt-1 text-xs font-bold text-slate-500">Mã sản phẩm: {variant.sku}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{getCatalogV2OptionSummary(variant)}</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-[0.1em] text-[#ff5a00]">Giá đại lý</p>
                      <p className="mt-1 text-sm font-black text-[#ff5a00]">{getCatalogV2PriceLabel(variant)}</p>
                      {variant.price !== null ? <p className="mt-1 text-lg font-black text-[#ff5a00]">{formatMoney(variant.price * line.item.quantity)}</p> : null}
                    </div>
                  </div>
                ) : <p className="font-black text-red-700">{line.error || "Không tìm thấy thông tin sản phẩm"}</p>}

                <div className="mt-4 flex items-center gap-3">
                  <div className="grid h-11 flex-1 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] font-black md:max-w-[220px]">
                    <button type="button" disabled={syncing || line.item.quantity <= 1} onClick={() => void syncQuantity(line.item, line.item.quantity - 1)} className="bg-white disabled:text-slate-300">−</button>
                    <span className="grid place-items-center border-x border-[#eee7dc]">{syncing ? "…" : line.item.quantity}</span>
                    <button type="button" disabled={syncing || !variant?.isOrderable} onClick={() => void syncQuantity(line.item, line.item.quantity + 1)} className="bg-white disabled:text-slate-300">+</button>
                  </div>
                  <button type="button" disabled={syncing} onClick={() => void removeLine(line.item.variantId)} className="h-11 rounded-[16px] bg-slate-100 px-4 text-sm font-black disabled:text-slate-300">Xóa</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {storedItems.length > 0 ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Tạm tính theo giá đại lý</p>
              <p className="mt-1 text-2xl font-black text-[#ff5a00]">{completePriceCount === lines.length ? formatMoney(totalPreview) : "Có sản phẩm chưa có giá"}</p>
            </div>
            <button type="button" onClick={() => void clearCart()} className="text-sm font-black text-slate-500">Xóa giỏ</button>
          </div>
          <div className="mt-4 rounded-[18px] bg-[#fbfaf7] p-4 text-sm font-bold leading-6 text-slate-600 ring-1 ring-[#eee7dc]">
            Đơn hàng sẽ được xác nhận theo đúng sản phẩm, quy cách và số lượng đã chọn.
          </div>
          <button type="button" disabled className="mt-4 h-[52px] w-full cursor-not-allowed rounded-[18px] bg-slate-300 px-5 py-3 text-base font-black text-white">
            Đặt hàng trực tuyến đang được hoàn thiện
          </button>
        </section>
      ) : null}
    </ResponsivePageShell>
  );
}
