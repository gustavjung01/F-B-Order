import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanel.tsx", "utf8");
const page = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const catalogService = await readFile("apps/backend/src/modules/recipes/recipe-catalog-options.service.ts", "utf8");
const routes = await readFile("apps/backend/src/modules/recipes/recipe-admin.routes.ts", "utf8");

assert.match(page, /AdminRecipeOperationsPanel/);
assert.doesNotMatch(page, /AdminRecipesPanel[^A-Za-z]/);

assert.match(panel, /const UNIT_OPTIONS = \[/);
for (const unit of ["g", "kg", "ml", "l", "piece", "portion", "pack"]) {
  assert.match(panel, new RegExp(`value: "${unit}"`));
}
assert.match(panel, /function UnitSelect/);
assert.match(panel, /label="Đơn vị yield"/);
assert.match(panel, /label="Đơn vị"/);
assert.doesNotMatch(panel, /placeholder="Đơn vị"/);

assert.match(panel, /Dùng làm ảnh bìa/);
assert.match(panel, /Ảnh minh họa/);
assert.match(panel, /ingredientImages\.map/);
assert.match(panel, /<img src=\{option\.imageUrl\}/);
assert.match(panel, /<summary className="cursor-pointer text-sm font-black">URL ảnh nâng cao<\/summary>/);
assert.match(panel, /<summary className="cursor-pointer text-xs font-black">URL ảnh nâng cao<\/summary>/);
assert.doesNotMatch(panel, /type="file"/);
assert.doesNotMatch(panel, /data:image\//);

assert.match(catalogService, /COALESCE\(variant\.image_object_key, product\.cover_image_object_key\)/);
assert.match(catalogService, /imageUrl: assetUrl\(imageObjectKey\)/);
assert.match(routes, /searchRecipeCatalogOptionsWithImages/);

console.log("Admin Recipe unit and image picker contract passed.");
