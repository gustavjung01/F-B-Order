"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { AiReadableResult } from "../ai/AiReadableResult";
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
import { AdminToggle } from "../ui/AdminToggle";
import { buildSuggestedRecipeStepComparison } from "./recipe-step-merge.mjs";
import type { Step } from "./types";

const statusLabel = {
  pending: "Đang chờ",
  processing: "Đang xử lý",
  completed: "Hoàn thành",
  failed: "Thất bại",
  cancelled: "Đã hủy",
} as const;

const statusTone = {
  pending: "warning",
  processing: "info",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
} as const;

type AiJob = {
  id: string;
  status: keyof typeof statusLabel;
  response_text: string | null;
  error_code: string | null;
  error_message: string | null;
};

type SuggestedStep = {
  title: string;
  content: string;
};

type RecipeStepResponse = {
  id: string;
  title: string | null;
  content: string;
  imageUrl: string | null;
};

function parseSuggestedSteps(text: string): SuggestedStep[] {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized) as { steps?: unknown };
  if (!Array.isArray(parsed.steps)) throw new Error("AI chưa trả đúng cấu trúc các bước SOP.");
  const steps = parsed.steps
    .map((value) => {
      if (!value || typeof value !== "object") return null;
      const row = value as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const content = typeof row.content === "string" ? row.content.trim() : "";
      return title && content ? { title, content } : null;
    })
    .filter((value): value is SuggestedStep => Boolean(value));
  if (!steps.length) throw new Error("AI chưa tạo được bước làm hợp lệ.");
  return steps;
}

export function RecipeAiAssistantPanel({
  recipeId,
  recipeTitle,
  dirty,
  locked,
  onApplySteps,
  onOpenSteps,
}: {
  recipeId: string;
  recipeTitle: string;
  dirty: boolean;
  locked: boolean;
  onApplySteps: (steps: SuggestedStep[]) => void;
  onOpenSteps: () => void;
}) {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const [job, setJob] = useState<AiJob | null>(null);
  const [mode, setMode] = useState<"audit" | "draft" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestedSteps, setSuggestedSteps] = useState<SuggestedStep[]>([]);
  const [currentSteps, setCurrentSteps] = useState<Step[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [comparisonConfirmed, setComparisonConfirmed] = useState(false);

  const canUse = has("ai.use");
  const canDraft = has("ai.execute") && has("recipes.edit");
  const comparisons = useMemo(
    () => buildSuggestedRecipeStepComparison(currentSteps, suggestedSteps),
    [currentSteps, suggestedSteps],
  );

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
  }

  useEffect(() => {
    if (!job || !["pending", "processing"].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void loadJob(job.id).catch((error) => {
        setMessage(error instanceof Error ? error.message : "Không đọc được trạng thái AI job.");
      });
    }, 2500);
    return () => window.clearInterval(timer);
    // Poll only the current job id and status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (mode !== "draft" || job?.status !== "completed" || !job.response_text) return;
    try {
      setSuggestedSteps(parseSuggestedSteps(job.response_text));
      setMessage("");
    } catch (error) {
      setSuggestedSteps([]);
      setMessage(error instanceof Error ? error.message : "Không đọc được SOP nháp từ AI.");
    }
  }, [job?.response_text, job?.status, mode]);

  async function enqueue(nextMode: "audit" | "draft") {
    if (dirty) {
      setMessage("Hãy lưu công thức trước để AI đọc đúng dữ liệu mới nhất.");
      return;
    }
    setBusy(true);
    setMessage("");
    setMode(nextMode);
    setSuggestedSteps([]);
    try {
      const isDraft = nextMode === "draft";
      const path = isDraft ? "/api/admin/ai/drafts" : "/api/admin/ai/query";
      const prompt = isDraft
        ? `Audit công thức ${recipeTitle} và viết lại toàn bộ SOP cách làm. Chỉ trả JSON hợp lệ theo cấu trúc {"steps":[{"title":"...","content":"..."}]}. Mỗi bước phải có thao tác, định lượng liên quan, thời gian hoặc nhiệt độ khi cần, tiêu chí đạt và lỗi cần tránh. Không thêm markdown.`
        : `Audit riêng công thức ${recipeTitle}. Kiểm tra nguyên liệu, định lượng, thứ tự bước, thời gian, nhiệt độ, tiêu chí thành phẩm, bảo quản và các câu hướng dẫn còn sơ sài hoặc mâu thuẫn. Trả lời tiếng Việt theo 6 mục: Kết luận; Lỗi phát hiện; SOP đề xuất; Kiểm soát chất lượng; Dữ liệu thiếu; Hành động đề xuất.`;
      const body = isDraft
        ? { prompt, draftType: "recipe", title: `SOP nháp - ${recipeTitle}`, scopes: ["recipes"], recipeId }
        : { prompt, scopes: ["recipes"], recipeId };
      const payload = await adminApiFetch<{ jobId: string; status: string }>(
        path,
        await token(),
        { method: "POST", body: JSON.stringify(body) },
      );
      setJob({ id: payload.jobId, status: "pending", response_text: null, error_code: null, error_message: null });
      setMessage("Đã đưa yêu cầu vào hàng đợi AI trên VPS.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được AI job.");
    } finally {
      setBusy(false);
    }
  }

  async function openComparison() {
    if (dirty || locked || !suggestedSteps.length) return;
    setCompareLoading(true);
    setMessage("");
    try {
      const accessToken = await token();
      const [detail, media] = await Promise.all([
        adminApiFetch<{ recipe: { steps: RecipeStepResponse[] } }>(`/api/admin/recipes/${recipeId}`, accessToken),
        adminApiFetch<{
          steps: Array<{ stepNo: number; mediaId: string | null; publicUrl: string | null; thumbnailUrl: string | null }>;
        }>(`/api/admin/recipes/media/recipe/${recipeId}`, accessToken),
      ]);
      const loaded = detail.recipe.steps.map((step, index) => {
        const reference = media.steps.find((item) => item.stepNo === index + 1);
        return {
          clientId: `comparison-${step.id}`,
          title: step.title || "",
          content: step.content,
          imageUrl: reference?.publicUrl || step.imageUrl || "",
          thumbnailUrl: reference?.thumbnailUrl || "",
          mediaId: reference?.mediaId || null,
        };
      });
      setCurrentSteps(loaded);
      setComparisonConfirmed(false);
      setCompareOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được SOP hiện tại để so sánh.");
    } finally {
      setCompareLoading(false);
    }
  }

  function applyComparedDraft() {
    if (!comparisonConfirmed || dirty || locked || !suggestedSteps.length) return;
    onApplySteps(suggestedSteps);
    onOpenSteps();
    setCompareOpen(false);
    setMessage(`Đã merge ${suggestedSteps.length} bước SOP vào bản nháp. Client ID và media hiện có được giữ nguyên; hãy kiểm tra rồi bấm Lưu.`);
  }

  if (!canUse) return null;

  return (
    <div className="recipe-ai-sop-slot mb-4">
      <style jsx global>{`
        .recipe-ai-sop-slot { display: none; }
        div:has(> .recipe-ai-sop-slot + [data-recipe-steps-tab="true"]) > .recipe-ai-sop-slot { display: block; }
      `}</style>

      <AdminSurface>
        <AdminSurfaceHeader
          eyebrow="AI chuyên gia F&B"
          title="Audit và chuẩn hóa SOP"
          description="AI chỉ xuất đề xuất. Mọi thay đổi phải được so sánh với SOP hiện tại trước khi merge vào bản nháp."
          actions={(
            <>
              <AdminButton tone="dark" size="sm" disabled={busy || dirty} onClick={() => void enqueue("audit")}>Audit cách làm</AdminButton>
              {canDraft && !locked ? <AdminButton tone="primary" size="sm" disabled={busy || dirty} onClick={() => void enqueue("draft")}>Tạo SOP nháp</AdminButton> : null}
            </>
          )}
        />
        <AdminSurfaceBody className="grid gap-4">
          {dirty ? <AdminAlert tone="warning" title="Cần lưu trước">Công thức đang có thay đổi chưa lưu. Lưu trước rồi mới gọi hoặc áp dụng AI.</AdminAlert> : null}

          {job ? (
            <div className="flex flex-wrap items-center gap-2">
              <AdminBadge tone="neutral">Job {job.id.slice(0, 8)}</AdminBadge>
              <AdminBadge tone={statusTone[job.status]}>{statusLabel[job.status]}</AdminBadge>
              {mode ? <AdminBadge tone="orange">{mode === "audit" ? "Audit" : "SOP nháp"}</AdminBadge> : null}
            </div>
          ) : <AdminEmptyState title="Chưa chạy AI" description="Chọn Audit cách làm hoặc Tạo SOP nháp để bắt đầu." />}

          {job?.status === "failed" ? <AdminAlert tone="danger" title={job.error_code || "AI job thất bại"}>{job.error_message || "Worker không trả được kết quả."}</AdminAlert> : null}

          {job?.status === "completed" && mode === "audit" ? (
            <section>
              <h4 className="mb-3 font-black text-slate-900">Báo cáo audit</h4>
              <AiReadableResult text={job.response_text} />
            </section>
          ) : null}

          {job?.status === "completed" && mode === "draft" && suggestedSteps.length ? (
            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-slate-900">SOP AI đề xuất</h4>
                  <p className="text-sm font-medium text-slate-600">{suggestedSteps.length} bước đã được đọc thành dữ liệu có cấu trúc; raw JSON không hiển thị trong luồng chính.</p>
                </div>
                <AdminButton tone="success" disabled={compareLoading || dirty || locked} onClick={() => void openComparison()}>{compareLoading ? "Đang tải SOP hiện tại…" : "So sánh trước khi áp dụng"}</AdminButton>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {suggestedSteps.map((step, index) => (
                  <article key={`${step.title}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2"><AdminBadge tone="orange">Bước {index + 1}</AdminBadge><h5 className="font-black text-slate-900">{step.title}</h5></div>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{step.content}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {message ? <AdminAlert tone={message.includes("không") || message.includes("chưa") ? "warning" : "success"}>{message}</AdminAlert> : null}
        </AdminSurfaceBody>
      </AdminSurface>

      <AdminDialog
        open={compareOpen}
        title="So sánh SOP hiện tại và đề xuất AI"
        eyebrow="Recipe SOP review"
        description="Không có thay đổi nào được ghi vào database ở bước này. Media của bước khớp sẽ được giữ nguyên khi merge."
        size="xl"
        onClose={() => setCompareOpen(false)}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AdminButton tone="ghost" onClick={() => setCompareOpen(false)}>Đóng</AdminButton>
            <AdminButton tone="success" disabled={!comparisonConfirmed || dirty || locked} onClick={applyComparedDraft}>Merge SOP vào bản nháp</AdminButton>
          </div>
        )}
      >
        <div className="grid gap-4">
          <AdminAlert tone="info" title="Quy tắc bảo vệ ảnh">Bước được ghép theo tiêu đề, sau đó mới fallback theo vị trí. Client ID, URL ảnh, thumbnail và media ID của bước hiện tại không bị AI ghi đè.</AdminAlert>

          {comparisons.map((entry, index) => (
            <article key={`${entry.suggestedStep.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <AdminBadge tone={entry.status === "new" ? "orange" : "info"}>{entry.status === "new" ? "Bước mới" : `Cập nhật bước ${(entry.currentIndex ?? 0) + 1}`}</AdminBadge>
                {entry.currentStep?.mediaId ? <AdminBadge tone="success">Giữ media {entry.currentStep.mediaId.slice(0, 8)}</AdminBadge> : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Hiện tại</p>
                  {entry.currentStep ? <><h4 className="mt-2 font-black text-slate-900">{entry.currentStep.title || "Chưa có tiêu đề"}</h4><p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-slate-700">{entry.currentStep.content}</p></> : <p className="mt-2 text-sm font-medium text-slate-500">Chưa có bước tương ứng.</p>}
                </section>
                <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-orange-700">AI đề xuất</p>
                  <h4 className="mt-2 font-black text-slate-900">{entry.suggestedStep.title}</h4>
                  <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-slate-700">{entry.suggestedStep.content}</p>
                </section>
              </div>
            </article>
          ))}

          <AdminToggle
            checked={comparisonConfirmed}
            onChange={(event) => setComparisonConfirmed(event.target.checked)}
            label="Tôi đã kiểm tra toàn bộ đề xuất"
            description="Xác nhận này chỉ cho phép merge vào form; vẫn phải bấm Lưu để tạo version mới."
          />
        </div>
      </AdminDialog>
    </div>
  );
}
