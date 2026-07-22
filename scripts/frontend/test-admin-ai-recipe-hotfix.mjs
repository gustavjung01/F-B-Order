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

test("AI SOP comparison maps existing steps before review", () => {
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
  const [recipePanel, footer, nav, aiConsole, permissions] = await Promise.all([
    readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV5.tsx", "utf8"),
    readFile("apps/frontend/components/admin/recipe-editor/RecipePublishTab.tsx", "utf8"),
    readFile("apps/frontend/components/admin/AdminModuleNav.tsx", "utf8"),
    readFile("apps/frontend/components/admin/AdminAiConsole.tsx", "utf8"),
    readFile("apps/frontend/lib/admin-permissions.ts", "utf8"),
  ]);

  for (const permission of ["recipes.view", "recipes.edit", "recipes.review", "recipes.publish", "recipes.media.manage"]) {
    assert.match(`${recipePanel}\n${footer}`, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(nav, /href: "\/admin\/ai"/);
  assert.match(nav, /ai\.approve/);
  assert.match(permissions, /"ai\.approve"/);
  assert.doesNotMatch(aiConsole, /scopes:\s*\["orders",\s*"customers",\s*"catalog",\s*"recipes"\]/);
});

test("Recipe AI panel stays in Steps and applies only reviewed persisted drafts", async () => {
  const [panel, stepsTab, reviewQueue, diff, aiPage, routes] = await Promise.all([
    readFile("apps/frontend/components/admin/recipe-editor/RecipeAiAssistantPanel.tsx", "utf8"),
    readFile("apps/frontend/components/admin/recipe-editor/RecipeStepsTab.tsx", "utf8"),
    readFile("apps/frontend/components/admin/ai/AiRecipeDraftReviewQueue.tsx", "utf8"),
    readFile("apps/frontend/components/admin/ai/AiRecipeDraftDiff.tsx", "utf8"),
    readFile("apps/frontend/app/admin/ai/page.tsx", "utf8"),
    readFile("apps/backend/src/modules/ai/ai.routes.ts", "utf8"),
  ]);

  assert.match(stepsTab, /data-recipe-steps-tab="true"/);
  assert.match(panel, /recipe-ai-sop-slot/);
  assert.match(panel, /:has\(> \.recipe-ai-sop-slot \+ \[data-recipe-steps-tab/);
  assert.match(panel, /draft\.status !== "approved"/);
  assert.match(panel, /selectedStepIds/);
  assert.match(panel, /\/api\/admin\/ai\/drafts\/\$\{draft\.id\}\/apply/);
  assert.match(panel, /Tạo Recipe version mới/);
  assert.doesNotMatch(panel, /onApplySteps\(suggestedSteps\)/);

  assert.match(reviewQueue, /has\("ai\.approve"\)/);
  assert.match(reviewQueue, /review\("approve"\)/);
  assert.match(reviewQueue, /review\("reject"\)/);
  assert.match(reviewQueue, /AiRecipeDraftDiff/);
  assert.match(diff, /AdminToggle/);
  assert.match(aiPage, /AiRecipeDraftReviewQueue/);

  assert.match(routes, /requirePermission\(identity, "ai\.approve"\)/);
  assert.match(routes, /selectedStepIds/);
  assert.match(routes, /listAiDraftReviewQueue\(identity\)/);
});

test("AI user-facing surfaces use AdminUI and never expose raw JSON blocks", async () => {
  const [panel, aiConsole, readableResult, reviewQueue, diff] = await Promise.all([
    readFile("apps/frontend/components/admin/recipe-editor/RecipeAiAssistantPanel.tsx", "utf8"),
    readFile("apps/frontend/components/admin/AdminAiConsole.tsx", "utf8"),
    readFile("apps/frontend/components/admin/ai/AiReadableResult.tsx", "utf8"),
    readFile("apps/frontend/components/admin/ai/AiRecipeDraftReviewQueue.tsx", "utf8"),
    readFile("apps/frontend/components/admin/ai/AiRecipeDraftDiff.tsx", "utf8"),
  ]);

  for (const primitive of ["AdminSurface", "AdminSurfaceHeader", "AdminSurfaceBody", "AdminButton", "AdminBadge", "AdminAlert", "AdminDialog"]) {
    assert.match(panel, new RegExp(primitive));
  }
  for (const source of [panel, aiConsole, readableResult, reviewQueue, diff]) {
    assert.doesNotMatch(source, /<pre\b/);
  }
  assert.match(reviewQueue, /AdminDialog/);
  assert.match(diff, /Hiện tại/);
  assert.match(diff, /AI đề xuất/);
});
