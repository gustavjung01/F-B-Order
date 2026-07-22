import assert from "node:assert/strict";
import test from "node:test";
import { buildRecipeSopDraftContent } from "../src/modules/ai/ai-draft-content.js";
import { __testing, generateWithGoogleAgent, verifyGoogleAgentProvider } from "../src/modules/ai/google-agent.provider.js";
import { buildRecipeAuditContent, parseRecipeAuditResponse } from "../src/modules/ai/recipe-audit-content.js";
import { buildRecipeCostPreview } from "../src/modules/ai/recipe-cost.js";

const ENV_KEYS = [
  "NODE_ENV",
  "AI_ALLOW_DETERMINISTIC_FALLBACK",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_AGENT_ENGINE_ID",
  "GOOGLE_AGENT_ENDPOINT",
  "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
] as const;

function snapshotEnvironment() {
  return new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(snapshot: Map<(typeof ENV_KEYS)[number], string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearGoogleConfiguration() {
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.GOOGLE_CLOUD_LOCATION;
  delete process.env.GOOGLE_AGENT_ENGINE_ID;
  delete process.env.GOOGLE_AGENT_ENDPOINT;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
}

const validAudit = {
  summary: "Công thức có thể vận hành sau khi bổ sung thông tin bảo quản và chuẩn hóa vài thao tác.",
  findings: [
    { severity: "medium", title: "Thiếu nhiệt độ bảo quản", detail: "Nền trà chưa có nhiệt độ và thời gian sử dụng sau khi pha." },
  ],
  checklist: [
    { key: "ingredients", status: "pass", note: "Danh sách nguyên liệu rõ ràng." },
    { key: "dosing", status: "pass", note: "Định lượng chính đã có." },
    { key: "sequence", status: "pass", note: "Thứ tự thao tác hợp lý." },
    { key: "time_temperature", status: "warning", note: "Thiếu nhiệt độ bảo quản nền trà." },
    { key: "quality", status: "pass", note: "Có tiêu chí màu và vị." },
    { key: "storage", status: "warning", note: "Chưa ghi hạn dùng sau khi pha." },
    { key: "catalog", status: "warning", note: "Một số nguyên liệu chưa liên kết catalog." },
    { key: "cost", status: "warning", note: "Chưa đủ giá để tính giá vốn." },
  ],
  sop: [
    { title: "Phối vị", content: "Đong lần lượt nước đường, nước cốt tắc và nền trà vào bình lắc." },
  ],
  qualityControls: [
    { label: "Hương vị", target: "Chua ngọt cân bằng, không có vị đắng từ vỏ tắc." },
  ],
  missingData: ["Nhiệt độ bảo quản nền trà", "Giá nguyên liệu"],
};

const recipeContext = {
  recipe: {
    id: "11111111-1111-4111-8111-111111111111",
    currentVersionId: "22222222-2222-4222-8222-222222222222",
    steps: [
      { stepNo: 1, title: "Phối vị", content: "Cho nguyên liệu vào bình lắc.", imageUrl: null },
      { stepNo: 2, title: "Hoàn thiện", content: "Rót ra ly.", imageUrl: null },
    ],
  },
};

test("Google Agent provider fails closed in production and only allows explicit non-production fallback", async () => {
  const snapshot = snapshotEnvironment();
  try {
    clearGoogleConfiguration();
    process.env.NODE_ENV = "production";
    process.env.AI_ALLOW_DETERMINISTIC_FALLBACK = "true";

    await assert.rejects(
      verifyGoogleAgentProvider(),
      (error: unknown) => Boolean(
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "AI_PROVIDER_NOT_CONFIGURED"
      ),
    );

    await assert.rejects(
      generateWithGoogleAgent({
        prompt: "Kiểm tra",
        context: {},
        mode: "read_only",
        userId: "test-user",
      }),
      (error: unknown) => Boolean(
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "AI_PROVIDER_NOT_CONFIGURED"
      ),
    );

    process.env.NODE_ENV = "test";
    process.env.AI_ALLOW_DETERMINISTIC_FALLBACK = "true";

    const preflight = await verifyGoogleAgentProvider();
    assert.deepEqual(preflight, { provider: "deterministic", model: null });

    const fallback = await generateWithGoogleAgent({
      prompt: "Kiểm tra local",
      context: { safe: true },
      mode: "read_only",
      userId: "test-user",
    });
    assert.equal(fallback.provider, "deterministic");
    assert.equal(fallback.data.fallbackReason, "explicit_non_production_fallback");
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("Recipe audit prompt enforces the compact health-check JSON schema", () => {
  const message = __testing.buildAgentMessage({
    prompt: "Kiểm tra Trà tắc",
    context: { recipe: { id: "recipe-id", title: "Trà tắc" } },
    mode: "read_only",
    userId: "test-user",
  });

  assert.match(message, /RECIPE HEALTH AUDIT/);
  assert.match(message, /summary, findings, checklist, sop, qualityControls, missingData/);
  assert.match(message, /đúng 8 mục/);
  assert.match(message, /ingredients, dosing, sequence, time_temperature, quality, storage, catalog, cost/);
  assert.match(message, /700-1200 token/);
  assert.doesNotMatch(message, /Hành động đề xuất/);
});

test("Recipe audit schema computes a deterministic health score from eight weighted criteria", () => {
  const content = buildRecipeAuditContent(JSON.stringify(validAudit));

  assert.equal(content.kind, "recipe_audit");
  assert.equal(content.schemaVersion, 1);
  assert.equal(content.score, 78);
  assert.equal(content.readiness, "needs_attention");
  assert.equal(content.checklist.length, 8);
  assert.equal(content.checklist[0].label, "Nguyên liệu");
  assert.equal(content.findings[0].id, "finding-01");
  assert.equal(content.sop[0].id, "sop-01");
  assert.equal(content.qualityControls[0].id, "qc-01");
});

test("Recipe audit parser rejects incomplete or duplicated checklist output", () => {
  const incomplete = {
    ...validAudit,
    checklist: validAudit.checklist.slice(0, 7),
  };
  assert.throws(() => parseRecipeAuditResponse(JSON.stringify(incomplete)));

  const duplicated = {
    ...validAudit,
    checklist: validAudit.checklist.map((item, index) => index === 7 ? { ...item, key: "catalog" } : item),
  };
  assert.throws(() => parseRecipeAuditResponse(JSON.stringify(duplicated)));
});

test("Recipe QC drafts append a new control step while dosing drafts map by exact title", () => {
  const qc = buildRecipeSopDraftContent(JSON.stringify({
    task: "qc",
    steps: [{ title: "Kiểm soát chất lượng thành phẩm", content: "Kiểm tra màu, mùi và độ đầy trước khi phục vụ." }],
  }), recipeContext);
  assert.equal(qc.task, "qc");
  assert.equal(qc.proposal.steps[0].currentStepNo, null);

  const dosing = buildRecipeSopDraftContent(JSON.stringify({
    task: "dosing",
    steps: [{ title: "Phối vị", content: "Đong đúng lượng bằng jigger trước khi cho vào bình lắc." }],
  }), recipeContext);
  assert.equal(dosing.task, "dosing");
  assert.equal(dosing.proposal.steps[0].currentStepNo, 1);
});

test("Recipe cost is deterministic and fails closed when package data is missing", () => {
  const ready = buildRecipeCostPreview(
    { id: recipeContext.recipe.id, title: "Trà tắc", yieldQuantity: 1, yieldUnit: "ly" },
    [{
      productName: "Nền trà lài",
      quantity: 180,
      unit: "ml",
      optional: false,
      catalogVariantId: "33333333-3333-4333-8333-333333333333",
      sourceType: "catalog",
      sourceRecipeSlug: null,
      sku: "TRA-LAI-1L",
      shopPrice: 50000,
      retailPrice: 60000,
      variantData: { name: "Chai 1 l" },
      productData: { name: "Nền trà lài" },
    }],
  );
  assert.equal(ready.status, "ready");
  assert.equal(ready.knownMandatoryCost, 9000);
  assert.equal(ready.costPerYield, 9000);
  assert.equal(ready.lines[0].priceSource, "shop");

  const blocked = buildRecipeCostPreview(
    { id: recipeContext.recipe.id, title: "Trà tắc", yieldQuantity: 1, yieldUnit: "ly" },
    [{
      productName: "Nước đường",
      quantity: 30,
      unit: "ml",
      optional: false,
      catalogVariantId: "44444444-4444-4444-8444-444444444444",
      sourceType: "catalog",
      sourceRecipeSlug: null,
      sku: "DUONG",
      shopPrice: 30000,
      retailPrice: null,
      variantData: { name: "Nước đường tiêu chuẩn" },
      productData: {},
    }],
  );
  assert.equal(blocked.status, "unavailable");
  assert.equal(blocked.lines[0].status, "missing_package_size");
  assert.equal(blocked.costPerYield, null);
});

test("Legacy Recipe audit sanitizer still removes greetings, technical actions and JSON blocks", () => {
  const sanitized = __testing.sanitizeRecipeReadOnlyText(`Chào bạn, tôi đã audit công thức.

### 1. Kết luận
Công thức cần chuẩn hóa thao tác.

### 2. SOP đề xuất
- Đong nguyên liệu bằng jigger.

### 6. Hành động đề xuất
\`\`\`json
{
  "action_key": "propose_recipe_update",
  "target_id": "recipe-id",
  "status": "pending_approval"
}
\`\`\``);

  assert.doesNotMatch(sanitized, /Chào bạn/);
  assert.match(sanitized, /Công thức cần chuẩn hóa thao tác/);
  assert.match(sanitized, /Đong nguyên liệu bằng jigger/);
  assert.doesNotMatch(sanitized, /Hành động đề xuất/);
  assert.doesNotMatch(sanitized, /action_key|target_id|pending_approval|```|\{/);
});
