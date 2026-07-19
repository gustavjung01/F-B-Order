import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const adminApi = await readFile("apps/frontend/lib/admin-api.ts", "utf8");
const proxyRoute = await readFile("apps/frontend/app/api/backend-admin/[...path]/route.ts", "utf8");
const recipeList = await readFile("apps/backend/src/modules/recipes/recipe-admin-list.service.ts", "utf8");
const migrationPlan = await readFile("apps/backend/scripts/migration-plan.mjs", "utf8");
const customerUtf8Repair = await readFile("db/migrations/015_customer_utf8_repair.sql", "utf8");
const recipeUtf8Repair = await readFile("db/migrations/016_recipe_title_utf8_repair.sql", "utf8");
const recipeYieldCompatibility = await readFile("db/migrations/017_recipe_yield_unit_compatibility.sql", "utf8");
const recipeIngredientCompatibility = await readFile("db/migrations/018_recipe_ingredient_legacy_name.sql", "utf8");
const recipeMediaLifecycle = await readFile("db/migrations/019_recipe_media_lifecycle.sql", "utf8");
const recipePage = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const guardedRecipePanel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV5.tsx", "utf8");
const recipePickers = await readFile("apps/frontend/components/admin/recipe-editor/RecipePickerDialogs.tsx", "utf8");

assert.match(adminApi, /function browserAdminProxyPath/);
assert.match(adminApi, /path === "\/api\/admin"/);
assert.match(adminApi, /path\.startsWith\("\/api\/admin\/"\)/);
assert.match(adminApi, /`\/api\/backend-admin\/\$\{path\.slice\("\/api\/admin\/"\.length\)\}`/);
assert.match(adminApi, /typeof window === "undefined"[\s\S]*`\$\{API_URL\}\$\{path\}`[\s\S]*browserAdminProxyPath\(path\)/);
assert.match(adminApi, /ADMIN_API_SUCCESS_EVENT/);
assert.match(proxyRoute, /`\/api\/admin\/\$\{suffix\}\$\{request\.nextUrl\.search \|\| ""\}`/);
assert.match(proxyRoute, /headers: \{ authorization \}/);
assert.match(proxyRoute, /export const PATCH = proxyAdminRequest/);
assert.match(proxyRoute, /export const DELETE = proxyAdminRequest/);

assert.match(recipeList, /SELECT COUNT\(\*\)::int[\s\S]*FROM recipe_ingredients/);
assert.match(recipeList, /COUNT\(\*\) OVER\(\)::int AS "totalCount"/);
assert.doesNotMatch(recipeList, /GROUP BY/);

for (const migration of ["015_customer_utf8_repair.sql", "016_recipe_title_utf8_repair.sql", "017_recipe_yield_unit_compatibility.sql", "018_recipe_ingredient_legacy_name.sql", "019_recipe_media_lifecycle.sql"]) {
  assert.ok(migrationPlan.includes(migration), `Migration plan is missing ${migration}`);
}
assert.match(customerUtf8Repair, /Trà Sữa Hùng Trà/);
assert.doesNotMatch(recipeUtf8Repair, /UPDATE\s+recipe_versions/i);
assert.match(recipeUtf8Repair, /INSERT INTO recipe_versions/);
assert.doesNotMatch(recipeYieldCompatibility, /UPDATE\s+recipe_versions/i);
assert.match(recipeIngredientCompatibility, /CREATE OR REPLACE FUNCTION sync_recipe_ingredient_name_columns/);
assert.match(recipeMediaLifecycle, /CREATE TABLE IF NOT EXISTS recipe_media_version_refs/);
assert.match(recipeMediaLifecycle, /ON DELETE RESTRICT/);

assert.match(recipePage, /AdminShell/);
assert.match(recipePage, /AdminRecipeOperationsPanelV5/);
assert.doesNotMatch(recipePage, /recipe-operations\.css/);
assert.equal(existsSync("apps/frontend/app/admin/recipes/recipe-operations.css"), false);
assert.match(guardedRecipePanel, /z-\[80\]/);
assert.match(guardedRecipePanel, /role=\{toast\.kind === "error" \? "alert" : "status"\}/);
assert.match(guardedRecipePanel, /Đã lưu version mới và đồng bộ vòng đời ảnh/);
assert.match(guardedRecipePanel, /Đã tạo công thức và gắn media từ draft/);
assert.match(recipePickers, /AdminDialog/);
assert.doesNotMatch(recipePickers, /fixed inset-0 z-\[75\]/);

console.log("Admin proxy, Recipe V5 lifecycle, shared dialog, and immutable-version runtime contract passed.");
