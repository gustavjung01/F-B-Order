import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { AiGatewayUsage, AiUseCase } from "./ai-schema";

export type AiAuditActor = {
  type: "system" | "customer" | "staff";
  id: string | null;
};

export type StartAiGatewayRunInput = {
  requestId: string;
  schemaVersion: string;
  useCase: AiUseCase;
  provider: "vertex_ai" | "mock";
  model: string;
  actor: AiAuditActor;
  responseFormat: "text" | "json";
  requestFingerprint: string;
  inputCharCount: number;
  requestMetadata: Record<string, unknown>;
};

export type FinishAiGatewayRunInput = {
  requestId: string;
  status: "succeeded" | "failed" | "rejected";
  outputCharCount?: number | null;
  usage?: AiGatewayUsage;
  latencyMs: number;
  finishReason?: string | null;
  errorCode?: string | null;
  safetyMetadata?: Record<string, unknown>;
};

export async function startAiGatewayRun(
  input: StartAiGatewayRunInput,
  db: Pick<Pool, "query"> = getDb(),
) {
  await db.query(
    `INSERT INTO ai_gateway_runs (
       request_id,schema_version,use_case,provider,model,actor_type,actor_id,status,
       response_format,request_fingerprint,input_char_count,request_metadata
     ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,'started',$8,$9,$10,$11::jsonb)`,
    [
      input.requestId,
      input.schemaVersion,
      input.useCase,
      input.provider,
      input.model,
      input.actor.type,
      input.actor.id,
      input.responseFormat,
      input.requestFingerprint,
      input.inputCharCount,
      JSON.stringify(input.requestMetadata),
    ],
  );
}

export async function finishAiGatewayRun(
  input: FinishAiGatewayRunInput,
  db: Pick<Pool, "query"> = getDb(),
) {
  const result = await db.query(
    `UPDATE ai_gateway_runs
     SET status=$2,
         output_char_count=$3,
         input_token_count=$4,
         output_token_count=$5,
         total_token_count=$6,
         latency_ms=$7,
         finish_reason=$8,
         error_code=$9,
         safety_metadata=$10::jsonb,
         completed_at=now()
     WHERE request_id=$1::uuid AND status='started'`,
    [
      input.requestId,
      input.status,
      input.outputCharCount ?? null,
      input.usage?.inputTokens ?? null,
      input.usage?.outputTokens ?? null,
      input.usage?.totalTokens ?? null,
      input.latencyMs,
      input.finishReason ?? null,
      input.errorCode ?? null,
      JSON.stringify(input.safetyMetadata ?? {}),
    ],
  );
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error(`AI gateway audit row was not completed: ${input.requestId}`);
  }
}
