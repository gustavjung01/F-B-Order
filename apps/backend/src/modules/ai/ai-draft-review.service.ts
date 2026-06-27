import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";
import type { AiJsonValue } from "./ai-schema";
import { AiProjectStoreError } from "./ai-project-store.service";

export type AiDraftReviewInput = {
  action?: unknown;
  note?: unknown;
};

type AiDraftStatusFilter = "draft" | "approved" | "rejected" | "all";

type AiDocumentRow = {
  id: string;
  source: string;
  status: string;
  project_version_id: string | null;
  agent_id: string | null;
  model_id: string | null;
  schema_version: string;
  json_payload: AiJsonValue;
  validation_status: string;
  validation_errors: unknown;
  version: number;
  created_by_staff_id: string;
  updated_by_staff_id: string;
  reviewed_by_staff_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  apply_status: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  project_key: string | null;
  project_name: string | null;
  agent_key: string | null;
  agent_name: string | null;
  agent_use_case: string | null;
  model_key: string | null;
  model_display_name: string | null;
};

function requireAdmin(identity: RequestIdentity): StaffIdentity {
  if (identity.kind === "anonymous") throw new AiProjectStoreError("AUTH_REQUIRED", 401, "Authentication is required.");
  if (identity.kind !== "staff" || identity.role !== "admin") {
    throw new AiProjectStoreError("ADMIN_ACCESS_REQUIRED", 403, "Administrator access is required.");
  }
  if (!identity.isActive) throw new AiProjectStoreError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  return identity;
}

function readStatusFilter(value: unknown): AiDraftStatusFilter {
  if (value === undefined || value === null || value === "") return "draft";
  if (value === "draft" || value === "approved" || value === "rejected" || value === "all") return value;
  throw new AiProjectStoreError("INVALID_STATUS_FILTER", 400, "status must be draft, approved, rejected, or all.");
}

function readReviewAction(value: unknown): "approve" | "reject" {
  if (value === "approve" || value === "reject") return value;
  throw new AiProjectStoreError("INVALID_REVIEW_ACTION", 400, "Review action must be approve or reject.");
}

function readReviewNote(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new AiProjectStoreError("INVALID_REVIEW_NOTE", 400, "Review note must be text.");
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 2000) throw new AiProjectStoreError("REVIEW_NOTE_TOO_LONG", 400, "Review note is too long.");
  return normalized;
}

function documentProjection() {
  return `d.id,d.source,d.status,d.project_version_id,d.agent_id,d.model_id,d.schema_version,d.json_payload,
          d.validation_status,d.validation_errors,d.version,d.created_by_staff_id,d.updated_by_staff_id,
          d.reviewed_by_staff_id,d.reviewed_at,d.review_note,d.apply_status,d.applied_at,d.created_at,d.updated_at,
          p.project_key,p.name AS project_name,
          a.agent_key,a.name AS agent_name,a.use_case AS agent_use_case,
          m.model_key,m.display_name AS model_display_name`;
}

function mapDocument(row: AiDocumentRow) {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    projectVersionId: row.project_version_id,
    agentId: row.agent_id,
    modelId: row.model_id,
    schemaVersion: row.schema_version,
    jsonPayload: row.json_payload,
    validationStatus: row.validation_status,
    validationErrors: row.validation_errors,
    version: Number(row.version),
    createdByStaffId: row.created_by_staff_id,
    updatedByStaffId: row.updated_by_staff_id,
    reviewedByStaffId: row.reviewed_by_staff_id,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    applyStatus: row.apply_status,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    project: row.project_key ? { key: row.project_key, name: row.project_name } : null,
    agent: row.agent_key ? { key: row.agent_key, name: row.agent_name, useCase: row.agent_use_case } : null,
    model: row.model_key ? { key: row.model_key, displayName: row.model_display_name } : null,
  };
}

export class AiDraftReviewService {
  constructor(private readonly db: Pool = getDb()) {}

  async listAiDrafts(identity: RequestIdentity, statusInput?: unknown) {
    requireAdmin(identity);
    const status = readStatusFilter(statusInput);
    const params: unknown[] = [];
    let statusClause = "";
    if (status !== "all") {
      params.push(status);
      statusClause = `AND d.status=$${params.length}`;
    }
    const result = await this.db.query<AiDocumentRow>(
      `SELECT ${documentProjection()}
       FROM ai_documents d
       LEFT JOIN ai_project_versions v ON v.id=d.project_version_id
       LEFT JOIN ai_projects p ON p.id=v.project_id
       LEFT JOIN ai_project_agents a ON a.id=d.agent_id
       LEFT JOIN ai_project_models m ON m.id=d.model_id
       WHERE d.source='ai' ${statusClause}
       ORDER BY d.updated_at DESC, d.created_at DESC
       LIMIT 100`,
      params,
    );
    return { documents: result.rows.map(mapDocument) };
  }

  async getAiDraft(identity: RequestIdentity, documentId: string) {
    requireAdmin(identity);
    const result = await this.db.query<AiDocumentRow>(
      `SELECT ${documentProjection()}
       FROM ai_documents d
       LEFT JOIN ai_project_versions v ON v.id=d.project_version_id
       LEFT JOIN ai_projects p ON p.id=v.project_id
       LEFT JOIN ai_project_agents a ON a.id=d.agent_id
       LEFT JOIN ai_project_models m ON m.id=d.model_id
       WHERE d.id=$1 AND d.source='ai'`,
      [documentId],
    );
    if (result.rowCount === 0) throw new AiProjectStoreError("AI_DRAFT_NOT_FOUND", 404, "AI draft was not found.");
    const logs = await this.db.query(
      `SELECT l.id,l.document_id,l.from_status,l.to_status,l.actor_staff_id,l.note,l.created_at,
              s.name AS actor_name
       FROM ai_document_review_logs l
       LEFT JOIN staff_users s ON s.id=l.actor_staff_id
       WHERE l.document_id=$1
       ORDER BY l.created_at DESC`,
      [documentId],
    );
    return {
      document: mapDocument(result.rows[0]),
      reviewLogs: logs.rows.map((row) => ({
        id: row.id as string,
        documentId: row.document_id as string,
        fromStatus: row.from_status as string,
        toStatus: row.to_status as string,
        actorStaffId: row.actor_staff_id as string,
        actorName: row.actor_name as string | null,
        note: row.note as string | null,
        createdAt: row.created_at as string,
      })),
    };
  }

  async reviewAiDraft(identity: RequestIdentity, documentId: string, input: AiDraftReviewInput) {
    const admin = requireAdmin(identity);
    const action = readReviewAction(input.action);
    const note = readReviewNote(input.note);
    const nextStatus = action === "approve" ? "approved" : "rejected";
    const nextApplyStatus = action === "approve" ? "pending_apply" : "not_applicable";
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query<AiDocumentRow>(
        `SELECT ${documentProjection()}
         FROM ai_documents d
         LEFT JOIN ai_project_versions v ON v.id=d.project_version_id
         LEFT JOIN ai_projects p ON p.id=v.project_id
         LEFT JOIN ai_project_agents a ON a.id=d.agent_id
         LEFT JOIN ai_project_models m ON m.id=d.model_id
         WHERE d.id=$1 AND d.source='ai'
         FOR UPDATE OF d`,
        [documentId],
      );
      if (currentResult.rowCount === 0) throw new AiProjectStoreError("AI_DRAFT_NOT_FOUND", 404, "AI draft was not found.");
      const current = currentResult.rows[0];
      if (current.status !== "draft") {
        throw new AiProjectStoreError("AI_DRAFT_ALREADY_REVIEWED", 409, "Only draft AI documents can be reviewed.");
      }
      if (current.validation_status !== "valid") {
        throw new AiProjectStoreError("AI_DRAFT_INVALID", 409, "Only valid AI draft documents can be reviewed.");
      }
      const updated = await client.query<AiDocumentRow>(
        `UPDATE ai_documents
         SET status=$2,
             apply_status=$3,
             reviewed_by_staff_id=$4,
             reviewed_at=now(),
             review_note=$5,
             updated_by_staff_id=$4,
             updated_at=now(),
             version=version+1
         WHERE id=$1
         RETURNING id,source,status,project_version_id,agent_id,model_id,schema_version,json_payload,
                   validation_status,validation_errors,version,created_by_staff_id,updated_by_staff_id,
                   reviewed_by_staff_id,reviewed_at,review_note,apply_status,applied_at,created_at,updated_at,
                   NULL::text AS project_key,NULL::text AS project_name,
                   NULL::text AS agent_key,NULL::text AS agent_name,NULL::text AS agent_use_case,
                   NULL::text AS model_key,NULL::text AS model_display_name`,
        [documentId, nextStatus, nextApplyStatus, admin.staffId, note],
      );
      const log = await client.query(
        `INSERT INTO ai_document_review_logs (document_id,from_status,to_status,actor_staff_id,note)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id,document_id,from_status,to_status,actor_staff_id,note,created_at`,
        [documentId, current.status, nextStatus, admin.staffId, note],
      );
      await client.query("COMMIT");
      return {
        document: mapDocument({ ...current, ...updated.rows[0] }),
        reviewLog: {
          id: log.rows[0].id as string,
          documentId: log.rows[0].document_id as string,
          fromStatus: log.rows[0].from_status as string,
          toStatus: log.rows[0].to_status as string,
          actorStaffId: log.rows[0].actor_staff_id as string,
          note: log.rows[0].note as string | null,
          createdAt: log.rows[0].created_at as string,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
