import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildRecipeStepMediaAssignments,
  buildSuggestedRecipeStepComparison,
  mergeSuggestedRecipeSteps,
} from "../../apps/frontend/components/admin/recipe-editor/recipe-step-merge.mjs";

function emptyStep() {
  return {
    clientId: "new-step",
    title: "",
    content: "",
    imageUrl: "",
    thumbnailUrl: "",
    mediaId: null,
  };
}

test("AI SOP merge preserves existing image URLs, thumbnail URLs and media IDs", () => {
  const current = [
    {
      clientId: "step-a",
      title: "Ủ trà",
      content: "Nội dung cũ",
      imageUrl: "https://cdn.bepsi.click/recipes/a.webp",
      thumbnailUrl: "https://cdn.bepsi.click/recipes/a-thumb.webp",
      mediaId: "11111111-1111-4111-8111-111111111111",
    },
    {
      clientId: "step-b",
      title: "Hoàn thiện",
      content: "Nội dung cũ 2",
      imageUrl: "https://cdn.bepsi.click/recipes/b.webp",
      thumbnailUrl: "https://cdn.bepsi.click/recipes/b-thumb.webp",
      mediaId: "22222222-2222-4222-8222-222222222222",
    },
  ];

  const merged = mergeSuggestedRecipeSteps(
    current,
    [
      { title: "Ủ trà", content: "Ủ 12 phút ở 92°C." },
      { title: "Hoàn thiện", content: "Kiểm tra màu, mùi và định lượng." },
      { title: "QC", content: "Loại bỏ mẻ không đạt." },
    ],
    emptyStep,
  );

  assert.equal(merged[0].clientId, current[0].clientId);
  assert.equal(merged[0].imageUrl, current[0].imageUrl);
  assert.equal(merged[0].thumbnailUrl, current[0].thumbnailUrl);
  assert.equal(merged[0].mediaId, current[0].mediaId);
  assert.equal(merged[1].clientId, current[1].clientId);
  assert.equal(merged[1].mediaId, current[1].mediaId);
  assert.equal(merged[2].mediaId, null);
});

test("AI SOP comparison maps existing steps before the user confirms a merge", () => {
  const current = [
    { ...emptyStep(), clientId: "one", title: "Ủ trà", content: "Cũ", mediaId: "33333333-3333-4333-8333-333333333333" },
    { ...emptyStep(), clientId: "two", title: "Hoàn thiện", content: "Cũ 2" },
  ];
  const comparison = buildSuggestedRecipeStepComparison(current, [
    { title: "Ủ trà", content: "Mới" },
    { title: "QC", content: "Bước mới" },
  ]);

  assert.equal(comparison[0].status, "update");
  assert.equal(comparison[0].currentStep.mediaId, current[0].mediaId);
  assert.equal(comparison[1].status, "update");
  assert.equal(comparison[1].currentIndex, 1);
});

test("AI SOP merge retains unmatched existing steps instead of silently deleting them", () => {
  const current = [
    { ...emptyStep(), clientId: "one", title: "Bước một", content: "A" },
    {
      ...emptyStep(),
      clientId: "two",
      title: "Bước cần giữ",
      content: "B",
      mediaId: "33333333-3333-4333-8333-333333333333",
      imageUrl: "https://cdn.bepsi.click/recipes/c.webp",
    },
  ];

  const merged = mergeSuggestedRecipeSteps(current, [{ title: "Bước một", content: "A mới" }], emptyStep);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].clientId, "two");
  assert.equal(merged[1].mediaId, current[1].mediaId);
});

test("media sync payload never emits null media IDs", () => {
  const assignments = buildRecipeStepMediaAssignments([
    { ...emptyStep(), clientId: "a", mediaId: "44444444-4444-4444-8444-444444444444" },
    { ...emptyStep(), clientId: "b", mediaId: null },
    { ...emptyStep(), clientId: "c", mediaId: "55555555-5555-4555-8555-555555555555" },
  ]);

  assert.deepEqual(assignments, [
    { stepNo: 1, mediaId: "44444444-4444-4444-8444-444444444444" },
    { stepNo: 3, mediaId: "55555555-5555-4555-8555-555555555555" },
  ]);
  assert.equal(assignments.some((item) => item.mediaId === null), false);
});

test("Recipe and AI admin surfaces stay permission-aware", async () => {
  const [recipePanel, footer, nav, aiConsole] = await Promise.all([
    readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV5.tsx", "utf8"),
    readFile("apps/frontend/components/admin/recipe-editor/RecipePublishTab.tsx", "utf8"),
    readFile("apps/frontend/components/admin/AdminModuleNav.tsx", "utf8"),
    readFile("apps/frontend/components/admin/AdminAiConsole.tsx", "utf8"),
  ]);

  for (const permission of ["recipes.view", "recipes.edit", "recipes.review", "recipes.publish", "recipes.media.manage"]) {
    assert.match(`${recipePanel}\n${footer}`, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(nav, /href: "\/admin\/ai"/);
  assert.match(nav, /ai\.use/);
  assert.doesNotMatch(aiConsole, /scopes:\s*\["orders",\s*"customers",\s*"catalog",\s*"recipes"\]/);
});

test("AI SOP UI stays inside the Steps tab, uses AdminUI and never exposes raw JSON blocks", async () => {
  const [panel, stepsTab, aiConsole, readableResult] = await Promise.all([
    readFile("apps/frontend/components/admin/recipe-editor/RecipeAiAssistantPanel.tsx", "utf8"),
    readFile("apps/frontend/components/admin/recipe-editor/RecipeStepsTab.tsx", "utf8"),
    readFile("apps/frontend/components/admin/AdminAiConsole.tsx", "utf8"),
    readFile("apps/frontend/components/admin/ai/AiReadableResult.tsx", "utf8"),
  ]);

  assert.match(stepsTab, /data-recipe-steps-tab="true"/);
  assert.match(panel, /recipe-ai-sop-slot/);
  assert.match(panel, /:has\(> \.recipe-ai-sop-slot \+ \[data-recipe-steps-tab/);
  for (const primitive of ["AdminSurface", "AdminSurfaceHeader", "AdminSurfaceBody", "AdminButton", "AdminBadge", "AdminAlert", "AdminDialog"]) {
    assert.match(panel, new RegExp(primitive));
    assert.match(aiConsole, new RegExp(primitive === "AdminDialog" ? "AdminField" : primitive));
  }
  assert.match(panel, /buildSuggestedRecipeStepComparison/);
  assert.match(panel, /So sánh trước khi áp dụng/);
  assert.match(panel, /comparisonConfirmed/);
  assert.doesNotMatch(panel, /<pre\b/);
  assert.doesNotMatch(aiConsole, /<pre\b/);
  assert.doesNotMatch(readableResult, /<pre\b/);
  assert.doesNotMatch(panel, /APPLY_SOP_ENABLED/);
});
