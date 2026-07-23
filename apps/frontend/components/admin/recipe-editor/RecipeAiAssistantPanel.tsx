"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { AiRecipeDraftDiff } from "../ai/AiRecipeDraftDiff";
import { RecipeAiAuditResult } from "../ai/RecipeAiAuditResult";
import { RecipeCostPreview, type RecipeCostPreviewData } from "../ai/RecipeCostPreview";
import {
  aiRecipeDraftStatusLabel,
  aiRecipeDraftStatusTone,
  isRecipeSopDraftContent,
  recipeDraftTaskLabel,
  type AiRecipeDraft,
  type RecipeDraftTask,
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

type LegacySuggestedStep = { title: string; content: string };
type CopilotMode = "audit" | "cost" | RecipeDraftTask | null;

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

const modeLabel: Record<Exclude<CopilotMode, null>, string> = {
  audit: "Kiểm tra công thức",
  sop: "Tạo SOP",
  qc: "Tạo QC",
  dosing: "Chuẩn hóa định lượng",
  cost: "Tính giá vốn",
};

function draftRequest(task: RecipeDraftTask, recipeTitle: string) {
  if (task === "qc") {
    return {
      title: `QC nháp - ${recipeTitle}`,
      prompt: `[RECIPE_TASK:QC]\nTạo phần kiểm soát chất lượng cho công thức ${recipeTitle}. Chỉ trả một JSON object hợp lệ theo cấu trúc {"task":"qc","steps":[{"title":"...","content":"..."}]}. Tạo tối đa 3 bước mới, tiêu đề phải bắt đầu bằng "Kiểm soát chất lượng". Nội dung phải nêu tiêu chí quan sát được, ngưỡng hoặc dấu hiệu đạt khi dữ liệu nguồn có hỗ trợ, lỗi cần loại bỏ và thời điểm kiểm tra. Không tự bịa nhiệt độ, hạn sử dụng hoặc định lượng chưa có trong dữ liệu. Không markdown và không thêm nội dung ngoài JSON.`,
    };
  }
  if (task === "dosing") {
    return {
      title: `Định lượng nháp - ${recipeTitle}`,
      prompt: `[RECIPE_TASK:DOSING]\nChuẩn hóa định lượng trong các bước pha chế của công thức ${recipeTitle}. Chỉ trả một JSON object hợp lệ theo cấu trúc {"task":"dosing","steps":[{"title":"...","content":"..."}]}. Chỉ trả các bước thực sự cần chỉnh. Giữ nguyên chính xác tiêu đề bước hiện tại để hệ thống ghép đúng bước; trong content thay cách cân đong khó vận hành bằng dụng cụ đo rõ ràng nhưng không thay đổi lượng nguyên liệu gốc. Không bịa quy đổi khi dữ liệu không đủ. Không markdown và không thêm nội dung ngoài JSON.`,
    };
  }
  return {
    title: `SOP nháp - ${recipeTitle}`,
    prompt: `[RECIPE_TASK:SOP]\nAudit công thức ${recipeTitle} và viết lại SOP cách làm. Chỉ trả một JSON object hợp lệ theo cấu trúc {"task":"sop","steps":[{"title":"...","content":"..."}]}. Mỗi bước phải có thao tác, định lượng liên quan, thời gian hoặc nhiệt độ khi dữ liệu có sẵn, tiêu chí đạt và lỗi cần tránh. Không markdown và không thêm nội dung ngoài JSON.`,
  };
}

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
  const [mode, setMode] = useState<CopilotMode>(null);
  const [draft, setDraft] = useState<AiRecipeDraft | null>(null);
  const [cost, setCost] = useState<RecipeCostPreviewData | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canUse = has("ai.use");
  const canDraft = has("ai.execute") && has("recipes.edit");
  const canApply = canDraft && has("recipes.media.manage");
  const canCost = canUse && has("catalog.view") && has("recipes.view");

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
    setCost(null);
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

  function assertSaved(): boolean {
    if (!dirty) return true;
    setMessage("Hãy lưu công thức trước để trợ lý đọc đúng phiên bản mới nhất.");
    return false;
  }

  async function runAudit() {
    if (!assertSaved()) return;
    setBusy(true);
    setMessage("");
    setMode("audit");
    setCost(null);
    try {
      const prompt = `Kiểm tra riêng công thức ${recipeTitle} cho người trực tiếp pha chế. Đánh giá đủ 8 tiêu chí vận hành, chỉ dùng dữ liệu backend cung cấp và không tự bịa giá vốn, hạn sử dụng hoặc nhiệt độ.`;
      const payload = await adminApiFetch<{ jobId: string }>(
        "/api/admin/ai/query",
        await token(),
        { method: "POST", body: JSON.stringify({ prompt, scopes: ["recipes"], recipeId }) },
      );
      setJob({ id: payload.jobId, status: "pending", draft_id: null, response_text: null, error_code: null, error_message: null });
      setMessage("Đang kiểm tra công thức.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không gửi được yêu cầu kiểm tra.");
    } finally {
      setBusy(false);
    }
  }

  async function runDraft(task: RecipeDraftTask) {
    if (!assertSaved() || !canDraft || locked) return;
    setBusy(true);
    setMessage("");
    setMode(task);
    setCost(null);
    setDraft(null);
    try {
      const request = draftRequest(task, recipeTitle);
      const payload = await adminApiFetch<{ jobId: string }>(
        "/api/admin/ai/drafts",
        await token(),
        {
          method: "POST",
          body: JSON.stringify({
            prompt: request.prompt,
            draftType: "recipe",
            title: request.title,
            scopes: ["recipes"],
            recipeId,
          }),
        },
      );
      setJob({ id: payload.jobId, status: "pending", draft_id: null, response_text: null, error_code: null, error_message: null });
      setMessage(`Đang ${modeLabel[task].toLocaleLowerCase("vi-VN")}. Khi hoàn thành, bản nháp sẽ chờ một người khác duyệt.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được bản nháp.");
    } finally {
      setBusy(false);
    }
  }

  async function calculateCost() {
    if (!assertSaved() || !canCost) return;
    setBusy(true);
    setMessage("");
    setMode("cost");
    setJob(null);
    try {
      const payload = await adminApiFetch<{ cost: RecipeCostPreviewData }>(
        `/api/admin/recipe-copilot/${recipeId}/cost-preview`,
        await token(),
      );
      setCost(payload.cost);
      setMessage(payload.cost.status === "ready" ? "Đã tính đủ giá vốn từ dữ liệu catalog hiện tại." : "Đã kiểm tra giá vốn và chỉ rõ dữ liệu còn thiếu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tính được giá vốn.");
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
      setMessage(error instanceof Error ? error.message : "Không áp dụng được bản nháp.");
    } finally {
      setBusy(false);
    }
  }

  if (!canUse) {
    return (
      <AdminAlert tone="warning" title="Recipe Copilot chưa được cấp quyền">
        Tài khoản cần quyền ai.use để dùng kiểm tra công thức, tạo SOP, tạo QC và tính giá vốn.
      </AdminAlert>
    );
  }

  const draftTask: RecipeDraftTask = draft && isRecipeSopDraftContent(draft.content)
    ? draft.content.task || "sop"
    : "sop";

  const panel = (
    <div className="mb-4">
      <AdminSurface>
        <AdminSurfaceHeader
          eyebrow="Recipe Copilot"
          title="Kiểm tra và làm nháp một chạm"
          description="Chọn đúng việc cần làm. Trợ lý tạo đề xuất; mọi thay đổi nội dung vẫn phải qua người khác duyệt trước khi áp dụng."
          actions={<AdminButton tone="dark" size="sm" disabled={busy || dirty} onClick={() => void runAudit()}>Kiểm tra công thức</AdminButton>}
        />
        <AdminSurfaceBody className="grid gap-4">
          {dirty ? <AdminAlert tone="warning" title="Cần lưu trước">Công thức có thay đổi chưa lưu. Hãy lưu để trợ lý làm việc trên đúng phiên bản.</AdminAlert> : null}

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-black text-slate-950">Hành động nhanh</h4>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">Không cần gõ prompt. Mỗi nút chỉ dùng dữ liệu của công thức đang mở.</p>
              </div>
              {mode ? <AdminBadge tone="orange">{modeLabel[mode]}</AdminBadge> : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {canDraft && !locked ? <AdminButton className="w-full justify-center" tone="primary" disabled={busy || dirty} onClick={() => void runDraft("sop")}>Tạo SOP</AdminButton> : null}
              {canDraft && !locked ? <AdminButton className="w-full justify-center" tone="secondary" disabled={busy || dirty} onClick={() => void runDraft("qc")}>Tạo QC</AdminButton> : null}
              {canDraft && !locked ? <AdminButton className="w-full justify-center" tone="secondary" disabled={busy || dirty} onClick={() => void runDraft("dosing")}>Chuẩn hóa định lượng</AdminButton> : null}
              {canCost ? <AdminButton className="w-full justify-center" tone="dark" disabled={busy || dirty} onClick={() => void calculateCost()}>Tính giá vốn</AdminButton> : null}
            </div>
            {!canCost ? <p className="mt-2 text-xs font-bold text-slate-500">Tính giá vốn cần quyền xem catalog.</p> : null}
          </section>

          {job ? (
            <div className="flex flex-wrap items-center gap-2">
              <AdminBadge tone={jobStatusTone[job.status]}>{jobStatusLabel[job.status]}</AdminBadge>
              {mode && mode !== "cost" ? <AdminBadge tone="orange">{modeLabel[mode]}</AdminBadge> : null}
            </div>
          ) : null}

          {job?.status === "failed" ? <AdminAlert tone="danger" title="Trợ lý chưa hoàn thành">{job.error_message || "Không tạo được kết quả. Hãy thử lại."}</AdminAlert> : null}

          {job?.status === "completed" && mode === "audit" ? (
            <section>
              <h4 className="mb-3 font-black text-slate-900">Kết quả kiểm tra</h4>
              <RecipeAiAuditResult text={job.response_text} />
            </section>
          ) : null}

          {mode === "cost" ? <RecipeCostPreview cost={cost} /> : null}

          {draft ? (
            <section className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <AdminBadge tone={aiRecipeDraftStatusTone(draft.status)}>{aiRecipeDraftStatusLabel[draft.status]}</AdminBadge>
                    <AdminBadge tone="info">{recipeDraftTaskLabel[draftTask]}</AdminBadge>
                    {draft.appliedRecipeVersionNo ? <AdminBadge tone="success">Phiên bản {draft.appliedRecipeVersionNo}</AdminBadge> : null}
                  </div>
                  <h4 className="mt-2 font-black text-slate-900">{draft.title}</h4>
                </div>
                {draft.status === "approved" && canApply && !locked ? <AdminButton tone="success" disabled={dirty || busy} onClick={openApplyDialog}>Chọn phần áp dụng</AdminButton> : null}
              </div>

              {draft.status === "draft" ? <AdminAlert tone="warning" title="Đang chờ duyệt">Bản nháp đã được lưu và đang chờ một người khác kiểm tra, duyệt hoặc từ chối.</AdminAlert> : null}
              {draft.status === "rejected" ? <AdminAlert tone="danger" title="Bản nháp bị từ chối">{draft.reviewNote || "Người duyệt chưa chấp nhận đề xuất này."}</AdminAlert> : null}
              {draft.status === "approved" ? <AdminAlert tone="success" title="Bản nháp đã được duyệt">{draft.reviewNote || "Bạn có thể chọn từng phần để áp dụng."}</AdminAlert> : null}
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
              ) : <AdminAlert tone="danger" title="Bản nháp không hợp lệ">Không đọc được các bước đề xuất. Hãy tạo lại bản nháp.</AdminAlert>}
            </section>
          ) : !job && mode !== "cost" ? <AdminEmptyState title="Chưa có đề xuất" description="Dùng các nút hành động nhanh để tạo SOP, QC hoặc chuẩn hóa định lượng." /> : null}

          {message ? <AdminAlert tone={message.startsWith("Đã") || message.startsWith("Đang") ? "success" : "warning"}>{message}</AdminAlert> : null}
        </AdminSurfaceBody>
      </AdminSurface>
    </div>
  );

  return (
    <>
      {stepsTarget ? createPortal(panel, stepsTarget) : panel}

      <AdminDialog
        open={applyOpen}
        size="xl"
        eyebrow="Áp dụng đề xuất đã duyệt"
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
        ) : <AdminAlert tone="danger">Bản nháp không còn dữ liệu hợp lệ.</AdminAlert>}
      </AdminDialog>
    </>
  );
}
