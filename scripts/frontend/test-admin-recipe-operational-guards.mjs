import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const panel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV5.tsx", "utf8");
const types = await readFile("apps/frontend/components/admin/recipe-editor/types.ts", "utf8");
const publish = await readFile("apps/frontend/components/admin/recipe-editor/RecipePublishTab.tsx", "utf8");
const pickers = await readFile("apps/frontend/components/admin/recipe-editor/RecipePickerDialogs.tsx", "utf8");

assert.match(page, /AdminRecipeOperationsPanelV5/);
assert.doesNotMatch(page, /AdminRecipeSaveFeedback/);

for (const required of [
  "z-[80]",
  "role={toast.kind === \"error\" ? \"alert\" : \"status\"}",
  "beforeunload",
  "Công thức có thay đổi chưa lưu",
  "validationErrors(form)",
  "validationErrors(form, true)",
  "Nhận xét là bắt buộc khi yêu cầu chỉnh sửa.",
  "Không tải được ảnh catalog",
  "Record<string, UploadPhase>",
  "Phải lưu các thay đổi trước khi thao tác workflow.",
  "disabled={saving || uploading}",
]) {
  assert.ok(panel.includes(required), `Operational guard is missing in V5: ${required}`);
}

assert.match(panel, /const dirty = useMemo/);
assert.match(panel, /if \(dirty && !window\.confirm/);
assert.match(panel, /showValidation/);
assert.match(panel, /setToast\(\{ kind: "success"/);
assert.match(panel, /setToast\(\{ kind: "error"/);
assert.match(types, /Cần ít nhất một nguyên liệu liên kết SKU/);
assert.match(pickers, /setError\(cause instanceof Error/);
assert.match(publish, /disabled=\{!workflowReady/);
assert.match(publish, /reviewInput\.trim\(\)/);

console.log("Admin Recipe V5 dirty guard, validation, picker errors, upload state, and workflow safety contract passed.");
