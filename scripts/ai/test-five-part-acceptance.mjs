import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const files = {
  recipePanel: read("apps/frontend/components/admin/AdminRecipeOperationsPanelV5.tsx"),
  recipeAi: read("apps/frontend/components/admin/recipe-editor/RecipeAiAssistantPanel.tsx"),
  recipeAudit: read("apps/frontend/components/admin/ai/RecipeAiAuditResult.tsx"),
  recipeCostView: read("apps/frontend/components/admin/ai/RecipeCostPreview.tsx"),
  recipeAuditSchema: read("apps/backend/src/modules/ai/recipe-audit-content.ts"),
  recipeCost: read("apps/backend/src/modules/ai/recipe-cost.ts"),
  recipeCopilotRoutes: read("apps/backend/src/modules/ai/recipe-copilot.routes.ts"),
  recipeDraftContent: read("apps/backend/src/modules/ai/ai-draft-content.ts"),
  recipeSteps: read("apps/frontend/components/admin/recipe-editor/RecipeStepsTab.tsx"),
  recipeMerge: read("apps/frontend/components/admin/recipe-editor/recipe-step-merge.mjs"),
  aiConsole: read("apps/frontend/components/admin/AdminAiConsole.tsx"),
  aiReviewQueue: read("apps/frontend/components/admin/ai/AiRecipeDraftReviewQueue.tsx"),
  aiDiff: read("apps/frontend/components/admin/ai/AiRecipeDraftDiff.tsx"),
  nav: read("apps/frontend/components/admin/AdminModuleNav.tsx"),
  permissions: read("apps/frontend/lib/admin-permissions.ts"),
  routes: read("apps/backend/src/modules/ai/ai.routes.ts"),
  draftService: read("apps/backend/src/modules/ai/ai-draft.service.ts"),
  provider: read("apps/backend/src/modules/ai/google-agent.provider.ts"),
  app: read("apps/backend/src/app.ts"),
  apiMain: read("apps/backend/src/main.ts"),
  workerEntry: read("apps/backend/src/ai-worker.ts"),
  workerLifecycle: read("apps/backend/src/modules/ai/ai.worker.ts"),
  workerUnit: read("scripts/phase7/systemd/bepsi-ai-worker.service"),
  migration: read("db/migrations/025_ai_draft_review_apply.sql"),
};

// Part 1: media safety.
assert.match(files.recipeMerge, /steps\.flatMap\(\(step, index\) => step\.mediaId/, "media sync must omit null media IDs");
assert.match(files.draftService, /SET title = \$3, content = \$4/, "AI apply may update SOP text only for existing steps");
assert.doesNotMatch(files.draftService, /SET[^;]*media_id\s*=\s*NULL/s, "AI apply must never clear existing step media");
assert.match(files.draftService, /recipe_media_version_refs/, "new Recipe versions must retain media references");

// Part 2: permission-aware admin and scopes.
for (const permission of ["recipes.view", "recipes.edit", "recipes.review", "recipes.publish", "recipes.media.manage"]) {
  assert.match(files.recipePanel, new RegExp(permission.replace(".", "\\.")), `Recipe editor is missing ${permission}`);
}
for (const permission of ["ai.use", "ai.execute", "ai.approve", "ai.audit"]) {
  assert.match(`${files.permissions}\n${files.routes}`, new RegExp(permission.replace(".", "\\.")), `AI workflow is missing ${permission}`);
}
assert.match(files.nav, /href: "\/admin\/ai"/);
assert.doesNotMatch(files.aiConsole, /scopes:\s*\["orders",\s*"customers",\s*"catalog",\s*"recipes"\]/);
assert.match(files.recipeCopilotRoutes, /requirePermission\(identity, "ai\.use"\)/);
assert.match(files.recipeCopilotRoutes, /requirePermission\(identity, "recipes\.view"\)/);
assert.match(files.recipeCopilotRoutes, /requirePermission\(identity, "catalog\.view"\)/);

// Part 3: Health Score and one-click Recipe Copilot UI stay inside Steps and hide raw JSON.
assert.match(files.recipeSteps, /id="recipe-ai-sop-target"/);
assert.match(files.recipeAi, /createPortal\(panel, stepsTarget\)/);
assert.match(files.recipeAi, /RecipeAiAuditResult/);
assert.match(files.recipeAi, /RecipeCostPreview/);
assert.doesNotMatch(files.recipeAi, /:has\(|<style jsx global>|recipe-ai-sop-slot/);
for (const primitive of ["AdminSurface", "AdminButton", "AdminAlert", "AdminDialog"]) {
  assert.match(files.recipeAi, new RegExp(primitive));
}
for (const source of [files.recipeAi, files.recipeAudit, files.recipeCostView, files.aiConsole, files.aiReviewQueue, files.aiDiff]) {
  assert.doesNotMatch(source, /<pre\b/, "user-facing AI flow must not expose raw JSON blocks");
}
assert.match(files.recipeAudit, /Sức khỏe công thức/);
assert.match(files.recipeAudit, /Checklist vận hành/);
assert.match(files.recipeAudit, /8 tiêu chí vận hành/);
assert.match(files.recipeAudit, /parseStructuredAudit/);
assert.match(files.recipeAudit, /HIDDEN_SECTION_PATTERN/);
assert.match(files.recipeAudit, /TECHNICAL_KEY_PATTERN/);
assert.match(files.recipeAuditSchema, /RECIPE_AUDIT_CHECKLIST_KEYS/);
assert.match(files.recipeAuditSchema, /STATUS_MULTIPLIER/);
assert.match(files.recipeAuditSchema, /score >= 85/);
for (const label of ["Tạo SOP", "Tạo QC", "Chuẩn hóa định lượng", "Tính giá vốn"]) {
  assert.match(files.recipeAi, new RegExp(label));
}
assert.match(files.recipeAi, /grid-cols-2 gap-2 lg:grid-cols-4/);
assert.match(files.recipeCostView, /Chi phí bắt buộc đã biết/);
assert.match(files.recipeCostView, /Chưa dùng số này làm giá vốn chính thức/);
assert.doesNotMatch(files.recipeAi, /Job \{job\.id|Base \{draft\.baseRecipeVersionId|PostgreSQL|`ai\.approve`|`recipes\.review`/);
assert.match(files.aiDiff, /Hiện tại/);
assert.match(files.aiDiff, /AI đề xuất/);

// Part 4: persisted SOP/QC/dosing review, partial apply, and Recipe version creation.
assert.match(files.migration, /'draft', 'approved', 'rejected', 'applied', 'archived'/);
assert.match(files.routes, /\/drafts\/:draftId\/approve/);
assert.match(files.routes, /\/drafts\/:draftId\/reject/);
assert.match(files.routes, /\/drafts\/:draftId\/apply/);
assert.match(files.draftService, /SELF_APPROVAL_FORBIDDEN/);
assert.match(files.draftService, /AI_DRAFT_STALE/);
assert.match(files.draftService, /selectedStepIds/);
assert.match(files.draftService, /INSERT INTO recipe_versions/);
assert.match(files.draftService, /INSERT INTO recipe_versions[\s\S]*VALUES\(\$1,\$2,'draft'/);
assert.match(files.recipeDraftContent, /z\.enum\(\["sop", "qc", "dosing"\]\)/);
assert.match(files.recipeDraftContent, /generated\.task === "sop"/);
assert.match(files.recipeAi, /RECIPE_TASK:SOP/);
assert.match(files.recipeAi, /RECIPE_TASK:QC/);
assert.match(files.recipeAi, /RECIPE_TASK:DOSING/);
assert.match(files.aiReviewQueue, /recipeDraftTaskLabel/);

// Part 5: standalone worker, fail-closed provider, deterministic cost, and main-only CI.
assert.doesNotMatch(files.apiMain, /startAiWorker|ai\.worker/);
assert.match(files.workerEntry, /verifyGoogleAgentProvider/);
assert.match(files.workerEntry, /startAiWorker/);
assert.doesNotMatch(files.workerLifecycle, /\.unref\(\)/);
assert.match(files.workerLifecycle, /await activeTick/);
assert.match(files.workerUnit, /bepsi-ai-worker/);
assert.match(files.provider, /AI_PROVIDER_NOT_CONFIGURED/);
assert.match(files.provider, /process\.env\.NODE_ENV !== "production"/);
assert.match(files.provider, /QUY TẮC ĐẦU RA BẮT BUỘC CHO RECIPE HEALTH AUDIT/);
assert.match(files.provider, /buildRecipeAuditContent/);
assert.match(files.provider, /700-1200 token/);
assert.doesNotMatch(files.provider, /fallbackReason:\s*"google_agent_not_configured"/);
assert.match(files.recipeCost, /buildRecipeCostPreview/);
assert.match(files.recipeCost, /missing_package_size/);
assert.match(files.recipeCost, /costPerYield/);
assert.doesNotMatch(files.recipeCost, /generateWithGoogleAgent|Vertex|Gemini/);
assert.match(files.recipeCopilotRoutes, /to_jsonb\(variant\)/);
assert.match(files.app, /\/api\/admin\/recipe-copilot/);

for (const workflowPath of [
  ".github/workflows/core-order-contract.yml",
  ".github/workflows/catalog-boundary.yml",
  ".github/workflows/migration-ci.yml",
]) {
  const workflow = read(workflowPath);
  assert.match(workflow, /on:\n  push:\n    branches:\n      - main\n  pull_request:\n    branches:\n      - main/);
  assert.doesNotMatch(workflow, /agent\/\*\*|feature\/\*\*|hotfix\/\*\*|refactor\/\*\*/);
}

console.log("Bếp Sỉ AI five-part production acceptance gate with Recipe Copilot Phase 2 passed.");
