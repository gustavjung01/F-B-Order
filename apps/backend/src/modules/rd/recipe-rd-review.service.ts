import type { Pool } from "pg";
import { getDb } from "../../db/pool.js";
import { writeAdminAuditLog } from "../admin/admin-audit.js";
import { getAiDraft, type AiRequestMeta } from "../ai/ai-draft.service.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { OrderEngineError } from "../orders/order-errors.js";
import { readRecipeRdDraftContent } from "./recipe-rd-content.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeDraftId(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("INVALID_AI_DRAFT_ID", 400, "draftId must be a UUID.");
  }
  return normalized;
}

export async function reviewRecipeRdDraft(
  identity: StaffIdentity,
  draftIdValue: string,
  decision: "approved" | "rejected",
  note: string,
  meta: AiRequestMeta,
  db: Pool = getDb(),
) {
  const draftId = normalizeDraftId(draftIdValue);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const draftResult = await client.query<{
      id: string;
      createdByStaffId: string;
      draftType: string;
      status: string;
      content: unknown;
      targetRecipeId: string | null;
    }>(
      `SELECT
         id::text,
         created_by_staff_id::text AS "createdByStaffId",
         draft_type AS "draftType",
         status,
         content,
         target_recipe_id::text AS "targetRecipeId"
       FROM ai_drafts
       WHERE id=$1
       FOR UPDATE`,
      [draftId],
    );
    const draft = draftResult.rows[0];
    if (!draft) throw new OrderEngineError("AI_DRAFT_NOT_FOUND", 404, "AI draft was not found.");
    if (draft.draftType !== "recipe") {
      throw new OrderEngineError("RECIPE_RD_DRAFT_TYPE_INVALID", 400, "This draft is not a Recipe proposal.");
    }
    if (draft.status !== "draft") {
      throw new OrderEngineError("AI_DRAFT_NOT_REVIEWABLE", 409, "AI draft is no longer awaiting review.");
    }
    if (draft.createdByStaffId === identity.staffId) {
      throw new OrderEngineError("SELF_APPROVAL_FORBIDDEN", 409, "AI draft creator cannot review their own draft.");
    }

    const content = readRecipeRdDraftContent(draft.content);
    const requestResult = await client.query<{
      id: string;
      status: string;
      createdByStaffId: string;
    }>(
      `SELECT
         id::text,
         status,
         created_by_staff_id::text AS "createdByStaffId"
       FROM recipe_rd_requests
       WHERE id=$1 AND ai_draft_id=$2
       FOR UPDATE`,
      [content.rdRequestId, draftId],
    );
    const request = requestResult.rows[0];
    if (!request) {
      throw new OrderEngineError(
        "RECIPE_RD_REQUEST_DRAFT_MISMATCH",
        409,
        "Recipe R&D request is not linked to this draft.",
      );
    }
    if (request.createdByStaffId !== draft.createdByStaffId) {
      throw new OrderEngineError(
        "RECIPE_RD_REQUEST_CREATOR_MISMATCH",
        409,
        "Recipe R&D request creator does not match the draft creator.",
      );
    }
    if (request.status !== "generated") {
      throw new OrderEngineError(
        "RECIPE_RD_REQUEST_NOT_REVIEWABLE",
        409,
        "Recipe R&D request is no longer awaiting review.",
      );
    }

    await client.query(
      `UPDATE ai_drafts
       SET status=$2,
           reviewed_by_staff_id=$3,
           reviewed_at=now(),
           review_note=$4,
           updated_at=now()
       WHERE id=$1`,
      [draftId, decision, identity.staffId, note],
    );
    const requestUpdate = await client.query(
      `UPDATE recipe_rd_requests
       SET status=$2,
           reviewed_by_staff_id=$3,
           reviewed_at=now(),
           updated_at=now()
       WHERE id=$1 AND ai_draft_id=$4 AND status='generated'`,
      [content.rdRequestId, decision, identity.staffId, draftId],
    );
    if (requestUpdate.rowCount !== 1) {
      throw new OrderEngineError(
        "RECIPE_RD_REQUEST_REVIEW_CONFLICT",
        409,
        "Recipe R&D request changed while it was being reviewed.",
      );
    }

    await client.query(
      `INSERT INTO ai_draft_events(draft_id,event_type,actor_staff_id,note,metadata)
       VALUES($1,$2,$3,$4,$5::jsonb)`,
      [
        draftId,
        decision,
        identity.staffId,
        note,
        JSON.stringify({
          kind: "recipe_rd",
          rdRequestId: content.rdRequestId,
          targetRecipeId: draft.targetRecipeId,
        }),
      ],
    );
    await writeAdminAuditLog({
      actorStaffId: identity.staffId,
      actionKey: `recipe.rd.${decision === "approved" ? "approve" : "reject"}`,
      resourceType: "recipe_rd_request",
      resourceId: content.rdRequestId,
      outcome: "success",
      permissionKey: "recipe.rd.review",
      reason: note,
      beforeData: { requestStatus: request.status, draftStatus: draft.status },
      afterData: { requestStatus: decision, draftStatus: decision },
      metadata: { draftId, targetRecipeId: draft.targetRecipeId },
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }, client);

    await client.query("COMMIT");
    return getAiDraft(draftId, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
