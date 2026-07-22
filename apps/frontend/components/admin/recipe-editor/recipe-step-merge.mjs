function normalizedTitle(value) {
  return String(value || "").trim().toLocaleLowerCase("vi-VN");
}

/**
 * Merge AI suggested steps into the editor without replacing step identity or media.
 * Exact title matches win; remaining suggestions fall back to the same unused index.
 * Existing unmatched steps are retained so an AI response cannot silently delete content.
 */
export function mergeSuggestedRecipeSteps(currentSteps, suggestedSteps, createEmptyStep) {
  const used = new Set();
  const byTitle = new Map();

  currentSteps.forEach((step, index) => {
    const key = normalizedTitle(step.title);
    if (!key) return;
    const indexes = byTitle.get(key) || [];
    indexes.push(index);
    byTitle.set(key, indexes);
  });

  const merged = suggestedSteps.map((suggestion, suggestionIndex) => {
    const titleKey = normalizedTitle(suggestion.title);
    const titleMatch = titleKey
      ? (byTitle.get(titleKey) || []).find((index) => !used.has(index))
      : undefined;
    const indexMatch = !used.has(suggestionIndex) && currentSteps[suggestionIndex]
      ? suggestionIndex
      : undefined;
    const matchedIndex = titleMatch ?? indexMatch;

    if (matchedIndex === undefined) {
      return {
        ...createEmptyStep(),
        title: suggestion.title,
        content: suggestion.content,
      };
    }

    used.add(matchedIndex);
    return {
      ...currentSteps[matchedIndex],
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
