import type { Pool } from "pg";
import { getDb } from "../../db/pool.js";
import { requireAdmin } from "../admin/admin-access.js";
import { writeAdminAuditLog } from "../admin/admin-audit.js";
import type { AiRequestMeta } from "../ai/ai-draft.service.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { OrderEngineError } from "../orders/order-errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RecipeRdTrialInput = {
  resultStatus: "planned" | "passed" | "needs_changes" | "failed";
  batchQuantity?: number | null;
  batchUnit?: string | null;
  sensoryScore?: number | null;
  operationalScore?: number | null;
  measurements?: Record<string, unknown>;
  note?: string | null;
};

function normalizeUuid(value: string, field: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("RECIPE_RD_INVALID_ID", 400, `${field} must be a UUID.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  if (normalized.length > max) {
    throw new OrderEngineError("RECIPE_RD_FIELD_TOO_LONG", 400, `${field} is too long.`);
  }
  return normalized;
}

export async function recordAuditedRecipeRdTrialResult(
  identity: StaffIdentity,
  requestIdValue: string,
  input: RecipeRdTrialInput,
  meta: AiRequestMeta,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const requestId = normalizeUuid(requestIdValue, "requestId");
  const batchQuantity = input.batchQuantity ?? null;
  const batchUnit = optionalText(input.batchUnit, "batchUnit", 80);
  const note = optionalText(input.note, "note", 4000);
  if ((batchQuantity === null) !== (batchUnit === null)) {
    throw new OrderEngineError(
      "RECIPE_RD_TRIAL_BATCH_INVALID",
      400,
      "batchQuantity and batchUnit must be supplied together.",
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const requestResult = await client.query<{
      status: string;
      recipeId: string;
      aiDraftId: string | null;
    }>(
      `SELECT
         status,
         recipe_id::text AS "recipeId",
         ai_draft_id::text AS "aiDraftId"
       FROM recipe_rd_requests
       WHERE id=$1
       FOR UPDATE`,
      [requestId],
    );
    const request = requestResult.rows[0];
    if (!request) {
      throw new OrderEngineError("RECIPE_RD_REQUEST_NOT_FOUND", 404, "Recipe R&D request was not found.");
    }
    if (!["generated", "approved", "applied"].includes(request.status)) {
      throw new OrderEngineError(
        "RECIPE_RD_TRIAL_NOT_ALLOWED",
        409,
        "Trial results can only be recorded after a proposal is generated.",
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO recipe_rd_trial_results(
         rd_request_id,
         recorded_by_staff_id,
         result_status,
         batch_quantity,
         batch_unit,
         sensory_score,
         operational_score,
         measurements,
         note
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING id::text`,
      [
        requestId,
        identity.staffId,
        input.resultStatus,
        batchQuantity,
        batchUnit,
        input.sensoryScore ?? null,
        input.operationalScore ?? null,
        JSON.stringify(input.measurements ?? {}),
        note,
      ],
    );
    const trialResultId = inserted.rows[0].id;

    await writeAdminAuditLog({
      actorStaffId: identity.staffId,
      actionKey: "recipe.rd.trial.record",
      resourceType: "recipe_rd_request",
      resourceId: requestId,
      outcome: "success",
      permissionKey: "recipe.rd.create",
      reason: note,
      beforeData: { requestStatus: request.status },
      afterData: {
        trialResultId,
        resultStatus: input.resultStatus,
        sensoryScore: input.sensoryScore ?? null,
        operationalScore: input.operationalScore ?? null,
      },
      metadata: {
        recipeId: request.recipeId,
        aiDraftId: request.aiDraftId,
        batchQuantity,
        batchUnit,
      },
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }, client);

    await client.query("COMMIT");
    return { trialResultId, status: input.resultStatus };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
