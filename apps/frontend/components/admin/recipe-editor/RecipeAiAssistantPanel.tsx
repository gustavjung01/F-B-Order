"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { useAdminPermissions } from "../AdminPermissionProvider";

type AiJob = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  response_text: string | null;
  error_code: string | null;
  error_message: string | null;
};

type SuggestedStep = {
  title: string;
  content: string;
};

function parseSuggestedSteps(text: string): SuggestedStep[] {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized) as { steps?: unknown };
  if (!Array.isArray(parsed.steps)) throw new Error("AI chưa trả đúng cấu trúc steps.");
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

  const canUse = has("ai.use");
  const canDraft = has("ai.execute") && has("recipes.edit");

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

  async function enqueue(nextMode: "audit" | "draft") {
    if (dirty) {
      setMessage("Hãy lưu công thức trước để AI đọc đúng dữ liệu mới nhất.");
      return;
    }
    setBusy(true);
    setMessage("");
    setMode(nextMode);
    try {
      const isDraft = nextMode === "draft";
      const path = isDraft ? "/api/admin/ai/drafts" : "/api/admin/ai/query";
      const prompt = isDraft
        ? `Audit công thức ${recipeTitle} và viết lại toàn bộ SOP cách làm. Chỉ trả JSON hợp lệ theo cấu trúc {"steps":[{"title":"...","content":"..."}]}. Mỗi bước phải có thao tác, định lượng liên quan, thời gian hoặc nhiệt độ khi cần, tiêu chí đạt và lỗi cần tránh. Không thêm markdown.`
        : `Audit riêng công thức ${recipeTitle}. Kiểm tra nguyên liệu, định lượng, thứ tự bước, thời gian, nhiệt độ, tiêu chí thành phẩm, bảo quản và các câu hướng dẫn còn sơ sài hoặc mâu thuẫn. Trả lời tiếng Việt theo 6 mục: Kết luận; Lỗi phát hiện; SOP đề xuất; Kiểm soát chất lượng; Dữ liệu thiếu; Hành động đề xuất.`;
      const body = isDraft
        ? {
            prompt,
            draftType: "recipe",
            title: `SOP nháp - ${recipeTitle}`,
            scopes: ["recipes"],
            recipeId,
          }
        : {
            prompt,
            scopes: ["recipes"],
            recipeId,
          };
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

  function applyDraft() {
    if (!job?.response_text) return;
    try {
      const steps = parseSuggestedSteps(job.response_text);
      onApplySteps(steps);
      onOpenSteps();
      setMessage(`Đã đưa ${steps.length} bước AI vào bản nháp công thức. Hãy kiểm tra rồi bấm Lưu.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không đọc được SOP nháp từ AI.");
    }
  }

  if (!canUse) return null;

  return (
    <section className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-violet-700">AI chuyên gia F&amp;B</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Audit và viết SOP cho công thức này</h3>
          <p className="mt-1 text-sm font-bold text-slate-600">AI chạy trên worker VPS, lưu job trong PostgreSQL; Vercel chỉ hiển thị trạng thái và kết quả.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || dirty} onClick={() => void enqueue("audit")} className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Audit cách làm</button>
          {canDraft && !locked ? <button type="button" disabled={busy || dirty} onClick={() => void enqueue("draft")} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Tạo SOP nháp</button> : null}
        </div>
      </div>

      {dirty ? <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">Công thức đang có thay đổi chưa lưu. Lưu trước rồi mới gọi AI.</p> : null}
      {job ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black"><span className="rounded-full bg-white px-3 py-1 text-slate-700">Job {job.id.slice(0, 8)}</span><span className="rounded-full bg-violet-100 px-3 py-1 text-violet-800">{job.status}</span></div> : null}
      {job?.status === "failed" ? <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm font-bold text-red-700">{job.error_code}: {job.error_message}</p> : null}
      {job?.status === "completed" && job.response_text ? (
        <div className="mt-4">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{job.response_text}</pre>
          {mode === "draft" && canDraft && !locked ? <button type="button" onClick={applyDraft} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Đưa SOP vào bản nháp công thức</button> : null}
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm font-bold text-slate-700">{message}</p> : null}
    </section>
  );
}
