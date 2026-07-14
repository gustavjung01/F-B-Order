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
      const authToken = await token();
      const result = await adminApiFetch<{ customer: CustomerDetail }>(
        `/api/admin/customers/${customerId}`,
        authToken,
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
      const authToken = await token();
      const params = new URLSearchParams({ limit: "100" });
      if (filter !== "all") params.set("approvalStatus", filter);
      if (search.trim()) params.set("q", search.trim());
      const result = await adminApiFetch<{ customers: CustomerSummary[]; total: number }>(
        `/api/admin/customers?${params.toString()}`,
        authToken,
      );
      setCustomers(result.customers);
      setTotal(result.total);
      if (selectedId && !result.customers.some((item) => item.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [filter, search, selectedId, token]);

  const decide = useCallback(async (status: "approved" | "rejected") => {
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
    if (!selectedId) return;
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

  return (
    <section>
      {error && !selectedId ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="grid gap-1 text-sm font-medium">
          Trạng thái duyệt
          <select className="rounded-lg border border-slate-300 bg-white px-3 py-2" value={filter} onChange={(event) => setFilter(event.target.value as "all" | ApprovalStatus)}>
            <option value="all">Tất cả</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="grid min-w-[260px] flex-1 gap-1 text-sm font-medium">
          Tìm khách hàng
          <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Tên, cửa hàng, người liên hệ, số điện thoại" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadCustomers(); }} />
        </label>
        <button type="button" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading} onClick={() => void loadCustomers()}>
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
        <span className="pb-2 text-sm text-slate-500">{total} khách hàng</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {customers.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 md:col-span-2 xl:col-span-3">Không có khách hàng phù hợp.</p>
        ) : customers.map((customer) => (
          <button key={customer.id} type="button" className="group rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" onClick={() => void loadDetail(customer.id)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{customer.shopName || customer.name}</p>
                <p className="mt-1 truncate text-sm text-slate-600">{customer.contactName || customer.name} · {customer.phone || "Chưa có SĐT"}</p>
              </div>
              <StatusBadge status={customer.approvalStatus} />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="text-xs text-slate-500">
                <p>{customer.area || "Chưa có khu vực"}</p>
                <p className="mt-1">{customer.userCount} tài khoản · {formatDate(customer.createdAt)}</p>
              </div>
              <span className="shrink-0 text-xs font-bold text-emerald-700">Mở hồ sơ ›</span>
            </div>
          </button>
        ))}
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" aria-label="Đóng hồ sơ khách hàng" className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={closeDetail} />
          <section role="dialog" aria-modal="true" aria-labelledby="customer-dialog-title" className="relative z-10 flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white text-slate-950 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:rounded-[28px]">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Hồ sơ khách hàng</p>
                <h2 id="customer-dialog-title" className="mt-1 truncate text-xl font-black sm:text-2xl">{detail ? detail.shopName || detail.name : "Đang tải…"}</h2>
                {detail ? <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={detail.approvalStatus} /><span className="text-xs text-slate-500">ID: {detail.id}</span></div> : null}
              </div>
              <button type="button" aria-label="Đóng" disabled={saving} onClick={closeDetail} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-2xl font-black text-slate-700 disabled:opacity-50">×</button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div> : null}
              {detailLoading || !detail ? (
                <div className="grid min-h-64 place-items-center rounded-2xl bg-slate-50 font-semibold text-slate-500">Đang tải hồ sơ khách hàng…</div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="Người liên hệ">{detail.contactName || detail.name}</Info>
                    <Info label="Điện thoại">{detail.phone || "—"}</Info>
                    <Info label="Địa chỉ">{detail.address || "—"}</Info>
                    <Info label="Khu vực">{detail.area || "—"}</Info>
                    <Info label="Loại hình">{detail.businessType || "—"}</Info>
                    <Info label="Nhóm giá">{detail.priceGroupName || "Chưa gán"}</Info>
                    <Info label="Người duyệt gần nhất">{detail.approvalActorId || "—"}</Info>
                    <Info label="Thời điểm duyệt">{formatDate(detail.approvalDecidedAt)}</Info>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <label className="grid gap-2 text-sm font-bold">
                      Lý do / ghi chú duyệt
                      <textarea className="min-h-28 rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal" value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Bắt buộc khi từ chối" />
                    </label>
                  </div>

                  <div>
                    <h3 className="mb-3 font-black">Lịch sử duyệt</h3>
                    <div className="space-y-3">
                      {detail.approvalLogs.length === 0 ? <p className="text-sm text-slate-500">Chưa có thao tác duyệt.</p> : detail.approvalLogs.map((log) => (
                        <div key={log.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2"><span>{log.fromStatus ? statusLabels[log.fromStatus] : "Khởi tạo"}</span><span>→</span><StatusBadge status={log.toStatus} /></div>
                          <p className="mt-2 text-slate-700">{log.note || "Không có ghi chú"}</p>
                          <p className="mt-2 text-xs text-slate-500">{log.actorName || log.actorId} · {formatDate(log.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {detail ? (
              <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 sm:px-6 sm:pb-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" className="h-12 rounded-2xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50" disabled={saving || detail.approvalStatus === "approved"} onClick={() => void decide("approved")}>{saving ? "Đang lưu…" : "Duyệt khách hàng"}</button>
                  <button type="button" className="h-12 rounded-2xl bg-rose-700 px-5 font-black text-white disabled:opacity-50" disabled={saving || detail.approvalStatus === "rejected"} onClick={() => void decide("rejected")}>{saving ? "Đang lưu…" : "Từ chối hồ sơ"}</button>
                </div>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
