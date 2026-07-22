import type { Step } from "./types";

export type SuggestedRecipeStep = {
  title: string;
  content: string;
};

export function mergeSuggestedRecipeSteps(
  currentSteps: Step[],
  suggestedSteps: SuggestedRecipeStep[],
  createEmptyStep: () => Step,
): Step[];

export function buildRecipeStepMediaAssignments(
  steps: Step[],
): Array<{ stepNo: number; mediaId: string }>;
