"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { AiReadableResult } from "@/components/admin/ai/AiReadableResult";
import { useAdminPermissions } from "@/components/admin/AdminPermissionProvider";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminField,
  AdminSelect,
} from "@/components/admin/ui/AdminUI";
import type { Version } from "./types";

type Scalar = string | number | boolean | null;

type CostPreview = {
  status: "ready" | "partial" | "unavailable";
  knownMandatoryCost: number;
  costPerYield: number | null;
  missingMandatoryCount: number;
};

type IngredientState = {
  index: number;
  productName: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
  catalogVariantId: string | null;
};

type StepState = {
  index: number;
  title: string | null;
  content: string;
  imageUrl: string | null;
};

type Comparison = {
  schemaVersion: string;
  pricingBasis: "current_catalog_prices";
  fromVersion: { id: string; versionNo: number; workflowStatus: string; changeNote: string | null; createdAt: string };
  toVersion: { id: string; versionNo: number; workflowStatus: string; changeNote: string | null; createdAt: string };
  summary: {
    metadataChangeCount: number;
    ingredientAddedCount: number;
    ingredientRemovedCount: number;
    ingredientModifiedCount: number;
    stepAddedCount: number;
    stepRemovedCount: number;
    stepModifiedCount: number;
    highRiskCount: number;
    warningCount: number;
  };
  metadataChanges: Array<{ field: string; label: string; from: Scalar; to: Scalar }>;
  ingredientChanges: Array<{
    kind: "added" | "removed" | "modified" | "moved";
    key: string;
    label: string;
    from: IngredientState | null;
    to: IngredientState | null;
    changedFields: string[];
  }>;
  stepChanges: Array<{
    kind: "added" | "removed" | "modified" | "moved";
    label: string;
    from: StepState | null;
    to: StepState | null;
    changedFields: string[];
  }>;
  cost: {
    from: CostPreview;
    to: CostPreview;
    knownMandatoryCostDelta: number;
    costPerYieldDelta: number | null;
    percentDelta: number | null;
  };
  risks: Array<{ code: string; severity: "info" | "warning" | "high"; message: string }>;
};

type AiJob = {
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  response_text: string | null;
  error_message: string | null;
};

const kindLabel = {
  added: "Thêm",
  removed: "Xóa",
  modified: "Thay đổi",
  moved: "Đổi vị trí",
} as const;

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Chưa tính được";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)} đ`;
}

function scalar(value: Scalar): string {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  return String(value);
}

function dose(value: IngredientState | null): string {
  if (!value) return "—";
  const quantity = value.quantity === null ? "?" : String(value.quantity);
  return `${quantity} ${value.unit || "?"}${value.optional ? " · tùy chọn" : ""}`;
}

function changeTone(kind: "added" | "removed" | "modified" | "moved") {
  if (kind === "added") return "success" as const;
  if (kind === "removed") return "danger" as const;
  if (kind === "moved") return "info" as const;
  return "warning" as const;
}

export function RecipeVersionComparePanel({ recipeId, versions }: { recipeId: string; versions: Version[] }) {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const ordered = useMemo(() => [...versions].sort((left, right) => left.versionNo - right.versionNo), [versions]);
  const [fromVersionId, setFromVersionId] = useState("");
  const [toVersionId, setToVersionId] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiJob, setAiJob] = useState<AiJob | null>(null);

  const canCompare = has("recipes.view") && has("catalog.view");
  const canUseAi = has("ai.use");

  useEffect(() => {
    if (ordered.length < 2) return;
    setFromVersionId((current) => ordered.some((version) => version.id === current) ? current : ordered.at(-2)?.id || "");
    setToVersionId((current) => ordered.some((version) => version.id === current) ? current : ordered.at(-1)?.id || "");
  }, [ordered]);

  useEffect(() => {
    if (!aiJobId) return;
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const payload = await adminApiFetch<{ job: AiJob }>(`/api/admin/ai/jobs/${aiJobId}`, token);
        if (cancelled) return;
        setAiJob(payload.job);
        if (payload.job.status === "pending" || payload.job.status === "processing") {
          timer = window.setTimeout(() => void poll(), 2500);
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Không tải được kết quả AI.");
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [aiJobId, getToken]);

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  function requestBody() {
    return { recipeId, fromVersionId, toVersionId };
  }

  async function compare() {
    if (!fromVersionId || !toVersionId || fromVersionId === toVersionId) return;
    setBusy(true);
    setMessage("");
    setAiJobId(null);
    setAiJob(null);
    try {
      const payload = await adminApiFetch<{ comparison: Comparison }>(
        "/api/admin/recipe-version-analysis/compare",
        await token(),
        { method: "POST", body: JSON.stringify(requestBody()) },
      );
      setComparison(payload.comparison);
      setMessage(`Đã so sánh v${payload.comparison.fromVersion.versionNo} với v${payload.comparison.toVersion.versionNo}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không so sánh được Recipe Version.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeWithAi() {
    if (!fromVersionId || !toVersionId || fromVersionId === toVersionId) return;
    setBusy(true);
    setMessage("");
    setAiJob(null);
    try {
      const payload = await adminApiFetch<{ jobId: string; status: string; comparison: Comparison }>(
        "/api/admin/recipe-version-analysis/analyze",
        await token(),
        { method: "POST", body: JSON.stringify(requestBody()) },
      );
      setComparison(payload.comparison);
      setAiJobId(payload.jobId);
      setMessage(`AI đang phân tích job ${payload.jobId.slice(0, 8)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được AI job phân tích phiên bản.");
    } finally {
      setBusy(false);
    }
  }

  if (versions.length < 2) {
    return <AdminAlert tone="info" title="Chưa đủ phiên bản">Cần ít nhất hai Recipe Version để so sánh thay đổi.</AdminAlert>;
  }

  return (
    <div className="grid gap-4">
      {!canCompare ? <AdminAlert tone="warning" title="Thiếu quyền so sánh">Tài khoản cần recipes.view và catalog.view.</AdminAlert> : null}
      {message ? <AdminAlert tone={message.startsWith("Đã") || message.startsWith("AI đang") ? "success" : "warning"}>{message}</AdminAlert> : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <AdminField label="Phiên bản gốc">
          <AdminSelect value={fromVersionId} onChange={(event) => setFromVersionId(event.target.value)}>
            {ordered.map((version) => <option key={version.id} value={version.id}>v{version.versionNo}{version.isPublished ? " · công khai" : ""}</option>)}
          </AdminSelect>
        </AdminField>
        <AdminField label="Phiên bản mới">
          <AdminSelect value={toVersionId} onChange={(event) => setToVersionId(event.target.value)}>
            {ordered.map((version) => <option key={version.id} value={version.id}>v{version.versionNo}{version.isCurrent ? " · hiện tại" : ""}</option>)}
          </AdminSelect>
        </AdminField>
        <div className="flex flex-wrap gap-2">
          <AdminButton tone="dark" disabled={busy || !canCompare || !fromVersionId || fromVersionId === toVersionId} onClick={() => void compare()}>
            {busy ? "Đang xử lý…" : "So sánh"}
          </AdminButton>
          {canUseAi ? (
            <AdminButton tone="primary" disabled={busy || !canCompare || !fromVersionId || fromVersionId === toVersionId} onClick={() => void analyzeWithAi()}>
              Phân tích bằng AI
            </AdminButton>
          ) : null}
        </div>
      </div>

      {comparison ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Metadata</p><p className="mt-1 text-2xl font-black">{comparison.summary.metadataChangeCount}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Nguyên liệu</p><p className="mt-1 text-2xl font-black">{comparison.ingredientChanges.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Bước làm</p><p className="mt-1 text-2xl font-black">{comparison.stepChanges.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Rủi ro cao</p><p className="mt-1 text-2xl font-black">{comparison.summary.highRiskCount}</p></div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-slate-950">Ảnh hưởng cost</h3>
              <AdminBadge tone="neutral">Giá Catalog hiện tại</AdminBadge>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs font-bold text-slate-500">v{comparison.fromVersion.versionNo}</p><p className="mt-1 text-lg font-black">{formatMoney(comparison.cost.from.costPerYield)}</p></div>
              <div><p className="text-xs font-bold text-slate-500">v{comparison.toVersion.versionNo}</p><p className="mt-1 text-lg font-black">{formatMoney(comparison.cost.to.costPerYield)}</p></div>
              <div><p className="text-xs font-bold text-slate-500">Chênh lệch</p><p className="mt-1 text-lg font-black">{formatMoney(comparison.cost.costPerYieldDelta)}{comparison.cost.percentDelta === null ? "" : ` · ${comparison.cost.percentDelta > 0 ? "+" : ""}${comparison.cost.percentDelta}%`}</p></div>
            </div>
            {comparison.cost.from.status !== "ready" || comparison.cost.to.status !== "ready" ? <p className="mt-3 text-xs font-bold text-amber-700">Cost chưa hoàn chỉnh vì còn nguyên liệu thiếu giá, quy cách hoặc liên kết Catalog.</p> : null}
          </section>

          {comparison.risks.length ? (
            <section className="grid gap-2">
              <h3 className="font-black text-slate-950">Cảnh báo cần review</h3>
              {comparison.risks.map((risk) => (
                <AdminAlert key={`${risk.code}-${risk.message}`} tone={risk.severity === "high" ? "danger" : risk.severity === "warning" ? "warning" : "info"} title={risk.severity === "high" ? "Rủi ro cao" : risk.severity === "warning" ? "Cần kiểm tra" : "Thông tin"}>
                  {risk.message}
                </AdminAlert>
              ))}
            </section>
          ) : <AdminAlert tone="success">Không phát hiện cờ rủi ro theo bộ quy tắc hiện tại.</AdminAlert>}

          {comparison.metadataChanges.length ? (
            <section>
              <h3 className="font-black text-slate-950">Thông tin chung thay đổi</h3>
              <div className="mt-2 grid gap-2">
                {comparison.metadataChanges.map((change) => (
                  <article key={change.field} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <b>{change.label}</b>
                    <p className="mt-1 text-slate-600"><span className="line-through">{scalar(change.from)}</span> → <span className="font-bold text-slate-950">{scalar(change.to)}</span></p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {comparison.ingredientChanges.length ? (
            <section>
              <h3 className="font-black text-slate-950">Nguyên liệu thay đổi</h3>
              <div className="mt-2 grid gap-2">
                {comparison.ingredientChanges.map((change, index) => (
                  <article key={`${change.key}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><b>{change.label}</b><AdminBadge tone={changeTone(change.kind)}>{kindLabel[change.kind]}</AdminBadge></div>
                    <p className="mt-2 text-sm text-slate-600">{dose(change.from)} → <span className="font-bold text-slate-950">{dose(change.to)}</span></p>
                    {change.from?.catalogVariantId !== change.to?.catalogVariantId ? <p className="mt-1 text-xs font-medium text-slate-500">SKU: {change.from?.catalogVariantId || "không liên kết"} → {change.to?.catalogVariantId || "không liên kết"}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {comparison.stepChanges.length ? (
            <section>
              <h3 className="font-black text-slate-950">Bước làm thay đổi</h3>
              <div className="mt-2 grid gap-2">
                {comparison.stepChanges.map((change, index) => (
                  <article key={`${change.label}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><b>{change.label}</b><AdminBadge tone={changeTone(change.kind)}>{kindLabel[change.kind]}</AdminBadge></div>
                    {change.from?.content ? <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer font-bold">Nội dung cũ</summary><p className="mt-2 whitespace-pre-wrap">{change.from.content}</p></details> : null}
                    {change.to?.content ? <details className="mt-2 text-sm text-slate-700" open={change.kind === "added"}><summary className="cursor-pointer font-bold">Nội dung mới</summary><p className="mt-2 whitespace-pre-wrap">{change.to.content}</p></details> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!comparison.metadataChanges.length && !comparison.ingredientChanges.length && !comparison.stepChanges.length ? <AdminEmptyState title="Hai phiên bản không có thay đổi nội dung" className="min-h-28" /> : null}
        </div>
      ) : null}

      {aiJobId ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-black text-slate-950">Kết luận AI</h3>
            <AdminBadge tone={aiJob?.status === "completed" ? "success" : aiJob?.status === "failed" ? "danger" : "info"}>{aiJob?.status || "pending"}</AdminBadge>
          </div>
          {aiJob?.error_message ? <AdminAlert className="mt-3" tone="danger">{aiJob.error_message}</AdminAlert> : null}
          <div className="mt-3"><AiReadableResult text={aiJob?.response_text || null} emptyMessage="AI đang xử lý dữ liệu so sánh đã được backend tính sẵn." /></div>
        </section>
      ) : null}
    </div>
  );
}
