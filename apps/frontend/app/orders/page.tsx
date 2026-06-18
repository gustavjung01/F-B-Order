"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

type OrderStatus = "draft" | "submitted" | "confirmed" | "fulfilled" | "cancelled";

type CustomerOrder = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  subtotal: number;
  note: string;
  submittedAt: string;
  confirmedAt: string | null;
  items: Array<{
    id: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

type OrdersResponse = {
  orders?: CustomerOrder[];
  profileRequired?: boolean;
  error?: string;
};

const statusLabel: Record<OrderStatus, string> = {
  draft: "Nháp",
  submitted: "Mới gửi",
  confirmed: "Đã xác nhận",
  fulfilled: "Đã giao",
  cancelled: "Đã hủy",
};

const statusTone: Record<OrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  submitted: "bg-orange-50 text-orange-700 ring-orange-100",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  fulfilled: "bg-blue-50 text-blue-700 ring-blue-100",
  cancelled: "bg-red-50 text-red-700 ring-red-100",
};

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
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
  const [profileRequired, setProfileRequired] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);

  async function loadOrders() {
    setLoading(true);
    setError("");
    setUnauthenticated(false);

    const response = await fetch("/api/orders", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as OrdersResponse;

    if (response.status === 401 || data.error === "UNAUTHENTICATED") {
      setUnauthenticated(true);
      setOrders([]);
      setLoading(false);
      return;
    }

    if (!response.ok) {
      setError(data.error || "Không tải được đơn hàng");
      setOrders([]);
      setLoading(false);
      return;
    }

    setProfileRequired(Boolean(data.profileRequired));
    setOrders(data.orders || []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const orderCount = useMemo(() => orders.length, [orders]);

  return (
    <ResponsivePageShell active="account" title="Đơn hàng của tôi" subtitle={orderCount > 0 ? `${orderCount} đơn đã gửi` : "Theo dõi đơn sỉ"}>
      <section className="rounded-[26px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Lịch sử đơn</p>
        <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Theo dõi đơn đã gửi cho sales</h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:text-base">Trạng thái đơn được cập nhật khi admin xác nhận, giao hàng hoặc hủy đơn.</p>
      </section>

      {loading ? <p className="mt-4 rounded-[24px] bg-white p-5 font-black text-slate-600 ring-1 ring-[#eee7dc]">Đang tải đơn hàng...</p> : null}

      {!loading && unauthenticated ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-[#fff3ea] text-[34px]">🔐</div>
          <h2 className="mt-4 text-[24px] font-black leading-tight">Cần đăng nhập để xem đơn</h2>
          <p className="mt-2 text-[14px] font-bold leading-6 text-slate-600">Đơn hàng được khóa theo tài khoản Clerk của từng khách.</p>
          <SignInButton mode="modal">
            <button type="button" className="mt-5 h-12 w-full rounded-[18px] bg-[#0b1220] px-5 text-[15px] font-black text-white">Đăng nhập</button>
          </SignInButton>
        </section>
      ) : null}

      {!loading && profileRequired ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-[#fff3ea] text-[34px]">🏪</div>
          <h2 className="mt-4 text-[24px] font-black leading-tight">Chưa có hồ sơ quán</h2>
          <p className="mt-2 text-[14px] font-bold leading-6 text-slate-600">Tạo hồ sơ quán để admin duyệt, mở giá sỉ và lưu đơn theo shop của bạn.</p>
          <Link href="/register" className="mt-5 flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[15px] font-black text-white">Tạo hồ sơ quán</Link>
        </section>
      ) : null}

      {!loading && error ? <p className="mt-4 rounded-[20px] bg-red-50 p-4 text-[14px] font-black text-red-700 ring-1 ring-red-100">{error}</p> : null}

      {!loading && !unauthenticated && !profileRequired && !error && orders.length === 0 ? (
        <section className="mt-4 rounded-[26px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-[#fff3ea] text-[34px]">📋</div>
          <h2 className="mt-4 text-[24px] font-black leading-tight">Chưa có đơn nào</h2>
          <p className="mt-2 text-[14px] font-bold leading-6 text-slate-600">Khi bạn gửi đơn từ giỏ hàng, đơn sẽ xuất hiện ở đây.</p>
          <Link href="/" className="mt-5 flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[15px] font-black text-white">Xem sản phẩm</Link>
        </section>
      ) : null}

      <div className="mt-4 space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="overflow-hidden rounded-[26px] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[12px] font-black ring-1 ${statusTone[order.status]}`}>{statusLabel[order.status]}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-black text-slate-600 ring-1 ring-slate-200">{formatDate(order.submittedAt)}</span>
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[21px] font-black tracking-tight text-[#0b1220]">{order.orderCode}</h2>
                  {order.note ? <p className="mt-1 text-[13px] font-bold text-slate-500">Ghi chú: {order.note}</p> : null}
                </div>
                <p className="text-right text-[20px] font-black text-[#ff5a00]">{formatVnd(order.subtotal)}</p>
              </div>
            </div>

            <div className="divide-y divide-[#eee7dc] border-t border-[#eee7dc] bg-[#fbfaf7]">
              {order.items.map((item) => (
                <div key={item.id} className="grid gap-1 px-4 py-3 text-[13px] font-bold text-slate-600">
                  <div className="flex justify-between gap-3">
                    <p className="font-black text-[#0b1220]">{item.name}</p>
                    <p className="shrink-0 font-black text-[#ff5a00]">{formatVnd(item.lineTotal)}</p>
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
