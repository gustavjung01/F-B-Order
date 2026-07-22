import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildRecipeStepMediaAssignments,
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

  const merged = mergeSuggestedRecipeSteps(
    current,
    [{ title: "Bước một", content: "A mới" }],
    emptyStep,
  );

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

test("Apply SOP button remains temporarily disabled", async () => {
  const panel = await readFile(
    "apps/frontend/components/admin/recipe-editor/RecipeAiAssistantPanel.tsx",
    "utf8",
  );
  assert.match(panel, /APPLY_SOP_ENABLED\s*=\s*false/);
});
