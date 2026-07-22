export type AiRecipeDraftStatus = "draft" | "approved" | "rejected" | "applied" | "archived";

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
  targetRecipeId: string;
  baseRecipeVersionId: string;
  baseSteps: RecipeSopBaseStep[];
  proposal: { steps: RecipeSopProposalStep[] };
};

export type AiRecipeDraft = {
  id: string;
  createdByStaffId: string;
  createdByName: string | null;
  draftType: "recipe" | "customer_reply" | "catalog_copy" | "operations_note";
  title: string;
  content: RecipeSopDraftContent;
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
  };
  recipeTitle: string | null;
  createdAt: string;
  updatedAt: string;
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
    && typeof content.targetRecipeId === "string"
    && typeof content.baseRecipeVersionId === "string"
    && Array.isArray(content.baseSteps)
    && Boolean(content.proposal && Array.isArray(content.proposal.steps));
}
