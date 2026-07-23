export type AiRecipeDraftStatus = "draft" | "approved" | "rejected" | "applied" | "archived";
export type RecipeDraftTask = "sop" | "qc" | "dosing";
export type RecipeDraftDisplayKind = RecipeDraftTask | "rd";

export type RecipeSopBaseStep = {
  stepNo: number;
  title: string;
  content: string;
  imageUrl: string | null;
};

export type RecipeSopProposalStep = {
  id: string;
  title: string;
  content: string;
  currentStepNo: number | null;
};

export type RecipeSopDraftContent = {
  schemaVersion: 1;
  kind: "recipe_sop";
  task?: RecipeDraftTask;
  targetRecipeId: string;
  baseRecipeVersionId: string;
  baseSteps: RecipeSopBaseStep[];
  proposal: { steps: RecipeSopProposalStep[] };
};

export type RecipeRdConstraintResult = {
  key: string;
  status: "met" | "failed" | "unverifiable";
  message: string;
};

export type RecipeRdDraftContent = {
  schemaVersion: 1;
  kind: "recipe_rd";
  rdRequestId: string;
  targetRecipeId: string;
  baseRecipeVersionId: string;
  objective: string;
  constraints: {
    maxCostPerYield?: number | null;
    preserveYield?: boolean;
    useAvailableInventoryOnly?: boolean;
    maxIngredientCount?: number | null;
  };
  base: {
    versionNo: number;
    yieldQuantity: string | number | null;
    yieldUnit: string | null;
    ingredientCount: number;
    stepCount: number;
    cost: RecipeRdCostPreview;
  };
  proposal: {
    title: string;
    rationale: string;
    yieldQuantity: number;
    yieldUnit: string;
    ingredients: Array<{
      productName: string;
      quantity: number;
      unit: string;
      optional: boolean;
      note: string | null;
      catalogVariantId: string;
      catalogProductId: string;
      catalogSnapshot: { sku: string; productName: string; variantName: string };
    }>;
    steps: Array<{ title: string; content: string; imageUrl: null }>;
    expectedEffects: string[];
    risks: string[];
    testPlan: Array<{ metric: string; target: string; method: string }>;
  };
  evaluation: {
    pricingBasis: "current_catalog_prices";
    cost: RecipeRdCostPreview;
    costPerYieldDelta: number | null;
    costPercentDelta: number | null;
    constraints: RecipeRdConstraintResult[];
    allRequiredConstraintsMet: boolean;
    inventory: Array<{
      variantId: string;
      sku: string;
      availableQuantity: number;
      status: "available" | "unavailable" | "unknown";
    }>;
    capacity: {
      status: "base_profile_available" | "revalidation_required" | "unavailable";
      message: string;
    };
    changes: {
      yieldChanged: boolean;
      ingredientsAdded: number;
      ingredientsRemoved: number;
      ingredientsModified: number;
      stepsChanged: boolean;
    };
    warnings: Array<{ code: string; severity: "info" | "warning" | "high"; message: string }>;
  };
};

export type RecipeRdCostPreview = {
  status: "ready" | "partial" | "unavailable";
  knownMandatoryCost: number;
  totalWithOptional: number;
  costPerYield: number | null;
  missingMandatoryCount: number;
  lines?: Array<{
    productName: string;
    quantity: number | null;
    unit: string | null;
    status: string;
    lineCost: number | null;
  }>;
};

export type AiRecipeDraft = {
  id: string;
  createdByStaffId: string;
  createdByName: string | null;
  draftType: "recipe" | "customer_reply" | "catalog_copy" | "operations_note";
  title: string;
  content: RecipeSopDraftContent | RecipeRdDraftContent;
  status: AiRecipeDraftStatus;
  targetRecipeId: string | null;
  baseRecipeVersionId: string | null;
  reviewedByStaffId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  appliedByStaffId: string | null;
  appliedByName: string | null;
  appliedAt: string | null;
  appliedRecipeVersionId: string | null;
  appliedRecipeVersionNo: number | null;
  applicationData: {
    selectedStepIds?: string[];
    selectedStepCount?: number;
    kind?: string;
    rdRequestId?: string;
  };
  recipeTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

export const recipeDraftTaskLabel: Record<RecipeDraftDisplayKind, string> = {
  sop: "SOP pha chế",
  qc: "Kiểm soát chất lượng",
  dosing: "Chuẩn hóa định lượng",
  rd: "R&D công thức",
};

export const aiRecipeDraftStatusLabel: Record<AiRecipeDraftStatus, string> = {
  draft: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
  applied: "Đã áp dụng",
  archived: "Đã lưu trữ",
};

export function aiRecipeDraftStatusTone(status: AiRecipeDraftStatus): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "approved" || status === "applied") return "success";
  if (status === "rejected") return "danger";
  if (status === "draft") return "warning";
  return "neutral";
}

export function isRecipeSopDraftContent(value: unknown): value is RecipeSopDraftContent {
  if (!value || typeof value !== "object") return false;
  const content = value as Partial<RecipeSopDraftContent>;
  return content.schemaVersion === 1
    && content.kind === "recipe_sop"
    && (content.task === undefined || ["sop", "qc", "dosing"].includes(content.task))
    && typeof content.targetRecipeId === "string"
    && typeof content.baseRecipeVersionId === "string"
    && Array.isArray(content.baseSteps)
    && Boolean(content.proposal && Array.isArray(content.proposal.steps));
}

export function isRecipeRdDraftContent(value: unknown): value is RecipeRdDraftContent {
  if (!value || typeof value !== "object") return false;
  const content = value as Partial<RecipeRdDraftContent>;
  return content.schemaVersion === 1
    && content.kind === "recipe_rd"
    && typeof content.rdRequestId === "string"
    && typeof content.targetRecipeId === "string"
    && typeof content.baseRecipeVersionId === "string"
    && Boolean(content.proposal && Array.isArray(content.proposal.ingredients) && Array.isArray(content.proposal.steps))
    && Boolean(content.evaluation && Array.isArray(content.evaluation.constraints));
}
