"use client";

import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
  AdminTextarea,
} from "@/components/admin/ui/AdminUI";
import { RecipeVersionComparePanel } from "./RecipeVersionComparePanel";
import type { CompletionItem, FormState, Version } from "./types";
import { formatDate, workflowLabel } from "./types";

export function RecipePublishTab({
  form,
  versions,
  completion,
  reviewInput,
  canReview,
  onReviewInputChange,
}: {
  form: FormState;
  versions: Version[];
  completion: CompletionItem[];
  reviewInput: string;
  canReview: boolean;
  onReviewInputChange: (value: string) => void;
}) {
  const missing = completion.filter((item) => !item.complete);
  return (
    <div className="space-y-4">
      <AdminSurface>
        <AdminSurfaceHeader
          title="Sẵn sàng xuất bản"
          description="Kiểm tra nội dung trước khi chuyển workflow."
          actions={<AdminBadge tone={missing.length ? "warning" : "success"}>{missing.length ? `Còn ${missing.length} mục` : "Đã hoàn thiện"}</AdminBadge>}
        />
        <AdminSurfaceBody>
          <div className="grid gap-2 sm:grid-cols-2">
            {completion.map((item) => (
              <div key={item.id} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-bold ${item.complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white font-black">{item.complete ? "✓" : "!"}</span>
                {item.label}
              </div>
            ))}
          </div>
        </AdminSurfaceBody>
      </AdminSurface>

      {form.workflowStatus === "in_review" ? (
        canReview ? (
          <AdminSurface>
            <AdminSurfaceHeader title="Quyết định review" description="Nhận xét bắt buộc khi yêu cầu chỉnh sửa. Hành động workflow chỉ nằm ở footer." />
            <AdminSurfaceBody>
              <AdminTextarea value={reviewInput} onChange={(event) => onReviewInputChange(event.target.value)} placeholder="Nhận xét review" />
            </AdminSurfaceBody>
          </AdminSurface>
        ) : (
          <AdminAlert tone="info" title="Đang chờ người review">Tài khoản cần permission recipes.review để nhập nhận xét và ra quyết định.</AdminAlert>
        )
      ) : null}

      {form.reviewNote ? <AdminAlert tone="warning" title="Nhận xét gần nhất"><p className="whitespace-pre-wrap">{form.reviewNote}</p></AdminAlert> : null}

      {form.id ? (
        <>
          <AdminSurface>
            <AdminSurfaceHeader title="Lịch sử phiên bản" />
            <AdminSurfaceBody>
              {versions.length ? (
                <div className="grid gap-2">
                  {versions.map((version) => (
                    <article key={version.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <b>v{version.versionNo} · {workflowLabel[version.workflowStatus || "draft"]}{version.isCurrent ? " · hiện tại" : ""}{version.isPublished ? " · công khai" : ""}</b>
                        <span className="text-xs font-medium text-slate-500">{formatDate(version.createdAt)}</span>
                      </div>
                      {version.changeNote ? <p className="mt-2 text-sm font-medium text-slate-600">{version.changeNote}</p> : null}
                    </article>
                  ))}
                </div>
              ) : <AdminEmptyState title="Chưa có lịch sử phiên bản" className="min-h-28" />}
            </AdminSurfaceBody>
          </AdminSurface>

          <AdminSurface>
            <AdminSurfaceHeader
              eyebrow="Phase 4"
              title="Phân tích Recipe Version"
              description="Backend dựng diff, cost delta và cờ rủi ro trước. AI chỉ giải thích dữ liệu đã được tính, không tự sửa hoặc publish công thức."
            />
            <AdminSurfaceBody>
              <RecipeVersionComparePanel recipeId={form.id} versions={versions} />
            </AdminSurfaceBody>
          </AdminSurface>
        </>
      ) : null}
    </div>
  );
}

export function RecipeEditorFooter({
  form,
  dirty,
  saving,
  uploading,
  reviewInput,
  canEdit,
  canReview,
  canPublish,
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
  canEdit: boolean;
  canReview: boolean;
  canPublish: boolean;
  onClose: () => void;
  onSave: () => void;
  onSubmitReview: () => void;
  onRequestChanges: () => void;
  onApprove: () => void;
  onPublish: () => void;
}) {
  const busy = saving || uploading;
  const workflowReady = !dirty && !busy;
  const editable = canEdit && form.workflowStatus !== "in_review" && form.workflowStatus !== "approved";
  const status = form.workflowStatus || "draft";

  return (
    <footer className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:static md:p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="hidden md:block">
          <p className="text-xs font-black uppercase text-slate-500">Workflow hiện tại</p>
          <p className="text-sm font-black">{workflowLabel[status]}{dirty ? " · chưa lưu" : " · đã đồng bộ"}</p>
        </div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2 md:flex md:justify-end">
          <AdminButton disabled={busy} onClick={onClose}>Đóng</AdminButton>
          {editable ? <AdminButton tone="primary" disabled={busy} onClick={onSave}>{saving ? "Đang lưu…" : form.id ? "Lưu version mới" : "Tạo công thức"}</AdminButton> : null}
          {canEdit && form.id && (status === "draft" || status === "changes_requested") ? <AdminButton tone="dark" disabled={!workflowReady} onClick={onSubmitReview}>Gửi review</AdminButton> : null}
          {canReview && form.id && status === "in_review" ? <>
            <AdminButton tone="warning" disabled={!workflowReady || !reviewInput.trim()} onClick={onRequestChanges}>Yêu cầu chỉnh sửa</AdminButton>
            <AdminButton tone="success" disabled={!workflowReady} onClick={onApprove}>Duyệt phiên bản</AdminButton>
          </> : null}
          {canPublish && form.id && status === "approved" ? <AdminButton tone="success" disabled={!workflowReady} onClick={onPublish}>Xuất bản</AdminButton> : null}
        </div>
      </div>
    </footer>
  );
}
