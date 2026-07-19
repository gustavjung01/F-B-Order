import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const types = await readFile("apps/frontend/components/admin/recipe-editor/types.ts", "utf8");
const ingredients = await readFile("apps/frontend/components/admin/recipe-editor/RecipeIngredientsTab.tsx", "utf8");
const steps = await readFile("apps/frontend/components/admin/recipe-editor/RecipeStepsTab.tsx", "utf8");
const pickers = await readFile("apps/frontend/components/admin/recipe-editor/RecipePickerDialogs.tsx", "utf8");
const sharedDialog = await readFile("apps/frontend/components/admin/ui/AdminUI.tsx", "utf8");
const catalogService = await readFile("apps/backend/src/modules/recipes/recipe-catalog-options.service.ts", "utf8");
const routes = await readFile("apps/backend/src/modules/recipes/recipe-admin.routes.ts", "utf8");

assert.match(page, /AdminRecipeOperationsPanelV5/);
assert.match(types, /export const UNIT_OPTIONS/);
for (const unit of ["g", "kg", "ml", "l", "piece", "portion", "pack"]) assert.ok(types.includes(`["${unit}"`) || types.includes(`["${unit}"`), `Unit is missing: ${unit}`);
assert.match(ingredients, /Chọn sản phẩm\/SKU từ catalog/);
assert.match(ingredients, /item\.imageUrl/);
assert.match(steps, /Chọn từ media/);
assert.match(pickers, /RecipeCatalogPickerDialog/);
assert.match(pickers, /RecipeMediaPickerDialog/);
assert.match(pickers, /AdminDialog/);
assert.doesNotMatch(pickers, /fixed inset-0 z-\[75\]/);
assert.match(sharedDialog, /role="dialog"/);
assert.match(sharedDialog, /aria-modal="true"/);
assert.match(pickers, /<img src=\{option\.imageUrl\}/);
assert.match(pickers, /<img src=\{item\.thumbnailUrl \|\| item\.imageUrl\}/);
assert.match(pickers, /Không dùng ảnh/);
assert.match(pickers, /Sản phẩm chưa có ảnh/);
assert.match(catalogService, /COALESCE\(variant\.image_object_key, product\.cover_image_object_key\)/);
assert.match(catalogService, /imageUrl: assetUrl\(imageObjectKey\)/);
assert.match(routes, /searchRecipeCatalogOptionsWithImages/);

console.log("Admin Recipe V5 unit, shared catalog dialog, and thumbnail media picker contract passed.");
