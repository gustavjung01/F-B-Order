import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import { buildRecipeCostPreview, type RecipeCostIngredientInput, type RecipeCostPreview } from "../ai/recipe-cost";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QC_PATTERN = /(\bqc\b|kiem tra|kiểm tra|chat luong|chất lượng|nhiet do|nhiệt độ|do ngot|độ ngọt|do chua|độ chua|mau sac|màu sắc)/i;

type Scalar = string | number | boolean | null;
type ChangeKind = "added" | "removed" | "modified" | "moved";
type RiskSeverity = "info" | "warning" | "high";

type RawSnapshot = Record<string, unknown>;
type RawIngredient = Record<string, unknown>;
type RawStep = Record<string, unknown>;

type NormalizedIngredient = {
  index: number;
  productName: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
  catalogVariantId: string | null;
  catalogProductId: string | null;
  sourceType: string | null;
  sourceRecipeSlug: string | null;
};

type NormalizedStep = {
  index: number;
  title: string | null;
  content: string;
  imageUrl: string | null;
};

type NormalizedSnapshot = {
  slug: string | null;
  title: string;
  shortDescription: string | null;
  description: string | null;
  recipeCategoryId: string | null;
  relatedBrand: string | null;
  coverImageUrl: string | null;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  sortOrder: number | null;
  ingredients: NormalizedIngredient[];
  steps: NormalizedStep[];
};

type VersionRow = {
  id: string;
  recipeId: string;
  recipeTitle: string;
  versionNo: number;
  workflowStatus: string;
  changeNote: string | null;
  createdAt: string;
  snapshot: unknown;
};

type CatalogCostRow = {
  id: string;
  sku: string;
  shopPrice: string | null;
  retailPrice: string | null;
  variantData: unknown;
  productData: unknown;
};

export type RecipeVersionFieldChange = {
  field: string;
  label: string;
  from: Scalar;
  to: Scalar;
};

export type RecipeVersionIngredientChange = {
  kind: ChangeKind;
  key: string;
  label: string;
  from: NormalizedIngredient | null;
  to: NormalizedIngredient | null;
  changedFields: string[];
};

export type RecipeVersionStepChange = {
  kind: ChangeKind;
  label: string;
  from: NormalizedStep | null;
  to: NormalizedStep | null;
  changedFields: string[];
};

export type RecipeVersionRisk = {
  code: string;
  severity: RiskSeverity;
  message: string;
};

export type RecipeVersionComparison = {
  schemaVersion: "recipe-version-compare-v1";
  generatedAt: string;
  pricingBasis: "current_catalog_prices";
  recipe: { id: string; title: string };
  fromVersion: Omit<VersionRow, "snapshot" | "recipeId" | "recipeTitle">;
  toVersion: Omit<VersionRow, "snapshot" | "recipeId" | "recipeTitle">;
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
  metadataChanges: RecipeVersionFieldChange[];
  ingredientChanges: RecipeVersionIngredientChange[];
  stepChanges: RecipeVersionStepChange[];
  cost: {
    from: RecipeCostPreview;
    to: RecipeCostPreview;
    knownMandatoryCostDelta: number;
    costPerYieldDelta: number | null;
    percentDelta: number | null;
  };
  risks: RecipeVersionRisk[];
};

function normalizeUuid(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("RECIPE_VERSION_COMPARE_INVALID", 400, `${field} must be a UUID.`);
  }
  return normalized;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSnapshot(value: unknown, fallbackTitle: string): NormalizedSnapshot {
  const snapshot = value && typeof value === "object" && !Array.isArray(value)
    ? value as RawSnapshot
    : {};
  const ingredients = Array.isArray(snapshot.ingredients) ? snapshot.ingredients : [];
  const steps = Array.isArray(snapshot.steps) ? snapshot.steps : [];
  return {
    slug: normalizeText(snapshot.slug),
    title: normalizeText(snapshot.title) || fallbackTitle,
    shortDescription: normalizeText(snapshot.shortDescription),
    description: normalizeText(snapshot.description),
    recipeCategoryId: normalizeText(snapshot.recipeCategoryId),
    relatedBrand: normalizeText(snapshot.relatedBrand),
    coverImageUrl: normalizeText(snapshot.coverImageUrl),
    yieldQuantity: normalizeNumber(snapshot.yieldQuantity),
    yieldUnit: normalizeText(snapshot.yieldUnit),
    sortOrder: normalizeNumber(snapshot.sortOrder),
    ingredients: ingredients.map((entry, index) => {
      const ingredient = entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry as RawIngredient
        : {};
      return {
        index,
        productName: normalizeText(ingredient.productName) || `Nguyên liệu ${index + 1}`,
        quantity: normalizeNumber(ingredient.quantity),
        unit: normalizeText(ingredient.unit),
        note: normalizeText(ingredient.note),
        optional: ingredient.optional === true,
        catalogVariantId: normalizeText(ingredient.catalogVariantId),
        catalogProductId: normalizeText(ingredient.catalogProductId),
        sourceType: normalizeText(ingredient.sourceType),
        sourceRecipeSlug: normalizeText(ingredient.sourceRecipeSlug),
      };
    }),
    steps: steps.map((entry, index) => {
      const step = entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry as RawStep
        : {};
      return {
        index,
        title: normalizeText(step.title),
        content: normalizeText(step.content) || "",
        imageUrl: normalizeText(step.imageUrl),
      };
    }),
  };
}

function equalScalar(left: Scalar, right: Scalar): boolean {
  return left === right;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compareMetadata(from: NormalizedSnapshot, to: NormalizedSnapshot): RecipeVersionFieldChange[] {
  const fields: Array<[keyof NormalizedSnapshot, string]> = [
    ["title", "Tên công thức"],
    ["slug", "Slug"],
    ["shortDescription", "Mô tả ngắn"],
    ["description", "Mô tả chi tiết"],
    ["recipeCategoryId", "Danh mục"],
    ["relatedBrand", "Thương hiệu liên quan"],
    ["coverImageUrl", "Ảnh bìa"],
    ["yieldQuantity", "Sản lượng"],
    ["yieldUnit", "Đơn vị sản lượng"],
    ["sortOrder", "Thứ tự hiển thị"],
  ];
  const changes: RecipeVersionFieldChange[] = [];
  for (const [field, label] of fields) {
    const fromValue = from[field] as Scalar;
    const toValue = to[field] as Scalar;
    if (!equalScalar(fromValue, toValue)) changes.push({ field, label, from: fromValue, to: toValue });
  }
  return changes;
}

function ingredientKey(ingredient: NormalizedIngredient): string {
  const name = normalizeSearchText(ingredient.productName);
  return name || ingredient.catalogVariantId || `ingredient-${ingredient.index}`;
}

function ingredientChangedFields(from: NormalizedIngredient, to: NormalizedIngredient): string[] {
  const fields: Array<keyof Omit<NormalizedIngredient, "index">> = [
    "productName",
    "quantity",
    "unit",
    "note",
    "optional",
    "catalogVariantId",
    "catalogProductId",
    "sourceType",
    "sourceRecipeSlug",
  ];
  return fields.filter((field) => from[field] !== to[field]);
}

function compareIngredients(from: NormalizedIngredient[], to: NormalizedIngredient[]): RecipeVersionIngredientChange[] {
  const fromGroups = new Map<string, NormalizedIngredient[]>();
  const toGroups = new Map<string, NormalizedIngredient[]>();
  for (const ingredient of from) {
    const key = ingredientKey(ingredient);
    fromGroups.set(key, [...(fromGroups.get(key) || []), ingredient]);
  }
  for (const ingredient of to) {
    const key = ingredientKey(ingredient);
    toGroups.set(key, [...(toGroups.get(key) || []), ingredient]);
  }

  const changes: RecipeVersionIngredientChange[] = [];
  const keys = new Set([...fromGroups.keys(), ...toGroups.keys()]);
  for (const key of keys) {
    const fromItems = fromGroups.get(key) || [];
    const toItems = toGroups.get(key) || [];
    const count = Math.max(fromItems.length, toItems.length);
    for (let index = 0; index < count; index += 1) {
      const fromItem = fromItems[index] || null;
      const toItem = toItems[index] || null;
      if (!fromItem && toItem) {
        changes.push({ kind: "added", key, label: toItem.productName, from: null, to: toItem, changedFields: [] });
        continue;
      }
      if (fromItem && !toItem) {
        changes.push({ kind: "removed", key, label: fromItem.productName, from: fromItem, to: null, changedFields: [] });
        continue;
      }
      if (!fromItem || !toItem) continue;
      const changedFields = ingredientChangedFields(fromItem, toItem);
      if (changedFields.length > 0) {
        changes.push({
          kind: fromItem.index === toItem.index ? "modified" : "moved",
          key,
          label: toItem.productName,
          from: fromItem,
          to: toItem,
          changedFields,
        });
      } else if (fromItem.index !== toItem.index) {
        changes.push({ kind: "moved", key, label: toItem.productName, from: fromItem, to: toItem, changedFields: ["position"] });
      }
    }
  }
  return changes.sort((left, right) => (left.to?.index ?? left.from?.index ?? 0) - (right.to?.index ?? right.from?.index ?? 0));
}

function stepFingerprint(step: NormalizedStep): string {
  return `${normalizeSearchText(step.title || "")}\u0000${normalizeSearchText(step.content)}\u0000${step.imageUrl || ""}`;
}

function stepChangedFields(from: NormalizedStep, to: NormalizedStep): string[] {
  const changed: string[] = [];
  if (from.title !== to.title) changed.push("title");
  if (from.content !== to.content) changed.push("content");
  if (from.imageUrl !== to.imageUrl) changed.push("imageUrl");
  if (from.index !== to.index) changed.push("position");
  return changed;
}

function compareSteps(from: NormalizedStep[], to: NormalizedStep[]): RecipeVersionStepChange[] {
  const matchedFrom = new Set<number>();
  const matchedTo = new Set<number>();
  const pairs: Array<[NormalizedStep, NormalizedStep]> = [];

  for (const fromStep of from) {
    const fingerprint = stepFingerprint(fromStep);
    const match = to.find((toStep) => !matchedTo.has(toStep.index) && stepFingerprint(toStep) === fingerprint);
    if (match) {
      matchedFrom.add(fromStep.index);
      matchedTo.add(match.index);
      pairs.push([fromStep, match]);
    }
  }

  for (const fromStep of from) {
    if (matchedFrom.has(fromStep.index) || !fromStep.title) continue;
    const title = normalizeSearchText(fromStep.title);
    const match = to.find((toStep) => !matchedTo.has(toStep.index) && Boolean(toStep.title) && normalizeSearchText(toStep.title || "") === title);
    if (match) {
      matchedFrom.add(fromStep.index);
      matchedTo.add(match.index);
      pairs.push([fromStep, match]);
    }
  }

  for (const fromStep of from) {
    if (matchedFrom.has(fromStep.index)) continue;
    const match = to.find((toStep) => !matchedTo.has(toStep.index) && toStep.index === fromStep.index);
    if (match) {
      matchedFrom.add(fromStep.index);
      matchedTo.add(match.index);
      pairs.push([fromStep, match]);
    }
  }

  const changes: RecipeVersionStepChange[] = [];
  for (const [fromStep, toStep] of pairs) {
    const changedFields = stepChangedFields(fromStep, toStep);
    if (changedFields.length === 0) continue;
    changes.push({
      kind: changedFields.length === 1 && changedFields[0] === "position" ? "moved" : "modified",
      label: toStep.title || fromStep.title || `Bước ${toStep.index + 1}`,
      from: fromStep,
      to: toStep,
      changedFields,
    });
  }
  for (const fromStep of from.filter((step) => !matchedFrom.has(step.index))) {
    changes.push({ kind: "removed", label: fromStep.title || `Bước ${fromStep.index + 1}`, from: fromStep, to: null, changedFields: [] });
  }
  for (const toStep of to.filter((step) => !matchedTo.has(step.index))) {
    changes.push({ kind: "added", label: toStep.title || `Bước ${toStep.index + 1}`, from: null, to: toStep, changedFields: [] });
  }
  return changes.sort((left, right) => (left.to?.index ?? left.from?.index ?? 0) - (right.to?.index ?? right.from?.index ?? 0));
}

async function loadCatalogCostRows(db: Pool, variantIds: string[]): Promise<Map<string, CatalogCostRow>> {
  if (variantIds.length === 0) return new Map();
  const result = await db.query<CatalogCostRow>(
    `SELECT
       variant.id::text AS id,
       variant.sku,
       variant.shop_price::text AS "shopPrice",
       variant.retail_price::text AS "retailPrice",
       to_jsonb(variant) AS "variantData",
       to_jsonb(product) AS "productData"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     WHERE variant.id = ANY($1::uuid[])`,
    [variantIds],
  );
  return new Map(result.rows.map((row) => [row.id, row]));
}

function buildSnapshotCost(
  version: VersionRow,
  snapshot: NormalizedSnapshot,
  catalogRows: Map<string, CatalogCostRow>,
): RecipeCostPreview {
  const ingredients: RecipeCostIngredientInput[] = snapshot.ingredients.map((ingredient) => {
    const catalog = ingredient.catalogVariantId ? catalogRows.get(ingredient.catalogVariantId) : undefined;
    return {
      productName: ingredient.productName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      optional: ingredient.optional,
      catalogVariantId: ingredient.catalogVariantId,
      sourceType: ingredient.sourceType,
      sourceRecipeSlug: ingredient.sourceRecipeSlug,
      sku: catalog?.sku || null,
      shopPrice: catalog?.shopPrice || null,
      retailPrice: catalog?.retailPrice || null,
      variantData: catalog?.variantData || null,
      productData: catalog?.productData || null,
    };
  });
  return buildRecipeCostPreview(
    {
      id: version.id,
      title: `${snapshot.title} v${version.versionNo}`,
      yieldQuantity: snapshot.yieldQuantity,
      yieldUnit: snapshot.yieldUnit,
    },
    ingredients,
  );
}

function buildRisks(
  metadataChanges: RecipeVersionFieldChange[],
  ingredientChanges: RecipeVersionIngredientChange[],
  stepChanges: RecipeVersionStepChange[],
  fromCost: RecipeCostPreview,
  toCost: RecipeCostPreview,
): RecipeVersionRisk[] {
  const risks: RecipeVersionRisk[] = [];
  const add = (code: string, severity: RiskSeverity, message: string) => {
    if (!risks.some((risk) => risk.code === code && risk.message === message)) risks.push({ code, severity, message });
  };

  if (metadataChanges.some((change) => change.field === "yieldQuantity" || change.field === "yieldUnit")) {
    add("YIELD_CHANGED", "high", "Yield đã thay đổi; cần kiểm tra lại cost trên mỗi đơn vị thành phẩm và năng lực sản xuất.");
  }

  for (const change of ingredientChanges) {
    if (change.kind === "removed" && change.from && !change.from.optional) {
      add("MANDATORY_INGREDIENT_REMOVED", "high", `Đã xóa nguyên liệu bắt buộc: ${change.label}.`);
    }
    if (change.from?.catalogVariantId && !change.to?.catalogVariantId) {
      add("CATALOG_LINK_REMOVED", "high", `Nguyên liệu ${change.label} không còn liên kết SKU Catalog.`);
    }
    if (change.changedFields.includes("quantity") || change.changedFields.includes("unit")) {
      add("DOSING_CHANGED", "warning", `Định lượng hoặc đơn vị của ${change.label} đã thay đổi.`);
    }
    if (change.changedFields.includes("catalogVariantId")) {
      add("SKU_CHANGED", "warning", `SKU của nguyên liệu ${change.label} đã thay đổi.`);
    }
  }

  for (const change of stepChanges) {
    const text = `${change.label} ${change.from?.content || ""} ${change.to?.content || ""}`;
    if (change.kind === "removed") {
      add(
        QC_PATTERN.test(text) ? "QC_STEP_REMOVED" : "STEP_REMOVED",
        QC_PATTERN.test(text) ? "high" : "warning",
        `Đã xóa bước: ${change.label}.`,
      );
    } else if (change.changedFields.includes("content") && QC_PATTERN.test(text)) {
      add("QC_STEP_CHANGED", "warning", `Nội dung kiểm soát chất lượng ở ${change.label} đã thay đổi.`);
    }
  }

  if (fromCost.costPerYield !== null && toCost.costPerYield !== null && fromCost.costPerYield > 0) {
    const percent = ((toCost.costPerYield - fromCost.costPerYield) / fromCost.costPerYield) * 100;
    if (percent >= 10) add("COST_INCREASE_HIGH", "high", `Cost trên yield tăng ${roundMoney(percent)}% theo giá Catalog hiện tại.`);
    else if (percent > 0) add("COST_INCREASE", "warning", `Cost trên yield tăng ${roundMoney(percent)}% theo giá Catalog hiện tại.`);
    else if (percent <= -10) add("COST_DECREASE", "info", `Cost trên yield giảm ${roundMoney(Math.abs(percent))}% theo giá Catalog hiện tại.`);
  } else if (fromCost.status !== "ready" || toCost.status !== "ready") {
    add("COST_INCOMPLETE", "warning", "Chưa đủ dữ liệu Catalog để tính cost hoàn chỉnh cho cả hai phiên bản.");
  }

  const rank: Record<RiskSeverity, number> = { high: 0, warning: 1, info: 2 };
  return risks.sort((left, right) => rank[left.severity] - rank[right.severity]);
}

function readPrompt(value: unknown): string {
  const fallback = "Phân tích thay đổi giữa hai Recipe Version. Nêu thay đổi quan trọng, tác động đến cost, chất lượng, thao tác vận hành và các điểm cần kiểm tra trước khi duyệt.";
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || value.trim().length < 3 || value.trim().length > 4000) {
    throw new OrderEngineError("RECIPE_VERSION_ANALYSIS_PROMPT_INVALID", 400, "prompt must contain 3 to 4000 characters.");
  }
  return value.trim();
}

async function loadComparison(
  recipeId: string,
  fromVersionId: string,
  toVersionId: string,
  db: Pool,
): Promise<RecipeVersionComparison> {
  if (fromVersionId === toVersionId) {
    throw new OrderEngineError("RECIPE_VERSION_COMPARE_SAME_VERSION", 400, "Choose two different Recipe Versions.");
  }
  const result = await db.query<VersionRow>(
    `SELECT
       version.id::text,
       version.recipe_id::text AS "recipeId",
       recipe.title AS "recipeTitle",
       version.version_no AS "versionNo",
       version.workflow_status AS "workflowStatus",
       version.change_note AS "changeNote",
       version.created_at::text AS "createdAt",
       version.snapshot
     FROM recipe_versions version
     JOIN recipes recipe ON recipe.id = version.recipe_id
     WHERE version.recipe_id = $1
       AND version.id = ANY($2::uuid[])`,
    [recipeId, [fromVersionId, toVersionId]],
  );
  const rows = new Map(result.rows.map((row) => [row.id, row]));
  const fromVersion = rows.get(fromVersionId);
  const toVersion = rows.get(toVersionId);
  if (!fromVersion || !toVersion) {
    throw new OrderEngineError("RECIPE_VERSION_NOT_FOUND", 404, "One or both Recipe Versions were not found for this recipe.");
  }

  const fromSnapshot = normalizeSnapshot(fromVersion.snapshot, fromVersion.recipeTitle);
  const toSnapshot = normalizeSnapshot(toVersion.snapshot, toVersion.recipeTitle);
  const variantIds = [...new Set([
    ...fromSnapshot.ingredients.flatMap((item) => item.catalogVariantId ? [item.catalogVariantId] : []),
    ...toSnapshot.ingredients.flatMap((item) => item.catalogVariantId ? [item.catalogVariantId] : []),
  ])];
  const catalogRows = await loadCatalogCostRows(db, variantIds);
  const fromCost = buildSnapshotCost(fromVersion, fromSnapshot, catalogRows);
  const toCost = buildSnapshotCost(toVersion, toSnapshot, catalogRows);
  const metadataChanges = compareMetadata(fromSnapshot, toSnapshot);
  const ingredientChanges = compareIngredients(fromSnapshot.ingredients, toSnapshot.ingredients);
  const stepChanges = compareSteps(fromSnapshot.steps, toSnapshot.steps);
  const risks = buildRisks(metadataChanges, ingredientChanges, stepChanges, fromCost, toCost);
  const costPerYieldDelta = fromCost.costPerYield !== null && toCost.costPerYield !== null
    ? roundMoney(toCost.costPerYield - fromCost.costPerYield)
    : null;
  const percentDelta = fromCost.costPerYield !== null && toCost.costPerYield !== null && fromCost.costPerYield > 0
    ? roundMoney(((toCost.costPerYield - fromCost.costPerYield) / fromCost.costPerYield) * 100)
    : null;

  const stripVersion = (version: VersionRow) => ({
    id: version.id,
    versionNo: version.versionNo,
    workflowStatus: version.workflowStatus,
    changeNote: version.changeNote,
    createdAt: version.createdAt,
  });

  return {
    schemaVersion: "recipe-version-compare-v1",
    generatedAt: new Date().toISOString(),
    pricingBasis: "current_catalog_prices",
    recipe: { id: recipeId, title: toSnapshot.title || fromSnapshot.title },
    fromVersion: stripVersion(fromVersion),
    toVersion: stripVersion(toVersion),
    summary: {
      metadataChangeCount: metadataChanges.length,
      ingredientAddedCount: ingredientChanges.filter((change) => change.kind === "added").length,
      ingredientRemovedCount: ingredientChanges.filter((change) => change.kind === "removed").length,
      ingredientModifiedCount: ingredientChanges.filter((change) => change.kind === "modified" || change.kind === "moved").length,
      stepAddedCount: stepChanges.filter((change) => change.kind === "added").length,
      stepRemovedCount: stepChanges.filter((change) => change.kind === "removed").length,
      stepModifiedCount: stepChanges.filter((change) => change.kind === "modified" || change.kind === "moved").length,
      highRiskCount: risks.filter((risk) => risk.severity === "high").length,
      warningCount: risks.filter((risk) => risk.severity === "warning").length,
    },
    metadataChanges,
    ingredientChanges,
    stepChanges,
    cost: {
      from: fromCost,
      to: toCost,
      knownMandatoryCostDelta: roundMoney(toCost.knownMandatoryCost - fromCost.knownMandatoryCost),
      costPerYieldDelta,
      percentDelta,
    },
    risks,
  };
}

export async function compareAdminRecipeVersions(
  identity: StaffIdentity,
  recipeIdValue: unknown,
  input: { fromVersionId?: unknown; toVersionId?: unknown },
  db: Pool = getDb(),
): Promise<RecipeVersionComparison> {
  requireAdmin(identity);
  const recipeId = normalizeUuid(recipeIdValue, "recipeId");
  const fromVersionId = normalizeUuid(input.fromVersionId, "fromVersionId");
  const toVersionId = normalizeUuid(input.toVersionId, "toVersionId");
  return loadComparison(recipeId, fromVersionId, toVersionId, db);
}

export async function enqueueRecipeVersionAnalysis(
  identity: StaffIdentity,
  recipeIdValue: unknown,
  input: { fromVersionId?: unknown; toVersionId?: unknown; prompt?: unknown },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const comparison = await compareAdminRecipeVersions(identity, recipeIdValue, input, db);
  const prompt = readPrompt(input.prompt);
  const result = await db.query<{ id: string }>(
    `INSERT INTO ai_jobs(staff_user_id,job_type,prompt,context_scope,context_data)
     VALUES($1,'read_only',$2,$3,$4::jsonb)
     RETURNING id::text`,
    [
      identity.staffId,
      prompt,
      ["recipes", "catalog", "cost", "recipe_versions"],
      JSON.stringify({
        recipeVersionComparison: comparison,
        policy: {
          readOnly: true,
          pricingBasis: "current_catalog_prices",
          mustStateMissingData: true,
          mustNotInventHistoricalPrices: true,
          mustNotModifyOrPublishRecipe: true,
        },
      }),
    ],
  );
  return { jobId: result.rows[0].id, status: "pending", comparison };
}
