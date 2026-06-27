import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";
import { getDb } from "../../db/pool";
import {
  AiProjectSchemaError,
  parseAiProjectDefinition,
  type AiProjectDefinition,
} from "./ai-project-schema";
import { validateAiOutput } from "./ai-output-validator";
import { parseAiJsonSchema, type AiJsonSchema, type AiJsonValue } from "./ai-schema";

export class AiProjectStoreError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type AiProjectUploadInput = {
  filename?: string;
  json: unknown;
};

export type AiManualDraftInput = {
  schemaVersion?: string;
  jsonPayload: unknown;
  schema?: unknown;
};

function requireAdmin(identity: RequestIdentity): StaffIdentity {
  if (identity.kind === "anonymous") throw new AiProjectStoreError("AUTH_REQUIRED", 401, "Authentication is required.");
  if (identity.kind !== "staff" || identity.role !== "admin") {
    throw new AiProjectStoreError("ADMIN_ACCESS_REQUIRED", 403, "Administrator access is required.");
  }
  if (!identity.isActive) throw new AiProjectStoreError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  return identity;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function filename(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 240);
  return normalized || null;
}

function rowProject(row: any) {
  return {
    id: row.id as string,
    projectKey: row.project_key as string,
    name: row.name as string,
    description: row.description as string | null,
    activeVersionId: row.active_version_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowVersion(row: any) {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    version: Number(row.version),
    schemaVersion: row.schema_version as string,
    sourceFilename: row.source_filename as string | null,
    fileHash: row.file_hash as string,
    createdAt: row.created_at as string,
  };
}

export class AiProjectStoreService {
  constructor(private readonly db: Pool = getDb()) {}

  async uploadProject(identity: RequestIdentity, input: AiProjectUploadInput) {
    const admin = requireAdmin(identity);
    let definition: AiProjectDefinition;
    try {
      definition = parseAiProjectDefinition(input.json);
    } catch (error) {
      if (error instanceof AiProjectSchemaError) {
        throw new AiProjectStoreError(error.code, 400, error.message, { path: error.path });
      }
      throw error;
    }
    const fileHash = hashJson(input.json);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const projectResult = await client.query(
        `INSERT INTO ai_projects (project_key,name,description,created_by_staff_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (project_key)
         DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description
         RETURNING *`,
        [definition.project.key, definition.project.name, definition.project.description, admin.staffId],
      );
      const project = projectResult.rows[0];
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version),0)+1 AS next_version FROM ai_project_versions WHERE project_id=$1`,
        [project.id],
      );
      const nextVersion = Number(versionResult.rows[0].next_version);
      const storedVersion = await client.query(
        `INSERT INTO ai_project_versions (
           project_id,version,schema_version,source_filename,file_hash,json_payload,created_by_staff_id
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         RETURNING *`,
        [
          project.id,
          nextVersion,
          definition.schemaVersion,
          filename(input.filename),
          fileHash,
          JSON.stringify(input.json),
          admin.staffId,
        ],
      );
      const projectVersion = storedVersion.rows[0];
      for (const model of definition.models) {
        await client.query(
          `INSERT INTO ai_project_models (
             project_version_id,model_key,provider,model_id,display_name,configuration,is_enabled
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
          [
            projectVersion.id,
            model.key,
            model.provider,
            model.modelId,
            model.displayName,
            JSON.stringify(model.configuration),
            model.enabled,
          ],
        );
      }
      for (const agent of definition.agents) {
        await client.query(
          `INSERT INTO ai_project_agents (
             project_version_id,agent_key,name,description,use_case,model_key,system_instruction,
             input_schema,output_schema,configuration,is_enabled
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
          [
            projectVersion.id,
            agent.key,
            agent.name,
            agent.description,
            agent.useCase,
            agent.modelKey,
            agent.systemInstruction,
            JSON.stringify(agent.inputSchema),
            JSON.stringify(agent.outputSchema),
            JSON.stringify(agent.configuration),
            agent.enabled,
          ],
        );
      }
      await client.query("UPDATE ai_projects SET active_version_id=$1 WHERE id=$2", [projectVersion.id, project.id]);
      await client.query("COMMIT");
      return {
        project: { ...rowProject(project), activeVersionId: projectVersion.id as string },
        version: rowVersion(projectVersion),
        counts: { models: definition.models.length, agents: definition.agents.length },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error && typeof error === "object" && "code" in error && (error as any).code === "23505") {
        throw new AiProjectStoreError("PROJECT_VERSION_ALREADY_EXISTS", 409, "This project JSON file is already stored.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listProjects(identity: RequestIdentity) {
    requireAdmin(identity);
    const result = await this.db.query(
      `SELECT * FROM ai_projects ORDER BY updated_at DESC, created_at DESC LIMIT 100`,
    );
    return { projects: result.rows.map(rowProject) };
  }

  async listVersions(identity: RequestIdentity, projectId: string) {
    requireAdmin(identity);
    const result = await this.db.query(
      `SELECT * FROM ai_project_versions WHERE project_id=$1 ORDER BY version DESC`,
      [projectId],
    );
    return { versions: result.rows.map(rowVersion) };
  }

  async loadAgents(identity: RequestIdentity, projectVersionId: string) {
    requireAdmin(identity);
    const result = await this.db.query(
      `SELECT id,agent_key,name,description,use_case,model_key,review_status,is_enabled,input_schema,output_schema
       FROM ai_project_agents
       WHERE project_version_id=$1
       ORDER BY agent_key ASC`,
      [projectVersionId],
    );
    return {
      agents: result.rows.map((row) => ({
        id: row.id as string,
        agentKey: row.agent_key as string,
        name: row.name as string,
        description: row.description as string | null,
        useCase: row.use_case as string,
        modelKey: row.model_key as string,
        reviewStatus: row.review_status as string,
        isEnabled: Boolean(row.is_enabled),
        inputSchema: row.input_schema,
        outputSchema: row.output_schema,
      })),
    };
  }

  async loadModels(identity: RequestIdentity, projectVersionId: string) {
    requireAdmin(identity);
    const result = await this.db.query(
      `SELECT id,model_key,provider,model_id,display_name,is_enabled
       FROM ai_project_models
       WHERE project_version_id=$1
       ORDER BY model_key ASC`,
      [projectVersionId],
    );
    return {
      models: result.rows.map((row) => ({
        id: row.id as string,
        modelKey: row.model_key as string,
        provider: row.provider as string,
        modelId: row.model_id as string,
        displayName: row.display_name as string,
        isEnabled: Boolean(row.is_enabled),
      })),
    };
  }

  async saveManualDraft(identity: RequestIdentity, input: AiManualDraftInput) {
    const admin = requireAdmin(identity);
    let validationStatus: "valid" | "invalid" = "valid";
    const validationErrors: Array<Record<string, string>> = [];
    if (input.schema !== undefined) {
      try {
        const schema: AiJsonSchema = parseAiJsonSchema(input.schema, "schema");
        validateAiOutput(input.jsonPayload, schema);
      } catch (error) {
        validationStatus = "invalid";
        validationErrors.push({
          code: error instanceof Error && "code" in error ? String((error as any).code) : "VALIDATION_FAILED",
          message: error instanceof Error ? error.message : "Validation failed.",
        });
      }
    }
    const result = await this.db.query(
      `INSERT INTO ai_documents (
         source,status,schema_version,json_payload,validation_status,validation_errors,
         created_by_staff_id,updated_by_staff_id
       ) VALUES ('manual','draft',$1,$2::jsonb,$3,$4::jsonb,$5,$5)
       RETURNING id,source,status,schema_version,json_payload,validation_status,validation_errors,version,created_at,updated_at`,
      [
        input.schemaVersion?.trim() || "manual-json",
        JSON.stringify(input.jsonPayload),
        validationStatus,
        JSON.stringify(validationErrors),
        admin.staffId,
      ],
    );
    const row = result.rows[0];
    return {
      document: {
        id: row.id as string,
        source: row.source as string,
        status: row.status as string,
        schemaVersion: row.schema_version as string,
        jsonPayload: row.json_payload as AiJsonValue,
        validationStatus: row.validation_status as string,
        validationErrors: row.validation_errors,
        version: Number(row.version),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      },
    };
  }
}
