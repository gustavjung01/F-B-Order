"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

type OrderStatus = "pending" | "confirmed" | "processing" | "shipping" | "completed" | "cancelled" | "rejected";

type CustomerOrder = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  customerNote: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productId: string | null;
    sku: string;
    name: string;
    unit: string;
    productType: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    snapshotVersion: number;
  }>;
};

type OrdersResponse = {
  orders?: CustomerOrder[];
  total?: number;
  mode?: "static";
  error?: string;
  message?: string;
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

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);
  const [staticMode, setStaticMode] = useState(false);

  async function loadOrders() {
    setLoading(true);
    setError("");
    setUnauthenticated(false);
    setProfileRequired(false);

    try {
      const response = await fetch("/api/orders?limit=50", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as OrdersResponse;
      if (response.status === 401 || data.error === "AUTH_REQUIRED") {
        setUnauthenticated(true);
        setOrders([]);
        return;
      }
      if (response.status === 403 && data.error === "CUSTOMER_PROFILE_REQUIRED") {
        setProfileRequired(true);
        setOrders([]);
        return;
      }
      if (!response.ok) {
        setError(data.message || data.error || "Không tải được đơn hàng từ backend");
        setOrders([]);
        return;
      }
      setStaticMode(data.mode === "static");
      setOrders(data.orders || []);
    } catch {
      setError("Không kết nối được backend. Không dùng dữ liệu tĩnh thay thế.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  const orderCount = useMemo(() => orders.length, [orders]);

  return (
    <ResponsivePageShell active="account" title="Đơn hàng của tôi" subtitle={orderCount > 0 ? `${orderCount} order backend` : "Theo dõi đơn đã commit"}>
      <section className="rounded-[26px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Lịch sử backend</p>
        <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Chỉ hiển thị đơn đã commit</h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:text-base">Trạng thái sử dụng cùng state machine với admin.</p>
      </section>

      {loading ? <p className="mt-4 rounded-[24px] bg-white p-5 font-black text-slate-600 ring-1 ring-[#eee7dc]">Đang tải đơn hàng...</p> : null}
      {!loading && staticMode ? <p className="mt-4 rounded-[20px] bg-slate-100 p-4 text-sm font-black text-slate-700">Static mode không có order thật.</p> : null}

      {!loading && unauthenticated ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-[#efe7dc]">
          <h2 className="text-[24px] font-black">Cần đăng nhập để xem đơn</h2>
          <SignInButton mode="modal"><button type="button" className="mt-5 h-12 w-full rounded-[18px] bg-[#0b1220] px-5 text-[15px] font-black text-white">Đăng nhập</button></SignInButton>
        </section>
      ) : null}

      {!loading && profileRequired ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-[#efe7dc]">
          <h2 className="text-[24px] font-black">Chưa có customer profile</h2>
          <p className="mt-2 text-sm font-bold text-slate-600">Backend chưa map tài khoản Clerk với hồ sơ quán.</p>
          <Link href="/register" className="mt-5 inline-flex rounded-[18px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Tạo hồ sơ</Link>
        </section>
      ) : null}

      {!loading && error ? <p className="mt-4 rounded-[20px] bg-red-50 p-4 text-[14px] font-black text-red-700 ring-1 ring-red-100">{error}</p> : null}

      {!loading && !staticMode && !unauthenticated && !profileRequired && !error && orders.length === 0 ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-[#efe7dc]">
          <h2 className="text-[24px] font-black">Chưa có đơn nào</h2>
          <p className="mt-2 text-sm font-bold text-slate-600">Order chỉ xuất hiện sau khi backend transaction commit.</p>
          <Link href="/products" className="mt-5 inline-flex rounded-[18px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Xem sản phẩm</Link>
        </section>
      ) : null}

      <div className="mt-4 space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="overflow-hidden rounded-[26px] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[12px] font-black ring-1 ${statusTone[order.status]}`}>{statusLabel[order.status]}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-black text-slate-600 ring-1 ring-slate-200">{formatDate(order.createdAt)}</span>
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[21px] font-black tracking-tight text-[#0b1220]">{order.orderCode}</h2>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-400">{order.id}</p>
                </div>
                <p className="text-right text-[20px] font-black text-[#ff5a00]">{formatMoney(order.totalAmount, order.currency)}</p>
              </div>
            </div>

            <div className="divide-y divide-[#eee7dc] border-t border-[#eee7dc] bg-[#fbfaf7]">
              {order.items.map((item) => (
                <div key={item.id} className="grid gap-1 px-4 py-3 text-[13px] font-bold text-slate-600">
                  <div className="flex justify-between gap-3">
                    <p className="font-black text-[#0b1220]">{item.name}</p>
                    <p className="shrink-0 font-black text-[#ff5a00]">{formatMoney(Number(item.lineTotal), order.currency)}</p>
                  </div>
                  <p>{item.sku} · {item.unit} · SL {item.quantity}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </ResponsivePageShell>
  );
}
