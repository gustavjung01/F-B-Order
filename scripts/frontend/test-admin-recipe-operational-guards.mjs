import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const panel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV4.tsx", "utf8");

assert.match(page, /AdminRecipeOperationsPanelV4/);
assert.doesNotMatch(page, /AdminRecipeSaveFeedback/);

for (const required of [
  "z-[80]",
  "role={toast.kind === \"error\" ? \"alert\" : \"status\"}",
  "beforeunload",
  "Công thức có thay đổi chưa lưu",
  "function validationErrors",
  "Cần ít nhất một nguyên liệu liên kết SKU",
  "Nhận xét là bắt buộc khi yêu cầu chỉnh sửa.",
  "Không tải được ảnh catalog",
  "Record<string, UploadPhase>",
  "Phải lưu các thay đổi trước khi thao tác workflow.",
  "disabled={saving || uploading}",
]) {
  assert.ok(panel.includes(required), `Operational guard is missing in V4: ${required}`);
}

assert.match(panel, /const dirty = useMemo/);
assert.match(panel, /if \(dirty && !window\.confirm/);
assert.match(panel, /validationErrors\(form, true\)/);
assert.match(panel, /setCatalogErrors/);
assert.match(panel, /setToast\(\{ kind: "success"/);
assert.match(panel, /setToast\(\{ kind: "error"/);

console.log("Admin Recipe V4 operational guards contract passed.");
