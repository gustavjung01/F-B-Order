"use client";

import { useEffect, useMemo, useState } from "react";

const statusOptions = ["submitted", "confirmed", "fulfilled", "cancelled"] as const;
type OrderStatus = "draft" | "submitted" | "confirmed" | "fulfilled" | "cancelled";

type AdminOrder = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  subtotal: number;
  note: string;
  submittedAt: string;
  confirmedAt: string | null;
  customer: {
    shopName: string;
    contactName: string;
    phone: string;
    address: string;
  };
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
  orders?: AdminOrder[];
  error?: string;
  from?: OrderStatus;
  to?: OrderStatus;
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

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
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

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function canTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return false;
  return allowedTransitions[from].includes(to);
}

function phoneHref(phone: string) {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  return cleaned ? `tel:${cleaned}` : undefined;
}

function getErrorMessage(data: OrdersResponse) {
  if (data.error === "INVALID_STATUS_TRANSITION" && data.from && data.to) {
    return `Không thể đổi từ ${statusLabel[data.from]} sang ${statusLabel[data.to]}.`;
  }
  if (data.error === "FORBIDDEN") return "Bạn không có quyền admin.";
  return data.error || "Không cập nhật được trạng thái đơn";
}

export function AdminOrdersPanel() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "all">("submitted");
  const [query, setQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/orders", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as OrdersResponse;

    if (!response.ok) {
      setError(data.error || "Không tải được danh sách đơn");
      setLoading(false);
      return;
    }

    setOrders(data.orders || []);
    setLoading(false);
  }

  async function updateStatus(orderId: string, status: OrderStatus) {
    setUpdatingId(orderId);
    setError("");

    const response = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    const data = (await response.json().catch(() => ({}))) as OrdersResponse;

    if (!response.ok) {
      setError(getErrorMessage(data));
      setUpdatingId("");
      return;
    }

    await load();
    setUpdatingId("");
  }

  async function copyOrderCode(orderCode: string) {
    try {
      await navigator.clipboard.writeText(orderCode);
      setCopiedCode(orderCode);
      window.setTimeout(() => setCopiedCode(""), 1400);
    } catch (error) {
      setError("Không copy được mã đơn trên trình duyệt này.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counters = useMemo(() => {
    return orders.reduce<Record<string, number>>((acc, order) => {
      acc.all += 1;
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, { all: 0, draft: 0, submitted: 0, confirmed: 0, fulfilled: 0, cancelled: 0 });
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const cleanQuery = normalize(query);
    return orders.filter((order) => {
      const matchesStatus = filter === "all" || order.status === filter;
      if (!matchesStatus) return false;
      if (!cleanQuery) return true;

      const haystack = normalize([
        order.orderCode,
        order.customer.shopName,
        order.customer.contactName,
        order.customer.phone,
        order.customer.address,
      ].join(" "));
      return haystack.includes(cleanQuery);
    });
  }, [filter, orders, query]);

  if (loading) return <p className="rounded-[24px] bg-white p-5 font-black text-slate-700 ring-1 ring-white/70">Đang tải đơn hàng...</p>;

  return (
    <section className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(["all", "submitted", "confirmed", "fulfilled", "cancelled"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-[18px] px-4 py-3 text-left font-black ring-1 ${filter === item ? "bg-orange-500 text-white ring-orange-400" : "bg-white text-slate-800 ring-white/80"}`}
          >
            <span className="block text-[12px] uppercase tracking-[0.12em] opacity-70">{item === "all" ? "Tất cả" : statusLabel[item]}</span>
            <span className="mt-1 block text-2xl">{counters[item] || 0}</span>
          </button>
        ))}
      </div>

      <div className="rounded-[22px] bg-white p-3 shadow-[0_12px_30px_rgba(0,0,0,0.14)] ring-1 ring-white/70">
        <label className="sr-only" htmlFor="admin-order-search">Tìm đơn hàng</label>
        <input
          id="admin-order-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm mã đơn, tên quán, người liên hệ, số điện thoại..."
          className="h-12 w-full rounded-[18px] bg-slate-50 px-4 text-[14px] font-bold text-slate-950 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-orange-500"
        />
      </div>

      {error ? <p className="rounded-[20px] bg-red-50 p-4 text-[14px] font-black text-red-700 ring-1 ring-red-100">{error}</p> : null}

      {visibleOrders.length === 0 ? (
        <p className="rounded-[24px] bg-white p-5 font-black text-slate-700 ring-1 ring-white/70">Chưa có đơn phù hợp bộ lọc.</p>
      ) : null}

      {visibleOrders.map((order) => {
        const callHref = phoneHref(order.customer.phone);

        return (
          <article key={order.id} className="overflow-hidden rounded-[28px] bg-white text-slate-950 shadow-[0_18px_45px_rgba(0,0,0,0.22)] ring-1 ring-white/70">
            <div className="border-b border-slate-100 p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[12px] font-black ring-1 ${statusTone[order.status]}`}>{statusLabel[order.status]}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-black text-slate-600 ring-1 ring-slate-200">{formatDate(order.submittedAt)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <h2 className="text-[22px] font-black tracking-tight">{order.orderCode}</h2>
                    <button type="button" onClick={() => copyOrderCode(order.orderCode)} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-black text-slate-700 ring-1 ring-slate-200">
                      {copiedCode === order.orderCode ? "Đã copy" : "Copy mã"}
                    </button>
                  </div>
                  <p className="mt-1 text-[14px] font-bold text-slate-600">{order.customer.shopName} · {order.customer.contactName} · {order.customer.phone}</p>
                  <p className="mt-1 text-[13px] font-semibold text-slate-500">{order.customer.address}</p>
                  {callHref ? (
                    <a href={callHref} className="mt-3 inline-flex h-10 items-center justify-center rounded-[15px] bg-emerald-600 px-4 text-[13px] font-black text-white shadow-[0_10px_20px_rgba(5,150,105,0.2)]">
                      Gọi khách
                    </a>
                  ) : null}
                </div>
                <div className="text-left md:text-right">
                  <p className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-400">Tổng đơn</p>
                  <p className="mt-1 text-[24px] font-black text-orange-600">{formatVnd(order.subtotal)}</p>
                </div>
              </div>

              {order.note ? <p className="mt-4 rounded-[18px] bg-orange-50 p-3 text-[13px] font-bold leading-5 text-orange-800 ring-1 ring-orange-100">Ghi chú: {order.note}</p> : null}
            </div>

            <div className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <div key={item.id} className="grid gap-2 p-4 text-[14px] font-bold md:grid-cols-[1fr_90px_130px] md:items-center md:px-5">
                  <div>
                    <p className="font-black">{item.name}</p>
                    <p className="mt-1 text-[12px] text-slate-500">{item.sku} · {item.unit}</p>
                  </div>
                  <p className="text-slate-600">SL: {item.quantity}</p>
                  <p className="font-black text-orange-600 md:text-right">{formatVnd(item.lineTotal)}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-2 border-t border-slate-100 bg-slate-50 p-4 md:flex md:flex-wrap md:justify-end md:p-5">
              {statusOptions.map((status) => {
                const allowed = canTransition(order.status, status);
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={updatingId === order.id || !allowed}
                    onClick={() => updateStatus(order.id, status)}
                    className="h-11 rounded-[16px] bg-slate-950 px-4 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                  >
                    {updatingId === order.id ? "Đang lưu..." : statusLabel[status]}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}
