import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import { AiAppRuntimeError, AiAppRuntimeService } from "../src/modules/ai/ai-app-runtime.service";
import { AiProjectStoreService } from "../src/modules/ai/ai-project-store.service";

function sampleProject(keySuffix: string) {
  return {
    schemaVersion: "1.0",
    project: { key: `runtime-agents-${keySuffix}`, name: "Runtime Agents" },
    models: [
      { key: "fast", provider: "vertex_ai", modelId: "gemini-runtime-fast", displayName: "Fast", enabled: true },
      { key: "quality", provider: "vertex_ai", modelId: "gemini-runtime-quality", displayName: "Quality", enabled: true },
    ],
    agents: [
      {
        key: "recipe-drafter",
        name: "Recipe Drafter",
        useCase: "recipe_draft",
        modelKey: "quality",
        outputSchema: {
          type: "object",
          properties: { title: { type: "string" } },
          required: ["title"],
        },
      },
      {
        key: "ops-summary",
        name: "Ops Summary",
        useCase: "operations_assistant",
        modelKey: "fast",
        outputSchema: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
        },
      },
    ],
  };
}

async function expectRuntimeError(run: () => Promise<unknown>, code: string) {
  await assert.rejects(
    run,
    (error: unknown) => error instanceof AiAppRuntimeError && error.code === code,
    `Expected AiAppRuntimeError ${code}`,
  );
}

async function main() {
  const db = getDb();
  const suffix = randomUUID().slice(0, 8);
  const admin: StaffIdentity = {
    kind: "staff",
    clerkUserId: `clerk-a1e-${suffix}`,
    staffId: randomUUID(),
    role: "admin",
    isActive: true,
  };
  const projectStore = new AiProjectStoreService(db);
  const runtime = new AiAppRuntimeService(db);

  await db.query(
    `INSERT INTO staff_users (id, clerk_user_id, name, role, is_active)
     VALUES ($1,$2,'A1e Admin','admin',true)`,
    [admin.staffId, admin.clerkUserId],
  );

  try {
    const stored = await projectStore.uploadProject(admin, {
      filename: "runtime-agents.json",
      json: sampleProject(suffix),
    });
    const agents = await projectStore.loadAgents(admin, stored.version.id);
    const models = await projectStore.loadModels(admin, stored.version.id);
    const recipeAgent = agents.agents.find((agent) => agent.agentKey === "recipe-drafter");
    const qualityModel = models.models.find((model) => model.modelKey === "quality");
    const fastModel = models.models.find((model) => model.modelKey === "fast");
    assert.ok(recipeAgent);
    assert.ok(qualityModel);
    assert.ok(fastModel);
    assert.equal(recipeAgent.reviewStatus, "untrusted");

    const app = await runtime.createApp(admin, {
      appKey: `recipe-app-${suffix}`,
      name: "Recipe Runtime App",
      projectVersionId: stored.version.id,
      runtimeConfig: { mode: "draft-only" },
    });
    assert.equal(app.app.appKey, `recipe-app-${suffix}`);
    assert.equal(app.app.projectVersionId, stored.version.id);

    await expectRuntimeError(
      () => runtime.loadAgentIntoApp(admin, app.app.id, {
        agentId: recipeAgent.id,
        modelId: qualityModel.id,
        slotKey: "primary",
      }),
      "AGENT_NOT_APPROVED",
    );

    const reviewed = await runtime.approveAgent(admin, recipeAgent.id, "reviewed");
    assert.equal(reviewed.agent.reviewStatus, "reviewed");
    await expectRuntimeError(
      () => runtime.loadAgentIntoApp(admin, app.app.id, {
        agentId: recipeAgent.id,
        modelId: qualityModel.id,
        slotKey: "primary",
      }),
      "AGENT_NOT_APPROVED",
    );

    const approved = await runtime.approveAgent(admin, recipeAgent.id, "approved");
    assert.equal(approved.agent.reviewStatus, "approved");
    await expectRuntimeError(
      () => runtime.loadAgentIntoApp(admin, app.app.id, {
        agentId: recipeAgent.id,
        modelId: fastModel.id,
        slotKey: "primary",
      }),
      "MODEL_NOT_ALLOWED_FOR_AGENT",
    );

    await runtime.loadAgentIntoApp(admin, app.app.id, {
      agentId: recipeAgent.id,
      modelId: qualityModel.id,
      slotKey: "primary",
      runtimeConfig: { visibleInApp: true },
    });
    const appAgents = await runtime.listAppAgents(admin, app.app.id);
    assert.equal(appAgents.appAgents.length, 1);
    assert.equal(appAgents.appAgents[0].agentKey, "recipe-drafter");
    assert.equal(appAgents.appAgents[0].modelKey, "quality");
    assert.equal(appAgents.appAgents[0].slotKey, "primary");

    const apps = await runtime.listApps(admin);
    assert.ok(apps.apps.some((item) => item.id === app.app.id));

    console.log("AI A1e app runtime integration passed.");
  } finally {
    await db.query("DELETE FROM ai_apps WHERE app_key=$1", [`recipe-app-${suffix}`]).catch(() => undefined);
    await db.query("DELETE FROM ai_projects WHERE project_key=$1", [`runtime-agents-${suffix}`]).catch(() => undefined);
    await db.query("DELETE FROM staff_users WHERE id=$1", [admin.staffId]).catch(() => undefined);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
