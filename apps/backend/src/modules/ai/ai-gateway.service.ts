import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";
import { validateAiOutput } from "./ai-output-validator";
import { resolveAiGatewayPolicy } from "./ai-gateway.policy";
import { AiProviderError, type AiProvider } from "./ai-gateway.provider";
import {
  finishAiGatewayRun,
  startAiGatewayRun,
  type AiAuditActor,
} from "./ai-gateway.repository";
import {
  AI_SCHEMA_VERSION,
  AiSchemaError,
  parseAiGatewayRequest,
  type AiGatewayRequest,
  type AiGatewaySuccessResponse,
  type AiJsonValue,
} from "./ai-schema";

export class AiGatewayError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function requireActiveAdmin(identity: RequestIdentity): StaffIdentity {
  if (identity.kind === "anonymous") {
    throw new AiGatewayError("AUTH_REQUIRED", 401, "Authentication is required.");
  }
  if (identity.kind !== "staff" || identity.role !== "admin") {
    throw new AiGatewayError("ADMIN_ACCESS_REQUIRED", 403, "Administrator access is required.");
  }
  if (!identity.isActive) {
    throw new AiGatewayError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  }
  return identity;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function requestFingerprint(request: AiGatewayRequest) {
  return createHash("sha256").update(canonicalJson(request), "utf8").digest("hex");
}

function inputCharCount(request: AiGatewayRequest) {
  return request.input.text.length + (request.input.context ? JSON.stringify(request.input.context).length : 0);
}

function requestMetadata(
  request: AiGatewayRequest,
  appliedControls: AiGatewayRequest["controls"],
): Record<string, unknown> {
  return {
    correlationId: request.metadata?.correlationId ?? null,
    idempotencyKeyHash: request.metadata?.idempotencyKey
      ? createHash("sha256").update(request.metadata.idempotencyKey, "utf8").digest("hex")
      : null,
    contextPresent: Boolean(request.input.context),
    contextKeyCount: request.input.context ? Object.keys(request.input.context).length : 0,
    requestedTemperature: request.controls.temperature,
    appliedTemperature: appliedControls.temperature,
    requestedMaxOutputTokens: request.controls.maxOutputTokens,
    appliedMaxOutputTokens: appliedControls.maxOutputTokens,
  };
}

function actorFromAdmin(admin: StaffIdentity): AiAuditActor {
  return { type: "staff", id: admin.staffId };
}

function mapExecutionError(error: unknown, requestId: string): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  if (error instanceof AiProviderError) {
    return new AiGatewayError(
      error.code,
      error.status,
      error.message,
      requestId,
      { retryable: error.retryable, provider: error.details },
    );
  }
  if (error instanceof AiSchemaError) {
    return new AiGatewayError(error.code, 502, error.message, requestId, { path: error.path });
  }
  if (error instanceof SyntaxError) {
    return new AiGatewayError(
      "MODEL_OUTPUT_INVALID_JSON",
      502,
      "AI provider returned invalid JSON.",
      requestId,
    );
  }
  return new AiGatewayError(
    "AI_GATEWAY_EXECUTION_FAILED",
    500,
    "AI gateway execution failed.",
    requestId,
  );
}

function failureStatus(error: AiGatewayError): "failed" | "rejected" {
  return error.code === "VERTEX_OUTPUT_BLOCKED" ? "rejected" : "failed";
}

export class AiGatewayService {
  constructor(
    readonly provider: AiProvider,
    private readonly db: Pick<Pool, "query">,
  ) {}

  async generate(identity: RequestIdentity, rawRequest: unknown): Promise<AiGatewaySuccessResponse> {
    const admin = requireActiveAdmin(identity);
    const request = parseAiGatewayRequest(rawRequest);
    const requestId = randomUUID();
    const { policy, controls } = resolveAiGatewayPolicy(request);
    const startedAt = Date.now();

    try {
      await startAiGatewayRun({
        requestId,
        schemaVersion: AI_SCHEMA_VERSION,
        useCase: request.useCase,
        provider: this.provider.name,
        model: this.provider.model,
        actor: actorFromAdmin(admin),
        responseFormat: request.response.format,
        requestFingerprint: requestFingerprint(request),
        inputCharCount: inputCharCount(request),
        requestMetadata: requestMetadata(request, controls),
      }, this.db);
    } catch {
      throw new AiGatewayError(
        "AI_AUDIT_UNAVAILABLE",
        503,
        "AI gateway audit storage is unavailable.",
        requestId,
      );
    }

    let providerResult;
    let output: AiGatewaySuccessResponse["output"];
    try {
      providerResult = await this.provider.generate({
        requestId,
        useCase: request.useCase,
        model: this.provider.model,
        systemInstruction: policy.systemInstruction,
        input: request.input,
        response: request.response,
        controls,
      });
      if (request.response.format === "text") {
        const text = providerResult.text.trim();
        if (!text) {
          throw new AiGatewayError(
            "MODEL_OUTPUT_EMPTY",
            502,
            "AI provider returned an empty response.",
            requestId,
          );
        }
        output = { format: "text", text };
      } else {
        const parsed = JSON.parse(providerResult.text) as unknown;
        const value: AiJsonValue = validateAiOutput(parsed, request.response.schema);
        output = { format: "json", value };
      }
    } catch (error) {
      const mapped = mapExecutionError(error, requestId);
      try {
        await finishAiGatewayRun({
          requestId,
          status: failureStatus(mapped),
          latencyMs: Date.now() - startedAt,
          errorCode: mapped.code,
          safetyMetadata: error instanceof AiProviderError && error.details
            ? { provider: error.details }
            : {},
        }, this.db);
      } catch {
        throw new AiGatewayError(
          "AI_AUDIT_UNAVAILABLE",
          503,
          "AI gateway failure could not be audited.",
          requestId,
        );
      }
      throw mapped;
    }

    const latencyMs = Date.now() - startedAt;
    try {
      await finishAiGatewayRun({
        requestId,
        status: "succeeded",
        outputCharCount: providerResult.text.length,
        usage: providerResult.usage,
        latencyMs,
        finishReason: providerResult.finishReason,
        safetyMetadata: providerResult.safetyMetadata,
      }, this.db);
    } catch {
      throw new AiGatewayError(
        "AI_AUDIT_UNAVAILABLE",
        503,
        "AI gateway result could not be audited.",
        requestId,
      );
    }

    return {
      schemaVersion: AI_SCHEMA_VERSION,
      requestId,
      useCase: request.useCase,
      provider: this.provider.name,
      model: this.provider.model,
      output,
      usage: providerResult.usage,
      finishReason: providerResult.finishReason,
      latencyMs,
    };
  }
}
