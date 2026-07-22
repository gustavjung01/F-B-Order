"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/admin-api";
import { createRecipeMediaDraft, loadRecipeMediaReferences, syncRecipeMedia, uploadRecipeMedia } from "@/lib/recipe-media-client";
import { useAdminPermissions } from "./AdminPermissionProvider";
import { AdminAlert, AdminEmptyState } from "./ui/AdminUI";
import { RecipeCompletionBar, RecipeEditorTabs, RecipeUndoToast } from "./recipe-editor/RecipeEditorChrome";
import { RecipeIngredientsTab } from "./recipe-editor/RecipeIngredientsTab";
import { RecipeOverviewTab } from "./recipe-editor/RecipeOverviewTab";
import { RecipeCatalogPickerDialog, RecipeMediaPickerDialog } from "./recipe-editor/RecipePickerDialogs";
import { RecipeEditorFooter, RecipePublishTab } from "./recipe-editor/RecipePublishTab";
import { RecipeAiAssistantPanel } from "./recipe-editor/RecipeAiAssistantPanel";
import { RecipeStepsTab } from "./recipe-editor/RecipeStepsTab";
import { buildRecipeStepMediaAssignments, mergeSuggestedRecipeSteps } from "./recipe-editor/recipe-step-merge.mjs";
import type { CatalogOption, EditorTab, FormState, Ingredient, MediaPickerItem, RecipeDetail, RecipeRow, Step, Toast, UndoDelete, UploadPhase, Version } from "./recipe-editor/types";
import { catalogLabel, completionItems, emptyForm, emptyIngredient, emptyStep, formatDate, moveItem, serialized, toForm, validationErrors, workflowLabel } from "./recipe-editor/types";

export function AdminRecipeOperationsPanelV5() {
  const { getToken, isLoaded } = useAuth();
  const { has } = useAdminPermissions();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [baseline, setBaseline] = useState(serialized(emptyForm()));
  const [versions, setVersions] = useState<Version[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("overview");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewInput, setReviewInput] = useState("");
  const [uploadStates, setUploadStates] = useState<Record<string, UploadPhase>>({});
  const [catalogPickerIngredientId, setCatalogPickerIngredientId] = useState<string | null>(null);
  const [mediaPickerStepId, setMediaPickerStepId] = useState<string | null>(null);
  const [undoDelete, setUndoDelete] = useState<UndoDelete | null>(null);

  const canView = has("recipes.view");
  const canEdit = has("recipes.edit");
  const canReview = has("recipes.review");
  const canPublish = has("recipes.publish");
  const canManageMedia = has("recipes.media.manage");
  const canEditContent = canEdit && canManageMedia;

  const dirty = useMemo(() => serialized(form) !== baseline, [form, baseline]);
  const uploading = Object.values(uploadStates).some((phase) => !new Set<UploadPhase>(["done", "error"]).has(phase));
  const workflowLocked = form.workflowStatus === "in_review" || form.workflowStatus === "approved";
  const contentLocked = workflowLocked || !canEditContent;
  const visibleRows = useMemo(() => statusFilter === "all" ? rows : rows.filter((row) => (row.workflowStatus || "draft") === statusFilter), [rows, statusFilter]);
  const completion = useMemo(() => completionItems(form), [form]);
  const selectedIngredient = form.ingredients.find((item) => item.clientId === catalogPickerIngredientId) || null;
  const selectedStep = form.steps.find((item) => item.clientId === mediaPickerStepId) || null;

  const mediaPickerItems = useMemo(() => {
    const candidates: MediaPickerItem[] = [];
    if (form.coverImageUrl) candidates.push({ id: "cover", label: "Ảnh bìa công thức", imageUrl: form.coverImageUrl, thumbnailUrl: form.coverThumbnailUrl || form.coverImageUrl, mediaId: form.coverMediaId, source: "cover" });
    form.ingredients.forEach((item) => {
      if (item.imageUrl) candidates.push({ id: `ingredient:${item.clientId}`, label: item.catalogLabel || item.productName || "Ảnh nguyên liệu", imageUrl: item.imageUrl, thumbnailUrl: item.imageUrl, mediaId: null, source: "ingredient" });
    });
    form.steps.forEach((step, index) => {
      if (step.imageUrl && step.clientId !== mediaPickerStepId) candidates.push({ id: `step:${step.clientId}`, label: step.title || `Ảnh bước ${index + 1}`, imageUrl: step.imageUrl, thumbnailUrl: step.thumbnailUrl || step.imageUrl, mediaId: step.mediaId, source: "step" });
    });
    return [...new Map(candidates.map((item) => [item.imageUrl, item])).values()];
  }, [form.coverImageUrl, form.coverThumbnailUrl, form.coverMediaId, form.ingredients, form.steps, mediaPickerStepId]);

  const tabIssues = useMemo(() => {
    const issues: Partial<Record<EditorTab, number>> = {};
    errors.forEach((error) => {
      const lower = error.toLocaleLowerCase("vi-VN");
      const tab: EditorTab = lower.includes("nguyên liệu") ? "ingredients" : lower.includes("bước") ? "steps" : "overview";
      issues[tab] = (issues[tab] || 0) + 1;
    });
    return issues;
  }, [errors]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!undoDelete) return;
    const timer = window.setTimeout(() => setUndoDelete(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undoDelete]);

  useEffect(() => {
    if (!editorOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (catalogPickerIngredientId) setCatalogPickerIngredientId(null);
      else if (mediaPickerStepId) setMediaPickerStepId(null);
      else requestClose();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", escape);
    };
  }, [editorOpen, dirty, saving, uploading, catalogPickerIngredientId, mediaPickerStepId]);

  async function authToken() {
    const value = await getToken();
    if (!value) throw new Error("Bạn cần đăng nhập admin để quản lý công thức.");
    return value;
  }

  async function loadRows() {
    if (!isLoaded || !canView) return;
    setLoading(true);
    try {
      const result = await adminApiFetch<{ recipes: RecipeRow[] }>(`/api/admin/recipes?limit=100&q=${encodeURIComponent(query.trim())}`, await authToken());
      setRows(result.recipes || []);
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không tải được danh sách công thức." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRows(); }, [isLoaded, canView]);

  async function hydrateCatalogImages(next: FormState, token: string) {
    const ids = [...new Set(next.ingredients.flatMap((item) => item.catalogVariantId ? [item.catalogVariantId] : []))];
    if (!ids.length) return next;
    try {
      const result = await adminApiFetch<{ items: Array<{ variantId: string; imageUrl: string | null }> }>(`/api/admin/recipes/media/catalog?variantIds=${encodeURIComponent(ids.join(","))}`, token);
      const images = new Map(result.items.map((item) => [item.variantId, item.imageUrl]));
      return { ...next, ingredients: next.ingredients.map((item) => ({ ...item, imageUrl: item.catalogVariantId ? images.get(item.catalogVariantId) || null : null })) };
    } catch (cause) {
      setToast({ kind: "error", message: `Không tải được ảnh catalog: ${cause instanceof Error ? cause.message : "Lỗi không xác định"}` });
      return next;
    }
  }

  async function buildLoadedForm(recipe: RecipeDetail, token: string) {
    let next = await hydrateCatalogImages(toForm(recipe), token);
    const media = await loadRecipeMediaReferences(token, recipe.id);
    if (media.cover) next = { ...next, coverMediaId: media.cover.mediaId, coverImageUrl: media.cover.publicUrl, coverThumbnailUrl: media.cover.thumbnailUrl };
    next = {
      ...next,
      steps: next.steps.map((step, index) => {
        const reference = media.steps.find((item) => item.stepNo === index + 1);
        return reference?.mediaId ? { ...step, mediaId: reference.mediaId, imageUrl: reference.publicUrl || step.imageUrl, thumbnailUrl: reference.thumbnailUrl || "" } : step;
      }),
    };
    return next;
  }

  function resetEditorState(next: FormState, nextDraftId: string | null, nextVersions: Version[], nextReviewInput: string) {
    setDraftId(nextDraftId);
    setForm(next);
    setBaseline(serialized(next));
    setVersions(nextVersions);
    setReviewInput(nextReviewInput);
    setErrors([]);
    setUploadStates({});
    setCatalogPickerIngredientId(null);
    setMediaPickerStepId(null);
    setUndoDelete(null);
    setActiveTab("overview");
    setEditorOpen(true);
  }

  async function createRecipe() {
    if (!canEditContent) {
      setToast({ kind: "error", message: "Cần quyền recipes.edit và recipes.media.manage để tạo công thức an toàn." });
      return;
    }
    try {
      const token = await authToken();
      const draft = await createRecipeMediaDraft(token);
      resetEditorState(emptyForm(), draft.draftId, [], "");
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không tạo được phiên media nháp." });
    }
  }

  async function openRecipe(id: string) {
    try {
      const token = await authToken();
      const draftPromise = canManageMedia
        ? createRecipeMediaDraft(token, id)
        : Promise.resolve({ draftId: null as string | null });
      const [detail, versionResult, draft] = await Promise.all([
        adminApiFetch<{ recipe: RecipeDetail }>(`/api/admin/recipes/${id}`, token),
        adminApiFetch<{ versions: Version[] }>(`/api/admin/recipes/${id}/versions`, token),
        draftPromise,
      ]);
      const next = await buildLoadedForm(detail.recipe, token);
      resetEditorState(next, draft.draftId, versionResult.versions || [], detail.recipe.reviewNote || "");
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không mở được công thức." });
    }
  }

  function requestClose() {
    if (saving || uploading) {
      setToast({ kind: "error", message: "Không thể đóng editor khi đang lưu hoặc upload ảnh." });
      return;
    }
    if (dirty && !window.confirm("Công thức có thay đổi chưa lưu. Đóng và bỏ các thay đổi?")) return;
    setEditorOpen(false);
  }

  function patchForm(patch: Partial<FormState>) {
    if (contentLocked) return;
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateIngredient(clientId: string, patch: Partial<Ingredient>) {
    if (contentLocked) return;
    setForm((current) => ({ ...current, ingredients: current.ingredients.map((item) => item.clientId === clientId ? { ...item, ...patch } : item) }));
  }

  function updateStep(clientId: string, patch: Partial<Step>) {
    if (contentLocked) return;
    setForm((current) => ({ ...current, steps: current.steps.map((item) => item.clientId === clientId ? { ...item, ...patch } : item) }));
  }

  function deleteIngredient(clientId: string) {
    if (contentLocked) return;
    const index = form.ingredients.findIndex((item) => item.clientId === clientId);
    if (index < 0) return;
    const item = form.ingredients[index];
    setForm((current) => ({ ...current, ingredients: current.ingredients.filter((row) => row.clientId !== clientId) }));
    setUndoDelete({ kind: "ingredient", item, index, label: item.productName || `nguyên liệu ${index + 1}` });
  }

  function deleteStep(clientId: string) {
    if (contentLocked) return;
    const index = form.steps.findIndex((item) => item.clientId === clientId);
    if (index < 0) return;
    const item = form.steps[index];
    setForm((current) => ({ ...current, steps: current.steps.filter((row) => row.clientId !== clientId) }));
    setUndoDelete({ kind: "step", item, index, label: item.title || `bước ${index + 1}` });
  }

  function undoLastDelete() {
    if (!undoDelete || contentLocked) return;
    if (undoDelete.kind === "ingredient") {
      setForm((current) => {
        const next = [...current.ingredients];
        next.splice(Math.min(undoDelete.index, next.length), 0, undoDelete.item);
        return { ...current, ingredients: next };
      });
    } else {
      setForm((current) => {
        const next = [...current.steps];
        next.splice(Math.min(undoDelete.index, next.length), 0, undoDelete.item);
        return { ...current, steps: next };
      });
    }
    setUndoDelete(null);
  }

  function selectCatalog(option: CatalogOption) {
    if (!catalogPickerIngredientId || contentLocked) return;
    updateIngredient(catalogPickerIngredientId, {
      productName: option.variantName.toLocaleLowerCase("vi-VN") === option.productName.toLocaleLowerCase("vi-VN") ? option.productName : `${option.productName} · ${option.variantName}`,
      catalogVariantId: option.variantId,
      catalogProductId: option.productId,
      catalogLabel: catalogLabel(option),
      imageUrl: option.imageUrl,
    });
    setCatalogPickerIngredientId(null);
  }

  async function upload(file: File, target: { kind: "cover" } | { kind: "step"; clientId: string }) {
    if (!canManageMedia || contentLocked) {
      setToast({ kind: "error", message: "Bạn không có quyền quản lý media công thức." });
      return;
    }
    const key = target.kind === "cover" ? "cover" : `step:${target.clientId}`;
    setUploadStates((current) => ({ ...current, [key]: "processing" }));
    try {
      const token = await authToken();
      let activeDraft = draftId;
      if (!activeDraft) {
        const created = await createRecipeMediaDraft(token, form.id);
        activeDraft = created.draftId;
        setDraftId(activeDraft);
      }
      const media = await uploadRecipeMedia({ token, draftId: activeDraft, purpose: target.kind, file, onPhase: (phase) => setUploadStates((current) => ({ ...current, [key]: phase })) });
      if (target.kind === "cover") setForm((current) => ({ ...current, coverMediaId: media.mediaId, coverImageUrl: media.publicUrl, coverThumbnailUrl: media.thumbnailUrl }));
      else setForm((current) => ({ ...current, steps: current.steps.map((item) => item.clientId === target.clientId ? { ...item, mediaId: media.mediaId, imageUrl: media.publicUrl, thumbnailUrl: media.thumbnailUrl } : item) }));
      setUploadStates((current) => ({ ...current, [key]: "done" }));
      setToast({ kind: "success", message: "Đã resize, nén WebP và tải cả ảnh chính lẫn thumbnail lên R2." });
    } catch (cause) {
      setUploadStates((current) => ({ ...current, [key]: "error" }));
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không upload được ảnh." });
    }
  }

  function payload() {
    return {
      slug: form.slug,
      title: form.title,
      shortDescription: form.shortDescription,
      description: form.description,
      relatedBrand: form.relatedBrand,
      coverImageUrl: form.coverImageUrl,
      yieldQuantity: form.yieldQuantity,
      yieldUnit: form.yieldUnit,
      sortOrder: form.sortOrder,
      changeNote: form.changeNote,
      ingredients: form.ingredients.filter((item) => item.productName.trim() || item.catalogVariantId).map((item) => ({ productName: item.productName, quantity: item.quantity, unit: item.unit, note: item.note, optional: item.optional, catalogVariantId: item.catalogVariantId || undefined })),
      steps: form.steps.filter((item) => item.content.trim()).map((item) => ({ title: item.title, content: item.content, imageUrl: item.imageUrl })),
    };
  }

  async function reloadEditor(recipeId: string, token: string) {
    const [detail, versionResult] = await Promise.all([
      adminApiFetch<{ recipe: RecipeDetail }>(`/api/admin/recipes/${recipeId}`, token),
      adminApiFetch<{ versions: Version[] }>(`/api/admin/recipes/${recipeId}/versions`, token),
    ]);
    const next = await buildLoadedForm(detail.recipe, token);
    setForm(next);
    setBaseline(serialized(next));
    setVersions(versionResult.versions || []);
    setReviewInput(detail.recipe.reviewNote || "");
    await loadRows();
  }

  function showValidation(nextErrors: string[]) {
    setErrors(nextErrors);
    if (!nextErrors.length) return false;
    const first = nextErrors[0].toLocaleLowerCase("vi-VN");
    setActiveTab(first.includes("nguyên liệu") ? "ingredients" : first.includes("bước") ? "steps" : "overview");
    setToast({ kind: "error", message: "Công thức còn lỗi. Đã chuyển tới phần cần sửa." });
    return true;
  }

  async function save() {
    if (!canEditContent) {
      setToast({ kind: "error", message: "Cần quyền recipes.edit và recipes.media.manage để lưu mà không làm mất media." });
      return;
    }
    if (showValidation(validationErrors(form)) || uploading) return;
    setSaving(true);
    try {
      const token = await authToken();
      const path = form.id ? `/api/admin/recipes/${form.id}` : "/api/admin/recipes";
      const result = await adminApiFetch<{ recipe: RecipeDetail }>(path, token, { method: form.id ? "PATCH" : "POST", body: JSON.stringify(payload()) });
      const savedSteps = form.steps.filter((step) => step.content.trim());
      await syncRecipeMedia({
        token,
        recipeId: result.recipe.id,
        coverMediaId: form.coverMediaId,
        steps: buildRecipeStepMediaAssignments(savedSteps),
      });
      await reloadEditor(result.recipe.id, token);
      setToast({ kind: "success", message: form.id ? "Đã lưu version mới và đồng bộ vòng đời ảnh." : "Đã tạo công thức và gắn media từ draft." });
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof AdminApiError ? cause.message : cause instanceof Error ? cause.message : "Không lưu được công thức." });
    } finally {
      setSaving(false);
    }
  }

  async function lifecycle(path: string, body?: unknown, validateReview = false) {
    if (!form.id) return;
    if (dirty) {
      setToast({ kind: "error", message: "Phải lưu các thay đổi trước khi thao tác workflow." });
      return;
    }
    if (validateReview && showValidation(validationErrors(form, true))) return;
    setSaving(true);
    try {
      const token = await authToken();
      await adminApiFetch(path, token, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      await reloadEditor(form.id, token);
      setActiveTab("publish");
      setToast({ kind: "success", message: "Đã cập nhật workflow công thức." });
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không cập nhật được workflow." });
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Ẩn công thức này? Dữ liệu và lịch sử phiên bản vẫn được giữ lại.")) return;
    try {
      await adminApiFetch(`/api/admin/recipes/${id}`, await authToken(), { method: "DELETE" });
      if (form.id === id) setEditorOpen(false);
      await loadRows();
      setToast({ kind: "success", message: "Đã ẩn công thức." });
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không thể ẩn công thức." });
    }
  }

  if (!canView) {
    return <AdminEmptyState title="Không có quyền xem công thức" description="Tài khoản cần permission recipes.view để mở module này." />;
  }

  return (
    <div className="space-y-5">
      {toast ? <div role={toast.kind === "error" ? "alert" : "status"} aria-live="polite" className={`fixed bottom-24 left-1/2 z-[80] w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-2xl ${toast.kind === "error" ? "bg-red-600" : "bg-emerald-600"}`}>{toast.message}</div> : null}
      {canEditContent ? <RecipeUndoToast undo={undoDelete} onUndo={undoLastDelete} onDismiss={() => setUndoDelete(null)} /> : null}

      {!canEdit ? <AdminAlert tone="info" title="Chế độ chỉ xem">Bạn có thể đọc công thức và lịch sử, nhưng không có quyền recipes.edit.</AdminAlert> : null}
      {canEdit && !canManageMedia ? <AdminAlert tone="warning" title="Tạm khóa chỉnh sửa">Thiếu recipes.media.manage. Editor giữ chế độ chỉ xem để không làm mất mapping ảnh khi tạo version mới.</AdminAlert> : null}

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Recipe operations V5</p><h2 className="mt-2 text-3xl font-black">Công thức</h2><p className="mt-1 text-sm font-bold text-slate-500">Editor theo tab, picker riêng, drag/drop, undo và completion tracking.</p></div>
          {canEditContent ? <button type="button" onClick={() => void createRecipe()} className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white">+ Tạo công thức</button> : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRows(); }} placeholder="Tìm theo tên hoặc slug" className="h-12 rounded-2xl bg-slate-100 px-4 font-bold" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-12 rounded-2xl bg-slate-100 px-4 font-bold"><option value="all">Tất cả trạng thái</option>{Object.entries(workflowLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button type="button" onClick={() => void loadRows()} className="rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">Tìm</button>
        </div>
        {loading ? <p className="mt-4 text-sm font-bold text-slate-500">Đang tải...</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visibleRows.map((row) => <article key={row.id} className="rounded-2xl bg-slate-100 p-4 ring-1 ring-slate-200">
            <button type="button" onClick={() => void openRecipe(row.id)} className="block w-full text-left"><p className="text-xs font-black uppercase text-orange-600">{workflowLabel[row.workflowStatus || "draft"]} · v{row.currentVersionNo || "-"}</p><h3 className="mt-1 text-lg font-black">{row.title}</h3><p className="mt-1 text-sm font-bold text-slate-500">{row.ingredientCount} nguyên liệu · {row.stepCount} bước</p></button>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3"><span className="text-xs font-bold text-slate-500">{formatDate(row.updatedAt)}</span>{canEdit && row.status !== "inactive" ? <button type="button" onClick={() => void archive(row.id)} className="text-xs font-black text-red-700">Ẩn</button> : null}</div>
          </article>)}
          {!loading && visibleRows.length === 0 ? <AdminEmptyState title="Không có công thức phù hợp" description="Đổi từ khóa hoặc bộ lọc trạng thái để tìm lại." className="md:col-span-2" /> : null}
        </div>
      </section>

      {editorOpen ? <div className="fixed inset-0 z-50 bg-slate-950/75 p-0 backdrop-blur-sm md:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
        <section className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden bg-slate-50 text-slate-950 md:h-[calc(100vh-40px)] md:rounded-[30px]">
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 md:p-5">
            <div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Recipe editor V5</p><h2 className="mt-1 text-2xl font-black">{form.id ? "Chỉnh công thức" : "Tạo công thức nháp"}</h2><div className="mt-2 flex flex-wrap gap-2">{form.workflowStatus ? <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-800">{workflowLabel[form.workflowStatus]} · v{form.currentVersionNo || "-"}</span> : null}<span className={`rounded-full px-3 py-1 text-xs font-black ${dirty ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{dirty ? "Có thay đổi chưa lưu" : "Đã đồng bộ"}</span>{draftId ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">Draft media: {draftId.slice(0, 8)}</span> : null}{contentLocked ? <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700">Chỉ xem</span> : null}</div></div>
            <button type="button" disabled={saving || uploading} onClick={requestClose} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-xl font-black disabled:opacity-50">×</button>
          </header>

          <RecipeEditorTabs activeTab={activeTab} onChange={setActiveTab} tabIssues={tabIssues} />
          <RecipeCompletionBar items={completion} onJump={setActiveTab} />

          <div className="flex-1 overflow-y-auto p-4 pb-40 md:p-5 md:pb-28">
            {errors.length ? <div role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-200"><b className="block">Cần sửa trước khi tiếp tục:</b><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
            {workflowLocked ? <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Phiên bản đang review hoặc đã duyệt nên nội dung được khóa. Hành động workflow nằm ở footer.</p> : null}

            {form.id ? (
              <RecipeAiAssistantPanel
                recipeId={form.id}
                recipeTitle={form.title}
                dirty={dirty}
                locked={workflowLocked || !canEdit}
                onOpenSteps={() => setActiveTab("steps")}
                onApplySteps={(steps) => {
                  setForm((current) => ({
                    ...current,
                    steps: mergeSuggestedRecipeSteps(current.steps, steps, emptyStep),
                  }));
                }}
              />
            ) : null}

            {activeTab === "overview" ? <RecipeOverviewTab form={form} locked={contentLocked} uploading={uploading} coverPhase={uploadStates.cover} onPatch={patchForm} onUploadCover={(file) => void upload(file, { kind: "cover" })} onRemoveCover={() => setForm((current) => ({ ...current, coverImageUrl: "", coverThumbnailUrl: "", coverMediaId: null }))} /> : null}
            {activeTab === "ingredients" ? <RecipeIngredientsTab ingredients={form.ingredients} locked={contentLocked} onUpdate={updateIngredient} onAdd={() => setForm((current) => ({ ...current, ingredients: [...current.ingredients, emptyIngredient()] }))} onDelete={deleteIngredient} onOpenCatalog={setCatalogPickerIngredientId} onMove={(from, to) => setForm((current) => ({ ...current, ingredients: moveItem(current.ingredients, from, to) }))} /> : null}
            {activeTab === "steps" ? <RecipeStepsTab steps={form.steps} locked={contentLocked} uploading={uploading} uploadStates={uploadStates} onUpdate={updateStep} onAdd={() => setForm((current) => ({ ...current, steps: [...current.steps, emptyStep()] }))} onDelete={deleteStep} onMove={(from, to) => setForm((current) => ({ ...current, steps: moveItem(current.steps, from, to) }))} onOpenMediaPicker={setMediaPickerStepId} onUpload={(file, clientId) => void upload(file, { kind: "step", clientId })} /> : null}
            {activeTab === "publish" ? <RecipePublishTab form={form} versions={versions} completion={completion} reviewInput={reviewInput} canReview={canReview} onReviewInputChange={setReviewInput} /> : null}
          </div>

          <RecipeEditorFooter
            form={form}
            dirty={dirty}
            saving={saving}
            uploading={uploading}
            reviewInput={reviewInput}
            canEdit={canEditContent}
            canReview={canReview}
            canPublish={canPublish}
            onClose={requestClose}
            onSave={() => void save()}
            onSubmitReview={() => void lifecycle(`/api/admin/recipes/${form.id}/submit-review`, undefined, true)}
            onRequestChanges={() => {
              if (!reviewInput.trim()) { setToast({ kind: "error", message: "Nhận xét là bắt buộc khi yêu cầu chỉnh sửa." }); setActiveTab("publish"); return; }
              void lifecycle(`/api/admin/recipes/${form.id}/review`, { decision: "changes_requested", note: reviewInput });
            }}
            onApprove={() => void lifecycle(`/api/admin/recipes/${form.id}/review`, { decision: "approved", note: reviewInput })}
            onPublish={() => void lifecycle(`/api/admin/recipes/${form.id}/publish`)}
          />
        </section>
      </div> : null}

      <RecipeCatalogPickerDialog open={canEditContent && Boolean(catalogPickerIngredientId)} ingredientLabel={selectedIngredient?.productName || ""} onClose={() => setCatalogPickerIngredientId(null)} onSelect={selectCatalog} />
      <RecipeMediaPickerDialog
        open={canEditContent && Boolean(mediaPickerStepId)}
        items={mediaPickerItems}
        onClose={() => setMediaPickerStepId(null)}
        onSelect={(item) => {
          if (mediaPickerStepId && !contentLocked) setForm((current) => ({ ...current, steps: current.steps.map((step) => step.clientId === mediaPickerStepId ? { ...step, imageUrl: item.imageUrl, thumbnailUrl: item.thumbnailUrl, mediaId: item.mediaId } : step) }));
          setMediaPickerStepId(null);
        }}
        onClear={() => {
          if (selectedStep && !contentLocked) setForm((current) => ({ ...current, steps: current.steps.map((step) => step.clientId === selectedStep.clientId ? { ...step, imageUrl: "", thumbnailUrl: "", mediaId: null } : step) }));
          setMediaPickerStepId(null);
        }}
      />
    </div>
  );
}
