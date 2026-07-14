import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminApi = await readFile("apps/frontend/lib/admin-api.ts", "utf8");
const proxyRoute = await readFile("apps/frontend/app/api/admin/[...path]/route.ts", "utf8");
const recipeList = await readFile("apps/backend/src/modules/recipes/recipe-admin-list.service.ts", "utf8");
const migrationPlan = await readFile("apps/backend/scripts/migration-plan.mjs", "utf8");
const customerUtf8Repair = await readFile("db/migrations/015_customer_utf8_repair.sql", "utf8");
const recipeUtf8Repair = await readFile("db/migrations/016_recipe_title_utf8_repair.sql", "utf8");
const recipePage = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const recipeStyles = await readFile("apps/frontend/app/admin/recipes/recipe-operations.css", "utf8");

assert.match(adminApi, /typeof window === "undefined" \? `\$\{API_URL\}\$\{path\}` : path/);
assert.doesNotMatch(adminApi, /fetch\(`\$\{API_URL\}\$\{path\}`/);

assert.match(proxyRoute, /\/api\/admin\/\$\{suffix\}\$\{search\}/);
assert.match(proxyRoute, /headers: \{ authorization \}/);
assert.match(proxyRoute, /export const PATCH = proxyAdminRequest/);
assert.match(proxyRoute, /export const DELETE = proxyAdminRequest/);

assert.match(recipeList, /SELECT COUNT\(\*\)::int[\s\S]*FROM recipe_ingredients/);
assert.match(recipeList, /COUNT\(\*\) OVER\(\)::int AS "totalCount"/);
assert.doesNotMatch(recipeList, /GROUP BY/);

assert.match(migrationPlan, /015_customer_utf8_repair\.sql/);
assert.match(migrationPlan, /016_recipe_title_utf8_repair\.sql/);
assert.match(customerUtf8Repair, /Trà Sữa Hùng Trà/);
assert.match(recipeUtf8Repair, /UPDATE recipes/);
assert.match(recipeUtf8Repair, /UPDATE recipe_versions/);
assert.match(recipeUtf8Repair, /snapshot ->> 'title' = 'Tr� S\?a H\?ng Tr�'/);
assert.match(recipeUtf8Repair, /Trà Sữa Hùng Trà/);

assert.match(recipePage, /recipe-operations\.css/);
assert.match(recipePage, /className="recipe-operations-page"/);
assert.match(recipeStyles, /grid-template-columns: minmax\(0, 1fr\) auto/);
assert.match(recipeStyles, /> button/);
assert.match(recipeStyles, /height: 3rem/);
assert.match(recipeStyles, /> select/);
assert.match(recipeStyles, /grid-column: 1 \/ -1/);

console.log("Admin runtime proxy, Recipe UTF-8 repair and mobile toolbar contract passed.");
