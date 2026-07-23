"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { useAdminPermissions } from "../AdminPermissionProvider";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSelect,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
  AdminTextarea,
} from "../ui/AdminUI";
import { AiRecipeRdDiff } from "./AiRecipeRdDiff";
import { isRecipeRdDraftContent, type AiRecipeDraft } from "./recipe-draft-types";

type RecipeRow = {
  id: string;
  title: string;
  currentVersionNo: number | null;
  workflowStatus: string | null;
};

type RecipeRdRequest = {
  id: string;
  recipeId: string;
  recipeTitle: string;
  baseRecipeVersionId: string;
  baseRecipeVersionNo: number;
  objective: string;
  constraints: Record<string, unknown>;
  status: "queued" | "generated" | "approved" | "rejected" | "applied" | "failed" | "cancelled";
  aiJobId: string | null;
  aiJobStatus: string | null;
  aiJobErrorCode: string | null;
  aiJobErrorMessage: string | null;
  aiDraftId: string | null;
  aiDraftStatus: string | null;
  appliedRecipeVersionNo: number | null;
  createdByName: string | null;
  reviewedByName: string | null;
  createdAt: string;
  updatedAt: string;
  trialCount: number;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function statusTone(status: RecipeRdRequest["status"]) {
  if (status === "applied" || status === "approved") return "success" as const;
  if (status === "failed" || status === "rejected") return "danger" as const;
  if (status === "generated") return "info" as const;
  return "warning" as const;
}

const statusLabel: Record<RecipeRdRequest["status"], string> = {
  queued: "Đang tạo",
  generated: "Chờ review",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
  applied: "Đã tạo version",
  failed: "Thất bại",
  cancelled: "Đã hủy",
};

export function RecipeRdPanel() {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [requests, setRequests] = useState<RecipeRdRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [draft, setDraft] = useState<AiRecipeDraft | null>(null);
  const [recipeId, setRecipeId] = useState("");
  const [objective, setObjective] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [maxCostPerYield, setMaxCostPerYield] = useState("");
  const [maxIngredientCount, setMaxIngredientCount] = useState("");
  const [preserveYield, setPreserveYield] = useState(true);
  const [useAvailableInventoryOnly, setUseAvailableInventoryOnly] = useState(false);
  const [trialStatus, setTrialStatus] = useState<"planned" | "passed" | "needs_changes" | "failed">("planned");
  const [trialBatchQuantity, setTrialBatchQuantity] = useState("");
  const [trialBatchUnit, setTrialBatchUnit] = useState("mẻ");
  const [sensoryScore, setSensoryScore] = useState("");
  const [operationalScore, setOperationalScore] = useState("");
  const [trialNote, setTrialNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canView = has("recipe.rd.view");
  const canCreate = has("recipe.rd.create") && has("ai.execute") && has("recipes.view")
    && has("catalog.view") && has("inventory.view") && has("suppliers.view") && has("kitchen.capacity.view");
  const canApply = has("recipe.rd.apply") && has("ai.execute") && has("recipes.edit");
  const selectedRequest = useMemo(
    () => requests.find((item) => item.id === selectedRequestId) || requests[0] || null,
    [requests, selectedRequestId],
  );

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  async function loadRecipes() {
    const payload = await adminApiFetch<{ recipes: RecipeRow[] }>("/api/admin/recipes?limit=100", await token());
    setRecipes(payload.recipes);
    setRecipeId((current) => current || payload.recipes[0]?.id || "");
  }

  async function loadRequests() {
    if (!canView) return;
    const payload = await adminApiFetch<{ requests: RecipeRdRequest[] }>("/api/admin/recipe-rd/requests", await token());
    setRequests(payload.requests);
    setSelectedRequestId((current) => payload.requests.some((item) => item.id === current) ? current : payload.requests[0]?.id || "");
  }

  async function loadDraft(draftId: string) {
    const payload = await adminApiFetch<{ draft: AiRecipeDraft }>(`/api/admin/ai/drafts/${draftId}`, await token());
    setDraft(payload.draft);
  }

  useEffect(() => {
    if (!canView) return;
    void Promise.all([loadRecipes(), loadRequests()]).catch((error) => setMessage(error instanceof Error ? error.message : "Không tải được R&D workspace."));
    // Initial data load is permission-gated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    const pending = requests.some((item) => item.status === "queued" || item.aiJobStatus === "pending" || item.aiJobStatus === "processing");
    if (!pending) return;
    const timer = window.setInterval(() => void loadRequests().catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
    // Poll while AI work is pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, requests]);

  useEffect(() => {
    setDraft(null);
    if (selectedRequest?.aiDraftId) void loadDraft(selectedRequest.aiDraftId).catch((error) => setMessage(error instanceof Error ? error.message : "Không đọc được R&D draft."));
    // Load the draft linked to the selected request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest?.aiDraftId]);

  async function createRequest() {
    if (!canCreate || !recipeId || objective.trim().length < 3) return;
    setBusy(true);
    setMessage("");
    try {
      const constraints: Record<string, unknown> = {
        preserveYield,
        useAvailableInventoryOnly,
      };
      if (maxCostPerYield.trim()) constraints.maxCostPerYield = Number(maxCostPerYield);
      if (maxIngredientCount.trim()) constraints.maxIngredientCount = Number(maxIngredientCount);
      const payload = await adminApiFetch<{ requestId: string; jobId: string }>(
        "/api/admin/recipe-rd/requests",
        await token(),
        {
          method: "POST",
          body: JSON.stringify({
            recipeId,
            objective: objective.trim(),
            constraints,
            additionalNotes: additionalNotes.trim() || null,
          }),
        },
      );
      setObjective("");
      setAdditionalNotes("");
      setSelectedRequestId(payload.requestId);
      setMessage(`Đã tạo yêu cầu R&D. AI job ${payload.jobId.slice(0, 8)} đang xử lý.`);
      await loadRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được yêu cầu R&D.");
    } finally {
      setBusy(false);
    }
  }

  async function applyDraft() {
    if (!draft || draft.status !== "approved" || !isRecipeRdDraftContent(draft.content) || !canApply) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await adminApiFetch<{ recipeVersionNo: number }>(
        `/api/admin/recipe-rd/drafts/${draft.id}/apply`,
        await token(),
        { method: "POST", body: "{}" },
      );
      setMessage(`Đã tạo Recipe Version nháp v${result.recipeVersionNo}. Chưa publish.`);
      await Promise.all([loadRequests(), loadDraft(draft.id)]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không áp dụng được R&D proposal.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTrial() {
    if (!selectedRequest || !canCreate) return;
    setBusy(true);
    setMessage("");
    try {
      await adminApiFetch(
        `/api/admin/recipe-rd/requests/${selectedRequest.id}/trials`,
        await token(),
        {
          method: "POST",
          body: JSON.stringify({
            resultStatus: trialStatus,
            batchQuantity: trialBatchQuantity.trim() ? Number(trialBatchQuantity) : null,
            batchUnit: trialBatchQuantity.trim() ? trialBatchUnit.trim() : null,
            sensoryScore: sensoryScore.trim() ? Number(sensoryScore) : null,
            operationalScore: operationalScore.trim() ? Number(operationalScore) : null,
            measurements: {},
            note: trialNote.trim() || null,
          }),
        },
      );
      setTrialNote("");
      setSensoryScore("");
      setOperationalScore("");
      setMessage("Đã lưu kết quả mẻ thử.");
      await loadRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không lưu được kết quả mẻ thử.");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;

  return (
    <AdminSurface>
      <AdminSurfaceHeader
        eyebrow="Phase 6"
        title="AI hỗ trợ R&D và tối ưu công thức"
        description="AI tạo phương án thử nghiệm từ dữ liệu Recipe, Catalog, Cost, Kho, Nhà cung cấp và năng lực bếp. Backend kiểm tra lại toàn bộ trước khi proposal vào hàng đợi review."
        actions={<AdminButton size="sm" tone="secondary" disabled={busy} onClick={() => void loadRequests()}>Tải lại</AdminButton>}
      />
      <AdminSurfaceBody className="grid gap-5">
        {message ? <AdminAlert tone={message.startsWith("Đã") ? "success" : "warning"}>{message}</AdminAlert> : null}
        {!canCreate ? (
          <AdminAlert tone="warning" title="Thiếu quyền hoặc dữ liệu đầu vào">Cần recipe.rd.create, ai.execute, Recipe, Catalog, Kho, Nhà cung cấp và quyền xem năng lực bếp để tạo phương án.</AdminAlert>
        ) : (
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <AdminField label="Công thức gốc">
                <AdminSelect value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
                  {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title} · v{recipe.currentVersionNo || "?"}</option>)}
                </AdminSelect>
              </AdminField>
              <AdminField label="Trần cost / yield" hint="Để trống nếu không đặt trần.">
                <AdminInput inputMode="decimal" value={maxCostPerYield} onChange={(event) => setMaxCostPerYield(event.target.value)} placeholder="Ví dụ 6000" />
              </AdminField>
            </div>
            <AdminField label="Mục tiêu R&D">
              <AdminTextarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Ví dụ: giảm cost dưới 6.000đ/ly nhưng giữ nguyên yield và không dùng SKU hết tồn." />
            </AdminField>
            <div className="grid gap-3 lg:grid-cols-2">
              <AdminField label="Số nguyên liệu tối đa" hint="Để trống nếu không giới hạn.">
                <AdminInput inputMode="numeric" value={maxIngredientCount} onChange={(event) => setMaxIngredientCount(event.target.value)} placeholder="Ví dụ 8" />
              </AdminField>
              <AdminField label="Ghi chú thêm">
                <AdminInput value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="Yêu cầu cảm quan hoặc vận hành cần chú ý" />
              </AdminField>
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-bold text-slate-700">
              <label className="flex items-center gap-2"><input type="checkbox" checked={preserveYield} onChange={(event) => setPreserveYield(event.target.checked)} /> Giữ nguyên yield</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={useAvailableInventoryOnly} onChange={(event) => setUseAvailableInventoryOnly(event.target.checked)} /> Chỉ dùng SKU có tồn</label>
            </div>
            <div><AdminButton tone="primary" disabled={busy || !recipeId || objective.trim().length < 3} onClick={() => void createRequest()}>{busy ? "Đang xử lý…" : "Tạo phương án R&D"}</AdminButton></div>
          </section>
        )}

        <section className="grid gap-3">
          <h3 className="font-black text-slate-950">Lịch sử yêu cầu R&D</h3>
          {requests.length === 0 ? <AdminEmptyState title="Chưa có yêu cầu R&D" /> : (
            <div className="grid gap-2">
              {requests.map((request) => (
                <button key={request.id} type="button" onClick={() => setSelectedRequestId(request.id)} className={`rounded-2xl border p-4 text-left transition ${selectedRequest?.id === request.id ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white hover:border-orange-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <AdminBadge tone={statusTone(request.status)}>{statusLabel[request.status]}</AdminBadge>
                        <AdminBadge tone="neutral">{request.recipeTitle} · v{request.baseRecipeVersionNo}</AdminBadge>
                        {request.trialCount ? <AdminBadge tone="info">{request.trialCount} mẻ thử</AdminBadge> : null}
                      </div>
                      <p className="mt-2 font-black text-slate-900">{request.objective}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">{formatDate(request.createdAt)} · {request.createdByName || "nhân viên"}</p>
                    </div>
                    {request.appliedRecipeVersionNo ? <AdminBadge tone="success">Đã tạo v{request.appliedRecipeVersionNo}</AdminBadge> : null}
                  </div>
                  {request.aiJobErrorMessage ? <p className="mt-2 text-sm font-bold text-rose-700">{request.aiJobErrorCode}: {request.aiJobErrorMessage}</p> : null}
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedRequest ? (
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">Chi tiết yêu cầu</h3>
                <p className="mt-1 text-sm font-medium text-slate-600">{selectedRequest.objective}</p>
              </div>
              {draft?.status === "approved" && isRecipeRdDraftContent(draft.content) && canApply ? (
                <AdminButton tone="success" disabled={busy || draft.content.evaluation.constraints.some((item) => item.status === "failed")} onClick={() => void applyDraft()}>
                  Tạo Recipe Version nháp
                </AdminButton>
              ) : null}
            </div>
            {draft && isRecipeRdDraftContent(draft.content) ? (
              <AiRecipeRdDiff content={draft.content} />
            ) : selectedRequest.status === "queued" ? (
              <AdminAlert tone="info" title="AI đang tạo proposal">Job đang xử lý. Proposal chỉ xuất hiện sau khi vượt qua parser và kiểm tra backend.</AdminAlert>
            ) : selectedRequest.status === "failed" ? (
              <AdminAlert tone="danger" title="Tạo proposal thất bại">{selectedRequest.aiJobErrorMessage || "AI không trả về proposal hợp lệ."}</AdminAlert>
            ) : (
              <AdminAlert tone="warning">Chưa tải được R&D draft liên kết.</AdminAlert>
            )}

            {selectedRequest.aiDraftId && ["generated", "approved", "applied"].includes(selectedRequest.status) && canCreate ? (
              <section className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-black text-slate-950">Ghi kết quả mẻ thử</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <AdminField label="Kết quả">
                    <AdminSelect value={trialStatus} onChange={(event) => setTrialStatus(event.target.value as typeof trialStatus)}>
                      <option value="planned">Đã lên kế hoạch</option>
                      <option value="passed">Đạt</option>
                      <option value="needs_changes">Cần chỉnh</option>
                      <option value="failed">Không đạt</option>
                    </AdminSelect>
                  </AdminField>
                  <AdminField label="Quy mô batch">
                    <AdminInput inputMode="decimal" value={trialBatchQuantity} onChange={(event) => setTrialBatchQuantity(event.target.value)} placeholder="Ví dụ 10" />
                  </AdminField>
                  <AdminField label="Đơn vị batch">
                    <AdminInput value={trialBatchUnit} onChange={(event) => setTrialBatchUnit(event.target.value)} />
                  </AdminField>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <AdminField label="Điểm cảm quan 0–10"><AdminInput inputMode="decimal" value={sensoryScore} onChange={(event) => setSensoryScore(event.target.value)} /></AdminField>
                  <AdminField label="Điểm vận hành 0–10"><AdminInput inputMode="decimal" value={operationalScore} onChange={(event) => setOperationalScore(event.target.value)} /></AdminField>
                </div>
                <AdminField label="Ghi chú thử nghiệm"><AdminTextarea value={trialNote} onChange={(event) => setTrialNote(event.target.value)} placeholder="Quan sát thực tế, lỗi, độ ổn định và thay đổi cần làm." /></AdminField>
                <div><AdminButton tone="dark" disabled={busy} onClick={() => void saveTrial()}>Lưu kết quả mẻ thử</AdminButton></div>
              </section>
            ) : null}
          </section>
        ) : null}
      </AdminSurfaceBody>
    </AdminSurface>
  );
}
