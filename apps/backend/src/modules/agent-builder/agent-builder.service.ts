import type { Pool, PoolClient } from "pg";

import { getDb } from "../../db/pool";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";
import type {
  CreateAgentInput,
  CreateAgentVersionInput,
  RuntimeBlocker,
} from "./agent-builder.types";
import {
  normalizeAgentKey,
  normalizeVersionNumber,
  parseCreateAgentInput,
  parseCreateAgentVersionInput,
} from "./agent-builder.validation";


type AgentRow = {
  id: string;
  agent_key: string;
  status: string;
};

type ResourceRow = {
  id: string;
  resource_key: string;
  status: string;
  implementation_status?: string;
};

function assertAdmin(identity: StaffIdentity): void {
  if (!identity.isActive || identity.role !== "admin") {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
}

async function assertStoredAdmin(client: PoolClient, identity: StaffIdentity): Promise<void> {
  const result = await client.query<{ role: string; is_active: boolean }>(
    `SELECT role, is_active FROM staff_users WHERE id = $1 FOR SHARE`,
    [identity.staffId],
  );
  const staff = result.rows[0];
  if (!staff || staff.role !== "admin" || staff.is_active !== true) {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
}

async function getAgentRowForUpdate(client: PoolClient, agentKey: string): Promise<AgentRow> {
  const result = await client.query<AgentRow>(
    `SELECT id::text, agent_key, status
     FROM ai_agent_definitions
     WHERE agent_key = $1
     FOR UPDATE`,
    [agentKey],
  );
  const agent = result.rows[0];
  if (!agent) {
    throw new OrderEngineError("AGENT_NOT_FOUND", 404, "Agent was not found.");
  }
  if (agent.status === "archived") {
    throw new OrderEngineError("AGENT_ARCHIVED", 409, "Archived agents cannot be changed.");
  }
  return agent;
}

async function getResourceByKey(
  client: PoolClient,
  table: "ai_model_profiles" | "ai_personas" | "ai_policy_profiles",
  keyColumn: "profile_key" | "persona_key" | "policy_key",
  key: string,
): Promise<ResourceRow> {
  const result = await client.query<ResourceRow>(
    `SELECT id::text, ${keyColumn} AS resource_key, status
     FROM ${table}
     WHERE ${keyColumn} = $1`,
    [key],
  );
  const row = result.rows[0];
  if (!row) {
    throw new OrderEngineError("AGENT_RESOURCE_NOT_FOUND", 400, `${key} is not an available builder resource.`);
  }
  if (row.status === "archived") {
    throw new OrderEngineError("AGENT_RESOURCE_ARCHIVED", 409, `${key} is archived and cannot be selected.`);
  }
  return row;
}

async function getSelectedTools(client: PoolClient, toolKeys: string[]): Promise<ResourceRow[]> {
  if (toolKeys.length === 0) return [];
  const result = await client.query<ResourceRow>(
    `SELECT id::text, tool_key AS resource_key, status, implementation_status
     FROM ai_tool_definitions
     WHERE tool_key = ANY($1::text[])`,
    [toolKeys],
  );
  const missing = toolKeys.filter((key) => !result.rows.some((row) => row.resource_key === key));
  if (missing.length > 0) {
    throw new OrderEngineError("AGENT_TOOL_NOT_FOUND", 400, "One or more configured tools were not found.", {
      missing,
    });
  }
  const archived = result.rows.filter((row) => row.status === "archived").map((row) => row.resource_key);
  if (archived.length > 0) {
    throw new OrderEngineError("AGENT_TOOL_ARCHIVED", 409, "Archived tools cannot be selected.", { archived });
  }
  return result.rows;
}

async function getSelectedKnowledgeSources(client: PoolClient, keys: string[]): Promise<ResourceRow[]> {
  if (keys.length === 0) return [];
  const result = await client.query<ResourceRow>(
    `SELECT id::text, source_key AS resource_key, status
     FROM ai_knowledge_sources
     WHERE source_key = ANY($1::text[])`,
    [keys],
  );
  const missing = keys.filter((key) => !result.rows.some((row) => row.resource_key === key));
  if (missing.length > 0) {
    throw new OrderEngineError("AGENT_KNOWLEDGE_SOURCE_NOT_FOUND", 400, "One or more knowledge sources were not found.", {
      missing,
    });
  }
  const archived = result.rows.filter((row) => row.status === "archived").map((row) => row.resource_key);
  if (archived.length > 0) {
    throw new OrderEngineError("AGENT_KNOWLEDGE_SOURCE_ARCHIVED", 409, "Archived knowledge sources cannot be selected.", {
      archived,
    });
  }
  return result.rows;
}

async function insertChangeLog(
  client: PoolClient,
  input: {
    agentId: string;
    agentVersionId?: string | null;
    actorId: string;
    action: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ai_agent_change_logs (
       agent_id,
       agent_version_id,
       actor_type,
       actor_id,
       action,
       payload
     ) VALUES ($1, $2, 'staff', $3, $4, $5::jsonb)`,
    [
      input.agentId,
      input.agentVersionId ?? null,
      input.actorId,
      input.action,
      JSON.stringify(input.payload),
    ],
  );
}

export async function listAgentDefinitions(identity: StaffIdentity, db: Pool = getDb()) {
  assertAdmin(identity);
  const result = await db.query(
    `SELECT
       agent.id::text AS id,
       agent.agent_key AS "agentKey",
       agent.name,
       agent.description,
       agent.audience,
       agent.status,
       agent.active_version_id::text AS "activeVersionId",
       agent.created_at AS "createdAt",
       agent.updated_at AS "updatedAt",
       active_version.version AS "activeVersion",
       active_version.status AS "activeVersionStatus",
       COUNT(version_row.id)::int AS "versionCount"
     FROM ai_agent_definitions agent
     LEFT JOIN ai_agent_versions active_version ON active_version.id = agent.active_version_id
     LEFT JOIN ai_agent_versions version_row ON version_row.agent_id = agent.id
     GROUP BY agent.id, active_version.id
     ORDER BY agent.created_at ASC, agent.agent_key ASC`,
  );
  return { agents: result.rows };
}

export async function getAgentBuilderCatalog(identity: StaffIdentity, db: Pool = getDb()) {
  assertAdmin(identity);
  const [models, personas, policies, tools, sources, documents] = await Promise.all([
    db.query(
      `SELECT id::text, profile_key AS "profileKey", provider, model_name AS "modelName", config, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_model_profiles
       ORDER BY profile_key ASC`,
    ),
    db.query(
      `SELECT id::text, persona_key AS "personaKey", name, description, content, output_style AS "outputStyle",
              locale, version, status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_personas
       ORDER BY persona_key ASC`,
    ),
    db.query(
      `SELECT id::text, policy_key AS "policyKey", name, description, rule_config AS "ruleConfig",
              quota_config AS "quotaConfig", version, status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_policy_profiles
       ORDER BY policy_key ASC`,
    ),
    db.query(
      `SELECT id::text, tool_key AS "toolKey", name, description, category, audience, input_schema AS "inputSchema",
              output_schema AS "outputSchema", side_effect_level AS "sideEffectLevel",
              implementation_status AS "implementationStatus", status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_tool_definitions
       ORDER BY category ASC, tool_key ASC`,
    ),
    db.query(
      `SELECT id::text, source_key AS "sourceKey", name, description, source_type AS "sourceType",
              access_mode AS "accessMode", classification, config, status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_knowledge_sources
       ORDER BY source_key ASC`,
    ),
    db.query(
      `SELECT document.id::text, source.source_key AS "sourceKey", document.document_key AS "documentKey",
              document.title, document.content_markdown AS "contentMarkdown", document.locale, document.revision,
              document.status, document.created_at AS "createdAt", document.updated_at AS "updatedAt"
       FROM ai_knowledge_documents document
       JOIN ai_knowledge_sources source ON source.id = document.source_id
       ORDER BY source.source_key ASC, document.document_key ASC`,
    ),
  ]);

  return {
    modelProfiles: models.rows,
    personas: personas.rows,
    policyProfiles: policies.rows,
    tools: tools.rows,
    knowledgeSources: sources.rows,
    knowledgeDocuments: documents.rows,
  };
}

export async function getAgentDefinition(
  identity: StaffIdentity,
  agentKeyInput: string,
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const agentKey = normalizeAgentKey(agentKeyInput);
  const agentResult = await db.query(
    `SELECT id::text, agent_key AS "agentKey", name, description, audience, status,
            active_version_id::text AS "activeVersionId", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM ai_agent_definitions
     WHERE agent_key = $1`,
    [agentKey],
  );
  const agent = agentResult.rows[0];
  if (!agent) {
    throw new OrderEngineError("AGENT_NOT_FOUND", 404, "Agent was not found.");
  }

  const versionsResult = await db.query(
    `SELECT
       version.id::text,
       version.version,
       version.status,
       version.system_instructions AS "systemInstructions",
       version.greeting,
       version.output_contract AS "outputContract",
       version.max_tool_calls AS "maxToolCalls",
       version.max_context_items AS "maxContextItems",
       version.created_by_actor_id AS "createdByActorId",
       version.released_by_actor_id AS "releasedByActorId",
       version.created_at AS "createdAt",
       version.activated_at AS "activatedAt",
       model.profile_key AS "modelProfileKey",
       model.provider AS "modelProvider",
       model.model_name AS "modelName",
       model.status AS "modelStatus",
       persona.persona_key AS "personaKey",
       persona.name AS "personaName",
       persona.status AS "personaStatus",
       policy.policy_key AS "policyProfileKey",
       policy.name AS "policyName",
       policy.status AS "policyStatus"
     FROM ai_agent_versions version
     JOIN ai_model_profiles model ON model.id = version.model_profile_id
     JOIN ai_personas persona ON persona.id = version.persona_id
     JOIN ai_policy_profiles policy ON policy.id = version.policy_profile_id
     WHERE version.agent_id = $1
     ORDER BY version.version DESC`,
    [agent.id],
  );

  const versionIds = versionsResult.rows.map((version) => version.id);
  const [toolsResult, knowledgeResult, changesResult] = await Promise.all([
    versionIds.length
      ? db.query(
          `SELECT link.agent_version_id::text AS "agentVersionId", tool.tool_key AS "toolKey", tool.name,
                  tool.category, tool.side_effect_level AS "sideEffectLevel",
                  tool.implementation_status AS "implementationStatus", tool.status,
                  link.position, link.override_config AS "overrideConfig"
           FROM ai_agent_version_tools link
           JOIN ai_tool_definitions tool ON tool.id = link.tool_id
           WHERE link.agent_version_id = ANY($1::uuid[])
           ORDER BY link.agent_version_id ASC, link.position ASC, tool.tool_key ASC`,
          [versionIds],
        )
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    versionIds.length
      ? db.query(
          `SELECT link.agent_version_id::text AS "agentVersionId", source.source_key AS "sourceKey", source.name,
                  source.source_type AS "sourceType", source.access_mode AS "accessMode", source.status,
                  link.position, link.retrieval_config AS "retrievalConfig"
           FROM ai_agent_version_knowledge_sources link
           JOIN ai_knowledge_sources source ON source.id = link.source_id
           WHERE link.agent_version_id = ANY($1::uuid[])
           ORDER BY link.agent_version_id ASC, link.position ASC, source.source_key ASC`,
          [versionIds],
        )
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    db.query(
      `SELECT id::text, agent_version_id::text AS "agentVersionId", actor_type AS "actorType", actor_id AS "actorId",
              action, payload, created_at AS "createdAt"
       FROM ai_agent_change_logs
       WHERE agent_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [agent.id],
    ),
  ]);

  return {
    agent,
    versions: versionsResult.rows.map((version) => ({
      ...version,
      tools: toolsResult.rows.filter((tool) => tool.agentVersionId === version.id),
      knowledgeSources: knowledgeResult.rows.filter((source) => source.agentVersionId === version.id),
    })),
    changes: changesResult.rows,
  };
}

export async function createAgentDefinition(
  identity: StaffIdentity,
  input: unknown,
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const payload: CreateAgentInput = parseCreateAgentInput(input);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const existing = await client.query(`SELECT 1 FROM ai_agent_definitions WHERE agent_key = $1`, [
      payload.agentKey,
    ]);
    if (existing.rowCount) {
      throw new OrderEngineError("AGENT_KEY_ALREADY_EXISTS", 409, "agentKey is already in use.");
    }
    const result = await client.query<{ id: string }>(
      `INSERT INTO ai_agent_definitions (agent_key, name, description, audience, status, created_by_actor_id)
       VALUES ($1, $2, $3, $4, 'draft', $5)
       RETURNING id::text`,
      [payload.agentKey, payload.name, payload.description, payload.audience, identity.clerkUserId],
    );
    const agentId = result.rows[0]!.id;
    await insertChangeLog(client, {
      agentId,
      actorId: identity.clerkUserId,
      action: "agent.created",
      payload: { agentKey: payload.agentKey, audience: payload.audience },
    });
    await client.query("COMMIT");
    return getAgentDefinition(identity, payload.agentKey, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createAgentVersion(
  identity: StaffIdentity,
  agentKeyInput: string,
  input: unknown,
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const agentKey = normalizeAgentKey(agentKeyInput);
  const payload: CreateAgentVersionInput = parseCreateAgentVersionInput(input);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const agent = await getAgentRowForUpdate(client, agentKey);

    const [model, persona, policy, tools, sources, versionResult] = await Promise.all([
      getResourceByKey(client, "ai_model_profiles", "profile_key", payload.modelProfileKey),
      getResourceByKey(client, "ai_personas", "persona_key", payload.personaKey),
      getResourceByKey(client, "ai_policy_profiles", "policy_key", payload.policyProfileKey),
      getSelectedTools(client, payload.toolKeys),
      getSelectedKnowledgeSources(client, payload.knowledgeSourceKeys),
      client.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version
         FROM ai_agent_versions
         WHERE agent_id = $1`,
        [agent.id],
      ),
    ]);

    const version = versionResult.rows[0]!.next_version;
    const insertedVersion = await client.query<{ id: string }>(
      `INSERT INTO ai_agent_versions (
         agent_id,
         version,
         status,
         model_profile_id,
         persona_id,
         policy_profile_id,
         system_instructions,
         greeting,
         output_contract,
         max_tool_calls,
         max_context_items,
         created_by_actor_id
       ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
       RETURNING id::text`,
      [
        agent.id,
        version,
        model.id,
        persona.id,
        policy.id,
        payload.systemInstructions,
        payload.greeting,
        JSON.stringify(payload.outputContract),
        payload.maxToolCalls,
        payload.maxContextItems,
        identity.clerkUserId,
      ],
    );
    const agentVersionId = insertedVersion.rows[0]!.id;

    for (const [position, toolKey] of payload.toolKeys.entries()) {
      const tool = tools.find((item) => item.resource_key === toolKey)!;
      await client.query(
        `INSERT INTO ai_agent_version_tools (agent_version_id, tool_id, position)
         VALUES ($1, $2, $3)`,
        [agentVersionId, tool.id, position],
      );
    }
    for (const [position, sourceKey] of payload.knowledgeSourceKeys.entries()) {
      const source = sources.find((item) => item.resource_key === sourceKey)!;
      await client.query(
        `INSERT INTO ai_agent_version_knowledge_sources (agent_version_id, source_id, position)
         VALUES ($1, $2, $3)`,
        [agentVersionId, source.id, position],
      );
    }

    await client.query(`UPDATE ai_agent_definitions SET updated_at = now() WHERE id = $1`, [agent.id]);
    await insertChangeLog(client, {
      agentId: agent.id,
      agentVersionId,
      actorId: identity.clerkUserId,
      action: "agent.version.created",
      payload: {
        version,
        modelProfileKey: payload.modelProfileKey,
        personaKey: payload.personaKey,
        policyProfileKey: payload.policyProfileKey,
        toolKeys: payload.toolKeys,
        knowledgeSourceKeys: payload.knowledgeSourceKeys,
      },
    });
    await client.query("COMMIT");
    return getAgentDefinition(identity, agentKey, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function getRuntimeBlockers(client: PoolClient, agentVersionId: string): Promise<RuntimeBlocker[]> {
  const [baseResult, toolsResult, sourcesResult] = await Promise.all([
    client.query<{
      model_key: string;
      model_status: string;
      persona_key: string;
      persona_status: string;
      policy_key: string;
      policy_status: string;
    }>(
      `SELECT
         model.profile_key AS model_key,
         model.status AS model_status,
         persona.persona_key AS persona_key,
         persona.status AS persona_status,
         policy.policy_key AS policy_key,
         policy.status AS policy_status
       FROM ai_agent_versions version
       JOIN ai_model_profiles model ON model.id = version.model_profile_id
       JOIN ai_personas persona ON persona.id = version.persona_id
       JOIN ai_policy_profiles policy ON policy.id = version.policy_profile_id
       WHERE version.id = $1`,
      [agentVersionId],
    ),
    client.query<{ tool_key: string; status: string; implementation_status: string }>(
      `SELECT tool.tool_key, tool.status, tool.implementation_status
       FROM ai_agent_version_tools link
       JOIN ai_tool_definitions tool ON tool.id = link.tool_id
       WHERE link.agent_version_id = $1`,
      [agentVersionId],
    ),
    client.query<{ source_key: string; status: string }>(
      `SELECT source.source_key, source.status
       FROM ai_agent_version_knowledge_sources link
       JOIN ai_knowledge_sources source ON source.id = link.source_id
       WHERE link.agent_version_id = $1`,
      [agentVersionId],
    ),
  ]);

  const base = baseResult.rows[0];
  if (!base) {
    throw new OrderEngineError("AGENT_VERSION_NOT_FOUND", 404, "Agent version was not found.");
  }
  const blockers: RuntimeBlocker[] = [];
  if (base.model_status !== "active") {
    blockers.push({
      code: "MODEL_PROFILE_NOT_ACTIVE",
      resourceKey: base.model_key,
      message: "The selected model profile is not active.",
    });
  }
  if (base.persona_status !== "active") {
    blockers.push({
      code: "PERSONA_NOT_ACTIVE",
      resourceKey: base.persona_key,
      message: "The selected persona is not active.",
    });
  }
  if (base.policy_status !== "active") {
    blockers.push({
      code: "POLICY_NOT_ACTIVE",
      resourceKey: base.policy_key,
      message: "The selected policy profile is not active.",
    });
  }
  for (const tool of toolsResult.rows) {
    if (tool.status !== "active") {
      blockers.push({
        code: "TOOL_NOT_ACTIVE",
        resourceKey: tool.tool_key,
        message: "A selected tool is not active.",
      });
    }
    if (tool.implementation_status !== "ready") {
      blockers.push({
        code: "TOOL_IMPLEMENTATION_NOT_READY",
        resourceKey: tool.tool_key,
        message: "A selected tool does not have a ready backend implementation.",
      });
    }
  }
  for (const source of sourcesResult.rows) {
    if (source.status !== "active") {
      blockers.push({
        code: "KNOWLEDGE_SOURCE_NOT_ACTIVE",
        resourceKey: source.source_key,
        message: "A selected knowledge source is not active.",
      });
    }
  }
  return blockers;
}

export async function activateAgentVersion(
  identity: StaffIdentity,
  agentKeyInput: string,
  versionInput: unknown,
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const agentKey = normalizeAgentKey(agentKeyInput);
  const version = normalizeVersionNumber(versionInput);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const agent = await getAgentRowForUpdate(client, agentKey);
    const versionResult = await client.query<{ id: string; status: string }>(
      `SELECT id::text, status
       FROM ai_agent_versions
       WHERE agent_id = $1 AND version = $2
       FOR UPDATE`,
      [agent.id, version],
    );
    const agentVersion = versionResult.rows[0];
    if (!agentVersion) {
      throw new OrderEngineError("AGENT_VERSION_NOT_FOUND", 404, "Agent version was not found.");
    }
    if (agentVersion.status === "archived") {
      throw new OrderEngineError("AGENT_VERSION_ARCHIVED", 409, "Archived versions cannot be activated.");
    }

    const blockers = await getRuntimeBlockers(client, agentVersion.id);
    if (blockers.length > 0) {
      throw new OrderEngineError(
        "AGENT_VERSION_NOT_RUNTIME_READY",
        409,
        "The agent version cannot be activated until every runtime blocker is resolved.",
        { blockers },
      );
    }

    await client.query(
      `UPDATE ai_agent_versions
       SET status = 'superseded'
       WHERE agent_id = $1 AND status = 'active' AND id <> $2`,
      [agent.id, agentVersion.id],
    );
    await client.query(
      `UPDATE ai_agent_versions
       SET status = 'active', released_by_actor_id = $2, activated_at = now()
       WHERE id = $1`,
      [agentVersion.id, identity.clerkUserId],
    );
    await client.query(
      `UPDATE ai_agent_definitions
       SET active_version_id = $2, status = 'active', updated_at = now()
       WHERE id = $1`,
      [agent.id, agentVersion.id],
    );
    await insertChangeLog(client, {
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      actorId: identity.clerkUserId,
      action: "agent.version.activated",
      payload: { version },
    });
    await client.query("COMMIT");
    return getAgentDefinition(identity, agentKey, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getAgentVersionRuntimeReadiness(
  identity: StaffIdentity,
  agentKeyInput: string,
  versionInput: unknown,
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const agentKey = normalizeAgentKey(agentKeyInput);
  const version = normalizeVersionNumber(versionInput);
  const client = await db.connect();
  try {
    const agent = await getAgentRowForUpdate(client, agentKey);
    const result = await client.query<{ id: string }>(
      `SELECT id::text FROM ai_agent_versions WHERE agent_id = $1 AND version = $2`,
      [agent.id, version],
    );
    const agentVersion = result.rows[0];
    if (!agentVersion) {
      throw new OrderEngineError("AGENT_VERSION_NOT_FOUND", 404, "Agent version was not found.");
    }
    const blockers = await getRuntimeBlockers(client, agentVersion.id);
    return { agentKey, version, ready: blockers.length === 0, blockers };
  } finally {
    client.release();
  }
}
