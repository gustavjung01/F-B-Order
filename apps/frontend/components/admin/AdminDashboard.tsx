"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/admin-api";

type ApprovalStatus = "pending" | "approved" | "rejected";
type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipping"
  | "completed"
  | "cancelled"
  | "rejected";

type CustomerSummary = {
  id: string;
  name: string;
  shopName: string | null;
  contactName: string | null;
  phone: string | null;
  area: string | null;
  approvalStatus: ApprovalStatus;
  accountStatus: string;
  approvalNote: string | null;
  approvalActorId: string | null;
  approvalDecidedAt: string | null;
  priceGroupCode: string | null;
  priceGroupName: string | null;
  userCount: number;
  createdAt: string;
};

type ApprovalLog = {
  id: string;
  fromStatus: ApprovalStatus | null;
  toStatus: ApprovalStatus;
  actorType: string;
  actorId: string;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

type CustomerDetail = CustomerSummary & {
  address: string | null;
  taxCode: string | null;
  businessType: string | null;
  note: string | null;
  rejectedReason: string | null;
  approvalActorType: string | null;
  users: Array<{
    id: string;
    clerkUserId: string;
    role: string;
    isPrimary: boolean;
    createdAt: string;
  }>;
  approvalLogs: ApprovalLog[];
};

type OrderSummary = {
  id: string;
  orderCode: string;
  customerId: string;
  customerName: string;
  shopName: string | null;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
};

type OrderDetail = OrderSummary & {
  customerNote: string | null;
  internalNote: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  contactName: string | null;
  customerPhone: string | null;
  customerApprovalStatus: ApprovalStatus;
  customerAccountStatus: string;
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
    bundleSnapshot: unknown;
    snapshotVersion: number;
  }>;
  statusLogs: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actorType: string;
    actorId: string;
    actorName: string | null;
    note: string | null;
    createdAt: string;
  }>;
  internalNoteLogs: Array<{
    id: string;
    previousNote: string | null;
    newNote: string | null;
    actorType: string;
    actorId: string;
    actorName: string | null;
    createdAt: string;
  }>;
};

const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled", "rejected"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["completed"],
  completed: [],
  cancelled: [],
  rejected: [],
};

const statusLabels: Record<string, string> = {
  pending: "Chờ xử lý",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function statusClass(status: string) {
  if (status === "approved" || status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected" || status === "cancelled") return "bg-rose-100 text-rose-800";
  if (status === "pending") return "bg-amber-100 text-amber-800";
  if (status === "shipping") return "bg-sky-100 text-sky-800";
  return "bg-indigo-100 text-indigo-800";
}

function errorText(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.code === "ADMIN_ACCESS_REQUIRED") return "Tài khoản này không có quyền admin.";
    return `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
      {statusLabels[status] || status}
    </span>
  );
}

export function AdminDashboard() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [tab, setTab] = useState<"customers" | "orders">("customers");
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerFilter, setCustomerFilter] = useState<"all" | ApprovalStatus>("pending");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderFilter, setOrderFilter] = useState<"all" | OrderStatus>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [statusNote, setStatusNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được Clerk token.");
    return value;
  }, [getToken]);

  const loadCustomerDetail = useCallback(
    async (customerId: string) => {
      setCustomerLoading(true);
      setError(null);
      try {
        const authToken = await token();
        const result = await adminApiFetch<{ customer: CustomerDetail }>(
          `/api/admin/customers/${customerId}`,
          authToken,
        );
        setCustomerDetail(result.customer);
        setSelectedCustomerId(customerId);
        setApprovalNote(result.customer.approvalNote || "");
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setCustomerLoading(false);
      }
    },
    [token],
  );

  const loadCustomers = useCallback(async () => {
    setCustomerLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const params = new URLSearchParams({ limit: "100" });
      if (customerFilter !== "all") params.set("approvalStatus", customerFilter);
      if (customerSearch.trim()) params.set("q", customerSearch.trim());
      const result = await adminApiFetch<{ customers: CustomerSummary[]; total: number }>(
        `/api/admin/customers?${params.toString()}`,
        authToken,
      );
      setCustomers(result.customers);
      setCustomerTotal(result.total);
      if (selectedCustomerId && !result.customers.some((item) => item.id === selectedCustomerId)) {
        setSelectedCustomerId(null);
        setCustomerDetail(null);
      }
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setCustomerLoading(false);
    }
  }, [customerFilter, customerSearch, selectedCustomerId, token]);

  const decideCustomer = useCallback(
    async (status: "approved" | "rejected") => {
      if (!selectedCustomerId) return;
      if (status === "rejected" && !approvalNote.trim()) {
        setError("Từ chối khách hàng bắt buộc phải có lý do.");
        return;
      }
      setCustomerSaving(true);
      setError(null);
      try {
        const authToken = await token();
        const result = await adminApiFetch<{ customer: CustomerDetail }>(
          `/api/admin/customers/${selectedCustomerId}/approval`,
          authToken,
          {
            method: "PATCH",
            body: JSON.stringify({ status, note: approvalNote }),
          },
        );
        setCustomerDetail(result.customer);
        setApprovalNote(result.customer.approvalNote || "");
        await loadCustomers();
      } catch (saveError) {
        setError(errorText(saveError));
      } finally {
        setCustomerSaving(false);
      }
    },
    [approvalNote, loadCustomers, selectedCustomerId, token],
  );

  const loadOrderDetail = useCallback(
    async (orderId: string) => {
      setOrderLoading(true);
      setError(null);
      try {
        const authToken = await token();
        const result = await adminApiFetch<{ order: OrderDetail }>(
          `/api/admin/orders/${orderId}`,
          authToken,
        );
        setOrderDetail(result.order);
        setSelectedOrderId(orderId);
        setInternalNote(result.order.internalNote || "");
        setNextStatus("");
        setStatusNote("");
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setOrderLoading(false);
      }
    },
    [token],
  );

  const loadOrders = useCallback(async () => {
    setOrderLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const params = new URLSearchParams({ limit: "100" });
      if (orderFilter !== "all") params.set("status", orderFilter);
      const result = await adminApiFetch<{ orders: OrderSummary[]; total: number }>(
        `/api/admin/orders?${params.toString()}`,
        authToken,
      );
      setOrders(result.orders);
      setOrderTotal(result.total);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setOrderLoading(false);
    }
  }, [orderFilter, token]);

  const updateStatus = useCallback(async () => {
    if (!selectedOrderId || !nextStatus) return;
    setOrderSaving(true);
    setError(null);
    try {
      const authToken = await token();
      const result = await adminApiFetch<{ order: OrderDetail }>(
        `/api/admin/orders/${selectedOrderId}/status`,
        authToken,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus, note: statusNote }),
        },
      );
      setOrderDetail(result.order);
      setNextStatus("");
      setStatusNote("");
      await loadOrders();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setOrderSaving(false);
    }
  }, [loadOrders, nextStatus, selectedOrderId, statusNote, token]);

  const saveInternalNote = useCallback(async () => {
    if (!selectedOrderId) return;
    setOrderSaving(true);
    setError(null);
    try {
      const authToken = await token();
      const result = await adminApiFetch<{ order: OrderDetail }>(
        `/api/admin/orders/${selectedOrderId}/internal-note`,
        authToken,
        {
          method: "PATCH",
          body: JSON.stringify({ note: internalNote }),
        },
      );
      setOrderDetail(result.order);
      setInternalNote(result.order.internalNote || "");
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setOrderSaving(false);
    }
  }, [internalNote, selectedOrderId, token]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (tab === "customers") void loadCustomers();
    else void loadOrders();
  }, [isLoaded, isSignedIn, loadCustomers, loadOrders, tab]);

  const allowedTransitions = useMemo(
    () => (orderDetail ? orderTransitions[orderDetail.status] : []),
    [orderDetail],
  );

  if (!isLoaded) {
    return <main className="min-h-screen p-8">Đang tải phiên đăng nhập…</main>;
  }

  if (!isSignedIn) {
    return <main className="min-h-screen p-8">Bạn cần đăng nhập để mở khu vực quản trị.</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-8">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Bếp Sỉ</p>
            <h1 className="text-2xl font-bold">Admin vận hành</h1>
          </div>
          <div className="flex items-center gap-3">
            <a className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/">
              Về trang bán hàng
            </a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === "customers" ? "bg-slate-900 text-white" : "bg-white text-slate-700"
            }`}
            onClick={() => setTab("customers")}
          >
            Customers
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === "orders" ? "bg-slate-900 text-white" : "bg-white text-slate-700"
            }`}
            onClick={() => setTab("orders")}
          >
            Orders
          </button>
          <Link className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/admin/recipes">
            Công thức
          </Link>
        </div>

        {error ? (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {tab === "customers" ? (
          <section>
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <label className="grid gap-1 text-sm font-medium">
                Trạng thái duyệt
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={customerFilter}
                  onChange={(event) => setCustomerFilter(event.target.value as "all" | ApprovalStatus)}
                >
                  <option value="all">Tất cả</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label className="grid min-w-[260px] flex-1 gap-1 text-sm font-medium">
                Tìm khách hàng
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Tên, cửa hàng, người liên hệ, số điện thoại"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void loadCustomers();
                  }}
                />
              </label>
              <button
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={customerLoading}
                onClick={() => void loadCustomers()}
              >
                Làm mới
              </button>
              <span className="pb-2 text-sm text-slate-500">{customerTotal} khách hàng</span>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(560px,1.1fr)]">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[72vh] divide-y divide-slate-100 overflow-y-auto">
                  {customers.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">Không có khách hàng phù hợp.</p>
                  ) : (
                    customers.map((customer) => (
                      <button
                        key={customer.id}
                        className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${
                          selectedCustomerId === customer.id ? "bg-emerald-50" : ""
                        }`}
                        onClick={() => void loadCustomerDetail(customer.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{customer.shopName || customer.name}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              {customer.contactName || customer.name} · {customer.phone || "Chưa có SĐT"}
                            </p>
                          </div>
                          <StatusBadge status={customer.approvalStatus} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>{customer.area || "Chưa có khu vực"}</span>
                          <span>{customer.userCount} tài khoản</span>
                          <span>{formatDate(customer.createdAt)}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                {!customerDetail ? (
                  <p className="text-sm text-slate-500">Chọn một khách hàng để xem và duyệt hồ sơ.</p>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold">{customerDetail.shopName || customerDetail.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">ID: {customerDetail.id}</p>
                      </div>
                      <StatusBadge status={customerDetail.approvalStatus} />
                    </div>

                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-slate-500">Người liên hệ</dt><dd className="font-medium">{customerDetail.contactName || customerDetail.name}</dd></div>
                      <div><dt className="text-slate-500">Điện thoại</dt><dd className="font-medium">{customerDetail.phone || "—"}</dd></div>
                      <div><dt className="text-slate-500">Địa chỉ</dt><dd className="font-medium">{customerDetail.address || "—"}</dd></div>
                      <div><dt className="text-slate-500">Khu vực</dt><dd className="font-medium">{customerDetail.area || "—"}</dd></div>
                      <div><dt className="text-slate-500">Loại hình</dt><dd className="font-medium">{customerDetail.businessType || "—"}</dd></div>
                      <div><dt className="text-slate-500">Nhóm giá</dt><dd className="font-medium">{customerDetail.priceGroupName || "Chưa gán"}</dd></div>
                      <div><dt className="text-slate-500">Người duyệt gần nhất</dt><dd className="font-medium">{customerDetail.approvalActorId || "—"}</dd></div>
                      <div><dt className="text-slate-500">Thời điểm duyệt</dt><dd className="font-medium">{formatDate(customerDetail.approvalDecidedAt)}</dd></div>
                    </dl>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <label className="grid gap-2 text-sm font-semibold">
                        Lý do / ghi chú duyệt
                        <textarea
                          className="min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                          value={approvalNote}
                          onChange={(event) => setApprovalNote(event.target.value)}
                          placeholder="Bắt buộc khi từ chối"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          disabled={customerSaving || customerDetail.approvalStatus === "approved"}
                          onClick={() => void decideCustomer("approved")}
                        >
                          Approve
                        </button>
                        <button
                          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          disabled={customerSaving || customerDetail.approvalStatus === "rejected"}
                          onClick={() => void decideCustomer("rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-3 font-bold">Lịch sử duyệt</h3>
                      <div className="space-y-3">
                        {customerDetail.approvalLogs.length === 0 ? (
                          <p className="text-sm text-slate-500">Chưa có thao tác duyệt.</p>
                        ) : (
                          customerDetail.approvalLogs.map((log) => (
                            <div key={log.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{log.fromStatus ? statusLabels[log.fromStatus] : "Khởi tạo"}</span>
                                <span>→</span>
                                <StatusBadge status={log.toStatus} />
                              </div>
                              <p className="mt-2 text-slate-700">{log.note || "Không có ghi chú"}</p>
                              <p className="mt-2 text-xs text-slate-500">
                                {log.actorName || log.actorId} · {formatDate(log.createdAt)}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section>
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <label className="grid gap-1 text-sm font-medium">
                Trạng thái đơn
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  value={orderFilter}
                  onChange={(event) => setOrderFilter(event.target.value as "all" | OrderStatus)}
                >
                  <option value="all">Tất cả</option>
                  {Object.keys(orderTransitions).map((status) => (
                    <option key={status} value={status}>{statusLabels[status] || status}</option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={orderLoading}
                onClick={() => void loadOrders()}
              >
                Làm mới
              </button>
              <span className="pb-2 text-sm text-slate-500">{orderTotal} đơn hàng</span>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.85fr)_minmax(640px,1.15fr)]">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[72vh] divide-y divide-slate-100 overflow-y-auto">
                  {orders.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">Chưa có đơn hàng phù hợp.</p>
                  ) : (
                    orders.map((order) => (
                      <button
                        key={order.id}
                        className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${
                          selectedOrderId === order.id ? "bg-emerald-50" : ""
                        }`}
                        onClick={() => void loadOrderDetail(order.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{order.orderCode}</p>
                            <p className="mt-1 text-sm text-slate-600">{order.shopName || order.customerName}</p>
                          </div>
                          <StatusBadge status={order.status} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-slate-500">{order.itemCount} dòng · {formatDate(order.createdAt)}</span>
                          <strong>{formatMoney(order.totalAmount, order.currency)}</strong>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                {!orderDetail ? (
                  <p className="text-sm text-slate-500">Chọn một đơn hàng để xử lý.</p>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold">{orderDetail.orderCode}</h2>
                        <p className="mt-1 text-sm text-slate-500">Tạo lúc {formatDate(orderDetail.createdAt)}</p>
                      </div>
                      <StatusBadge status={orderDetail.status} />
                    </div>

                    <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                      <div><span className="text-slate-500">Khách hàng</span><p className="font-semibold">{orderDetail.shopName || orderDetail.customerName}</p></div>
                      <div><span className="text-slate-500">Liên hệ</span><p className="font-semibold">{orderDetail.contactName || orderDetail.customerName} · {orderDetail.customerPhone || "—"}</p></div>
                      <div><span className="text-slate-500">Tổng tiền</span><p className="font-semibold">{formatMoney(orderDetail.totalAmount, orderDetail.currency)}</p></div>
                      <div><span className="text-slate-500">Địa chỉ giao</span><p className="font-semibold">{orderDetail.shippingAddress || "Chưa có"}</p></div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="border-b border-slate-200 text-left text-slate-500">
                          <tr><th className="py-2">SKU</th><th>Tên</th><th>ĐVT</th><th className="text-right">SL</th><th className="text-right">Đơn giá</th><th className="text-right">Thành tiền</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {orderDetail.items.map((item) => (
                            <tr key={item.id}>
                              <td className="py-3 font-mono text-xs">{item.sku}</td>
                              <td className="font-medium">{item.name}</td>
                              <td>{item.unit}</td>
                              <td className="text-right">{item.quantity}</td>
                              <td className="text-right">{formatMoney(item.unitPrice, orderDetail.currency)}</td>
                              <td className="text-right font-semibold">{formatMoney(item.lineTotal, orderDetail.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <h3 className="font-bold">Chuyển trạng thái</h3>
                        {allowedTransitions.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">Đơn đã ở trạng thái kết thúc.</p>
                        ) : (
                          <div className="mt-3 grid gap-3">
                            <select
                              className="rounded-lg border border-slate-300 px-3 py-2"
                              value={nextStatus}
                              onChange={(event) => setNextStatus(event.target.value as OrderStatus | "")}
                            >
                              <option value="">Chọn trạng thái mới</option>
                              {allowedTransitions.map((status) => (
                                <option key={status} value={status}>{statusLabels[status]}</option>
                              ))}
                            </select>
                            <textarea
                              className="min-h-20 rounded-lg border border-slate-300 px-3 py-2"
                              placeholder="Ghi chú chuyển trạng thái"
                              value={statusNote}
                              onChange={(event) => setStatusNote(event.target.value)}
                            />
                            <button
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              disabled={orderSaving || !nextStatus}
                              onClick={() => void updateStatus()}
                            >
                              Cập nhật trạng thái
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-200 p-4">
                        <h3 className="font-bold">Ghi chú nội bộ</h3>
                        <textarea
                          className="mt-3 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2"
                          value={internalNote}
                          onChange={(event) => setInternalNote(event.target.value)}
                          placeholder="Chỉ admin/staff nội bộ nhìn thấy"
                        />
                        <button
                          className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          disabled={orderSaving}
                          onClick={() => void saveInternalNote()}
                        >
                          Lưu ghi chú
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-3 font-bold">Status log</h3>
                      <div className="space-y-3">
                        {orderDetail.statusLogs.map((log) => (
                          <div key={log.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{log.fromStatus ? statusLabels[log.fromStatus] : "Khởi tạo"}</span>
                              <span>→</span>
                              <StatusBadge status={log.toStatus} />
                            </div>
                            <p className="mt-2 text-slate-700">{log.note || "Không có ghi chú"}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              {log.actorName || log.actorId} ({log.actorType}) · {formatDate(log.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {orderDetail.internalNoteLogs.length > 0 ? (
                      <div>
                        <h3 className="mb-3 font-bold">Lịch sử ghi chú nội bộ</h3>
                        <div className="space-y-2 text-sm">
                          {orderDetail.internalNoteLogs.map((log) => (
                            <div key={log.id} className="rounded-lg bg-slate-50 p-3">
                              <p>{log.newNote || "Đã xóa ghi chú"}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {log.actorName || log.actorId} · {formatDate(log.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
