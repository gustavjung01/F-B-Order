import type { ReactNode } from "react";
import { AdminApiError } from "@/lib/admin-api";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipping"
  | "completed"
  | "cancelled"
  | "rejected";

export type CustomerSummary = {
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

export type CustomerDetail = CustomerSummary & {
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
  approvalLogs: Array<{
    id: string;
    fromStatus: ApprovalStatus | null;
    toStatus: ApprovalStatus;
    actorType: string;
    actorId: string;
    actorName: string | null;
    note: string | null;
    createdAt: string;
  }>;
};

export type OrderSummary = {
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

export type OrderDetail = OrderSummary & {
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

export const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled", "rejected"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["completed"],
  completed: [],
  cancelled: [],
  rejected: [],
};

export const statusLabels: Record<string, string> = {
  pending: "Chờ xử lý",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatMoney(value: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function errorText(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.code === "ADMIN_ACCESS_REQUIRED")
      return "Tài khoản này không có quyền admin.";
    return `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
}

function statusClass(status: string) {
  if (status === "approved" || status === "completed")
    return "bg-emerald-100 text-emerald-800";
  if (status === "rejected" || status === "cancelled")
    return "bg-rose-100 text-rose-800";
  if (status === "pending") return "bg-amber-100 text-amber-800";
  if (status === "shipping") return "bg-sky-100 text-sky-800";
  return "bg-indigo-100 text-indigo-800";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}

export function Info({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1 break-words font-semibold text-slate-900">
        {children}
      </div>
    </div>
  );
}
