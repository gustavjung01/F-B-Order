"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OrderStatus = "pending" | "confirmed" | "processing" | "shipping" | "completed" | "cancelled" | "rejected";

type CustomerOrder = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string | null;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
    unitPrice: number;
  }>;
};

type OrdersResponse = {
  orders?: CustomerOrder[];
  mode?: "static";
  error?: string;
  message?: string;
};

type FrequentProduct = {
  key: string;
  productId: string | null;
  sku: string;
  name: string;
  unit: string;
  orderCount: number;
  quantity: number;
  lastOrderedAt: string;
  lastUnitPrice: number;
  currency: string;
};

const statusLabel: Record<OrderStatus, string> = {
  pending: "Chờ xử lý",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  rejected: "Từ chối",
};

const statusTone: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-100",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  processing: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  shipping: "bg-sky-50 text-sky-700 ring-sky-100",
  completed: "bg-blue-50 text-blue-700 ring-blue-100",
  cancelled: "bg-red-50 text-red-700 ring-red-100",
  rejected: "bg-rose-50 text-rose-700 ring-rose-100",
};

function formatMoney(value: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function buildFrequentProducts(orders: CustomerOrder[]) {
  const products = new Map<string, FrequentProduct>();
  const eligibleOrders = orders.filter((order) => order.status !== "cancelled" && order.status !== "rejected");

  for (const order of eligibleOrders) {
    const countedInOrder = new Set<string>();
    for (const item of order.items || []) {
      const key = item.productId || item.sku;
      const current = products.get(key);
      const isNewer = !current || new Date(order.createdAt).getTime() > new Date(current.lastOrderedAt).getTime();

      products.set(key, {
        key,
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        orderCount: (current?.orderCount || 0) + (countedInOrder.has(key) ? 0 : 1),
        quantity: (current?.quantity || 0) + Number(item.quantity || 0),
        lastOrderedAt: isNewer ? order.createdAt : current?.lastOrderedAt || order.createdAt,
        lastUnitPrice: isNewer ? Number(item.unitPrice || 0) : current?.lastUnitPrice || Number(item.unitPrice || 0),
        currency: isNewer ? order.currency : current?.currency || order.currency,
      });
      countedInOrder.add(key);
    }
  }

  return Array.from(products.values())
    .sort((left, right) => {
      if (right.orderCount !== left.orderCount) return right.orderCount - left.orderCount;
      if (right.quantity !== left.quantity) return right.quantity - left.quantity;
      return new Date(right.lastOrderedAt).getTime() - new Date(left.lastOrderedAt).getTime();
    })
    .slice(0, 6);
}

export function AccountOrderInsights() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  async function loadOrders() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/orders?limit=20", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as OrdersResponse;

      if (response.status === 401 || response.status === 403 || payload.mode === "static") {
        setHidden(true);
        setOrders([]);
        return;
      }
      if (!response.ok) {
        setError(payload.message || payload.error || "Không tải được lịch sử mua hàng.");
        setOrders([]);
        return;
      }

      setHidden(false);
      setOrders(
        [...(payload.orders || [])].sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
    } catch {
      setError("Không tải được lịch sử mua hàng. Vui lòng thử lại.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  const recentOrders = useMemo(() => orders.slice(0, 3), [orders]);
  const frequentProducts = useMemo(() => buildFrequentProducts(orders), [orders]);

  if (hidden) return null;

  if (loading) {
    return (
      <section className="rounded-[22px] bg-white p-5 font-black text-slate-500 ring-1 ring-[#efe7dc]">
        Đang tải lịch sử mua hàng...
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[22px] bg-white p-5 ring-1 ring-[#efe7dc]">
        <p className="text-sm font-black text-red-700">{error}</p>
        <button type="button" onClick={() => void loadOrders()} className="mt-3 rounded-[14px] bg-[#0b1220] px-4 py-2.5 text-sm font-black text-white">
          Tải lại
        </button>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section className="rounded-[22px] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Lịch sử mua hàng</p>
        <h2 className="mt-2 text-xl font-black text-[#0b1220]">Chưa có đơn nào</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Đơn đầu tiên của bạn sẽ xuất hiện tại đây sau khi đặt hàng thành công.</p>
        <Link href="/products" className="mt-4 inline-flex rounded-[16px] bg-[#0b1220] px-4 py-3 text-sm font-black text-white">
          Xem sản phẩm
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Lịch sử mua hàng</p>
            <h2 className="mt-2 text-xl font-black text-[#0b1220]">Đơn gần đây</h2>
          </div>
          <Link href="/orders" className="shrink-0 text-sm font-black text-[#ff5a00]">Xem tất cả</Link>
        </div>

        <div className="mt-4 space-y-3">
          {recentOrders.map((order) => {
            const itemNames = order.items.slice(0, 2).map((item) => item.name);
            const remaining = Math.max(0, order.items.length - itemNames.length);
            return (
              <article key={order.id} className="rounded-[18px] bg-[#fbfaf7] p-4 ring-1 ring-[#eee7dc]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${statusTone[order.status]}`}>{statusLabel[order.status]}</span>
                      <span className="text-xs font-bold text-slate-500">{formatDate(order.createdAt)}</span>
                    </div>
                    <p className="mt-2 truncate text-base font-black text-[#0b1220]">{order.orderCode}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-500">
                      {itemNames.join(" · ")}{remaining > 0 ? ` · +${remaining} sản phẩm` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-base font-black text-[#ff5a00]">{formatMoney(order.totalAmount, order.currency)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {frequentProducts.length > 0 ? (
        <section className="rounded-[22px] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Mua nhanh hơn</p>
              <h2 className="mt-2 text-xl font-black text-[#0b1220]">Sản phẩm hay mua</h2>
            </div>
            <Link href="/products" className="shrink-0 text-sm font-black text-[#ff5a00]">Mở danh mục</Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {frequentProducts.map((product) => (
              <article key={product.key} className="rounded-[18px] bg-[#fbfaf7] p-4 ring-1 ring-[#eee7dc]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-black leading-5 text-[#0b1220]">{product.name}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{product.sku} · {product.unit}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fff3ea] px-2.5 py-1 text-[11px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">
                    {product.orderCount} đơn
                  </span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-xs font-bold text-slate-500">Đã mua {formatQuantity(product.quantity)} {product.unit}</p>
                  <p className="text-sm font-black text-[#0b1220]">{formatMoney(product.lastUnitPrice, product.currency)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
