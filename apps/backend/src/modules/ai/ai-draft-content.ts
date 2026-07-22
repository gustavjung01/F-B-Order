import { z } from "zod";
import { OrderEngineError } from "../orders/order-errors.js";

const recipeDraftTaskSchema = z.enum(["sop", "qc", "dosing"]);

const generatedStepSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(10000),
});

const generatedResponseSchema = z.object({
  task: recipeDraftTaskSchema.default("sop"),
  steps: z.array(generatedStepSchema).min(1).max(100),
});

const contextRecipeStepSchema = z.object({
  stepNo: z.coerce.number().int().positive(),
  title: z.string().nullable().optional(),
  content: z.string(),
  imageUrl: z.string().nullable().optional(),
});

const recipeContextSchema = z.object({
  recipe: z.object({
    id: z.string().uuid(),
    currentVersionId: z.string().uuid(),
    steps: z.array(contextRecipeStepSchema).max(100),
  }),
});

const recipeSopDraftContentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("recipe_sop"),
  task: recipeDraftTaskSchema.default("sop"),
  targetRecipeId: z.string().uuid(),
  baseRecipeVersionId: z.string().uuid(),
  baseSteps: z.array(z.object({
    stepNo: z.number().int().positive(),
    title: z.string(),
    content: z.string(),
    imageUrl: z.string().nullable(),
  })).max(100),
  proposal: z.object({
    steps: z.array(z.object({
      id: z.string().regex(/^step-\d{3}$/),
      title: z.string().min(1).max(240),
      content: z.string().min(1).max(10000),
      currentStepNo: z.number().int().positive().nullable(),
    })).min(1).max(100),
  }),
});

export type RecipeDraftTask = z.infer<typeof recipeDraftTaskSchema>;
export type RecipeSopDraftContent = z.infer<typeof recipeSopDraftContentSchema>;

function normalizeTitle(value: string | null | undefined): string {
  return String(value || "").trim().toLocaleLowerCase("vi-VN");
}

function stripJsonFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export function parseRecipeSopResponse(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    throw new OrderEngineError(
      "AI_RECIPE_DRAFT_INVALID_JSON",
      422,
      "AI recipe draft must be valid JSON with a steps array.",
    );
  }

  const result = generatedResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new OrderEngineError(
      "AI_RECIPE_DRAFT_INVALID_SHAPE",
      422,
      "AI recipe draft does not contain valid proposed steps.",
      { issues: result.error.flatten() },
    );
  }
  return result.data;
}

export function buildRecipeSopDraftContent(
  generatedText: string,
  contextData: unknown,
): RecipeSopDraftContent {
  const context = recipeContextSchema.safeParse(contextData);
  if (!context.success) {
    throw new OrderEngineError(
      "AI_RECIPE_CONTEXT_INVALID",
      422,
      "Recipe AI context is missing recipe or base version information.",
      { issues: context.error.flatten() },
    );
  }

  const generated = parseRecipeSopResponse(generatedText);
  const baseSteps = [...context.data.recipe.steps]
    .sort((left, right) => left.stepNo - right.stepNo)
    .map((step) => ({
      stepNo: step.stepNo,
      title: step.title?.trim() || "",
      content: step.content,
      imageUrl: step.imageUrl?.trim() || null,
    }));

  const byTitle = new Map<string, number[]>();
  for (const step of baseSteps) {
    const key = normalizeTitle(step.title);
    if (!key) continue;
    const values = byTitle.get(key) || [];
    values.push(step.stepNo);
    byTitle.set(key, values);
  }

  const usedStepNos = new Set<number>();
  const proposalSteps = generated.steps.map((step, index) => {
    const titleMatch = (byTitle.get(normalizeTitle(step.title)) || [])
      .find((stepNo) => !usedStepNos.has(stepNo));
    const sameIndex = baseSteps[index]?.stepNo;
    const indexMatch = generated.task === "sop" && sameIndex && !usedStepNos.has(sameIndex)
      ? sameIndex
      : undefined;
    const currentStepNo = titleMatch ?? indexMatch ?? null;
    if (currentStepNo) usedStepNos.add(currentStepNo);

    return {
      id: `step-${String(index + 1).padStart(3, "0")}`,
      title: step.title,
      content: step.content,
      currentStepNo,
    };
  });

  return {
    schemaVersion: 1,
    kind: "recipe_sop",
    task: generated.task,
    targetRecipeId: context.data.recipe.id,
    baseRecipeVersionId: context.data.recipe.currentVersionId,
    baseSteps,
    proposal: { steps: proposalSteps },
  };
}

export function readRecipeSopDraftContent(value: unknown): RecipeSopDraftContent {
  const parsed = recipeSopDraftContentSchema.safeParse(value);
  if (!parsed.success) {
    throw new OrderEngineError(
      "AI_RECIPE_DRAFT_CONTENT_INVALID",
      409,
      "Stored AI recipe draft content is invalid.",
      { issues: parsed.error.flatten() },
    );
  }

  const matched = parsed.data.proposal.steps
    .flatMap((step) => step.currentStepNo ? [step.currentStepNo] : []);
  if (new Set(matched).size !== matched.length) {
    throw new OrderEngineError(
      "AI_RECIPE_DRAFT_DUPLICATE_TARGET",
      409,
      "AI recipe draft maps more than one proposal to the same current step.",
    );
  }
  return parsed.data;
}
