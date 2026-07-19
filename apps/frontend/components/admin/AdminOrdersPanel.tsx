"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminStatCard,
  AdminSurface,
  AdminSurfaceBody,
  AdminToolbar,
} from "@/components/admin/ui/AdminUI";

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
  customer: { shopName: string; contactName: string; phone: string; address: string };
  items: Array<{ id: string; sku: string; name: string; unit: string; quantity: number; unitPrice: number; lineTotal: number }>;
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

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

function statusTone(status: OrderStatus): "neutral" | "orange" | "success" | "info" | "danger" {
  if (status === "submitted") return "orange";
  if (status === "confirmed") return "success";
  if (status === "fulfilled") return "info";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function canTransition(from: OrderStatus, to: OrderStatus) {
  return from !== to && allowedTransitions[from].includes(to);
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
    } catch {
      setError("Không copy được mã đơn trên trình duyệt này.");
    }
  }

  useEffect(() => { void load(); }, []);

  const counters = useMemo(() => orders.reduce<Record<string, number>>((acc, order) => {
    acc.all += 1;
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, { all: 0, draft: 0, submitted: 0, confirmed: 0, fulfilled: 0, cancelled: 0 }), [orders]);

  const visibleOrders = useMemo(() => {
    const cleanQuery = normalize(query);
    return orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!cleanQuery) return true;
      return normalize([
        order.orderCode,
        order.customer.shopName,
        order.customer.contactName,
        order.customer.phone,
        order.customer.address,
      ].join(" ")).includes(cleanQuery);
    });
  }, [filter, orders, query]);

  if (loading) return <AdminAlert tone="info">Đang tải đơn hàng…</AdminAlert>;

  const filterItems = ["all", "submitted", "confirmed", "fulfilled", "cancelled"] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {filterItems.map((item) => (
          <AdminStatCard
            key={item}
            active={filter === item}
            label={item === "all" ? "Tất cả" : statusLabel[item]}
            value={counters[item] || 0}
            onClick={() => setFilter(item)}
          />
        ))}
      </div>

      <AdminToolbar>
        <AdminField label="Tìm đơn hàng" className="md:flex-1">
          <AdminInput
            id="admin-order-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Mã đơn, tên quán, người liên hệ, số điện thoại"
          />
        </AdminField>
        <AdminButton tone="dark" onClick={() => void load()}>Làm mới</AdminButton>
      </AdminToolbar>

      {error ? <AdminAlert tone="danger">{error}</AdminAlert> : null}

      {visibleOrders.length === 0 ? (
        <AdminEmptyState title="Chưa có đơn phù hợp bộ lọc" description="Đổi trạng thái hoặc từ khóa để kiểm tra lại." />
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => {
            const callHref = phoneHref(order.customer.phone);
            return (
              <AdminSurface key={order.id} className="overflow-hidden">
                <AdminSurfaceBody className="p-0">
                  <div className="border-b border-slate-200 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminBadge tone={statusTone(order.status)}>{statusLabel[order.status]}</AdminBadge>
                          <AdminBadge>{formatDate(order.submittedAt)}</AdminBadge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-black tracking-tight text-slate-950">{order.orderCode}</h3>
                          <AdminButton size="sm" tone="ghost" onClick={() => void copyOrderCode(order.orderCode)}>
                            {copiedCode === order.orderCode ? "Đã copy" : "Copy mã"}
                          </AdminButton>
                        </div>
                        <p className="mt-1 text-sm font-bold text-slate-700">{order.customer.shopName} · {order.customer.contactName} · {order.customer.phone}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">{order.customer.address}</p>
                        {callHref ? <a href={callHref} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-emerald-700 px-4 text-sm font-black text-white">Gọi khách</a> : null}
                      </div>
                      <div className="shrink-0 lg:text-right">
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Tổng đơn</p>
                        <p className="mt-1 text-2xl font-black text-orange-600">{formatVnd(order.subtotal)}</p>
                      </div>
                    </div>
                    {order.note ? <AdminAlert tone="warning" className="mt-4">Ghi chú: {order.note}</AdminAlert> : null}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {order.items.map((item) => (
                      <div key={item.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_90px_140px] md:items-center md:px-5">
                        <div>
                          <p className="font-black text-slate-900">{item.name}</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">{item.sku} · {item.unit}</p>
                        </div>
                        <p className="font-bold text-slate-600">SL: {item.quantity}</p>
                        <p className="font-black text-orange-600 md:text-right">{formatVnd(item.lineTotal)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:p-5">
                    {statusOptions.map((status) => (
                      <AdminButton
                        key={status}
                        tone={status === "cancelled" ? "danger" : status === "fulfilled" ? "success" : "dark"}
                        disabled={updatingId === order.id || !canTransition(order.status, status)}
                        onClick={() => void updateStatus(order.id, status)}
                      >
                        {updatingId === order.id ? "Đang lưu…" : statusLabel[status]}
                      </AdminButton>
                    ))}
                  </div>
                </AdminSurfaceBody>
              </AdminSurface>
            );
          })}
        </div>
      )}
    </div>
  );
}
