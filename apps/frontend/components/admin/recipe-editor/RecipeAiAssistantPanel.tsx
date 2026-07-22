"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { AiReadableResult } from "../ai/AiReadableResult";
import { AiRecipeDraftDiff } from "../ai/AiRecipeDraftDiff";
import {
  aiRecipeDraftStatusLabel,
  aiRecipeDraftStatusTone,
  isRecipeSopDraftContent,
  type AiRecipeDraft,
} from "../ai/recipe-draft-types";
import { useAdminPermissions } from "../AdminPermissionProvider";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminDialog,
  AdminEmptyState,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
} from "../ui/AdminUI";

const jobStatusLabel = {
  pending: "Đang chờ",
  processing: "Đang xử lý",
  completed: "Hoàn thành",
  failed: "Thất bại",
  cancelled: "Đã hủy",
} as const;

const jobStatusTone = {
  pending: "warning",
  processing: "info",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
} as const;

type AiJob = {
  id: string;
  status: keyof typeof jobStatusLabel;
  draft_id: string | null;
  response_text: string | null;
  error_code: string | null;
  error_message: string | null;
};

type ApplyResult = {
  recipeVersionNo: number;
  selectedStepCount: number;
};

export function RecipeAiAssistantPanel({
  recipeId,
  recipeTitle,
  dirty,
  locked,
  onApplied,
}: {
  recipeId: string;
  recipeTitle: string;
  dirty: boolean;
  locked: boolean;
  onApplied: () => void | Promise<void>;
}) {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const [job, setJob] = useState<AiJob | null>(null);
  const [mode, setMode] = useState<"audit" | "draft" | null>(null);
  const [draft, setDraft] = useState<AiRecipeDraft | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canUse = has("ai.use");
  const canDraft = has("ai.execute") && has("recipes.edit");
  const canApply = canDraft && has("recipes.media.manage");

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  async function loadJob(jobId: string) {
    const payload = await adminApiFetch<{ job: AiJob }>(
      `/api/admin/ai/jobs/${jobId}`,
      await token(),
    );
    setJob(payload.job);
    if (payload.job.status === "completed" && payload.job.draft_id) {
      await loadDraft(payload.job.draft_id);
    }
  }

  async function loadDraft(draftId: string) {
    const payload = await adminApiFetch<{ draft: AiRecipeDraft }>(
      `/api/admin/ai/drafts/${draftId}`,
      await token(),
    );
    setDraft(payload.draft);
  }

  async function loadLatestDraft() {
    if (!canUse) return;
    const payload = await adminApiFetch<{ drafts: AiRecipeDraft[] }>(
      `/api/admin/ai/drafts?recipeId=${encodeURIComponent(recipeId)}`,
      await token(),
    );
    const latest = payload.drafts.find((item) => item.draftType === "recipe") || null;
    setDraft(latest);
  }

  useEffect(() => {
    setJob(null);
    setMode(null);
    setDraft(null);
    setApplyOpen(false);
    setSelectedStepIds([]);
    if (canUse) void loadLatestDraft().catch(() => undefined);
    // Reload workflow state when the editor changes Recipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, canUse]);

  useEffect(() => {
    if (!job || !["pending", "processing"].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void loadJob(job.id).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Không đọc được trạng thái AI job.");
      });
    }, 2500);
    return () => window.clearInterval(timer);
    // Poll only the active job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!draft || draft.status !== "draft") return;
    const timer = window.setInterval(() => {
      void loadDraft(draft.id).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
    // Poll only while waiting for human review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, draft?.status]);

  async function enqueue(nextMode: "audit" | "draft") {
    if (dirty) {
      setMessage("Hãy lưu công thức trước để AI đọc đúng version mới nhất.");
      return;
    }
    setBusy(true);
    setMessage("");
    setMode(nextMode);
    if (nextMode === "draft") setDraft(null);
    try {
      const isDraft = nextMode === "draft";
      const prompt = isDraft
        ? `Audit công thức ${recipeTitle} và viết lại SOP cách làm. Chỉ trả JSON hợp lệ theo cấu trúc {"steps":[{"title":"...","content":"..."}]}. Mỗi bước phải có thao tác, định lượng liên quan, thời gian hoặc nhiệt độ khi cần, tiêu chí đạt và lỗi cần tránh. Không thêm markdown.`
        : `Audit riêng công thức ${recipeTitle}. Kiểm tra nguyên liệu, định lượng, thứ tự bước, thời gian, nhiệt độ, tiêu chí thành phẩm, bảo quản và các câu hướng dẫn còn sơ sài hoặc mâu thuẫn. Trả lời tiếng Việt theo 6 mục: Kết luận; Lỗi phát hiện; SOP đề xuất; Kiểm soát chất lượng; Dữ liệu thiếu; Hành động đề xuất.`;
      const payload = await adminApiFetch<{ jobId: string }>(
        isDraft ? "/api/admin/ai/drafts" : "/api/admin/ai/query",
        await token(),
        {
          method: "POST",
          body: JSON.stringify(isDraft
            ? { prompt, draftType: "recipe", title: `SOP nháp - ${recipeTitle}`, scopes: ["recipes"], recipeId }
            : { prompt, scopes: ["recipes"], recipeId }),
        },
      );
      setJob({ id: payload.jobId, status: "pending", draft_id: null, response_text: null, error_code: null, error_message: null });
      setMessage(isDraft ? "Đã đưa SOP draft vào hàng đợi. Khi worker xong, draft sẽ chờ reviewer duyệt." : "Đã đưa yêu cầu audit vào hàng đợi AI.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được AI job.");
    } finally {
      setBusy(false);
    }
  }

  function openApplyDialog() {
    if (!draft || draft.status !== "approved" || !isRecipeSopDraftContent(draft.content)) return;
    setSelectedStepIds(draft.content.proposal.steps.map((step) => step.id));
    setApplyOpen(true);
    setMessage("");
  }

  async function applySelected() {
    if (!draft || draft.status !== "approved" || !selectedStepIds.length || dirty || locked || !canApply) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await adminApiFetch<ApplyResult>(
        `/api/admin/ai/drafts/${draft.id}/apply`,
        await token(),
        { method: "POST", body: JSON.stringify({ selectedStepIds }) },
      );
      setApplyOpen(false);
      await loadDraft(draft.id);
      await onApplied();
      setMessage(`Đã áp ${result.selectedStepCount} phần và tạo Recipe version ${result.recipeVersionNo}. Media hiện có được giữ nguyên.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không áp dụng được AI draft.");
    } finally {
      setBusy(false);
    }
  }

  if (!canUse) return null;

  return (
    <>
      <AdminSurface className="mb-4">
        <AdminSurfaceHeader
          eyebrow="AI chuyên gia F&B"
          title="Audit và chuẩn hóa SOP"
          description="AI tạo draft gắn với version hiện tại. Reviewer phải duyệt trước; người có quyền sau đó chọn từng phần để tạo Recipe version mới."
          actions={(
            <>
              <AdminButton tone="dark" size="sm" disabled={busy || dirty} onClick={() => void enqueue("audit")}>Audit cách làm</AdminButton>
              {canDraft && !locked ? <AdminButton tone="primary" size="sm" disabled={busy || dirty} onClick={() => void enqueue("draft")}>Tạo SOP draft</AdminButton> : null}
            </>
          )}
        />
        <AdminSurfaceBody className="grid gap-4">
          {dirty ? <AdminAlert tone="warning" title="Cần lưu trước">Công thức có thay đổi chưa lưu. AI draft phải được tạo từ một Recipe version cố định.</AdminAlert> : null}

          {job ? (
            <div className="flex flex-wrap items-center gap-2">
              <AdminBadge tone="neutral">Job {job.id.slice(0, 8)}</AdminBadge>
              <AdminBadge tone={jobStatusTone[job.status]}>{jobStatusLabel[job.status]}</AdminBadge>
              {mode ? <AdminBadge tone="orange">{mode === "audit" ? "Audit" : "Recipe draft"}</AdminBadge> : null}
            </div>
          ) : null}

          {job?.status === "failed" ? <AdminAlert tone="danger" title={job.error_code || "AI job thất bại"}>{job.error_message || "Worker không tạo được kết quả."}</AdminAlert> : null}

          {job?.status === "completed" && mode === "audit" ? (
            <section>
              <h4 className="mb-3 font-black text-slate-900">Báo cáo audit</h4>
              <AiReadableResult text={job.response_text} />
            </section>
          ) : null}

          {draft ? (
            <section className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <AdminBadge tone={aiRecipeDraftStatusTone(draft.status)}>{aiRecipeDraftStatusLabel[draft.status]}</AdminBadge>
                    <AdminBadge tone="neutral">Base {draft.baseRecipeVersionId?.slice(0, 8) || "-"}</AdminBadge>
                    {draft.appliedRecipeVersionNo ? <AdminBadge tone="success">Recipe v{draft.appliedRecipeVersionNo}</AdminBadge> : null}
                  </div>
                  <h4 className="mt-2 font-black text-slate-900">{draft.title}</h4>
                </div>
                {draft.status === "approved" && canApply && !locked ? <AdminButton tone="success" disabled={dirty || busy} onClick={openApplyDialog}>Chọn phần áp dụng</AdminButton> : null}
              </div>

              {draft.status === "draft" ? <AdminAlert tone="warning" title="Đang chờ reviewer">Draft đã được lưu trong PostgreSQL. Người có `ai.audit` và `recipes.review` phải xem diff rồi duyệt hoặc từ chối.</AdminAlert> : null}
              {draft.status === "rejected" ? <AdminAlert tone="danger" title="Draft bị từ chối">{draft.reviewNote || "Reviewer không chấp nhận đề xuất này."}</AdminAlert> : null}
              {draft.status === "approved" ? <AdminAlert tone="success" title="Draft đã được duyệt">{draft.reviewNote || "Có thể chọn từng phần để áp dụng."}</AdminAlert> : null}
              {draft.status === "applied" ? <AdminAlert tone="success" title="Đã tạo Recipe version mới">Đã áp {draft.applicationData?.selectedStepCount || 0} phần vào Recipe version {draft.appliedRecipeVersionNo || "mới"}.</AdminAlert> : null}

              {isRecipeSopDraftContent(draft.content) ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {draft.content.proposal.steps.map((step, index) => (
                    <article key={step.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminBadge tone="orange">Đề xuất {index + 1}</AdminBadge>
                        <AdminBadge tone={step.currentStepNo ? "info" : "success"}>{step.currentStepNo ? `Bước ${step.currentStepNo}` : "Bước mới"}</AdminBadge>
                      </div>
                      <h5 className="mt-2 font-black text-slate-900">{step.title}</h5>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{step.content}</p>
                    </article>
                  ))}
                </div>
              ) : <AdminAlert tone="danger" title="Draft không hợp lệ">Không đọc được nội dung SOP có cấu trúc.</AdminAlert>}
            </section>
          ) : !job ? <AdminEmptyState title="Chưa có Recipe AI draft" description="Tạo SOP draft để bắt đầu workflow review." /> : null}

          {message ? <AdminAlert tone={message.startsWith("Đã") ? "success" : "warning"}>{message}</AdminAlert> : null}
        </AdminSurfaceBody>
      </AdminSurface>

      <AdminDialog
        open={applyOpen}
        size="xl"
        eyebrow="Apply approved AI draft"
        title="Chọn từng phần để tạo Recipe version mới"
        description="Backend chỉ cập nhật các phần được chọn. Không xóa, không reorder và không ghi đè media của bước hiện tại."
        closeDisabled={busy}
        onClose={() => { if (!busy) setApplyOpen(false); }}
        footer={(
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-600">Đã chọn {selectedStepIds.length} phần</p>
            <div className="flex flex-wrap gap-2">
              <AdminButton tone="secondary" disabled={busy} onClick={() => setApplyOpen(false)}>Đóng</AdminButton>
              <AdminButton tone="success" disabled={busy || selectedStepIds.length === 0} onClick={() => void applySelected()}>Tạo Recipe version mới</AdminButton>
            </div>
          </div>
        )}
      >
        {draft && isRecipeSopDraftContent(draft.content) ? (
          <AiRecipeDraftDiff
            content={draft.content}
            selectable
            selectedStepIds={selectedStepIds}
            onSelectionChange={setSelectedStepIds}
          />
        ) : <AdminAlert tone="danger">Draft không còn dữ liệu SOP hợp lệ.</AdminAlert>}
      </AdminDialog>
    </>
  );
}
