import assert from "node:assert/strict";
import test from "node:test";
import { generateWithGoogleAgent, verifyGoogleAgentProvider } from "../src/modules/ai/google-agent.provider.js";

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
