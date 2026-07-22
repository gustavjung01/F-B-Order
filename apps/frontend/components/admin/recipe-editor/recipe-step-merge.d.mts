import type { Step } from "./types";

export type SuggestedRecipeStep = {
  title: string;
  content: string;
};

export type SuggestedRecipeStepComparison = {
  suggestionIndex: number;
  currentIndex: number | null;
  status: "update" | "new";
  currentStep: Step | null;
  suggestedStep: SuggestedRecipeStep;
};

export function buildSuggestedRecipeStepComparison(
  currentSteps: Step[],
  suggestedSteps: SuggestedRecipeStep[],
): SuggestedRecipeStepComparison[];

export function mergeSuggestedRecipeSteps(
  currentSteps: Step[],
  suggestedSteps: SuggestedRecipeStep[],
  createEmptyStep: () => Step,
): Step[];

export function buildRecipeStepMediaAssignments(
  steps: Step[],
): Array<{ stepNo: number; mediaId: string }>;
