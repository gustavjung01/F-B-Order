"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import type { PublicProduct } from "@/data/catalog/product-model";
import {
  getProductDisplayPackage,
  getProductDisplayUnit,
  getProductPriceLabel,
} from "@/lib/catalog-display";
import {
  CART_UPDATED_EVENT,
  clearCartItems,
  getCartCount,
  readCartItems,
  removeCartItem,
  updateCartItemQuantity,
  type CartItem,
} from "@/lib/cartStorage";
import { getFrontendDataMode } from "@/lib/data-mode";

type ValidatedCartItem = {
  productId: string;
  quantity: number;
  product: PublicProduct | null;
  quantityValid: boolean;
  canOrder: boolean;
  lineTotal: number | null;
  errors: string[];
};

type CartValidationResponse = {
  items?: ValidatedCartItem[];
  canCheckout?: boolean;
  totalPreview?: number | null;
  currency?: "VND";
  approvalStatus?: "pending" | "approved" | "rejected";
  accountStatus?: string;
  error?: string;
  message?: string;
};

type CreateOrderResponse = {
  order?: {
    id: string;
    orderCode: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  };
  replayed?: boolean;
  error?: string;
  message?: string;
  details?: unknown;
};

const categoryEmoji: Record<string, string> = {
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
  "thuc-pham-dong-lanh": "❄️",
  "combo-cong-thuc": "📦",
};

function formatMoney(value: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function validationErrorMessage(code: string) {
  if (code === "AUTH_REQUIRED") return "Bạn cần đăng nhập trước khi kiểm tra giỏ hàng.";
  if (code === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi đặt hàng.";
  if (code === "CUSTOMER_PENDING") return "Hồ sơ quán đang chờ admin duyệt.";
  if (code === "CUSTOMER_REJECTED") return "Hồ sơ quán đã bị từ chối. Vui lòng cập nhật hồ sơ.";
  if (code === "PRODUCT_NOT_FOUND") return "Sản phẩm không còn tồn tại.";
  if (code === "MINIMUM_ORDER_QUANTITY_NOT_MET") return "Số lượng chưa đạt mức tối thiểu.";
  if (code === "PRODUCT_NOT_ORDERABLE") return "Sản phẩm hiện không đủ điều kiện đặt hàng.";
  if (code === "STATIC_MODE_ORDER_DISABLED") return "Deployment này đang chạy catalog tĩnh nên không tạo order thật.";
  return "Backend chưa xác nhận được giỏ hàng.";
}

function orderErrorMessage(data: CreateOrderResponse, status: number) {
  const code = data.error || "";
  if (status === 401 || code === "AUTH_REQUIRED") return "Bạn cần đăng nhập trước khi gửi đơn.";
  if (code === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi gửi đơn.";
  if (code === "CUSTOMER_PENDING") return "Hồ sơ quán đang chờ duyệt nên chưa thể gửi đơn.";
  if (code === "CUSTOMER_REJECTED") return "Hồ sơ quán đã bị từ chối nên chưa thể gửi đơn.";
  if (code === "MINIMUM_ORDER_QUANTITY_NOT_MET") return "Có sản phẩm chưa đạt số lượng tối thiểu.";
  if (code === "PRODUCT_NOT_ORDERABLE" || code === "PRICE_UNAVAILABLE") return "Có sản phẩm không còn đặt được. Hãy tải lại giỏ.";
  if (code === "IDEMPOTENCY_KEY_REUSED") return "Yêu cầu gửi đơn bị trùng nhưng nội dung đã thay đổi. Hãy tải lại giỏ.";
  if (code === "STATIC_MODE_ORDER_DISABLED") return "Deployment này đang chạy catalog tĩnh nên không tạo order thật.";
  return data.message || "Backend chưa commit được đơn. Vui lòng thử lại.";
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `checkout-${crypto.randomUUID()}`;
  }
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CartPage() {
  const mode = getFrontendDataMode();
  const [storedItems, setStoredItems] = useState<CartItem[]>([]);
  const [validatedItems, setValidatedItems] = useState<ValidatedCartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [canCheckout, setCanCheckout] = useState(false);
  const [totalPreview, setTotalPreview] = useState<number | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<CreateOrderResponse["order"] | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const refreshStoredCart = useCallback(() => {
    setStoredItems(readCartItems());
    setLoaded(true);
  }, []);

  useEffect(() => {
    refreshStoredCart();
    function handleStorage(event: StorageEvent) {
      if (!event.key || event.key === "bep_si_fb_cart_items_v2") refreshStoredCart();
    }
    window.addEventListener(CART_UPDATED_EVENT, refreshStoredCart);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, refreshStoredCart);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshStoredCart]);

  const validate = useCallback(async (items: CartItem[]) => {
    if (mode === "static" || items.length === 0) {
      setValidatedItems([]);
      setCanCheckout(false);
      setTotalPreview(null);
      setValidationError(mode === "static" && items.length > 0 ? validationErrorMessage("STATIC_MODE_ORDER_DISABLED") : "");
      setValidating(false);
      return;
    }

    setValidating(true);
    setValidationError("");
    setUnauthenticated(false);
    try {
      const response = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as CartValidationResponse;
      if (response.status === 401) {
        setUnauthenticated(true);
        setValidatedItems([]);
        setCanCheckout(false);
        setTotalPreview(null);
        return;
      }
      if (!response.ok) {
        setValidatedItems([]);
        setCanCheckout(false);
        setTotalPreview(null);
        setValidationError(validationErrorMessage(data.error || ""));
        return;
      }
      setValidatedItems(data.items || []);
      setCanCheckout(Boolean(data.canCheckout));
      setTotalPreview(data.totalPreview ?? null);
      setApprovalStatus(data.approvalStatus || null);
    } catch {
      setValidatedItems([]);
      setCanCheckout(false);
      setTotalPreview(null);
      setValidationError("Không kết nối được backend để xác nhận giỏ hàng. Không có fallback sang catalog tĩnh.");
    } finally {
      setValidating(false);
    }
  }, [mode]);

  useEffect(() => {
    idempotencyKeyRef.current = null;
    setCreatedOrder(null);
    setSubmitError("");
    const timer = window.setTimeout(() => void validate(storedItems), 120);
    return () => window.clearTimeout(timer);
  }, [storedItems, validate]);

  const itemCount = useMemo(() => getCartCount(storedItems), [storedItems]);

  function changeQuantity(item: CartItem, nextQuantity: number) {
    setStoredItems(updateCartItemQuantity(item.productId, nextQuantity));
  }

  function removeItemById(productId: string) {
    setStoredItems(removeCartItem(productId));
  }

  function clearCart() {
    if (!storedItems.length || !window.confirm("Xóa toàn bộ giỏ hàng hiện tại?")) return;
    clearCartItems();
    setStoredItems([]);
  }

  async function submitOrder() {
    if (!canCheckout || submitting || mode !== "backend") return;
    setSubmitting(true);
    setSubmitError("");
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          items: storedItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CreateOrderResponse;
      if (!response.ok || !data.order?.id) {
        setSubmitError(orderErrorMessage(data, response.status));
        return;
      }

      clearCartItems();
      setStoredItems([]);
      setValidatedItems([]);
      setCanCheckout(false);
      setTotalPreview(null);
      setCreatedOrder(data.order);
      idempotencyKeyRef.current = null;
    } catch {
      setSubmitError("Không xác nhận được backend đã commit đơn. Hãy bấm lại để dùng cùng idempotency key.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsivePageShell active="cart" title="Giỏ hàng" subtitle={itemCount > 0 ? `${itemCount} sản phẩm` : "Giỏ hàng backend-validated"}>
      <section className="rounded-[26px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Nguồn dữ liệu: {mode}</p>
        <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Giá cuối cùng do backend xác nhận</h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:text-base">Giỏ chỉ lưu product ID và số lượng. Tên, giá, SKU, đơn vị và orderability được query lại trước checkout.</p>
      </section>

      {createdOrder ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#b9eadb] md:p-8">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-[#e9fbf2] text-[34px]">✓</div>
          <p className="mt-5 text-[12px] font-black uppercase tracking-[0.16em] text-[#08775f]">Backend đã commit</p>
          <h2 className="mt-3 text-[26px] font-black">{createdOrder.orderCode}</h2>
          <p className="mt-2 text-sm font-bold text-slate-600">Order ID: {createdOrder.id}</p>
          <p className="mt-1 text-sm font-bold text-slate-600">Tổng backend: {formatMoney(createdOrder.totalAmount)}</p>
          <Link href="/orders" className="mt-5 inline-flex rounded-[16px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Xem đơn đã tạo</Link>
        </section>
      ) : null}

      {!loaded || validating ? <p className="mt-4 rounded-[24px] bg-white p-5 font-black text-slate-600 ring-1 ring-[#eee7dc]">Đang xác nhận giỏ với backend...</p> : null}

      {unauthenticated ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-[#efe7dc]">
          <h2 className="text-xl font-black">Cần đăng nhập</h2>
          <p className="mt-2 text-sm font-bold text-slate-600">Backend cần Clerk identity để trả giá và quyền đặt hàng.</p>
          <SignInButton mode="modal"><button type="button" className="mt-4 rounded-[16px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Đăng nhập</button></SignInButton>
        </section>
      ) : null}

      {validationError ? <p className="mt-4 rounded-[20px] bg-red-50 p-4 text-sm font-black text-red-700 ring-1 ring-red-100">{validationError}</p> : null}
      {submitError ? <p className="mt-4 rounded-[20px] bg-red-50 p-4 text-sm font-black text-red-700 ring-1 ring-red-100">{submitError}</p> : null}

      {loaded && storedItems.length === 0 && !createdOrder ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-[#efe7dc]">
          <h2 className="text-[24px] font-black">Giỏ hàng đang trống</h2>
          <Link href="/products" className="mt-5 inline-flex rounded-[18px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Xem sản phẩm</Link>
        </section>
      ) : null}

      {validatedItems.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {validatedItems.map((item) => {
            const product = item.product;
            const stored = storedItems.find((storedItem) => storedItem.productId === item.productId);
            if (!stored) return null;
            return (
              <article key={item.productId} className={`rounded-[26px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ${item.canOrder ? "ring-[#b9eadb]" : "ring-red-200"}`}>
                {product ? (
                  <div className="flex gap-3">
                    <div className="grid h-[82px] w-[86px] shrink-0 place-items-center overflow-hidden rounded-[22px] bg-[#fff3ea] text-[42px]">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : categoryEmoji[product.categoryId] || "📦"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[18px] font-black leading-tight">{product.name}</h2>
                      <p className="mt-1 text-xs font-bold text-slate-500">{product.sku || "Chưa có SKU"} · {getProductDisplayUnit(product)}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{getProductDisplayPackage(product)}</p>
                      <p className="mt-2 text-sm font-black text-[#ff5a00]">{getProductPriceLabel(product)}</p>
                      {item.lineTotal !== null ? <p className="mt-1 text-lg font-black text-[#ff5a00]">{formatMoney(item.lineTotal)}</p> : null}
                    </div>
                  </div>
                ) : <p className="font-black text-red-700">Sản phẩm không còn tồn tại: {item.productId}</p>}

                <div className="mt-4 flex items-center gap-3">
                  <div className="grid h-11 flex-1 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] font-black md:max-w-[220px]">
                    <button type="button" onClick={() => changeQuantity(stored, stored.quantity - 1)} className="bg-white">−</button>
                    <span className="grid place-items-center border-x border-[#eee7dc]">{stored.quantity}</span>
                    <button type="button" onClick={() => changeQuantity(stored, stored.quantity + 1)} className="bg-white">+</button>
                  </div>
                  <button type="button" onClick={() => removeItemById(item.productId)} className="h-11 rounded-[16px] bg-slate-100 px-4 text-sm font-black">Xóa</button>
                </div>

                {product && !item.quantityValid ? <p className="mt-2 text-xs font-black text-red-600">Tối thiểu {product.minOrderQty}</p> : null}
                {item.errors.map((code) => <p key={code} className="mt-2 text-xs font-bold text-red-600">{validationErrorMessage(code)}</p>)}
              </article>
            );
          })}
        </div>
      ) : null}

      {storedItems.length > 0 ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Tạm tính backend</p>
              <p className="mt-1 text-2xl font-black text-[#ff5a00]">{totalPreview === null ? "Chưa khả dụng" : formatMoney(totalPreview)}</p>
              {approvalStatus ? <p className="mt-1 text-xs font-bold text-slate-500">Approval: {approvalStatus}</p> : null}
            </div>
            <button type="button" onClick={clearCart} className="text-sm font-black text-slate-500">Xóa giỏ</button>
          </div>
          <button type="button" onClick={() => void submitOrder()} disabled={!canCheckout || submitting || mode !== "backend"} className="mt-4 h-13 w-full rounded-[18px] bg-[#ff5a00] px-5 py-3 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {submitting ? "Backend đang tạo đơn..." : canCheckout ? "Tạo order backend" : "Chưa đủ điều kiện checkout"}
          </button>
        </section>
      ) : null}
    </ResponsivePageShell>
  );
}
