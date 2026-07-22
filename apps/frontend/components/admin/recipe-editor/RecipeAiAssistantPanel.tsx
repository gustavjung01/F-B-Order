"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { AiRecipeDraftDiff } from "../ai/AiRecipeDraftDiff";
import { RecipeAiAuditResult } from "../ai/RecipeAiAuditResult";
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
  processing: "Đang kiểm tra",
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

type LegacySuggestedStep = { title: string; content: string };

type RecipeAiAssistantPanelProps = {
  recipeId: string;
  recipeTitle: string;
  dirty: boolean;
  locked: boolean;
  onApplied?: () => void | Promise<void>;
  /** @deprecated Persisted AI drafts are applied by the backend, never merged locally. */
  onApplySteps?: (steps: LegacySuggestedStep[]) => void;
  /** @deprecated The panel now mounts directly into the Steps tab slot. */
  onOpenSteps?: () => void;
};

export function RecipeAiAssistantPanel({
  recipeId,
  recipeTitle,
  dirty,
  locked,
  onApplied,
}: RecipeAiAssistantPanelProps) {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const [stepsTarget, setStepsTarget] = useState<HTMLElement | null>(null);
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

  useEffect(() => {
    setStepsTarget(document.getElementById("recipe-ai-sop-target"));
  });

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
        setMessage(error instanceof Error ? error.message : "Không đọc được trạng thái trợ lý.");
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
      setMessage("Hãy lưu công thức trước để trợ lý đọc đúng phiên bản mới nhất.");
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
        : `Kiểm tra riêng công thức ${recipeTitle} cho người trực tiếp pha chế. Trả lời tiếng Việt ngắn gọn, dễ làm theo và không chào hỏi. Chỉ dùng 5 mục: Kết luận nhanh; Điểm cần chỉnh (tối đa 5 điểm quan trọng); SOP đề xuất; Tiêu chí kiểm soát; Dữ liệu cần bổ sung. Tuyệt đối không trả JSON, code block, action_key, ID, permission, payload hay trạng thái hệ thống. Không viết mục Hành động đề xuất vì giao diện đã có nút tạo SOP nháp riêng.`;
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
      setMessage(isDraft ? "Đang tạo SOP nháp. Khi hoàn thành, bản nháp sẽ chờ một người khác duyệt." : "Đang kiểm tra công thức.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không gửi được yêu cầu cho trợ lý.");
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
      if (onApplied) {
        await onApplied();
        setMessage(`Đã áp dụng ${result.selectedStepCount} phần và tạo phiên bản công thức số ${result.recipeVersionNo}. Hình ảnh hiện có được giữ nguyên.`);
      } else {
        window.location.reload();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không áp dụng được SOP nháp.");
    } finally {
      setBusy(false);
    }
  }

  if (!canUse) return null;

  const panel = (
    <div className="mb-4">
      <AdminSurface>
        <AdminSurfaceHeader
          eyebrow="Trợ lý công thức"
          title="Kiểm tra và chuẩn hóa cách làm"
          description="Trợ lý chỉ ra điểm cần sửa bằng ngôn ngữ dễ hiểu. Khi cần cập nhật, hãy tạo SOP nháp để một người khác duyệt trước khi áp dụng."
          actions={(
            <>
              <AdminButton tone="dark" size="sm" disabled={busy || dirty} onClick={() => void enqueue("audit")}>Kiểm tra công thức</AdminButton>
              {canDraft && !locked ? <AdminButton tone="primary" size="sm" disabled={busy || dirty} onClick={() => void enqueue("draft")}>Tạo SOP nháp</AdminButton> : null}
            </>
          )}
        />
        <AdminSurfaceBody className="grid gap-4">
          {dirty ? <AdminAlert tone="warning" title="Cần lưu trước">Công thức có thay đổi chưa lưu. Hãy lưu để trợ lý làm việc trên đúng phiên bản.</AdminAlert> : null}

          {job ? (
            <div className="flex flex-wrap items-center gap-2">
              <AdminBadge tone={jobStatusTone[job.status]}>{jobStatusLabel[job.status]}</AdminBadge>
              {mode ? <AdminBadge tone="orange">{mode === "audit" ? "Kiểm tra công thức" : "SOP nháp"}</AdminBadge> : null}
            </div>
          ) : null}

          {job?.status === "failed" ? <AdminAlert tone="danger" title="Trợ lý chưa hoàn thành">{job.error_message || "Không tạo được kết quả. Hãy thử lại."}</AdminAlert> : null}

          {job?.status === "completed" && mode === "audit" ? (
            <section>
              <h4 className="mb-3 font-black text-slate-900">Kết quả kiểm tra</h4>
              <RecipeAiAuditResult text={job.response_text} />
            </section>
          ) : null}

          {draft ? (
            <section className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <AdminBadge tone={aiRecipeDraftStatusTone(draft.status)}>{aiRecipeDraftStatusLabel[draft.status]}</AdminBadge>
                    {draft.appliedRecipeVersionNo ? <AdminBadge tone="success">Phiên bản {draft.appliedRecipeVersionNo}</AdminBadge> : null}
                  </div>
                  <h4 className="mt-2 font-black text-slate-900">{draft.title}</h4>
                </div>
                {draft.status === "approved" && canApply && !locked ? <AdminButton tone="success" disabled={dirty || busy} onClick={openApplyDialog}>Chọn phần áp dụng</AdminButton> : null}
              </div>

              {draft.status === "draft" ? <AdminAlert tone="warning" title="Đang chờ duyệt">SOP nháp đã được lưu và đang chờ một người khác kiểm tra, duyệt hoặc từ chối.</AdminAlert> : null}
              {draft.status === "rejected" ? <AdminAlert tone="danger" title="SOP nháp bị từ chối">{draft.reviewNote || "Người duyệt chưa chấp nhận đề xuất này."}</AdminAlert> : null}
              {draft.status === "approved" ? <AdminAlert tone="success" title="SOP nháp đã được duyệt">{draft.reviewNote || "Bạn có thể chọn từng phần để áp dụng."}</AdminAlert> : null}
              {draft.status === "applied" ? <AdminAlert tone="success" title="Đã tạo phiên bản công thức mới">Đã áp dụng {draft.applicationData?.selectedStepCount || 0} phần vào phiên bản {draft.appliedRecipeVersionNo || "mới"}.</AdminAlert> : null}

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
              ) : <AdminAlert tone="danger" title="SOP nháp không hợp lệ">Không đọc được các bước đề xuất. Hãy tạo lại bản nháp.</AdminAlert>}
            </section>
          ) : !job ? <AdminEmptyState title="Chưa có SOP nháp" description="Tạo SOP nháp khi bạn muốn cập nhật cách làm sau khi kiểm tra." /> : null}

          {message ? <AdminAlert tone={message.startsWith("Đã") || message.startsWith("Đang") ? "success" : "warning"}>{message}</AdminAlert> : null}
        </AdminSurfaceBody>
      </AdminSurface>
    </div>
  );

  return (
    <>
      {stepsTarget ? createPortal(panel, stepsTarget) : null}

      <AdminDialog
        open={applyOpen}
        size="xl"
        eyebrow="Áp dụng SOP đã duyệt"
        title="Chọn từng phần để tạo phiên bản công thức mới"
        description="Chỉ các bước được chọn mới được cập nhật. Thứ tự và hình ảnh hiện có vẫn được giữ nguyên."
        closeDisabled={busy}
        onClose={() => { if (!busy) setApplyOpen(false); }}
        footer={(
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-600">Đã chọn {selectedStepIds.length} phần</p>
            <div className="flex flex-wrap gap-2">
              <AdminButton tone="secondary" disabled={busy} onClick={() => setApplyOpen(false)}>Đóng</AdminButton>
              <AdminButton tone="success" disabled={busy || selectedStepIds.length === 0} onClick={() => void applySelected()}>Tạo phiên bản mới</AdminButton>
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
        ) : <AdminAlert tone="danger">SOP nháp không còn dữ liệu hợp lệ.</AdminAlert>}
      </AdminDialog>
    </>
  );
}
