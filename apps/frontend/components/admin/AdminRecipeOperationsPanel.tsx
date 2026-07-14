"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/admin-api";

type WorkflowStatus = "draft" | "in_review" | "changes_requested" | "approved" | "published" | null;

type CatalogSnapshot = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  options: Record<string, unknown>;
  isOrderable: boolean;
};

type CatalogOption = {
  variantId: string;
  productId: string;
  productName: string;
  brand: string | null;
  variantName: string;
  sku: string;
  options: Record<string, unknown>;
  priceMode: string;
  priceLabel: string | null;
  isOrderable: boolean;
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
  recipeCategoryName?: string | null;
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
  steps: Array<{
    id: string;
    title: string | null;
    content: string;
    imageUrl: string | null;
  }>;
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
  { value: "g", label: "Gram (g)" },
  { value: "kg", label: "Kilôgam (kg)" },
  { value: "ml", label: "Mililít (ml)" },
  { value: "l", label: "Lít (l)" },
  { value: "piece", label: "Cái" },
  { value: "portion", label: "Phần" },
  { value: "pack", label: "Gói" },
  { value: "ly", label: "Ly" },
  { value: "mẻ", label: "Mẻ" },
] as const;

const workflowLabel: Record<string, string> = {
  draft: "Bản nháp",
  in_review: "Đang review",
  changes_requested: "Cần chỉnh sửa",
  approved: "Đã duyệt",
  published: "Đã xuất bản",
};

function createClientId(prefix: "ingredient" | "step"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `${prefix}-${uuid}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyIngredient(): Ingredient {
  return {
    clientId: createClientId("ingredient"),
    productName: "",
    quantity: "",
    unit: "g",
    note: "",
    optional: false,
    catalogVariantId: null,
    catalogProductId: null,
    catalogLabel: "",
    imageUrl: null,
  };
}

function emptyStep(): Step {
  return {
    clientId: createClientId("step"),
    title: "",
    content: "",
    imageUrl: "",
  };
}

function emptyForm(): FormState {
  return {
    id: null,
    title: "",
    slug: "",
    shortDescription: "",
    description: "",
    relatedBrand: "",
    coverImageUrl: "",
    yieldQuantity: "",
    yieldUnit: "ly",
    sortOrder: "0",
    changeNote: "",
    workflowStatus: null,
    currentVersionNo: null,
    reviewNote: "",
    publishedVersionId: null,
    ingredients: [emptyIngredient()],
    steps: [emptyStep()],
  };
}

function labelForCatalog(item: Pick<CatalogOption, "productName" | "variantName" | "sku">): string {
  const product = item.productName.trim();
  const variant = item.variantName.trim();
  const title = variant && variant.toLocaleLowerCase("vi-VN") !== product.toLocaleLowerCase("vi-VN")
    ? `${product} · ${variant}`
    : product;
  return `${title} · ${item.sku}`;
}

function optionsLabel(options: Record<string, unknown>): string {
  return Object.entries(options || {})
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
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
    yieldQuantity: recipe.yieldQuantity || "",
    yieldUnit: recipe.yieldUnit || "ly",
    sortOrder: String(recipe.sortOrder ?? 0),
    changeNote: "",
    workflowStatus: recipe.workflowStatus,
    currentVersionNo: recipe.currentVersionNo,
    reviewNote: recipe.reviewNote || "",
    publishedVersionId: recipe.publishedVersionId,
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((item) => ({
          clientId: `ingredient-${item.id}`,
          productName: item.productName,
          quantity: item.quantity || "",
          unit: item.unit || "g",
          note: item.note || "",
          optional: item.optional,
          catalogVariantId: item.catalogVariantId,
          catalogProductId: item.catalogProductId,
          catalogLabel: item.catalogSnapshot
            ? labelForCatalog(item.catalogSnapshot)
            : item.catalogVariantId
              ? item.productName
              : "",
          imageUrl: null,
        }))
      : [emptyIngredient()],
    steps: recipe.steps.length
      ? recipe.steps.map((item) => ({
          clientId: `step-${item.id}`,
          title: item.title || "",
          content: item.content,
          imageUrl: item.imageUrl || "",
        }))
      : [emptyStep()],
  };
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN");
}

function UnitSelect({ value, onChange, disabled, label }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const known = UNIT_OPTIONS.some((option) => option.value === value);
  return (
    <label className="grid gap-1 text-xs font-black text-slate-600">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl bg-white px-3 text-sm font-black text-slate-950 outline-none ring-1 ring-slate-200 disabled:opacity-60"
      >
        {!known && value ? <option value={value}>{value}</option> : null}
        {UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function AdminRecipeOperationsPanel() {
  const { getToken, isLoaded } = useAuth();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [versions, setVersions] = useState<Version[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [catalogQueries, setCatalogQueries] = useState<Record<string, string>>({});
  const [catalogResults, setCatalogResults] = useState<Record<string, CatalogOption[]>>({});
  const [catalogLoadingId, setCatalogLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewInput, setReviewInput] = useState("");

  const lockedForReview = form.workflowStatus === "in_review" || form.workflowStatus === "approved";
  const canSave = form.title.trim().length >= 3 && !saving && !lockedForReview;
  const visibleRows = useMemo(
    () => statusFilter === "all" ? rows : rows.filter((row) => (row.workflowStatus || "draft") === statusFilter),
    [rows, statusFilter],
  );
  const ingredientImages = useMemo(
    () => form.ingredients.filter((item) => item.imageUrl).map((item) => ({
      url: item.imageUrl as string,
      label: item.catalogLabel || item.productName,
    })),
    [form.ingredients],
  );

  useEffect(() => {
    if (!editorOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setEditorOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editorOpen, saving]);

  async function token(): Promise<string> {
    const value = await getToken();
    if (!value) throw new Error("Bạn cần đăng nhập admin để quản lý công thức.");
    return value;
  }

  async function load(): Promise<void> {
    if (!isLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await adminApiFetch<{ recipes: RecipeRow[] }>(
        `/api/admin/recipes?limit=100&q=${encodeURIComponent(query.trim())}`,
        await token(),
      );
      setRows(result.recipes || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được danh sách công thức.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [isLoaded]);

  async function loadVersions(recipeId: string): Promise<void> {
    const result = await adminApiFetch<{ versions: Version[] }>(
      `/api/admin/recipes/${recipeId}/versions`,
      await token(),
    );
    setVersions(result.versions || []);
  }

  function resetLocalState(): void {
    setCatalogQueries({});
    setCatalogResults({});
    setCatalogLoadingId(null);
    setReviewInput("");
    setVersions([]);
  }

  function createRecipe(): void {
    setForm(emptyForm());
    resetLocalState();
    setError("");
    setEditorOpen(true);
  }

  async function openRecipe(id: string): Promise<void> {
    setError("");
    try {
      const result = await adminApiFetch<{ recipe: RecipeDetail }>(
        `/api/admin/recipes/${id}`,
        await token(),
      );
      setForm(toForm(result.recipe));
      setReviewInput(result.recipe.reviewNote || "");
      setCatalogQueries({});
      setCatalogResults({});
      setCatalogLoadingId(null);
      await loadVersions(id);
      setEditorOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không mở được công thức.");
    }
  }

  function updateIngredient(clientId: string, patch: Partial<Ingredient>): void {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) => item.clientId === clientId ? { ...item, ...patch } : item),
    }));
  }

  function removeIngredient(clientId: string): void {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.filter((item) => item.clientId !== clientId),
    }));
    setCatalogQueries((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setCatalogResults((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  }

  function updateStep(clientId: string, patch: Partial<Step>): void {
    setForm((current) => ({
      ...current,
      steps: current.steps.map((item) => item.clientId === clientId ? { ...item, ...patch } : item),
    }));
  }

  async function searchCatalog(clientId: string): Promise<void> {
    const search = (catalogQueries[clientId] || "").trim();
    if (search.length < 2) {
      setError("Nhập ít nhất 2 ký tự để tìm SKU hoặc tên sản phẩm.");
      return;
    }
    setCatalogLoadingId(clientId);
    setError("");
    try {
      const result = await adminApiFetch<{ items: CatalogOption[] }>(
        `/api/admin/recipes/catalog-options?q=${encodeURIComponent(search)}&limit=12`,
        await token(),
      );
      setCatalogResults((current) => ({ ...current, [clientId]: result.items || [] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tìm được catalog.");
    } finally {
      setCatalogLoadingId(null);
    }
  }

  function selectCatalog(clientId: string, item: CatalogOption): void {
    updateIngredient(clientId, {
      productName: item.variantName.toLocaleLowerCase("vi-VN") === item.productName.toLocaleLowerCase("vi-VN")
        ? item.productName
        : `${item.productName} · ${item.variantName}`,
      catalogVariantId: item.variantId,
      catalogProductId: item.productId,
      catalogLabel: labelForCatalog(item),
      imageUrl: item.imageUrl,
    });
    setCatalogQueries((current) => ({ ...current, [clientId]: "" }));
    setCatalogResults((current) => ({ ...current, [clientId]: [] }));
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
      ingredients: form.ingredients
        .filter((item) => item.productName.trim() || item.catalogVariantId)
        .map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          note: item.note,
          optional: item.optional,
          catalogVariantId: item.catalogVariantId || undefined,
        })),
      steps: form.steps
        .filter((item) => item.content.trim())
        .map(({ clientId: _clientId, ...step }) => step),
    };
  }

  async function save(): Promise<void> {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const path = form.id ? `/api/admin/recipes/${form.id}` : "/api/admin/recipes";
      const result = await adminApiFetch<{ recipe: RecipeDetail }>(path, await token(), {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload()),
      });
      setForm(toForm(result.recipe));
      setReviewInput(result.recipe.reviewNote || "");
      await loadVersions(result.recipe.id);
      await load();
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : cause instanceof Error ? cause.message : "Không lưu được công thức.");
    } finally {
      setSaving(false);
    }
  }

  async function lifecycle(path: string, body?: unknown): Promise<void> {
    if (!form.id) return;
    setSaving(true);
    setError("");
    try {
      const result = await adminApiFetch<{ recipe: RecipeDetail }>(path, await token(), {
        method: "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      setForm(toForm(result.recipe));
      setReviewInput(result.recipe.reviewNote || "");
      await loadVersions(result.recipe.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không cập nhật được workflow công thức.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string): Promise<void> {
    if (!window.confirm("Ẩn công thức này? Dữ liệu và lịch sử phiên bản vẫn được giữ lại.")) return;
    setError("");
    try {
      await adminApiFetch(`/api/admin/recipes/${id}`, await token(), { method: "DELETE" });
      if (form.id === id) setEditorOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể ẩn công thức.");
    }
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-200">{error}</p> : null}

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Recipe operations</p>
            <h2 className="mt-2 text-3xl font-black">Công thức</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">Chọn card để mở editor. Ảnh và đơn vị được chọn, không phải gõ mò.</p>
          </div>
          <button onClick={createRecipe} className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-lg">+ Tạo công thức</button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void load(); }}
            placeholder="Tìm theo tên hoặc slug"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none">
            <option value="all">Tất cả trạng thái</option>
            <option value="draft">Bản nháp</option>
            <option value="in_review">Đang review</option>
            <option value="changes_requested">Cần sửa</option>
            <option value="approved">Đã duyệt</option>
            <option value="published">Đã xuất bản</option>
          </select>
          <button onClick={() => void load()} className="rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">Tìm</button>
        </div>

        {loading ? <p className="mt-4 text-sm font-bold text-slate-500">Đang tải...</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visibleRows.map((row) => (
            <article key={row.id} className="rounded-2xl bg-slate-100 p-4 ring-1 ring-slate-200">
              <button type="button" onClick={() => void openRecipe(row.id)} className="block w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.13em] text-orange-600">
                      {workflowLabel[row.workflowStatus || "draft"]} · v{row.currentVersionNo || "-"}
                    </p>
                    <h3 className="mt-1 text-lg font-black">{row.title}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      {row.ingredientCount} nguyên liệu · {row.catalogIngredientCount} catalog · {row.stepCount} bước
                    </p>
                    {row.yieldQuantity ? <p className="mt-1 text-xs font-black text-slate-500">Yield: {row.yieldQuantity} {row.yieldUnit || ""}</p> : null}
                  </div>
                  <span className="rounded-xl bg-white px-3 py-2 text-xs font-black">Mở</span>
                </div>
              </button>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <span className="text-xs font-bold text-slate-500">{formatDate(row.updatedAt)}</span>
                {row.status !== "inactive" ? <button onClick={() => void archive(row.id)} className="text-xs font-black text-red-700">Ẩn công thức</button> : null}
              </div>
            </article>
          ))}
        </div>
        {!loading && visibleRows.length === 0 ? <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-sm font-bold text-slate-500">Chưa có công thức phù hợp.</p> : null}
      </section>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/75 p-0 backdrop-blur-sm md:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditorOpen(false); }}>
          <section className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden bg-slate-50 text-slate-950 shadow-2xl md:h-[calc(100vh-40px)] md:rounded-[30px]">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 md:p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Recipe editor</p>
                <h2 className="mt-1 text-2xl font-black">{form.id ? "Chỉnh công thức" : "Tạo công thức nháp"}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.workflowStatus ? <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-800">{workflowLabel[form.workflowStatus]}{form.currentVersionNo ? ` · v${form.currentVersionNo}` : ""}</span> : null}
                  {form.publishedVersionId ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Có bản công khai</span> : null}
                </div>
              </div>
              <button disabled={saving} onClick={() => setEditorOpen(false)} aria-label="Đóng editor" className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-xl font-black disabled:opacity-50">×</button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 pb-32 md:p-5 md:pb-28">
              {lockedForReview ? <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Phiên bản đang review hoặc đã duyệt nên nội dung được khóa.</p> : null}

              <section className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h3 className="text-lg font-black">Thông tin chính</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-black text-slate-600"><span>Tên công thức *</span><input disabled={lockedForReview} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                  <label className="grid gap-1 text-xs font-black text-slate-600"><span>Slug</span><input disabled={lockedForReview} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="Để trống sẽ tự tạo" className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                  <label className="grid gap-1 text-xs font-black text-slate-600"><span>Yield gốc</span><input disabled={lockedForReview} value={form.yieldQuantity} inputMode="decimal" onChange={(event) => setForm({ ...form, yieldQuantity: event.target.value })} placeholder="Ví dụ: 10" className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                  <UnitSelect label="Đơn vị yield" value={form.yieldUnit} disabled={lockedForReview} onChange={(yieldUnit) => setForm({ ...form, yieldUnit })} />
                  <label className="grid gap-1 text-xs font-black text-slate-600"><span>Thương hiệu liên quan</span><input disabled={lockedForReview} value={form.relatedBrand} onChange={(event) => setForm({ ...form, relatedBrand: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                  <label className="grid gap-1 text-xs font-black text-slate-600"><span>Thứ tự hiển thị</span><input disabled={lockedForReview} type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                </div>
                <label className="mt-3 grid gap-1 text-xs font-black text-slate-600"><span>Mô tả ngắn</span><textarea disabled={lockedForReview} value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} className="min-h-20 rounded-xl bg-slate-100 p-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                <label className="mt-3 grid gap-1 text-xs font-black text-slate-600"><span>Ghi chú công thức</span><textarea disabled={lockedForReview} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 rounded-xl bg-slate-100 p-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                <label className="mt-3 grid gap-1 text-xs font-black text-slate-600"><span>Ghi chú thay đổi cho version mới</span><input disabled={lockedForReview} value={form.changeNote} onChange={(event) => setForm({ ...form, changeNote: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
              </section>

              <section className="mt-4 rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-lg font-black">Ảnh bìa</h3><p className="mt-1 text-sm font-bold text-slate-500">Tìm nguyên liệu bên dưới rồi bấm “Dùng làm ảnh bìa”.</p></div>
                  {form.coverImageUrl && !lockedForReview ? <button onClick={() => setForm({ ...form, coverImageUrl: "" })} className="text-sm font-black text-red-700">Xóa ảnh</button> : null}
                </div>
                {form.coverImageUrl ? <div className="mt-3 overflow-hidden rounded-2xl bg-slate-100"><img src={form.coverImageUrl} alt="Ảnh bìa công thức" className="h-52 w-full object-cover" /></div> : <div className="mt-3 grid h-36 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-sm font-black text-slate-400">Chưa chọn ảnh bìa</div>}
                <details className="mt-3 rounded-xl bg-slate-100 p-3">
                  <summary className="cursor-pointer text-sm font-black">URL ảnh nâng cao</summary>
                  <input disabled={lockedForReview} value={form.coverImageUrl} onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })} placeholder="https://..." className="mt-3 h-11 w-full rounded-xl bg-white px-3 text-sm font-bold outline-none disabled:opacity-60" />
                </details>
              </section>

              <section className="mt-4 rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div><h3 className="text-lg font-black">Nguyên liệu</h3><p className="mt-1 text-sm font-bold text-slate-500">Sản phẩm Bếp Sỉ phải chọn đúng SKU. Nước, đá và garnish mới nhập tay.</p></div>
                <div className="mt-4 space-y-3">
                  {form.ingredients.map((item, index) => (
                    <article key={item.clientId} className="rounded-2xl bg-slate-100 p-3 ring-1 ring-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black">Nguyên liệu {index + 1}</p>
                        {!lockedForReview ? <button onClick={() => removeIngredient(item.clientId)} className="text-xs font-black text-red-700">Xóa</button> : null}
                      </div>

                      {!lockedForReview ? <div className="mt-3 flex gap-2"><input value={catalogQueries[item.clientId] || ""} onChange={(event) => setCatalogQueries((current) => ({ ...current, [item.clientId]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCatalog(item.clientId); } }} placeholder="Tìm SKU, tên sản phẩm hoặc thương hiệu" className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm font-bold outline-none" /><button disabled={catalogLoadingId === item.clientId} onClick={() => void searchCatalog(item.clientId)} className="rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">{catalogLoadingId === item.clientId ? "Đang tìm" : "Tìm"}</button></div> : null}

                      {catalogResults[item.clientId]?.length ? <div className="mt-2 grid gap-2 md:grid-cols-2">{catalogResults[item.clientId].map((option) => (
                        <div key={option.variantId} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                          {option.imageUrl ? <img src={option.imageUrl} alt={option.productName} className="h-28 w-full object-contain p-2" /> : <div className="grid h-28 place-items-center bg-slate-50 text-xs font-black text-slate-400">Chưa có ảnh</div>}
                          <div className="p-3"><b className="block text-sm">{labelForCatalog(option)}</b><span className="mt-1 block text-xs font-bold text-slate-500">{option.brand ? `${option.brand} · ` : ""}{optionsLabel(option.options) || "Không có quy cách bổ sung"}</span><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => selectCatalog(item.clientId, option)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Chọn nguyên liệu</button><button type="button" disabled={!option.imageUrl} onClick={() => option.imageUrl && setForm((current) => ({ ...current, coverImageUrl: option.imageUrl || "" }))} className="rounded-xl bg-orange-100 px-3 py-2 text-xs font-black text-orange-800 disabled:opacity-40">Dùng làm ảnh bìa</button></div></div>
                        </div>
                      ))}</div> : null}

                      {item.catalogVariantId ? <div className="mt-3 flex items-center gap-3 rounded-xl bg-emerald-50 p-3">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-14 w-14 rounded-lg bg-white object-contain" /> : null}<p className="min-w-0 flex-1 text-sm font-black text-emerald-800">{item.catalogLabel || item.productName}</p>{!lockedForReview ? <button onClick={() => updateIngredient(item.clientId, { catalogVariantId: null, catalogProductId: null, catalogLabel: "", imageUrl: null })} className="text-xs font-black text-red-700">Bỏ liên kết</button> : null}</div> : null}

                      <div className="mt-3 grid gap-2 md:grid-cols-[1.5fr_0.6fr_0.8fr_1.2fr]">
                        <label className="grid gap-1 text-xs font-black text-slate-600"><span>Tên nguyên liệu</span><input disabled={lockedForReview || Boolean(item.catalogVariantId)} value={item.productName} onChange={(event) => updateIngredient(item.clientId, { productName: event.target.value })} className="h-11 rounded-xl bg-white px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                        <label className="grid gap-1 text-xs font-black text-slate-600"><span>Số lượng</span><input disabled={lockedForReview} value={item.quantity} inputMode="decimal" onChange={(event) => updateIngredient(item.clientId, { quantity: event.target.value })} className="h-11 rounded-xl bg-white px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                        <UnitSelect label="Đơn vị" value={item.unit} disabled={lockedForReview} onChange={(unit) => updateIngredient(item.clientId, { unit })} />
                        <label className="grid gap-1 text-xs font-black text-slate-600"><span>Ghi chú</span><input disabled={lockedForReview} value={item.note} onChange={(event) => updateIngredient(item.clientId, { note: event.target.value })} className="h-11 rounded-xl bg-white px-3 text-sm font-bold outline-none disabled:opacity-60" /></label>
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-xs font-black"><input disabled={lockedForReview} type="checkbox" checked={item.optional} onChange={(event) => updateIngredient(item.clientId, { optional: event.target.checked })} /> Nguyên liệu tùy chọn</label>
                    </article>
                  ))}
                </div>
                {!lockedForReview ? <button onClick={() => setForm((current) => ({ ...current, ingredients: [...current.ingredients, emptyIngredient()] }))} className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">+ Thêm nguyên liệu</button> : null}
              </section>

              <section className="mt-4 rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div><h3 className="text-lg font-black">Các bước thực hiện</h3><p className="mt-1 text-sm font-bold text-slate-500">Ảnh bước chọn từ ảnh nguyên liệu đã liên kết. URL thủ công nằm trong mục nâng cao.</p></div>
                <div className="mt-4 space-y-3">
                  {form.steps.map((item, index) => (
                    <article key={item.clientId} className="rounded-2xl bg-slate-100 p-3 ring-1 ring-slate-200">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-black">Bước {index + 1}</p>{!lockedForReview ? <button onClick={() => setForm((current) => ({ ...current, steps: current.steps.filter((step) => step.clientId !== item.clientId) }))} className="text-xs font-black text-red-700">Xóa</button> : null}</div>
                      <input disabled={lockedForReview} value={item.title} onChange={(event) => updateStep(item.clientId, { title: event.target.value })} placeholder="Tiêu đề bước" className="mt-3 h-11 w-full rounded-xl bg-white px-3 text-sm font-bold outline-none disabled:opacity-60" />
                      <textarea disabled={lockedForReview} value={item.content} onChange={(event) => updateStep(item.clientId, { content: event.target.value })} placeholder="Hướng dẫn thực hiện" className="mt-2 min-h-24 w-full rounded-xl bg-white p-3 text-sm font-bold outline-none disabled:opacity-60" />
                      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_180px]">
                        <label className="grid gap-1 text-xs font-black text-slate-600"><span>Ảnh minh họa</span><select disabled={lockedForReview} value={item.imageUrl} onChange={(event) => updateStep(item.clientId, { imageUrl: event.target.value })} className="h-11 rounded-xl bg-white px-3 text-sm font-bold outline-none disabled:opacity-60"><option value="">Không dùng ảnh</option>{item.imageUrl && !ingredientImages.some((image) => image.url === item.imageUrl) ? <option value={item.imageUrl}>Ảnh URL hiện tại</option> : null}{ingredientImages.map((image) => <option key={`${item.clientId}-${image.url}`} value={image.url}>{image.label}</option>)}</select></label>
                        {item.imageUrl ? <img src={item.imageUrl} alt={`Minh họa bước ${index + 1}`} className="h-28 w-full rounded-xl bg-white object-contain" /> : <div className="grid h-28 place-items-center rounded-xl border-2 border-dashed border-slate-200 text-xs font-black text-slate-400">Không ảnh</div>}
                      </div>
                      <details className="mt-2 rounded-xl bg-white p-3"><summary className="cursor-pointer text-xs font-black">URL ảnh nâng cao</summary><input disabled={lockedForReview} value={item.imageUrl} onChange={(event) => updateStep(item.clientId, { imageUrl: event.target.value })} placeholder="https://..." className="mt-2 h-11 w-full rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none disabled:opacity-60" /></details>
                    </article>
                  ))}
                </div>
                {!lockedForReview ? <button onClick={() => setForm((current) => ({ ...current, steps: [...current.steps, emptyStep()] }))} className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">+ Thêm bước</button> : null}
              </section>

              {form.id && form.workflowStatus === "in_review" ? <section className="mt-4 rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200"><h3 className="text-lg font-black">Quyết định review</h3><textarea value={reviewInput} onChange={(event) => setReviewInput(event.target.value)} placeholder="Nhận xét review, bắt buộc khi yêu cầu chỉnh sửa" className="mt-3 min-h-24 w-full rounded-xl bg-slate-100 p-3 text-sm font-bold outline-none" /><div className="mt-3 grid gap-2 md:grid-cols-2"><button disabled={saving} onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/review`, { decision: "changes_requested", note: reviewInput })} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Yêu cầu chỉnh sửa</button><button disabled={saving} onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/review`, { decision: "approved", note: reviewInput })} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Duyệt phiên bản</button></div></section> : null}

              {form.id ? <section className="mt-4 rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200"><h3 className="text-lg font-black">Lịch sử phiên bản</h3><div className="mt-3 grid gap-2">{versions.map((version) => <article key={version.id} className="rounded-xl bg-slate-100 p-3"><div className="flex flex-wrap justify-between gap-2"><b>v{version.versionNo} · {workflowLabel[version.workflowStatus || "draft"]}{version.isCurrent ? " · hiện tại" : ""}{version.isPublished ? " · công khai" : ""}</b><span className="text-xs font-bold text-slate-500">{formatDate(version.createdAt)}</span></div>{version.changeNote ? <p className="mt-1 text-sm font-bold text-slate-600">Thay đổi: {version.changeNote}</p> : null}{version.reviewNote ? <p className="mt-1 text-sm font-bold text-slate-600">Review: {version.reviewNote}</p> : null}</article>)}{versions.length === 0 ? <p className="text-sm font-bold text-slate-500">Chưa có phiên bản.</p> : null}</div></section> : null}
            </div>

            <footer className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:static md:p-4">
              <div className="mx-auto grid max-w-5xl gap-2 md:grid-cols-3">
                {!lockedForReview ? <button disabled={!canSave} onClick={() => void save()} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? "Đang lưu..." : form.id ? "Lưu thành bản nháp mới" : "Tạo công thức"}</button> : null}
                {form.id && (form.workflowStatus === "draft" || form.workflowStatus === "changes_requested") ? <button disabled={saving} onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/submit-review`)} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Gửi review</button> : null}
                {form.id && form.workflowStatus === "approved" ? <button disabled={saving} onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/publish`)} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Xuất bản</button> : null}
                <button disabled={saving} onClick={() => setEditorOpen(false)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">Đóng</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
