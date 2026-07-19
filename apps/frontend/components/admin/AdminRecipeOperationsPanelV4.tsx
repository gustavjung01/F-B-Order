"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/admin-api";
import {
  createRecipeMediaDraft,
  loadRecipeMediaReferences,
  syncRecipeMedia,
  uploadRecipeMedia,
} from "@/lib/recipe-media-client";

type WorkflowStatus = "draft" | "in_review" | "changes_requested" | "approved" | "published" | null;
type Toast = { kind: "success" | "error"; message: string } | null;
type UploadPhase = "processing" | "presign" | "upload-main" | "upload-thumbnail" | "verify" | "complete" | "done" | "error";

type CatalogSnapshot = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  options: Record<string, unknown>;
  isOrderable: boolean;
};

type CatalogOption = CatalogSnapshot & {
  brand: string | null;
  priceMode: string;
  priceLabel: string | null;
  imageUrl: string | null;
};

type Ingredient = {
  clientId: string;
  productName: string;
  quantity: string;
  unit: string;
  note: string;
  optional: boolean;
  catalogVariantId: string | null;
  catalogProductId: string | null;
  catalogLabel: string;
  imageUrl: string | null;
};

type Step = {
  clientId: string;
  title: string;
  content: string;
  imageUrl: string;
  thumbnailUrl: string;
  mediaId: string | null;
};

type RecipeRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  workflowStatus: WorkflowStatus;
  currentVersionNo: number | null;
  publishedVersionId: string | null;
  ingredientCount: number;
  catalogIngredientCount: number;
  stepCount: number;
  yieldQuantity: string | null;
  yieldUnit: string | null;
  updatedAt?: string;
};

type RecipeDetail = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  relatedBrand: string | null;
  coverImageUrl: string | null;
  yieldQuantity: string | null;
  yieldUnit: string | null;
  sortOrder: number;
  workflowStatus: WorkflowStatus;
  currentVersionNo: number | null;
  reviewNote: string | null;
  publishedVersionId: string | null;
  ingredients: Array<{
    id: string;
    productName: string;
    quantity: string | null;
    unit: string | null;
    note: string | null;
    optional: boolean;
    catalogVariantId: string | null;
    catalogProductId: string | null;
    catalogSnapshot: CatalogSnapshot | null;
  }>;
  steps: Array<{ id: string; title: string | null; content: string; imageUrl: string | null }>;
};

type Version = {
  id: string;
  versionNo: number;
  workflowStatus: WorkflowStatus;
  changeNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  isCurrent: boolean;
  isPublished: boolean;
};

type FormState = {
  id: string | null;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  relatedBrand: string;
  coverImageUrl: string;
  coverThumbnailUrl: string;
  coverMediaId: string | null;
  yieldQuantity: string;
  yieldUnit: string;
  sortOrder: string;
  changeNote: string;
  workflowStatus: WorkflowStatus;
  currentVersionNo: number | null;
  reviewNote: string;
  publishedVersionId: string | null;
  ingredients: Ingredient[];
  steps: Step[];
};

const UNIT_OPTIONS = [
  ["g", "Gram (g)"], ["kg", "Kilôgam (kg)"], ["ml", "Mililít (ml)"], ["l", "Lít (l)"],
  ["piece", "Cái"], ["portion", "Phần"], ["pack", "Gói"], ["ly", "Ly"], ["mẻ", "Mẻ"],
] as const;

const workflowLabel: Record<string, string> = {
  draft: "Bản nháp",
  in_review: "Đang review",
  changes_requested: "Cần chỉnh sửa",
  approved: "Đã duyệt",
  published: "Đã xuất bản",
};

const uploadPhaseLabel: Record<UploadPhase, string> = {
  processing: "Đang resize và nén WebP",
  presign: "Đang cấp quyền upload",
  "upload-main": "Đang tải ảnh chính lên R2",
  "upload-thumbnail": "Đang tải thumbnail lên R2",
  verify: "Đang kiểm tra CDN",
  complete: "Đang ghi trạng thái upload",
  done: "Đã tải ảnh và thumbnail",
  error: "Upload thất bại",
};

function clientId(prefix: "ingredient" | "step") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

function emptyIngredient(): Ingredient {
  return {
    clientId: clientId("ingredient"), productName: "", quantity: "", unit: "g", note: "", optional: false,
    catalogVariantId: null, catalogProductId: null, catalogLabel: "", imageUrl: null,
  };
}

function emptyStep(): Step {
  return { clientId: clientId("step"), title: "", content: "", imageUrl: "", thumbnailUrl: "", mediaId: null };
}

function emptyForm(): FormState {
  return {
    id: null, title: "", slug: "", shortDescription: "", description: "", relatedBrand: "",
    coverImageUrl: "", coverThumbnailUrl: "", coverMediaId: null, yieldQuantity: "", yieldUnit: "ly",
    sortOrder: "0", changeNote: "", workflowStatus: null, currentVersionNo: null, reviewNote: "",
    publishedVersionId: null, ingredients: [emptyIngredient()], steps: [emptyStep()],
  };
}

function catalogLabel(item: Pick<CatalogSnapshot, "productName" | "variantName" | "sku">) {
  const title = item.variantName.trim().toLocaleLowerCase("vi-VN") === item.productName.trim().toLocaleLowerCase("vi-VN")
    ? item.productName : `${item.productName} · ${item.variantName}`;
  return `${title} · ${item.sku}`;
}

function toForm(recipe: RecipeDetail): FormState {
  return {
    id: recipe.id,
    title: recipe.title,
    slug: recipe.slug,
    shortDescription: recipe.shortDescription || "",
    description: recipe.description || "",
    relatedBrand: recipe.relatedBrand || "",
    coverImageUrl: recipe.coverImageUrl || "",
    coverThumbnailUrl: "",
    coverMediaId: null,
    yieldQuantity: recipe.yieldQuantity || "",
    yieldUnit: recipe.yieldUnit || "ly",
    sortOrder: String(recipe.sortOrder ?? 0),
    changeNote: "",
    workflowStatus: recipe.workflowStatus,
    currentVersionNo: recipe.currentVersionNo,
    reviewNote: recipe.reviewNote || "",
    publishedVersionId: recipe.publishedVersionId,
    ingredients: recipe.ingredients.length ? recipe.ingredients.map((item) => ({
      clientId: `ingredient-${item.id}`,
      productName: item.productName,
      quantity: item.quantity || "",
      unit: item.unit || "g",
      note: item.note || "",
      optional: item.optional,
      catalogVariantId: item.catalogVariantId,
      catalogProductId: item.catalogProductId,
      catalogLabel: item.catalogSnapshot ? catalogLabel(item.catalogSnapshot) : item.productName,
      imageUrl: null,
    })) : [emptyIngredient()],
    steps: recipe.steps.length ? recipe.steps.map((item) => ({
      clientId: `step-${item.id}`,
      title: item.title || "",
      content: item.content,
      imageUrl: item.imageUrl || "",
      thumbnailUrl: "",
      mediaId: null,
    })) : [emptyStep()],
  };
}

function serialized(form: FormState) {
  return JSON.stringify({ ...form, changeNote: "" });
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN");
}

function validationErrors(form: FormState, forReview = false): string[] {
  const errors: string[] = [];
  if (form.title.trim().length < 3) errors.push("Tên công thức phải có ít nhất 3 ký tự.");
  if (form.title.trim().length > 180) errors.push("Tên công thức không được vượt 180 ký tự.");
  if (form.slug.trim().length > 180) errors.push("Slug không được vượt 180 ký tự.");
  if (form.yieldQuantity && (!Number.isFinite(Number(form.yieldQuantity)) || Number(form.yieldQuantity) <= 0)) {
    errors.push("Yield phải là số dương.");
  }
  if (!Number.isInteger(Number(form.sortOrder))) errors.push("Thứ tự hiển thị phải là số nguyên.");
  form.ingredients.forEach((item, index) => {
    if ((item.productName.trim() || item.catalogVariantId) && item.quantity && (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      errors.push(`Số lượng nguyên liệu ${index + 1} phải là số dương.`);
    }
  });
  form.steps.forEach((step, index) => {
    if ((step.title.trim() || step.imageUrl) && !step.content.trim()) errors.push(`Bước ${index + 1} có tiêu đề hoặc ảnh nhưng chưa có hướng dẫn.`);
  });
  if (forReview) {
    if (!form.ingredients.some((item) => item.catalogVariantId)) errors.push("Cần ít nhất một nguyên liệu liên kết SKU trước khi gửi review.");
    if (!form.steps.some((step) => step.content.trim())) errors.push("Cần ít nhất một bước hướng dẫn trước khi gửi review.");
  }
  return errors;
}

function UnitSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl bg-white px-3 text-sm font-bold ring-1 ring-slate-200 disabled:opacity-60">
      {!UNIT_OPTIONS.some(([unit]) => unit === value) && value ? <option value={value}>{value}</option> : null}
      {UNIT_OPTIONS.map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
    </select>
  );
}

function FileButton({ label, disabled, onFile }: { label: string; disabled?: boolean; onFile: (file: File) => void }) {
  return (
    <label className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black ${disabled ? "cursor-not-allowed bg-slate-200 text-slate-400" : "cursor-pointer bg-orange-500 text-white"}`}>
      {label}
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} className="sr-only" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) onFile(file);
      }} />
    </label>
  );
}

export function AdminRecipeOperationsPanelV4() {
  const { getToken, isLoaded } = useAuth();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [baseline, setBaseline] = useState(serialized(emptyForm()));
  const [versions, setVersions] = useState<Version[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewInput, setReviewInput] = useState("");
  const [catalogQueries, setCatalogQueries] = useState<Record<string, string>>({});
  const [catalogResults, setCatalogResults] = useState<Record<string, CatalogOption[]>>({});
  const [catalogErrors, setCatalogErrors] = useState<Record<string, string>>({});
  const [catalogLoadingId, setCatalogLoadingId] = useState<string | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadPhase>>({});

  const dirty = useMemo(() => serialized(form) !== baseline, [form, baseline]);
  const uploading = Object.values(uploadStates).some((phase) => !new Set<UploadPhase>(["done", "error"]).has(phase));
  const locked = form.workflowStatus === "in_review" || form.workflowStatus === "approved";
  const visibleRows = useMemo(() => statusFilter === "all" ? rows : rows.filter((row) => (row.workflowStatus || "draft") === statusFilter), [rows, statusFilter]);
  const ingredientImages = useMemo(() => form.ingredients.filter((item) => item.imageUrl).map((item) => ({ url: item.imageUrl!, label: item.catalogLabel || item.productName })), [form.ingredients]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", escape);
    };
  }, [editorOpen, dirty, saving, uploading]);

  async function authToken() {
    const value = await getToken();
    if (!value) throw new Error("Bạn cần đăng nhập admin để quản lý công thức.");
    return value;
  }

  async function loadRows() {
    if (!isLoaded) return;
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

  useEffect(() => { void loadRows(); }, [isLoaded]);

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
    if (media.cover) {
      next = { ...next, coverMediaId: media.cover.mediaId, coverImageUrl: media.cover.publicUrl, coverThumbnailUrl: media.cover.thumbnailUrl };
    }
    next = {
      ...next,
      steps: next.steps.map((step, index) => {
        const ref = media.steps.find((item) => item.stepNo === index + 1);
        return ref?.mediaId ? { ...step, mediaId: ref.mediaId, imageUrl: ref.publicUrl || step.imageUrl, thumbnailUrl: ref.thumbnailUrl || "" } : step;
      }),
    };
    return next;
  }

  async function createRecipe() {
    try {
      const token = await authToken();
      const draft = await createRecipeMediaDraft(token);
      const next = emptyForm();
      setDraftId(draft.draftId);
      setForm(next);
      setBaseline(serialized(next));
      setVersions([]);
      setReviewInput("");
      setErrors([]);
      setCatalogQueries({}); setCatalogResults({}); setCatalogErrors({}); setUploadStates({});
      setEditorOpen(true);
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không tạo được phiên media nháp." });
    }
  }

  async function openRecipe(id: string) {
    try {
      const token = await authToken();
      const [detail, versionResult, draft] = await Promise.all([
        adminApiFetch<{ recipe: RecipeDetail }>(`/api/admin/recipes/${id}`, token),
        adminApiFetch<{ versions: Version[] }>(`/api/admin/recipes/${id}/versions`, token),
        createRecipeMediaDraft(token, id),
      ]);
      const next = await buildLoadedForm(detail.recipe, token);
      setDraftId(draft.draftId);
      setForm(next);
      setBaseline(serialized(next));
      setVersions(versionResult.versions || []);
      setReviewInput(detail.recipe.reviewNote || "");
      setErrors([]); setCatalogQueries({}); setCatalogResults({}); setCatalogErrors({}); setUploadStates({});
      setEditorOpen(true);
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

  function updateIngredient(id: string, patch: Partial<Ingredient>) {
    setForm((current) => ({ ...current, ingredients: current.ingredients.map((item) => item.clientId === id ? { ...item, ...patch } : item) }));
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setForm((current) => ({ ...current, steps: current.steps.map((item) => item.clientId === id ? { ...item, ...patch } : item) }));
  }

  async function searchCatalog(id: string) {
    const search = (catalogQueries[id] || "").trim();
    if (search.length < 2) {
      setCatalogErrors((current) => ({ ...current, [id]: "Nhập ít nhất 2 ký tự." }));
      return;
    }
    setCatalogLoadingId(id);
    setCatalogErrors((current) => ({ ...current, [id]: "" }));
    try {
      const result = await adminApiFetch<{ items: CatalogOption[] }>(`/api/admin/recipes/catalog-options?q=${encodeURIComponent(search)}&limit=12`, await authToken());
      setCatalogResults((current) => ({ ...current, [id]: result.items || [] }));
    } catch (cause) {
      setCatalogErrors((current) => ({ ...current, [id]: cause instanceof Error ? cause.message : "Không tìm được catalog." }));
    } finally {
      setCatalogLoadingId(null);
    }
  }

  function selectCatalog(id: string, option: CatalogOption) {
    updateIngredient(id, {
      productName: option.variantName.toLocaleLowerCase("vi-VN") === option.productName.toLocaleLowerCase("vi-VN") ? option.productName : `${option.productName} · ${option.variantName}`,
      catalogVariantId: option.variantId,
      catalogProductId: option.productId,
      catalogLabel: catalogLabel(option),
      imageUrl: option.imageUrl,
    });
    setCatalogQueries((current) => ({ ...current, [id]: "" }));
    setCatalogResults((current) => ({ ...current, [id]: [] }));
  }

  async function upload(file: File, target: { kind: "cover" } | { kind: "step"; clientId: string }) {
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
      const media = await uploadRecipeMedia({
        token,
        draftId: activeDraft,
        purpose: target.kind,
        file,
        onPhase: (phase) => setUploadStates((current) => ({ ...current, [key]: phase })),
      });
      if (target.kind === "cover") {
        setForm((current) => ({ ...current, coverMediaId: media.mediaId, coverImageUrl: media.publicUrl, coverThumbnailUrl: media.thumbnailUrl }));
      } else {
        updateStep(target.clientId, { mediaId: media.mediaId, imageUrl: media.publicUrl, thumbnailUrl: media.thumbnailUrl });
      }
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
      ingredients: form.ingredients.filter((item) => item.productName.trim() || item.catalogVariantId).map((item) => ({
        productName: item.productName, quantity: item.quantity, unit: item.unit, note: item.note,
        optional: item.optional, catalogVariantId: item.catalogVariantId || undefined,
      })),
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

  async function save() {
    const nextErrors = validationErrors(form);
    setErrors(nextErrors);
    if (nextErrors.length) {
      setToast({ kind: "error", message: "Công thức còn lỗi. Kiểm tra danh sách lỗi trong editor." });
      return;
    }
    if (uploading) return;
    setSaving(true);
    try {
      const token = await authToken();
      const path = form.id ? `/api/admin/recipes/${form.id}` : "/api/admin/recipes";
      const result = await adminApiFetch<{ recipe: RecipeDetail }>(path, token, {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload()),
      });
      await syncRecipeMedia({
        token,
        recipeId: result.recipe.id,
        coverMediaId: form.coverMediaId,
        steps: form.steps.filter((step) => step.content.trim()).map((step, index) => ({ stepNo: index + 1, mediaId: step.mediaId })),
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
    if (validateReview) {
      const nextErrors = validationErrors(form, true);
      setErrors(nextErrors);
      if (nextErrors.length) return;
    }
    setSaving(true);
    try {
      const token = await authToken();
      await adminApiFetch(path, token, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      await reloadEditor(form.id, token);
      setToast({ kind: "success", message: "Đã cập nhật workflow công thức." });
    } catch (cause) {
      setToast({ kind: "error", message: cause instanceof Error ? cause.message : "Không cập nhật được workflow." });
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
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

  return (
    <div className="space-y-5">
      {toast ? <div role={toast.kind === "error" ? "alert" : "status"} aria-live="polite" className={`fixed bottom-24 left-1/2 z-[80] w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-2xl ${toast.kind === "error" ? "bg-red-600" : "bg-emerald-600"}`}>{toast.message}</div> : null}

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Recipe operations V4</p><h2 className="mt-2 text-3xl font-black">Công thức</h2><p className="mt-1 text-sm font-bold text-slate-500">Media có draft, object key, thumbnail và trạng thái trong database.</p></div>
          <button onClick={() => void createRecipe()} className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white">+ Tạo công thức</button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRows(); }} placeholder="Tìm theo tên hoặc slug" className="h-12 rounded-2xl bg-slate-100 px-4 font-bold" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-12 rounded-2xl bg-slate-100 px-4 font-bold"><option value="all">Tất cả trạng thái</option>{Object.entries(workflowLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button onClick={() => void loadRows()} className="rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">Tìm</button>
        </div>
        {loading ? <p className="mt-4 text-sm font-bold text-slate-500">Đang tải...</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visibleRows.map((row) => <article key={row.id} className="rounded-2xl bg-slate-100 p-4 ring-1 ring-slate-200">
            <button type="button" onClick={() => void openRecipe(row.id)} className="block w-full text-left"><p className="text-xs font-black uppercase text-orange-600">{workflowLabel[row.workflowStatus || "draft"]} · v{row.currentVersionNo || "-"}</p><h3 className="mt-1 text-lg font-black">{row.title}</h3><p className="mt-1 text-sm font-bold text-slate-500">{row.ingredientCount} nguyên liệu · {row.stepCount} bước</p></button>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3"><span className="text-xs font-bold text-slate-500">{formatDate(row.updatedAt)}</span>{row.status !== "inactive" ? <button onClick={() => void archive(row.id)} className="text-xs font-black text-red-700">Ẩn</button> : null}</div>
          </article>)}
        </div>
      </section>

      {editorOpen ? <div className="fixed inset-0 z-50 bg-slate-950/75 p-0 backdrop-blur-sm md:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
        <section className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden bg-slate-50 text-slate-950 md:h-[calc(100vh-40px)] md:rounded-[30px]">
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 md:p-5"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Recipe editor V4</p><h2 className="mt-1 text-2xl font-black">{form.id ? "Chỉnh công thức" : "Tạo công thức nháp"}</h2><div className="mt-2 flex flex-wrap gap-2">{form.workflowStatus ? <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-800">{workflowLabel[form.workflowStatus]} · v{form.currentVersionNo || "-"}</span> : null}<span className={`rounded-full px-3 py-1 text-xs font-black ${dirty ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{dirty ? "Có thay đổi chưa lưu" : "Đã đồng bộ"}</span>{draftId ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">Draft media: {draftId.slice(0, 8)}</span> : null}</div></div><button disabled={saving || uploading} onClick={requestClose} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-xl font-black disabled:opacity-50">×</button></header>

          <div className="flex-1 overflow-y-auto p-4 pb-32 md:p-5 md:pb-28">
            {errors.length ? <div role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-200"><b className="block">Cần sửa trước khi tiếp tục:</b><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
            {locked ? <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Phiên bản đang review hoặc đã duyệt nên nội dung được khóa.</p> : null}

            <section className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200"><h3 className="text-lg font-black">Thông tin chính</h3><div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-black text-slate-600">Tên công thức *<input disabled={locked} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
              <label className="grid gap-1 text-xs font-black text-slate-600">Slug<input disabled={locked} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
              <label className="grid gap-1 text-xs font-black text-slate-600">Yield gốc<input disabled={locked} inputMode="decimal" value={form.yieldQuantity} onChange={(event) => setForm({ ...form, yieldQuantity: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
              <label className="grid gap-1 text-xs font-black text-slate-600">Đơn vị yield<UnitSelect disabled={locked} value={form.yieldUnit} onChange={(yieldUnit) => setForm({ ...form, yieldUnit })} /></label>
              <label className="grid gap-1 text-xs font-black text-slate-600">Thương hiệu liên quan<input disabled={locked} value={form.relatedBrand} onChange={(event) => setForm({ ...form, relatedBrand: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
              <label className="grid gap-1 text-xs font-black text-slate-600">Thứ tự hiển thị<input disabled={locked} type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
            </div><label className="mt-3 grid gap-1 text-xs font-black text-slate-600">Mô tả ngắn<textarea disabled={locked} value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} className="min-h-20 rounded-xl bg-slate-100 p-3 text-sm font-bold" /></label><label className="mt-3 grid gap-1 text-xs font-black text-slate-600">Ghi chú công thức<textarea disabled={locked} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 rounded-xl bg-slate-100 p-3 text-sm font-bold" /></label><label className="mt-3 grid gap-1 text-xs font-black text-slate-600">Ghi chú thay đổi<input disabled={locked} value={form.changeNote} onChange={(event) => setForm({ ...form, changeNote: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label></section>

            <section className="mt-4 rounded-[24px] bg-white p-4 ring-1 ring-slate-200"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black">Ảnh bìa</h3><p className="text-sm font-bold text-slate-500">Ảnh được resize tối đa 1920px, nén WebP và sinh thumbnail 480px.</p></div>{!locked ? <FileButton disabled={uploading} label={uploadStates.cover && !new Set(["done", "error"]).has(uploadStates.cover) ? uploadPhaseLabel[uploadStates.cover] : "Tải ảnh từ máy"} onFile={(file) => void upload(file, { kind: "cover" })} /> : null}</div>
              {form.coverImageUrl ? <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]"><img src={form.coverThumbnailUrl || form.coverImageUrl} alt="Thumbnail ảnh bìa" className="h-40 w-full rounded-2xl bg-slate-100 object-cover" /><div className="rounded-2xl bg-slate-100 p-3 text-sm font-bold"><p>{form.coverMediaId ? `Media ID: ${form.coverMediaId}` : "Ảnh URL/catalog chưa có media ID"}</p>{form.coverMediaId ? <p className="mt-1 text-emerald-700">Có object key và thumbnail trong database sau khi lưu.</p> : null}{!locked ? <button onClick={() => setForm({ ...form, coverImageUrl: "", coverThumbnailUrl: "", coverMediaId: null })} className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-red-700">Gỡ ảnh khỏi công thức</button> : null}</div></div> : <div className="mt-3 grid h-36 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-sm font-black text-slate-400">Chưa có ảnh bìa</div>}
            </section>

            <section className="mt-4 rounded-[24px] bg-white p-4 ring-1 ring-slate-200"><h3 className="text-lg font-black">Nguyên liệu</h3><div className="mt-4 space-y-3">{form.ingredients.map((item, index) => <article key={item.clientId} className="rounded-2xl bg-slate-100 p-3 ring-1 ring-slate-200"><div className="flex justify-between"><b>Nguyên liệu {index + 1}</b>{!locked ? <button onClick={() => setForm((current) => ({ ...current, ingredients: current.ingredients.filter((row) => row.clientId !== item.clientId) }))} className="text-xs font-black text-red-700">Xóa</button> : null}</div>
              {!locked ? <div className="mt-3 flex gap-2"><input value={catalogQueries[item.clientId] || ""} onChange={(event) => setCatalogQueries((current) => ({ ...current, [item.clientId]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCatalog(item.clientId); } }} placeholder="Tìm SKU hoặc tên sản phẩm" className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm font-bold" /><button disabled={catalogLoadingId === item.clientId} onClick={() => void searchCatalog(item.clientId)} className="rounded-xl bg-slate-950 px-4 text-sm font-black text-white">{catalogLoadingId === item.clientId ? "Đang tìm" : "Tìm"}</button></div> : null}
              {catalogErrors[item.clientId] ? <p className="mt-2 text-xs font-bold text-red-700">{catalogErrors[item.clientId]}</p> : null}
              {catalogResults[item.clientId]?.length ? <div className="mt-2 grid gap-2 md:grid-cols-2">{catalogResults[item.clientId].map((option) => <button type="button" key={option.variantId} onClick={() => selectCatalog(item.clientId, option)} className="flex items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-slate-200">{option.imageUrl ? <img src={option.imageUrl} alt="" className="h-14 w-14 object-contain" /> : null}<span className="text-sm font-black">{catalogLabel(option)}</span></button>)}</div> : null}
              {item.catalogVariantId ? <div className="mt-3 flex items-center gap-3 rounded-xl bg-emerald-50 p-3">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-14 w-14 rounded-lg bg-white object-contain" /> : null}<p className="flex-1 text-sm font-black text-emerald-800">{item.catalogLabel}</p>{!locked ? <button onClick={() => updateIngredient(item.clientId, { catalogVariantId: null, catalogProductId: null, catalogLabel: "", imageUrl: null })} className="text-xs font-black text-red-700">Bỏ liên kết</button> : null}</div> : null}
              <div className="mt-3 grid gap-2 md:grid-cols-[1.4fr_.6fr_.8fr_1fr]"><input disabled={locked || Boolean(item.catalogVariantId)} value={item.productName} onChange={(event) => updateIngredient(item.clientId, { productName: event.target.value })} placeholder="Tên nguyên liệu" className="h-11 rounded-xl bg-white px-3 text-sm font-bold" /><input disabled={locked} value={item.quantity} onChange={(event) => updateIngredient(item.clientId, { quantity: event.target.value })} placeholder="Số lượng" className="h-11 rounded-xl bg-white px-3 text-sm font-bold" /><UnitSelect disabled={locked} value={item.unit} onChange={(unit) => updateIngredient(item.clientId, { unit })} /><input disabled={locked} value={item.note} onChange={(event) => updateIngredient(item.clientId, { note: event.target.value })} placeholder="Ghi chú" className="h-11 rounded-xl bg-white px-3 text-sm font-bold" /></div>
            </article>)}</div>{!locked ? <button onClick={() => setForm((current) => ({ ...current, ingredients: [...current.ingredients, emptyIngredient()] }))} className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">+ Thêm nguyên liệu</button> : null}</section>

            <section className="mt-4 rounded-[24px] bg-white p-4 ring-1 ring-slate-200"><h3 className="text-lg font-black">Các bước thực hiện</h3><div className="mt-4 space-y-3">{form.steps.map((step, index) => { const key = `step:${step.clientId}`; const phase = uploadStates[key]; return <article key={step.clientId} className="rounded-2xl bg-slate-100 p-3 ring-1 ring-slate-200"><div className="flex justify-between"><b>Bước {index + 1}</b>{!locked ? <button onClick={() => setForm((current) => ({ ...current, steps: current.steps.filter((row) => row.clientId !== step.clientId) }))} className="text-xs font-black text-red-700">Xóa</button> : null}</div><input disabled={locked} value={step.title} onChange={(event) => updateStep(step.clientId, { title: event.target.value })} placeholder="Tiêu đề bước" className="mt-3 h-11 w-full rounded-xl bg-white px-3 text-sm font-bold" /><textarea disabled={locked} value={step.content} onChange={(event) => updateStep(step.clientId, { content: event.target.value })} placeholder="Hướng dẫn thực hiện" className="mt-2 min-h-24 w-full rounded-xl bg-white p-3 text-sm font-bold" />
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_180px]"><select disabled={locked} value={step.imageUrl} onChange={(event) => { const image = ingredientImages.find((entry) => entry.url === event.target.value); updateStep(step.clientId, { imageUrl: event.target.value, thumbnailUrl: image?.url || "", mediaId: null }); }} className="h-11 rounded-xl bg-white px-3 text-sm font-bold"><option value="">Không dùng ảnh</option>{step.imageUrl && !ingredientImages.some((image) => image.url === step.imageUrl) ? <option value={step.imageUrl}>Ảnh hiện tại</option> : null}{ingredientImages.map((image) => <option key={`${step.clientId}-${image.url}`} value={image.url}>{image.label}</option>)}</select>{step.imageUrl ? <img src={step.thumbnailUrl || step.imageUrl} alt={`Thumbnail bước ${index + 1}`} className="h-28 w-full rounded-xl bg-white object-contain" /> : <div className="grid h-28 place-items-center rounded-xl border-2 border-dashed border-slate-200 text-xs font-black text-slate-400">Không ảnh</div>}</div>
              {!locked ? <div className="mt-2 flex flex-wrap gap-2"><FileButton disabled={uploading} label={phase && !new Set(["done", "error"]).has(phase) ? uploadPhaseLabel[phase] : "Tải ảnh bước"} onFile={(file) => void upload(file, { kind: "step", clientId: step.clientId })} />{step.imageUrl ? <button onClick={() => updateStep(step.clientId, { imageUrl: "", thumbnailUrl: "", mediaId: null })} className="rounded-xl bg-red-50 px-4 text-sm font-black text-red-700">Gỡ ảnh</button> : null}</div> : null}{step.mediaId ? <p className="mt-2 text-xs font-bold text-emerald-700">Media {step.mediaId.slice(0, 8)} · có thumbnail · sẽ gắn vào step {index + 1} khi lưu</p> : null}
            </article>; })}</div>{!locked ? <button onClick={() => setForm((current) => ({ ...current, steps: [...current.steps, emptyStep()] }))} className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">+ Thêm bước</button> : null}</section>

            {form.id && form.workflowStatus === "in_review" ? <section className="mt-4 rounded-[24px] bg-white p-4 ring-1 ring-slate-200"><h3 className="text-lg font-black">Quyết định review</h3><textarea value={reviewInput} onChange={(event) => setReviewInput(event.target.value)} className="mt-3 min-h-24 w-full rounded-xl bg-slate-100 p-3 text-sm font-bold" placeholder="Nhận xét review" /><div className="mt-3 grid gap-2 md:grid-cols-2"><button disabled={saving} onClick={() => { if (!reviewInput.trim()) { setToast({ kind: "error", message: "Nhận xét là bắt buộc khi yêu cầu chỉnh sửa." }); return; } void lifecycle(`/api/admin/recipes/${form.id}/review`, { decision: "changes_requested", note: reviewInput }); }} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white">Yêu cầu chỉnh sửa</button><button disabled={saving} onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/review`, { decision: "approved", note: reviewInput })} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">Duyệt phiên bản</button></div></section> : null}

            {form.id ? <section className="mt-4 rounded-[24px] bg-white p-4 ring-1 ring-slate-200"><h3 className="text-lg font-black">Lịch sử phiên bản</h3><div className="mt-3 grid gap-2">{versions.map((version) => <article key={version.id} className="rounded-xl bg-slate-100 p-3"><div className="flex justify-between gap-2"><b>v{version.versionNo} · {workflowLabel[version.workflowStatus || "draft"]}{version.isCurrent ? " · hiện tại" : ""}{version.isPublished ? " · công khai" : ""}</b><span className="text-xs font-bold text-slate-500">{formatDate(version.createdAt)}</span></div></article>)}</div></section> : null}
          </div>

          <footer className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:static md:p-4"><div className="mx-auto grid max-w-5xl gap-2 md:grid-cols-3">{!locked ? <button disabled={saving || uploading} onClick={() => void save()} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? "Đang lưu..." : form.id ? "Lưu version mới" : "Tạo công thức"}</button> : null}{form.id && (form.workflowStatus === "draft" || form.workflowStatus === "changes_requested") ? <button disabled={saving || uploading} onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/submit-review`, undefined, true)} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Gửi review</button> : null}{form.id && form.workflowStatus === "approved" ? <button disabled={saving || uploading} onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/publish`)} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Xuất bản</button> : null}</div></footer>
        </section>
      </div> : null}
    </div>
  );
}
