"use client";

import type { CompletionItem, FormState, Version } from "./types";
import { formatDate, workflowLabel } from "./types";

export function RecipePublishTab({
  form,
  versions,
  completion,
  reviewInput,
  onReviewInputChange,
}: {
  form: FormState;
  versions: Version[];
  completion: CompletionItem[];
  reviewInput: string;
  onReviewInputChange: (value: string) => void;
}) {
  const missing = completion.filter((item) => !item.complete);
  return (
    <div className="space-y-4">
      <section className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-lg font-black">Sẵn sàng xuất bản</h3><p className="text-sm font-bold text-slate-500">Kiểm tra nội dung trước khi chuyển workflow.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${missing.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{missing.length ? `Còn ${missing.length} mục` : "Đã hoàn thiện"}</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{completion.map((item) => (
          <div key={item.id} className={`flex items-center gap-3 rounded-xl p-3 text-sm font-bold ${item.complete ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white font-black">{item.complete ? "✓" : "!"}</span>
            {item.label}
          </div>
        ))}</div>
      </section>

      {form.workflowStatus === "in_review" ? (
        <section className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-lg font-black">Quyết định review</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">Nhận xét bắt buộc khi yêu cầu chỉnh sửa. Nút quyết định nằm thống nhất ở footer.</p>
          <textarea value={reviewInput} onChange={(event) => onReviewInputChange(event.target.value)} className="mt-3 min-h-28 w-full rounded-xl bg-slate-100 p-3 text-sm font-bold" placeholder="Nhận xét review" />
        </section>
      ) : null}

      {form.reviewNote ? <section className="rounded-[24px] bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200"><h3 className="font-black">Nhận xét gần nhất</h3><p className="mt-2 whitespace-pre-wrap text-sm font-bold">{form.reviewNote}</p></section> : null}

      {form.id ? (
        <section className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-lg font-black">Lịch sử phiên bản</h3>
          <div className="mt-3 grid gap-2">{versions.map((version) => (
            <article key={version.id} className="rounded-xl bg-slate-100 p-3">
              <div className="flex flex-wrap justify-between gap-2"><b>v{version.versionNo} · {workflowLabel[version.workflowStatus || "draft"]}{version.isCurrent ? " · hiện tại" : ""}{version.isPublished ? " · công khai" : ""}</b><span className="text-xs font-bold text-slate-500">{formatDate(version.createdAt)}</span></div>
              {version.changeNote ? <p className="mt-2 text-sm font-bold text-slate-600">{version.changeNote}</p> : null}
            </article>
          ))}</div>
        </section>
      ) : null}
    </div>
  );
}

const secondaryClass = "rounded-xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-800 disabled:opacity-40";
const primaryClass = "rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40";

export function RecipeEditorFooter({
  form,
  dirty,
  saving,
  uploading,
  reviewInput,
  onClose,
  onSave,
  onSubmitReview,
  onRequestChanges,
  onApprove,
  onPublish,
}: {
  form: FormState;
  dirty: boolean;
  saving: boolean;
  uploading: boolean;
  reviewInput: string;
  onClose: () => void;
  onSave: () => void;
  onSubmitReview: () => void;
  onRequestChanges: () => void;
  onApprove: () => void;
  onPublish: () => void;
}) {
  const busy = saving || uploading;
  const workflowReady = !dirty && !busy;
  const editable = form.workflowStatus !== "in_review" && form.workflowStatus !== "approved";
  const status = form.workflowStatus || "draft";

  return (
    <footer className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:static md:p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="hidden md:block"><p className="text-xs font-black uppercase text-slate-500">Workflow hiện tại</p><p className="text-sm font-black">{workflowLabel[status]}{dirty ? " · chưa lưu" : " · đã đồng bộ"}</p></div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2 md:flex md:justify-end">
          <button type="button" disabled={busy} onClick={onClose} className={secondaryClass}>Đóng</button>

          {editable ? <button type="button" disabled={busy} onClick={onSave} className={primaryClass}>{saving ? "Đang lưu..." : form.id ? "Lưu version mới" : "Tạo công thức"}</button> : null}

          {form.id && (status === "draft" || status === "changes_requested") ? <button type="button" disabled={!workflowReady} onClick={onSubmitReview} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Gửi review</button> : null}

          {form.id && status === "in_review" ? <>
            <button type="button" disabled={!workflowReady || !reviewInput.trim()} onClick={onRequestChanges} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Yêu cầu chỉnh sửa</button>
            <button type="button" disabled={!workflowReady} onClick={onApprove} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Duyệt phiên bản</button>
          </> : null}

          {form.id && status === "approved" ? <button type="button" disabled={!workflowReady} onClick={onPublish} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Xuất bản</button> : null}
        </div>
      </div>
    </footer>
  );
}
