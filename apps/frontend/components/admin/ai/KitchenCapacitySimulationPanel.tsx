"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { useAdminPermissions } from "@/components/admin/AdminPermissionProvider";
import { AiReadableResult } from "@/components/admin/ai/AiReadableResult";
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
} from "@/components/admin/ui/AdminUI";

type RecipeRow = { id: string; title: string; currentVersionNo: number | null };
type Version = { id: string; versionNo: number; workflowStatus: string; isCurrent: boolean; isPublished: boolean };

type ProfileStep = {
  id: string;
  recipeStepNo: number;
  stepName: string;
  cycleMinutes: number;
  laborMinutes: number;
  outputPerRun: number;
  workersRequired: number;
  equipmentUnitsRequired: number;
  notes: string | null;
  station: { id: string; name: string; parallelSlots: number; availableWorkers: number };
  equipment: { id: string; name: string | null; quantity: number | null } | null;
};

type ProfileDocument = {
  schemaVersion: string;
  recipe: {
    id: string;
    title: string;
    versionId: string;
    versionNo: number;
    snapshotYieldQuantity: string | number | null;
    snapshotYieldUnit: string | null;
    steps: Array<{ recipeStepNo: number; stepName: string; content: string }>;
  };
  readiness: { status: "missing" | "incomplete" | "ready"; missing: string[]; message: string };
  profile: {
    id: string;
    batchOutputQuantity: number;
    batchOutputUnit: string;
    setupMinutes: number;
    notes: string | null;
    steps: ProfileStep[];
  } | null;
};

type StepForm = {
  recipeStepNo: number;
  stepName: string;
  stationName: string;
  stationParallelSlots: string;
  stationAvailableWorkers: string;
  equipmentName: string;
  equipmentQuantity: string;
  cycleMinutes: string;
  laborMinutes: string;
  outputPerRun: string;
  workersRequired: string;
  equipmentUnitsRequired: string;
  notes: string;
};

type ScenarioStep = {
  recipeStepNo: number;
  stepName: string;
  station: { name: string; parallelSlots: number; availableWorkers: number };
  equipment: { name: string | null; quantity: number | null; unitsRequired: number } | null;
  cycleMinutes: number;
  outputPerRun: number;
  parallelRuns: number;
  throughputPerHour: number;
  capacityPerShift: number;
  utilization: number;
  blockedReason: string | null;
};

type Scenario = {
  feasible: boolean;
  blocked: boolean;
  estimatedCompletionMinutes: number | null;
  lineThroughputPerHour: number;
  capacityPerShift: number;
  maxUtilization: number;
  bottleneck: { stepName: string; stationName: string; throughputPerHour: number } | null;
  warnings: Array<{ code: string; severity: "info" | "warning" | "high"; message: string }>;
  steps: ScenarioStep[];
};

type SimulationResult = {
  schemaVersion: string;
  model: string;
  message?: string;
  profile?: ProfileDocument;
  recipe?: ProfileDocument["recipe"];
  baseline?: Scenario;
  scenario?: Scenario | null;
  improvement?: {
    completionMinutesSaved: number | null;
    capacityGain: number;
    throughputGainPerHour: number;
    feasibilityChanged: boolean;
  } | null;
};

type AiJob = {
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  response_text: string | null;
  error_message: string | null;
};

function numberText(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "Chưa tính được";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function percent(value: number): string {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function blankStep(step: ProfileDocument["recipe"]["steps"][number], batchOutput: string): StepForm {
  return {
    recipeStepNo: step.recipeStepNo,
    stepName: step.stepName,
    stationName: "",
    stationParallelSlots: "1",
    stationAvailableWorkers: "1",
    equipmentName: "",
    equipmentQuantity: "",
    cycleMinutes: "",
    laborMinutes: "",
    outputPerRun: batchOutput,
    workersRequired: "1",
    equipmentUnitsRequired: "",
    notes: "",
  };
}

function savedStep(step: ProfileStep): StepForm {
  return {
    recipeStepNo: step.recipeStepNo,
    stepName: step.stepName,
    stationName: step.station.name,
    stationParallelSlots: String(step.station.parallelSlots),
    stationAvailableWorkers: String(step.station.availableWorkers),
    equipmentName: step.equipment?.name || "",
    equipmentQuantity: step.equipment?.quantity ? String(step.equipment.quantity) : "",
    cycleMinutes: String(step.cycleMinutes),
    laborMinutes: String(step.laborMinutes),
    outputPerRun: String(step.outputPerRun),
    workersRequired: String(step.workersRequired),
    equipmentUnitsRequired: step.equipment ? String(step.equipmentUnitsRequired) : "",
    notes: step.notes || "",
  };
}

export function KitchenCapacitySimulationPanel() {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const canView = has("kitchen.capacity.view") && has("recipes.view");
  const canManage = has("kitchen.capacity.manage");
  const canUseAi = has("ai.use");

  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [profileDocument, setProfileDocument] = useState<ProfileDocument | null>(null);
  const [batchOutputQuantity, setBatchOutputQuantity] = useState("1");
  const [batchOutputUnit, setBatchOutputUnit] = useState("phần");
  const [setupMinutes, setSetupMinutes] = useState("0");
  const [profileNotes, setProfileNotes] = useState("");
  const [steps, setSteps] = useState<StepForm[]>([]);
  const [targetQuantity, setTargetQuantity] = useState("100");
  const [shiftMinutes, setShiftMinutes] = useState("480");
  const [extraWorkers, setExtraWorkers] = useState("0");
  const [extraEquipment, setExtraEquipment] = useState("0");
  const [prompt, setPrompt] = useState("Phân tích nút thắt, khả năng hoàn thành trong ca và tác động của kịch bản bổ sung nguồn lực. Nêu rõ dữ liệu và giả định trước khi kết luận.");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiJob, setAiJob] = useState<AiJob | null>(null);

  const selectedRecipe = useMemo(() => recipes.find((recipe) => recipe.id === recipeId) ?? null, [recipes, recipeId]);

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
        setRecipeId((current) => current || payload.recipes[0]?.id || "");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Không tải được danh sách Recipe.");
      }
    }
    void loadRecipes();
    return () => { cancelled = true; };
  }, [canView]);

  useEffect(() => {
    if (!recipeId || !canView) return;
    let cancelled = false;
    async function loadVersions() {
      try {
        const payload = await adminApiFetch<{ versions: Version[] }>(`/api/admin/recipes/${recipeId}/versions`, await token());
        if (cancelled) return;
        setVersions(payload.versions);
        const preferred = payload.versions.find((version) => version.isCurrent) || payload.versions[0];
        setVersionId(preferred?.id || "");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Không tải được Recipe Version.");
      }
    }
    setVersions([]);
    setVersionId("");
    setProfileDocument(null);
    setResult(null);
    void loadVersions();
    return () => { cancelled = true; };
  }, [recipeId, canView]);

  useEffect(() => {
    if (!recipeId || !versionId || !canView) return;
    let cancelled = false;
    async function loadProfile() {
      setBusy(true);
      setMessage("");
      try {
        const payload = await adminApiFetch<{ profile: ProfileDocument }>(
          `/api/admin/kitchen-capacity/profile?recipeId=${encodeURIComponent(recipeId)}&versionId=${encodeURIComponent(versionId)}`,
          await token(),
        );
        if (cancelled) return;
        const document = payload.profile;
        setProfileDocument(document);
        const batch = document.profile?.batchOutputQuantity
          ?? Number(document.recipe.snapshotYieldQuantity || 1)
          ?? 1;
        const batchText = String(batch > 0 ? batch : 1);
        setBatchOutputQuantity(batchText);
        setBatchOutputUnit(document.profile?.batchOutputUnit || document.recipe.snapshotYieldUnit || "phần");
        setSetupMinutes(String(document.profile?.setupMinutes ?? 0));
        setProfileNotes(document.profile?.notes || "");
        setSteps(document.profile?.steps.length
          ? document.profile.steps.map(savedStep)
          : document.recipe.steps.map((step) => blankStep(step, batchText)));
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Không tải được operational profile.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [recipeId, versionId, canView]);

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

  function updateStep(index: number, patch: Partial<StepForm>) {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  function number(value: string, label: string, options: { integer?: boolean; allowZero?: boolean } = {}) {
    const parsed = Number(value);
    const valid = Number.isFinite(parsed)
      && (options.allowZero ? parsed >= 0 : parsed > 0)
      && (!options.integer || Number.isInteger(parsed));
    if (!valid) throw new Error(`${label} không hợp lệ.`);
    return parsed;
  }

  function simulationBody() {
    return {
      recipeId,
      versionId,
      targetQuantity: number(targetQuantity, "Sản lượng mục tiêu"),
      shiftMinutes: number(shiftMinutes, "Thời lượng ca"),
      extraWorkersPerStation: number(extraWorkers || "0", "Nhân sự bổ sung", { integer: true, allowZero: true }),
      extraEquipmentPerType: number(extraEquipment || "0", "Thiết bị bổ sung", { integer: true, allowZero: true }),
    };
  }

  async function saveProfile() {
    if (!profileDocument || !versionId || !canManage) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = {
        recipeId,
        batchOutputQuantity: number(batchOutputQuantity, "Batch output"),
        batchOutputUnit: batchOutputUnit.trim(),
        setupMinutes: number(setupMinutes || "0", "Thời gian setup", { allowZero: true }),
        notes: profileNotes.trim() || null,
        steps: steps.map((step, index) => {
          const equipmentName = step.equipmentName.trim();
          return {
            recipeStepNo: step.recipeStepNo,
            stepName: step.stepName.trim(),
            stationName: step.stationName.trim(),
            stationParallelSlots: number(step.stationParallelSlots, `Số vị trí trạm bước ${index + 1}`, { integer: true }),
            stationAvailableWorkers: number(step.stationAvailableWorkers, `Nhân sự trạm bước ${index + 1}`, { integer: true }),
            equipmentName: equipmentName || null,
            equipmentQuantity: equipmentName ? number(step.equipmentQuantity, `Số thiết bị bước ${index + 1}`, { integer: true }) : null,
            cycleMinutes: number(step.cycleMinutes, `Cycle time bước ${index + 1}`),
            laborMinutes: number(step.laborMinutes || "0", `Labor time bước ${index + 1}`, { allowZero: true }),
            outputPerRun: number(step.outputPerRun, `Output/run bước ${index + 1}`),
            workersRequired: number(step.workersRequired, `Số người cần bước ${index + 1}`, { integer: true }),
            equipmentUnitsRequired: equipmentName ? number(step.equipmentUnitsRequired, `Thiết bị cần bước ${index + 1}`, { integer: true }) : 0,
            notes: step.notes.trim() || null,
          };
        }),
      };
      if (!payload.batchOutputUnit) throw new Error("Đơn vị batch output là bắt buộc.");
      if (payload.steps.some((step) => !step.stationName || !step.stepName)) throw new Error("Mỗi bước phải có tên bước và tên trạm.");
      const response = await adminApiFetch<{ profile: ProfileDocument }>(
        `/api/admin/kitchen-capacity/profiles/${versionId}`,
        await token(),
        { method: "PUT", body: JSON.stringify(payload) },
      );
      setProfileDocument(response.profile);
      setSteps(response.profile.profile?.steps.map(savedStep) || steps);
      setMessage("Đã lưu operational profile và khóa dữ liệu cho mô phỏng.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không lưu được operational profile.");
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    if (!recipeId || !versionId) return;
    setBusy(true);
    setMessage("");
    setAiJobId(null);
    setAiJob(null);
    try {
      const payload = await adminApiFetch<{ result: SimulationResult }>(
        "/api/admin/kitchen-capacity/simulate",
        await token(),
        { method: "POST", body: JSON.stringify(simulationBody()) },
      );
      setResult(payload.result);
      setMessage(payload.result.baseline ? "Đã mô phỏng năng lực bếp bằng dữ liệu đã lưu." : payload.result.message || "Chưa đủ dữ liệu mô phỏng.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không mô phỏng được năng lực bếp.");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!canUseAi || !recipeId || !versionId) return;
    setBusy(true);
    setMessage("");
    setAiJob(null);
    try {
      const payload = await adminApiFetch<{ jobId: string; status: string; simulation: SimulationResult }>(
        "/api/admin/kitchen-capacity/analyze",
        await token(),
        { method: "POST", body: JSON.stringify({ ...simulationBody(), prompt: prompt.trim() }) },
      );
      setResult(payload.simulation);
      setAiJobId(payload.jobId);
      setMessage(`AI đang phân tích job ${payload.jobId.slice(0, 8)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được AI job mô phỏng bếp.");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return <AdminEmptyState title="Không có quyền mô phỏng năng lực bếp" description="Tài khoản cần recipes.view và kitchen.capacity.view." />;
  }

  const baseline = result?.baseline;
  const scenario = result?.scenario;

  return (
    <AdminSurface>
      <AdminSurfaceHeader
        eyebrow="Phase 5"
        title="AI mô phỏng vận hành và năng lực bếp"
        description="Backend tính throughput, bottleneck và khả năng hoàn thành trong ca. AI chỉ giải thích kết quả; không tự bịa thời gian, phân công người hoặc mua thiết bị."
        actions={<AdminBadge tone={profileDocument?.readiness.status === "ready" ? "success" : "warning"}>{profileDocument?.readiness.status === "ready" ? "Profile sẵn sàng" : "Thiếu dữ liệu"}</AdminBadge>}
      />
      <AdminSurfaceBody className="grid gap-5">
        {message ? <AdminAlert tone={message.startsWith("Đã") || message.startsWith("AI đang") ? "success" : "warning"}>{message}</AdminAlert> : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <AdminField label="Recipe">
            <AdminSelect value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              {recipes.length ? recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}{recipe.currentVersionNo ? ` · v${recipe.currentVersionNo}` : ""}</option>) : <option value="">Chưa có Recipe</option>}
            </AdminSelect>
          </AdminField>
          <AdminField label="Recipe Version">
            <AdminSelect value={versionId} onChange={(event) => setVersionId(event.target.value)} disabled={!versions.length}>
              {versions.map((version) => <option key={version.id} value={version.id}>v{version.versionNo}{version.isCurrent ? " · hiện tại" : ""}{version.isPublished ? " · công khai" : ""}</option>)}
            </AdminSelect>
          </AdminField>
        </div>

        {profileDocument ? (
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">Operational profile · {selectedRecipe?.title || profileDocument.recipe.title} · v{profileDocument.recipe.versionNo}</h3>
                <p className="mt-1 text-sm font-medium text-slate-600">{profileDocument.readiness.message}</p>
              </div>
              {canManage ? <AdminButton tone="dark" size="sm" disabled={busy || !steps.length} onClick={() => void saveProfile()}>Lưu profile</AdminButton> : <AdminBadge tone="neutral">Chỉ xem</AdminBadge>}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <AdminField label="Sản lượng mỗi batch">
                <AdminInput value={batchOutputQuantity} onChange={(event) => setBatchOutputQuantity(event.target.value)} inputMode="decimal" disabled={!canManage} />
              </AdminField>
              <AdminField label="Đơn vị output">
                <AdminInput value={batchOutputUnit} onChange={(event) => setBatchOutputUnit(event.target.value)} disabled={!canManage} />
              </AdminField>
              <AdminField label="Setup đầu ca (phút)">
                <AdminInput value={setupMinutes} onChange={(event) => setSetupMinutes(event.target.value)} inputMode="decimal" disabled={!canManage} />
              </AdminField>
            </div>
            <AdminField label="Ghi chú profile">
              <AdminTextarea value={profileNotes} onChange={(event) => setProfileNotes(event.target.value)} disabled={!canManage} />
            </AdminField>

            <div className="grid gap-3">
              {steps.map((step, index) => (
                <article key={step.recipeStepNo} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>Bước {step.recipeStepNo} · {step.stepName}</b>
                    <AdminBadge tone="neutral">Dữ liệu thật</AdminBadge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <AdminField label="Trạm bếp">
                      <AdminInput value={step.stationName} onChange={(event) => updateStep(index, { stationName: event.target.value })} disabled={!canManage} placeholder="Ví dụ: Trạm ủ trà" />
                    </AdminField>
                    <AdminField label="Vị trí chạy song song">
                      <AdminInput value={step.stationParallelSlots} onChange={(event) => updateStep(index, { stationParallelSlots: event.target.value })} inputMode="numeric" disabled={!canManage} />
                    </AdminField>
                    <AdminField label="Nhân sự có tại trạm">
                      <AdminInput value={step.stationAvailableWorkers} onChange={(event) => updateStep(index, { stationAvailableWorkers: event.target.value })} inputMode="numeric" disabled={!canManage} />
                    </AdminField>
                    <AdminField label="Người cần cho một run">
                      <AdminInput value={step.workersRequired} onChange={(event) => updateStep(index, { workersRequired: event.target.value })} inputMode="numeric" disabled={!canManage} />
                    </AdminField>
                    <AdminField label="Cycle time/run (phút)">
                      <AdminInput value={step.cycleMinutes} onChange={(event) => updateStep(index, { cycleMinutes: event.target.value })} inputMode="decimal" disabled={!canManage} />
                    </AdminField>
                    <AdminField label="Labor time/run (phút)">
                      <AdminInput value={step.laborMinutes} onChange={(event) => updateStep(index, { laborMinutes: event.target.value })} inputMode="decimal" disabled={!canManage} />
                    </AdminField>
                    <AdminField label="Output mỗi run">
                      <AdminInput value={step.outputPerRun} onChange={(event) => updateStep(index, { outputPerRun: event.target.value })} inputMode="decimal" disabled={!canManage} />
                    </AdminField>
                    <AdminField label="Thiết bị (không bắt buộc)">
                      <AdminInput value={step.equipmentName} onChange={(event) => updateStep(index, { equipmentName: event.target.value })} disabled={!canManage} placeholder="Ví dụ: Máy ủ trà" />
                    </AdminField>
                    {step.equipmentName.trim() ? <>
                      <AdminField label="Số thiết bị hiện có">
                        <AdminInput value={step.equipmentQuantity} onChange={(event) => updateStep(index, { equipmentQuantity: event.target.value })} inputMode="numeric" disabled={!canManage} />
                      </AdminField>
                      <AdminField label="Thiết bị cần/run">
                        <AdminInput value={step.equipmentUnitsRequired} onChange={(event) => updateStep(index, { equipmentUnitsRequired: event.target.value })} inputMode="numeric" disabled={!canManage} />
                      </AdminField>
                    </> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : <AdminEmptyState title={busy ? "Đang tải operational profile…" : "Chọn Recipe Version để cấu hình"} />}

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="font-black text-slate-950">Kịch bản mô phỏng</h3>
            <p className="mt-1 text-sm font-medium text-slate-600">Baseline dùng profile đã lưu. Kịch bản cộng cùng số người cho mỗi trạm và cùng số máy cho mỗi loại thiết bị được sử dụng.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminField label="Sản lượng mục tiêu">
              <AdminInput value={targetQuantity} onChange={(event) => setTargetQuantity(event.target.value)} inputMode="decimal" />
            </AdminField>
            <AdminField label="Thời lượng ca (phút)">
              <AdminInput value={shiftMinutes} onChange={(event) => setShiftMinutes(event.target.value)} inputMode="decimal" />
            </AdminField>
            <AdminField label="Thêm người mỗi trạm">
              <AdminInput value={extraWorkers} onChange={(event) => setExtraWorkers(event.target.value)} inputMode="numeric" />
            </AdminField>
            <AdminField label="Thêm máy mỗi loại">
              <AdminInput value={extraEquipment} onChange={(event) => setExtraEquipment(event.target.value)} inputMode="numeric" />
            </AdminField>
          </div>
          <AdminField label="Yêu cầu AI phân tích">
            <AdminTextarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </AdminField>
          <div className="flex flex-wrap gap-2">
            <AdminButton tone="dark" disabled={busy || !recipeId || !versionId} onClick={() => void simulate()}>{busy ? "Đang xử lý…" : "Chạy mô phỏng"}</AdminButton>
            {canUseAi ? <AdminButton tone="primary" disabled={busy || !recipeId || !versionId || prompt.trim().length < 3} onClick={() => void analyze()}>Phân tích bằng AI</AdminButton> : null}
            <AdminBadge tone="neutral">Không tự phân công</AdminBadge>
            <AdminBadge tone="neutral">Không tự mua máy</AdminBadge>
          </div>
        </section>

        {baseline ? (
          <section className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Khả thi trong ca</p><p className="mt-1 text-2xl font-black">{baseline.feasible ? "Có" : "Không"}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Thời gian ước tính</p><p className="mt-1 text-2xl font-black">{numberText(baseline.estimatedCompletionMinutes, " phút")}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Công suất/ca</p><p className="mt-1 text-2xl font-black">{numberText(baseline.capacityPerShift)}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase text-slate-500">Nút thắt</p><p className="mt-1 text-lg font-black">{baseline.bottleneck?.stepName || "Chưa xác định"}</p></div>
            </div>

            {scenario && result?.improvement ? (
              <AdminAlert tone={scenario.feasible ? "success" : "warning"} title="So sánh kịch bản">
                Tiết kiệm {numberText(result.improvement.completionMinutesSaved, " phút")}; tăng {numberText(result.improvement.capacityGain)} đơn vị/ca; throughput tăng {numberText(result.improvement.throughputGainPerHour, "/giờ")}.
              </AdminAlert>
            ) : null}

            {baseline.warnings.map((warning) => (
              <AdminAlert key={`${warning.code}-${warning.message}`} tone={warning.severity === "high" ? "danger" : warning.severity === "warning" ? "warning" : "info"}>{warning.message}</AdminAlert>
            ))}

            <div className="grid gap-3 md:grid-cols-2">
              {baseline.steps.map((step) => (
                <article key={step.recipeStepNo} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>Bước {step.recipeStepNo} · {step.stepName}</b>
                    <AdminBadge tone={step.blockedReason ? "danger" : step.utilization > 1 ? "warning" : "success"}>{step.blockedReason ? "Bị chặn" : percent(step.utilization)}</AdminBadge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-600">{step.station.name} · {numberText(step.throughputPerHour, "/giờ")} · {step.parallelRuns} run song song</p>
                  {step.equipment ? <p className="mt-1 text-xs font-bold text-slate-500">{step.equipment.name}: {step.equipment.quantity} máy, cần {step.equipment.unitsRequired}/run</p> : null}
                  {step.blockedReason ? <p className="mt-2 text-sm font-bold text-rose-700">{step.blockedReason}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : result?.message ? <AdminAlert tone="warning" title="Chưa thể mô phỏng">{result.message}</AdminAlert> : null}

        {aiJobId ? (
          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-slate-950">Phân tích AI</h3>
              <AdminBadge tone={aiJob?.status === "completed" ? "success" : aiJob?.status === "failed" ? "danger" : "info"}>{aiJob?.status || "pending"}</AdminBadge>
            </div>
            {aiJob?.response_text ? <AiReadableResult text={aiJob.response_text} /> : aiJob?.error_message ? <AdminAlert tone="danger">{aiJob.error_message}</AdminAlert> : <p className="text-sm font-medium text-slate-600">AI đang đọc kết quả mô phỏng deterministic…</p>}
          </section>
        ) : null}
      </AdminSurfaceBody>
    </AdminSurface>
  );
}
