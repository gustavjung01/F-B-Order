import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";
import { validateAiOutput } from "./ai-output-validator";
import type { AiGatewayService } from "./ai-gateway.service";
import { AI_SCHEMA_VERSION, type AiJsonObject, type AiJsonSchema, type AiJsonValue, type AiUseCase } from "./ai-schema";
import { AiProjectStoreError } from "./ai-project-store.service";

export type AiAgentReviewInput = {
  action?: unknown;
};

export type AiAgentRunInput = {
  modelId?: unknown;
  inputText?: unknown;
  inputJson?: unknown;
};

type AgentRecord = {
  id: string;
  project_version_id: string;
  agent_key: string;
  name: string;
  description: string | null;
  use_case: AiUseCase;
  model_key: string;
  review_status: string;
  is_enabled: boolean;
  input_schema: AiJsonSchema;
  output_schema: AiJsonSchema;
};

type ModelRecord = {
  id: string;
  project_version_id: string;
  model_key: string;
  provider: string;
  model_id: string;
  display_name: string;
  is_enabled: boolean;
};

function requireAdmin(identity: RequestIdentity): StaffIdentity {
  if (identity.kind === "anonymous") throw new AiProjectStoreError("AUTH_REQUIRED", 401, "Authentication is required.");
  if (identity.kind !== "staff" || identity.role !== "admin") {
    throw new AiProjectStoreError("ADMIN_ACCESS_REQUIRED", 403, "Administrator access is required.");
  }
  if (!identity.isActive) throw new AiProjectStoreError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  return identity;
}

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AiProjectStoreError("INVALID_REQUEST", 400, `${field} is required.`);
  }
  return value.trim();
}

function rowAgent(row: AgentRecord) {
  return {
    id: row.id,
    projectVersionId: row.project_version_id,
    agentKey: row.agent_key,
    name: row.name,
    description: row.description,
    useCase: row.use_case,
    modelKey: row.model_key,
    reviewStatus: row.review_status,
    isEnabled: Boolean(row.is_enabled),
    inputSchema: row.input_schema,
    outputSchema: row.output_schema,
  };
}

function rowModel(row: ModelRecord) {
  return {
    id: row.id,
    projectVersionId: row.project_version_id,
    modelKey: row.model_key,
    provider: row.provider,
    modelId: row.model_id,
    displayName: row.display_name,
    isEnabled: Boolean(row.is_enabled),
  };
}

function deriveInputText(inputText: unknown, validatedInput: AiJsonValue) {
  if (typeof inputText === "string" && inputText.trim()) return inputText.trim();
  if (validatedInput && typeof validatedInput === "object" && !Array.isArray(validatedInput)) {
    const candidate = (validatedInput as Record<string, AiJsonValue>).text;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "Run approved AI agent with validated JSON input.";
}

function buildGatewayContext(agent: AgentRecord, model: ModelRecord, validatedInput: AiJsonValue): AiJsonObject {
  return {
    source: "ai_project_agent",
    projectVersionId: agent.project_version_id,
    agentId: agent.id,
    agentKey: agent.agent_key,
    modelId: model.id,
    modelKey: model.model_key,
    modelCatalogId: model.model_id,
    agentInput: validatedInput,
  };
}

export class AiAgentRunnerService {
  constructor(
    private readonly gateway: AiGatewayService | null,
    private readonly db: Pool = getDb(),
  ) {}

  async reviewAgent(identity: RequestIdentity, agentId: string, input: AiAgentReviewInput) {
    const admin = requireAdmin(identity);
    const action = requireText(input.action, "action");
    let reviewStatus: "approved" | "rejected" | undefined;
    let isEnabled: boolean | undefined;
    if (action === "approve") {
      reviewStatus = "approved";
      isEnabled = true;
    } else if (action === "reject") {
      reviewStatus = "rejected";
      isEnabled = false;
    } else if (action === "disable") {
      isEnabled = false;
    } else {
      throw new AiProjectStoreError("INVALID_REVIEW_ACTION", 400, "Review action must be approve, reject, or disable.");
    }

    const existing = await this.db.query<AgentRecord>(
      `SELECT id,project_version_id,agent_key,name,description,use_case,model_key,review_status,
              is_enabled,input_schema,output_schema
       FROM ai_project_agents
       WHERE id=$1`,
      [agentId],
    );
    if (existing.rowCount === 0) throw new AiProjectStoreError("AGENT_NOT_FOUND", 404, "AI agent was not found.");
    const current = existing.rows[0];
    if (action === "approve" && current.review_status !== "untrusted") {
      throw new AiProjectStoreError("INVALID_REVIEW_TRANSITION", 409, "Only untrusted agents can be approved.");
    }
    if (action === "reject" && current.review_status !== "untrusted") {
      throw new AiProjectStoreError("INVALID_REVIEW_TRANSITION", 409, "Only untrusted agents can be rejected.");
    }
    if (action === "disable" && current.review_status !== "approved") {
      throw new AiProjectStoreError("INVALID_REVIEW_TRANSITION", 409, "Only approved agents can be disabled.");
    }

    const result = await this.db.query<AgentRecord>(
      `UPDATE ai_project_agents
       SET review_status=COALESCE($2, review_status), is_enabled=COALESCE($3, is_enabled)
       WHERE id=$1
       RETURNING id,project_version_id,agent_key,name,description,use_case,model_key,review_status,
                 is_enabled,input_schema,output_schema`,
      [agentId, reviewStatus ?? null, isEnabled ?? null],
    );

    return {
      agent: rowAgent(result.rows[0]),
      reviewedByStaffId: admin.staffId,
      action,
    };
  }

  async runAgent(identity: RequestIdentity, agentId: string, input: AiAgentRunInput) {
    const admin = requireAdmin(identity);
    if (!this.gateway) {
      throw new AiProjectStoreError("AI_GATEWAY_NOT_CONFIGURED", 503, "AI gateway is not configured.");
    }
    const modelId = requireText(input.modelId, "modelId");
    if (input.inputJson === undefined) throw new AiProjectStoreError("INVALID_REQUEST", 400, "inputJson is required.");

    const agentResult = await this.db.query<AgentRecord>(
      `SELECT id,project_version_id,agent_key,name,description,use_case,model_key,review_status,
              is_enabled,input_schema,output_schema
       FROM ai_project_agents
       WHERE id=$1`,
      [agentId],
    );
    if (agentResult.rowCount === 0) throw new AiProjectStoreError("AGENT_NOT_FOUND", 404, "AI agent was not found.");
    const agent = agentResult.rows[0];
    if (agent.review_status !== "approved") {
      throw new AiProjectStoreError("AGENT_NOT_APPROVED", 409, "Only approved agents can run.");
    }
    if (!agent.is_enabled) throw new AiProjectStoreError("AGENT_DISABLED", 409, "AI agent is disabled.");

    const modelResult = await this.db.query<ModelRecord>(
      `SELECT id,project_version_id,model_key,provider,model_id,display_name,is_enabled
       FROM ai_project_models
       WHERE id=$1 AND project_version_id=$2`,
      [modelId, agent.project_version_id],
    );
    if (modelResult.rowCount === 0) throw new AiProjectStoreError("MODEL_NOT_FOUND", 404, "AI model was not found.");
    const model = modelResult.rows[0];
    if (!model.is_enabled) throw new AiProjectStoreError("MODEL_DISABLED", 409, "AI model is disabled.");
    if (model.model_key !== agent.model_key) {
      throw new AiProjectStoreError("AGENT_MODEL_MISMATCH", 409, "Selected model does not match the approved agent.");
    }

    let validatedInput: AiJsonValue;
    try {
      validatedInput = validateAiOutput(input.inputJson, agent.input_schema);
    } catch (error) {
      throw new AiProjectStoreError(
        "AGENT_INPUT_SCHEMA_MISMATCH",
        400,
        error instanceof Error ? error.message : "Agent input does not match schema.",
      );
    }

    const gatewayResult = await this.gateway.generate(identity, {
      schemaVersion: AI_SCHEMA_VERSION,
      useCase: agent.use_case,
      input: {
        text: deriveInputText(input.inputText, validatedInput),
        context: buildGatewayContext(agent, model, validatedInput),
      },
      response: {
        format: "json",
        schema: agent.output_schema,
      },
      controls: { temperature: 0.2, maxOutputTokens: 1024 },
      metadata: { correlationId: `a1e-${randomUUID()}` },
    });

    if (gatewayResult.output.format !== "json") {
      throw new AiProjectStoreError("AGENT_OUTPUT_NOT_JSON", 502, "Agent output was not JSON.");
    }

    const documentResult = await this.db.query(
      `INSERT INTO ai_documents (
         source,status,project_version_id,agent_id,model_id,schema_version,json_payload,
         validation_status,validation_errors,created_by_staff_id,updated_by_staff_id
       ) VALUES ('ai','draft',$1,$2,$3,$4,$5::jsonb,'valid','[]'::jsonb,$6,$6)
       RETURNING id,source,status,schema_version,json_payload,validation_status,validation_errors,version,created_at,updated_at`,
      [
        agent.project_version_id,
        agent.id,
        model.id,
        AI_SCHEMA_VERSION,
        JSON.stringify(gatewayResult.output.value),
        admin.staffId,
      ],
    );
    const document = documentResult.rows[0];

    return {
      agent: rowAgent(agent),
      model: rowModel(model),
      gateway: {
        requestId: gatewayResult.requestId,
        provider: gatewayResult.provider,
        model: gatewayResult.model,
        usage: gatewayResult.usage,
        finishReason: gatewayResult.finishReason,
        latencyMs: gatewayResult.latencyMs,
      },
      document: {
        id: document.id as string,
        source: document.source as string,
        status: document.status as string,
        schemaVersion: document.schema_version as string,
        jsonPayload: document.json_payload as AiJsonValue,
        validationStatus: document.validation_status as string,
        validationErrors: document.validation_errors,
        version: Number(document.version),
        createdAt: document.created_at as string,
        updatedAt: document.updated_at as string,
      },
    };
  }
}
