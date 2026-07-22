function normalizedTitle(value) {
  return String(value || "").trim().toLocaleLowerCase("vi-VN");
}

function matchSuggestedRecipeSteps(currentSteps, suggestedSteps) {
  const used = new Set();
  const byTitle = new Map();

  currentSteps.forEach((step, index) => {
    const key = normalizedTitle(step.title);
    if (!key) return;
    const indexes = byTitle.get(key) || [];
    indexes.push(index);
    byTitle.set(key, indexes);
  });

  const matches = suggestedSteps.map((suggestion, suggestionIndex) => {
    const titleKey = normalizedTitle(suggestion.title);
    const titleMatch = titleKey
      ? (byTitle.get(titleKey) || []).find((index) => !used.has(index))
      : undefined;
    const indexMatch = !used.has(suggestionIndex) && currentSteps[suggestionIndex]
      ? suggestionIndex
      : undefined;
    const currentIndex = titleMatch ?? indexMatch;
    if (currentIndex !== undefined) used.add(currentIndex);
    return { suggestionIndex, currentIndex: currentIndex ?? null };
  });

  return { matches, used };
}

/**
 * Build a stable current-versus-proposed view for the SOP comparison dialog.
 */
export function buildSuggestedRecipeStepComparison(currentSteps, suggestedSteps) {
  const { matches } = matchSuggestedRecipeSteps(currentSteps, suggestedSteps);
  return matches.map(({ suggestionIndex, currentIndex }) => ({
    suggestionIndex,
    currentIndex,
    status: currentIndex === null ? "new" : "update",
    currentStep: currentIndex === null ? null : currentSteps[currentIndex],
    suggestedStep: suggestedSteps[suggestionIndex],
  }));
}

/**
 * Merge AI suggested steps into the editor without replacing step identity or media.
 * Exact title matches win; remaining suggestions fall back to the same unused index.
 * Existing unmatched steps are retained so an AI response cannot silently delete content.
 */
export function mergeSuggestedRecipeSteps(currentSteps, suggestedSteps, createEmptyStep) {
  const { matches, used } = matchSuggestedRecipeSteps(currentSteps, suggestedSteps);
  const merged = matches.map(({ suggestionIndex, currentIndex }) => {
    const suggestion = suggestedSteps[suggestionIndex];
    if (currentIndex === null) {
      return {
        ...createEmptyStep(),
        title: suggestion.title,
        content: suggestion.content,
      };
    }
    return {
      ...currentSteps[currentIndex],
      title: suggestion.title,
      content: suggestion.content,
    };
  });

  currentSteps.forEach((step, index) => {
    if (!used.has(index)) merged.push(step);
  });
  return merged;
}

/**
 * Media sync is assignment-only. Null media IDs are omitted so untouched/no-media steps
 * cannot accidentally clear existing mappings through a broad replace operation.
 */
export function buildRecipeStepMediaAssignments(steps) {
  return steps.flatMap((step, index) => step.mediaId
    ? [{ stepNo: index + 1, mediaId: step.mediaId }]
    : []);
}
