export type WorkflowStatus = "draft" | "in_review" | "changes_requested" | "approved" | "published" | null;
export type EditorTab = "overview" | "ingredients" | "steps" | "publish";
export type Toast = { kind: "success" | "error"; message: string } | null;
export type UploadPhase = "processing" | "presign" | "upload-main" | "upload-thumbnail" | "verify" | "complete" | "done" | "error";

export type CatalogSnapshot = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  options: Record<string, unknown>;
  isOrderable: boolean;
};

export type CatalogOption = CatalogSnapshot & {
  brand: string | null;
  priceMode: string;
  priceLabel: string | null;
  imageUrl: string | null;
};

export type Ingredient = {
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

export type Step = {
  clientId: string;
  title: string;
  content: string;
  imageUrl: string;
  thumbnailUrl: string;
  mediaId: string | null;
};

export type RecipeRow = {
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

export type RecipeDetail = {
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

export type Version = {
  id: string;
  versionNo: number;
  workflowStatus: WorkflowStatus;
  changeNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  isCurrent: boolean;
  isPublished: boolean;
};

export type FormState = {
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

export type MediaPickerItem = {
  id: string;
  label: string;
  imageUrl: string;
  thumbnailUrl: string;
  mediaId: string | null;
  source: "cover" | "ingredient" | "step";
};

export type CompletionItem = {
  id: string;
  label: string;
  complete: boolean;
  tab: EditorTab;
};

export type UndoDelete =
  | { kind: "ingredient"; item: Ingredient; index: number; label: string }
  | { kind: "step"; item: Step; index: number; label: string };

export const UNIT_OPTIONS = [
  ["g", "Gram (g)"],
  ["kg", "Kilôgam (kg)"],
  ["ml", "Mililít (ml)"],
  ["l", "Lít (l)"],
  ["piece", "Cái"],
  ["portion", "Phần"],
  ["pack", "Gói"],
  ["ly", "Ly"],
  ["mẻ", "Mẻ"],
] as const;

export const workflowLabel: Record<string, string> = {
  draft: "Bản nháp",
  in_review: "Đang review",
  changes_requested: "Cần chỉnh sửa",
  approved: "Đã duyệt",
  published: "Đã xuất bản",
};

export const uploadPhaseLabel: Record<UploadPhase, string> = {
  processing: "Đang resize và nén WebP",
  presign: "Đang cấp quyền upload",
  "upload-main": "Đang tải ảnh chính lên R2",
  "upload-thumbnail": "Đang tải thumbnail lên R2",
  verify: "Đang kiểm tra CDN",
  complete: "Đang ghi trạng thái upload",
  done: "Đã tải ảnh và thumbnail",
  error: "Upload thất bại",
};

export function createClientId(prefix: "ingredient" | "step") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

export function emptyIngredient(): Ingredient {
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

export function emptyStep(): Step {
  return { clientId: createClientId("step"), title: "", content: "", imageUrl: "", thumbnailUrl: "", mediaId: null };
}

export function emptyForm(): FormState {
  return {
    id: null,
    title: "",
    slug: "",
    shortDescription: "",
    description: "",
    relatedBrand: "",
    coverImageUrl: "",
    coverThumbnailUrl: "",
    coverMediaId: null,
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

export function catalogLabel(item: Pick<CatalogSnapshot, "productName" | "variantName" | "sku">) {
  const title = item.variantName.trim().toLocaleLowerCase("vi-VN") === item.productName.trim().toLocaleLowerCase("vi-VN")
    ? item.productName
    : `${item.productName} · ${item.variantName}`;
  return `${title} · ${item.sku}`;
}

export function toForm(recipe: RecipeDetail): FormState {
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
          catalogLabel: item.catalogSnapshot ? catalogLabel(item.catalogSnapshot) : item.productName,
          imageUrl: null,
        }))
      : [emptyIngredient()],
    steps: recipe.steps.length
      ? recipe.steps.map((item) => ({
          clientId: `step-${item.id}`,
          title: item.title || "",
          content: item.content,
          imageUrl: item.imageUrl || "",
          thumbnailUrl: "",
          mediaId: null,
        }))
      : [emptyStep()],
  };
}

export function serialized(form: FormState) {
  return JSON.stringify({ ...form, changeNote: "" });
}

export function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN");
}

export function validationErrors(form: FormState, forReview = false): string[] {
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

export function completionItems(form: FormState): CompletionItem[] {
  return [
    { id: "title", label: "Tên công thức", complete: form.title.trim().length >= 3, tab: "overview" },
    { id: "yield", label: "Yield hợp lệ", complete: Number(form.yieldQuantity) > 0 && Boolean(form.yieldUnit), tab: "overview" },
    { id: "cover", label: "Ảnh bìa", complete: Boolean(form.coverImageUrl), tab: "overview" },
    { id: "description", label: "Mô tả", complete: Boolean(form.shortDescription.trim() || form.description.trim()), tab: "overview" },
    { id: "ingredient", label: "Nguyên liệu liên kết SKU", complete: form.ingredients.some((item) => Boolean(item.catalogVariantId)), tab: "ingredients" },
    { id: "step", label: "Bước hướng dẫn", complete: form.steps.some((step) => Boolean(step.content.trim())), tab: "steps" },
  ];
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
