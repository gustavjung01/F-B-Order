import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";

export class AiAppRuntimeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type CreateAiAppInput = {
  appKey: string;
  name: string;
  description?: string | null;
  projectVersionId: string;
  runtimeConfig?: Record<string, unknown>;
};

export type LoadAgentInput = {
  agentId: string;
  modelId: string;
  slotKey?: string;
  runtimeConfig?: Record<string, unknown>;
};

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function requireAdmin(identity: RequestIdentity): StaffIdentity {
  if (identity.kind === "anonymous") throw new AiAppRuntimeError("AUTH_REQUIRED", 401, "Authentication is required.");
  if (identity.kind !== "staff" || identity.role !== "admin") {
    throw new AiAppRuntimeError("ADMIN_ACCESS_REQUIRED", 403, "Administrator access is required.");
  }
  if (!identity.isActive) throw new AiAppRuntimeError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  return identity;
}

function key(value: unknown, field: string) {
  if (typeof value !== "string" || !KEY_PATTERN.test(value.trim())) {
    throw new AiAppRuntimeError("INVALID_KEY", 400, `${field} is invalid.`);
  }
  return value.trim();
}

function text(value: unknown, field: string, maxLength = 200) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AiAppRuntimeError("INVALID_TEXT", 400, `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AiAppRuntimeError("TEXT_TOO_LONG", 400, `${field} is too long.`);
  return normalized;
}

function optionalConfig(value: unknown) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiAppRuntimeError("INVALID_CONFIG", 400, "runtimeConfig must be an object.");
  }
  return value as Record<string, unknown>;
}

function appRow(row: any) {
  return {
    id: row.id as string,
    appKey: row.app_key as string,
    name: row.name as string,
    description: row.description as string | null,
    projectVersionId: row.project_version_id as string,
    status: row.status as string,
    runtimeConfig: row.runtime_config,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function appAgentRow(row: any) {
  return {
    id: row.id as string,
    appId: row.app_id as string,
    agentId: row.agent_id as string,
    modelId: row.model_id as string,
    slotKey: row.slot_key as string,
    isEnabled: Boolean(row.is_enabled),
    runtimeConfig: row.runtime_config,
    agentKey: row.agent_key as string,
    agentName: row.agent_name as string,
    useCase: row.use_case as string,
    reviewStatus: row.review_status as string,
    modelKey: row.model_key as string,
    modelIdValue: row.model_id_value as string,
    provider: row.provider as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class AiAppRuntimeService {
  constructor(private readonly db: Pool = getDb()) {}

  async approveAgent(identity: RequestIdentity, agentId: string, status: "reviewed" | "approved" | "rejected") {
    requireAdmin(identity);
    const result = await this.db.query(
      `UPDATE ai_project_agents
       SET review_status=$2
       WHERE id=$1
       RETURNING id,agent_key,name,use_case,model_key,review_status,is_enabled`,
      [agentId, status],
    );
    if ((result.rowCount ?? 0) !== 1) throw new AiAppRuntimeError("AGENT_NOT_FOUND", 404, "Agent not found.");
    const row = result.rows[0];
    return {
      agent: {
        id: row.id as string,
        agentKey: row.agent_key as string,
        name: row.name as string,
        useCase: row.use_case as string,
        modelKey: row.model_key as string,
        reviewStatus: row.review_status as string,
        isEnabled: Boolean(row.is_enabled),
      },
    };
  }

  async createApp(identity: RequestIdentity, input: CreateAiAppInput) {
    const admin = requireAdmin(identity);
    const appKey = key(input.appKey, "appKey");
    const name = text(input.name, "name");
    const description = typeof input.description === "string" && input.description.trim() ? input.description.trim() : null;
    const result = await this.db.query(
      `INSERT INTO ai_apps (
         app_key,name,description,project_version_id,runtime_config,created_by_staff_id,updated_by_staff_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6)
       ON CONFLICT (app_key)
       DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
                     project_version_id=EXCLUDED.project_version_id,
                     runtime_config=EXCLUDED.runtime_config,
                     updated_by_staff_id=EXCLUDED.updated_by_staff_id
       RETURNING *`,
      [appKey, name, description, input.projectVersionId, JSON.stringify(optionalConfig(input.runtimeConfig)), admin.staffId],
    );
    return { app: appRow(result.rows[0]) };
  }

  async listApps(identity: RequestIdentity) {
    requireAdmin(identity);
    const result = await this.db.query(
      `SELECT * FROM ai_apps ORDER BY updated_at DESC, created_at DESC LIMIT 100`,
    );
    return { apps: result.rows.map(appRow) };
  }

  async loadAgentIntoApp(identity: RequestIdentity, appId: string, input: LoadAgentInput) {
    const admin = requireAdmin(identity);
    const slotKey = key(input.slotKey || "primary", "slotKey");
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const appResult = await client.query(`SELECT * FROM ai_apps WHERE id=$1`, [appId]);
      if ((appResult.rowCount ?? 0) !== 1) throw new AiAppRuntimeError("APP_NOT_FOUND", 404, "AI app not found.");
      const app = appResult.rows[0];
      const agentResult = await client.query(
        `SELECT * FROM ai_project_agents WHERE id=$1 AND project_version_id=$2`,
        [input.agentId, app.project_version_id],
      );
      if ((agentResult.rowCount ?? 0) !== 1) {
        throw new AiAppRuntimeError("AGENT_NOT_IN_APP_VERSION", 400, "Agent does not belong to this app project version.");
      }
      const agent = agentResult.rows[0];
      if (!agent.is_enabled) throw new AiAppRuntimeError("AGENT_DISABLED", 400, "Agent is disabled.");
      if (agent.review_status !== "approved") {
        throw new AiAppRuntimeError("AGENT_NOT_APPROVED", 400, "Agent must be approved before loading into app runtime.");
      }
      const modelResult = await client.query(
        `SELECT * FROM ai_project_models WHERE id=$1 AND project_version_id=$2`,
        [input.modelId, app.project_version_id],
      );
      if ((modelResult.rowCount ?? 0) !== 1) {
        throw new AiAppRuntimeError("MODEL_NOT_IN_APP_VERSION", 400, "Model does not belong to this app project version.");
      }
      const model = modelResult.rows[0];
      if (!model.is_enabled) throw new AiAppRuntimeError("MODEL_DISABLED", 400, "Model is disabled.");
      if (model.model_key !== agent.model_key) {
        throw new AiAppRuntimeError("MODEL_NOT_ALLOWED_FOR_AGENT", 400, "Agent is not configured for this model.");
      }
      const inserted = await client.query(
        `INSERT INTO ai_app_agents (
           app_id,agent_id,model_id,slot_key,runtime_config,created_by_staff_id,updated_by_staff_id
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6)
         ON CONFLICT (app_id, slot_key)
         DO UPDATE SET agent_id=EXCLUDED.agent_id, model_id=EXCLUDED.model_id,
                       runtime_config=EXCLUDED.runtime_config,
                       is_enabled=true,
                       updated_by_staff_id=EXCLUDED.updated_by_staff_id
         RETURNING *`,
        [appId, input.agentId, input.modelId, slotKey, JSON.stringify(optionalConfig(input.runtimeConfig)), admin.staffId],
      );
      await client.query("COMMIT");
      return { appAgent: inserted.rows[0] };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listAppAgents(identity: RequestIdentity, appId: string) {
    requireAdmin(identity);
    const result = await this.db.query(
      `SELECT aa.*, a.agent_key, a.name AS agent_name, a.use_case, a.review_status,
              m.model_key, m.model_id AS model_id_value, m.provider
       FROM ai_app_agents aa
       JOIN ai_project_agents a ON a.id=aa.agent_id
       JOIN ai_project_models m ON m.id=aa.model_id
       WHERE aa.app_id=$1
       ORDER BY aa.slot_key ASC`,
      [appId],
    );
    return { appAgents: result.rows.map(appAgentRow) };
  }
}
