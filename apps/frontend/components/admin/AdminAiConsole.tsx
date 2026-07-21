"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { useAdminPermissions } from "./AdminPermissionProvider";

type AiJob = {
  id: string;
  job_type: "read_only" | "draft";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
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

export function AdminAiConsole() {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [actions, setActions] = useState<AiAction[]>([]);

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  async function loadJobs() {
    if (!has("ai.use")) return;
    const payload = await adminApiFetch<{ jobs: AiJob[] }>(
      "/api/admin/ai/jobs",
      await token(),
    );
    setJobs(payload.jobs);
    const latestCompleted = payload.jobs.find((job) => job.status === "completed" && job.response_text);
    if (latestCompleted?.response_text) setResult(latestCompleted.response_text);
  }

  async function loadActions() {
    if (!has("ai.audit")) return;
    const payload = await adminApiFetch<{ actions: AiAction[] }>(
      "/api/admin/ai/actions",
      await token(),
    );
    setActions(payload.actions);
  }

  useEffect(() => {
    void loadJobs().catch(() => undefined);
    void loadActions().catch(() => undefined);
    const timer = window.setInterval(() => {
      void loadJobs().catch(() => undefined);
      void loadActions().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
    // Permission state is stable for the lifetime of the admin shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enqueue(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const payload = await adminApiFetch<{ jobId: string; status: string }>(
        path,
        await token(),
        { method: "POST", body: JSON.stringify(body) },
      );
      setMessage(`Đã đưa AI job ${payload.jobId} vào hàng đợi.`);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được AI job.");
    } finally {
      setBusy(false);
    }
  }

  async function runQuery() {
    await enqueue("/api/admin/ai/query", {
      prompt,
      scopes: ["orders", "customers", "catalog", "recipes"],
    });
  }

  async function createDraft() {
    await enqueue("/api/admin/ai/drafts", {
      prompt,
      draftType: "operations_note",
      title: draftTitle || "AI draft",
      scopes: ["orders", "customers", "catalog", "recipes"],
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
      setMessage(`Đã gửi action ${payload.actionRequestId} để người khác phê duyệt.`);
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

  return (
    <div className="grid gap-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">AI read-only / draft</h2>
        <p className="mt-2 text-sm text-slate-600">AI chạy nền trên backend VPS. Trang này chỉ gửi job và đọc kết quả từ PostgreSQL.</p>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-4 min-h-32 w-full rounded-2xl border border-slate-300 p-4 text-sm" placeholder="Ví dụ: Tóm tắt tình hình đơn hàng và chỉ ra bất thường." />
        <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" placeholder="Tiêu đề draft" />
        <div className="mt-4 flex flex-wrap gap-3">
          {has("ai.use") ? <button disabled={busy || prompt.trim().length < 3} onClick={runQuery} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Đưa query vào hàng đợi</button> : null}
          {has("ai.execute") ? <button disabled={busy || prompt.trim().length < 3} onClick={createDraft} className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Đưa draft vào hàng đợi</button> : null}
        </div>
        {result ? <pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{result}</pre> : null}
      </section>

      {has("ai.use") ? (
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">AI jobs</h2>
            <button onClick={() => void loadJobs()} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Tải lại</button>
          </div>
          <div className="mt-4 grid gap-3">
            {jobs.length === 0 ? <p className="text-sm text-slate-500">Chưa có AI job.</p> : jobs.map((job) => (
              <article key={job.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black text-slate-950">{job.job_type}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{job.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Lần chạy: {job.attempt_count}/{job.max_attempts}</p>
                {job.error_message ? <p className="mt-2 text-sm text-rose-600">{job.error_code}: {job.error_message}</p> : null}
                {job.response_text ? <p className="mt-2 line-clamp-3 text-sm text-slate-700">{job.response_text}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {has("ai.execute") ? (
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">AI action cần phê duyệt</h2>
          <p className="mt-2 text-sm text-slate-600">Action hiện hỗ trợ: đề xuất ghi chú nội bộ cho đơn hàng. Người tạo không thể tự duyệt.</p>
          <input value={orderId} onChange={(event) => setOrderId(event.target.value)} className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm" placeholder="Order UUID" />
          <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-3 min-h-28 w-full rounded-2xl border border-slate-300 p-4 text-sm" placeholder="Nội dung ghi chú nội bộ đề xuất" />
          <button disabled={busy || !orderId || !note.trim()} onClick={requestAction} className="mt-4 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Gửi action chờ duyệt</button>
        </section>
      ) : null}

      {has("ai.audit") ? (
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Action chờ phê duyệt</h2>
              <p className="mt-1 text-sm text-slate-600">Người tạo không thể tự duyệt. Backend kiểm tra quyền nghiệp vụ trước khi thực thi.</p>
            </div>
            <button onClick={() => void loadActions()} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Tải lại</button>
          </div>
          <div className="mt-4 grid gap-3">
            {actions.length === 0 ? <p className="text-sm text-slate-500">Chưa có action nào.</p> : actions.map((action) => (
              <article key={action.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black text-slate-950">{action.action_key}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{action.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">Target: {action.target_id ?? "-"}</p>
                <p className="mt-1 text-sm text-slate-700">{action.payload?.note ?? "Không có nội dung"}</p>
                <p className="mt-1 text-xs text-slate-500">{action.requested_reason}</p>
                {action.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {has("orders.internal_notes") ? <button disabled={busy} onClick={() => reviewAction(action.id, "approve")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Phê duyệt và thực thi</button> : null}
                    <button disabled={busy} onClick={() => reviewAction(action.id, "reject")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Từ chối</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {message ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}
    </div>
  );
}
