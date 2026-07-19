import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const panel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV5.tsx", "utf8");
const types = await readFile("apps/frontend/components/admin/recipe-editor/types.ts", "utf8");
const chrome = await readFile("apps/frontend/components/admin/recipe-editor/RecipeEditorChrome.tsx", "utf8");
const overview = await readFile("apps/frontend/components/admin/recipe-editor/RecipeOverviewTab.tsx", "utf8");
const ingredients = await readFile("apps/frontend/components/admin/recipe-editor/RecipeIngredientsTab.tsx", "utf8");
const steps = await readFile("apps/frontend/components/admin/recipe-editor/RecipeStepsTab.tsx", "utf8");
const publish = await readFile("apps/frontend/components/admin/recipe-editor/RecipePublishTab.tsx", "utf8");
const pickers = await readFile("apps/frontend/components/admin/recipe-editor/RecipePickerDialogs.tsx", "utf8");

assert.match(page, /AdminRecipeOperationsPanelV5/);
for (const component of ["RecipeOverviewTab", "RecipeIngredientsTab", "RecipeStepsTab", "RecipePublishTab", "RecipeEditorFooter", "RecipeCatalogPickerDialog", "RecipeMediaPickerDialog"]) {
  assert.ok(panel.includes(component), `V5 orchestrator is missing ${component}`);
}
assert.ok(panel.split("\n").length < 650, "Recipe V5 orchestrator must stay below 650 lines.");
assert.doesNotMatch(panel, /<section className="mt-4 rounded-\[24px\][\s\S]{5000}/, "Large tab JSX must not be embedded back into the orchestrator.");

for (const tab of ["Tổng quan", "Nguyên liệu", "Các bước", "Xuất bản"]) assert.ok(chrome.includes(tab), `Recipe tab is missing: ${tab}`);
assert.match(chrome, /role="progressbar"/);
assert.match(chrome, /RecipeUndoToast/);
assert.match(types, /createClientId\("ingredient"\)/);
assert.match(types, /createClientId\("step"\)/);
assert.match(types, /function completionItems/);
assert.match(types, /function moveItem/);
assert.match(overview, /Ảnh bìa/);
assert.match(ingredients, /draggable=\{!locked\}/);
assert.match(ingredients, /onDrop=/);
assert.match(steps, /draggable=\{!locked\}/);
assert.match(steps, /Chọn từ media/);
assert.match(pickers, /role="dialog"/);
assert.match(pickers, /Catalog picker/);
assert.match(pickers, /Media picker/);
assert.match(pickers, /thumbnailUrl \|\| item\.imageUrl/);
assert.match(publish, /Workflow hiện tại/);
assert.match(publish, /Gửi review/);
assert.match(publish, /Yêu cầu chỉnh sửa/);
assert.match(publish, /Duyệt phiên bản/);
assert.match(publish, /Xuất bản/);
assert.match(panel, /steps: form\.steps/);
assert.match(panel, /imageUrl: item\.imageUrl/);

console.log("Admin Recipe V5 component, tabs, picker, reorder, undo, completion, and workflow footer contract passed.");
