"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { AiReadableResult } from "./ai/AiReadableResult";
import { useAdminPermissions } from "./AdminPermissionProvider";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
  AdminTextarea,
} from "./ui/AdminUI";

type AiScope = "orders" | "customers" | "catalog" | "recipes";
type AiJobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

type AiJob = {
  id: string;
  job_type: "read_only" | "draft";
  status: AiJobStatus;
  attempt_count: number;
  max_attempts: number;
  draft_id: string | null;
  response_text: string | null;
  provider: string | null;
  model: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

type AiAction = {
  id: string;
  action_key: string;
  target_id: string | null;
  payload: { note?: string };
  status: string;
  requested_reason: string;
  created_at: string;
};

const scopeLabels: Record<AiScope, string> = {
  orders: "Đơn hàng",
  customers: "Khách hàng",
  catalog: "Catalog",
  recipes: "Công thức",
};

const jobStatusLabel: Record<AiJobStatus, string> = {
  pending: "Đang chờ",
  processing: "Đang xử lý",
  completed: "Hoàn thành",
  failed: "Thất bại",
  cancelled: "Đã hủy",
};

function jobStatusTone(status: AiJobStatus): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "processing") return "info";
  if (status === "pending") return "warning";
  return "neutral";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export function AdminAiConsole() {
  const { getToken } = useAuth();
  const { has, permissions } = useAdminPermissions();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [actions, setActions] = useState<AiAction[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const scopes = useMemo<AiScope[]>(() => {
    const next: AiScope[] = [];
    if (permissions.includes("orders.view")) next.push("orders");
    if (permissions.includes("customers.view")) next.push("customers");
    if (permissions.includes("catalog.view")) next.push("catalog");
    if (permissions.includes("recipes.view")) next.push("recipes");
    return next;
  }, [permissions]);

  const hasAiAccess = has("ai.use") || has("ai.execute") || has("ai.audit");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  async function loadJobs() {
    if (!has("ai.use")) return;
    const payload = await adminApiFetch<{ jobs: AiJob[] }>("/api/admin/ai/jobs", await token());
    setJobs(payload.jobs);
    setSelectedJobId((current) => {
      if (current && payload.jobs.some((job) => job.id === current)) return current;
      return payload.jobs.find((job) => job.status === "completed")?.id || payload.jobs[0]?.id || null;
    });
  }

  async function loadActions() {
    if (!has("ai.audit")) return;
    const payload = await adminApiFetch<{ actions: AiAction[] }>("/api/admin/ai/actions", await token());
    setActions(payload.actions);
  }

  useEffect(() => {
    if (!hasAiAccess) return;
    void loadJobs().catch(() => undefined);
    void loadActions().catch(() => undefined);
    const timer = window.setInterval(() => {
      void loadJobs().catch(() => undefined);
      void loadActions().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
    // Permission state is stable for the lifetime of the admin shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAiAccess]);

  async function enqueue(path: string, body: Record<string, unknown>) {
    if (!scopes.length) {
      setMessage("Tài khoản chưa có quyền xem module dữ liệu nào để cấp context cho AI.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const payload = await adminApiFetch<{ jobId: string; status: string }>(
        path,
        await token(),
        { method: "POST", body: JSON.stringify(body) },
      );
      setSelectedJobId(payload.jobId);
      setMessage(`Đã đưa AI job ${payload.jobId.slice(0, 8)} vào hàng đợi.`);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được AI job.");
    } finally {
      setBusy(false);
    }
  }

  async function runQuery() {
    await enqueue("/api/admin/ai/query", { prompt, scopes });
  }

  async function createDraft() {
    await enqueue("/api/admin/ai/drafts", {
      prompt,
      draftType: "operations_note",
      title: draftTitle || "AI draft",
      scopes,
    });
  }

  async function requestAction() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await adminApiFetch<{ actionRequestId: string }>(
        "/api/admin/ai/actions",
        await token(),
        {
          method: "POST",
          body: JSON.stringify({
            actionKey: "append_order_internal_note",
            targetId: orderId,
            payload: { note },
            reason: "AI đề xuất ghi chú nội bộ đơn hàng",
          }),
        },
      );
      setMessage(`Đã gửi action ${payload.actionRequestId.slice(0, 8)} để người khác phê duyệt.`);
      await loadActions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không gửi được AI action.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewAction(actionId: string, decision: "approve" | "reject") {
    setBusy(true);
    setMessage("");
    try {
      await adminApiFetch(
        `/api/admin/ai/actions/${actionId}/${decision}`,
        await token(),
        {
          method: "POST",
          body: JSON.stringify({
            note: decision === "approve" ? "Đã kiểm tra và phê duyệt" : "Từ chối sau khi kiểm tra",
          }),
        },
      );
      setMessage(decision === "approve" ? "Action đã được phê duyệt và thực thi." : "Action đã bị từ chối.");
      await loadActions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xử lý được AI action.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasAiAccess) {
    return <AdminEmptyState title="Không có quyền sử dụng AI" description="Tài khoản cần ít nhất một permission ai.use, ai.execute hoặc ai.audit." />;
  }

  return (
    <div className="grid gap-5">
      {!scopes.length ? <AdminAlert tone="warning" title="Không có scope dữ liệu">AI chỉ được chạy khi tài khoản có quyền xem ít nhất một module Đơn hàng, Khách hàng, Catalog hoặc Công thức.</AdminAlert> : null}
      {message ? <AdminAlert tone={message.includes("Không") || message.includes("chưa") ? "warning" : "success"}>{message}</AdminAlert> : null}

      <AdminSurface>
        <AdminSurfaceHeader
          eyebrow="AI queue"
          title="Yêu cầu phân tích hoặc tạo draft"
          description="Frontend chỉ gửi job. Worker VPS đọc context đã lọc theo quyền và ghi kết quả vào PostgreSQL."
        />
        <AdminSurfaceBody className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {scopes.map((scope) => <AdminBadge key={scope} tone="info">{scopeLabels[scope]}</AdminBadge>)}
          </div>
          <AdminField label="Yêu cầu cho AI" hint="Mô tả rõ dữ liệu cần phân tích và đầu ra mong muốn.">
            <AdminTextarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ví dụ: Tóm tắt tình hình đơn hàng và chỉ ra bất thường." />
          </AdminField>
          {has("ai.execute") ? (
            <AdminField label="Tiêu đề draft" hint="Dùng khi tạo nội dung nháp cần review.">
              <AdminInput value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Tiêu đề draft" />
            </AdminField>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {has("ai.use") ? <AdminButton tone="dark" disabled={busy || prompt.trim().length < 3 || scopes.length === 0} onClick={() => void runQuery()}>Đưa query vào hàng đợi</AdminButton> : null}
            {has("ai.execute") ? <AdminButton tone="primary" disabled={busy || prompt.trim().length < 3 || scopes.length === 0} onClick={() => void createDraft()}>Đưa draft vào hàng đợi</AdminButton> : null}
          </div>
        </AdminSurfaceBody>
      </AdminSurface>

      {has("ai.use") ? (
        <AdminSurface>
          <AdminSurfaceHeader
            title="AI jobs"
            description="Chọn một job để xem trạng thái và kết quả đã được trình bày thành nội dung dễ đọc."
            actions={<AdminButton size="sm" tone="secondary" onClick={() => void loadJobs()}>Tải lại</AdminButton>}
          />
          <AdminSurfaceBody className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <div className="grid content-start gap-3">
              {jobs.length === 0 ? <AdminEmptyState title="Chưa có AI job" description="Tạo query hoặc draft để bắt đầu." /> : jobs.map((job) => (
                <article key={job.id} className={`rounded-2xl border p-4 ${selectedJobId === job.id ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminBadge tone="neutral">{job.job_type === "draft" ? "Draft" : "Read only"}</AdminBadge>
                      <AdminBadge tone={jobStatusTone(job.status)}>{jobStatusLabel[job.status]}</AdminBadge>
                    </div>
                    <AdminButton size="sm" tone="ghost" onClick={() => setSelectedJobId(job.id)}>Xem</AdminButton>
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-500">Job {job.id.slice(0, 8)} · {formatDate(job.created_at)}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">Lần chạy {job.attempt_count}/{job.max_attempts}{job.provider ? ` · ${job.provider}` : ""}</p>
                  {job.error_message ? <AdminAlert className="mt-3" tone="danger" title={job.error_code || "Job thất bại"}>{job.error_message}</AdminAlert> : null}
                </article>
              ))}
            </div>

            <section className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black text-slate-900">Kết quả job</h3>
                {selectedJob ? <div className="flex flex-wrap gap-2"><AdminBadge tone={jobStatusTone(selectedJob.status)}>{jobStatusLabel[selectedJob.status]}</AdminBadge>{selectedJob.model ? <AdminBadge tone="neutral">{selectedJob.model}</AdminBadge> : null}</div> : null}
              </div>
              {selectedJob ? <AiReadableResult text={selectedJob.response_text} emptyMessage="Job chưa hoàn thành hoặc chưa có nội dung trả về." /> : <AdminEmptyState title="Chưa chọn job" description="Chọn Xem ở danh sách bên trái." />}
            </section>
          </AdminSurfaceBody>
        </AdminSurface>
      ) : null}

      {has("ai.execute") ? (
        <AdminSurface>
          <AdminSurfaceHeader title="Tạo action chờ phê duyệt" description="Action hiện hỗ trợ đề xuất ghi chú nội bộ cho đơn hàng. Người tạo không thể tự duyệt." />
          <AdminSurfaceBody className="grid gap-4">
            <AdminField label="Order UUID"><AdminInput value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="Order UUID" /></AdminField>
            <AdminField label="Ghi chú nội bộ đề xuất"><AdminTextarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nội dung ghi chú nội bộ đề xuất" /></AdminField>
            <div><AdminButton tone="success" disabled={busy || !orderId || !note.trim()} onClick={() => void requestAction()}>Gửi action chờ duyệt</AdminButton></div>
          </AdminSurfaceBody>
        </AdminSurface>
      ) : null}

      {has("ai.audit") ? (
        <AdminSurface>
          <AdminSurfaceHeader
            title="Action chờ phê duyệt"
            description="Backend kiểm tra tách người tạo/người duyệt và permission nghiệp vụ trước khi thực thi."
            actions={<AdminButton size="sm" tone="secondary" onClick={() => void loadActions()}>Tải lại</AdminButton>}
          />
          <AdminSurfaceBody className="grid gap-3">
            {actions.length === 0 ? <AdminEmptyState title="Chưa có action" description="Không có đề xuất nào đang chờ xử lý." /> : actions.map((action) => (
              <article key={action.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black text-slate-900">{action.action_key}</h3>
                  <AdminBadge tone={action.status === "pending" ? "warning" : action.status === "executed" ? "success" : "neutral"}>{action.status}</AdminBadge>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-600">Target: {action.target_id ?? "-"}</p>
                <p className="mt-1 text-sm font-medium leading-6 text-slate-700">{action.payload?.note ?? "Không có nội dung"}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{action.requested_reason}</p>
                {action.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {has("orders.internal_notes") ? <AdminButton size="sm" tone="success" disabled={busy} onClick={() => void reviewAction(action.id, "approve")}>Phê duyệt và thực thi</AdminButton> : null}
                    <AdminButton size="sm" tone="danger" disabled={busy} onClick={() => void reviewAction(action.id, "reject")}>Từ chối</AdminButton>
                  </div>
                ) : null}
              </article>
            ))}
          </AdminSurfaceBody>
        </AdminSurface>
      ) : null}
    </div>
  );
}
