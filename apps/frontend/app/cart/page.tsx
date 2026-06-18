"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import {
  CART_UPDATED_EVENT,
  clearCartItems,
  getCartCount,
  getCartTotal,
  readCartItems,
  removeCartItem,
  updateCartItemQuantity,
} from "@/lib/cartStorage";
import type { CartItem } from "@/lib/cartStorage";

const categoryEmoji: Record<string, string> = {
  "tra-sua": "🧋",
  "mi-cay": "🍜",
  topping: "🧊",
  "bao-bi": "🥡",
  combo: "📦",
};

type CreateOrderResponse = {
  order?: {
    id: string;
    orderCode: string;
    status: string;
    subtotal: number;
    submittedAt: string;
    itemCount: number;
  };
  error?: string;
  sku?: string;
  minQty?: number;
};

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function getItemKey(item: CartItem) {
  return item.productId || item.sku;
}

function getItemEmoji(item: CartItem) {
  return categoryEmoji[item.categorySlug] || "📦";
}

function getOrderErrorMessage(data: CreateOrderResponse, status: number) {
  if (status === 401 || data.error === "UNAUTHENTICATED") return "Bạn cần đăng nhập trước khi gửi đơn.";
  if (data.error === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi gửi đơn.";
  if (data.error === "CUSTOMER_NOT_APPROVED") return "Hồ sơ quán chưa được duyệt nên chưa thể gửi đơn.";
  if (data.error === "EMPTY_ORDER") return "Giỏ hàng đang trống.";
  if (data.error === "PRODUCT_NOT_FOUND_OR_INACTIVE") return "Có sản phẩm đã ngừng bán hoặc không còn hoạt động. Vui lòng tải lại catalog.";
  if (data.error === "QUANTITY_BELOW_MIN") return `Sản phẩm ${data.sku || "này"} cần tối thiểu ${data.minQty || 1}.`;
  return "Chưa gửi được đơn. Vui lòng thử lại.";
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdOrderCode, setCreatedOrderCode] = useState("");

  function refreshCart() {
    setItems(readCartItems());
    setLoaded(true);
  }

  useEffect(() => {
    refreshCart();

    function handleStorage(event: StorageEvent) {
      if (!event.key || event.key === "bep_si_fb_cart_items_v1") refreshCart();
    }

    window.addEventListener(CART_UPDATED_EVENT, refreshCart);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, refreshCart);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const itemCount = useMemo(() => getCartCount(items), [items]);
  const total = useMemo(() => getCartTotal(items), [items]);

  function changeQuantity(item: CartItem, nextQuantity: number) {
    setCreatedOrderCode("");
    setSubmitError("");
    setItems(updateCartItemQuantity(getItemKey(item), nextQuantity));
  }

  function removeItem(item: CartItem) {
    setCreatedOrderCode("");
    setSubmitError("");
    setItems(removeCartItem(getItemKey(item)));
  }

  function clearCart() {
    if (!items.length) return;
    if (!window.confirm("Xóa toàn bộ giỏ hàng hiện tại?")) return;
    clearCartItems();
    setItems([]);
    setSubmitError("");
    setCreatedOrderCode("");
  }

  async function submitOrder() {
    if (!items.length || submitting) return;

    setSubmitting(true);
    setSubmitError("");
    setCreatedOrderCode("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as CreateOrderResponse;

      if (!response.ok || !data.order) {
        setSubmitError(getOrderErrorMessage(data, response.status));
        return;
      }

      clearCartItems();
      setItems([]);
      setNote("");
      setCreatedOrderCode(data.order.orderCode);
    } catch (error) {
      setSubmitError("Không kết nối được máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsivePageShell active="cart" title="Giỏ hàng" subtitle={itemCount > 0 ? `${itemCount} món đang chọn` : "Chọn hàng trước khi gửi đơn"}>
      <section className="rounded-[26px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Đơn hàng tạm tính</p>
        <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Kiểm tra số lượng trước khi gửi đơn</h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:text-base">Đơn sẽ lưu vào hệ thống và chuyển sang trạng thái chờ sales xác nhận tồn kho, giá và lịch giao.</p>
      </section>

      {createdOrderCode ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#b9eadb] md:p-8">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-[#e9fbf2] text-[34px] shadow-inner">✓</div>
          <p className="mt-5 text-[12px] font-black uppercase tracking-[0.16em] text-[#08775f]">Đã gửi đơn</p>
          <h2 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-4xl">Mã đơn {createdOrderCode}</h2>
          <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600">Sales Bếp Sỉ F&B sẽ xác nhận lại đơn trước khi giao. Giỏ hàng đã được làm sạch để bạn tạo đơn mới.</p>
          <Link href="/" className="mt-5 flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)] md:inline-flex">
            Tiếp tục xem hàng
          </Link>
        </section>
      ) : null}

      {!loaded ? (
        <section className="mt-4 rounded-[26px] bg-white p-6 text-center text-[15px] font-black text-slate-500 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
          Đang tải giỏ hàng...
        </section>
      ) : null}

      {loaded && items.length === 0 && !createdOrderCode ? (
        <section className="mt-4 overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
          <div className="grid h-20 w-20 place-items-center rounded-[24px] bg-[#fff3ea] text-[42px] shadow-inner">🛒</div>
          <p className="mt-5 text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Giỏ hàng đang trống</p>
          <h2 className="mt-3 text-[27px] font-black leading-tight tracking-tight md:text-5xl">Chọn sản phẩm sỉ trước đã</h2>
          <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600 md:max-w-2xl md:text-base">Sản phẩm có giá sỉ mới thêm được vào giỏ. Khách chưa duyệt vẫn xem catalog, nhưng chưa đặt hàng.</p>
          <Link href="/" className="mt-5 flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)] md:inline-flex">
            Tiếp tục xem hàng
          </Link>
        </section>
      ) : null}

      {loaded && items.length > 0 ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {items.map((item) => {
              const itemKey = getItemKey(item);
              const minQty = Math.max(1, item.minOrderQty || 1);
              const lineTotal = item.price * item.quantity;

              return (
                <article key={itemKey} className="rounded-[26px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
                  <div className="flex gap-3">
                    <div className="grid h-[82px] w-[86px] shrink-0 place-items-center overflow-hidden rounded-[22px] bg-[#fff3ea] text-[46px] shadow-inner">
                      {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : getItemEmoji(item)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[18px] font-black leading-tight">{item.name}</h2>
                      <p className="mt-1 text-[13px] font-semibold text-slate-500">{item.unit}</p>
                      <p className="mt-2 text-[13px] font-bold text-slate-500">{formatVnd(item.price)} × {item.quantity}</p>
                      <p className="mt-1 text-[20px] font-black text-[#ff5a00]">{formatVnd(lineTotal)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <div className="grid h-11 flex-1 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] text-[16px] font-black text-[#0b1220] md:max-w-[220px]">
                      <button type="button" aria-label={`Giảm ${item.name}`} onClick={() => changeQuantity(item, item.quantity - 1)} className="bg-white active:bg-[#fff3ea]">−</button>
                      <span className="grid place-items-center border-x border-[#eee7dc]">{item.quantity}</span>
                      <button type="button" aria-label={`Tăng ${item.name}`} onClick={() => changeQuantity(item, item.quantity + 1)} className="bg-white active:bg-[#fff3ea]">+</button>
                    </div>
                    <button type="button" onClick={() => removeItem(item)} className="h-11 rounded-[16px] bg-[#fbfaf7] px-4 text-[13px] font-black text-slate-600 ring-1 ring-[#eee7dc]">
                      Xóa
                    </button>
                  </div>

                  {item.quantity <= minQty ? <p className="mt-2 text-[12px] font-bold text-slate-400">Tối thiểu {minQty}</p> : null}
                </article>
              );
            })}
          </div>

          <section className="mt-4 rounded-[26px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:max-w-xl">
            <label className="block text-[13px] font-black text-slate-600" htmlFor="order-note">Ghi chú cho sales</label>
            <textarea
              id="order-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ví dụ: giao buổi sáng, gọi trước khi đến..."
              className="mt-2 min-h-20 w-full resize-none rounded-[18px] bg-[#fbfaf7] px-4 py-3 text-[14px] font-semibold text-[#0b1220] outline-none ring-1 ring-[#eee7dc] placeholder:text-slate-400 focus:ring-[#ff5a00]"
            />
            <div className="mt-4 flex items-center justify-between text-[14px] font-bold text-slate-500"><span>Số lượng</span><span>{itemCount} món</span></div>
            <div className="mt-2 flex items-center justify-between text-[14px] font-bold text-slate-500"><span>Tạm tính</span><span>{formatVnd(total)}</span></div>
            <div className="mt-3 flex items-center justify-between text-[20px] font-black text-[#0b1220]"><span>Tổng dự kiến</span><span className="text-[#ff5a00]">{formatVnd(total)}</span></div>
            {submitError ? <p className="mt-3 rounded-[16px] bg-[#fff0ef] px-4 py-3 text-[13px] font-black text-[#dc2626] ring-1 ring-[#ffc9c3]">{submitError}</p> : null}
            <button type="button" onClick={submitOrder} disabled={submitting} className="mt-4 h-12 w-full rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Đang gửi đơn..." : "Gửi đơn cho sales xác nhận"}
            </button>
            <button type="button" onClick={clearCart} disabled={submitting} className="mt-3 h-11 w-full rounded-[16px] bg-[#fbfaf7] px-5 text-[14px] font-black text-slate-600 ring-1 ring-[#eee7dc] disabled:cursor-not-allowed disabled:opacity-60">Xóa toàn bộ giỏ</button>
          </section>
        </>
      ) : null}
    </ResponsivePageShell>
  );
}
