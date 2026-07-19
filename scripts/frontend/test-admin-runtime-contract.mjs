import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminApi = await readFile("apps/frontend/lib/admin-api.ts", "utf8");
const proxyRoute = await readFile("apps/frontend/app/api/backend-admin/[...path]/route.ts", "utf8");
const recipeList = await readFile("apps/backend/src/modules/recipes/recipe-admin-list.service.ts", "utf8");
const migrationPlan = await readFile("apps/backend/scripts/migration-plan.mjs", "utf8");
const customerUtf8Repair = await readFile("db/migrations/015_customer_utf8_repair.sql", "utf8");
const recipeUtf8Repair = await readFile("db/migrations/016_recipe_title_utf8_repair.sql", "utf8");
const recipeYieldCompatibility = await readFile("db/migrations/017_recipe_yield_unit_compatibility.sql", "utf8");
const recipeIngredientCompatibility = await readFile("db/migrations/018_recipe_ingredient_legacy_name.sql", "utf8");
const recipePage = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const guardedRecipePanel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV3.tsx", "utf8");
const recipeStyles = await readFile("apps/frontend/app/admin/recipes/recipe-operations.css", "utf8");

assert.match(adminApi, /function browserAdminProxyPath/);
assert.match(adminApi, /path === "\/api\/admin"/);
assert.match(adminApi, /path\.startsWith\("\/api\/admin\/"\)/);
assert.match(adminApi, /`\/api\/backend-admin\/\$\{path\.slice\("\/api\/admin\/"\.length\)\}`/);
assert.match(adminApi, /typeof window === "undefined"[\s\S]*`\$\{API_URL\}\$\{path\}`[\s\S]*browserAdminProxyPath\(path\)/);
assert.doesNotMatch(adminApi, /typeof window === "undefined" \? `\$\{API_URL\}\$\{path\}` : path/);
assert.match(adminApi, /ADMIN_API_SUCCESS_EVENT/);
assert.match(adminApi, /window\.dispatchEvent\(new CustomEvent/);

assert.match(proxyRoute, /`\/api\/admin\/\$\{suffix\}\$\{request\.nextUrl\.search \|\| ""\}`/);
assert.match(proxyRoute, /headers: \{ authorization \}/);
assert.match(proxyRoute, /ALLOWED_METHODS/);
assert.match(proxyRoute, /export const PATCH = proxyAdminRequest/);
assert.match(proxyRoute, /export const DELETE = proxyAdminRequest/);

assert.match(recipeList, /SELECT COUNT\(\*\)::int[\s\S]*FROM recipe_ingredients/);
assert.match(recipeList, /COUNT\(\*\) OVER\(\)::int AS "totalCount"/);
assert.doesNotMatch(recipeList, /GROUP BY/);

assert.match(migrationPlan, /015_customer_utf8_repair\.sql/);
assert.match(migrationPlan, /016_recipe_title_utf8_repair\.sql/);
assert.match(migrationPlan, /017_recipe_yield_unit_compatibility\.sql/);
assert.match(migrationPlan, /018_recipe_ingredient_legacy_name\.sql/);
assert.match(customerUtf8Repair, /Trà Sữa Hùng Trà/);
assert.match(recipeUtf8Repair, /UPDATE recipes/);
assert.doesNotMatch(
  recipeUtf8Repair,
  /UPDATE\s+recipe_versions/i,
  "Recipe snapshots are immutable and must never be updated in place.",
);
assert.match(recipeUtf8Repair, /INSERT INTO recipe_versions/);
assert.match(recipeUtf8Repair, /source_version\.snapshot ->> 'title' = 'Tr� S\?a H\?ng Tr�'/);
assert.match(recipeUtf8Repair, /current_version_id = corrected_current_id/);
assert.match(recipeUtf8Repair, /published_version_id = corrected_published_id/);
assert.match(recipeUtf8Repair, /Trà Sữa Hùng Trà/);

assert.match(recipeYieldCompatibility, /DROP CONSTRAINT IF EXISTS recipes_yield_unit_check/);
assert.match(recipeYieldCompatibility, /length\(btrim\(yield_unit\)\) BETWEEN 1 AND 80/);
assert.match(recipeYieldCompatibility, /column_name = 'version_number'/);
assert.match(recipeYieldCompatibility, /ALTER COLUMN version_number DROP NOT NULL/);
assert.doesNotMatch(
  recipeYieldCompatibility,
  /UPDATE\s+recipe_versions/i,
  "Recipe compatibility migrations must not mutate immutable version rows.",
);

assert.match(recipeIngredientCompatibility, /ADD COLUMN IF NOT EXISTS name TEXT/);
assert.match(recipeIngredientCompatibility, /CREATE OR REPLACE FUNCTION sync_recipe_ingredient_name_columns/);
assert.match(recipeIngredientCompatibility, /NEW\.name := NEW\.product_name/);
assert.match(recipeIngredientCompatibility, /NEW\.product_name := NEW\.name/);
assert.match(recipeIngredientCompatibility, /BEFORE INSERT OR UPDATE OF name, product_name/);
assert.doesNotMatch(recipeIngredientCompatibility, /ALTER COLUMN name DROP NOT NULL/);
assert.doesNotMatch(recipeIngredientCompatibility, /DROP CONSTRAINT IF EXISTS recipe_ingredients_name_check/);

assert.match(recipePage, /recipe-operations\.css/);
assert.match(recipePage, /className="recipe-operations-page"/);
assert.match(recipePage, /AdminRecipeOperationsPanelV3/);
assert.doesNotMatch(recipePage, /AdminRecipeSaveFeedback/);
assert.match(guardedRecipePanel, /function EditorToast/);
assert.match(guardedRecipePanel, /role=\{notice\.kind === "error" \? "alert" : "status"\}/);
assert.match(guardedRecipePanel, /Đã lưu bản nháp mới của công thức/);
assert.match(guardedRecipePanel, /Đã tạo công thức nháp thành công/);
assert.match(recipeStyles, /grid-template-columns: minmax\(0, 1fr\) auto/);
assert.match(recipeStyles, /> button/);
assert.match(recipeStyles, /height: 3rem/);
assert.match(recipeStyles, /> select/);
assert.match(recipeStyles, /grid-column: 1 \/ -1/);

console.log("Admin proxy, Recipe legacy compatibility, modal save feedback, immutable UTF-8 repair and mobile toolbar contract passed.");
