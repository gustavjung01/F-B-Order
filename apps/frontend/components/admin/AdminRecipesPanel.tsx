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

const emptyIngredient = (clientId = createClientId("ingredient")): Ingredient => ({
  clientId,
  productName: "",
  quantity: "",
  unit: "",
  note: "",
  optional: false,
  catalogVariantId: null,
  catalogProductId: null,
  catalogLabel: "",
});

const emptyStep = (clientId = createClientId("step")): Step => ({
  clientId,
  title: "",
  content: "",
  imageUrl: "",
});

const emptyForm = (): FormState => ({
  id: null,
  title: "",
  slug: "",
  shortDescription: "",
  description: "",
  relatedBrand: "",
  coverImageUrl: "",
  yieldQuantity: "",
  yieldUnit: "",
  sortOrder: "0",
  changeNote: "",
  workflowStatus: null,
  currentVersionNo: null,
  reviewNote: "",
  publishedVersionId: null,
  ingredients: [emptyIngredient()],
  steps: [emptyStep()],
});

function labelForCatalog(item: Pick<CatalogOption, "productName" | "variantName" | "sku">): string {
  const product = item.productName.trim();
  const variant = item.variantName.trim();
  return `${variant && variant.toLocaleLowerCase() !== product.toLocaleLowerCase() ? `${product} — ${variant}` : product} · ${item.sku}`;
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
    yieldUnit: recipe.yieldUnit || "",
    sortOrder: String(recipe.sortOrder ?? 0),
    changeNote: "",
    workflowStatus: recipe.workflowStatus,
    currentVersionNo: recipe.currentVersionNo,
    reviewNote: recipe.reviewNote || "",
    publishedVersionId: recipe.publishedVersionId,
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((item) => ({
          clientId: item.id ? `ingredient-${item.id}` : createClientId("ingredient"),
          productName: item.productName,
          quantity: item.quantity || "",
          unit: item.unit || "",
          note: item.note || "",
          optional: item.optional,
          catalogVariantId: item.catalogVariantId,
          catalogProductId: item.catalogProductId,
          catalogLabel: item.catalogSnapshot
            ? labelForCatalog(item.catalogSnapshot)
            : item.catalogVariantId
              ? item.productName
              : "",
        }))
      : [emptyIngredient()],
    steps: recipe.steps.length
      ? recipe.steps.map((item) => ({
          clientId: item.id ? `step-${item.id}` : createClientId("step"),
          title: item.title || "",
          content: item.content,
          imageUrl: item.imageUrl || "",
        }))
      : [emptyStep()],
  };
}

function deleteRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function AdminRecipesPanel() {
  const { getToken, isLoaded } = useAuth();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [versions, setVersions] = useState<Version[]>([]);
  const [catalogQueries, setCatalogQueries] = useState<Record<string, string>>({});
  const [catalogResults, setCatalogResults] = useState<Record<string, CatalogOption[]>>({});
  const [catalogLoadingId, setCatalogLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [reviewInput, setReviewInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkflowStatus>("all");

  const lockedForReview = form.workflowStatus === "in_review" || form.workflowStatus === "approved";
  const canSave = useMemo(
    () => form.title.trim().length >= 3 && !saving && !lockedForReview,
    [form.title, saving, lockedForReview],
  );
  const visibleRows = useMemo(
    () => statusFilter === "all" ? rows : rows.filter((row) => row.workflowStatus === statusFilter),
    [rows, statusFilter],
  );

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Bạn cần đăng nhập admin để quản lý công thức.");
    return value;
  }

  async function load() {
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

  async function loadVersions(recipeId: string) {
    const result = await adminApiFetch<{ versions: Version[] }>(
      `/api/admin/recipes/${recipeId}/versions`,
      await token(),
    );
    setVersions(result.versions || []);
  }

  useEffect(() => {
    void load();
  }, [isLoaded]);

  function resetEditor() {
    setForm(emptyForm());
    setVersions([]);
    setReviewInput("");
    setCatalogQueries({});
    setCatalogResults({});
    setCatalogLoadingId(null);
  }

  async function openRecipe(id: string) {
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không mở được công thức.");
    }
  }

  function updateIngredient(clientId: string, patch: Partial<Ingredient>) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) => item.clientId === clientId ? { ...item, ...patch } : item),
    }));
  }

  function removeIngredient(clientId: string) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.filter((item) => item.clientId !== clientId),
    }));
    setCatalogQueries((current) => deleteRecordKey(current, clientId));
    setCatalogResults((current) => deleteRecordKey(current, clientId));
    setCatalogLoadingId((current) => current === clientId ? null : current);
  }

  function updateStep(clientId: string, patch: Partial<Step>) {
    setForm((current) => ({
      ...current,
      steps: current.steps.map((item) => item.clientId === clientId ? { ...item, ...patch } : item),
    }));
  }

  function removeStep(clientId: string) {
    setForm((current) => ({
      ...current,
      steps: current.steps.filter((item) => item.clientId !== clientId),
    }));
  }

  async function searchCatalog(clientId: string) {
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

  function selectCatalog(clientId: string, item: CatalogOption) {
    updateIngredient(clientId, {
      productName: item.variantName.toLocaleLowerCase() === item.productName.toLocaleLowerCase()
        ? item.productName
        : `${item.productName} — ${item.variantName}`,
      catalogVariantId: item.variantId,
      catalogProductId: item.productId,
      catalogLabel: labelForCatalog(item),
    });
    setCatalogQueries((current) => ({ ...current, [clientId]: "" }));
    setCatalogResults((current) => ({ ...current, [clientId]: [] }));
  }

  function clearCatalogLink(clientId: string) {
    updateIngredient(clientId, {
      catalogVariantId: null,
      catalogProductId: null,
      catalogLabel: "",
    });
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
        .map((item) => ({
          title: item.title,
          content: item.content,
          imageUrl: item.imageUrl,
        })),
    };
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const path = form.id ? `/api/admin/recipes/${form.id}` : "/api/admin/recipes";
      const method = form.id ? "PATCH" : "POST";
      const result = await adminApiFetch<{ recipe: RecipeDetail }>(path, await token(), {
        method,
        body: JSON.stringify(payload()),
      });
      setForm(toForm(result.recipe));
      setReviewInput(result.recipe.reviewNote || "");
      setCatalogQueries({});
      setCatalogResults({});
      await loadVersions(result.recipe.id);
      await load();
    } catch (cause) {
      setError(
        cause instanceof AdminApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Không lưu được công thức.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function lifecycle(path: string, body?: unknown) {
    if (!form.id) return;
    setSaving(true);
    setError("");
    try {
      const result = await adminApiFetch<{ recipe: RecipeDetail }>(
        path,
        await token(),
        body === undefined
          ? { method: "POST" }
          : { method: "POST", body: JSON.stringify(body) },
      );
      setForm(toForm(result.recipe));
      setReviewInput(result.recipe.reviewNote || "");
      setCatalogQueries({});
      setCatalogResults({});
      await loadVersions(result.recipe.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không cập nhật được workflow công thức.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (!window.confirm("Ẩn công thức này? Dữ liệu và lịch sử phiên bản vẫn được giữ lại.")) return;
    setError("");
    try {
      await adminApiFetch(`/api/admin/recipes/${id}`, await token(), { method: "DELETE" });
      if (form.id === id) resetEditor();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể ẩn công thức.");
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Công thức</p>
            <h2 className="mt-2 text-3xl font-black">
              {form.id ? "Chỉnh công thức" : "Tạo công thức nháp"}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.workflowStatus ? (
              <span className="rounded-full bg-orange-100 px-3 py-2 text-xs font-black text-orange-800">
                {workflowLabel[form.workflowStatus]}
                {form.currentVersionNo ? ` · v${form.currentVersionNo}` : ""}
              </span>
            ) : null}
            {form.publishedVersionId ? (
              <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">
                Có bản đang công khai
              </span>
            ) : null}
            {form.id ? (
              <button
                type="button"
                onClick={resetEditor}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black"
              >
                Tạo bản mới
              </button>
            ) : null}
          </div>
        </div>

        {lockedForReview ? (
          <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
            Phiên bản đang trong workflow review nên nội dung được khóa. Duyệt để xuất bản hoặc yêu cầu chỉnh sửa để mở lại.
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input
            disabled={lockedForReview}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Tên công thức *"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none disabled:opacity-60"
          />
          <input
            disabled={lockedForReview}
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
            placeholder="Slug (để trống sẽ tự tạo)"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none disabled:opacity-60"
          />
          <input
            disabled={lockedForReview}
            value={form.yieldQuantity}
            onChange={(event) => setForm({ ...form, yieldQuantity: event.target.value })}
            placeholder="Yield nền, ví dụ: 1"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none disabled:opacity-60"
          />
          <input
            disabled={lockedForReview}
            value={form.yieldUnit}
            onChange={(event) => setForm({ ...form, yieldUnit: event.target.value })}
            placeholder="Đơn vị yield, ví dụ: ly / mẻ"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none disabled:opacity-60"
          />
          <input
            disabled={lockedForReview}
            value={form.relatedBrand}
            onChange={(event) => setForm({ ...form, relatedBrand: event.target.value })}
            placeholder="Thương hiệu liên quan"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none disabled:opacity-60"
          />
          <label className="grid gap-1 text-xs font-black text-slate-600">
            Thứ tự hiển thị
            <input
              disabled={lockedForReview}
              type="number"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              className="h-12 rounded-2xl bg-slate-100 px-4 text-base font-bold text-slate-950 outline-none disabled:opacity-60"
            />
          </label>
          <label className="grid gap-1 text-xs font-black text-slate-600 md:col-span-2">
            Ảnh bìa công thức
            <input
              disabled={lockedForReview}
              type="url"
              value={form.coverImageUrl}
              onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })}
              placeholder="https://..."
              className="h-12 rounded-2xl bg-slate-100 px-4 text-base font-bold text-slate-950 outline-none disabled:opacity-60"
            />
          </label>
          <input
            disabled={lockedForReview}
            value={form.changeNote}
            onChange={(event) => setForm({ ...form, changeNote: event.target.value })}
            placeholder="Ghi chú thay đổi cho phiên bản mới"
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none disabled:opacity-60 md:col-span-2"
          />
        </div>
        <textarea
          disabled={lockedForReview}
          value={form.shortDescription}
          onChange={(event) => setForm({ ...form, shortDescription: event.target.value })}
          placeholder="Mô tả ngắn"
          className="mt-3 min-h-20 w-full rounded-2xl bg-slate-100 p-4 font-bold outline-none disabled:opacity-60"
        />
        <textarea
          disabled={lockedForReview}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Mô tả / ghi chú công thức"
          className="mt-3 min-h-28 w-full rounded-2xl bg-slate-100 p-4 font-bold outline-none disabled:opacity-60"
        />
      </section>

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div>
          <h3 className="text-xl font-black">Nguyên liệu</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">
            Nguyên liệu bán trong Bếp Sỉ phải chọn đúng SKU/variant. Nhập tay chỉ dùng cho nước, đá, garnish hoặc vật tư không bán trong catalog.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {form.ingredients.map((item, index) => (
            <article key={item.clientId} className="rounded-2xl bg-slate-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black">Nguyên liệu {index + 1}</p>
                {item.catalogVariantId ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                    Đã gắn catalog
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                    Nhập tay
                  </span>
                )}
              </div>

              {!lockedForReview ? (
                <div className="mt-3 flex gap-2">
                  <input
                    value={catalogQueries[item.clientId] || ""}
                    onChange={(event) => setCatalogQueries((current) => ({
                      ...current,
                      [item.clientId]: event.target.value,
                    }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchCatalog(item.clientId);
                      }
                    }}
                    placeholder="Tìm SKU, tên sản phẩm hoặc brand trong catalog"
                    className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 font-bold outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void searchCatalog(item.clientId)}
                    disabled={catalogLoadingId === item.clientId}
                    className="rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    {catalogLoadingId === item.clientId ? "Đang tìm" : "Tìm"}
                  </button>
                </div>
              ) : null}

              {catalogResults[item.clientId]?.length ? (
                <div className="mt-2 space-y-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
                  {catalogResults[item.clientId].map((option) => (
                    <button
                      type="button"
                      key={option.variantId}
                      disabled={lockedForReview}
                      onClick={() => selectCatalog(item.clientId, option)}
                      className="block w-full rounded-xl px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-default"
                    >
                      <b className="block text-sm">{labelForCatalog(option)}</b>
                      <span className="block text-xs font-bold text-slate-500">
                        {option.brand ? `${option.brand} · ` : ""}
                        {optionsLabel(option.options) || "Không có quy cách bổ sung"}
                        {option.isOrderable ? " · Có thể đặt" : " · Chưa thể đặt trực tiếp"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {item.catalogVariantId ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3">
                  <p className="flex-1 text-sm font-black text-emerald-800">
                    {item.catalogLabel || item.productName}
                  </p>
                  {!lockedForReview ? (
                    <button
                      type="button"
                      onClick={() => clearCatalogLink(item.clientId)}
                      className="text-sm font-black text-red-700"
                    >
                      Bỏ liên kết
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 md:grid-cols-[1.6fr_0.65fr_0.65fr_1.4fr_auto_auto]">
                <input
                  disabled={lockedForReview || Boolean(item.catalogVariantId)}
                  value={item.productName}
                  onChange={(event) => updateIngredient(item.clientId, {
                    productName: event.target.value,
                    catalogVariantId: null,
                    catalogProductId: null,
                    catalogLabel: "",
                  })}
                  placeholder="Tên nguyên liệu thủ công"
                  className="h-11 rounded-xl bg-white px-3 font-bold outline-none disabled:opacity-60"
                />
                <input
                  disabled={lockedForReview}
                  value={item.quantity}
                  onChange={(event) => updateIngredient(item.clientId, { quantity: event.target.value })}
                  placeholder="Lượng"
                  className="h-11 rounded-xl bg-white px-3 font-bold outline-none disabled:opacity-60"
                />
                <input
                  disabled={lockedForReview}
                  value={item.unit}
                  onChange={(event) => updateIngredient(item.clientId, { unit: event.target.value })}
                  placeholder="Đơn vị"
                  className="h-11 rounded-xl bg-white px-3 font-bold outline-none disabled:opacity-60"
                />
                <input
                  disabled={lockedForReview}
                  value={item.note}
                  onChange={(event) => updateIngredient(item.clientId, { note: event.target.value })}
                  placeholder="Ghi chú"
                  className="h-11 rounded-xl bg-white px-3 font-bold outline-none disabled:opacity-60"
                />
                <label className="flex items-center gap-2 text-xs font-black">
                  <input
                    disabled={lockedForReview}
                    type="checkbox"
                    checked={item.optional}
                    onChange={(event) => updateIngredient(item.clientId, { optional: event.target.checked })}
                  />
                  Tùy chọn
                </label>
                {!lockedForReview ? (
                  <button
                    type="button"
                    onClick={() => removeIngredient(item.clientId)}
                    className="text-sm font-black text-red-600"
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {!lockedForReview ? (
          <button
            type="button"
            onClick={() => setForm((current) => ({
              ...current,
              ingredients: [...current.ingredients, emptyIngredient()],
            }))}
            className="mt-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
          >
            + Thêm nguyên liệu
          </button>
        ) : null}
      </section>

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <h3 className="text-xl font-black">Các bước thực hiện</h3>
        <div className="mt-4 space-y-3">
          {form.steps.map((item, index) => (
            <article key={item.clientId} className="rounded-2xl bg-slate-100 p-3">
              <div className="flex gap-2">
                <input
                  disabled={lockedForReview}
                  value={item.title}
                  onChange={(event) => updateStep(item.clientId, { title: event.target.value })}
                  placeholder={`Bước ${index + 1} (tiêu đề)`}
                  className="h-11 flex-1 rounded-xl bg-white px-3 font-bold outline-none disabled:opacity-60"
                />
                {!lockedForReview ? (
                  <button
                    type="button"
                    onClick={() => removeStep(item.clientId)}
                    className="px-2 text-sm font-black text-red-600"
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <textarea
                disabled={lockedForReview}
                value={item.content}
                onChange={(event) => updateStep(item.clientId, { content: event.target.value })}
                placeholder="Hướng dẫn thực hiện"
                className="mt-2 min-h-20 w-full rounded-xl bg-white p-3 font-bold outline-none disabled:opacity-60"
              />
              <label className="mt-2 grid gap-1 text-xs font-black text-slate-600">
                Ảnh minh họa bước
                <input
                  disabled={lockedForReview}
                  type="url"
                  value={item.imageUrl}
                  onChange={(event) => updateStep(item.clientId, { imageUrl: event.target.value })}
                  placeholder="https://..."
                  className="h-11 rounded-xl bg-white px-3 text-base font-bold text-slate-950 outline-none disabled:opacity-60"
                />
              </label>
            </article>
          ))}
        </div>
        {!lockedForReview ? (
          <button
            type="button"
            onClick={() => setForm((current) => ({
              ...current,
              steps: [...current.steps, emptyStep()],
            }))}
            className="mt-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
          >
            + Thêm bước
          </button>
        ) : null}
      </section>

      {!lockedForReview ? (
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className="w-full rounded-[22px] bg-orange-500 px-5 py-4 text-base font-black text-white shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : form.id ? "Lưu thay đổi thành phiên bản nháp" : "Tạo công thức nháp"}
        </button>
      ) : null}

      {form.id && (form.workflowStatus === "draft" || form.workflowStatus === "changes_requested") ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/submit-review`)}
          className="w-full rounded-[22px] bg-slate-950 px-5 py-4 text-base font-black text-white disabled:opacity-50"
        >
          Gửi phiên bản hiện tại để review
        </button>
      ) : null}

      {form.id && form.workflowStatus === "in_review" ? (
        <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
          <h3 className="text-xl font-black">Quyết định review</h3>
          <textarea
            value={reviewInput}
            onChange={(event) => setReviewInput(event.target.value)}
            placeholder="Nhận xét review (bắt buộc khi yêu cầu chỉnh sửa)"
            className="mt-3 min-h-24 w-full rounded-2xl bg-slate-100 p-4 font-bold outline-none"
          />
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void lifecycle(
                `/api/admin/recipes/${form.id}/review`,
                { decision: "changes_requested", note: reviewInput },
              )}
              className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-white"
            >
              Yêu cầu chỉnh sửa
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void lifecycle(
                `/api/admin/recipes/${form.id}/review`,
                { decision: "approved", note: reviewInput },
              )}
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"
            >
              Duyệt phiên bản
            </button>
          </div>
        </section>
      ) : null}

      {form.id && form.workflowStatus === "approved" ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void lifecycle(`/api/admin/recipes/${form.id}/publish`)}
          className="w-full rounded-[22px] bg-emerald-600 px-5 py-4 text-base font-black text-white shadow-xl disabled:opacity-50"
        >
          Xuất bản phiên bản đã duyệt
        </button>
      ) : null}

      {form.id ? (
        <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
          <h3 className="text-xl font-black">Lịch sử phiên bản</h3>
          <div className="mt-3 grid gap-2">
            {versions.map((version) => (
              <article key={version.id} className="rounded-2xl bg-slate-100 p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <b>
                    v{version.versionNo} · {workflowLabel[version.workflowStatus || "draft"]}
                    {version.isCurrent ? " · hiện tại" : ""}
                    {version.isPublished ? " · công khai" : ""}
                  </b>
                  <span className="text-xs font-bold text-slate-500">
                    {new Date(version.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>
                {version.changeNote ? (
                  <p className="mt-1 text-sm font-bold text-slate-600">Thay đổi: {version.changeNote}</p>
                ) : null}
                {version.reviewNote ? (
                  <p className="mt-1 text-sm font-bold text-slate-600">Review: {version.reviewNote}</p>
                ) : null}
              </article>
            ))}
            {versions.length === 0 ? (
              <p className="text-sm font-bold text-slate-500">Chưa có phiên bản nào.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
            placeholder="Tìm theo tên hoặc slug"
            className="h-12 min-w-[220px] flex-1 rounded-2xl bg-slate-100 px-4 font-bold outline-none"
          />
          <select
            value={statusFilter || "all"}
            onChange={(event) => setStatusFilter(event.target.value as "all" | WorkflowStatus)}
            className="h-12 rounded-2xl bg-slate-100 px-4 font-bold outline-none"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="draft">Bản nháp</option>
            <option value="in_review">Đang review</option>
            <option value="changes_requested">Cần sửa</option>
            <option value="approved">Đã duyệt</option>
            <option value="published">Đã xuất bản</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            Tìm
          </button>
        </div>
        <h3 className="mt-5 text-xl font-black">Danh sách công thức</h3>
        {loading ? <p className="mt-3 text-sm font-bold text-slate-500">Đang tải...</p> : null}
        <div className="mt-3 grid gap-3">
          {visibleRows.map((row) => (
            <article key={row.id} className="rounded-2xl bg-slate-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.13em] text-orange-600">
                    {workflowLabel[row.workflowStatus || "draft"]} · v{row.currentVersionNo || "-"}
                  </p>
                  <h4 className="mt-1 text-lg font-black">{row.title}</h4>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {row.ingredientCount} nguyên liệu · {row.catalogIngredientCount} đã gắn catalog · {row.stepCount} bước
                    {row.yieldQuantity ? ` · ${row.yieldQuantity} ${row.yieldUnit || ""}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void openRecipe(row.id)}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-black"
                  >
                    Mở
                  </button>
                  {row.status !== "inactive" ? (
                    <button
                      type="button"
                      onClick={() => void archive(row.id)}
                      className="rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-700"
                    >
                      Ẩn
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {!loading && visibleRows.length === 0 ? (
            <p className="rounded-2xl bg-slate-100 p-4 text-sm font-bold text-slate-500">
              Chưa có công thức nào.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
