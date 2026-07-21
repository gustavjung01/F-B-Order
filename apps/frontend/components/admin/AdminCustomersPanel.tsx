"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import {
  type ApprovalStatus,
  type CustomerDetail,
  type CustomerSummary,
  errorText,
  formatDate,
  Info,
  StatusBadge,
  statusLabels,
} from "@/components/admin/adminOperationsShared";
import {
  AdminAlert,
  AdminButton,
  AdminDialog,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  AdminToolbar,
} from "@/components/admin/ui/AdminUI";
import { adminApiFetch } from "@/lib/admin-api";
import { useAdminPermissions } from "@/components/admin/AdminPermissionProvider";

export function AdminCustomersPanel() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { has } = useAdminPermissions();
  const canUpdate = has("customers.update");
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | ApprovalStatus>("pending");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được Clerk token.");
    return value;
  }, [getToken]);

  const closeDetail = useCallback(() => {
    if (saving) return;
    setSelectedId(null);
    setDetail(null);
    setApprovalNote("");
    setError(null);
  }, [saving]);

  const loadDetail = useCallback(async (customerId: string) => {
    setSelectedId(customerId);
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    try {
      const result = await adminApiFetch<{ customer: CustomerDetail }>(
        `/api/admin/customers/${customerId}`,
        await token(),
      );
      setDetail(result.customer);
      setApprovalNote(result.customer.approvalNote || "");
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filter !== "all") params.set("approvalStatus", filter);
      if (search.trim()) params.set("q", search.trim());
      const result = await adminApiFetch<{ customers: CustomerSummary[]; total: number }>(
        `/api/admin/customers?${params.toString()}`,
        await token(),
      );
      setCustomers(result.customers);
      setTotal(result.total);
      if (selectedId && !result.customers.some((item) => item.id === selectedId)) closeDetail();
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [closeDetail, filter, search, selectedId, token]);

  const decide = useCallback(async (status: "approved" | "rejected") => {
    if (!selectedId) return;
    if (status === "rejected" && !approvalNote.trim()) {
      setError("Từ chối khách hàng bắt buộc phải có lý do.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await adminApiFetch<{ customer: CustomerDetail }>(
        `/api/admin/customers/${selectedId}/approval`,
        await token(),
        { method: "PATCH", body: JSON.stringify({ status, note: approvalNote }) },
      );
      setDetail(result.customer);
      setApprovalNote(result.customer.approvalNote || "");
      await loadCustomers();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }, [approvalNote, loadCustomers, selectedId, token]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadCustomers();
  }, [isLoaded, isSignedIn, loadCustomers]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDetail, selectedId]);

  if (!isLoaded) return <AdminAlert tone="info">Đang tải phiên đăng nhập…</AdminAlert>;
  if (!isSignedIn) return <AdminAlert tone="warning">Bạn cần đăng nhập tài khoản admin.</AdminAlert>;

  return (
    <div className="space-y-4">
      {error && !selectedId ? <AdminAlert tone="danger">{error}</AdminAlert> : null}

      <AdminToolbar>
        <AdminField label="Trạng thái duyệt" className="md:w-52">
          <AdminSelect value={filter} onChange={(event) => setFilter(event.target.value as "all" | ApprovalStatus)}>
            <option value="all">Tất cả</option>
            <option value="pending">Chờ xử lý</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
          </AdminSelect>
        </AdminField>
        <AdminField label="Tìm khách hàng" className="md:min-w-[300px] md:flex-1">
          <AdminInput
            placeholder="Tên, cửa hàng, người liên hệ, số điện thoại"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void loadCustomers(); }}
          />
        </AdminField>
        <AdminButton tone="dark" disabled={loading} onClick={() => void loadCustomers()}>
          {loading ? "Đang tải…" : "Làm mới"}
        </AdminButton>
        <p className="pb-2 text-sm font-bold text-slate-500 md:ml-auto">{total} khách hàng</p>
      </AdminToolbar>

      {customers.length === 0 ? (
        <AdminEmptyState title="Không có khách hàng phù hợp" description="Đổi bộ lọc hoặc từ khóa tìm kiếm để kiểm tra lại." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className="group rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-orange-100"
              onClick={() => void loadDetail(customer.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-950">{customer.shopName || customer.name}</p>
                  <p className="mt-1 truncate text-sm font-medium text-slate-600">{customer.contactName || customer.name} · {customer.phone || "Chưa có SĐT"}</p>
                </div>
                <StatusBadge status={customer.approvalStatus} />
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="text-xs font-medium text-slate-500">
                  <p>{customer.area || "Chưa có khu vực"}</p>
                  <p className="mt-1">{customer.userCount} tài khoản · {formatDate(customer.createdAt)}</p>
                </div>
                <span className="shrink-0 text-xs font-black text-orange-600">Mở hồ sơ →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <AdminDialog
        open={Boolean(selectedId)}
        onClose={closeDetail}
        closeDisabled={saving}
        eyebrow="Hồ sơ khách hàng"
        title={detail ? detail.shopName || detail.name : "Đang tải hồ sơ…"}
        description={detail ? `ID: ${detail.id}` : undefined}
        size="lg"
        footer={detail && canUpdate ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminButton tone="success" size="lg" disabled={saving || detail.approvalStatus === "approved"} onClick={() => void decide("approved")}>
              {saving ? "Đang lưu…" : "Duyệt khách hàng"}
            </AdminButton>
            <AdminButton tone="danger" size="lg" disabled={saving || detail.approvalStatus === "rejected"} onClick={() => void decide("rejected")}>
              {saving ? "Đang lưu…" : "Từ chối hồ sơ"}
            </AdminButton>
          </div>
        ) : undefined}
      >
        {error ? <AdminAlert tone="danger" className="mb-4">{error}</AdminAlert> : null}
        {detailLoading || !detail ? (
          <AdminEmptyState title="Đang tải hồ sơ khách hàng…" />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={detail.approvalStatus} /></div>
            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Người liên hệ">{detail.contactName || detail.name}</Info>
              <Info label="Điện thoại">{detail.phone || "—"}</Info>
              <Info label="Địa chỉ">{detail.address || "—"}</Info>
              <Info label="Khu vực">{detail.area || "—"}</Info>
              <Info label="Loại hình">{detail.businessType || "—"}</Info>
              <Info label="Nhóm giá">{detail.priceGroupName || "Chưa gán"}</Info>
              <Info label="Người duyệt gần nhất">{detail.approvalActorId || "—"}</Info>
              <Info label="Thời điểm duyệt">{formatDate(detail.approvalDecidedAt)}</Info>
            </div>

            <AdminField label="Lý do / ghi chú duyệt" hint="Bắt buộc khi từ chối hồ sơ.">
              <AdminTextarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Nhập ghi chú cho quyết định duyệt" />
            </AdminField>

            <div>
              <h3 className="mb-3 font-black text-slate-950">Lịch sử duyệt</h3>
              {detail.approvalLogs.length === 0 ? (
                <AdminEmptyState title="Chưa có thao tác duyệt" className="min-h-28" />
              ) : (
                <div className="space-y-3">
                  {detail.approvalLogs.map((log) => (
                    <article key={log.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{log.fromStatus ? statusLabels[log.fromStatus] : "Khởi tạo"}</span>
                        <span>→</span>
                        <StatusBadge status={log.toStatus} />
                      </div>
                      <p className="mt-2 font-medium text-slate-700">{log.note || "Không có ghi chú"}</p>
                      <p className="mt-2 text-xs font-medium text-slate-500">{log.actorName || log.actorId} · {formatDate(log.createdAt)}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </AdminDialog>
    </div>
  );
}
