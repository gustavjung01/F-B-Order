import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const files = {
  ui: "apps/frontend/components/admin/ui/AdminUI.tsx",
  toggle: "apps/frontend/components/admin/ui/AdminToggle.tsx",
  docs: "apps/frontend/components/admin/ui/README.md",
  shell: "apps/frontend/components/admin/AdminShell.tsx",
  nav: "apps/frontend/components/admin/AdminModuleNav.tsx",
  operations: "apps/frontend/components/admin/AdminOperationsDashboard.tsx",
  customers: "apps/frontend/components/admin/AdminCustomersPanel.tsx",
  orders: "apps/frontend/components/admin/AdminOrdersPanel.tsx",
  products: "apps/frontend/components/admin/AdminProductsAuditPanelV2.tsx",
  scale: "apps/frontend/components/admin/AdminRecipeScalePanel.tsx",
  aiConsole: "apps/frontend/components/admin/AdminAiConsole.tsx",
  aiReadable: "apps/frontend/components/admin/ai/AiReadableResult.tsx",
  recipeAi: "apps/frontend/components/admin/recipe-editor/RecipeAiAssistantPanel.tsx",
  recipeChrome: "apps/frontend/components/admin/recipe-editor/RecipeEditorChrome.tsx",
  recipePickers: "apps/frontend/components/admin/recipe-editor/RecipePickerDialogs.tsx",
  recipePublish: "apps/frontend/components/admin/recipe-editor/RecipePublishTab.tsx",
  adminPage: "apps/frontend/app/admin/page.tsx",
  productsPage: "apps/frontend/app/admin/products/page.tsx",
  recipesPage: "apps/frontend/app/admin/recipes/page.tsx",
  scalePage: "apps/frontend/app/admin/recipes/scale/page.tsx",
  aiPage: "apps/frontend/app/admin/ai/page.tsx",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

for (const name of [
  "AdminSurface",
  "AdminSurfaceHeader",
  "AdminSurfaceBody",
  "AdminToolbar",
  "AdminField",
  "AdminInput",
  "AdminSelect",
  "AdminTextarea",
  "AdminButton",
  "AdminBadge",
  "AdminAlert",
  "AdminEmptyState",
  "AdminStatCard",
  "AdminDialog",
  "AdminSegmentedTabs",
  "AdminToast",
]) {
  assert.ok(source.ui.includes(`export function ${name}`), `Admin design system is missing ${name}.`);
}

assert.match(source.toggle, /export function AdminToggle/);
assert.match(source.docs, /Không thêm CSS theo selector DOM sâu/);
assert.match(source.docs, /Scope công thức đang khóa/);

for (const required of ["AdminModuleNav orientation=\"vertical\"", "UserButton", "NotificationBell", "adminStyles.content"]) {
  assert.ok(source.shell.includes(required), `AdminShell is missing: ${required}`);
}
assert.match(source.nav, /orientation\?: "horizontal" \| "vertical"/);

for (const moduleName of ["operations", "customers", "orders", "products", "scale", "aiConsole", "aiReadable", "recipeAi", "recipeChrome", "recipePickers", "recipePublish"]) {
  assert.match(source[moduleName], /components\/admin\/ui\/|\.\.\/ui\/AdminUI|\.\/ui\/AdminUI/, `${moduleName} must import shared admin UI primitives.`);
}

for (const moduleName of ["customers", "products", "recipePickers", "recipeAi"]) {
  assert.doesNotMatch(source[moduleName], /className="absolute inset-0 bg-slate-950/, `${moduleName} must use AdminDialog instead of a private overlay.`);
  assert.match(source[moduleName], /AdminDialog/);
}

assert.doesNotMatch(source.aiConsole, /<pre\b/);
assert.doesNotMatch(source.recipeAi, /<pre\b/);
assert.doesNotMatch(source.aiReadable, /<pre\b/);
assert.match(source.recipeAi, /So sánh trước khi áp dụng/);
assert.match(source.productsPage, /AdminProductsAuditPanelV2/);
for (const pageName of ["adminPage", "productsPage", "recipesPage", "scalePage", "aiPage"]) {
  assert.match(source[pageName], /AdminShell/, `${pageName} must use AdminShell.`);
}

assert.doesNotMatch(source.recipesPage, /recipe-operations\.css/);
assert.equal(existsSync("apps/frontend/app/admin/recipes/recipe-operations.css"), false, "Recipe page-specific CSS patch must stay deleted.");

for (const moduleName of ["operations", "customers", "orders", "products", "scale", "aiConsole", "recipeAi"]) {
  assert.doesNotMatch(source[moduleName], /rounded-\[28px\] bg-white p-5 text-slate-950 shadow-xl/, `${moduleName} still contains the legacy module surface pattern.`);
}

console.log("Admin design system shell, primitives, AI surfaces, module migration, and no-page-CSS contract passed.");
