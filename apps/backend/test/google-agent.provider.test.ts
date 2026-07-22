import assert from "node:assert/strict";
import test from "node:test";
import { __testing, generateWithGoogleAgent, verifyGoogleAgentProvider } from "../src/modules/ai/google-agent.provider.js";

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

test("Recipe audit prompt is operator-facing and forbids internal JSON", () => {
  const message = __testing.buildAgentMessage({
    prompt: "Kiểm tra Trà tắc",
    context: { recipe: { id: "recipe-id", title: "Trà tắc" } },
    mode: "read_only",
    userId: "test-user",
  });

  assert.match(message, /người trực tiếp pha chế/);
  assert.match(message, /không xuất JSON/i);
  assert.match(message, /Không viết mục Hành động đề xuất/);
  assert.match(message, /Kết luận nhanh/);
  assert.match(message, /Dữ liệu cần bổ sung/);
});

test("Recipe audit sanitizer removes greetings, technical actions and JSON blocks", () => {
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
