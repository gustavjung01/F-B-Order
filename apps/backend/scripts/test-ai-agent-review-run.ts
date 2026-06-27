import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import { AiAgentRunnerService } from "../src/modules/ai/ai-agent-runner.service";
import { type AiProvider, type AiProviderRequest, type AiProviderResult } from "../src/modules/ai/ai-gateway.provider";
import { AiGatewayService } from "../src/modules/ai/ai-gateway.service";
import { AiProjectStoreError, AiProjectStoreService } from "../src/modules/ai/ai-project-store.service";

class QueueProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly model = "mock-a1e";
  calls: AiProviderRequest[] = [];
  queue: AiProviderResult[] = [];

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("Mock provider queue is empty.");
    return next;
  }
}

function sampleProject(keySuffix: string) {
  return {
    schemaVersion: "1.0",
    project: {
      key: `bepsi-a1e-${keySuffix}`,
      name: "Bếp Sỉ A1e Agents",
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
        useCase: "recipe_draft",
        modelKey: "quality",
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
  const provider = new QueueProvider();
  const gateway = new AiGatewayService(provider, db);
  const store = new AiProjectStoreService(db);
  const runner = new AiAgentRunnerService(gateway, db);
  const createdRequestIds: string[] = [];
  const admin: StaffIdentity = {
    kind: "staff",
    clerkUserId: `clerk-a1e-${suffix}`,
    staffId: randomUUID(),
    role: "admin",
    isActive: true,
  };

  await db.query(
    `INSERT INTO staff_users (id, clerk_user_id, name, role, is_active)
     VALUES ($1,$2,'A1e Admin','admin',true)`,
    [admin.staffId, admin.clerkUserId],
  );

  try {
    const stored = await store.uploadProject(admin, {
      filename: "a1e-agents.json",
      json: sampleProject(suffix),
    });
    const agents = await store.loadAgents(admin, stored.version.id);
    const models = await store.loadModels(admin, stored.version.id);
    const agent = agents.agents.find((item) => item.agentKey === "recipe-drafter");
    const matchingModel = models.models.find((item) => item.modelKey === "quality");
    const wrongModel = models.models.find((item) => item.modelKey === "fast");
    assert.ok(agent);
    assert.ok(matchingModel);
    assert.ok(wrongModel);

    await expectStoreError(
      () => runner.runAgent(admin, agent.id, {
        modelId: matchingModel.id,
        inputJson: { text: "Trà đào cam sả" },
      }),
      "AGENT_NOT_APPROVED",
    );
    assert.equal(provider.calls.length, 0);

    const approved = await runner.reviewAgent(admin, agent.id, { action: "approve" });
    assert.equal(approved.agent.reviewStatus, "approved");
    assert.equal(approved.agent.isEnabled, true);

    await expectStoreError(
      () => runner.runAgent(admin, agent.id, {
        modelId: wrongModel.id,
        inputJson: { text: "Trà đào cam sả" },
      }),
      "AGENT_MODEL_MISMATCH",
    );
    assert.equal(provider.calls.length, 0);

    await expectStoreError(
      () => runner.runAgent(admin, agent.id, {
        modelId: matchingModel.id,
        inputJson: { text: 123 },
      }),
      "AGENT_INPUT_SCHEMA_MISMATCH",
    );
    assert.equal(provider.calls.length, 0);

    provider.queue.push({
      text: JSON.stringify({ title: "Trà đào cam sả", yield: 20 }),
      usage: { inputTokens: 40, outputTokens: 16, totalTokens: 56 },
      finishReason: "STOP",
      safetyMetadata: {},
    });
    const run = await runner.runAgent(admin, agent.id, {
      modelId: matchingModel.id,
      inputText: "Tạo draft công thức từ dữ liệu đã kiểm tra.",
      inputJson: { text: "Trà đào cam sả" },
    });
    createdRequestIds.push(run.gateway.requestId);
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].useCase, "recipe_draft");
    assert.equal(provider.calls[0].response.format, "json");
    assert.deepEqual(run.document.jsonPayload, { title: "Trà đào cam sả", yield: 20 });
    assert.equal(run.document.source, "ai");
    assert.equal(run.document.status, "draft");
    assert.equal(run.document.validationStatus, "valid");

    const documentRows = await db.query(
      `SELECT source,status,project_version_id,agent_id,model_id,validation_status,json_payload
       FROM ai_documents
       WHERE id=$1`,
      [run.document.id],
    );
    assert.equal(documentRows.rowCount, 1);
    assert.equal(documentRows.rows[0].source, "ai");
    assert.equal(documentRows.rows[0].status, "draft");
    assert.equal(documentRows.rows[0].project_version_id, stored.version.id);
    assert.equal(documentRows.rows[0].agent_id, agent.id);
    assert.equal(documentRows.rows[0].model_id, matchingModel.id);
    assert.deepEqual(documentRows.rows[0].json_payload, { title: "Trà đào cam sả", yield: 20 });

    const disabled = await runner.reviewAgent(admin, agent.id, { action: "disable" });
    assert.equal(disabled.agent.isEnabled, false);
    await expectStoreError(
      () => runner.runAgent(admin, agent.id, {
        modelId: matchingModel.id,
        inputJson: { text: "Trà đào cam sả" },
      }),
      "AGENT_DISABLED",
    );

    console.log("AI A1e agent review/run integration passed.");
  } finally {
    await db.query("DELETE FROM ai_documents WHERE created_by_staff_id=$1", [admin.staffId]).catch(() => undefined);
    if (createdRequestIds.length > 0) {
      await db.query("DELETE FROM ai_gateway_runs WHERE request_id = ANY($1::uuid[])", [createdRequestIds]).catch(() => undefined);
    }
    await db.query("DELETE FROM ai_projects WHERE project_key=$1", [`bepsi-a1e-${suffix}`]).catch(() => undefined);
    await db.query("DELETE FROM staff_users WHERE id=$1", [admin.staffId]).catch(() => undefined);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
