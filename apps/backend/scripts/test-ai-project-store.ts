import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import { AiProjectSchemaError, parseAiProjectDefinition } from "../src/modules/ai/ai-project-schema";
import { AiProjectStoreError, AiProjectStoreService } from "../src/modules/ai/ai-project-store.service";

function sampleProject(keySuffix: string) {
  return {
    schemaVersion: "1.0",
    project: {
      key: `bepsi-agents-${keySuffix}`,
      name: "Bếp Sỉ Agents",
      description: "Project nhiều agent cho admin workspace",
    },
    models: [
      {
        key: "fast",
        provider: "vertex_ai",
        modelId: "gemini-test-fast",
        displayName: "Fast model",
        enabled: true,
      },
      {
        key: "quality",
        provider: "vertex_ai",
        modelId: "gemini-test-quality",
        displayName: "Quality model",
        enabled: true,
      },
    ],
    agents: [
      {
        key: "recipe-drafter",
        name: "Recipe Drafter",
        description: "Tạo bản nháp công thức",
        useCase: "recipe_draft",
        modelKey: "quality",
        systemInstruction: "Đề xuất nháp, không áp thẳng vào công thức.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
        outputSchema: {
          type: "object",
          properties: { title: { type: "string" }, yield: { type: "integer" } },
          required: ["title", "yield"],
        },
        enabled: true,
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

async function expectStoreError(run: () => Promise<unknown>, code: string) {
  await assert.rejects(
    run,
    (error: unknown) => error instanceof AiProjectStoreError && error.code === code,
    `Expected AiProjectStoreError ${code}`,
  );
}

async function main() {
  const db = getDb();
  const suffix = randomUUID().slice(0, 8);
  const service = new AiProjectStoreService(db);
  const admin: StaffIdentity = {
    kind: "staff",
    clerkUserId: `clerk-a1c-${suffix}`,
    staffId: randomUUID(),
    role: "admin",
    isActive: true,
  };

  await db.query(
    `INSERT INTO staff_users (id, clerk_user_id, name, role, is_active)
     VALUES ($1,$2,'A1c Admin','admin',true)`,
    [admin.staffId, admin.clerkUserId],
  );

  try {
    const parsed = parseAiProjectDefinition(sampleProject(suffix));
    assert.equal(parsed.models.length, 2);
    assert.equal(parsed.agents.length, 2);
    assert.equal(parsed.agents[0].modelKey, "quality");

    assert.throws(
      () => parseAiProjectDefinition({ ...sampleProject(suffix), agents: [{ key: "bad", name: "Bad", useCase: "recipe_draft", modelKey: "missing" }] }),
      (error: unknown) => error instanceof AiProjectSchemaError && error.code === "UNKNOWN_MODEL_KEY",
    );

    const stored = await service.uploadProject(admin, {
      filename: "bepsi-agents.json",
      json: sampleProject(suffix),
    });
    assert.equal(stored.counts.models, 2);
    assert.equal(stored.counts.agents, 2);
    assert.equal(stored.version.version, 1);
    assert.equal(stored.project.activeVersionId, stored.version.id);

    const projects = await service.listProjects(admin);
    assert.ok(projects.projects.some((project) => project.id === stored.project.id));

    const versions = await service.listVersions(admin, stored.project.id);
    assert.equal(versions.versions[0].id, stored.version.id);

    const agents = await service.loadAgents(admin, stored.version.id);
    assert.deepEqual(agents.agents.map((agent) => agent.agentKey), ["ops-summary", "recipe-drafter"]);
    assert.ok(agents.agents.every((agent) => agent.reviewStatus === "untrusted"));

    const models = await service.loadModels(admin, stored.version.id);
    assert.deepEqual(models.models.map((model) => model.modelKey), ["fast", "quality"]);

    await expectStoreError(
      () => service.uploadProject(admin, { filename: "same.json", json: sampleProject(suffix) }),
      "PROJECT_VERSION_ALREADY_EXISTS",
    );

    const validDraft = await service.saveManualDraft(admin, {
      schemaVersion: "manual-test",
      jsonPayload: { title: "Trà đào", yield: 20 },
      schema: {
        type: "object",
        properties: { title: { type: "string" }, yield: { type: "integer" } },
        required: ["title", "yield"],
      },
    });
    assert.equal(validDraft.document.validationStatus, "valid");

    const invalidDraft = await service.saveManualDraft(admin, {
      schemaVersion: "manual-test",
      jsonPayload: { title: "Trà đào", yield: "20" },
      schema: {
        type: "object",
        properties: { title: { type: "string" }, yield: { type: "integer" } },
        required: ["title", "yield"],
      },
    });
    assert.equal(invalidDraft.document.validationStatus, "invalid");

    console.log("AI A1c project store integration passed.");
  } finally {
    await db.query("DELETE FROM ai_documents WHERE created_by_staff_id=$1", [admin.staffId]).catch(() => undefined);
    await db.query(
      "DELETE FROM ai_projects WHERE project_key=$1",
      [`bepsi-agents-${suffix}`],
    ).catch(() => undefined);
    await db.query("DELETE FROM staff_users WHERE id=$1", [admin.staffId]).catch(() => undefined);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
