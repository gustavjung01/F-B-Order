"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAdminPermissions } from "@/components/admin/AdminPermissionProvider";
import { adminApiFetch } from "@/lib/admin-api";
import { AiReadableResult } from "./AiReadableResult";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSelect,
  AdminStatCard,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
  AdminTextarea,
} from "@/components/admin/ui/AdminUI";

type RecipeRow = { id: string; title: string; currentVersionNo: number | null };
type PlanLine = { clientId: string; recipeId: string; targetQuantity: string };
type AiJob = {
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  response_text: string | null;
  error_message: string | null;
};

type PlanResult = {
  schemaVersion: string;
  model: string;
  status: "ready" | "needs_purchase" | "blocked";
  assumptions: string[];
  summary: {
    recipeCount: number;
    ingredientSkuCount: number;
    shortageSkuCount: number;
    unknownInventorySkuCount: number;
    estimatedPurchaseCost: number;
    currency: string;
    blockerCount: number;
    bottleneckStation: {
      stationName: string;
      loadMinutes: number;
      utilization: number;
      feasible: boolean;
    } | null;
  };
  recipes: Array<{
    recipeId: string;
    recipeTitle: string;
    versionNo: number;
    targetQuantity: number;
    yieldQuantity: number | null;
    yieldUnit: string | null;
    ingredientStatus: "ready" | "blocked";
    capacityStatus: "ready" | "blocked" | "missing";
    capacity: {
      feasible: boolean;
      estimatedCompletionMinutes: number | null;
      capacityPerShift: number;
      bottleneck: { stepName: string; stationName: string } | null;
    } | null;
  }>;
  ingredients: Array<{
    variantId: string;
    sku: string;
    productName: string;
    mandatory: boolean;
    recipeTitles: string[];
    requiredPackageEquivalent: number;
    requiredPackages: number;
    availablePackages: number | null;
    shortagePackages: number | null;
    status: "available" | "shortage" | "unknown";
    supplier: {
      name: string;
      purchasePrice: number | null;
      currency: string;
      minimumOrderQuantity: number | null;
      leadTimeDays: number | null;
      recommendedOrderPackages: number;
      estimatedPurchaseCost: number;
    } | null;
  }>;
  stations: Array<{
    stationId: string;
    stationName: string;
    loadMinutes: number;
    shiftMinutes: number;
    utilization: number;
    feasible: boolean;
    recipeTitles: string[];
  }>;
  warnings: Array<{ code: string; severity: "info" | "warning" | "high"; message: string }>;
};

function newLine(recipeId = ""): PlanLine {
  return { clientId: crypto.randomUUID(), recipeId, targetQuantity: "10" };
}

function money(value: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);
}

function numberText(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "Chưa có dữ liệu";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function statusLabel(status: PlanResult["status"]): string {
  if (status === "ready") return "Sẵn sàng";
  if (status === "needs_purchase") return "Cần mua thêm";
  return "Đang bị chặn";
}

export function ProductionPlanningPanel() {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const canView = has("production.plan.view")
    && has("recipes.view")
    && has("kitchen.capacity.view")
    && has("inventory.view")
    && has("suppliers.view");
  const canAnalyze = has("production.plan.analyze") && has("ai.use") && has("ai.execute");
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [lines, setLines] = useState<PlanLine[]>([newLine()]);
  const [shiftMinutes, setShiftMinutes] = useState("480");
  const [prompt, setPrompt] = useState("Giải thích blocker, nguyên liệu cần mua, station quá tải và thứ tự việc con người cần xử lý. Không tự động thực thi.");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiJob, setAiJob] = useState<AiJob | null>(null);

  const recipeById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    async function loadRecipes() {
      try {
        const payload = await adminApiFetch<{ recipes: RecipeRow[] }>("/api/admin/recipes?limit=100", await token());
        if (cancelled) return;
        setRecipes(payload.recipes);
        setLines((current) => current.map((line, index) => ({
          ...line,
          recipeId: line.recipeId || (index === 0 ? payload.recipes[0]?.id || "" : ""),
        })));
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Không tải được danh sách Recipe.");
      }
    }
    void loadRecipes();
    return () => { cancelled = true; };
  }, [canView]);

  useEffect(() => {
    if (!aiJobId) return;
    let cancelled = false;
    let timer: number | null = null;
    async function poll() {
      try {
        const payload = await adminApiFetch<{ job: AiJob }>(`/api/admin/ai/jobs/${aiJobId}`, await token());
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
  }, [aiJobId]);

  function updateLine(clientId: string, patch: Partial<PlanLine>) {
    setLines((current) => current.map((line) => line.clientId === clientId ? { ...line, ...patch } : line));
  }

  function addLine() {
    if (lines.length >= 20) return;
    const used = new Set(lines.map((line) => line.recipeId));
    const nextRecipe = recipes.find((recipe) => !used.has(recipe.id))?.id || recipes[0]?.id || "";
    setLines((current) => [...current, newLine(nextRecipe)]);
  }

  function removeLine(clientId: string) {
    setLines((current) => current.length > 1 ? current.filter((line) => line.clientId !== clientId) : current);
  }

  function requestBody() {
    const shift = Number(shiftMinutes);
    if (!Number.isFinite(shift) || shift <= 0) throw new Error("Thời lượng ca không hợp lệ.");
    const requestLines = lines.map((line, index) => {
      const targetQuantity = Number(line.targetQuantity);
      if (!line.recipeId) throw new Error(`Dòng ${index + 1} chưa chọn Recipe.`);
      if (!Number.isFinite(targetQuantity) || targetQuantity <= 0) throw new Error(`Sản lượng dòng ${index + 1} không hợp lệ.`);
      return { recipeId: line.recipeId, targetQuantity };
    });
    return { shiftMinutes: shift, lines: requestLines };
  }

  async function preview() {
    setBusy(true);
    setMessage("");
    setAiJobId(null);
    setAiJob(null);
    try {
      const payload = await adminApiFetch<{ plan: PlanResult }>(
        "/api/admin/production-planning/preview",
        await token(),
        { method: "POST", body: JSON.stringify(requestBody()) },
      );
      setPlan(payload.plan);
      setMessage("Đã lập kế hoạch deterministic từ Recipe Version, công suất bếp, tồn kho và nhà cung cấp.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không lập được kế hoạch sản xuất.");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!canAnalyze) return;
    setBusy(true);
    setMessage("");
    setAiJob(null);
    try {
      const payload = await adminApiFetch<{ jobId: string; plan: PlanResult }>(
        "/api/admin/production-planning/analyze",
        await token(),
        { method: "POST", body: JSON.stringify({ ...requestBody(), prompt: prompt.trim() || null }) },
      );
      setPlan(payload.plan);
      setAiJobId(payload.jobId);
      setMessage("AI đang giải thích kế hoạch; không có hành động vận hành nào được thực thi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được AI job phân tích kế hoạch.");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return <AdminEmptyState title="Không có quyền lập kế hoạch sản xuất" description="Tài khoản cần quyền production.plan.view cùng quyền đọc Recipe, công suất bếp, kho và nhà cung cấp." />;
  }

  return (
    <AdminSurface>
      <AdminSurfaceHeader
        eyebrow="Phase 7"
        title="Kế hoạch sản xuất nhiều Recipe"
        description="Backend scale yield, cộng nhu cầu package, kiểm tra tồn/NCC và cộng tải các Recipe dùng chung station. AI chỉ giải thích kết quả, không giữ kho, tạo PO hoặc phân ca."
        actions={plan ? <AdminBadge tone={plan.status === "ready" ? "success" : plan.status === "needs_purchase" ? "warning" : "danger"}>{statusLabel(plan.status)}</AdminBadge> : <AdminBadge tone="neutral">Read-only</AdminBadge>}
      />
      <AdminSurfaceBody className="grid gap-5">
        {message ? <AdminAlert tone={message.startsWith("Đã") || message.startsWith("AI đang") ? "success" : "warning"}>{message}</AdminAlert> : null}

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <AdminField label="Thời lượng ca (phút)" className="w-full sm:max-w-xs">
              <AdminInput value={shiftMinutes} onChange={(event) => setShiftMinutes(event.target.value)} inputMode="decimal" />
            </AdminField>
            <AdminButton tone="secondary" size="sm" disabled={busy || lines.length >= 20 || !recipes.length} onClick={addLine}>Thêm Recipe</AdminButton>
          </div>

          <div className="grid gap-3">
            {lines.map((line, index) => (
              <article key={line.clientId} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_220px_auto] md:items-end">
                <AdminField label={`Recipe ${index + 1}`}>
                  <AdminSelect value={line.recipeId} onChange={(event) => updateLine(line.clientId, { recipeId: event.target.value })}>
                    <option value="">Chọn Recipe</option>
                    {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}{recipe.currentVersionNo ? ` · v${recipe.currentVersionNo}` : ""}</option>)}
                  </AdminSelect>
                </AdminField>
                <AdminField label="Sản lượng mục tiêu" hint={recipeById.get(line.recipeId) ? `Theo yield của ${recipeById.get(line.recipeId)?.title}` : undefined}>
                  <AdminInput value={line.targetQuantity} onChange={(event) => updateLine(line.clientId, { targetQuantity: event.target.value })} inputMode="decimal" />
                </AdminField>
                <AdminButton tone="ghost" size="sm" disabled={lines.length === 1 || busy} onClick={() => removeLine(line.clientId)}>Xóa</AdminButton>
              </article>
            ))}
          </div>

          <AdminField label="Yêu cầu AI giải thích">
            <AdminTextarea value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={!canAnalyze} />
          </AdminField>
          <div className="flex flex-wrap gap-2">
            <AdminButton tone="dark" disabled={busy || !recipes.length} onClick={() => void preview()}>{busy ? "Đang xử lý…" : "Lập kế hoạch"}</AdminButton>
            {canAnalyze ? <AdminButton tone="primary" disabled={busy || !recipes.length} onClick={() => void analyze()}>AI giải thích</AdminButton> : null}
            <AdminBadge tone="neutral">Không giữ kho</AdminBadge>
            <AdminBadge tone="neutral">Không tạo PO</AdminBadge>
            <AdminBadge tone="neutral">Không tự phân ca</AdminBadge>
          </div>
        </section>

        {plan ? (
          <section className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <AdminStatCard label="Trạng thái" value={statusLabel(plan.status)} />
              <AdminStatCard label="Recipe" value={plan.summary.recipeCount} />
              <AdminStatCard label="SKU thiếu" value={plan.summary.shortageSkuCount} />
              <AdminStatCard label="Tồn chưa rõ" value={plan.summary.unknownInventorySkuCount} />
              <AdminStatCard label="Mua dự kiến" value={money(plan.summary.estimatedPurchaseCost)} />
            </div>

            {plan.warnings.length ? (
              <div className="grid gap-2">
                {plan.warnings.map((warning, index) => (
                  <AdminAlert key={`${warning.code}-${index}`} tone={warning.severity === "high" ? "danger" : warning.severity === "warning" ? "warning" : "info"} title={warning.code}>{warning.message}</AdminAlert>
                ))}
              </div>
            ) : <AdminAlert tone="success">Không có blocker hoặc cảnh báo dữ liệu.</AdminAlert>}

            <section className="grid gap-3">
              <h3 className="text-lg font-black text-slate-950">Recipe và công suất</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {plan.recipes.map((recipe) => (
                  <article key={recipe.recipeId} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b>{recipe.recipeTitle} · v{recipe.versionNo}</b>
                      <AdminBadge tone={recipe.capacityStatus === "ready" && recipe.ingredientStatus === "ready" ? "success" : "danger"}>{recipe.capacityStatus === "missing" ? "Thiếu profile" : recipe.capacityStatus === "blocked" ? "Quá công suất" : "Đủ công suất"}</AdminBadge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="font-bold text-slate-500">Mục tiêu</dt><dd className="font-black">{numberText(recipe.targetQuantity, recipe.yieldUnit ? ` ${recipe.yieldUnit}` : "")}</dd></div>
                      <div><dt className="font-bold text-slate-500">Yield gốc</dt><dd className="font-black">{numberText(recipe.yieldQuantity, recipe.yieldUnit ? ` ${recipe.yieldUnit}` : "")}</dd></div>
                      <div><dt className="font-bold text-slate-500">Hoàn thành dự kiến</dt><dd className="font-black">{numberText(recipe.capacity?.estimatedCompletionMinutes ?? null, " phút")}</dd></div>
                      <div><dt className="font-bold text-slate-500">Nút thắt</dt><dd className="font-black">{recipe.capacity?.bottleneck?.stationName || "Chưa xác định"}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="text-lg font-black text-slate-950">Nhu cầu nguyên liệu</h3>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-600">
                    <tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Nguyên liệu</th><th className="px-4 py-3">Cần</th><th className="px-4 py-3">Khả dụng</th><th className="px-4 py-3">Thiếu</th><th className="px-4 py-3">Nguồn mua</th></tr>
                  </thead>
                  <tbody>
                    {plan.ingredients.map((item) => (
                      <tr key={item.variantId} className="border-t border-slate-200 bg-white align-top">
                        <td className="px-4 py-3 font-black">{item.sku}</td>
                        <td className="px-4 py-3"><b>{item.productName}</b><p className="mt-1 text-xs font-medium text-slate-500">{item.recipeTitles.join(", ")}</p></td>
                        <td className="px-4 py-3 font-bold">{item.requiredPackages} package</td>
                        <td className="px-4 py-3 font-bold">{numberText(item.availablePackages, " package")}</td>
                        <td className="px-4 py-3"><AdminBadge tone={item.status === "available" ? "success" : item.status === "shortage" ? "warning" : "danger"}>{item.status === "available" ? "Đủ" : item.status === "shortage" ? `Thiếu ${item.shortagePackages}` : "Chưa rõ"}</AdminBadge></td>
                        <td className="px-4 py-3">{item.supplier ? <><b>{item.supplier.name}</b><p className="mt-1 text-xs font-medium text-slate-500">Đề xuất {item.supplier.recommendedOrderPackages} package · {money(item.supplier.estimatedPurchaseCost)} · lead {item.supplier.leadTimeDays ?? "?"} ngày</p></> : <span className="font-bold text-rose-700">Chưa có offer hợp lệ</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="text-lg font-black text-slate-950">Tải station dùng chung</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {plan.stations.map((station) => (
                  <article key={station.stationId} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2"><b>{station.stationName}</b><AdminBadge tone={station.feasible ? "success" : "danger"}>{numberText(station.utilization * 100, "%")}</AdminBadge></div>
                    <p className="mt-2 text-sm font-medium text-slate-600">{station.loadMinutes} / {station.shiftMinutes} phút · {station.recipeTitles.join(", ")}</p>
                  </article>
                ))}
              </div>
            </section>

            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer font-black text-slate-900">Giả định tính toán</summary>
              <ul className="mt-3 grid gap-2 text-sm font-medium text-slate-600">{plan.assumptions.map((assumption) => <li key={assumption}>• {assumption}</li>)}</ul>
            </details>
          </section>
        ) : <AdminEmptyState title="Chưa có kế hoạch" description="Chọn Recipe, nhập sản lượng và chạy lập kế hoạch deterministic." />}

        {aiJobId ? (
          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-black">AI giải thích kế hoạch</h3><AdminBadge tone={aiJob?.status === "completed" ? "success" : aiJob?.status === "failed" ? "danger" : "info"}>{aiJob?.status || "pending"}</AdminBadge></div>
            {aiJob?.status === "failed" ? <AdminAlert tone="danger">{aiJob.error_message || "AI job thất bại."}</AdminAlert> : <AiReadableResult text={aiJob?.response_text} emptyMessage="AI đang đọc kế hoạch deterministic." />}
          </section>
        ) : null}
      </AdminSurfaceBody>
    </AdminSurface>
  );
}
