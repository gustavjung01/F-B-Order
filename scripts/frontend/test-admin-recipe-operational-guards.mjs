import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const panel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV3.tsx", "utf8");

assert.match(page, /AdminRecipeOperationsPanelV3/);
assert.doesNotMatch(page, /AdminRecipeSaveFeedback/);

for (const required of [
  "function EditorToast",
  "z-[70]",
  "editorNotice",
  "Đã lưu bản nháp mới của công thức.",
  "Đã tạo công thức nháp thành công.",
  "function editorSnapshot",
  "beforeunload",
  "Công thức có thay đổi chưa lưu",
  "function validateDraft",
  "function validateForReview",
  "Cần ít nhất một nguyên liệu liên kết đúng SKU catalog",
  "Phải nhập nhận xét khi yêu cầu chỉnh sửa.",
  "catalogImageError",
  "Tải lại ảnh catalog",
  "Không tải được ảnh catalog",
  "Record<string, UploadState>",
  "verifyPublicImage",
]) {
  assert.ok(panel.includes(required), `Operational guard is missing: ${required}`);
}

assert.doesNotMatch(
  panel,
  /async function hydrateCatalogImages[\s\S]{0,1800}?catch\s*\{[\s\S]{0,200}?return nextForm/,
  "Catalog media failures must not be swallowed.",
);
assert.match(panel, /setCatalogImageError\(hydrated\.error\)/);
assert.match(panel, /showEditorErrors\(errors/);
assert.match(panel, /validateForReview\(form, isDirty\)/);
assert.match(panel, /disabled=\{saving \|\| hasActiveUpload\}/);
assert.match(panel, /role=\{notice\.kind === "error" \? "alert" : "status"\}/);

console.log("Admin Recipe operational guards contract passed.");
