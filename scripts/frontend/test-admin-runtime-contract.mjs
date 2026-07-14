import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminApi = await readFile("apps/frontend/lib/admin-api.ts", "utf8");
const proxyRoute = await readFile("apps/frontend/app/api/admin/[...path]/route.ts", "utf8");
const recipeList = await readFile("apps/backend/src/modules/recipes/recipe-admin-list.service.ts", "utf8");
const migrationPlan = await readFile("apps/backend/scripts/migration-plan.mjs", "utf8");
const utf8Repair = await readFile("db/migrations/015_customer_utf8_repair.sql", "utf8");

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
assert.match(utf8Repair, /Trà Sữa Hùng Trà/);
assert.match(utf8Repair, /WHERE name = 'Tr� S\?a H\?ng Tr�'/);

console.log("Admin runtime proxy and Recipe compatibility contract passed.");
