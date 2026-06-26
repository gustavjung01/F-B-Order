import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDb } from "../src/db/pool";
import type { RequestIdentity, StaffIdentity } from "../src/modules/auth/auth.identity";
import { AiProviderError, type AiProvider, type AiProviderRequest, type AiProviderResult } from "../src/modules/ai/ai-gateway.provider";
import { AiGatewayError, AiGatewayService } from "../src/modules/ai/ai-gateway.service";
import { AI_SCHEMA_VERSION } from "../src/modules/ai/ai-schema";

class QueueProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly model = "mock-a1b";
  calls: AiProviderRequest[] = [];
  queue: Array<AiProviderResult | Error> = [];

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("Mock provider queue is empty.");
    return next;
  }
}

function request(
  useCase: "recipe_draft" | "operations_assistant" = "operations_assistant",
  response: Record<string, unknown> = { format: "text" },
) {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    useCase,
    input: {
      text: "Tổng hợp dữ liệu vận hành nội bộ.",
      context: { pendingOrders: 12, note: "data only" },
    },
    response,
    controls: { temperature: 0.9, maxOutputTokens: 8000 },
    metadata: {
      correlationId: `a1b-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
    },
  };
}

const admin: StaffIdentity = {
  kind: "staff",
  clerkUserId: "clerk-a1b-admin",
  staffId: randomUUID(),
  role: "admin",
  isActive: true,
};

async function expectGatewayError(run: () => Promise<unknown>, code: string, status?: number) {
  await assert.rejects(
    run,
    (error: unknown) => error instanceof AiGatewayError
      && error.code === code
      && (status === undefined || error.status === status),
    `Expected AiGatewayError ${code}`,
  );
}

async function main() {
  const db = getDb();
  const provider = new QueueProvider();
  const gateway = new AiGatewayService(provider, db);
  const createdRequestIds: string[] = [];

  try {
    const unauthorized: Array<[RequestIdentity, string]> = [
      [{ kind: "anonymous", clerkUserId: null }, "AUTH_REQUIRED"],
      [{ kind: "unmapped", clerkUserId: "unmapped" }, "ADMIN_ACCESS_REQUIRED"],
      [{
        kind: "customer",
        clerkUserId: "customer",
        customerId: randomUUID(),
        customerUserRole: "owner",
        approvalStatus: "approved",
        accountStatus: "active",
        priceGroupId: null,
      }, "ADMIN_ACCESS_REQUIRED"],
      [{ ...admin, role: "staff" }, "ADMIN_ACCESS_REQUIRED"],
      [{ ...admin, isActive: false }, "STAFF_INACTIVE"],
    ];
    for (const [identity, code] of unauthorized) {
      await expectGatewayError(() => gateway.generate(identity, request()), code);
    }
    assert.equal(provider.calls.length, 0);

    provider.queue.push({
      text: "Có 12 đơn đang chờ xử lý.",
      usage: { inputTokens: 40, outputTokens: 12, totalTokens: 52 },
      finishReason: "STOP",
      safetyMetadata: { candidateSafetyRatings: [] },
    });
    const textResult = await gateway.generate(admin, request());
    createdRequestIds.push(textResult.requestId);
    assert.equal(textResult.output.format, "text");
    if (textResult.output.format === "text") {
      assert.equal(textResult.output.text, "Có 12 đơn đang chờ xử lý.");
    }
    assert.equal(provider.calls[0].controls.temperature, 0.25);
    assert.equal(provider.calls[0].controls.maxOutputTokens, 2048);
    assert.match(provider.calls[0].systemInstruction, /không tự ý thực hiện hành động/i);
    assert.doesNotMatch(provider.calls[0].systemInstruction, /Tổng hợp dữ liệu vận hành nội bộ/);

    const jsonSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        yield: { type: "integer" },
      },
      required: ["title", "yield"],
    };
    provider.queue.push({
      text: JSON.stringify({ title: "Trà đào", yield: 20 }),
      usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      finishReason: "STOP",
      safetyMetadata: {},
    });
    const jsonResult = await gateway.generate(admin, request("recipe_draft", {
      format: "json",
      schema: jsonSchema,
    }));
    createdRequestIds.push(jsonResult.requestId);
    assert.deepEqual(jsonResult.output, {
      format: "json",
      value: { title: "Trà đào", yield: 20 },
    });
    assert.equal(provider.calls[1].controls.temperature, 0.5);
    assert.equal(provider.calls[1].controls.maxOutputTokens, 4096);

    provider.queue.push({
      text: "{invalid",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "STOP",
      safetyMetadata: {},
    });
    let invalidJsonRequestId = "";
    try {
      await gateway.generate(admin, request("recipe_draft", { format: "json", schema: jsonSchema }));
      assert.fail("Invalid JSON output unexpectedly succeeded.");
    } catch (error) {
      assert.ok(error instanceof AiGatewayError);
      assert.equal(error.code, "MODEL_OUTPUT_INVALID_JSON");
      invalidJsonRequestId = error.requestId ?? "";
      assert.ok(invalidJsonRequestId);
      createdRequestIds.push(invalidJsonRequestId);
    }

    provider.queue.push({
      text: JSON.stringify({ title: "Trà đào", yield: "20" }),
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "STOP",
      safetyMetadata: {},
    });
    let mismatchRequestId = "";
    try {
      await gateway.generate(admin, request("recipe_draft", { format: "json", schema: jsonSchema }));
      assert.fail("Schema mismatch unexpectedly succeeded.");
    } catch (error) {
      assert.ok(error instanceof AiGatewayError);
      assert.equal(error.code, "MODEL_OUTPUT_SCHEMA_MISMATCH");
      mismatchRequestId = error.requestId ?? "";
      assert.ok(mismatchRequestId);
      createdRequestIds.push(mismatchRequestId);
    }

    provider.queue.push(new AiProviderError("MOCK_UNAVAILABLE", 503, "Mock unavailable.", true));
    let providerFailureRequestId = "";
    try {
      await gateway.generate(admin, request());
      assert.fail("Provider failure unexpectedly succeeded.");
    } catch (error) {
      assert.ok(error instanceof AiGatewayError);
      assert.equal(error.code, "MOCK_UNAVAILABLE");
      assert.equal(error.status, 503);
      providerFailureRequestId = error.requestId ?? "";
      assert.ok(providerFailureRequestId);
      createdRequestIds.push(providerFailureRequestId);
    }

    const auditRows = await db.query<{
      request_id: string;
      status: string;
      provider: string;
      model: string;
      actor_type: string;
      actor_id: string;
      request_fingerprint: string;
      request_metadata: Record<string, unknown>;
      error_code: string | null;
      total_token_count: number | null;
    }>(
      `SELECT request_id::text,status,provider,model,actor_type,actor_id,
              request_fingerprint,request_metadata,error_code,total_token_count
       FROM ai_gateway_runs
       WHERE request_id = ANY($1::uuid[])
       ORDER BY created_at`,
      [createdRequestIds],
    );
    assert.equal(auditRows.rowCount, createdRequestIds.length);
    assert.ok(auditRows.rows.every((row) => row.provider === "mock" && row.model === "mock-a1b"));
    assert.ok(auditRows.rows.every((row) => row.actor_type === "staff" && row.actor_id === admin.staffId));
    assert.ok(auditRows.rows.every((row) => /^[0-9a-f]{64}$/.test(row.request_fingerprint)));
    assert.ok(auditRows.rows.every((row) => !JSON.stringify(row.request_metadata).includes("Tổng hợp dữ liệu")));
    assert.equal(auditRows.rows.find((row) => row.request_id === textResult.requestId)?.status, "succeeded");
    assert.equal(auditRows.rows.find((row) => row.request_id === textResult.requestId)?.total_token_count, 52);
    assert.equal(auditRows.rows.find((row) => row.request_id === invalidJsonRequestId)?.error_code, "MODEL_OUTPUT_INVALID_JSON");
    assert.equal(auditRows.rows.find((row) => row.request_id === mismatchRequestId)?.error_code, "MODEL_OUTPUT_SCHEMA_MISMATCH");
    assert.equal(auditRows.rows.find((row) => row.request_id === providerFailureRequestId)?.error_code, "MOCK_UNAVAILABLE");

    let providerCalledWhenAuditFailed = false;
    const auditFailureProvider: AiProvider = {
      name: "mock",
      model: "mock-audit-failure",
      async generate() {
        providerCalledWhenAuditFailed = true;
        return {
          text: "must not run",
          usage: { inputTokens: null, outputTokens: null, totalTokens: null },
          finishReason: null,
          safetyMetadata: {},
        };
      },
    };
    const failingDb = {
      async query() {
        throw new Error("audit unavailable");
      },
    } as unknown as Pick<Pool, "query">;
    const auditFailureGateway = new AiGatewayService(auditFailureProvider, failingDb);
    await expectGatewayError(
      () => auditFailureGateway.generate(admin, request()),
      "AI_AUDIT_UNAVAILABLE",
      503,
    );
    assert.equal(providerCalledWhenAuditFailed, false);

    console.log("AI A1b gateway integration passed.");
  } finally {
    if (createdRequestIds.length > 0) {
      await db.query(`DELETE FROM ai_gateway_runs WHERE request_id = ANY($1::uuid[])`, [createdRequestIds]);
    }
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
