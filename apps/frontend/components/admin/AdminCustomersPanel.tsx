"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { adminApiFetch } from "@/lib/admin-api";
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

export function AdminCustomersPanel() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | ApprovalStatus>("pending");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được Clerk token.");
    return value;
  }, [getToken]);

  const loadDetail = useCallback(
    async (customerId: string) => {
      setLoading(true);
      setError(null);
      try {
        const authToken = await token();
        const result = await adminApiFetch<{ customer: CustomerDetail }>(
          `/api/admin/customers/${customerId}`,
          authToken,
        );
        setDetail(result.customer);
        setSelectedId(customerId);
        setApprovalNote(result.customer.approvalNote || "");
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const params = new URLSearchParams({ limit: "100" });
      if (filter !== "all") params.set("approvalStatus", filter);
      if (search.trim()) params.set("q", search.trim());
      const result = await adminApiFetch<{
        customers: CustomerSummary[];
        total: number;
      }>(`/api/admin/customers?${params.toString()}`, authToken);
      setCustomers(result.customers);
      setTotal(result.total);
      if (
        selectedId &&
        !result.customers.some((item) => item.id === selectedId)
      ) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [filter, search, selectedId, token]);

  const decide = useCallback(
    async (status: "approved" | "rejected") => {
      if (!selectedId) return;
      if (status === "rejected" && !approvalNote.trim()) {
        setError("Từ chối khách hàng bắt buộc phải có lý do.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const authToken = await token();
        const result = await adminApiFetch<{ customer: CustomerDetail }>(
          `/api/admin/customers/${selectedId}/approval`,
          authToken,
          {
            method: "PATCH",
            body: JSON.stringify({ status, note: approvalNote }),
          },
        );
        setDetail(result.customer);
        setApprovalNote(result.customer.approvalNote || "");
        await loadCustomers();
      } catch (saveError) {
        setError(errorText(saveError));
      } finally {
        setSaving(false);
      }
    },
    [approvalNote, loadCustomers, selectedId, token],
  );

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadCustomers();
  }, [isLoaded, isSignedIn, loadCustomers]);

  return (
    <section>
      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="grid gap-1 text-sm font-medium">
          Trạng thái duyệt
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as "all" | ApprovalStatus)
            }
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
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void loadCustomers();
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => void loadCustomers()}
        >
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
        <span className="pb-2 text-sm text-slate-500">{total} khách hàng</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(560px,1.1fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[72vh] divide-y divide-slate-100 overflow-y-auto">
            {customers.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                Không có khách hàng phù hợp.
              </p>
            ) : (
              customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selectedId === customer.id ? "bg-emerald-50" : ""}`}
                  onClick={() => void loadDetail(customer.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {customer.shopName || customer.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {customer.contactName || customer.name} ·{" "}
                        {customer.phone || "Chưa có SĐT"}
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
          {!detail ? (
            <p className="text-sm text-slate-500">
              Chọn một khách hàng để xem và duyệt hồ sơ.
            </p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">
                    {detail.shopName || detail.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">ID: {detail.id}</p>
                </div>
                <StatusBadge status={detail.approvalStatus} />
              </div>

              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <Info label="Người liên hệ">
                  {detail.contactName || detail.name}
                </Info>
                <Info label="Điện thoại">{detail.phone || "—"}</Info>
                <Info label="Địa chỉ">{detail.address || "—"}</Info>
                <Info label="Khu vực">{detail.area || "—"}</Info>
                <Info label="Loại hình">{detail.businessType || "—"}</Info>
                <Info label="Nhóm giá">
                  {detail.priceGroupName || "Chưa gán"}
                </Info>
                <Info label="Người duyệt gần nhất">
                  {detail.approvalActorId || "—"}
                </Info>
                <Info label="Thời điểm duyệt">
                  {formatDate(detail.approvalDecidedAt)}
                </Info>
              </div>

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
                    type="button"
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={saving || detail.approvalStatus === "approved"}
                    onClick={() => void decide("approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={saving || detail.approvalStatus === "rejected"}
                    onClick={() => void decide("rejected")}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-3 font-bold">Lịch sử duyệt</h3>
                <div className="space-y-3">
                  {detail.approvalLogs.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Chưa có thao tác duyệt.
                    </p>
                  ) : (
                    detail.approvalLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-lg border border-slate-200 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {log.fromStatus
                              ? statusLabels[log.fromStatus]
                              : "Khởi tạo"}
                          </span>
                          <span>→</span>
                          <StatusBadge status={log.toStatus} />
                        </div>
                        <p className="mt-2 text-slate-700">
                          {log.note || "Không có ghi chú"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {log.actorName || log.actorId} ·{" "}
                          {formatDate(log.createdAt)}
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
  );
}
